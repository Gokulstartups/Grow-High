import {openPostgres} from '../db/postgres.mjs';
import {migrate} from '../db/migrate.mjs';
let db;try{db=openPostgres();await migrate(db);console.log('Database migrations are up to date.');}catch(e){console.error('Failure code:',e.code||e.name);console.error('Migration failed. Check database access and migration compatibility; credentials are not logged.');process.exitCode=1;}finally{await db?.close();}
