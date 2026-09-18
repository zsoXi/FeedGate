/** Deterministic policy regression, not live-model accuracy evaluation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/core.js';
const C=globalThis.FeedGateCore;
const s=()=>C.clone(C.DEFAULTS);
const record=(extra={})=>C.sanitizeRecord({id:'post-1',text:'A concrete example',author:'@builder',...extra},'x');
const result=(patch={})=>({scores:{promotion:.1,spam:.1,bait:.1,generic:.1,value:.2,contribution:.2,risk:.01,sufficient:.99,...patch}});
const decide=(p={},r={},settings=s())=>C.decide(record(r),result(p),settings);

test('v2 has bounded Balanced defaults, not inherited 99% sliders',()=>{
 const a=s();assert.equal(C.VERSION,'2.0.0');assert.equal(a.version,2);assert.equal(a.preset,'balanced');assert.equal(a.categories.promotion.threshold,.8);assert.equal(a.protectUseful,true);assert.equal(a.profileMode,'soft');
});
test('99% promotional intent alone never hides',()=>assert.equal(decide({promotion:.99}).action,'allow'));
test('the builder scenario is protected despite promotion and weak spam estimates',()=>{
 const d=decide({promotion:.85,spam:.61,bait:.12,value:.86,contribution:.9,generic:.11});
 assert.equal(d.action,'allow');assert.equal(d.protected,true);assert.equal(d.usefulPromotion,true);
});
test('useful commercial software is protected, not just open source',()=>assert.equal(decide({promotion:.98,value:.9,contribution:.8}).action,'allow'));
test('original contribution protects even when information estimate is lower',()=>assert.equal(decide({promotion:.95,contribution:.85,value:.55,spam:.7}).action,'allow'));
test('lack of value alone is not a promotional-spam proof',()=>assert.equal(decide({promotion:.99,spam:.59,value:0,contribution:0}).action,'allow'));
test('all low-value promotion conditions must hold',()=>{
 assert.equal(decide({promotion:.88,spam:.65,value:.2,contribution:.2}).action,'collapse');
 for(const [key,value] of [['promotion',.79],['spam',.59],['value',.45],['contribution',.55]])assert.equal(decide({promotion:.88,spam:.65,value:.2,contribution:.2,[key]:value}).action,'allow',key);
});
test('high usefulness never immunises explicit fraud-like solicitation',()=>{
 const d=decide({risk:.99,promotion:.99,value:.99,contribution:.99});assert.equal(d.action,'collapse');assert.equal(d.category,'risk');
});
test('very strong spam is not bypassed by claimed information value',()=>assert.equal(decide({spam:.99,value:.99}).action,'collapse'));
test('conflicting usefulness and less extreme spam is dimmed for review',()=>{
 const d=decide({spam:.94,value:.95});assert.equal(d.action,'dim');assert.equal(d.conflict,true);
});
test('protection prevents weak bait from suppressing useful questions',()=>assert.equal(decide({bait:.91,value:.8}).action,'allow'));
test('empty bait is dimmed in Balanced',()=>assert.equal(decide({bait:.91}).action,'dim'));
test('generic filler is off in Balanced',()=>assert.equal(decide({generic:.99}).action,'allow'));
test('Aggressive keeps useful contributions, increases action on empty bait and filler',()=>{
 const a={...s(),...C.presetPatch('aggressive')};
 assert.equal(decide({bait:.87},{},a).action,'collapse');assert.equal(decide({generic:.90},{},a).action,'dim');
 assert.equal(decide({promotion:.99,spam:.75,value:.9},{},a).action,'allow');
});
test('opened profile softens ordinary semantic collapse to dim',()=>assert.equal(decide({promotion:.9,spam:.7},{context:'profile'}).action,'dim'));
test('profile context does not turn spam into an author exception',()=>assert.equal(decide({spam:.99},{context:'profile'}).action,'dim'));
test('profile protection leaves explicit platform ads collapsible',()=>assert.equal(decide({},{context:'profile',sponsored:true}).action,'collapse'));
test('profile protection does not soften explicit fraud-like solicitation',()=>assert.equal(decide({risk:.99},{context:'profile'}).action,'collapse'));
test('normal profile mode is available by explicit user setting',()=>{
 const a=s();a.profileMode='normal';assert.equal(decide({promotion:.9,spam:.7},{context:'profile'},a).action,'collapse');
});
test('truncated text causes gentler semantic treatment',()=>assert.equal(decide({spam:.99},{truncated:true}).action,'dim'));
test('missing textual evidence remains visible even with alarming predictions',()=>assert.equal(decide({risk:.99,sufficient:.2}).action,'allow'));
test('explicit personal exclusion is not silently overridden by useful-content protection',()=>{
 const a=s();a.customInstruction='A fixture criterion';a.categories.custom={mode:'collapse',threshold:.9};
 assert.equal(decide({custom:.99,value:.99},{context:'profile'},a).action,'collapse');
});
test('a disabled personal exclusion never applies',()=>{const a=s();a.customInstruction='Fixture';assert.equal(decide({custom:1},{},a).action,'allow');});
test('Observe leaves both local and semantic posts visible',()=>{
 const a={...s(),...C.presetPatch('observe')};
 for(const d of [decide({spam:1},{},a),decide({},{sponsored:true},a)]){assert.equal(d.action,'allow');assert.equal(d.wouldAction,'collapse');}
});
test('source context detects profiles without treating home, search or threads as profiles',()=>{
 for(const u of ['https://x.com/builder','https://x.com/builder/media','https://www.reddit.com/user/builder','https://www.linkedin.com/in/builder/'])assert.equal(C.pageContext(u),'profile',u);
 for(const u of ['https://x.com/home','https://x.com/search?q=code','https://x.com/explore','https://x.com/i/lists/1'])assert.equal(C.pageContext(u),'feed',u);
 assert.equal(C.pageContext('https://x.com/builder/status/123'),'thread');
});
test('quoted post is separate evidence, never a replacement for main author text',()=>{
 const q=C.buildRequest(record({text:'This offer is fraudulent. Do not send credentials.',quotedText:'Send your seed phrase for guaranteed returns.'}),s());
 assert.match(q.state.post_text,/Do not send/);assert.match(q.state.quoted_post_text,/seed phrase/);assert.ok(q.questions.risk.instructions.includes('main author'));
});
test('cache reuses features across contexts while decisions remain context sensitive',async()=>{
 const a=record({context:'feed'}),b=record({context:'profile'});
 assert.equal(await C.cacheKey(a,s()),await C.cacheKey(b,s()));
 assert.notEqual(C.decide(a,result({spam:.95}),s()).action,C.decide(b,result({spam:.95}),s()).action);
});
test('cache changes with quoted text and truncation',async()=>{
 const base=await C.cacheKey(record(),s());
 assert.notEqual(await C.cacheKey(record({quotedText:'Different quote'}),s()),base);
 assert.notEqual(await C.cacheKey(record({truncated:true}),s()),base);
});
test('saved post choice ignores context but is invalidated by an edit or changed post identity',async()=>{
 const base=await C.feedbackKey(record());
 assert.equal(await C.feedbackKey(record({context:'profile'})),base);
 assert.notEqual(await C.feedbackKey(record({text:'An edited post'})),base);
 assert.notEqual(await C.feedbackKey(record({id:'post-2'})),base);
});
test('mention masking does not modify the local author allowlist key',()=>{
 const r=record({text:'Ask @secret_person for details.'});assert.equal(r.author,'@builder');assert.ok(!JSON.stringify(C.inferenceState(r)).includes('@secret_person'));
});
