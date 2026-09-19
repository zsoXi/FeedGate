import test from 'node:test';import assert from 'node:assert/strict';
import {createWorker,post,sender,trusted,sleep,adEvidenceVerified} from './worker-harness.mjs';
test('worker initialization restricts both storage areas to trusted contexts',async()=>{
 const w=await createWorker();assert.deepEqual(w.levels,{session:'TRUSTED_CONTEXTS',local:'TRUSTED_CONTEXTS'});const s=await w.ok({type:'FG_STATUS'});assert.equal(s.keyReady,false);assert.equal(s.settings.consent,false);assert.deepEqual(s.settings.sites,[]);
});
test('web content cannot read status/secrets or write credentials/settings',async()=>{
 const w=await createWorker();await w.enable();for(const type of ['FG_STATUS','FG_SET_KEY','FG_UNLOCK','FG_PATCH_SETTINGS','FG_EXPORT_SETTINGS']){const r=await w.send({type,key:'dummy-overwrite-key'},sender);assert.equal(r.ok,false);assert.equal(r.error.code,'FORBIDDEN');}const r=await w.ok({type:'FG_GET_CONFIG'},sender);assert.ok(!JSON.stringify(r).includes('dummy-worker-test-key'));
});
test('foreign extensions and subframes cannot use inference proxy',async()=>{
 const w=await createWorker();await w.enable();for(const s of [{...sender,id:'b'.repeat(32)},{...sender,frameId:1},{...sender,url:'https://x.com.evil.test/home'}])assert.equal((await w.send({type:'FG_CLASSIFY',record:post()},s)).ok,false);assert.equal(w.calls.length,0);
});
test('missing opt-in or key does not call API',async()=>{
 const w=await createWorker();await w.ok({type:'FG_PATCH_SETTINGS',patch:{sites:['x']}});const a=await w.classify();assert.equal(a.error.code,'CONSENT_REQUIRED');await w.ok({type:'FG_PATCH_SETTINGS',patch:{consent:true}});const b=await w.classify();assert.equal(b.error.code,'LOCKED');assert.equal(b.decision.action,'allow');assert.equal(w.calls.length,0);
});
test('site enabling requires granted optional host permission',async()=>{
 const w=await createWorker({permissions:false});const r=await w.send({type:'FG_PATCH_SETTINGS',patch:{sites:['x']}});assert.equal(r.ok,false);assert.equal(r.error.code,'FORBIDDEN');
});
test('enabled site registers only isolated, top-frame, local content scripts',async()=>{
 const w=await createWorker();await w.enable();assert.equal(w.registrations.length,1);assert.equal(w.registrations[0].world,'ISOLATED');assert.equal(w.registrations[0].allFrames,false);assert.deepEqual(w.registrations[0].js,['core.js','adapters.js','content.js']);
});
test('successful inference uses correct API schema and does not retain raw post text',async()=>{
 const w=await createWorker();await w.enable();const r=await w.classify(post('SPAM_FIXTURE raw-private-marker'));assert.equal(r.decision.action,'collapse');assert.equal(w.calls.length,1);assert.equal(w.calls[0].body.questions.feedSpam.type,'noul');assert.equal(w.calls[0].headers.Authorization,'Bearer dummy-worker-test-key');await sleep(120);assert.ok(!JSON.stringify(w.local).includes('raw-private-marker'));assert.ok(!JSON.stringify(w.session.runtimeState).includes('raw-private-marker'));assert.ok(!JSON.stringify(w.events).includes('dummy-worker-test-key'));
});
test('simultaneous identical inference is coalesced; later reads use cache',async()=>{
 const w=await createWorker();await w.enable();w.setDelay(35);const results=await Promise.all(Array.from({length:8},()=>w.classify()));assert.equal(results.length,8);assert.equal(w.calls.length,1);const r=await w.classify();assert.equal(r.cached,true);assert.equal(w.calls.length,1);
});
test('changing policy reuses probabilities, but changing rubric input calls API',async()=>{
 const w=await createWorker();await w.enable();await w.classify(post('SPAM_FIXTURE'));await w.ok({type:'FG_PATCH_SETTINGS',patch:{categories:{feedSpam:{mode:'off'}}}});const r=await w.classify(post('SPAM_FIXTURE'));assert.equal(r.cached,true);assert.equal(r.decision.action,'allow');await w.ok({type:'FG_PATCH_SETTINGS',patch:{customInstruction:'Irrelevant promotions'}});await w.classify(post('SPAM_FIXTURE'));assert.equal(w.calls.length,2);
});
test('cache can be disabled for every new observation',async()=>{
 const w=await createWorker();await w.enable({cacheMinutes:0});await w.classify();await w.classify();assert.equal(w.calls.length,2);
});
test('bounded concurrency and atomic daily budget under parallel load',async()=>{
 const w=await createWorker();await w.enable({concurrency:3,dailyLimit:10,cacheMinutes:0});w.setDelay(15);const results=await Promise.all(Array.from({length:25},(_,i)=>w.classify(post('unique '+i,'post'+i))));assert.ok(w.maxActive<=3);assert.equal(w.calls.length,10);assert.equal(w.local.dailyUsage.requests,10);assert.equal(results.filter(x=>x.error?.code==='BUDGET').length,15);
});
test('401 marks authentication rejected until key replacement without retry storm',async()=>{
 const w=await createWorker();await w.enable();w.setMode(401);const r=await w.classify();assert.equal(r.error.code,'AUTH');assert.equal(r.decision.action,'allow');await w.classify(post('another','2'));assert.equal(w.calls.length,1);w.setMode('success');await w.ok({type:'FG_SET_KEY',key:'dummy-new-worker-key'});await w.classify();assert.equal(w.calls.length,2);
});
test('429 enters shared cooldown without hiding or automatic retry',async()=>{
 const w=await createWorker();await w.enable();w.setMode(429);assert.equal((await w.classify()).error.code,'RATE_LIMIT');assert.equal((await w.classify(post('another','2'))).decision.action,'allow');assert.equal(w.calls.length,1);assert.ok((await w.ok({type:'FG_STATUS'})).cooldownUntil>Date.now());
});
test('malformed API results fail open and are not cached',async()=>{
 const w=await createWorker();await w.enable();w.setMode('malformed');const r=await w.classify();assert.equal(r.error.code,'INVALID_RESPONSE');assert.equal(r.decision.action,'allow');w.setMode('success');await w.classify();assert.equal(w.calls.length,2);
});
test('private route in sender or current tab is blocked before HTTP',async()=>{
 const w=await createWorker();await w.enable();assert.equal((await w.send({type:'FG_CLASSIFY',record:post()},{...sender,url:'https://x.com/messages'})).ok,false);w.tabs.set(1,{id:1,url:'https://x.com/messages'});assert.equal((await w.send({type:'FG_CLASSIFY',record:post()},sender)).ok,false);assert.equal(w.calls.length,0);
});
test('privacy revocation aborts running requests and leaves semantic content visible',async()=>{
 const w=await createWorker();await w.enable();w.setDelay(150);const p=w.classify(post('SPAM_FIXTURE'));await sleep(15);await w.ok({type:'FG_PATCH_SETTINGS',patch:{consent:false}});const r=await p;assert.equal(r.error.code,'ABORTED');assert.equal(r.decision.action,'allow');assert.equal((await w.ok({type:'FG_STATUS'})).metrics.classified,0);
});
test('lock cancels active and queued work; no key returned in status',async()=>{
 const w=await createWorker();await w.enable({concurrency:1});w.setDelay(100);const ps=[w.classify(),w.classify(post('other','2'))];await sleep(10);await w.ok({type:'FG_LOCK'});await Promise.all(ps);assert.equal(w.session.apiKey,undefined);const r=await w.ok({type:'FG_STATUS'});assert.equal(r.keyReady,false);assert.ok(!JSON.stringify(r).includes('dummy-worker-test-key'));
});
test('lock supersedes slow encryption and cannot be undone by its late completion',async()=>{
 const w=await createWorker();const saving=w.send({type:'FG_SET_KEY',key:'dummy-slow-key',remember:true,passphrase:'strong long test passphrase'});await sleep(5);await w.ok({type:'FG_LOCK'});const done=await saving;assert.equal(done.ok,false);assert.equal(done.error.code,'ABORTED');assert.equal(w.session.apiKey,undefined);assert.equal((await w.ok({type:'FG_STATUS'})).keyReady,false);
});
test('encrypted vault unlock, wrong-pass rejection and forgetting',async()=>{
 const w=await createWorker();await w.ok({type:'FG_SET_KEY',key:'dummy-encrypted-key',remember:true,passphrase:'long protected passphrase'});assert.ok(!JSON.stringify(w.local).includes('dummy-encrypted-key'));await w.ok({type:'FG_LOCK'});assert.equal((await w.send({type:'FG_UNLOCK',passphrase:'wrong password'})).ok,false);await w.ok({type:'FG_UNLOCK',passphrase:'long protected passphrase'});assert.equal(w.session.apiKey,'dummy-encrypted-key');await w.ok({type:'FG_FORGET_KEY'});assert.equal(w.session.apiKey,undefined);assert.equal(w.local.vault,undefined);
});
test('browser-restart simulation retains only encrypted vault, not a usable key',async()=>{
 const w=await createWorker();await w.ok({type:'FG_SET_KEY',key:'dummy-encrypted-key',remember:true,passphrase:'long protected passphrase'});const restarted=await createWorker({local:w.local,session:{}});const status=await restarted.ok({type:'FG_STATUS'});assert.equal(status.hasVault,true);assert.equal(status.keyReady,false);
});
test('worker-restart simulation restores session key and cached results',async()=>{
 const w=await createWorker();await w.enable();await w.classify();await sleep(120);assert.equal(w.session.runtimeState.version,5);const next=await createWorker({local:w.local,session:w.session});assert.equal((await next.ok({type:'FG_STATUS'})).keyReady,true);assert.equal((await next.classify()).cached,true);assert.equal(next.calls.length,0);
});
test('settings export never contains key/vault; import requires fresh permissions and consent',async()=>{
 const w=await createWorker();await w.enable();const data=await w.ok({type:'FG_EXPORT_SETTINGS'});assert.equal(data.settings.consent,false);assert.deepEqual(data.settings.sites,[]);assert.ok(!JSON.stringify(data).includes('dummy-worker-test-key'));data.settings.consent=true;data.settings.sites=['x'];await w.ok({type:'FG_IMPORT_SETTINGS',data});const s=await w.ok({type:'FG_STATUS'});assert.equal(s.settings.consent,false);assert.deepEqual(s.settings.sites,[]);
});
test('author allowlist restores locally without further model requests',async()=>{
  const w=await createWorker();await w.enable();await w.ok({type:'FG_ALLOW_AUTHOR',author:'@fixture'},sender);const d=await w.classify(post('SPAM_FIXTURE'));assert.equal(d.decision.source,'allowlist');assert.equal(w.calls.length,0);
});
test('a muted author is hidden locally, unmuting clears the mute and lists stay mutually exclusive',async()=>{
  const w=await createWorker();await w.enable({cacheMinutes:0});
  await w.ok({type:'FG_MUTE_AUTHOR',author:'@fixture'},sender);
  const mute=await w.classify(post('SPAM_FIXTURE'));
  assert.equal(mute.decision.rule,'author_muted');assert.equal(mute.decision.source,'author');assert.equal(mute.decision.action,'collapse');
  assert.equal(w.calls.length,0,'a mute is resolved before any provider call');
  const diag=await w.ok({type:'FG_DIAGNOSTICS'});
  assert.equal(diag.settings.mutedAuthorCount,1);
  assert.ok(diag.decisions.some((entry)=>entry.rule==='author_muted'));
  await w.ok({type:'FG_ALLOW_AUTHOR',author:'@fixture'},sender);
  const s=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(s.settings.blockedAuthors,[]);
  assert.ok(s.settings.allowedAuthors.includes('x:@fixture'));
  const allowed=await w.classify(post('SPAM_FIXTURE'));
  assert.equal(allowed.decision.rule,'author_allowlisted');
  assert.equal(w.calls.length,0);
});
test('forget-author clears a key from both local lists and model checks resume',async()=>{
  const w=await createWorker();await w.enable({cacheMinutes:0});
  await w.ok({type:'FG_MUTE_AUTHOR',author:'@fixture'},sender);
  await w.ok({type:'FG_ALLOW_AUTHOR',author:'@fixture'},sender);
  const before=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(before.settings.allowedAuthors,['x:@fixture']);
  const out=await w.ok({type:'FG_FORGET_AUTHOR',author:'@fixture'},sender);
  assert.equal(out.saved,true);
  const after=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(after.settings.allowedAuthors,[]);
  assert.deepEqual(after.settings.blockedAuthors,[]);
  const decision=await w.classify(post('SPAM_FIXTURE'));
  assert.equal(decision.decision.rule,'feed_spam');
  assert.equal(w.calls.length,1,'without local lists the post needs the model again');
});
test('element picker may add only a selector for its actual sender host',async()=>{
 const w=await createWorker();await w.enable();
 const saved=await w.ok({type:'FG_ADD_RULE',selector:'.sponsor'},sender);
 assert.equal(saved.rule.host,'x.com');assert.equal(saved.rule.selector,'.sponsor');assert.equal(saved.rule.status,'active');assert.equal(saved.rule.source,'picker');
 assert.equal(w.local.settings.cosmeticFilters.rules.length,1);assert.equal(w.local.settings.cosmeticFilters.rules[0].selector,'.sponsor');
 assert.equal((await w.send({type:'FG_ADD_RULE',selector:'body'},sender)).ok,false,'a protected root can never become a cosmetic rule');
 assert.equal((await w.send({type:'FG_ADD_RULE',selector:'div:has(main)'},sender)).ok,false,'the documented selector subset rejects unsupported syntax');
});
test('verified platform ad evidence collapses locally without any provider request',async()=>{
 const w=await createWorker();await w.enable();const r=await w.classify({...post('Sponsored placement fixture'),adEvidence:adEvidenceVerified});assert.equal(r.decision.action,'collapse');assert.equal(r.decision.source,'local');assert.equal(r.decision.rule,'platform_labelled_ad');assert.equal(r.decision.category,'unwantedAd');assert.equal(r.decision.adEvidence.status,'verified');assert.equal(w.calls.length,0);
});
test('a legacy boolean sponsored flag cannot trigger local hiding and goes through Jev',async()=>{
 const w=await createWorker();await w.enable();const r=await w.classify({...post('Organic text with a legacy flag'),sponsored:true});assert.equal(r.decision.action,'allow');assert.equal(r.decision.rule,'no_noise_rule_matched');assert.equal(w.calls.length,1);
});
test('config responses carry the release version so a stale content script can detect an update',async()=>{
 const w=await createWorker();const cfg=await w.ok({type:'FG_GET_CONFIG'},sender);assert.equal(cfg.appVersion,'3.1.1');
});
test('runtime state written by an older schema is dropped, not replayed',async()=>{
 const legacy={version:3,metrics:{decisions:99},log:[{action:'collapse',reason:'legacy entry'}],cache:[],pageReports:[]};
 const w=await createWorker({session:{apiKey:'dummy-worker-test-key',runtimeState:legacy}});const s=await w.ok({type:'FG_STATUS'});assert.equal(s.metrics.decisions,0);assert.equal(s.log.length,0);
});
test('session history is a bounded window while counters keep counting',async()=>{
 const w=await createWorker();await w.enable({concurrency:6,cacheMinutes:0});const total=160;await Promise.all(Array.from({length:total},(_,i)=>w.classify(post('history '+i,'h'+i))));const s=await w.ok({type:'FG_STATUS'});assert.equal(s.metrics.decisions,total);assert.equal(s.log.length,150,'the retained window keeps the newest 150 events');assert.equal(s.log[0].reason,'No noise rule matched');assert.equal(s.metrics.errors,0);
 await sleep(150);assert.equal(w.session.runtimeState.log.length,150);
});
