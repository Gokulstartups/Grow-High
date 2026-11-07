import pg from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
import {postgresConfig} from './config.mjs';
export function openPostgres(){
 const types={getTypeParser(oid,format){if([114,3802].includes(oid))return value=>value;if(oid===20)return value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Database integer exceeds safe range.');return n;};return pg.types.getTypeParser(oid,format);}};
 const pool=new pg.Pool({...postgresConfig(),types});pool.on('error',()=>console.error('Database pool connection interrupted.'));
 const scope=new AsyncLocalStorage();const query=(sql,args=[])=> (scope.getStore()?.client||pool).query(sql,args);
 return {kind:'postgres',query,
 prepare(sql){let n=0;const text=sql.replace(/\?/g,()=>'$'+(++n));return {get:async(...a)=>(await query(text,a)).rows[0],all:async(...a)=>(await query(text,a)).rows,run:async(...a)=>({changes:(await query(text,a)).rowCount})};},exec:async sql=>query(sql),
 async transaction(fn){if(scope.getStore())return fn();const client=await pool.connect();try{await client.query('BEGIN');return await scope.run({client,tenant:null},async()=>{try{const result=await fn();await client.query('COMMIT');return result;}catch(e){try{await client.query('ROLLBACK');}catch{}throw e;}});}finally{client.release();}},
 async lockTenant(tenant){const state=scope.getStore();if(!state)throw Error('Tenant lock requires a transaction.');if(state.tenant&&state.tenant!==tenant)throw Error('A transaction cannot switch workspaces.');if(state.tenant)return;await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[tenant]);state.tenant=tenant;},
 async close(){await pool.end();}};
}
