import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {initializeSQLite} from './sqlite-schema.mjs';
export function openSQLite(dataPath){
 mkdirSync(dataPath,{recursive:true});const raw=new DatabaseSync(path.join(dataPath,'grow-high.sqlite'));initializeSQLite(raw,dataPath);
 const scope=new AsyncLocalStorage();let queue=Promise.resolve();
 return {kind:'sqlite',prepare(sql){const s=raw.prepare(sql);return {get:async(...a)=>s.get(...a),all:async(...a)=>s.all(...a),run:async(...a)=>s.run(...a)};},exec:async sql=>raw.exec(sql),lockTenant:async()=>{},
 async transaction(fn){if(scope.getStore())return fn();let release;const next=new Promise(r=>release=r),prior=queue;queue=next;await prior;try{raw.exec('BEGIN IMMEDIATE');return await scope.run(true,async()=>{try{const value=await fn();raw.exec('COMMIT');return value;}catch(e){raw.exec('ROLLBACK');throw e;}});}finally{release();}},
 async close(){await queue;raw.close();}};
}
