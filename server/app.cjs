'use strict';
const express = require('express');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { hashPassword, verifyPassword } = require('./auth.cjs');
const rules = require('../js/booking-rules.js');
const root = resolve(__dirname,'..');
const DURATION = 90;
const minute = t => Number(t.slice(0,2))*60+Number(t.slice(3));
const fail = (status,message) => Object.assign(new Error(message),{status});
const publicUser = user => user ? {id:user.id,name:user.name,email:user.email,role:user.role} : null;
function publicBooking(row) {
  return {id:row.id,venue:row.venue,date:row.date,time:row.time,guests:String(row.guests),table:row.table_id,
    name:row.name,status:row.status,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at};
}
function createApp(db, { production = false, now = () => new Date() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (production) app.set('trust proxy',1);
  app.use((req,res,next) => {
    res.set('X-Content-Type-Options','nosniff'); res.set('Referrer-Policy','same-origin');
    res.set('X-Frame-Options','DENY'); next();
  });
  app.use('/api',express.json({limit:'16kb'}));
  app.use('/api',(req,res,next) => {
    res.set('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if (req.get('X-SeatSync-Request') !== '1') return next(fail(403,'Invalid request. Reload the page and try again.'));
      if (req.get('Origin') && req.get('Origin') !== `${req.protocol}://${req.get('host')}`) return next(fail(403,'Cross-origin request denied.'));
      if (!req.is('application/json')) return next(fail(415,'Use JSON for API requests.'));
    }
    next();
  });
  app.get('/api/health',(_req,res) => {db.prepare('SELECT 1').get();res.json({ok:true,storage:'sqlite'});});
  const sessionHash = token => createHash('sha256').update(token).digest('hex');
  function newSession(res,userId=null) {
    const token = randomBytes(32).toString('hex'), id = sessionHash(token), expires=Date.now()+30*86400000;
    db.prepare('INSERT INTO sessions(id,user_id,expires) VALUES (?,?,?)').run(id,userId,expires);
    res.cookie('seatsync_session',token,{httpOnly:true,sameSite:'lax',secure:production,maxAge:30*86400000,path:'/'});
    return {id,user_id:userId,expires};
  }
  app.use('/api',(req,res,next) => {
    const token = /(?:^|;\s*)seatsync_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const session = token && db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(sessionHash(token),Date.now());
    req.session = session || newSession(res);
    req.user = req.session.user_id ? db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user_id) : null;
    next();
  });
  // Bound the password-hashing work; no secrets or passwords are logged.
  const attempts = new Map();
  function authLimit(req,_res,next) {
    const nowMs=Date.now();
    for (const [key,value] of attempts) if (value.until < nowMs) attempts.delete(key);
    const key=req.ip, value=attempts.get(key) || {count:0,until:nowMs+600000};
    attempts.set(key,value); value.count++;
    if (value.count>20) return next(fail(429,'Too many sign-in attempts. Try again in 10 minutes.'));
    next();
  }
  function credentials(body) {
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const password=body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || typeof password!=='string' || password.length<10 || password.length>128)
      throw fail(400,'Enter a valid email and a password of 10–128 characters.');
    return {email,password};
  }
  function signedIn(req,res,user) {
    // Claim this browser's anonymous bookings, never another account's records.
    db.prepare('UPDATE bookings SET user_id=? WHERE guest_session=? AND user_id IS NULL').run(user.id,req.session.id);
    db.prepare('DELETE FROM sessions WHERE id=?').run(req.session.id);
    newSession(res,user.id); res.json({user:publicUser(user)});
  }
  app.get('/api/session',(req,res)=>res.json({user:publicUser(req.user)}));
  app.post('/api/auth/register',authLimit,async(req,res)=>{
    const {email,password}=credentials(req.body), name=typeof req.body.name==='string'?req.body.name.trim():'';
    if (!name || name.length>60) throw fail(400,'Enter a name of 1–60 characters.');
    const passwordHash=await hashPassword(password), id=randomUUID();
    try {db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES (?,?,?,?,?)').run(id,name,email,passwordHash,'customer');}
    catch(e){if(e.message.includes('UNIQUE'))throw fail(409,'This email is already registered. Sign in instead.');throw e;}
    signedIn(req,res,db.prepare('SELECT * FROM users WHERE id=?').get(id));
  });
  app.post('/api/auth/login',authLimit,async(req,res)=>{
    const {email,password}=credentials(req.body),user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user || !await verifyPassword(password,user.password_hash)) throw fail(401,'Incorrect email or password.');
    signedIn(req,res,user);
  });
  app.post('/api/auth/logout',(req,res)=>{
    db.prepare('DELETE FROM sessions WHERE id=?').run(req.session.id);
    res.clearCookie('seatsync_session',{httpOnly:true,sameSite:'lax',secure:production,path:'/'});res.json({ok:true});
  });
  app.patch('/api/profile',(req,res)=>{
    if(!req.user)throw fail(401,'Sign in first.');
    const name=typeof req.body.name==='string'?req.body.name.trim():'';
    if(!name||name.length>60)throw fail(400,'Enter a name of 1–60 characters.');
    db.prepare('UPDATE users SET name=? WHERE id=?').run(name,req.user.id);
    res.json({user:{...publicUser(req.user),name}});
  });
  function owns(req,row) {return req.user?.role==='admin'||(row.user_id ? row.user_id===req.user?.id : row.guest_session===req.session.id);}
  function getBooking(req,id) {
    const row=db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    if(!row||!owns(req,row))throw fail(404,'Booking not found or not accessible in this session.');return row;
  }
  function validate(body) {
    const b={venue:body.venue,date:body.date,time:body.time,guests:String(body.guests),table:String(body.table)};
    const problem=rules.validate(b,now()); if(problem)throw fail(400,problem.message);return b;
  }
  function conflicting(b,exclude='') {
    return db.prepare(`SELECT id FROM bookings WHERE venue=? AND date=? AND table_id=? AND status='confirmed'
      AND id<>? AND start_minute<? AND end_minute>?`).get(b.venue,b.date,b.table,exclude,minute(b.time)+DURATION,minute(b.time));
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
  }
  app.get('/api/venues',(_req,res)=>res.json(db.prepare('SELECT * FROM venues').all()));
  app.get('/api/availability',(req,res)=>{
    const {venue,date,time}=req.query;
    const validVenue=db.prepare('SELECT id FROM venues WHERE id=?').get(typeof venue==='string'?venue:'');
    if(!validVenue||!rules.isDate(date)||!rules.times.includes(time))throw fail(400,'Select a valid venue, date and time.');
    let exclude='';if(typeof req.query.exclude==='string')exclude=getBooking(req,req.query.exclude).id;
    res.json(rules.tables.map(t=>({...t,available:!t.occupied&&!conflicting({venue,date,time,table:t.id},exclude)})));
  });
  app.get('/api/bookings',(req,res)=>{
    const rows=req.user?.role==='admin'?db.prepare('SELECT * FROM bookings ORDER BY date,time').all()
      :req.user?db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY date,time').all(req.user.id)
      :db.prepare('SELECT * FROM bookings WHERE user_id IS NULL AND guest_session=? ORDER BY date,time').all(req.session.id);
    res.json(rows.map(publicBooking));
  });
  app.get('/api/bookings/:id',(req,res)=>res.json(publicBooking(getBooking(req,req.params.id))));
  app.post('/api/bookings',(req,res)=>{
    const b=validate(req.body),id=randomUUID(), stamp=now().toISOString();
    const name=req.user?.role==='admin' && typeof req.body.name==='string'?req.body.name.trim():req.user?.name||'Guest';
    if(!name||name.length>60)throw fail(400,'Enter a customer name of 1–60 characters.');
    transaction(()=>{
      if(conflicting(b))throw fail(409,'This table is already reserved during your visit. Choose another table or time.');
      db.prepare(`INSERT INTO bookings(id,venue,date,time,start_minute,end_minute,guests,table_id,name,status,user_id,guest_session,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'confirmed',?,?,?,?)`).run(id,b.venue,b.date,b.time,minute(b.time),minute(b.time)+DURATION,Number(b.guests),b.table,name,
          req.user?.role==='admin'?null:req.user?.id||null,req.session.id,stamp,stamp);
    });
    res.status(201).json(publicBooking(getBooking(req,id)));
  });
  app.put('/api/bookings/:id',(req,res)=>{
    const b=validate(req.body);
    const row=transaction(()=>{
      const previous=getBooking(req,req.params.id);
      if(previous.status==='cancelled')throw fail(409,'Cancelled bookings cannot be edited.');
      if(!rules.isFuture(previous.date,previous.time,now()))throw fail(409,'Past bookings cannot be edited.');
      if(req.body.version!==previous.version)throw fail(409,'This booking changed elsewhere. Reload before editing.');
      if(conflicting(b,previous.id))throw fail(409,'This table is already reserved during your visit. Choose another table or time.');
      db.prepare(`UPDATE bookings SET venue=?,date=?,time=?,start_minute=?,end_minute=?,guests=?,table_id=?,version=version+1,updated_at=? WHERE id=?`)
        .run(b.venue,b.date,b.time,minute(b.time),minute(b.time)+DURATION,Number(b.guests),b.table,now().toISOString(),previous.id);
      return getBooking(req,previous.id);
    });res.json(publicBooking(row));
  });
  app.post('/api/bookings/:id/cancel',(req,res)=>{
    const row=transaction(()=>{
      const previous=getBooking(req,req.params.id);
      if(previous.status==='cancelled')return previous;
      if(!rules.isFuture(previous.date,previous.time,now()))throw fail(409,'The visit has already started.');
      db.prepare("UPDATE bookings SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(now().toISOString(),previous.id);
      return getBooking(req,previous.id);
    });res.json(publicBooking(row));
  });
  app.use('/api',(_req,_res,next)=>next(fail(404,'API endpoint not found.')));
  // Serve only public assets: never expose database, environment or server code.
  for(const folder of ['css','js','assets','pages'])app.use(`/${folder}`,express.static(resolve(root,folder),{dotfiles:'deny',index:false}));
  const pages=['index.html','darina-home.html','admin.dashbroad.html','booking-home.html','team-demo.html','darina-style.css','darina-main.js'];
  app.get('/',(_req,res)=>res.sendFile(resolve(root,'index.html')));
  for(const page of pages)app.get(`/${page}`,(_req,res)=>res.sendFile(resolve(root,page)));
  app.use((err,_req,res,_next)=>{
    const status=err.status||500;
    if(status===500)console.error('Request failed:',err.message);
    res.status(status).json({error:status===500?'The server could not complete this request. Please try again.':err.message});
  });
  return app;
}
module.exports={createApp};
