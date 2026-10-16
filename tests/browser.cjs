const {chromium}=require('playwright');
const root=require('node:path').resolve(__dirname,'..');
const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const {openDatabase}=require(root+'/server/database.cjs');
const {createApp}=require(root+'/server/app.cjs');
const {hashPassword}=require(root+'/server/auth.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const db=openDatabase(':memory:');
 db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('test-admin','Administrator','admin@example.test',await hashPassword('test-password-123'),'admin');
 const server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,headless:true});
 const errors=[];
 try {
  const guest=await browser.newContext(),admin=await browser.newContext(),other=await browser.newContext();
  const page=await guest.newPage(),dashboard=await admin.newPage(),second=await other.newPage();
  for(const p of [page,dashboard,second])p.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/pages/booking.html');
  await page.locator('#venue').selectOption('skyberry');await page.locator('#date').fill(date);await page.locator('#time').selectOption('14:00');
  await page.waitForFunction(()=>!document.querySelector('input[name=table][value="1"]').disabled);
  await page.locator('input[name=table][value="1"]').check();await page.locator('#accept-terms').check();await page.locator('button[type=submit]').click();
  await page.waitForURL('**/confirmation.html?id=*');await page.locator('#confirmation').waitFor({state:'visible'});
  const id=new URL(page.url()).searchParams.get('id');assert(id);
  await dashboard.goto(base+'/pages/account.html');await dashboard.locator('#signin-email').fill('admin@example.test');await dashboard.locator('#signin-password').fill('test-password-123');await dashboard.locator('#demo-signin button[type=submit]').click();
  await dashboard.waitForURL('**/admin.dashbroad.html');await dashboard.locator(`[data-booking-id="${id}"]`).waitFor();
  await second.goto(base+`/pages/booking.html?venue=skyberry&date=${date}&time=14%3A00`);
  await second.waitForFunction(()=>document.querySelector('#table-state-1')?.textContent==='Reserved');
  assert(await second.locator('input[name=table][value="1"]').isDisabled());
  await page.locator('#edit-booking').click();await page.locator('#time').selectOption('16:00');
  await page.waitForFunction(()=>!document.querySelector('button[type=submit]').disabled);
  await page.locator('#accept-terms').check();await page.locator('button[type=submit]').click();await page.waitForURL('**/confirmation.html?id=*');
  await page.waitForFunction(()=>document.querySelector('#confirmed-time').textContent.includes('16:00'));
  assert.equal(new URL(page.url()).searchParams.get('id'),id);
  await dashboard.waitForFunction(id=>document.querySelector(`[data-booking-id="${id}"]`).textContent.includes('16:00'),id);
  await page.locator('#cancel-booking').click();await page.locator('#confirm-cancel').click();
  await page.waitForFunction(()=>document.querySelector('#booking-status').textContent.includes('Cancelled'));
  await dashboard.waitForFunction(id=>document.querySelector(`[data-booking-id="${id}"]`).textContent.includes('Cancelled'),id);
  await page.goto(base+'/pages/account.html');await page.locator('input[value=register]').check();await page.locator('#signin-name').fill('Uldana');await page.locator('#signin-email').fill('customer@example.test');await page.locator('#signin-password').fill('customer-password-123');await page.locator('#demo-signin button[type=submit]').click();await page.waitForURL('**/my-bookings.html');
  await page.locator('[data-status]').waitFor();assert.equal(await page.locator('[data-status]').textContent(),'Cancelled');
  await second.goto(base+'/pages/account.html');await second.locator('#signin-email').fill('customer@example.test');await second.locator('#signin-password').fill('customer-password-123');await second.locator('#demo-signin button[type=submit]').click();await second.waitForURL('**/my-bookings.html');await second.locator('[data-status]').waitFor();
  await second.goto(base+'/admin.dashbroad.html');await second.waitForURL('**/pages/account.html');
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/index.html','/pages/booking.html','/pages/account.html','/pages/confirmation.html?id='+id]) {
   await page.goto(base+path);await page.waitForTimeout(350);
   const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(size.scroll<=size.width+1,JSON.stringify({path,...size}));
  }
  assert.deepEqual(errors,[]);console.log('PASS: guest booking, conflict, edit, admin updates, cancellation, registration, cross-browser login, authorization and mobile widths; no JS errors.');
 }finally {await browser.close();await new Promise(r=>server.close(r));db.close();}
})().catch(e=>{console.error(e);process.exit(1)});
