import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { signAssertion } from '../web/src/gcp.ts';

test('service-account assertion is a valid RS256 JWT for Google', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const jwt = await signAssertion({ client_email: 'nv-trigger@p.iam.gserviceaccount.com', private_key: pem }, 1_700_000_000);
  const [h, b, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).alg, 'RS256');
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.exp - claims.iat, 3600);
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${b}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')));
});
