import {createHash,timingSafeEqual,randomBytes,pbkdf2} from 'node:crypto';
import {promisify} from 'node:util';
export function setupAuthorized(token,expected){
 if(typeof token!=='string'||token.length<32||token.length>256||typeof expected!=='string'||!/^[a-f0-9]{64}$/i.test(expected))return false;
 return timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(expected,'hex'));
}
export function validManagerPassword(p){return typeof p==='string'&&p.length>=14&&p.length<=128&&!/^\s+$/.test(p)}
export async function makePasswordHash(p){const salt=randomBytes(16);const digest=await promisify(pbkdf2)(p,salt,600000,32,'sha256');return salt.toString('hex')+'$'+digest.toString('hex')}
export async function activateManager(q,body,expected){
 if(!setupAuthorized(body.token,expected))return {status:403,error:'Activation unavailable or invalid setup code.'};
 if(!validManagerPassword(body.password))return {status:400,error:'Choose a password of 14–128 characters.'};
 const passwordHash=await makePasswordHash(body.password);
 const rows=await q("UPDATE staff_accounts SET password_hash=$1,active=true WHERE username='manager' AND role='manager' AND active=false AND password_hash='PENDING_ACTIVATION' RETURNING username",[passwordHash]);
 return rows.length?{status:200,ok:true}:{status:409,error:'Manager already activated or unavailable.'};
}
