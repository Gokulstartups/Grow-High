import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),data=mkdtempSync(path.join(os.tmpdir(),'grow-high-test-'));
const port=14180,base=`http://127.0.0.1:${port}`;
let processHandle,ownerCookie,otherCookie,state,product,quote,invoice,recovery,wh;
const email=`owner-${randomUUID()}@example.com`,password='Integration-Test!2026';
async function start(){
  processHandle=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),GH_DATA_DIR:data},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),15000);processHandle.stdout.on('data',d=>{if(String(d).includes('ready')){clearTimeout(timer);resolve();}});processHandle.on('exit',c=>{clearTimeout(timer);reject(Error('Server exited '+c));});});
}
async function request(route,b,cookie=ownerCookie,options={}){
  const r=await fetch(base+'/api/'+route,{method:b?'POST':'GET',headers:{...(b?{'Content-Type':'application/json','Origin':base}:{}),...(cookie?{Cookie:cookie}:{}),...options.headers},body:b?JSON.stringify(b):undefined});
  const result=await r.json();return {status:r.status,b:result,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function ok(route,b,cookie){const r=await request(route,b,cookie);assert.equal(r.status,200,JSON.stringify(r.b));return r.b;}
before(start);
after(()=>{processHandle?.kill();console.log('Test database retained at '+data);});
test('real accounts, financial workflows, atomic stock, roles, isolation and persistence',async t=>{
  await t.test('register creates owner, recovery code, and secure session',async()=>{
    const r=await request('register',{email,password,name:'Test Owner',company:'Test Company'},'');assert.equal(r.status,200);ownerCookie=r.cookie;recovery=r.b.recovery;assert.equal(recovery.length,40);state=await ok('state');assert.equal(state.user.role,'owner');wh=state.warehouses[0].id;
  });
  await t.test('unauthenticated and cross-origin requests rejected',async()=>{
    assert.equal((await request('state',null,'')).status,401);
    assert.equal((await request('expenses',{amount:'10',date:'2026-10-20',description:'Bad',category:'Office'},ownerCookie,{headers:{Origin:'https://untrusted.example'}})).status,403);
  });
  await t.test('products, required custom fields and stale writes',async()=>{
    const field=await ok('fields',{name:'Manufacturer',type:'Text',scope:'All',required:true,default:'',order:0});
    const p={name:'Test Laptop',sku:'TEST-001',type:'Product',price:'100.01',cost:'60.00',reorder:2,custom:{[field.id]:'Test Manufacturer'}};
    assert.equal((await request('products',{...p,custom:{}})).status,400);
    product=await ok('products',p);assert.equal(product.price,10001);assert.equal(product.custom[field.id],'Test Manufacturer');
    const edited=await ok('products',{...p,id:product.id,version:product.version});
    assert.equal((await request('products',{...p,id:product.id,version:product.version})).status,409);product=edited;
    await ok('stock',{productId:product.id,warehouse:wh,delta:10,reason:'Opening stock'});
    assert.equal((await request('stock',{productId:product.id,warehouse:wh,delta:-11,reason:'Invalid withdrawal'})).status,400);
    state=await ok('state');assert.equal(state.products[0].stock[wh],10);
  });
  await t.test('tenant isolation blocks references to another workspace',async()=>{
    const r=await request('register',{email:`other-${randomUUID()}@example.com`,password,name:'Other',company:'Other Company'},'');otherCookie=r.cookie;
    const other=await ok('state',null,otherCookie);assert.equal(other.products.length,0);
    assert.equal((await request('stock',{productId:product.id,warehouse:wh,delta:1,reason:'Attack'},otherCookie)).status,404);
  });
  await t.test('company logos reject active content and forged image types',async()=>{
    const c=state.companies[0];
    assert.equal((await request('companies',{...c,logo:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
    assert.equal((await request('companies',{...c,logo:'data:image/png;base64,ZmFrZQ=='})).status,400);
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNqkAAAAASUVORK5CYII=';
    const saved=await ok('companies',{...c,logo:png});assert.equal(saved.logo,png);state=await ok('state');
  });
  await t.test('quotation tax rounding, acceptance and one-time invoice conversion',async()=>{
    const customer=await ok('contacts',{kind:'customers',name:'Customer'});
    quote=await ok('documents',{type:'Quotation',customerId:customer.id,companyId:state.companies[0].id,warehouse:wh,date:'2026-10-20',due:'2026-10-30',taxMode:'CGST + SGST',lines:[{productId:product.id,quantity:3,price:'100.01',discount:10,tax:18}]});
    assert.equal(quote.subtotal,27003);assert.equal(quote.tax,4861);assert.equal(quote.total,31864);
    quote=await ok('documents/status',{id:quote.id,version:quote.version,status:'Sent'});
    quote=await ok('documents/status',{id:quote.id,version:quote.version,status:'Accepted'});
    invoice=await ok('documents/convert',{id:quote.id});assert.equal(invoice.type,'Invoice');assert.equal(invoice.status,'Draft');
    assert.equal((await request('documents/convert',{id:quote.id})).status,400);
    state=await ok('state');assert.equal(state.products[0].stock[wh],10);
  });
  await t.test('invoice issuing deducts stock once and locks edits',async()=>{
    invoice=await ok('documents/status',{id:invoice.id,version:invoice.version,status:'Issued'});
    state=await ok('state');assert.equal(state.products[0].stock[wh],7);
    assert.equal((await request('documents/status',{id:invoice.id,version:invoice.version,status:'Issued'})).status,400);
    assert.equal((await request('documents',{id:invoice.id,version:invoice.version})).status,400);
  });
  await t.test('payments are bounded, idempotent and references unique',async()=>{
    const b={documentId:invoice.id,amount:'100.00',reference:'BANK-001',key:randomUUID(),date:'2026-10-20'};
    const payment=await ok('payments',b),retry=await ok('payments',b);assert.equal(payment.id,retry.id);
    assert.equal((await request('payments',{...b,key:randomUUID()})).status,400);
    assert.equal((await request('payments',{...b,key:randomUUID(),reference:'BANK-002',amount:'9999.00'})).status,400);
    state=await ok('state');assert.equal(state.payments.length,1);assert.equal(state.documents.find(d=>d.id===invoice.id).paid,10000);
    assert.equal(state.metrics.received,10000);assert.equal(state.metrics.receivables,21864);
  });
  await t.test('atomic transfers, assemblies, and duplicate purchase receipts',async()=>{
    const second=await ok('warehouses',{name:'Second'});await ok('transfer',{productId:product.id,from:wh,to:second.id,quantity:2});
    state=await ok('state');const p=state.products.find(p=>p.id===product.id);assert.equal(p.stock[wh],5);assert.equal(p.stock[second.id],2);
    const f=state.fields[0],part=await ok('products',{name:'Component',sku:'PART-1',type:'Part',price:'10',cost:'5',custom:{[f.id]:'Test'}});
    await ok('bom',{productId:product.id,components:[{productId:part.id,quantity:2}]});
    assert.equal((await request('assemble',{productId:product.id,warehouse:wh,quantity:1})).status,400);
    await ok('stock',{productId:part.id,warehouse:wh,delta:4,reason:'Components'});
    await ok('assemble',{productId:product.id,warehouse:wh,quantity:2});
    state=await ok('state');assert.equal(state.products.find(p=>p.id===product.id).stock[wh],7);assert.equal(state.products.find(p=>p.id===part.id).stock[wh],0);
    const supplier=await ok('contacts',{kind:'suppliers',name:'Supplier'});
    const po=await ok('purchases',{supplierId:supplier.id,warehouse:wh,due:'2026-10-30',lines:[{productId:part.id,quantity:10,cost:'5'}]});
    await ok('purchases/receive',{id:po.id});assert.equal((await request('purchases/receive',{id:po.id})).status,400);
  });
  await t.test('read-only roles cannot mutate records',async()=>{
    const email=`viewer-${randomUUID()}@example.com`;
    await ok('users',{name:'Viewer',email,password,role:'viewer'});
    const r=await request('login',{email,password},'');assert.equal(r.status,200);
    assert.equal((await request('stock',{productId:product.id,warehouse:wh,delta:1,reason:'Forbidden'},r.cookie)).status,403);
    assert.equal((await request('export',null,r.cookie)).status,403);
  });
  await t.test('activity automation deduplicates, resolves and reopens low stock',async()=>{
    state=await ok('state');const part=state.products.find(p=>p.type==='Part'),n=state.tasks.filter(x=>x.automationKey===`low:${part.id}`).length;assert.equal(n,1);
    assert.equal(state.tasks.find(x=>x.automationKey===`low:${part.id}`).status,'Completed');
    await ok('stock',{productId:part.id,warehouse:wh,delta:-10,reason:'Consume components'});
    state=await ok('state');assert.equal(state.tasks.filter(x=>x.automationKey===`low:${part.id}`).length,1);assert.equal(state.tasks.find(x=>x.automationKey===`low:${part.id}`).status,'Pending');
  });
  await t.test('credit notes link to invoices and cannot over-credit',async()=>{
    state=await ok('state');invoice=state.documents.find(d=>d.id===invoice.id);
    const b={type:'Credit Note',customerId:invoice.customerId,companyId:invoice.companyId,sourceInvoiceId:invoice.id,due:'2026-10-30',taxMode:'CGST + SGST',lines:[{description:'Price adjustment',quantity:1,price:'50',tax:0}]};
    let credit=await ok('documents',b);credit=await ok('documents/status',{id:credit.id,version:credit.version,status:'Issued'});
    state=await ok('state');assert.equal(state.metrics.receivables,16864);assert.equal(state.documents.find(d=>d.id===invoice.id).credited,5000);
    assert.equal((await request('documents',{...b,lines:[{description:'Excess',quantity:1,price:'999',tax:0}]})).status,400);
    await ok('documents/status',{id:credit.id,version:credit.version,status:'Cancelled'});state=await ok('state');assert.equal(state.metrics.receivables,21864);
  });
  await t.test('sales order records transition through delivery',async()=>{
    state=await ok('state');let order=state.orders[0];assert.equal(order.status,'Confirmed');
    assert.equal((await request('orders/status',{id:order.id,version:order.version,status:'Delivered'})).status,400);
    for(const status of ['Packed','Dispatched','Delivered'])order=await ok('orders/status',{id:order.id,version:order.version,status,tracking:'TEST-TRACK'});
    assert.equal(order.history.length,4);assert.equal(order.status,'Delivered');
  });
  await t.test('CSV import rolls back all rows when one is invalid',async()=>{
    const rows=[{Name:'Import 1',SKU:'IMPORT-1',Type:'Part',Manufacturer:'Test',Quantity:'5'},{Name:'Import 2',SKU:'IMPORT-1',Type:'Part',Manufacturer:'Test'}];
    assert.equal((await request('products/import',{warehouse:wh,rows})).status,400);
    state=await ok('state');assert.equal(state.products.some(p=>p.sku==='IMPORT-1'),false);
    const r=await ok('products/import',{warehouse:wh,rows:rows.slice(0,1)});assert.equal(r.count,1);
  });
  await t.test('concurrent stock issues never oversell',async()=>{
    state=await ok('state');const imported=state.products.find(p=>p.sku==='IMPORT-1');
    const results=await Promise.all([1,2].map(()=>request('stock',{productId:imported.id,warehouse:wh,delta:-4,reason:'Concurrent order'})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);state=await ok('state');assert.equal(state.products.find(p=>p.id===imported.id).stock[wh],1);
  });
  await t.test('analytics and sharing stay tenant scoped and exports enforce roles',async()=>{
    const analytics=await ok('analytics?from=2026-01-01&to=2026-12-31');assert.ok(Number.isFinite(analytics.kpis.revenue));
    const isolated=await ok('analytics',null,otherCookie);assert.equal(isolated.documents.some(d=>d.id===invoice.id),false);
    assert.equal((await request('documents/share?id='+invoice.id,null,otherCookie)).status,404);
    const share=await ok('documents/share?id='+invoice.id);assert.ok(share.text.includes(invoice.number));assert.ok(!share.text.includes('127.0.0.1'));
    assert.equal((await request('analytics?from=not-a-date')).status,400);
    const viewEmail='view-analytics@example.com';await ok('users',{name:'Analytics Viewer',email:viewEmail,password,role:'viewer'});
    const view=await request('login',{email:viewEmail,password},'');assert.equal(view.status,200);
    assert.equal((await request('analytics',null,view.cookie)).status,200);
    assert.equal((await request('analytics?export=1',null,view.cookie)).status,403);
    assert.equal((await request('export-check',null,view.cookie)).status,403);
    assert.equal((await request('documents/share?id='+invoice.id,null,view.cookie)).status,403);
  });
  await t.test('logout invalidates session and recovery code rotates',async()=>{
    const login=await request('login',{email,password},'');await ok('logout',{},login.cookie);assert.equal((await request('state',null,login.cookie)).status,401);
    const reset=await request('recover',{email,recovery,password:'Replacement-Test!2026'},'');assert.equal(reset.status,200);assert.notEqual(reset.b.recovery,recovery);
    assert.equal((await request('state',null,ownerCookie)).status,401);assert.equal((await request('recover',{email,recovery,password},'')).status,400);
    const again=await request('login',{email,password:'Replacement-Test!2026'},'');ownerCookie=again.cookie;assert.equal(again.status,200);
  });
  await t.test('database persists across server restart',async()=>{
    processHandle.kill();await new Promise(resolve=>processHandle.once('exit',resolve));await start();state=await ok('state');assert.equal(state.products.length,3);assert.equal(state.payments.length,1);assert.ok(state.audit.length>10);
  });
});
