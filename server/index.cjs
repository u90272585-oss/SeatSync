'use strict';
const {resolve}=require('node:path');
const {openDatabase}=require('./database.cjs');
const {createApp}=require('./app.cjs');
const db=openDatabase(resolve(process.env.DATABASE_PATH||'data/seatsync.sqlite'));
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const server=createApp(db,{production:process.env.NODE_ENV==='production'}).listen(port,host,()=>{
  console.log(`SeatSync: http://${host}:${port} — SQLite storage is ready.`);
});
function stop(){server.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
