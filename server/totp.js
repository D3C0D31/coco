'use strict';
/* TOTP nach RFC 6238 (HMAC-SHA1, 30 s, 6 Stellen) – kompatibel mit Google Authenticator, Aegis, 1Password, Bitwarden … */
const crypto = require('crypto');
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

function base32(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHA[(val << (5 - bits)) & 31];
  return out;
}
function code(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP);
/* Prüft den Code mit ±1 Zeitfenster Toleranz. Liefert den verwendeten Zeitschritt oder -1.
   lastStep verhindert, dass ein Code zweimal benutzt wird (Replay). */
function verify(secret, input, lastStep = 0, now = Date.now()) {
  const c = String(input || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return -1;
  const s = currentStep(now);
  for (const d of [0, -1, 1]) {
    const st = s + d;
    if (st <= lastStep) continue;
    const exp = Buffer.from(code(secret, st)), got = Buffer.from(c);
    if (crypto.timingSafeEqual(exp, got)) return st;
  }
  return -1;
}
const newSecret = () => crypto.randomBytes(20);
const uri = (secret, label, issuer = 'AutoPot Grow') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${base32(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

module.exports = { base32, code, verify, newSecret, uri, currentStep };
