import {DatabaseSync} from 'node:sqlite';
import {existsSync,statSync,readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {checkMigrations} from './migrate.mjs';
const tables=['tenants','users','records','sessions','counters','idempotency','revisions','audit'];
const keys={tenants:['id'],users:['id'],records:['id'],sessions:['token'],counters:['tenant','prefix'],idempotency:['tenant','key'],revisions:['tenant','record_id','version']};
const columns={tenants:'id,name,created',users:'id,tenant,email,name,password,role,recovery,active',sessions:'token,user_id,expires',records:'id,tenant,kind,body,version,created,updated',audit:'id,tenant,actor,action,record_id,created',counters:'tenant,prefix,value',idempotency:'tenant,key,result',revisions:'tenant,record_id,kind,version,body,created,actor'};
const jsonFields=new Set(['body','result']);
export const canonical=v=>JSON.stringify(normalize(v));
function normalize(v){if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])]));return v;}
function normalized(row){return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,jsonFields.has(k)&&typeof v==='string'?JSON.parse(v):v]));}
const equal=(a,b)=>canonical(normalized(a))===canonical(normalized(b));
function fail(message){throw Object.assign(new Error(message),{safe:true});}
function fingerprint(file){return createHash('sha256').update(readFileSync(file)).digest('hex');}
export function readSnapshot(file){
 file=realpathSync(file);
 if(existsSync(file+'-wal')&&statSync(file+'-wal').size>0)fail('Source has a WAL file. Create a consistent SQLite backup first; the live source will not be imported.');
 const before=fingerprint(file),db=new DatabaseSync(file,{readOnly:true});
 try{
  if(db.prepare('PRAGMA integrity_check').all().some(r=>r.integrity_check!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)fail('Source integrity checks failed.');
  const schema=db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  if(!schema.some(r=>r.version===3)||schema.some(r=>r.version>3))fail('Unsupported SQLite schema. A reviewed copy-upgrade is required.');
  for(const table of tables){const actual=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name).sort();if(canonical(actual)!==canonical(columns[table].split(',').sort()))fail('Unsupported source table structure. No source changes were made.');}
  const rows=Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]));
  for(const row of rows.records){let body;try{body=JSON.parse(row.body);}catch{fail('Invalid JSON business record.');}if(!body||typeof body!=='object'||Array.isArray(body)||!Number.isSafeInteger(row.version)||row.version<1)fail('Invalid business record structure.');}
  return {file,fingerprint:before,rows,counts:Object.fromEntries(tables.map(k=>[k,rows[k].length]))};
 }finally{db.close();if(before!==fingerprint(file))fail('Source changed during inspection. Obtain a fresh consistent backup.');}
}
function merge(sources){
 const merged=Object.fromEntries(tables.map(t=>[t,[]]));const emails=new Map();
 for(const table of tables){if(table==='audit')continue;const seen=new Map();for(const source of sources)for(const row of source.rows[table]){const key=canonical(keys[table].map(k=>row[k]));if(seen.has(key)){if(!equal(seen.get(key),row))fail(`Conflicting ${table} rows across sources. No import performed; manual reconciliation is required.`);continue;}seen.set(key,row);merged[table].push(row);if(table==='users'){if(emails.has(row.email)&&emails.get(row.email)!==row.id)fail('The same email identifies different accounts across sources. Resolve explicitly before import.');emails.set(row.email,row.id);}}}
 validateReferences(merged);const tenants=new Set(merged.tenants.map(t=>t.id));for(const s of sources)for(const a of s.rows.audit)if(!tenants.has(a.tenant))fail('Audit entry references a missing tenant.');return merged;
}
function validateReferences(rows){
 const tenants=new Set(rows.tenants.map(t=>t.id)),users=new Map(rows.users.map(u=>[u.id,u])),records=new Map(rows.records.map(r=>[r.id,r]));
 for(const table of ['users','records','counters','idempotency','revisions'])for(const r of rows[table])if(!tenants.has(r.tenant))fail('Orphaned tenant reference.');
 for(const s of rows.sessions)if(!users.has(s.user_id))fail('Orphaned session.');
 const ref=(tenant,id,kind)=>{if(!id)return;const r=records.get(id);if(!r||r.tenant!==tenant||r.kind!==kind)fail('Missing or cross-workspace business reference.');};
 for(const r of rows.revisions)ref(r.tenant,r.record_id,r.kind);
 for(const r of rows.records){const b=JSON.parse(r.body),t=r.tenant;
  const mapping={documents:{customerId:'customers',companyId:'companies',warehouse:'warehouses',sourceInvoiceId:'documents',source:'documents',linkedInvoice:'documents'},payments:{documentId:'documents'},purchases:{supplierId:'suppliers',warehouse:'warehouses'},transactions:{productId:'products',warehouse:'warehouses'},bom:{productId:'products'},orders:{documentId:'documents',customerId:'customers'},receipts:{purchaseId:'purchases',warehouse:'warehouses'},supplierReturns:{purchaseId:'purchases',productId:'products'},supplierBills:{supplierId:'suppliers',purchaseId:'purchases'},supplierPayments:{billId:'supplierBills',supplierId:'suppliers'},approvals:{documentId:'documents'},recurring:{documentId:'documents'},jobs:{recordId:'documents'}};
  for(const [key,kind] of Object.entries(mapping[r.kind]||{}))ref(t,b[key],kind);
  if(['documents','purchases','orders','receipts'].includes(r.kind))for(const l of b.lines||[])ref(t,l.productId,'products');
  if(r.kind==='products')for(const w of Object.keys(b.stock||{}))ref(t,w,'warehouses');
  if(r.kind==='bom')for(const c of b.components||[])ref(t,c.productId,'products');
 }
}
export async function importSnapshots(db,paths,{verify=false}={}){
 const sources=paths.map(readSnapshot);if(!sources.length)fail('Supply at least one consistent SQLite snapshot.');if(new Set(sources.map(s=>s.fingerprint)).size!==sources.length)fail('The same source was supplied twice.');
 const rows=merge(sources);await checkMigrations(db);
 return db.transaction(async()=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('grow-high:import',0))");
  // Lock all application tables against concurrent writes throughout validation/import.
  await db.query('LOCK TABLE tenants,users,records,sessions,counters,idempotency,revisions,audit,import_sources,import_audit_map IN ACCESS EXCLUSIVE MODE');
  const previous=(await db.query('SELECT fingerprint FROM import_sources')).rows;
  if(!verify){if(previous.length|| (await db.query('SELECT COUNT(*)::int AS n FROM tenants')).rows[0].n)fail('Destination is not empty. Import refuses to overwrite or merge an existing database.');
   for(const table of tables)if((await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n)fail('Destination has existing records.');
   for(const table of tables){if(table==='audit')continue;for(const row of rows[table]){const cols=Object.keys(row);await db.query(`INSERT INTO ${table} (${cols.map(c=>'"'+c+'"').join(',')}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')})`,cols.map(k=>row[k]));}}
   for(const s of sources){await db.query('INSERT INTO import_sources VALUES($1,$2,$3)',[s.fingerprint,new Date().toISOString(),JSON.stringify(s.counts)]);for(const row of s.rows.audit){const {id,...rest}=row,cols=Object.keys(rest);const saved=await db.query(`INSERT INTO audit (${cols.join(',')}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,cols.map(k=>rest[k]));await db.query('INSERT INTO import_audit_map VALUES($1,$2,$3)',[s.fingerprint,id,saved.rows[0].id]);}}
  }
  for(const table of tables){if(table==='audit')continue;const target=(await db.query(`SELECT * FROM ${table}`)).rows;if(target.length!==rows[table].length)fail(`Reconciliation failed for ${table}: row count differs.`);const byKey=new Map(target.map(r=>[canonical(keys[table].map(k=>r[k])),r]));for(const row of rows[table]){const other=byKey.get(canonical(keys[table].map(k=>row[k])));if(!other||!equal(row,other))fail(`Reconciliation failed for ${table}: row contents differ.`);}}
  const manifests=(await db.query('SELECT fingerprint FROM import_sources')).rows;if(canonical(manifests.map(r=>r.fingerprint).sort())!==canonical(sources.map(s=>s.fingerprint).sort()))fail('Source manifest does not match.');
  const expectedAudit=sources.reduce((n,s)=>n+s.rows.audit.length,0);if((await db.query('SELECT COUNT(*)::int AS n FROM audit')).rows[0].n!==expectedAudit)fail('Audit count mismatch.');
  for(const s of sources){const imported=(await db.query('SELECT a.*,m.source_id FROM audit a JOIN import_audit_map m ON a.id=m.target_id WHERE m.source=$1',[s.fingerprint])).rows;const byId=new Map(imported.map(r=>[r.source_id,r]));for(const row of s.rows.audit){const other=byId.get(row.id);if(!other)fail('Audit mapping missing.');const {id,source_id,...rest}=other;const {id:old,...original}=row;if(!equal(rest,original))fail('Audit content differs.');}if(s.fingerprint!==fingerprint(s.file))fail('Source changed during migration.');}
  return {verified:true,sources:sources.length,counts:{...Object.fromEntries(tables.filter(k=>k!=='audit').map(k=>[k,rows[k].length])),audit:expectedAudit}};
 });
}
