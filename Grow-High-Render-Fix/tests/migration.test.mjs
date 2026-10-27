import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
test('existing database upgrade creates a restorable snapshot and keeps records',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'gh-migration-')),filename=path.join(dir,'grow-high.sqlite');
 const db=new DatabaseSync(filename);
 db.exec("CREATE TABLE records(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,updated TEXT NOT NULL)");
 db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run('expense-1','tenant-1','expenses',JSON.stringify({description:'Preserved record',amount:100}),4,'2026-10-20','2026-10-21');db.close();
 const child=spawn(process.execPath,['server.mjs'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,PORT:'14184',GH_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 try {await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);child.stdout.on('data',d=>{if(String(d).includes('ready')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Exit '+code));});});
 const live=new DatabaseSync(filename);assert.equal(live.prepare('SELECT version FROM records').get().version,4);assert.equal(live.prepare('SELECT version FROM revisions').get().version,4);assert.equal(live.prepare('SELECT version FROM schema_migrations').get().version,3);live.close();
 const files=readdirSync(path.join(dir,'backups'));assert.equal(files.length,1);const backup=new DatabaseSync(path.join(dir,'backups',files[0]));assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(JSON.parse(backup.prepare('SELECT body FROM records').get().body).description,'Preserved record');backup.close();
 }finally{const exited=once(child,'exit');child.kill();await exited;}
});
