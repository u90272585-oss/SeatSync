const {test}=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../server/catalog.json');
test('Python and browser use matching venue and table catalogues',()=>{
 assert.deepEqual(catalog.venues,require('../js/venues.js'));
 assert.deepEqual(catalog.tables,require('../js/booking-rules.js').tables);
});
