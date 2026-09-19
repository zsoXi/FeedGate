/* FeedGate 2.1 precision-first regression suite: the 25 required scenarios plus the policy matrix. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/core.js';
import {createWorker,post,sender,sleep} from './worker-harness.mjs';

const C=globalThis.FeedGateCore;
const KEYS=['unwantedAd','feedSpam','bait','lowSignal','useful','original','risk','sufficient'];
const scores=extra=>Object.fromEntries(KEYS.map(k=>[k,k==='sufficient'?0.99:0.01]).concat(Object.entries(extra||{})));
const result=extra=>({model:'jev-test-fixture',scores:scores(extra),usage:{input_tokens:1,output_tokens:0},latencyMs:1});
const settings=patch=>C.sanitizeSettings({...C.DEFAULTS,...patch,categories:{...(patch||{}).categories||{}}});
const record=patch=>C.sanitizeRecord({site:'x',id:'p1',author:'@author',text:'Visible post text.',mediaAlt:'',quotedText:'',truncated:false,context:'feed',sponsored:false,linkDomains:[],...patch});
const adVerified=patch=>C.sanitizeAdEvidence({adapter:'x',status:'verified',markerKind:'x_is_promoted_attribute',selectorId:'x-attr-is-promoted',ownerMatched:true,renderedLabel:null,evidenceKind:'platform_metadata',scope:'outer_post',...patch},'x');
const judge=(extra,patch,rec)=>C.decide(record(rec||{}),result(extra),settings(patch));

test('1. useful promotional project is kept',()=>{
  const d=judge({unwantedAd:0.88,feedSpam:0.5,useful:0.9,original:0.8});
  assert.equal(d.action,'allow');
  assert.equal(d.rule,'useful_or_original_protection');
  assert.equal(d.protected,true);
});

test('2. useful open-source release is kept',()=>{
  const d=judge({unwantedAd:0.8,feedSpam:0.4,useful:0.85,original:0.6},{},{text:'Released v1.4 today. Added Windows support, reduced memory usage 31%, fixed three parser bugs.'});
  assert.equal(d.action,'allow');
  assert.equal(d.protected,true);
});

test('3. technical benchmark mentioning a product is kept',()=>{
  const d=judge({unwantedAd:0.7,feedSpam:0.3,useful:0.9,original:0.5});
  assert.equal(d.action,'allow');
});

test('4. business case study is kept',()=>{
  const d=judge({unwantedAd:0.75,feedSpam:0.3,useful:0.88,original:0.7});
  assert.equal(d.action,'allow');
  assert.equal(d.protected,true);
});

test('5. obvious scam promotion is collapsed',()=>{
  const scam=judge({risk:0.97,feedSpam:0.9,unwantedAd:0.95,useful:0.05});
  assert.equal(scam.action,'collapse');
  assert.equal(scam.rule,'risk_scam_solicitation');
  const spam=judge({feedSpam:0.96,unwantedAd:0.9,useful:0.05});
  assert.equal(spam.action,'collapse');
  assert.equal(spam.rule,'feed_spam');
});

test('6. engagement farming with no substance is dimmed or collapsed, never hidden when useful',()=>{
  const balanced=judge({bait:0.92,useful:0.1});
  assert.equal(balanced.action,'dim');
  assert.equal(balanced.rule,'manipulative_bait');
  const aggressive=judge({bait:0.9,useful:0.1},{...C.presetPatch('aggressive')});
  assert.equal(aggressive.action,'collapse');
  const protectedBait=judge({bait:0.95,useful:0.85});
  assert.equal(protectedBait.action,'allow');
});

test('7. substantive question is kept',()=>{
  const d=judge({useful:0.85,original:0.4,unwantedAd:0.15});
  assert.equal(d.action,'allow');
  assert.equal(d.protected,true);
});

test('8. short ambiguous post is kept when evidence is thin',()=>{
  const d=judge({sufficient:0.55,feedSpam:0.6});
  assert.equal(d.action,'allow');
  assert.equal(d.rule,'insufficient_evidence');
});

test('9. insufficient evidence keeps the post even with high noise signals',()=>{
  const d=judge({sufficient:0.64,feedSpam:0.99,risk:0.99,unwantedAd:0.99});
  assert.equal(d.action,'allow');
  assert.equal(d.rule,'insufficient_evidence');
});

test('10. platform-labelled ads collapse locally only with verified evidence',()=>{
  const d=judge({useful:0.9},null,{adEvidence:adVerified()});
  assert.equal(d.action,'collapse');
  assert.equal(d.source,'local');
  assert.equal(d.rule,'platform_labelled_ad');
  const legacy=judge({useful:0.9},null,{sponsored:true});
  assert.equal(legacy.action,'allow','an old unverified boolean cannot hide a post');
  const quoted=judge({useful:0.9},null,{adEvidence:adVerified({scope:'quote',ownerMatched:false})});
  assert.equal(quoted.action,'allow');
});

test('11. high useful plus high unwanted-ad signal stays visible',()=>{
  const d=judge({unwantedAd:0.95,feedSpam:0.7,useful:0.9});
  assert.equal(d.action,'allow');
  assert.equal(d.protected,true);
  assert.equal(d.usefulPromotion,true);
});

test('12. high original with moderate commercial signal stays visible',()=>{
  const d=judge({unwantedAd:0.88,feedSpam:0.65,original:0.8,useful:0.5});
  assert.equal(d.action,'allow');
  assert.equal(d.protected,true);
});

test('13. high spam with sufficient evidence collapses over strong useful scores',()=>{
  const d=judge({feedSpam:0.99,useful:0.99,original:0.99});
  assert.equal(d.action,'collapse');
  assert.equal(d.rule,'feed_spam');
});

test('14. high bait with high useful signal stays visible',()=>{
  const d=judge({bait:0.97,useful:0.8});
  assert.equal(d.action,'allow');
  assert.equal(d.protected,true);
});

test('15. quoted content remains separated in requests',()=>{
  const body=C.buildRequest(record({text:'I do not agree with this benchmark.',quotedText:'They tested the wrong workload and ignored cold-start performance.'}),settings());
  assert.equal(body.state.post_text,'I do not agree with this benchmark.');
  assert.equal(body.state.quoted_post_text,'They tested the wrong workload and ignored cold-start performance.');
  assert.ok(!body.state.post_text.includes('cold-start'));
});

test('16./17. recycled nodes and stale caches cannot reuse superseded judgments at the worker level',async()=>{
  const stale={version:3,metrics:{requests:99},log:[],cache:[['legacy-key',{expires:Date.now()+600000,result:result({feedSpam:0.99})}]],cooldownUntil:0,authRejected:false,verifiedAt:0,pageReports:[]};
  const w=await createWorker({session:{apiKey:'dummy-worker-test-key',runtimeState:stale}});
  assert.equal((await w.ok({type:'FG_STATUS'})).cached,0,'2.1.0 runtime state must not carry into 2.1.1');
  await w.enable();
  const r=await w.classify(post('SPAM_FIXTURE'));
  assert.equal(w.calls.length,1);
  assert.equal(r.cached,false);
  assert.equal(r.decision.action,'collapse');
});

test('18. provider failure keeps the post visible and is recorded',async()=>{
  const w=await createWorker();await w.enable();w.setMode('network');
  const r=await w.classify();
  assert.equal(r.error.code,'NETWORK');
  assert.equal(r.decision.action,'allow');
  assert.equal((await w.ok({type:'FG_STATUS'})).metrics.lastError.code,'NETWORK');
});

test('19./20. authentication and rate-limit failures keep posts visible elsewhere',async()=>{
  const auth=await createWorker();await auth.enable();auth.setMode(401);
  assert.equal((await auth.classify()).decision.action,'allow');
  const rate=await createWorker();await rate.enable();rate.setMode(429);
  assert.equal((await rate.classify()).decision.action,'allow');
  assert.equal((await rate.classify(post('another','2'))).decision.action,'allow');
  assert.equal(rate.calls.length,1);
});

test('21. observe only plans actions without allowing modifications',()=>{
  const patch=C.presetPatch('observe');
  const s=settings(patch);
  for(const extra of [{feedSpam:0.99},{risk:0.99},{bait:0.95}]){
    const d=C.decide(record({}),result(extra),s);
    assert.equal(d.action,'allow');
    assert.ok(['collapse','dim'].includes(d.wouldAction));
  }
  assert.equal(C.decide(record({adEvidence:adVerified()}),result({}),s).wouldAction,'collapse');
});

test('22. keep-this-post persists as an override after a worker restart',async()=>{
  const w=await createWorker();await w.enable();
  const first=await w.classify(post('SPAM_FIXTURE'));assert.equal(first.decision.action,'collapse');
  await w.ok({type:'FG_KEEP_POST',record:post('SPAM_FIXTURE')},sender);
  await sleep(120);
  const next=await createWorker({local:w.local,session:w.session});
  const again=await next.classify(post('SPAM_FIXTURE'));
  assert.equal(again.decision.source,'override');
  assert.equal(again.decision.action,'allow');
});

test('23. allowlisted authors bypass inference entirely',async()=>{
  const w=await createWorker();await w.enable();
  await w.ok({type:'FG_ALLOW_AUTHOR',author:'@fixture'},sender);
  const d=await w.classify(post('SPAM_FIXTURE'));
  assert.equal(d.decision.rule,'author_allowlisted');
  assert.equal(w.calls.length,0);
});

test('25. legacy worker settings migrate without reusing old thresholds',async()=>{
  const legacy={version:2,enabled:true,consent:true,sites:['x'],preset:'custom',mode:'filter',labelledAds:true,model:'jev-latest',
    showStatus:true,protectUseful:true,profileMode:'soft',concurrency:3,dailyLimit:200,cacheMinutes:30,customInstruction:'',cosmeticRules:'',
    allowedAuthors:['x:@friend'],categories:{promotion:{mode:'collapse',threshold:0.5},spam:{mode:'collapse',threshold:0.5},bait:{mode:'off',threshold:0.6}}};
  const w=await createWorker({local:{settings:legacy}});
  const status=await w.ok({type:'FG_STATUS'});
  assert.equal(status.settings.version,5);
  assert.equal(status.settings.consent,true);
  assert.deepEqual(status.settings.sites,['x']);
  assert.deepEqual(status.settings.allowedAuthors,['x:@friend']);
  assert.equal(status.settings.categories.unwantedAd.threshold,0.85);
  assert.equal(status.settings.categories.feedSpam.threshold,0.9);
  assert.equal(status.settings.categories.bait.threshold,0.88);
  assert.equal(status.settings.preset,'balanced');
});

test('promotion alone is never a hiding rule',()=>{
  const d=judge({unwantedAd:0.95,feedSpam:0.2,useful:0.1,original:0.1});
  assert.equal(d.action,'allow');
  assert.equal(d.rule,'promotion_signal_alone');
});

test('spam versus usefulness conflicts are dimmed for review',()=>{
  const d=judge({feedSpam:0.94,useful:0.9});
  assert.equal(d.action,'dim');
  assert.equal(d.rule,'feed_spam_conflict');
  assert.equal(d.conflict,true);
});

test('risk outranks usefulness and protection',()=>{
  const d=judge({risk:0.95,useful:0.99,original:0.99,feedSpam:0.1});
  assert.equal(d.action,'collapse');
  assert.equal(d.rule,'risk_scam_solicitation');
});

test('custom exclusion stays opt-in and overrides protection when enabled',()=>{
  const off=judge({custom:0.99,useful:0.99},{customInstruction:'Exclude memes'});
  assert.equal(off.action,'allow');
  const on=judge({custom:0.99,useful:0.99},{customInstruction:'Exclude memes',categories:{custom:{mode:'collapse',threshold:0.9}}});
  assert.equal(on.action,'collapse');
  assert.equal(on.rule,'custom_exclusion');
});

test('opened profiles soften semantic collapses but never local or risk rules',()=>{
  const soft=judge({feedSpam:0.99},{},{context:'profile'});
  assert.equal(soft.action,'dim');
  assert.match(soft.reason,/opened profile/);
  const spam=judge({risk:0.99},{},{context:'profile'});
  assert.equal(spam.action,'collapse');
  const ad=judge({},{},{context:'profile',adEvidence:adVerified()});
  assert.equal(ad.action,'collapse');
  const normal=judge({feedSpam:0.99},{profileMode:'normal'},{context:'profile'});
  assert.equal(normal.action,'collapse');
});

test('truncated semantic content is dimmed rather than collapsed',()=>{
  const d=judge({feedSpam:0.99},{},{truncated:true});
  assert.equal(d.action,'dim');
  assert.match(d.reason,/truncated/);
});

test('cache context sensitivity survives while decisions stay context-aware',async()=>{
  const s=settings();
  const a=await C.cacheKey(record({context:'feed'}),s);
  const b=await C.cacheKey(record({context:'profile'}),s);
  assert.equal(a,b);
  assert.equal(C.decide(record({context:'profile'}),result({feedSpam:0.99}),s).action,'dim');
  assert.equal(C.decide(record({context:'feed'}),result({feedSpam:0.99}),s).action,'collapse');
});

/* Appendix B replays: historical behavior recorded from the supplied incident
   diagnostics. These assert policy reasoning over given scores, not labels for
   the original, unavailable post texts. */
test('appendix B replay: R1 and R2 report truthful below-threshold reasons',()=>{
  const r1=judge({unwantedAd:0.83,feedSpam:0.83,bait:0.81,lowSignal:0.91,useful:0.28,original:0.26,risk:0.61,sufficient:0.68});
  assert.equal(r1.action,'allow');
  assert.equal(r1.rule,'below_noise_thresholds');
  assert.equal(r1.source,'policy');
  assert.equal(r1.protected,false);
  assert.equal(r1.protectionEligible,false);
  const r2=judge({unwantedAd:0.81,feedSpam:0.8,bait:0.77,lowSignal:0.85,useful:0.5,original:0.28,risk:0.72,sufficient:0.7});
  assert.equal(r2.action,'allow');
  assert.equal(r2.rule,'below_noise_thresholds');
});

test('appendix B replay: R3 and R4 report protection eligibility truthfully',()=>{
  const r3=judge({unwantedAd:0.46,feedSpam:0.82,bait:0.66,lowSignal:0.94,useful:0.67,original:0.37,risk:0.13,sufficient:0.72});
  assert.equal(r3.action,'allow');
  assert.equal(r3.rule,'useful_or_original_protection');
  assert.equal(r3.protectionEligible,true);
  assert.equal(r3.protected,true);
  const r4=judge({unwantedAd:0.09,feedSpam:0.31,bait:0.13,lowSignal:0.19,useful:0.62,original:0.72,risk:0.09,sufficient:0.66});
  assert.equal(r4.action,'allow');
  assert.equal(r4.rule,'useful_or_original_protection');
  assert.equal(r4.protectionEligible,true);
});

test('appendix B replay: R5 and R6 bait dims stay stable',()=>{
  const r5=judge({unwantedAd:0.14,feedSpam:0.79,bait:0.9,lowSignal:0.85,useful:0.4,original:0.32,risk:0.09,sufficient:0.68});
  assert.equal(r5.action,'dim');
  assert.equal(r5.rule,'manipulative_bait');
  const r6=judge({unwantedAd:0.15,feedSpam:0.78,bait:0.88,lowSignal:0.81,useful:0.44,original:0.38,risk:0.11,sufficient:0.7});
  assert.equal(r6.action,'dim');
  assert.equal(r6.rule,'manipulative_bait');
});

test('raising useful or original never makes a weak noise action harsher',()=>{
  assert.equal(judge({feedSpam:0.95}).action,'collapse');
  const withUseful=judge({feedSpam:0.95,useful:0.65});
  assert.equal(withUseful.action,'dim');
  assert.equal(withUseful.conflict,true);
  assert.equal(judge({feedSpam:0.95,original:0.7}).action,'dim');
});

test('a runtime state written by 2.1.1 restores while older schemas are dropped',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.classify();
  await sleep(150);
  const next=await createWorker({local:w.local,session:w.session});
  const status=await next.ok({type:'FG_STATUS'});
  assert.equal(status.cached,1);
  assert.equal(status.metrics.requests,1);
});
