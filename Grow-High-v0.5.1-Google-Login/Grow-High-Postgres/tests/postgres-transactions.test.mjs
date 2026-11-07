import './safety.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {openPostgres} from '../db/postgres.mjs';import {migrate,checkMigrations} from '../db/migrate.mjs';
test('separate connections serialize one tenant, preserve rollback, and allow another tenant',{skip:!process.env.GH_TEST_POSTGRES},async()=>{
 const a=openPostgres(),b=openPostgres();try{
  await migrate(a);await migrate(a);await checkMigrations(a);
  await a.query("INSERT INTO tenants VALUES('a','A','2026-10-27'),('b','B','2026-10-27'); INSERT INTO counters VALUES('a','INV',0),('b','INV',0)");
  await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).transaction(async()=>{const db=i%2?a:b;await db.lockTenant('a');const n=(await db.prepare('SELECT value FROM counters WHERE tenant=? AND prefix=?').get('a','INV')).value;await db.prepare('UPDATE counters SET value=? WHERE tenant=? AND prefix=?').run(n+1,'a','INV');})));
  assert.equal((await a.prepare('SELECT value FROM counters WHERE tenant=?').get('a')).value,12);
  await assert.rejects(a.transaction(async()=>{await a.lockTenant('a');await a.query("UPDATE counters SET value=999 WHERE tenant='a'");throw Error('rollback');}),/rollback/);
  assert.equal((await b.prepare('SELECT value FROM counters WHERE tenant=?').get('a')).value,12);
  await a.transaction(async()=>{await a.lockTenant('a');await b.transaction(async()=>{await b.lockTenant('b');await b.query("UPDATE counters SET value=value+1 WHERE tenant='b'");});await assert.rejects(a.lockTenant('b'),/switch workspaces/);});
  await a.query("UPDATE app_schema_migrations SET checksum='changed' WHERE version=1");await assert.rejects(checkMigrations(a));await assert.rejects(migrate(a));
 }finally{await a.close();await b.close();}
});
