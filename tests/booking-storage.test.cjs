'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../js/booking-storage.js'),'utf8');
function setup(){
 const calls=[],record={id:'server-id',version:1,status:'confirmed'},state={fail:false};
 const context=vm.createContext({window:{dispatchEvent(){},SeatSyncAPI:{ready:Promise.resolve(),async request(path,method='GET',body){
  calls.push({path,method,body});if(state.fail)throw Error('Server unavailable');
  if(path==='/bookings'&&method==='GET')return [];
  return {...record,...body,status:path.endsWith('/cancel')?'cancelled':'confirmed',version:2};
 }}},Event:class{},sessionStorage:{setItem(){throw Error('storage disabled');}},encodeURIComponent});
 vm.runInContext(source,context);return {storage:context.window.SeatSyncBookingStorage,calls,state};
}
test('API creates records, edits with version and supports blocked browser storage',async()=>{
 const {storage,calls}=setup();await storage.ready;
 const saved=await storage.saveShared({venue:'skyberry'});assert.equal(saved.id,'server-id');
 await storage.saveShared({...saved,table:'3'});
 assert.equal(calls.at(-1).method,'PUT');assert.equal(calls.at(-1).body.version,2);
 assert.equal(storage.list().length,1);assert.equal(storage.find(saved.id).table,'3');
 await assert.rejects(storage.saveShared({id:'unloaded-id'}),/Load the booking/);
});
test('failed cancellation cannot change cached status or report success',async()=>{
 const {storage,state}=setup();await storage.ready;const record=await storage.saveShared({});
 state.fail=true;await assert.rejects(storage.cancel(record),/Server unavailable/);
 assert.equal(storage.isCancelled(record.id),false);
 state.fail=false;await storage.cancel(record);assert.equal(storage.isCancelled(record.id),true);
});
