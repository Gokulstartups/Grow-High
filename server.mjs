import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {buildAnalytics} from './analytics.mjs';
import {answerBusinessQuestion} from './business-assistant.mjs';
import {createWorkflows} from './workflows.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const appVersion=JSON.parse(readFileSync(path.join(root,'package.json'))).version;
const port = Number(process.env.PORT || 4180);
const dataPath = process.env.GH_DATA_DIR || path.join(root, 'data');
mkdirSync(dataPath, {recursive:true});
const db = new DatabaseSync(path.join(dataPath, 'grow-high.sqlite'));
db.exec('PRAGMA busy_timeout=10000');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,tenant TEXT NOT NULL REFERENCES tenants(id),email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,recovery TEXT,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,tenant TEXT NOT NULL REFERENCES tenants(id),kind TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,updated TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tenant_records ON records(tenant,kind);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,record_id TEXT,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS counters(tenant TEXT NOT NULL,prefix TEXT NOT NULL,value INTEGER NOT NULL,PRIMARY KEY(tenant,prefix));
CREATE TABLE IF NOT EXISTS idempotency(tenant TEXT NOT NULL,key TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(tenant,key));`);
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied TEXT NOT NULL)');
if(!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get()){
  if(db.prepare('SELECT COUNT(*) AS count FROM records').get().count){
    const backupDir=path.join(dataPath,'backups');mkdirSync(backupDir,{recursive:true});
    db.prepare('VACUUM INTO ?').run(path.join(backupDir,'before-v03-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite'));
  }
  db.exec("CREATE TABLE IF NOT EXISTS revisions(tenant TEXT NOT NULL,record_id TEXT NOT NULL,kind TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,actor TEXT NOT NULL DEFAULT 'System',PRIMARY KEY(tenant,record_id,version))");
  db.exec("INSERT OR IGNORE INTO revisions(tenant,record_id,kind,version,body,created) SELECT tenant,id,kind,version,body,updated FROM records WHERE kind IN ('documents','expenses','purchases','orders','supplierBills')");
  db.prepare('INSERT INTO schema_migrations VALUES(3,?)').run(new Date().toISOString());
}
const now = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hash = s => createHash('sha256').update(s).digest('hex');
function passwordHash(password) {const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
function verify(password, encoded) {const [salt,key]=encoded.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64));}
function fail(message,status=400) {const e=new Error(message);e.status=status;throw e;}
function str(x,label,max=500,required=false) {if(typeof x!=='string'||x.length>max||(required&&!x.trim()))fail(`Enter a valid ${label}.`);return x.trim();}
function num(x,label,min=0,max=1000000000) {const n=Number(x);if(!Number.isSafeInteger(n)||n<min||n>max)fail(`Invalid ${label}. Use a whole number between ${min} and ${max}.`);return n;}
function money(x,label='amount') {if(!/^\d{1,10}(\.\d{1,2})?$/.test(String(x)))fail(`Invalid ${label}; use up to two decimal places.`);const [a,b='']=String(x).split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
function date(x,label='date') {if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x).toISOString().slice(0,10)!==x)fail(`Invalid ${label}.`);return x;}
function logo(value) {
  if(!value)return '';
  if(typeof value!=='string'||value.length>400000)fail('Company logo must be a PNG or JPEG smaller than 300 KB.');
  const match=value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)fail('Use a PNG or JPEG company logo.');
  const bytes=Buffer.from(match[2],'base64');if(bytes.length>300000||!bytes.length)fail('Logo is too large.');
  const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!valid)fail('Logo image content does not match its file type.');return value;
}
function tx(fn) {db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
function list(t,kind) {return db.prepare('SELECT * FROM records WHERE tenant=? AND kind=? ORDER BY created DESC').all(t,kind).map(unpack);}
function unpack(r) {return r?{...JSON.parse(r.body),id:r.id,version:r.version,created:r.created,updated:r.updated}:null;}
function get(t,id,kind) {const r=db.prepare('SELECT * FROM records WHERE tenant=? AND id=? AND kind=?').get(t,id,kind);if(!r)fail('Record not found.',404);return unpack(r);}
function revision(t,id,kind,version,body){if(['documents','expenses','purchases','orders','supplierBills'].includes(kind))db.prepare('INSERT INTO revisions(tenant,record_id,kind,version,body,created) VALUES(?,?,?,?,?,?)').run(t,id,kind,version,JSON.stringify(body),now());}
function insert(t,kind,b) {const id=randomUUID(),stamp=now();db.prepare('INSERT INTO records(id,tenant,kind,body,created,updated) VALUES(?,?,?,?,?,?)').run(id,t,kind,JSON.stringify(b),stamp,stamp);revision(t,id,kind,1,b);return get(t,id,kind);}
function update(t,id,kind,b,version) {get(t,id,kind);const {id:_,version:__,created:___,updated:____,...body}=b;const r=db.prepare('UPDATE records SET body=?,version=version+1,updated=? WHERE tenant=? AND id=? AND kind=? AND version=?').run(JSON.stringify(body),now(),t,id,kind,version);if(!r.changes)fail('This record changed. Refresh and try again.',409);revision(t,id,kind,version+1,body);return get(t,id,kind);}
function audit(u,action,id='') {db.prepare('INSERT INTO audit(tenant,actor,action,record_id,created) VALUES(?,?,?,?,?)').run(u.tenant,u.name,action,id,now());}
function sequence(t,prefix) {db.prepare('INSERT INTO counters VALUES(?,?,1) ON CONFLICT(tenant,prefix) DO UPDATE SET value=value+1').run(t,prefix);return `${prefix}-${String(db.prepare('SELECT value FROM counters WHERE tenant=? AND prefix=?').get(t,prefix).value).padStart(5,'0')}`;}
const allowed = {
  owner:['*'],administrator:['*'],manager:['inventory','contacts','documents','purchases','tasks','expenses','export'],
  inventory:['inventory','purchases','tasks'],finance:['documents','contacts','expenses','export','tasks'],viewer:[]
};
function authorize(u,area) {if(!allowed[u.role]?.some(x=>x==='*'||x===area))fail('Your role does not allow this action.',403);}
function unique(t,kind,field,value,except='') {if(list(t,kind).some(r=>r.id!==except&&String(r[field]).toLowerCase()===String(value).toLowerCase()))fail(`${field} already exists.`);}
function activity(u,title,record='',module='home',due=today(),priority='Normal',key='') {
  if(key&&list(u.tenant,'tasks').some(r=>r.automationKey===key))return;
  return insert(u.tenant,'tasks',{title,record,module,due,priority,status:'Pending',assignee:u.name,department:module,automationKey:key});
}
function automate(t) {
  const u={tenant:t,name:'Automation'};
  const settings=workflows.policy(t);
  const conditions=[
    ...list(t,'products').map(p=>({key:`low:${p.id}`,active:!p.archived&&Object.values(p.stock||{}).reduce((a,b)=>a+b,0)<=p.reorder,title:`Replenish ${p.name}`,record:p.id,module:'inventory',due:today()})),
    ...list(t,'documents').filter(d=>d.type==='Invoice').map(d=>({key:`overdue:${d.id}`,active:d.status==='Issued'&&d.due<today()&&d.paid+(d.credited||0)<d.total,title:`Follow up overdue ${d.number}`,record:d.id,module:'billing',due:d.due}))
  ];
  for(const c of conditions){
    if(c.key.startsWith('low:')&&!settings.lowStock||c.key.startsWith('overdue:')&&!settings.overdue)continue;
    const previous=list(t,'tasks').find(x=>x.automationKey===c.key);
    if(c.active&&!previous)activity(u,c.title,c.record,c.module,c.due,'High',c.key);
    else if(c.active&&previous?.autoResolved)update(t,previous.id,'tasks',{...previous,status:'Pending',autoResolved:false,due:c.due},previous.version);
    else if(!c.active&&previous&&!previous.autoResolved)update(t,previous.id,'tasks',{...previous,status:'Completed',autoResolved:true},previous.version);
  }
}
function stock(u,productId,warehouse,delta,reason,reference='') {
  const p=get(u.tenant,productId,'products');get(u.tenant,warehouse,'warehouses');num(delta,'stock change',-10000000,10000000);
  const balances={...p.stock};balances[warehouse]=(balances[warehouse]||0)+delta;if(balances[warehouse]<0)fail(`Insufficient stock for ${p.name}.`);
  update(u.tenant,p.id,'products',{...p,stock:balances},p.version);
  insert(u.tenant,'transactions',{productId,warehouse,delta,reason,reference,actor:u.name,date:today()});
}
function customValues(t,body,type) {
  const values={};
  for(const f of list(t,'fields').filter(f=>f.scope==='All'||f.scope===type)) {
    let v=body?.[f.id]??f.default??'';
    if(f.required&&(v===''||v===null))fail(`${f.name} is required.`);
    if(v!==''&&v!==null){
      if(['Number','Currency'].includes(f.type)){if(!Number.isFinite(Number(v)))fail(`Invalid ${f.name}.`);v=Number(v);}
      else if(f.type==='Date')v=date(v,f.name);
      else if(f.type==='Dropdown'){if(!f.options.includes(v))fail(`Invalid ${f.name}.`);}
      else if(f.type==='Boolean')v=v===true||v==='true';
      else v=str(String(v),f.name,500);
    }values[f.id]=v;
  }return values;
}
function documentBody(u,b,previous) {
  const types=['Quotation','Invoice','Proforma','Credit Note'];if(!types.includes(b.type))fail('Invalid document type.');
  const customer=get(u.tenant,b.customerId,'customers'),company=get(u.tenant,b.companyId,'companies');
  if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)fail('Add between 1 and 100 line items.');
  let subtotal=0,tax=0,total=0;
  const lines=b.lines.map(l=>{
    const product=l.productId?get(u.tenant,l.productId,'products'):null;
    const quantity=num(l.quantity,'quantity',1,100000),price=money(l.price,'unit price'),discount=num(l.discount||0,'discount percent',0,100),rate=num(l.tax||0,'tax percent',0,100);
    const base=Number((BigInt(quantity)*BigInt(price)*BigInt(100-discount)+50n)/100n);
    const lineTax=Number((BigInt(base)*BigInt(rate)+50n)/100n);
    if(!Number.isSafeInteger(base+lineTax)||base+lineTax>1e12)fail('Line total exceeds the supported limit.');
    subtotal+=base;tax+=lineTax;total+=base+lineTax;
    return {productId:product?.id||'',description:str(l.description||product?.name||'','description',250,true),quantity,price,discount,tax:rate,base,taxAmount:lineTax,total:base+lineTax,cost:product?.cost||0};
  });
  if(total>1e12)fail('Document total exceeds the supported limit.');
  const prefix={Quotation:'QUO',Invoice:'INV',Proforma:'PRO','Credit Note':'CRN'}[b.type];
  if(b.taxMode!=='IGST'&&b.taxMode!=='CGST + SGST')fail('Select a tax mode.');
  if(b.warehouse)get(u.tenant,b.warehouse,'warehouses');
  if(b.type==='Credit Note'){
    const source=get(u.tenant,b.sourceInvoiceId,'documents');
    if(source.type!=='Invoice'||source.status!=='Issued'||source.customerId!==customer.id||source.companyId!==company.id)fail('Select an issued invoice for the same customer and company.');
    if(total>source.total-source.paid-(source.credited||0))fail('The credit cannot exceed the unpaid invoice balance.');
  }
  return {type:b.type,number:previous?.number||sequence(u.tenant,prefix),customerId:customer.id,customer,companyId:company.id,company,lines,subtotal,tax,total,paid:0,credited:0,sourceInvoiceId:b.type==='Credit Note'?b.sourceInvoiceId:'',status:'Draft',date:date(b.date||today()),due:date(b.due),taxMode:b.taxMode,notes:str(b.notes||'','notes',3000),warehouse:b.warehouse||'',stockApplied:false,source:previous?.source||'',linkedInvoice:previous?.linkedInvoice||''};
}
const rateLimits=new Map();
function limit(key,max=25) {const stamp=Date.now();let bucket=rateLimits.get(key);if(!bucket||stamp-bucket.start>900000)bucket={start:stamp,count:0};bucket.count++;rateLimits.set(key,bucket);if(bucket.count>max)fail('Too many attempts. Please try again in 15 minutes.',429);}
function session(res,u,remember=false) {const token=randomBytes(32).toString('hex');const age=remember?604800:43200;db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),u.id,Date.now()+age*1000);res.setHeader('Set-Cookie',`gh_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`);}
function account(b,res,isDemo=false) {
  const email=str(b.email,'email',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email address.');
  if(typeof b.password!=='string'||b.password.length<10||b.password.length>128)fail('Use a password with 10–128 characters.');
  if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('An account with that email already exists.',409);
  const recovery=randomBytes(20).toString('hex'),tenant=randomUUID(),id=randomUUID();
  const u={id,tenant,email,name:str(b.name,'name',100,true),role:'owner'};
  db.prepare('INSERT INTO tenants VALUES(?,?,?)').run(tenant,str(b.company,'business name',150,true),now());
  db.prepare('INSERT INTO users(id,tenant,email,name,password,role,recovery) VALUES(?,?,?,?,?,?,?)').run(id,tenant,email,u.name,passwordHash(b.password),'owner',hash(recovery));
  insert(tenant,'companies',{name:b.company,address:'',email,phone:'',gstin:'',website:'',terms:'Payment due by the stated due date.'});
  insert(tenant,'warehouses',{name:'Main warehouse'});
  audit(u,isDemo?'Created isolated demo workspace':'Created workspace');
  if(isDemo)seed(u);
  session(res,u);return {user:u,recovery:isDemo?null:recovery};
}
function seed(u) {
  const t=u.tenant,wh=list(t,'warehouses')[0].id;
  const customer=insert(t,'customers',{name:'Meridian Technologies',email:'accounts@example.com',phone:'',address:'Chennai',gstin:'',segment:'Business'});
  insert(t,'suppliers',{name:'Summit Components',email:'supply@example.com',phone:'',address:'Bengaluru',gstin:''});
  for(const [name,sku,type,category,price,cost,qty,reorder] of [['Business Laptop i5','GH-LP-001','Product','Computers',5299900,4100000,24,5],['Wireless Keyboard','GH-KB-002','Product','Accessories',249900,140000,4,8],['USB-C Dock','GH-DK-003','Product','Accessories',599900,350000,16,5],['16GB DDR4 RAM','GH-RM-004','Part','Components',329900,220000,38,10],['Laptop Battery','GH-BT-005','Part','Components',449900,280000,3,6]]) {
    const p=insert(t,'products',{name,sku,type,category,price,cost,reorder,unit:'pcs',stock:{},custom:{},archived:false,expiry:'',batch:'',barcode:sku});
    stock(u,p.id,wh,qty,'Demo opening balance');
  }
  const p=list(t,'products').find(p=>p.sku==='GH-LP-001'),company=list(t,'companies')[0];
  const d=insert(t,'documents',documentBody(u,{type:'Quotation',customerId:customer.id,companyId:company.id,lines:[{productId:p.id,quantity:2,price:'52999',tax:18}],due:today(),taxMode:'CGST + SGST',warehouse:wh}));
  activity(u,'Review your first quotation',d.id,'billing',today(),'High');
  activity(u,'Call Meridian about their next order',customer.id,'customers');
  insert(t,'expenses',{description:'Demo office supplies',category:'Office',amount:185000,date:today(),reference:'DEMO-EXP-01'});
  automate(t);
}
async function body(req) {let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>512000)fail('Request too large.',413);}try{return JSON.parse(text||'{}');}catch{fail('Invalid JSON.');}}
function user(req) {
  const token=(req.headers.cookie||'').match(/(?:^|;\s*)gh_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token)fail('Please sign in.',401);
  const u=db.prepare('SELECT u.id,u.tenant,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(hash(token),Date.now());
  if(!u)fail('Your session expired. Please sign in.',401);return u;
}
function metrics(t) {
  const docs=list(t,'documents'),invoices=docs.filter(d=>d.type==='Invoice'&&d.status==='Issued'),credits=docs.filter(d=>d.type==='Credit Note'&&d.status==='Issued');
  const revenue=invoices.reduce((s,d)=>s+d.subtotal,0)-credits.reduce((s,d)=>s+d.subtotal,0);
  const received=list(t,'payments').reduce((s,p)=>s+p.amount,0),expenses=list(t,'expenses').reduce((s,e)=>s+e.amount,0);
  const cogs=invoices.reduce((s,d)=>s+d.lines.reduce((a,l)=>a+l.quantity*l.cost,0),0);
  return {revenue,received,expenses,cogs,operatingProfit:revenue-cogs-expenses,receivables:invoices.reduce((s,d)=>s+d.total-d.paid-(d.credited||0),0),stockValue:list(t,'products').filter(p=>!p.archived).reduce((s,p)=>s+Object.values(p.stock).reduce((a,b)=>a+b,0)*p.cost,0)};
}
const workflows=createWorkflows({db,get,list,insert,update,audit,authorize,fail,str,num,money,date,today,stock,sequence,now});
async function api(req,res,url) {
  const b=req.method==='POST'?await body(req):{}, route=url.pathname;
  if(route==='/api/register'&&req.method==='POST'){limit(req.socket.remoteAddress+':register',10);return tx(()=>account(b,res));}
  if(route==='/api/demo'&&req.method==='POST'){limit(req.socket.remoteAddress+':demo',15);return tx(()=>account({name:'Demo Owner',company:'Grow High Demo',email:`demo-${randomUUID()}@example.invalid`,password:randomBytes(24).toString('hex')},res,true));}
  if(route==='/api/login'&&req.method==='POST'){
    limit(req.socket.remoteAddress+':login',40);const email=str(b.email,'email',254,true).toLowerCase();limit(email+':login',15);
    const u=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
    if(typeof b.password!=='string'||b.password.length>128)fail('Email or password is incorrect.',401);
    const valid=u?verify(b.password,u.password):verify(b.password,dummyHash);
    if(!u||!valid)fail('Email or password is incorrect.',401);
    session(res,u,b.remember);return {ok:true};
  }
  if(route==='/api/recover'&&req.method==='POST'){
    limit(req.socket.remoteAddress+':recover',10);if(typeof b.password!=='string'||b.password.length<10||b.password.length>128)fail('Use a password with 10–128 characters.');
    const u=db.prepare('SELECT * FROM users WHERE email=? AND recovery=? AND active=1').get(String(b.email).toLowerCase(),hash(String(b.recovery)));
    if(!u)fail('Email or recovery code is incorrect.',400);
    return tx(()=>{const recovery=randomBytes(20).toString('hex');db.prepare('UPDATE users SET password=?,recovery=? WHERE id=?').run(passwordHash(b.password),hash(recovery),u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);audit(u,'Reset password with recovery code');return {recovery};});
  }
  const u=user(req),t=u.tenant;
  if(req.method==='POST')limit(u.id+':'+route,route==='/api/assistant'?60:500);
  if(route==='/api/logout'&&req.method==='POST'){const token=(req.headers.cookie||'').match(/gh_session=([a-f0-9]{64})/)?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));res.setHeader('Set-Cookie','gh_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return {ok:true};}
  if(route==='/api/state'&&req.method==='GET'){
    const kinds=['products','customers','suppliers','companies','warehouses','documents','payments','purchases','expenses','tasks','fields','transactions','bom','chat','preferences','orders','receipts','supplierReturns','supplierBills','supplierPayments','approvals','recurring','jobs','workflowSettings'];
    const result={serverVersion:appVersion,user:u,business:db.prepare('SELECT name FROM tenants WHERE id=?').get(t).name,metrics:metrics(t)};
    for(const kind of kinds)result[kind]=list(t,kind);
    result.audit=db.prepare('SELECT actor,action,record_id,created FROM audit WHERE tenant=? ORDER BY id DESC LIMIT 200').all(t);
    result.users=['owner','administrator'].includes(u.role)?db.prepare('SELECT id,name,email,role,active FROM users WHERE tenant=?').all(t):[];
    return result;
  }
  if(route==='/api/analytics'&&req.method==='GET'){
    limit(u.id+':analytics',250);if(url.searchParams.get('export')==='1')authorize(u,'export');
    const data=Object.fromEntries(['products','documents','expenses','purchases','orders'].map(k=>[k,list(t,k)]));
    try{return buildAnalytics(data,Object.fromEntries(url.searchParams),today());}catch(e){fail(e.message);}
  }
  if(route==='/api/export-check'&&req.method==='GET'){authorize(u,'export');return {ok:true};}
  if(route==='/api/documents/share'&&req.method==='GET'){
    authorize(u,'documents');const d=get(t,url.searchParams.get('id'),'documents');if(d.status==='Deleted')fail('Deleted drafts cannot be shared.');
    return {number:d.number,email:d.customer.email||'',phone:d.customer.phone||'',subject:d.type+' '+d.number+' from '+d.company.name,text:[d.company.name,d.type+' '+d.number+' ('+d.status+')','Customer: '+d.customer.name,'Date: '+d.date,'Due / valid until: '+d.due,...d.lines.map(l=>l.description+' x '+l.quantity+' = INR '+(l.total/100).toFixed(2)),'Total: INR '+(d.total/100).toFixed(2),'Please see the attached document for full details.'].join('\n')};
  }
  if(route==='/api/history'&&req.method==='GET'){
    const kind=url.searchParams.get('kind'),id=url.searchParams.get('id');if(!['documents','expenses','purchases','orders','supplierBills'].includes(kind))fail('Unsupported history type.');get(t,id,kind);
    return db.prepare('SELECT version,body,created,actor FROM revisions WHERE tenant=? AND record_id=? AND kind=? ORDER BY version DESC').all(t,id,kind).map(r=>({...r,body:JSON.parse(r.body)}));
  }
  if(route==='/api/export'&&req.method==='GET'){authorize(u,'export');audit(u,'Exported workspace JSON');const records=db.prepare('SELECT kind,body,created,updated FROM records WHERE tenant=?').all(t).map(r=>({...r,body:JSON.parse(r.body)}));return {format:'grow-high-export-v1',exported:now(),records};}
  if(req.method!=='POST')fail('Not found.',404);
  return tx(()=>{
    let result;
    const extension=workflows.handle(u,route,b);if(extension!==undefined){automate(t);return extension;}
    if(route==='/api/products/import'){
      authorize(u,'inventory');if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>500)fail('Import between 1 and 500 rows.');
      get(t,b.warehouse,'warehouses');const imported=[];
      for(const row of b.rows){
        const type=row.Type||'Product';if(!['Product','Part'].includes(type))fail('Type must be Product or Part.');
        const sku=str(row.SKU,'SKU',80,true);unique(t,'products','sku',sku);
        const custom={};for(const f of list(t,'fields'))if(row[f.name]!==undefined)custom[f.id]=row[f.name];
        const p=insert(t,'products',{name:str(row.Name,'name',150,true),sku,type,category:str(row.Category||'','category',80),price:money(row.Price||'0'),cost:money(row.Cost||'0'),reorder:num(row.Reorder||0,'reorder level'),unit:str(row.Unit||'pcs','unit',25),stock:{},custom:customValues(t,custom,type),archived:false,barcode:str(row.Barcode||sku,'barcode',100),batch:str(row.Batch||'','batch',80),expiry:row.Expiry?date(row.Expiry):''});
        const opening=num(row.Quantity||0,'opening quantity');if(opening)stock(u,p.id,b.warehouse,opening,'CSV opening balance');
        imported.push(p.id);
      }
      result={count:imported.length};audit(u,`Imported ${imported.length} inventory items`);
    }else if(route==='/api/products'){
      authorize(u,'inventory');const previous=b.id?get(t,b.id,'products'):null;
      const type=['Product','Part'].includes(b.type)?b.type:fail('Select Product or Part.');
      const sku=str(b.sku,'SKU',80,true);unique(t,'products','sku',sku,b.id);
      const p={name:str(b.name,'name',150,true),sku,type,category:str(b.category||'','category',80),unit:str(b.unit||'pcs','unit',25),price:money(b.price,'selling price'),cost:money(b.cost,'cost'),reorder:num(b.reorder||0,'reorder level'),stock:previous?.stock||{},custom:customValues(t,b.custom,type),barcode:str(b.barcode||sku,'barcode',100),batch:str(b.batch||'','batch',80),expiry:b.expiry?date(b.expiry):'',archived:previous?.archived||false};
      result=previous?update(t,b.id,'products',p,b.version):insert(t,'products',p);audit(u,`${previous?'Updated':'Created'} ${type.toLowerCase()} ${p.name}`,result.id);
    }else if(route==='/api/products/archive'){authorize(u,'inventory');const p=get(t,b.id,'products');result=update(t,p.id,'products',{...p,archived:!p.archived},b.version);audit(u,`${result.archived?'Archived':'Restored'} ${p.name}`,p.id);
    }else if(route==='/api/stock'){authorize(u,'inventory');const delta=num(b.delta,'quantity change',-10000000,10000000);if(!delta)fail('Quantity change cannot be zero.');stock(u,b.productId,b.warehouse,delta,str(b.reason,'reason',250,true));audit(u,'Recorded stock movement',b.productId);result={ok:true};
    }else if(route==='/api/transfer'){authorize(u,'inventory');if(b.from===b.to)fail('Select different warehouses.');const quantity=num(b.quantity,'quantity',1);stock(u,b.productId,b.from,-quantity,'Transfer out',b.to);stock(u,b.productId,b.to,quantity,'Transfer in',b.from);audit(u,'Transferred stock',b.productId);result={ok:true};
    }else if(route==='/api/bom'){
      authorize(u,'inventory');const product=get(t,b.productId,'products');if(product.type!=='Product')fail('Select a finished product.');if(!Array.isArray(b.components)||!b.components.length)fail('Add components.');
      const seen=new Set();const components=b.components.map(c=>{const p=get(t,c.productId,'products');if(p.type!=='Part'||seen.has(p.id))fail('Use distinct parts.');seen.add(p.id);return {productId:p.id,quantity:num(c.quantity,'component quantity',1)};});
      const prev=list(t,'bom').find(x=>x.productId===product.id);result=prev?update(t,prev.id,'bom',{productId:product.id,components},prev.version):insert(t,'bom',{productId:product.id,components});audit(u,'Updated bill of materials',product.id);
    }else if(route==='/api/assemble'){
      authorize(u,'inventory');const bom=list(t,'bom').find(x=>x.productId===b.productId);if(!bom)fail('Configure the bill of materials first.');const quantity=num(b.quantity,'quantity',1,10000);
      for(const c of bom.components)stock(u,c.productId,b.warehouse,-quantity*c.quantity,'Assembly component',b.productId);stock(u,b.productId,b.warehouse,quantity,'Assembly output');audit(u,'Completed assembly',b.productId);result={ok:true};
    }else if(route==='/api/fields'){
      authorize(u,'settings');const prev=b.id?get(t,b.id,'fields'):null;const name=str(b.name,'field name',60,true);unique(t,'fields','name',name,b.id);
      if(!['Text','Number','Currency','Date','Dropdown','Boolean'].includes(b.type))fail('Unsupported field type.');if(prev&&prev.type!==b.type)fail('Create a new field to change its type without damaging existing data.');
      if(!['All','Product','Part'].includes(b.scope))fail('Invalid scope.');
      const options=String(b.options||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,50);if(b.type==='Dropdown'&&!options.length)fail('Add dropdown options.');
      if(prev&&list(t,'products').some(p=>p.custom?.[prev.id]!==undefined&&p.custom[prev.id]!==''&&b.type==='Dropdown'&&!options.includes(p.custom[prev.id])))fail('Existing products use an option you removed.');
      const f={name,type:b.type,scope:b.scope,required:!!b.required,options,hidden:!!b.hidden,order:num(b.order||0,'order',0,1000),default:str(b.default||'','default',200)};
      result=prev?update(t,prev.id,'fields',f,b.version):insert(t,'fields',f);audit(u,'Configured custom field',result.id);
    }else if(route==='/api/contacts'){
      authorize(u,'contacts');if(!['customers','suppliers'].includes(b.kind))fail('Invalid contact type.');
      const item={name:str(b.name,'name',150,true),email:str(b.email||'','email',254),phone:str(b.phone||'','phone',40),address:str(b.address||'','address',1000),gstin:str(b.gstin||'','GSTIN',30),segment:str(b.segment||'','segment',80)};
      result=b.id?update(t,b.id,b.kind,item,b.version):insert(t,b.kind,item);audit(u,`Saved ${b.kind.slice(0,-1)} ${item.name}`,result.id);
    }else if(route==='/api/companies'){
      authorize(u,'settings');const item={name:str(b.name,'company name',150,true),address:str(b.address||'','address',1000),email:str(b.email||'','email',254),phone:str(b.phone||'','phone',40),gstin:str(b.gstin||'','GSTIN',30),website:str(b.website||'','website',200),terms:str(b.terms||'','terms',3000),bank:str(b.bank||'','payment instructions',1000),signatory:str(b.signatory||'','signatory',150)};
      item.logo=logo(b.logo);result=b.id?update(t,b.id,'companies',item,b.version):insert(t,'companies',item);audit(u,'Saved company profile',result.id);
    }else if(route==='/api/warehouses'){
      authorize(u,'settings');const name=str(b.name,'warehouse name',100,true);unique(t,'warehouses','name',name);result=insert(t,'warehouses',{name});audit(u,'Added warehouse',result.id);
    }else if(route==='/api/documents'){
      authorize(u,'documents');const prev=b.id?get(t,b.id,'documents'):null;if(prev&&prev.status!=='Draft')fail('Only drafts can be edited.');if(prev&&prev.type!==b.type)fail('Document type cannot change.');const d=documentBody(u,b,prev);result=prev?update(t,prev.id,'documents',d,b.version):insert(t,'documents',d);audit(u,`Saved ${d.number}`,result.id);
    }else if(route==='/api/documents/status'){
      authorize(u,'documents');const d=get(t,b.id,'documents');if(d.version!==b.version)fail('Refresh this document before changing it.',409);
      const transitions=d.type==='Quotation'?{Draft:['Sent','Cancelled'],Sent:['Accepted','Rejected','Cancelled'],Accepted:['Cancelled']}:{Draft:['Issued','Cancelled'],Issued:['Cancelled']};
      if(!transitions[d.status]?.includes(b.status))fail('Invalid document status transition.');
      if(b.status==='Cancelled'&&(d.paid>0||d.credited>0||d.linkedInvoice))fail('Cannot cancel a paid, credited, or converted document.');
      if(d.type==='Credit Note'){
        const source=get(t,d.sourceInvoiceId,'documents');
        if(b.status==='Issued'){
          if(source.status!=='Issued'||d.total>source.total-source.paid-(source.credited||0))fail('Credit exceeds the remaining invoice balance.');
          update(t,source.id,'documents',{...source,credited:(source.credited||0)+d.total},source.version);
        }else if(b.status==='Cancelled'&&d.status==='Issued')update(t,source.id,'documents',{...source,credited:(source.credited||0)-d.total},source.version);
      }
      if(d.type==='Invoice'&&b.status==='Issued'){
        workflows.requireApproval(u,d);
        if(!d.warehouse&&d.lines.some(l=>l.productId))fail('Choose a warehouse before issuing this invoice.');
        for(const l of d.lines.filter(l=>l.productId))stock(u,l.productId,d.warehouse,-l.quantity,'Invoice issued',d.number);
        d.stockApplied=true;
      }
      if(d.stockApplied&&b.status==='Cancelled'){for(const l of d.lines.filter(l=>l.productId))stock(u,l.productId,d.warehouse,l.quantity,'Invoice cancelled',d.number);d.stockApplied=false;}
      result=update(t,d.id,'documents',{...d,status:b.status},d.version);
      if(b.status==='Accepted'){
        activity(u,`Fulfil accepted ${d.number}`,d.id,'billing',d.due,'High',`accepted:${d.id}`);
        insert(t,'orders',{number:sequence(t,'SO'),documentId:d.id,documentNumber:d.number,customer:d.customer.name,customerId:d.customerId,lines:d.lines,due:d.due,status:'Confirmed',tracking:'',history:[{status:'Confirmed',date:now(),actor:u.name}]});
      }
      audit(u,`${b.status} ${d.number}`,d.id);
    }else if(route==='/api/documents/convert'){
      authorize(u,'documents');const d=get(t,b.id,'documents');if(d.type!=='Quotation'||d.status!=='Accepted'||d.linkedInvoice)fail('Only an accepted, unconverted quotation can be converted.');
      const {id,version,created,updated,...copy}=d;result=insert(t,'documents',{...copy,type:'Invoice',number:sequence(t,'INV'),status:'Draft',source:id,linkedInvoice:'',date:today()});update(t,id,'documents',{...d,status:'Converted',linkedInvoice:result.id},d.version);audit(u,`Converted ${d.number} to ${result.number}`,result.id);
    }else if(route==='/api/documents/duplicate'){
      authorize(u,'documents');const d=get(t,b.id,'documents'),{id,version,created,updated,...copy}=d;
      result=insert(t,'documents',{...copy,number:sequence(t,{Invoice:'INV',Quotation:'QUO',Proforma:'PRO','Credit Note':'CRN'}[d.type]),status:'Draft',paid:0,credited:0,stockApplied:false,source:'',linkedInvoice:'',date:today()});audit(u,`Duplicated ${d.number}`,result.id);
    }else if(route==='/api/payments'){
      authorize(u,'documents');const key=str(b.key,'request key',100,true);const existing=db.prepare('SELECT result FROM idempotency WHERE tenant=? AND key=?').get(t,key);if(existing)return JSON.parse(existing.result);
      const d=get(t,b.documentId,'documents');if(d.type!=='Invoice'||d.status!=='Issued')fail('Payments require an issued invoice.');
      const amount=money(b.amount);if(amount<=0||amount>d.total-d.paid-(d.credited||0))fail('Payment must be positive and cannot exceed the balance.');const reference=str(b.reference,'payment reference',100,true);unique(t,'payments','reference',reference);
      result=insert(t,'payments',{documentId:d.id,number:d.number,amount,date:date(b.date||today()),reference,method:str(b.method||'Bank transfer','method',50)});
      update(t,d.id,'documents',{...d,paid:d.paid+amount},d.version);db.prepare('INSERT INTO idempotency VALUES(?,?,?)').run(t,key,JSON.stringify(result));audit(u,`Recorded payment for ${d.number}`,d.id);
    }else if(route==='/api/purchases'){
      authorize(u,'purchases');const supplier=get(t,b.supplierId,'suppliers');get(t,b.warehouse,'warehouses');if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)fail('Add between 1 and 100 purchase lines.');
      const lines=b.lines.map(l=>{const p=get(t,l.productId,'products');return {productId:p.id,name:p.name,quantity:num(l.quantity,'quantity',1,100000),cost:money(l.cost,'cost')};});
      const total=lines.reduce((s,l)=>s+l.quantity*l.cost,0);if(!Number.isSafeInteger(total)||total>1e12)fail('Purchase total exceeds the supported limit.');
      result=insert(t,'purchases',{number:sequence(t,'PO'),supplierId:supplier.id,supplier:supplier.name,warehouse:b.warehouse,lines,total,due:date(b.due),status:'Ordered'});audit(u,`Created ${result.number}`,result.id);
    }else if(route==='/api/orders/status'){
      authorize(u,'inventory');const order=get(t,b.id,'orders');const transitions={Confirmed:['Packed','Cancelled'],Packed:['Dispatched','Cancelled'],Dispatched:['Delivered']};
      if(!transitions[order.status]?.includes(b.status))fail('Invalid order transition.');
      result=update(t,order.id,'orders',{...order,status:b.status,tracking:str(b.tracking||order.tracking||'','tracking',200),history:[...order.history,{status:b.status,date:now(),actor:u.name}]},b.version);
      audit(u,`${b.status} ${order.number}`,order.id);
      if(b.status==='Delivered')for(const task of list(t,'tasks').filter(x=>x.automationKey===`accepted:${order.documentId}`&&x.status==='Pending'))update(t,task.id,'tasks',{...task,status:'Completed'},task.version);
    }else if(route==='/api/expenses'){
      authorize(u,'expenses');const amount=money(b.amount);if(!amount)fail('Enter a positive expense.');
      result=insert(t,'expenses',{description:str(b.description,'description',200,true),category:str(b.category,'category',80,true),amount,date:date(b.date),reference:str(b.reference||'','reference',100)});audit(u,'Recorded expense',result.id);
    }else if(route==='/api/tasks'){
      authorize(u,'tasks');const prev=b.id?get(t,b.id,'tasks'):null;
      if(!['Pending','Completed'].includes(b.status||'Pending'))fail('Invalid activity status.');
      result=prev?update(t,prev.id,'tasks',{...prev,status:b.status},b.version):insert(t,'tasks',{title:str(b.title,'title',200,true),due:date(b.due),priority:['Normal','High','Low'].includes(b.priority)?b.priority:'Normal',assignee:str(b.assignee||u.name,'assignee',100),department:str(b.department||'Operations','department',80),status:'Pending',module:'home',record:''});audit(u,'Updated activity',result.id);
    }else if(route==='/api/users'){
      authorize(u,'settings');if(!['owner','administrator'].includes(u.role))fail('Administrator access required.',403);
      if(b.id){const target=db.prepare('SELECT * FROM users WHERE id=? AND tenant=?').get(b.id,t);if(!target)fail('User not found.',404);if(target.role==='owner')fail('The workspace owner cannot be modified here.');if(!Object.keys(allowed).filter(x=>x!=='owner').includes(b.role))fail('Invalid role.');db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(b.role,b.active===false?0:1,b.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(b.id);result={ok:true};
      }else{const email=str(b.email,'email',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Invalid email.');if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('Email already exists.');if(typeof b.password!=='string'||b.password.length<10||b.password.length>128)fail('Use a password with 10–128 characters.');if(!Object.keys(allowed).filter(x=>x!=='owner').includes(b.role))fail('Invalid role.');db.prepare('INSERT INTO users(id,tenant,email,name,password,role) VALUES(?,?,?,?,?,?)').run(randomUUID(),t,email,str(b.name,'name',100,true),passwordHash(b.password),b.role);result={ok:true};}audit(u,'Updated team access');
    }else if(route==='/api/preferences'){
      const prev=list(t,'preferences').find(p=>p.userId===u.id);const item={userId:u.id,columns:Array.isArray(b.columns)?b.columns.filter(x=>typeof x==='string').slice(0,100):[]};result=prev?update(t,prev.id,'preferences',item,prev.version):insert(t,'preferences',item);
    }else if(route==='/api/assistant'){
      const question=str(b.question,'question',1000,true),data=Object.fromEntries(['products','customers','suppliers','documents','expenses','purchases','orders','tasks'].map(k=>[k,list(t,k)]));
      let response;try{response=answerBusinessQuestion(data,question,today());}catch(e){fail(e.message);}
      result=insert(t,'chat',{question,...response,engine:'Local business analysis · calculated workspace records'});audit(u,'Queried business assistant');
    }else fail('Not found.',404);
    automate(t);return result;
  });
}
const dummyHash=passwordHash(randomBytes(32).toString('hex'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Grow-High','local');res.setHeader('X-Grow-High-Version',appVersion);res.setHeader('X-Grow-High-Instance',hash(root+'|'+path.resolve(dataPath)+'|'+appVersion).slice(0,16));
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const expected=`127.0.0.1:${port}`;if(req.headers.host!==expected&&req.headers.host!==`localhost:${port}`)fail('Invalid host.',403);
    const url=new URL(req.url,`http://${expected}`);
    if(url.pathname.startsWith('/api/')){
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
      if(req.method==='POST'){if(req.headers.origin!==`http://${req.headers.host}`)fail('Request origin rejected.',403);if(!req.headers['content-type']?.startsWith('application/json'))fail('JSON required.',415);}
      const result=await api(req,res,url);res.end(JSON.stringify(result));return;
    }
    if(!['GET','HEAD'].includes(req.method))fail('Method not allowed.',405);
    const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');
    const target=path.resolve(root,'dist',file);
    if(!target.startsWith(path.resolve(root,'dist')+path.sep)||!existsSync(target))fail('Not found.',404);
    res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(req.method==='HEAD'?'':readFileSync(target));
  }catch(e){res.statusCode=e.status||500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.status?e.message:'The request could not be completed.'}));if(!e.status)console.error('Server error:',e.code||e.name);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Grow High is ready at http://127.0.0.1:${port}`));
const timer=setInterval(()=>{try{for(const t of db.prepare('SELECT id FROM tenants').all())tx(()=>{automate(t.id);workflows.runRecurring(t.id);});db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());for(const [key,b] of rateLimits)if(Date.now()-b.start>900000)rateLimits.delete(key);}catch{console.error('Background activity update failed.');}},60000);
timer.unref();
process.on('SIGTERM',()=>{clearInterval(timer);server.close(()=>{db.close();process.exit(0);});});
