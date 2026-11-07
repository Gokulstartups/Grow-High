import {readFileSync} from 'node:fs';
export function postgresConfig(env=process.env){
 let url;try{url=new URL(env.DATABASE_URL);}catch{throw Error('DATABASE_URL must be a valid PostgreSQL connection URL.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname.slice(1))throw Error('DATABASE_URL must specify PostgreSQL host and database.');
 // Configure TLS once, rather than letting URL options override certificate verification.
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])if(url.searchParams.has(key))throw Error('Configure TLS with GH_DB_SSL and GH_DB_CA_FILE instead of SSL URL parameters.');
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const mode=env.GH_DB_SSL||(local?'disable':'verify');
 if(!['disable','verify'].includes(mode))throw Error('GH_DB_SSL must be verify or disable.');
 const max=Number(env.GH_DB_POOL_SIZE||5);if(!Number.isInteger(max)||max<1||max>30)throw Error('GH_DB_POOL_SIZE must be 1–30.');
 return {connectionString:env.DATABASE_URL,max,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:30000,lock_timeout:10000,idle_in_transaction_session_timeout:60000,ssl:mode==='disable'?false:{rejectUnauthorized:true,...(env.GH_DB_CA_FILE?{ca:readFileSync(env.GH_DB_CA_FILE,'utf8')}:{})}};
}
