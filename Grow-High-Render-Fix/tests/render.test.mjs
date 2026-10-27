import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/workspace.js',import.meta.url),'utf8').replace(/refresh\(\)\.catch[\s\S]+$/,'');
const fixture={serverVersion:'0.4.1',user:{name:'QA User',role:'owner',email:'qa@example.invalid',id:'u'},business:'QA Company',products:[{id:'p',name:'<script>alert(1)</script>',sku:'QA-1',type:'Product',category:'Test',price:10000,cost:5000,stock:{w:2},reorder:1,custom:{},unit:'pcs',archived:false}],companies:[{id:'c',name:'QA Company',email:'qa@example.invalid'}],warehouses:[{id:'w',name:'Warehouse'}],customers:[],suppliers:[],documents:[],payments:[],purchases:[],expenses:[],tasks:[],fields:[],transactions:[],bom:[],chat:[],preferences:[],orders:[],receipts:[],supplierReturns:[],supplierBills:[],supplierPayments:[],approvals:[],recurring:[],jobs:[],workflowSettings:[],receipts:[],supplierReturns:[],supplierBills:[],supplierPayments:[],approvals:[],recurring:[],jobs:[],workflowSettings:[],audit:[],users:[],metrics:{revenue:0,received:0,expenses:0,operatingProfit:0,receivables:0,stockValue:10000}};
const nodes=new Map();
function node(key){if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},addEventListener(){},focus(){},setSelectionRange(){},showModal(){},close(){}});return nodes.get(key);}
const context=vm.createContext({console,Intl,Date,URL,Blob,crypto:globalThis.crypto,setTimeout,clearTimeout,fixture,location:{hash:''},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},body:node('body')},window:{addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}},innerWidth:1300});
vm.runInContext(readFileSync(new URL('../dist/workflows-ui.js',import.meta.url),'utf8'),context);
for(const file of ['analytics-ui.js','sharing-ui.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),context);
vm.runInContext(source,context);
vm.runInContext('state=fixture',context);
test('all eleven workspace routes render with an empty business and malicious product text escaped',()=>{
  for(const route of ['home','inventory','billing','analytics','assistant','customers','suppliers','purchases','expenses','reports','settings']){
    vm.runInContext(`location.hash='#${route}';render()`,context);
    const html=nodes.get('#content').innerHTML;assert.ok(html.length>100,route);assert.ok(!html.includes('<script>alert(1)</script>'),route);
  }
  vm.runInContext("location.hash='#inventory';render()",context);assert.ok(nodes.get('#content').innerHTML.includes('&lt;script&gt;'));
});
test('credit and paid document statuses account for credited balances',()=>{
  assert.equal(vm.runInContext("paymentStatus({type:'Invoice',status:'Issued',paid:500,credited:500,total:1000,due:'2000-01-01'})",context),'Settled');
  assert.equal(vm.runInContext("paymentStatus({type:'Invoice',status:'Issued',paid:1000,total:1000,due:'2000-01-01'})",context),'Paid');
});

test('expired assistant session preserves unsent question and returns to assistant login',async()=>{
 const saved=new Map();context.sessionStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 context.fetch=async()=>({status:401,ok:false,json:async()=>({error:'Please sign in.'})});
 vm.runInContext("route='assistant'",context);await vm.runInContext("ask('Hey')",context);
 assert.equal(saved.get('gh-assistant-draft:u'),'Hey');assert.equal(context.location.href,'/?reason=session-expired&next=assistant');
 assert.match(nodes.get('#assistant-status').textContent,/session expired/);assert.equal(nodes.get('#chat-form button').disabled,false);
 assert.match(vm.runInContext('assistant()',context),/value="Hey"/);
 vm.runInContext("state={...fixture,user:{...fixture.user,id:'other-user'}}",context);assert.equal(vm.runInContext('assistantDraft()',context),'');vm.runInContext('state=fixture;clearTimeout(toastTimer)',context);delete context.fetch;
});
