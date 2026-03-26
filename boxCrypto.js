/**
 * Per-connection encryption: encrypt with the peer's public key, decrypt with your secret key.
 * NaCl box (X25519 + XSalsa20-Poly1305).
 */
import crypto from 'crypto';
import nacl from 'tweetnacl';

const NONCE_LENGTH = 24;

function b64Encode(u8) {
  return Buffer.from(u8).toString('base64');
}

function b64Decode(str) {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

/** Random box key pair (independent per connection) */
export function boxKeyPair() {
  return nacl.box.keyPair();
}

export function encrypt(plaintext, otherPublicKey, mySecretKey) {
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const msg = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
  const box = nacl.box(msg, nonce, otherPublicKey, mySecretKey);
  return { nonce: b64Encode(nonce), payload: b64Encode(box) };
}

export function decrypt(nonceB64, payloadB64, otherPublicKey, mySecretKey) {
  const nonce = b64Decode(nonceB64);
  const box = b64Decode(payloadB64);
  const out = nacl.box.open(box, nonce, otherPublicKey, mySecretKey);
  return out ? new TextDecoder().decode(out) : null;
}

export function publicKeyToBase64(pk) {
  return b64Encode(pk);
}

export function base64ToPublicKey(b64) {
  return b64Decode(b64);
}
