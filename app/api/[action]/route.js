import {neon} from '@neondatabase/serverless';
import {randomBytes,createHash,timingSafeEqual,pbkdf2} from 'node:crypto';
import {promisify} from 'node:util';
import {NextResponse} from 'next/server';
import {validate} from '../../../lib/validation.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const hash=x=>createHash('sha256').update(x).digest('hex');
const db=()=>{if(!process.env.DATABASE_URL)throw Error('Database not configured');const sql=neon(process.env.DATABASE_URL);return (q,p=[])=>sql.query(q,p)};
const reply=(d,s=200)=>NextResponse.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const err=(message,s)=>reply({error:message},s);
const cookie='stj_session',opts={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:28800};
async function passwordOK(p,stored){try{const [salt,expected]=stored.split('$');if(!/^[a-f0-9]{32}$/i.test(salt)||!/^[a-f0-9]{64}$/i.test(expected))return false;const result=await promisify(pbkdf2)(p,Buffer.from(salt,'hex'),600000,32,'sha256');return timingSafeEqual(result,Buffer.from(expected,'hex'))}catch{return false}}
async function session(req,q){const value=req.cookies.get(cookie)?.value;if(!value||!/^[a-f0-9]{64}$/.test(value))return null;const [u]=await q('SELECT a.username,a.name,a.role FROM staff_sessions s JOIN staff_accounts a USING(username) WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active',[hash(value)]);return u||null}
const publicUser=u=>({name:u.name,role:u.role});
async function sendWhatsApp(report){
 const e=process.env,keys=['WA_ACCESS_TOKEN','WA_PHONE_NUMBER_ID','WA_RECIPIENT','WA_TEMPLATE','WA_GRAPH_VERSION','STJ_PUBLIC_URL'];
 if(!keys.every(k=>e[k]))return ['Not configured',null];
 if(!/^v\d+\.\d+$/.test(e.WA_GRAPH_VERSION)||!/^\d+$/.test(e.WA_PHONE_NUMBER_ID)||!/^[1-9]\d{7,14}$/.test(e.WA_RECIPIENT))return ['Invalid WhatsApp configuration',null];
 const labels={daily:'Daily operations report',requisition:'Requisition request',incident:'Incident and maintenance report'};
 const values=[labels[report.type],report.id,report.staff,'Sign in to review the report',e.STJ_PUBLIC_URL.replace(/\/$/,'')+'/'];
 try{if(new URL(e.STJ_PUBLIC_URL).protocol!=='https:')return ['Invalid portal URL',null];
 const result=await fetch('https://graph.facebook.com/'+e.WA_GRAPH_VERSION+'/'+e.WA_PHONE_NUMBER_ID+'/messages',{method:'POST',headers:{Authorization:'Bearer '+e.WA_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:e.WA_RECIPIENT,type:'template',template:{name:e.WA_TEMPLATE,language:{code:e.WA_LANGUAGE||'en_US'},components:[{type:'body',parameters:values.map(text=>({type:'text',text}))}]}}),signal:AbortSignal.timeout(10000)});
 const json=await result.json();if(!result.ok||!json.messages?.[0]?.id)return ['Send failed',null];return ['Accepted by WhatsApp API',json.messages[0].id];
 }catch{return ['Send failed or unconfirmed',null]}
}
export async function GET(req,{params}){try{
 const {action}=await params;const q=db();const u=await session(req,q);
 if(!u)return err('Sign in required.',401);
 if(action==='me')return reply(publicUser(u));
 if(action==='staff-accounts'){if(u.role!=='manager')return err('Manager access required.',403);return reply({accounts:await q('SELECT username,name,role,active FROM staff_accounts ORDER BY role,username')})}
 if(action==='records'){const fields='SELECT id,type,staff,data,status,notification,created_at FROM reports';const records=u.role==='manager'?await q(fields+' ORDER BY created_at DESC LIMIT 500'):await q(fields+' WHERE username=$1 ORDER BY created_at DESC LIMIT 500',[u.username]);return reply({records})}
 return err('Not found.',404);
 }catch{return err('Service unavailable.',503)}}
export async function POST(req,{params}){try{
 const {action}=await params;
 if(req.headers.get('sec-fetch-site')==='cross-site'||(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin))return err('Invalid request origin.',403);
 if(!req.headers.get('content-type')?.startsWith('application/json'))return err('Expected JSON.',415);
 const raw=await req.text();if(Buffer.byteLength(raw)>128000)return err('Request too large.',413);
 let body;try{body=JSON.parse(raw)}catch{return err('Invalid JSON.',400)}
 if(!body||typeof body!=='object'||Array.isArray(body))return err('Invalid request.',400);
 const q=db();
 if(action==='login'){
 const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
 if(!/^[a-z0-9_.-]{1,80}$/.test(username)||typeof body.password!=='string'||body.password.length>1024)return err('Invalid credentials.',401);
 const [limit]=await q("INSERT INTO staff_login_limits(key,attempts,window_start) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN staff_login_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE staff_login_limits.attempts+1 END,window_start=CASE WHEN staff_login_limits.window_start<now()-interval '15 minutes' THEN now() ELSE staff_login_limits.window_start END RETURNING attempts",[hash('user:'+username)]);
 if(limit.attempts>8)return err('Too many attempts. Try again later.',429);
 const [u]=await q('SELECT username,name,role,password_hash FROM staff_accounts WHERE username=$1 AND active',[username]);
 if(!u||!await passwordOK(body.password,u.password_hash))return err('Invalid credentials.',401);
 const token=randomBytes(32).toString('hex');await q("INSERT INTO staff_sessions(token_hash,username,expires_at) VALUES($1,$2,now()+interval '8 hours')",[hash(token),username]);
 const response=reply(publicUser(u));response.cookies.set(cookie,token,opts);return response;
 }
 const u=await session(req,q);if(!u)return err('Sign in required.',401);
 if(action==='staff-account'){
 if(u.role!=='manager')return err('Manager access required.',403);
 const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
 const name=typeof body.name==='string'?body.name.trim():'';
 if(!/^[a-z0-9_.-]{1,80}$/.test(username)||!name||name.length>120||typeof body.password!=='string'||body.password.length<12||body.password.length>128)return err('Invalid account details. Use a password of at least 12 characters.',400);
 const salt=randomBytes(16);const digest=await promisify(pbkdf2)(body.password,salt,600000,32,'sha256');
 const rows=await q("INSERT INTO staff_accounts(username,name,role,password_hash,active) VALUES($1,$2,'staff',$3,true) ON CONFLICT(username) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,active=true WHERE staff_accounts.role='staff' AND NOT staff_accounts.active RETURNING username",[username,name,salt.toString('hex')+'{await q('DELETE FROM staff_sessions WHERE token_hash=$1',[hash(req.cookies.get(cookie).value)]);const r=reply({ok:true});r.cookies.set(cookie,'',{...opts,maxAge:0});return r}
 if(action==='submit'){
 let data;try{data=validate(body.type,body.data)}catch(e){return err(e.message,400)}
 const id=body.type.slice(0,3).toUpperCase()+'-'+randomBytes(8).toString('hex').toUpperCase();const status=body.type==='requisition'?'Pending':'Submitted';
 await q('INSERT INTO reports(id,type,username,staff,data,status) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[id,body.type,u.username,u.name,JSON.stringify(data),status]);
 const [notification,waId]=await sendWhatsApp({id,type:body.type,staff:u.name});
 try{await q('UPDATE reports SET notification=$1,wa_id=$2 WHERE id=$3',[notification,waId,id])}catch{return reply({id,notification:'Saved; notification status unconfirmed'},201)}
 return reply({id,notification},201)
 }
 if(action==='decision'){
 if(u.role!=='manager')return err('Manager access required.',403);
 if(typeof body.id!=='string'||!['Approved','Declined'].includes(body.status))return err('Invalid decision.',400);
 const rows=await q("UPDATE reports SET status=$1,decided_by=$2,decided_at=now() WHERE id=$3 AND type='requisition' AND status='Pending' RETURNING id",[body.status,u.username,body.id]);return rows.length?reply({ok:true}):err('Request is not pending.',409);
 }
 return err('Not found.',404);
 }catch{return err('Service unavailable.',503)}}
+digest.toString('hex')]);
 return rows.length?reply({ok:true},201):err('Account already active or reserved.',409);
 }
 if(action==='logout'){await q('DELETE FROM staff_sessions WHERE token_hash=$1',[hash(req.cookies.get(cookie).value)]);const r=reply({ok:true});r.cookies.set(cookie,'',{...opts,maxAge:0});return r}
 if(action==='submit'){
 let data;try{data=validate(body.type,body.data)}catch(e){return err(e.message,400)}
 const id=body.type.slice(0,3).toUpperCase()+'-'+randomBytes(8).toString('hex').toUpperCase();const status=body.type==='requisition'?'Pending':'Submitted';
 await q('INSERT INTO reports(id,type,username,staff,data,status) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[id,body.type,u.username,u.name,JSON.stringify(data),status]);
 const [notification,waId]=await sendWhatsApp({id,type:body.type,staff:u.name});
 try{await q('UPDATE reports SET notification=$1,wa_id=$2 WHERE id=$3',[notification,waId,id])}catch{return reply({id,notification:'Saved; notification status unconfirmed'},201)}
 return reply({id,notification},201)
 }
 if(action==='decision'){
 if(u.role!=='manager')return err('Manager access required.',403);
 if(typeof body.id!=='string'||!['Approved','Declined'].includes(body.status))return err('Invalid decision.',400);
 const rows=await q("UPDATE reports SET status=$1,decided_by=$2,decided_at=now() WHERE id=$3 AND type='requisition' AND status='Pending' RETURNING id",[body.status,u.username,body.id]);return rows.length?reply({ok:true}):err('Request is not pending.',409);
 }
 return err('Not found.',404);
 }catch{return err('Service unavailable.',503)}}
