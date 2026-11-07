import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
const [source,destination]=process.argv.slice(2);let db;
try{if(!source||!destination||!existsSync(source)||existsSync(destination)||realpathSync(source)===path.resolve(destination))throw Error();db=new DatabaseSync(source,{readOnly:true});await backup(db,path.resolve(destination));console.log('Consistent SQLite snapshot created. Keep it private and retain the original database.');}catch{console.error('Backup failed. Supply an existing source and a new destination filename in an existing directory.');process.exitCode=1;}finally{db?.close();}
