import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/core.js';import '../src/typesafe.js';
const C=globalThis.FeedGateCore,A=globalThis.FeedGateTypeSafe;
const body=C.buildRequest(C.sanitizeRecord({id:'1',text:'Example'},'demo'),C.DEFAULTS);
const wire=()=>({model:'jev-fixture',answers:Object.fromEntries(Object.keys(body.questions).map(k=>[k,{type:'noul',noul:.1}])),usage:{input_tokens:12,output_tokens:0}});
const realFetch=globalThis.fetch;
async function withFetch(fn,run){globalThis.fetch=fn;try{await run();}finally{globalThis.fetch=realFetch;}}
test('HTTP sends one request to the fixed endpoint; no cookies/referrer or redirects',async()=>{
  let count=0;await withFetch(async(url,o)=>{count++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(o.headers.Authorization,'Bearer dummy-test-key');assert.equal(o.redirect,'error');assert.equal(o.credentials,'omit');assert.equal(o.referrerPolicy,'no-referrer');assert.deepEqual(JSON.parse(o.body),body);return Response.json(wire());},async()=>{const r=await A.evaluate('dummy-test-key',body);assert.equal(r.model,'jev-fixture');assert.ok(!JSON.stringify(r).includes('dummy-test-key'));});assert.equal(count,1);
});
for(const [status,code] of [[401,'AUTH'],[403,'AUTH'],[429,'RATE_LIMIT'],[529,'RATE_LIMIT'],[503,'RATE_LIMIT'],[422,'HTTP_ERROR']])test(`HTTP ${status} is sanitized and not automatically retried`,async()=>{
  let n=0;await withFetch(async()=>{n++;return new Response('sensitive provider body',{status,headers:{'Retry-After':'10'}});},async()=>await assert.rejects(A.evaluate('dummy-test-key',body),e=>e.message===code&&e.retryAfterMs===10000));assert.equal(n,1);
});
test('invalid JSON and incomplete responses fail instead of becoming allow scores',async()=>{
  for(const response of [new Response('{broken'),Response.json({answers:{}})])await withFetch(async()=>response,async()=>await assert.rejects(A.evaluate('dummy-test-key',body),/INVALID_RESPONSE/));
});
test('oversized response is bounded even without Content-Length',async()=>{
  await withFetch(async()=>new Response('x'.repeat(140000)),async()=>await assert.rejects(A.evaluate('dummy-test-key',body),/INVALID_RESPONSE/));
});
test('a pre-aborted request never reaches fetch',async()=>{
  const ac=new AbortController();ac.abort();let n=0;await withFetch(async()=>{n++;return Response.json(wire());},async()=>await assert.rejects(A.evaluate('dummy-test-key',body,ac.signal),/ABORTED/));assert.equal(n,0);
});
test('aborting an in-flight request stops the HTTP client',async()=>{
  const ac=new AbortController();await withFetch(async(_url,o)=>new Promise((resolve,reject)=>{o.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));setTimeout(()=>ac.abort(),10);}),async()=>await assert.rejects(A.evaluate('dummy-test-key',body,ac.signal),/ABORTED/));
});
test('network exceptions never leak their raw message',async()=>await withFetch(async()=>{throw new Error('secret raw detail');},async()=>await assert.rejects(A.evaluate('dummy-test-key',body),e=>e.message==='NETWORK')));
