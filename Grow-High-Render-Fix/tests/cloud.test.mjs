import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {request} from 'node:http';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Render startup serves UI, validates host and HTTPS origin, and sets secure sessions',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,RENDER:'true',RENDER_EXTERNAL_URL:'https://grow-high-test.onrender.com',GH_PUBLIC_URL:'',PORT:'14391',GH_DATA_DIR:mkdtempSync(path.join(os.tmpdir(),'gh-cloud-'))},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 const call=(url,method='GET',host='grow-high-test.onrender.com',origin='https://grow-high-test.onrender.com')=>new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:14391,path:url,method,headers:{host,origin,'content-type':'application/json'}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});req.on('error',reject);req.end(method==='POST'?'{}':undefined);});
 try{
  for(let i=0;i<100&&!logs.includes('listening on');i++){if(child.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
  assert.match(logs,/listening on 0\.0\.0\.0:14391/);
  for(const url of ['/','/workspace.html','/app.js','/workspace.js','/healthz'])assert.equal((await call(url)).status,200,url);
  assert.equal((await call('/','GET','evil.example')).status,403);
  assert.equal((await call('/api/demo','POST',undefined,'https://evil.example')).status,403);
  const demo=await call('/api/demo','POST');assert.equal(demo.status,200,demo.text);assert.match(demo.headers['set-cookie'][0],/; Secure/);
 }finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));}
});
