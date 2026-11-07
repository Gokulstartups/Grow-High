import './safety.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyGoogle} from '../google-auth.mjs';
const nonce='a'.repeat(64);
test('Google verification enforces configuration, browser nonce and verified identity',async()=>{
 const payload={sub:'123',email:'Owner@Example.com',email_verified:true,name:'Owner',nonce};
 const verifier={async verifyIdToken(args){assert.equal(args.audience,'web-client');assert.equal(args.idToken,'signed-token');return {getPayload:()=>payload};}};
 assert.deepEqual(await verifyGoogle('signed-token',nonce,'web-client',verifier),{subject:'123',email:'owner@example.com',name:'Owner'});
 await assert.rejects(verifyGoogle('signed-token',nonce,'',verifier),{status:503});
 await assert.rejects(verifyGoogle('signed-token','', 'web-client',verifier),{status:401});
 payload.nonce='b'.repeat(64);await assert.rejects(verifyGoogle('signed-token',nonce,'web-client',verifier),{status:401});
 payload.nonce=nonce;payload.email_verified=false;await assert.rejects(verifyGoogle('signed-token',nonce,'web-client',verifier),{status:401});
 await assert.rejects(verifyGoogle('signed-token',nonce,'web-client',{async verifyIdToken(){throw Error('private provider diagnostic');}}),e=>e.status===401&&!e.message.includes('private'));
});
