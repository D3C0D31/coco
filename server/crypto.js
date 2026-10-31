'use strict';
/* Verschlüsselung (nur Node-Bordmittel).
 *
 * Envelope-Verschlüsselung:
 *   Passwort --scrypt--> 64 Byte = authKey (32) + KEK (32)
 *   verifier = SHA-256(authKey)            -> wird gespeichert, prüft das Passwort
 *   KEK                                     -> verschlüsselt den Daten-Schlüssel (DEK), nur im RAM
 *   DEK (zufällig, 32 Byte)                 -> verschlüsselt alle Nutzerdaten (AES-256-GCM)
 *   Wiederherstellungscode --scrypt--> KEK2 -> verschlüsselt den DEK ein zweites Mal
 *   Sitzungs-Token --HKDF--> Sitzungsschlüssel -> verschlüsselt den DEK pro Sitzung (nur Cookie kennt das Token)
 * Ohne Passwort, Wiederherstellungscode oder gültiges Sitzungs-Cookie ist die Datenbank allein nicht lesbar.
 */
const crypto = require('crypto');

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const scrypt = (secret, salt, len, opts = SCRYPT) => new Promise((res, rej) =>
  crypto.scrypt(String(secret).normalize('NFKC'), salt, len, opts, (e, k) => (e ? rej(e) : res(k))));
const sha256 = b => crypto.createHash('sha256').update(b).digest();
const rand = n => crypto.randomBytes(n);

/* AES-256-GCM: Ausgabe = IV(12) | Tag(16) | Chiffretext */
function seal(key, plain, aad) {
  const iv = rand(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
function open(key, blob, aad) {
  const b = Buffer.from(blob);
  if (b.length < 29) throw new Error('blob zu kurz');
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]);
}

function b32(buf) {
  let bits = 0, val = 0, out = '';
  for (const byte of buf) {
    val = (val << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
const newRecoveryCode = () => b32(rand(20)).match(/.{1,4}/g).join('-'); /* 160 Bit, 8 Gruppen */
const normRecovery = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

const sessionKey = token => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(token, 'base64url'), Buffer.from('autopot-session-v1'), Buffer.from('dek'), 32));
const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest('hex');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

/* Neues Konto: liefert alle zu speichernden Felder plus DEK und Wiederherstellungscode (einmalig anzeigen) */
async function createAccount(password) {
  const salt = rand(16), recSalt = rand(16), dek = rand(32);
  const out = await scrypt(password, salt, 64);
  const recovery = newRecoveryCode();
  const recKek = await scrypt(normRecovery(recovery), recSalt, 32);
  return {
    dek, recovery,
    row: { salt, verifier: sha256(out.subarray(0, 32)), wrap_dek: seal(out.subarray(32), dek, 'dek'), rec_salt: recSalt, wrap_dek_rec: seal(recKek, dek, 'dek') }
  };
}
/* Passwort prüfen; bei Erfolg DEK zurück, sonst null */
async function unlock(row, password) {
  const out = await scrypt(password, row.salt, 64);
  if (!safeEq(sha256(out.subarray(0, 32)), Buffer.from(row.verifier))) return null;
  try { return open(out.subarray(32), row.wrap_dek, 'dek'); } catch (e) { return null; }
}
async function unlockWithRecovery(row, code) {
  const k = await scrypt(normRecovery(code), row.rec_salt, 32);
  try { return open(k, row.wrap_dek_rec, 'dek'); } catch (e) { return null; }
}
/* DEK neu einpacken (Passwortwechsel / Wiederherstellung); neuer Wiederherstellungscode */
async function rewrap(dek, password) {
  const salt = rand(16), recSalt = rand(16);
  const out = await scrypt(password, salt, 64);
  const recovery = newRecoveryCode();
  const recKek = await scrypt(normRecovery(recovery), recSalt, 32);
  return { recovery, row: { salt, verifier: sha256(out.subarray(0, 32)), wrap_dek: seal(out.subarray(32), dek, 'dek'), rec_salt: recSalt, wrap_dek_rec: seal(recKek, dek, 'dek') } };
}
/* Blindindex für die E-Mail: Klartext-Adressen liegen nie in der Datenbank */
const emailHash = (pepper, email) => hmac(pepper, 'email:' + String(email).trim().toLowerCase());

/* Einladungscodes: 60 Bit, Crockford-Base32, nur als Hash gespeichert */
const newInviteCode = () => b32(rand(8)).slice(0, 12).match(/.{4}/g).join('-');
const inviteHash = code => sha256('invite:' + normRecovery(code)).toString('hex');

module.exports = { newInviteCode, inviteHash, scrypt, seal, open, rand, sha256, sessionKey, createAccount, unlock, unlockWithRecovery, rewrap, emailHash, safeEq, normRecovery, newRecoveryCode };
