import test from 'node:test';import assert from 'node:assert/strict';import {setTimeout as sleep} from 'node:timers/promises';
import {Sessions} from '../src/sessions.mjs';
test('credentials are disposed at expiration even if nobody makes another request',async()=>{
 let disposed=false;const sessions=new Sessions({ttlMs:10});sessions.add({close(){disposed=true;}});
 await sleep(25);assert.equal(disposed,true);assert.equal(sessions.entries.size,0);sessions.close();
});
