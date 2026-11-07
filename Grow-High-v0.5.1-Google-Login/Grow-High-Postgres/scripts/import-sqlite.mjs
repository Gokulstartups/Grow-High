import {openPostgres} from '../db/postgres.mjs';
import {importSnapshots} from '../db/import-sqlite.mjs';
const args=process.argv.slice(2),verify=args.includes('--verify'),paths=args.filter(a=>!a.startsWith('--'));
let db;try{if(!verify&&!args.includes('--confirm-empty-target'))throw Object.assign(Error('Import requires --confirm-empty-target. Keep the destination application stopped.'),{safe:true});db=openPostgres();console.log(JSON.stringify(await importSnapshots(db,paths,{verify}),null,2));}catch(e){console.error(e.safe?e.message:'Migration stopped; no partial import was committed. Check source compatibility and destination connectivity.');process.exitCode=1;}finally{await db?.close();}
