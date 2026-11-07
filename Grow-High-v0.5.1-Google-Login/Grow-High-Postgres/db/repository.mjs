import {randomUUID} from 'node:crypto';
export function createRepository(db,{fail,now}){
async function list(t, kind) {
  return (await db.prepare('SELECT * FROM records WHERE tenant=? AND kind=? ORDER BY created DESC').all(t, kind)).map(unpack);
}
function unpack(r) {
  return r ? {
    ...JSON.parse(r.body),
    id: r.id,
    version: r.version,
    created: r.created,
    updated: r.updated
  } : null;
}
async function get(t, id, kind) {
  const r = await db.prepare('SELECT * FROM records WHERE tenant=? AND id=? AND kind=?').get(t, id, kind);
  if (!r) fail('Record not found.', 404);
  return unpack(r);
}
async function revision(t, id, kind, version, body) {
  if (['documents', 'expenses', 'purchases', 'orders', 'supplierBills'].includes(kind)) await db.prepare('INSERT INTO revisions(tenant,record_id,kind,version,body,created) VALUES(?,?,?,?,?,?)').run(t, id, kind, version, JSON.stringify(body), now());
}
async function insert(t, kind, b) {
  const id = randomUUID(),
    stamp = now();
  await db.prepare('INSERT INTO records(id,tenant,kind,body,created,updated) VALUES(?,?,?,?,?,?)').run(id, t, kind, JSON.stringify(b), stamp, stamp);
  await revision(t, id, kind, 1, b);
  return await get(t, id, kind);
}
async function update(t, id, kind, b, version) {
  await get(t, id, kind);
  const {
    id: _,
    version: __,
    created: ___,
    updated: ____,
    ...body
  } = b;
  const r = await db.prepare('UPDATE records SET body=?,version=version+1,updated=? WHERE tenant=? AND id=? AND kind=? AND version=?').run(JSON.stringify(body), now(), t, id, kind, version);
  if (!r.changes) fail('This record changed. Refresh and try again.', 409);
  await revision(t, id, kind, version + 1, body);
  return await get(t, id, kind);
}
async function audit(u, action, id = '') {
  await db.prepare('INSERT INTO audit(tenant,actor,action,record_id,created) VALUES(?,?,?,?,?)').run(u.tenant, u.name, action, id, now());
}
async function sequence(t, prefix) {
  await db.prepare('INSERT INTO counters VALUES(?,?,1) ON CONFLICT(tenant,prefix) DO UPDATE SET value=counters.value+1').run(t, prefix);
  return `${prefix}-${String((await db.prepare('SELECT value FROM counters WHERE tenant=? AND prefix=?').get(t, prefix)).value).padStart(5, '0')}`;
}
return {list,get,insert,update,audit,sequence};
}
