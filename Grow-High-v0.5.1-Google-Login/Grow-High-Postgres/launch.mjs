import {spawn} from 'node:child_process';
import {mkdirSync,openSync,writeFileSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=import.meta.dirname,data=path.resolve(process.env.GH_DATA_DIR||path.join(root,'data')),version=JSON.parse(readFileSync(path.join(root,'package.json'))).version;
const instance=createHash('sha256').update(root+'|'+data+'|'+version).digest('hex').slice(0,16);
let port=Number(process.env.PORT||4181),url;
if(!Number.isInteger(port)||port<1024||port>65525)throw Error('Use a port between 1024 and 65525.');
if(Number(process.versions.node.split('.')[0])<24){console.error('Grow High requires Node.js 24 or later.');process.exit(1);}
async function ready(){try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});return r.headers.get('x-grow-high-version')===version&&r.headers.get('x-grow-high-instance')===instance;}catch{return false;}}
async function available(p){return new Promise(resolve=>{const probe=createServer();probe.once('error',()=>resolve(false));probe.listen(p,'127.0.0.1',()=>probe.close(()=>resolve(true)));});}
let running=false,found=false;
for(let i=0;i<10;i++,port++){url=`http://127.0.0.1:${port}`;if(await ready()){running=true;found=true;break;}if(await available(port)){found=true;break;}}
if(!found){console.error('No free local port was found. Close an old Grow High server and try again.');process.exit(1);}
if(!running){
 mkdirSync(data,{recursive:true});const output=openSync(path.join(data,'server.log'),'a'),foreground=process.env.GH_FOREGROUND==='1';
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),GH_DATA_DIR:data},detached:!foreground,windowsHide:true,stdio:foreground?'inherit':['ignore',output,output]});
 child.on('error',e=>console.error('Unable to launch server: '+e.message));if(!foreground)child.unref();writeFileSync(path.join(data,'server.pid'),String(child.pid));
 let started=false;for(let i=0;i<50;i++){if(await ready()){started=true;break;}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,200));}
 if(!started){console.error('The server did not become ready. Check the error above or '+path.join(data,'server.log'));process.exit(1);}
}
writeFileSync(path.join(data,'server-url.txt'),url);
console.log(`Grow High v${version} is ready: ${url}`);console.log('Application folder: '+root);console.log('Keep this window open while using Grow High.');
if(process.env.GH_NO_OPEN!=='1'){const browser=spawn('cmd.exe',['/c','start','',url],{windowsHide:true,detached:true,stdio:'ignore'});browser.unref();}
