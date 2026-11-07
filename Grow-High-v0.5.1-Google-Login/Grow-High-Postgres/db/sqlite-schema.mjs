import {mkdirSync} from 'node:fs';
import path from 'node:path';
export function initializeSQLite(db,dataPath){


db.exec('PRAGMA busy_timeout=10000');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,tenant TEXT NOT NULL REFERENCES tenants(id),email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,recovery TEXT,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,tenant TEXT NOT NULL REFERENCES tenants(id),kind TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,updated TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tenant_records ON records(tenant,kind);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,record_id TEXT,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS counters(tenant TEXT NOT NULL,prefix TEXT NOT NULL,value INTEGER NOT NULL,PRIMARY KEY(tenant,prefix));
CREATE TABLE IF NOT EXISTS idempotency(tenant TEXT NOT NULL,key TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(tenant,key));`);
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied TEXT NOT NULL)');
if(!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get()){
  if(db.prepare('SELECT COUNT(*) AS count FROM records').get().count){
    const backupDir=path.join(dataPath,'backups');mkdirSync(backupDir,{recursive:true});
    db.prepare('VACUUM INTO ?').run(path.join(backupDir,'before-v03-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite'));
  }
  db.exec("CREATE TABLE IF NOT EXISTS revisions(tenant TEXT NOT NULL,record_id TEXT NOT NULL,kind TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,actor TEXT NOT NULL DEFAULT 'System',PRIMARY KEY(tenant,record_id,version))");
  db.exec("INSERT OR IGNORE INTO revisions(tenant,record_id,kind,version,body,created) SELECT tenant,id,kind,version,body,updated FROM records WHERE kind IN ('documents','expenses','purchases','orders','supplierBills')");
  db.prepare('INSERT INTO schema_migrations VALUES(3,?)').run(new Date().toISOString());
}

}
