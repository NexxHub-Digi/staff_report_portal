import {neon} from '@neondatabase/serverless';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
const [username,name,role]=process.argv.slice(2);
const password=process.env.STJ_NEW_PASSWORD;
if(!username||!/^[a-z0-9_.-]{1,80}$/.test(username)||!name||!['staff','manager'].includes(role)||!password||password.length<12||!process.env.DATABASE_URL)throw Error('Provide username, display name, role, DATABASE_URL and STJ_NEW_PASSWORD (12+ characters).');
const salt=randomBytes(16);const passwordHash=salt.toString('hex')+'$'+pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex');
const sql=neon(process.env.DATABASE_URL);
await sql.query('INSERT INTO staff_accounts(username,name,role,password_hash) VALUES($1,$2,$3,$4)',[username,name,role,passwordHash]);
console.log('Account created.');
