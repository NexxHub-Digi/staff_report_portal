import test from 'node:test';import assert from 'node:assert/strict';import {parseRecipients,sendWhatsApp} from '../lib/whatsapp.js';
const config={WA_ACCESS_TOKEN:'test-only',WA_PHONE_NUMBER_ID:'123456',WA_TEMPLATE:'test_template',WA_GRAPH_VERSION:'v1.0',STJ_PUBLIC_URL:'https://example.com',WA_RECIPIENTS:'12025550101,+12025550102,12025550101'};
const report={type:'daily',id:'DAI-TEST',staff:'Test staff'};
test('normalizes and deduplicates',()=>assert.deepEqual(parseRecipients(config.WA_RECIPIENTS),['12025550101','12025550102']));
test('rejects invalid recipients',()=>assert.throws(()=>parseRecipients('bad')));
test('two independent requests and partial failure',async()=>{const calls=[];const result=await sendWhatsApp(report,config,async(url,opt)=>{const body=JSON.parse(opt.body);calls.push(body);return {ok:body.to.endsWith('101'),json:async()=>body.to.endsWith('101')?{messages:[{id:'mock-1'}]}:{error:{message:'mock'}}}});assert.equal(calls.length,2);assert.equal(result.results[0].message_id,'mock-1');assert.equal(result.results[1].message_id,null);assert.match(result.notification,/1 of 2/);});
test('missing credentials does not send',async()=>{const result=await sendWhatsApp(report,{},()=>{throw Error('must not call')});assert.equal(result.notification,'Not configured')});
