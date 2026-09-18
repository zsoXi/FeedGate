/* SPDX-License-Identifier: GPL-3.0-or-later
 * Direct HTTP client, based on https://docs.typesafe.ai/api.
 * Only the extension worker imports this file. The endpoint is deliberately fixed.
 */
(() => {
  'use strict';
  const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
  const TIMEOUT_MS = 15000;
  async function evaluate(apiKey,body,externalSignal) {
    const C = globalThis.FeedGateCore;
    if (!C.validKey(apiKey)) throw new Error('INVALID_KEY');
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (externalSignal?.aborted) throw new Error('ABORTED');
    externalSignal?.addEventListener('abort',abort,{once:true});
    const timer = setTimeout(() => {timedOut=true;controller.abort();},TIMEOUT_MS);
    const started = performance.now();
    try {
      const response = await fetch(ENDPOINT,{
        method:'POST',headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify(body),signal:controller.signal,credentials:'omit',
        cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'
      });
      if (!response.ok) {
        // Never echo a provider error body: it might contain input or credentials.
        const code = [401,403].includes(response.status) ? 'AUTH' : [429,529,503].includes(response.status) ? 'RATE_LIMIT' : 'HTTP_ERROR';
        const error = new Error(code);
        const after = response.headers.get('Retry-After');
        let seconds = Number(after);
        if (after && !Number.isFinite(seconds)) seconds = (Date.parse(after)-Date.now())/1000;
        error.retryAfterMs = C.clamp(Number.isFinite(seconds) && seconds>0 ? seconds*1000 : 30000,5000,300000);
        throw error;
      }
      // Stream with a hard size bound; avoid allocating an unbounded response body.
      if (Number(response.headers.get('Content-Length') || 0) > 131072) throw new Error('INVALID_RESPONSE');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('INVALID_RESPONSE');
      const chunks = []; let size=0;
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 131072) { await reader.cancel(); throw new Error('INVALID_RESPONSE'); }
        chunks.push(value);
      }
      const all = new Uint8Array(size); let at=0;
      for (const chunk of chunks) {all.set(chunk,at);at+=chunk.byteLength;}
      let raw;
      try {raw=JSON.parse(new TextDecoder().decode(all));} catch {throw new Error('INVALID_RESPONSE');}
      return {...C.parseResponse(raw,Object.keys(body.questions)),latencyMs:Math.round(performance.now()-started)};
    } catch (error) {
      if (timedOut) throw new Error('TIMEOUT');
      if (externalSignal?.aborted) throw new Error('ABORTED');
      if (['AUTH','RATE_LIMIT','HTTP_ERROR','INVALID_RESPONSE'].includes(error?.message)) throw error;
      throw new Error('NETWORK');
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort',abort);
    }
  }
  globalThis.FeedGateTypeSafe = Object.freeze({evaluate,ENDPOINT,TIMEOUT_MS});
})();
