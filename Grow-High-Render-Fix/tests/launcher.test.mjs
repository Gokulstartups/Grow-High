import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
test('launcher starts server, waits for readiness, and reuses the running instance',async()=>{
  const root=path.resolve(import.meta.dirname,'..'),data=mkdtempSync(path.join(os.tmpdir(),'gh-launch-test-'));
  const run=()=>new Promise((resolve,reject)=>{let output='';const child=spawn(process.execPath,['launch.mjs'],{cwd:root,env:{...process.env,PORT:'14182',GH_DATA_DIR:data,GH_NO_OPEN:'1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('exit',code=>resolve({code,output}));});
  try{
    const first=await run();assert.equal(first.code,0,first.output);const pid=readFileSync(path.join(data,'server.pid'),'utf8');
    const response=await fetch('http://127.0.0.1:14182');assert.equal(response.status,200);assert.equal(response.headers.get('x-grow-high'),'local');
    const second=await run();assert.equal(second.code,0,second.output);assert.equal(readFileSync(path.join(data,'server.pid'),'utf8'),pid);
  }finally{if(existsSync(path.join(data,'server.pid')))try{process.kill(Number(readFileSync(path.join(data,'server.pid'),'utf8')));}catch{}}
});

test('launcher skips an occupied port serving an older version',async()=>{
 const {createServer}=await import('node:http');const occupied=createServer((req,res)=>{res.setHeader('X-Grow-High','local');res.end('Older instance');});
 await new Promise(resolve=>occupied.listen(14185,'127.0.0.1',resolve));const root=path.resolve(import.meta.dirname,'..'),data=mkdtempSync(path.join(os.tmpdir(),'gh-port-test-'));
 try{const outcome=await new Promise((resolve,reject)=>{let output='';const child=spawn(process.execPath,['launch.mjs'],{cwd:root,env:{...process.env,PORT:'14185',GH_DATA_DIR:data,GH_NO_OPEN:'1',GH_FOREGROUND:'0'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('exit',code=>resolve({code,output}));});assert.equal(outcome.code,0,outcome.output);const url=readFileSync(path.join(data,'server-url.txt'),'utf8');assert.equal(url,'http://127.0.0.1:14186');const response=await fetch(url);assert.equal(response.headers.get('x-grow-high-version'),JSON.parse(readFileSync(path.join(root,'package.json'))).version);}finally{occupied.closeAllConnections();await new Promise(resolve=>occupied.close(resolve));if(existsSync(path.join(data,'server.pid')))try{process.kill(Number(readFileSync(path.join(data,'server.pid'),'utf8')));}catch{}}
});
