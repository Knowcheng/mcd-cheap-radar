import test from 'node:test';import assert from 'node:assert/strict';
import {AccountModel} from '../public/model.js';
test('switching account clears previous offers and rejects an old pending scan',()=>{
 const model=new AccountModel();model.reset(true);const accountA=model.version;
 assert.equal(model.accept(accountA,{offers:[{id:'a',payableCents:500}],coupons:[{title:'A私有券'}]}),true);
 model.selected=model.data.offers[0];model.reset(true);
 assert.equal(model.data,null);assert.equal(model.selected,null);
 assert.equal(model.accept(accountA,{offers:[{id:'a',payableCents:500}]}),false);
 assert.equal(model.data,null);assert.equal(model.connected,true);
});
