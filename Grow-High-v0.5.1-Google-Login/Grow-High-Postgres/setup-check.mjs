import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {postgresConfig} from './db/config.mjs';
const root=import.meta.dirname;
const checks=[['Node.js 24',Number(process.versions.node.split('.')[0])===24],...['server.mjs','workflows.mjs','dist/workspace.html','db/migrations/001_initial.sql','db/migrations/002_import_audit.sql','POSTGRES-MIGRATION.md'].map(f=>[f,existsSync(path.join(root,f))])];
console.log('Grow High '+JSON.parse(readFileSync(path.join(root,'package.json'))).version+' — setup check');
if(process.env.DATABASE_URL){try{postgresConfig();checks.push(['PostgreSQL configuration format',true]);}catch{checks.push(['PostgreSQL configuration format (check URL, TLS and pool settings)',false]);}}
else checks.push(['SQLite selected; PostgreSQL not required',process.env.GH_REQUIRE_POSTGRES!=='1']);
for(const [label,pass] of checks)console.log((pass?'PASS':'FAIL')+' '+label);
console.log('This check does not connect to a database or verify deployment. Follow POSTGRES-MIGRATION.md for migration and testing.');
if(checks.some(([,pass])=>!pass))process.exitCode=1;
