/* SPDX-License-Identifier: GPL-3.0-or-later
 * Optional passphrase-encrypted local key vault. No passphrase is persisted.
 */
(() => {
  'use strict';
  const ITERATIONS = 600000;
  const encoder = new TextEncoder();
  const additionalData = encoder.encode('FeedGate vault v1');
  const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
  const unb64 = s => {
    if (typeof s !== 'string' || s.length > 4096 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('VAULT_ERROR');
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  };
  async function derive(passphrase,salt) {
    const base = await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(apiKey,passphrase) {
    if (!globalThis.FeedGateCore.validKey(apiKey)) throw new Error('INVALID_KEY');
    if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) throw new Error('PASSPHRASE');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await derive(passphrase,salt);
    const data = encoder.encode(apiKey);
    try {
      const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,data);
      return {version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)};
    } finally { data.fill(0); }
  }
  async function open(vault,passphrase) {
    if (!vault) throw new Error('NO_VAULT');
    if (typeof passphrase !== 'string' || passphrase.length > 1024) throw new Error('VAULT_ERROR');
    try {
      if (vault.version !== 1 || vault.kdf !== 'PBKDF2-SHA256' || vault.iterations !== ITERATIONS) throw 0;
      const salt = unb64(vault.salt), iv = unb64(vault.iv), cipher = unb64(vault.ciphertext);
      if (salt.length !== 16 || iv.length !== 12 || cipher.length < 24 || cipher.length > 528) throw 0;
      const key = await derive(passphrase,salt);
      const plain = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData},key,cipher));
      try {
        const result = new TextDecoder().decode(plain);
        if (!globalThis.FeedGateCore.validKey(result)) throw 0;
        return result;
      } finally { plain.fill(0); }
    } catch { throw new Error('VAULT_ERROR'); }
  }
  globalThis.FeedGateVault = Object.freeze({seal,open});
})();
