'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {once}=require('node:events');
const {openDatabase}=require('../server/database.cjs');
const {createApp}=require('../server/app.cjs');
const {hashPassword}=require('../server/auth.cjs');
const booking={venue:'skyberry',date:'2027-03-01',time:'14:00',guests:'2',table:'1'};
async function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'seatsync-test-')),file=join(dir,'db.sqlite');
  let db=openDatabase(file),server;
  async function start(){server=createApp(db,{now:()=>new Date('2026-10-16T07:00:00Z')}).listen(0,'127.0.0.1');await once(server,'listening');}
  await start();
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
  function client(){
    let cookie='';
    return async(path,method='GET',body,extra={})=>{
      const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{cookie,'Content-Type':'application/json','X-SeatSync-Request':'1',...extra},body:body===undefined?undefined:JSON.stringify(body)});
      const newCookie=response.headers.getSetCookie().at(-1);if(newCookie)cookie=newCookie.split(';')[0];
      const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}
      return {status:response.status,data,headers:response.headers};
    };
  }
  return {client,db,restart:async()=>{await new Promise(r=>server.close(r));db.close();db=openDatabase(file);await start();}};
}
test('guest CRUD, ID access control, persistence and cancellation frees a time slot',async t=>{
 const f=await fixture(t),a=f.client(),b=f.client();
 await a('/api/session');await b('/api/session');
 let r=await a('/api/bookings','POST',booking);assert.equal(r.status,201);const saved=r.data;
 assert.equal((await b(`/api/bookings/${saved.id}`)).status,404);
 assert.equal((await b(`/api/bookings/${saved.id}/cancel`,'POST',{})).status,404);
 assert.equal((await b('/api/bookings')).data.length,0);
 assert.equal((await b('/api/bookings','POST',{...booking,time:'15:00'})).status,409);
 assert.equal((await b('/api/bookings','POST',{...booking,time:'15:30'})).status,201);
 assert.equal((await a(`/api/bookings/${saved.id}`,'PUT',{...booking,time:'13:00',version:saved.version})).status,200);
 assert.equal((await a(`/api/bookings/${saved.id}`,'PUT',{...booking,version:saved.version})).status,409);
 await f.restart();assert.equal((await a(`/api/bookings/${saved.id}`)).data.time,'13:00');
 assert.equal((await a(`/api/bookings/${saved.id}/cancel`,'POST',{})).data.status,'cancelled');
 assert.equal((await a(`/api/bookings/${saved.id}/cancel`,'POST',{})).status,200);
 assert.equal((await a(`/api/bookings/${saved.id}`,'PUT',{...booking,version:3})).status,409);
 assert.equal((await b('/api/bookings','POST',{...booking,time:'13:00'})).status,201);
});
test('concurrent requests cannot reserve the same overlapping table twice',async t=>{
 const f=await fixture(t),a=f.client(),b=f.client();await a('/api/session');await b('/api/session');
 const result=await Promise.all([a('/api/bookings','POST',booking),b('/api/bookings','POST',booking)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
 assert.equal((await a('/api/bookings','POST',{...booking,venue:'aqqu'})).status,201);
});
test('server validates dates, capacity, time, blocked tables and ignores injected status',async t=>{
 const f=await fixture(t),a=f.client();await a('/api/session');
 for(const invalid of [{date:'2027-02-30'},{date:'2020-01-01'},{time:'25:00'},{time:'14:15'},{guests:'6'},{table:'7'},{venue:'__proto__'}])
   assert.equal((await a('/api/bookings','POST',{...booking,...invalid})).status,400);
 const created=await a('/api/bookings','POST',{...booking,status:'cancelled',user_id:'someone-else'});
 assert.equal(created.data.status,'confirmed');
 const availability=(await a('/api/availability?venue=skyberry&date=2027-03-01&time=14:30')).data;
 assert.equal(availability.find(t=>t.id==='1').available,false);
 assert.equal(availability.find(t=>t.id==='2').available,true);
 assert.equal((await a(`/api/availability?venue=skyberry&date=2027-03-01&time=14:30&exclude=${created.data.id}`)).data.find(t=>t.id==='1').available,true);
});
test('registration claims guest bookings, roles cannot be forged, login works across clients',async t=>{
 const f=await fixture(t),a=f.client(),b=f.client();await a('/api/session');
 const saved=(await a('/api/bookings','POST',booking)).data;
 const user={name:'Uldana',email:'uldana@example.test',password:'test-password-123',role:'admin'};
 const registered=await a('/api/auth/register','POST',user);
 assert.equal(registered.data.user.role,'customer');assert.match(registered.headers.get('set-cookie'),/HttpOnly/);
 assert.equal((await b('/api/auth/login','POST',{...user,password:'wrong-password'})).status,401);
 assert.equal((await b('/api/auth/login','POST',user)).status,200);
 assert.equal((await b(`/api/bookings/${saved.id}`)).status,200);
 assert.equal((await b('/api/profile','PATCH',{name:'Updated',role:'admin'})).data.user.role,'customer');
 await a('/api/auth/logout','POST',{});assert.equal((await a(`/api/bookings/${saved.id}`)).status,404);
 const stored=f.db.prepare('SELECT password_hash FROM users').get();assert(!stored.password_hash.includes(user.password));
});
test('administrator can manage bookings from other browsers',async t=>{
 const f=await fixture(t),a=f.client(),admin=f.client();
 f.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('admin-test','Malika','admin@example.test',await hashPassword('admin-test-password'),'admin');
 const saved=(await a('/api/bookings','POST',booking)).data;
 await admin('/api/auth/login','POST',{email:'admin@example.test',password:'admin-test-password'});
 assert.equal((await admin('/api/bookings')).data.length,1);
 assert.equal((await admin(`/api/bookings/${saved.id}/cancel`,'POST',{})).status,200);
 assert.equal((await a(`/api/bookings/${saved.id}`)).data.status,'cancelled');
});
test('rejects cross-origin writes and does not serve source, secrets or database files',async t=>{
 const f=await fixture(t),a=f.client();
 assert.equal((await a('/api/bookings','POST',booking,{'X-SeatSync-Request':''})).status,403);
 assert.equal((await a('/api/bookings','POST',booking,{Origin:'https://untrusted.example'})).status,403);
 for(const path of ['/server/app.cjs','/data/seatsync.sqlite','/.env','/.git/config'])assert.equal((await a(path)).status,404);
 assert.equal((await a('/api/bookings','POST',{...booking,date:"2027-01-01'; DROP TABLE bookings; --"})).status,400);
 assert.equal((await a('/api/bookings')).status,200);
});
