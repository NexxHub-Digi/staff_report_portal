"""STJ reporting starter. Run behind HTTPS for real use. Standard library only."""
import os,json,sqlite3,hashlib,hmac,secrets,time,base64,re,urllib.request,urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from datetime import datetime,timezone,date
from urllib.parse import urlsplit
BASE=Path(__file__).resolve().parent
DB=os.environ.get('STJ_DB',str(BASE/'stj.sqlite3'))
SECRET=os.environ.get('STJ_SESSION_SECRET','')
ACCOUNTS=json.loads(os.environ.get('STJ_ACCOUNTS_JSON','{}'))
TYPES={'daily':'Daily operations report','requisition':'Requisition request','incident':'Incident and maintenance report'}
REQUIRED={'daily':['date','shift','activities','power'],'requisition':['date','department','priority','reason'],'incident':['date','category','severity','location','time','description','action']}
OPTIONAL={'daily':['fuel','rooms','outstanding','notes'],'requisition':['needed','notes'],'incident':['followup']}

def connect():
    c=sqlite3.connect(DB,timeout=15);c.row_factory=sqlite3.Row;return c

def init():
    with connect() as c:c.execute('''CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,type TEXT NOT NULL,username TEXT NOT NULL,staff TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL,notification TEXT NOT NULL,created_at TEXT NOT NULL,decided_by TEXT,decided_at TEXT,wa_id TEXT)''')

def password_hash(password,salt=None):
    salt=salt or secrets.token_hex(16)
    return salt+'$'+hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),600000).hex()

def check_password(p,stored):
    try:return hmac.compare_digest(password_hash(p,stored.split('$')[0]),stored)
    except (ValueError,AttributeError):return False

def token(username):
    raw=base64.urlsafe_b64encode(json.dumps({'u':username,'exp':int(time.time())+28800}).encode()).decode().rstrip('=')
    return raw+'.'+hmac.new(SECRET.encode(),raw.encode(),hashlib.sha256).hexdigest()

def verify(t):
    try:
        raw,sig=t.split('.');expected=hmac.new(SECRET.encode(),raw.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig,expected):return None
        d=json.loads(base64.urlsafe_b64decode(raw+'='*(-len(raw)%4)))
        if d['exp']<=time.time() or d['u'] not in ACCOUNTS:return None
        return d['u']
    except Exception:return None

def validate(t,d):
    if t not in TYPES or not isinstance(d,dict):raise ValueError('Invalid report type or data.')
    clean={}
    for k in REQUIRED[t]+OPTIONAL[t]:
        v=d.get(k,'')
        if not isinstance(v,str) or len(v)>2000:raise ValueError('Invalid field: '+k)
        v=v.strip()
        if k in REQUIRED[t] and not v:raise ValueError('Required field: '+k)
        if v:clean[k]=v
    date.fromisoformat(clean['date'])
    if t=='incident' and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',clean['time']):raise ValueError('Invalid incident time.')
    if t=='requisition':
        items=d.get('items')
        if not isinstance(items,list) or not 1<=len(items)<=50:raise ValueError('Add 1–50 items.')
        clean['items']=[]
        for i in items:
            if not isinstance(i,dict):raise ValueError('Invalid item.')
            item=i.get('item');qty=i.get('qty');cost=i.get('cost')
            if not isinstance(item,str) or not isinstance(qty,str) or not 1<=len(item.strip())<=150 or not 1<=len(qty.strip())<=60 or type(cost) not in (int,float) or not 0<=cost<=1e9:raise ValueError('Invalid item, quantity or cost.')
            clean['items'].append({'item':item.strip(),'qty':qty.strip(),'cost':round(cost,2)})
        if clean.get('needed'):date.fromisoformat(clean['needed'])
    return clean

def whatsapp(r):
    keys=['WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID','WA_RECIPIENT','WA_TEMPLATE','WA_GRAPH_VERSION','STJ_PUBLIC_URL']
    if not all(os.environ.get(k) for k in keys):return 'Not configured',None
    d=r['data'];summary={'daily':d.get('activities'),'incident':d.get('description'),'requisition':d.get('reason')}[r['type']]
    if r['type']=='requisition':summary+=' | Estimated total: NGN '+format(sum(i['cost'] for i in d['items']),',.2f')
    params=[TYPES[r['type']],r['id'],r['staff'],re.sub(r'\s+',' ',summary)[:500],os.environ['STJ_PUBLIC_URL'].rstrip('/')+'/']
    payload={'messaging_product':'whatsapp','to':os.environ['WA_RECIPIENT'],'type':'template','template':{'name':os.environ['WA_TEMPLATE'],'language':{'code':os.environ.get('WA_LANGUAGE','en_US')},'components':[{'type':'body','parameters':[{'type':'text','text':p} for p in params]}]}}
    url='https://graph.facebook.com/'+os.environ['WA_GRAPH_VERSION']+'/'+os.environ['WA_PHONE_NUMBER_ID']+'/messages'
    try:
        req=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+os.environ['WA_ACCESS_TOKEN'],'Content-Type':'application/json'},method='POST')
        with urllib.request.urlopen(req,timeout=12) as response: result=json.load(response)
        return 'Accepted by WhatsApp API',result['messages'][0]['id']
    except Exception:return 'Send failed or unconfirmed',None

def view(row):
    d=dict(row);d['data']=json.loads(d['data']);d.pop('username',None);d.pop('wa_id',None);return d

class Handler(BaseHTTPRequestHandler):
    def send_json(self,status,obj,cookie=None):
        b=json.dumps(obj).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY')
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(b)
    def session(self):
        c=SimpleCookie()
        try:c.load(self.headers.get('Cookie',''));return verify(c['stj'].value) if 'stj' in c else None
        except Exception:return None
    def cookie(self,value,age):return f'stj={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}'+('' if os.environ.get('STJ_INSECURE_LOCAL')=='1' else '; Secure')
    def read_json(self):
        length=int(self.headers.get('Content-Length','0'))
        if length<1 or length>128000:raise ValueError('Invalid request size.')
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':raise ValueError('Expected JSON.')
        data=json.loads(self.rfile.read(length));
        if not isinstance(data,dict):raise ValueError('Expected object.')
        return data
    def user_info(self,u):return {'name':ACCOUNTS[u]['name'],'role':ACCOUNTS[u]['role']}
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/':
            b=(BASE/'index.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','no-store');self.send_header('X-Frame-Options','DENY');self.end_headers();self.wfile.write(b);return
        u=self.session()
        if not u:return self.send_json(401,{'error':'Sign in required.'})
        if path=='/api/me':return self.send_json(200,self.user_info(u))
        if path=='/api/records':
            with connect() as c:
                rows=c.execute('SELECT * FROM reports ORDER BY created_at DESC LIMIT 500' if ACCOUNTS[u]['role']=='manager' else 'SELECT * FROM reports WHERE username=? ORDER BY created_at DESC LIMIT 500',() if ACCOUNTS[u]['role']=='manager' else (u,)).fetchall()
            return self.send_json(200,{'records':[view(r) for r in rows]})
        return self.send_json(404,{'error':'Not found.'})
    def do_POST(self):
        path=urlsplit(self.path).path
        try:d=self.read_json()
        except (ValueError,TypeError):return self.send_json(400,{'error':'Invalid JSON request.'})
        if path=='/api/login':
            u=d.get('username');p=d.get('password');a=ACCOUNTS.get(u) if isinstance(u,str) else None
            if not a or not isinstance(p,str) or len(p)>1024 or not check_password(p,a['password_hash']):return self.send_json(401,{'error':'Invalid credentials.'})
            return self.send_json(200,self.user_info(u),self.cookie(token(u),28800))
        u=self.session()
        if not u:return self.send_json(401,{'error':'Sign in required.'})
        if path=='/api/logout':return self.send_json(200,{'ok':True},self.cookie('',0))
        if path=='/api/submit':
            t=d.get('type')
            try:clean=validate(t,d.get('data'))
            except (ValueError,TypeError):return self.send_json(400,{'error':'Invalid or incomplete report. Check the required fields and dates.'})
            rid=t[:3].upper()+'-'+secrets.token_hex(6).upper();staff=ACCOUNTS[u]['name'];now=datetime.now(timezone.utc).isoformat();status='Pending' if t=='requisition' else 'Submitted'
            with connect() as c:c.execute('INSERT INTO reports(id,type,username,staff,data,status,notification,created_at) VALUES(?,?,?,?,?,?,?,?)',(rid,t,u,staff,json.dumps(clean),status,'Pending notification',now))
            notification,wa_id=whatsapp({'id':rid,'type':t,'staff':staff,'data':clean})
            with connect() as c:c.execute('UPDATE reports SET notification=?,wa_id=? WHERE id=?',(notification,wa_id,rid))
            return self.send_json(201,{'id':rid,'notification':notification})
        if path=='/api/decision':
            if ACCOUNTS[u]['role']!='manager':return self.send_json(403,{'error':'Manager access required.'})
            status=d.get('status');rid=d.get('id')
            if status not in ('Approved','Declined') or not isinstance(rid,str):return self.send_json(400,{'error':'Invalid decision.'})
            with connect() as c:changed=c.execute("UPDATE reports SET status=?,decided_by=?,decided_at=? WHERE id=? AND type='requisition' AND status='Pending'",(status,u,datetime.now(timezone.utc).isoformat(),rid)).rowcount
            return self.send_json(200,{'ok':True}) if changed else self.send_json(409,{'error':'Request is not pending or was already decided.'})
        return self.send_json(404,{'error':'Not found.'})
if __name__=='__main__':
    import sys,getpass
    if len(sys.argv)>1 and sys.argv[1]=='hash-password':print(password_hash(getpass.getpass('Password: ')));sys.exit()
    if len(SECRET)<32 or not ACCOUNTS:sys.exit('Configure STJ_SESSION_SECRET (32+ characters) and STJ_ACCOUNTS_JSON before startup.')
    init();ThreadingHTTPServer((os.environ.get('STJ_HOST','127.0.0.1'),int(os.environ.get('PORT','8000'))),Handler).serve_forever()
