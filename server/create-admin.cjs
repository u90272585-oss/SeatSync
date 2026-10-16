'use strict';
const {createInterface}=require('node:readline/promises');
const {randomUUID}=require('node:crypto');
const {resolve}=require('node:path');
const {openDatabase}=require('./database.cjs');
const {hashPassword}=require('./auth.cjs');
(async()=>{
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try{
    const email=(await rl.question('Administrator email: ')).trim().toLowerCase();
    const name=(await rl.question('Administrator name: ')).trim();
    // Use an environment variable on hosting; terminal input is visible locally.
    const password=process.env.ADMIN_PASSWORD||await rl.question('Password (10–128 characters; input visible): ');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>60||password.length<10||password.length>128)throw Error('Invalid name, email or password.');
    const db=openDatabase(resolve(process.env.DATABASE_PATH||'data/seatsync.sqlite'));
    try{db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES (?,?,?,?,?)').run(randomUUID(),name,email,await hashPassword(password),'admin');console.log('Administrator created. Sign in through the website.');}
    finally{db.close();}
  }finally{rl.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
