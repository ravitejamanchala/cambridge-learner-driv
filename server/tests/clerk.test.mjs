import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyToken } from '@clerk/backend';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwtKey=publicKey.export({type:'spki',format:'pem'});
function token(overrides={}) {
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const data=encode({alg:'RS256',typ:'JWT',kid:'test'})+'.'+encode({sub:'user_a',sid:'sess_a',iss:'https://fixture.clerk.accounts.dev',azp:'https://manchala.co.uk',iat:now,nbf:now-1,exp:now+60,...overrides});
 return data+'.'+createSign('RSA-SHA256').update(data).sign(privateKey,'base64url');
}
test('official Clerk verifier accepts valid signatures and rejects expiry, tampering and foreign azp (local keys)',async()=>{
 const opts={jwtKey,authorizedParties:['https://manchala.co.uk']};
 assert.equal((await verifyToken(token(),opts)).sub,'user_a');
 await assert.rejects(()=>verifyToken(token({exp:1}),opts));
 await assert.rejects(()=>verifyToken(token({azp:'https://evil.example'}),opts));
 const signed=token();const parts=signed.split('.');parts[1]=Buffer.from(JSON.stringify({sub:'other'})).toString('base64url');await assert.rejects(()=>verifyToken(parts.join('.'),opts));
});
