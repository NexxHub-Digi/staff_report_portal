import test from 'node:test';import assert from 'node:assert/strict';import {validate} from '../lib/validation.js';
const daily={date:'2026-11-26',shift:'Active duty',activities:'Cleaning',power:'Normal',sales:'Nil',expenses:'Nil',balances:'Nil'};
test('daily valid and strips extra fields',()=>{assert.deepEqual(validate('daily',{...daily,username:'forged'}),daily)});
test('invalid date',()=>assert.throws(()=>validate('daily',{...daily,date:'2026-02-30'})));
test('requisition amount validated',()=>assert.throws(()=>validate('requisition',{date:daily.date,department:'Operations',priority:'Urgent',reason:'Fuel',items:[{item:'Fuel',qty:'20 litres',cost:-1}]})));
test('unknown report type',()=>assert.throws(()=>validate('__proto__',{})));
