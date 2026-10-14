import test from 'node:test';import assert from 'node:assert/strict';
import {changes} from '../public/changes.js';
test('manual comparison reports new claimable coupons and a real lower minimum once',()=>{
 const before={coupons:[{title:'已有券',status:'可领取'}],offers:[{payableCents:500}]};
 const after={coupons:[{title:'已有券',status:'可领取'},{title:'新券',status:'可领取'},{title:'已领',status:'已领取'}],offers:[{payableCents:300}]};
 assert.deepEqual(changes(before,after).newCoupons,['新券']);assert.equal(changes(before,after).dropCents,200);
 assert.deepEqual(changes(after,after),{newCoupons:[],dropCents:0});
});
test('empty scan is not a zero-price discovery',()=>{
 assert.equal(changes({offers:[{payableCents:500}],coupons:[]},{offers:[],coupons:[]}).dropCents,0);
});
