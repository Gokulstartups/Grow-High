import {OAuth2Client} from 'google-auth-library';
const client = new OAuth2Client();
export async function verifyGoogle(credential, nonce, clientId, verifier=client) {
  if (!clientId) throw Object.assign(Error('Google sign-in has not been configured. Use email and password for now.'),{status:503});
  try {
    if (typeof credential !== 'string' || credential.length > 16000 || !/^[a-f0-9]{64}$/.test(nonce||'')) throw Error();
    const ticket = await verifier.verifyIdToken({idToken:credential,audience:clientId});
    const p=ticket.getPayload();
    if (!p?.sub || p.nonce !== nonce || p.email_verified !== true || typeof p.email !== 'string') throw Error();
    return {subject:p.sub,email:p.email.toLowerCase(),name:p.name||'Google user'};
  } catch { throw Object.assign(Error('Google sign-in could not be verified. Please try again.'),{status:401}); }
}
