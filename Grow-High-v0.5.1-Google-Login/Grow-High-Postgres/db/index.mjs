import {openSQLite} from './sqlite.mjs';
import {openPostgres} from './postgres.mjs';
import {checkMigrations} from './migrate.mjs';
export async function openDatabase({dataPath}){
 if(process.env.DATABASE_URL){const db=openPostgres();try{await checkMigrations(db);return db;}catch{await db.close();throw Error('PostgreSQL startup failed. Check connectivity and run npm run db:migrate. No SQLite fallback was used.');}}
 if(process.env.GH_REQUIRE_POSTGRES==='1')throw Error('DATABASE_URL is required. SQLite fallback is disabled.');
 return openSQLite(dataPath);
}
