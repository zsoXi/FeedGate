import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/core.js';
import '../src/vault.js';

const C=globalThis.FeedGateCore;
const V=globalThis.FeedGateVault;
const KEYS=['unwantedAd','feedSpam','bait','lowSignal','useful','original','risk','sufficient'];
const scores=extra=>Object.fromEntries(KEYS.map(k=>[k,k==='sufficient'?0.99:0.01]).concat(Object.entries(extra||{})));
const result=extra=>({model:'jev-test-fixture',scores:scores(extra),usage:{input_tokens:1,output_tokens:0},latencyMs:1});
const settings=patch=>C.sanitizeSettings({...C.DEFAULTS,...patch,categories:{...(patch||{}).categories||{}}});
const record=patch=>({site:'x',id:'p1',author:'@a',text:'A useful post about testing.',mediaAlt:'',quotedText:'',truncated:false,context:'feed',sponsored:false,linkDomains:[],...patch});
const adVerified=patch=>C.sanitizeAdEvidence({adapter:'x',status:'verified',markerKind:'x_is_promoted_attribute',selectorId:'x-attr-is-promoted',ownerMatched:true,renderedLabel:null,evidenceKind:'platform_metadata',scope:'outer_post',...patch},'x');
const sanitized=patch=>C.sanitizeRecord(record(patch),'x');

test('release, rubric, detector, extraction, policy and schema versions are separate',()=>{
  assert.equal(C.VERSION,'3.3.0');
  assert.equal(C.RUBRIC_VERSION,'feed-v2.2.0');
  assert.equal(C.POLICY_VERSION,'policy-3.3.0');
  assert.equal(C.AD_DETECTOR_VERSION,'ad-3.0.0');
  assert.equal(C.EXTRACTION_VERSION,'extract-3.3.0');
  assert.equal(C.SETTINGS_VERSION,6);
  assert.equal(C.RUNTIME_VERSION,6);
  assert.equal(C.DIAGNOSTICS_VERSION,8);
});

test('host matching rejects lookalikes and accepts subdomains',()=>{
  assert.equal(C.siteForHost('x.com'),'x');
  assert.equal(C.siteForHost('mobile.twitter.com'),'x');
  assert.equal(C.siteForHost('www.reddit.com'),'reddit');
  assert.equal(C.siteForHost('x.com.evil.test'),null);
  assert.equal(C.siteForHost('evilx.com'),null);
  assert.equal(C.siteForURL('http://x.com/home'),null);
  assert.equal(C.siteForURL('https://x.com/home'),'x');
});

test('private routes are detected including percent-encoded paths',()=>{
  for(const url of ['https://x.com/messages','https://x.com/i/chat/5','https://www.reddit.com/chat','https://www.linkedin.com/messaging/','https://x.com/%6dessages']){
    assert.equal(C.isPrivateRoute(url),true,url);
  }
  assert.equal(C.isPrivateRoute('https://x.com/home'),false);
  assert.equal(C.isPrivateRoute('not a url'),true);
});

test('settings sanitization keeps bounds, resets versions and ignores junk keys',()=>{
  const dirty=JSON.parse('{"__proto__":{"polluted":true},"version":2,"consent":"yes","concurrency":99,"dailyLimit":1,"cacheMinutes":-5,"model":"gpt","sites":["x","youtube","x"],"allowedAuthors":["x:allowed","bad key","y:other"],"categories":{"promotion":{"mode":"collapse","threshold":0.1},"risk":{"mode":"nope","threshold":"0.9"}}}');
  const s=C.sanitizeSettings(dirty);
  assert.equal(s.version,6);
  assert.equal(s.consent,false);
  assert.equal(s.concurrency,12);
  assert.equal(s.dailyLimit,10);
  assert.equal(s.cacheMinutes,0);
  assert.equal(s.model,'jev-latest');
  assert.deepEqual(s.sites,['x']);
  assert.deepEqual(s.allowedAuthors,['x:allowed','y:other']);
  assert.equal(Object.keys(s.categories).length,7);
  assert.equal(s.categories.risk.mode,'collapse');
  assert.equal(s.categories.risk.threshold,0.94);
  assert.equal(s.categories.unwantedAd.threshold,0.85);
  assert.equal(s.hudMode,'compact');
  assert.equal(s.cosmeticEnabled,true);
  assert.equal(s.cosmeticFilters.rules.length,0);
  assert.deepEqual(s.revisions,{settings:0,ui:0,cosmetic:0,recovery:0});
  assert.equal(({}).polluted,undefined);
});

test('legacy settings migrate without mapping old promotion thresholds onto unwanted advertising',()=>{
  const legacy={version:2,enabled:true,consent:true,sites:['x'],preset:'custom',mode:'filter',labelledAds:true,model:'jev-latest',showStatus:true,
    protectUseful:true,profileMode:'normal',concurrency:4,dailyLimit:120,cacheMinutes:60,customInstruction:'no memes',cosmeticRules:'x.com##.ad',
    allowedAuthors:['x:friend'],categories:{promotion:{mode:'collapse',threshold:0.55},spam:{mode:'collapse',threshold:0.6},bait:{mode:'collapse',threshold:0.7}}};
  const s=C.migrateSettings(legacy);
  assert.equal(s.version,6);
  assert.equal(s.consent,true);
  assert.deepEqual(s.sites,['x']);
  assert.deepEqual(s.allowedAuthors,['x:friend']);
  assert.equal(s.customInstruction,'no memes');
  assert.equal(s.hudMode,'compact','showStatus true keeps the compact panel');
  assert.equal(s.cosmeticRules,undefined,'the legacy text field is gone');
  assert.equal(s.cosmeticFilters.rules.length,1);
  assert.equal(s.cosmeticFilters.rules[0].host,'x.com');
  assert.equal(s.cosmeticFilters.rules[0].selector,'.ad');
  assert.equal(s.cosmeticFilters.rules[0].status,'quarantined','legacy rules must never apply before review');
  assert.equal(s.cosmeticFilters.rules[0].source,'legacy');
  assert.equal(s.cosmeticFilters.rules[0].reason,'legacy_unvalidated');
  assert.equal(s.profileMode,'normal');
  assert.equal(s.concurrency,4);
  assert.equal(s.dailyLimit,120);
  assert.equal(s.cacheMinutes,60);
  assert.equal(s.preset,'balanced');
  assert.equal(s.categories.unwantedAd.threshold,0.85);
  assert.equal(s.categories.unwantedAd.mode,'collapse');
  assert.equal(s.categories.feedSpam.threshold,0.9);
  assert.equal(s.categories.bait.threshold,0.88);
});

test('legacy aggressive and observe presets migrate to their 2.1 equivalents',()=>{
  const aggressive=C.migrateSettings({version:2,preset:'aggressive',enabled:true,consent:false,sites:[]});
  assert.equal(aggressive.preset,'aggressive');
  assert.equal(aggressive.categories.feedSpam.threshold,0.85);
  assert.equal(aggressive.categories.bait.mode,'collapse');
  const observe=C.migrateSettings({version:2,preset:'observe',mode:'observe',enabled:true,consent:false,sites:[]});
  assert.equal(observe.preset,'observe');
  assert.equal(observe.mode,'observe');
});

test('record sanitization clamps fields and rejects anonymous empty posts',()=>{
  const r=C.sanitizeRecord({site:'x',id:'i'.repeat(400),author:'a'.repeat(300),text:'t'.repeat(9000),mediaAlt:'m'.repeat(3000),quotedText:'q'.repeat(4000),truncated:'yes',context:'weird',sponsored:true,linkDomains:['ok.com','bad host','ok.com',...Array(10).fill('x.com')]});
  assert.equal(r.id.length,250);
  assert.equal(r.author.length,120);
  assert.equal(r.text.length,6000);
  assert.equal(r.mediaAlt.length,1200);
  assert.equal(r.quotedText.length,2500);
  assert.equal(r.truncated,false);
  assert.equal(r.context,'feed');
  assert.equal(r.sponsored,false);
  assert.equal(r.adEvidence.status,'ambiguous','legacy boolean is never verified');
  assert.deepEqual(r.linkDomains,['ok.com','x.com']);
  assert.equal(C.sanitizeRecord({site:'youtube',text:'hi'}),null);
  assert.equal(C.sanitizeRecord({site:'x',text:'',mediaAlt:'',quotedText:'',sponsored:false}),null);
});

test('ad evidence stays verified only with ownership, scope and a known marker',()=>{
  const ok=sanitized({adEvidence:adVerified()});
  assert.equal(ok.sponsored,true);
  assert.equal(ok.adEvidence.status,'verified');
  assert.equal(ok.adEvidence.detectorVersion,'ad-3.0.0');
  const noOwner=sanitized({adEvidence:adVerified({ownerMatched:false})});
  assert.equal(noOwner.adEvidence.status,'ambiguous');
  assert.equal(noOwner.sponsored,false);
  const quoted=sanitized({adEvidence:adVerified({scope:'quote'})});
  assert.equal(quoted.adEvidence.status,'ambiguous');
  const unknownMarker=sanitized({adEvidence:adVerified({markerKind:'x_placement_tracking',evidenceKind:'none'})});
  assert.equal(unknownMarker.adEvidence.status,'ambiguous');
  const legacy=sanitized({sponsored:true});
  assert.equal(legacy.adEvidence.status,'ambiguous');
  assert.equal(legacy.sponsored,false);
  assert.equal(C.sanitizeRecord({site:'x',text:'',sponsored:true}),null,'an unverified legacy flag cannot make an empty record usable');
});

test('request shape uses the 2.1 features with a bounded instruction budget',()=>{
  const body=C.buildRequest(record({}),settings());
  assert.deepEqual(Object.keys(body.questions),KEYS);
  assert.equal(body.model,'jev-latest');
  let chars=0;
  for(const key of KEYS){
    assert.equal(body.questions[key].type,'noul');
    assert.match(body.questions[key].instructions,/untrusted/);
    chars+=body.questions[key].instructions.length;
  }
  assert.ok(chars<1900,`instruction boilerplate too large: ${chars}`);
  assert.equal(body.state.post_text,'A useful post about testing.');
  assert.equal(body.state.quoted_post_text,'');
  assert.equal(body.state.platform_sponsored_marker_observed,false);
});

test('quoted content is transmitted separately from the author text',()=>{
  const body=C.buildRequest(record({text:'I disagree with this claim.',quotedText:'Send your seed phrase to double your coins.'}),settings());
  assert.equal(body.state.post_text,'I disagree with this claim.');
  assert.equal(body.state.quoted_post_text,'Send your seed phrase to double your coins.');
  assert.match(body.questions.risk.instructions,/main author|quoted/i);
});

test('redaction masks emails, handles, credentials and links',()=>{
  const state=C.inferenceState(record({text:'Write to me@example.com or @person, key sk_live_abcdefghijklmnop, see https://example.com/path'}));
  assert.ok(state.post_text.includes('[email]'));
  assert.ok(state.post_text.includes('[mention]'));
  assert.ok(state.post_text.includes('[credential]'));
  assert.ok(state.post_text.includes('[link:example.com]'));
});

test('custom instruction adds a ninth question while it is set',()=>{
  const off=C.buildRequest(record({}),settings({customInstruction:''}));
  assert.equal(Object.keys(off.questions).length,8);
  const on=C.buildRequest(record({}),settings({customInstruction:'Empty keyword-begging posts.'}));
  assert.equal(Object.keys(on.questions).length,9);
  assert.match(on.questions.custom.instructions,/Empty keyword-begging posts/);
});

test('strict response parser rejects malformed answers and accepts valid ones',()=>{
  const answers=Object.fromEntries(KEYS.map(k=>[k,{type:'noul',noul:0.5}]));
  const good={model:'jev-1',answers,usage:{input_tokens:5,output_tokens:1}};
  assert.deepEqual(Object.keys(C.parseResponse(good,KEYS).scores),KEYS);
  for(const bad of [null,{}, {model:'gpt-4',answers}, {model:'jev-1',answers:{}}, {...good,answers:{...answers,risk:{type:'noul',noul:2}}}, {...good,model:'bad model!'}]){
    assert.throws(()=>C.parseResponse(bad,KEYS));
  }
  const usage=C.parseResponse({model:'jev-1',answers,usage:{input_tokens:-5,output_tokens:'x'}},KEYS).usage;
  assert.deepEqual(usage,{input_tokens:0,output_tokens:0});
});

test('API01: shuffled named answers keep their exact key mapping',()=>{
  const sentinels={unwantedAd:0.11,feedSpam:0.22,bait:0.33,lowSignal:0.44,useful:0.55,original:0.66,risk:0.77,sufficient:0.88};
  const keys=Object.keys(sentinels);
  const shuffled=[...keys].sort(()=>0.5-Math.random());
  const answers={};
  for(const key of shuffled)answers[key]={type:'noul',noul:sentinels[key]};
  const parsed=C.parseResponse({model:'jev-1',answers,usage:{input_tokens:1,output_tokens:0}},KEYS);
  for(const key of keys)assert.equal(parsed.scores[key],sentinels[key],`${key} must not drift`);
});

test('API02: malformed probability values fail closed instead of being coerced',()=>{
  const base=key=>Object.fromEntries(KEYS.map(k=>[k,{type:'noul',noul:0.5}]));
  const cases=[
    [{...base(),risk:{type:'noul',noul:Number.NaN}},'NaN'],
    [{...base(),risk:{type:'noul',noul:Number.POSITIVE_INFINITY}},'Infinity'],
    [{...base(),risk:{type:'noul',noul:null}},'null'],
    [{...base(),risk:{type:'noul',noul:'0.9'}},'string coercion'],
    [{...base(),risk:{type:'noul',noul:-0.01}},'below range'],
    [{...base(),risk:{type:'noul',noul:1.01}},'above range'],
    [{...base(),risk:{type:'choice',noul:0.9}},'wrong answer type'],
    [base(),'missing values stay'],
    [[...KEYS.map(k=>[k,0.5])],'array instead of object']
  ];
  for(const [answers,label] of cases){
    if(label==='missing values stay'){
      const trimmed=base();
      delete trimmed.bait;
      assert.throws(()=>C.parseResponse({model:'jev-1',answers:trimmed},KEYS),undefined,'a missing key must not be filled with a default');
      continue;
    }
    assert.throws(()=>C.parseResponse({model:'jev-1',answers},KEYS),undefined,label);
  }
});

test('API03: exact zeros and ones survive parsing and policy',()=>{
  const answers=Object.fromEntries(KEYS.map(k=>[k,{type:'noul',noul:k==='risk'||k==='feedSpam'?0:1}]));
  const parsed=C.parseResponse({model:'jev-1',answers,usage:{input_tokens:0,output_tokens:0}},KEYS);
  assert.equal(parsed.scores.risk,0);
  assert.equal(parsed.scores.feedSpam,0);
  assert.equal(parsed.scores.sufficient,1);
  assert.equal(parsed.scores.useful,1);
  const d=C.decide(record({}),parsed,settings());
  assert.equal(d.action,'allow');
});

test('decisions fail open when no model judgment is available',()=>{
  const d=C.decide(record({}),null,settings());
  assert.equal(d.action,'allow');
  assert.equal(d.source,'unclassified');
  assert.equal(d.rule,'no_model_judgment');
});

test('platform-labelled ads collapse locally only with verified evidence',()=>{
  const d=C.decide(sanitized({adEvidence:adVerified()}),null,settings());
  assert.equal(d.action,'collapse');
  assert.equal(d.source,'local');
  assert.equal(d.rule,'platform_labelled_ad');
  assert.equal(d.category,'unwantedAd');
  assert.equal(d.adEvidence.markerKind,'x_is_promoted_attribute');
  const off=C.decide(sanitized({adEvidence:adVerified()}),null,settings({labelledAds:false}));
  assert.equal(off.action,'allow');
  const legacy=C.decide(record({sponsored:true}),null,settings());
  assert.equal(legacy.action,'allow','an unverified legacy flag never collapses');
  assert.equal(legacy.source,'unclassified');
  const ambiguous=C.decide(sanitized({scoreCraft:true}),null,settings());
  assert.equal(ambiguous.action,'allow');
});

test('insufficient evidence keeps the post regardless of other scores',()=>{
  const d=C.decide(record({}),result({sufficient:0.2,feedSpam:0.99,risk:0.99}),settings());
  assert.equal(d.action,'allow');
  assert.equal(d.rule,'insufficient_evidence');
});

test('threshold boundaries are exact for every category',()=>{
  assert.equal(C.decide(record({}),result({feedSpam:0.9}),settings()).action,'collapse');
  assert.equal(C.decide(record({}),result({feedSpam:0.899}),settings()).action,'allow');
  const lowAd=C.decide(record({}),result({unwantedAd:0.99,feedSpam:0.7}),settings());
  assert.equal(lowAd.action,'collapse');
  assert.equal(lowAd.rule,'unwanted_ad_low_value');
  assert.equal(C.decide(record({}),result({unwantedAd:0.849,feedSpam:0.7}),settings()).action,'allow');
  const bait=C.decide(record({}),result({bait:0.88}),settings());
  assert.equal(bait.action,'dim');
  assert.equal(bait.rule,'manipulative_bait');
  assert.equal(C.decide(record({}),result({lowSignal:0.99}),settings()).action,'allow');
});

test('protection thresholds are inclusive and documented',()=>{
  const s=settings();
  const conflicted=scores=>({...scores,feedSpam:0.95});
  const usefulBoundary=C.decide(record({}),result(conflicted({useful:0.65})),s);
  assert.equal(usefulBoundary.protectionEligible,true);
  assert.equal(usefulBoundary.action,'dim');
  assert.equal(usefulBoundary.rule,'feed_spam_conflict');
  const usefulBelow=C.decide(record({}),result(conflicted({useful:0.649})),s);
  assert.equal(usefulBelow.protectionEligible,false);
  assert.equal(usefulBelow.action,'collapse');
  const originalBoundary=C.decide(record({}),result(conflicted({original:0.7})),s);
  assert.equal(originalBoundary.protectionEligible,true);
  const originalBelow=C.decide(record({}),result(conflicted({original:0.699})),s);
  assert.equal(originalBelow.protectionEligible,false);
  const disabled=C.decide(record({}),result({feedSpam:0.95,useful:0.9}),settings({protectUseful:false}));
  assert.equal(disabled.action,'collapse','protection stays a setting, not a hard lock');
  assert.equal(disabled.protectionEligible,true);
  assert.equal(disabled.protected,false);
});

test('paused, allowlisted and revealed posts bypass every rule',()=>{
  const spam=result({feedSpam:0.99});
  assert.equal(C.decide(record({}),spam,settings({enabled:false})).reason,'Filtering is paused');
  const list=settings({allowedAuthors:['x:@a']});
  assert.equal(C.decide(record({}),spam,list).source,'allowlist');
  assert.equal(C.decide(record({}),spam,settings(),{revealed:true}).source,'override');
});

test('muting an author is deterministic, local and fully reversible',()=>{
  const muted=settings({blockedAuthors:['x:@a']});
  const d=C.decide(record({}),result({}),muted);
  assert.equal(d.action,'collapse');
  assert.equal(d.rule,'author_muted');
  assert.equal(d.source,'author');
  assert.equal(d.category,'custom');
  assert.equal(C.decide(record({}),null,muted).rule,'author_muted','a mute needs no provider result');
  assert.equal(C.decide(record({author:'@A'}),result({}),muted).rule,'author_muted','author keys are lowercased');
  const observed=C.decide(record({}),result({}),settings({blockedAuthors:['x:@a'],mode:'observe'}));
  assert.equal(observed.action,'allow');
  assert.equal(observed.wouldAction,'collapse');
  assert.equal(C.decide(record({}),result({}),muted,{revealed:true}).rule,'kept_by_you');
  const both=settings({allowedAuthors:['x:@a'],blockedAuthors:['x:@a']});
  assert.deepEqual(both.blockedAuthors,[]);
  assert.equal(C.decide(record({}),result({}),both).rule,'author_allowlisted');
  assert.notEqual(C.decide(record({author:'@b'}),result({}),muted).rule,'author_muted');
});

test('muted and allowed author lists stay bounded and validated',()=>{
  const s=settings({blockedAuthors:['x:ok','bad key','y:ok','x:ok',42]});
  assert.deepEqual(s.blockedAuthors,['x:ok','y:ok']);
  const many=settings({blockedAuthors:Array.from({length:600},(_,i)=>'x:name'+i)});
  assert.equal(many.blockedAuthors.length,500);
  const migrated=C.migrateSettings({version:4,consent:true,sites:['x'],allowedAuthors:['x:@friend'],cosmeticFilters:{version:3,revision:2,rules:[]}});
  assert.equal(migrated.version,6);
  assert.deepEqual(migrated.blockedAuthors,[]);
  assert.deepEqual(migrated.allowedAuthors,['x:@friend']);
  assert.equal(migrated.cosmeticFilters.revision,2,'v4 settings keep their cosmetic rules on upgrade');
});

test('observe mode records the intended action without allowing a hide',()=>{
  const patch=C.presetPatch('observe');
  const s=C.sanitizeSettings({...C.DEFAULTS,...patch});
  const d=C.decide(record({}),result({feedSpam:0.99}),s);
  assert.equal(d.action,'allow');
  assert.equal(d.wouldAction,'collapse');
  assert.match(d.reason,/Observe only/);
});

test('decision exposes truthful rule names and protection flags',()=>{
  const kept=C.decide(record({}),result({unwantedAd:0.9,useful:0.9}),settings());
  assert.equal(kept.rule,'useful_or_original_protection');
  assert.equal(kept.protected,true);
  assert.equal(kept.protectionEligible,true);
  assert.equal(kept.usefulPromotion,true);
  const spam=C.decide(record({}),result({feedSpam:0.95}),settings());
  assert.equal(spam.rule,'feed_spam');
  assert.equal(spam.category,'feedSpam');
  const conflict=C.decide(record({}),result({feedSpam:0.95,useful:0.8}),settings());
  assert.equal(conflict.rule,'feed_spam_conflict');
  assert.equal(conflict.conflict,true);
  assert.equal(conflict.action,'dim');
  assert.equal(conflict.protected,false);
  assert.equal(conflict.protectionEligible,true);
  const r1=C.decide(record({}),result({unwantedAd:0.83,feedSpam:0.83,bait:0.81,lowSignal:0.91,useful:0.28,original:0.26,risk:0.61,sufficient:0.68}),settings());
  assert.equal(r1.action,'allow');
  assert.equal(r1.rule,'below_noise_thresholds','elevated but sub-threshold noise is not called promotion alone');
  assert.equal(r1.source,'policy');
  assert.equal(r1.protectionEligible,false);
  const promoAlone=C.decide(record({}),result({unwantedAd:0.65,feedSpam:0.1,bait:0.05,risk:0.02}),settings());
  assert.equal(promoAlone.action,'allow');
  assert.equal(promoAlone.rule,'promotion_signal_alone');
  assert.equal(promoAlone.source,'protection');
});

test('cache identities ignore author/id/context but include content, model and custom rule',async()=>{
  const s=settings();
  const a=await C.cacheKey(record({id:'1',author:'@a',context:'feed'}),s);
  const b=await C.cacheKey(record({id:'2',author:'@b',context:'profile'}),s);
  assert.equal(a,b);
  assert.notEqual(a,await C.cacheKey(record({text:'Different text.'}),s));
  assert.notEqual(a,await C.cacheKey(record({}),settings({model:'jev-next'})));
  assert.notEqual(a,await C.cacheKey(record({}),settings({customInstruction:'Exclude memes'})));
  const promoted=await C.cacheKey(sanitized({adEvidence:adVerified()}),s);
  assert.notEqual(a,promoted,'verified platform evidence is part of the semantic input');
  const promotedAgain=await C.cacheKey(sanitized({adEvidence:adVerified()}),s);
  assert.equal(promoted,promotedAgain);
  assert.equal(a,await C.cacheKey(record({}),settings({categories:{feedSpam:{mode:'collapse',threshold:0.81}}})),'threshold tweaks reuse cached raw scores');
});

test('feedback keys are stable per visible post and change on edits',async()=>{
  const a=await C.feedbackKey(record({context:'feed'}));
  assert.equal(a,await C.feedbackKey(record({context:'profile'})));
  assert.notEqual(a,await C.feedbackKey(record({text:'Edited text.'})));
  assert.notEqual(await C.feedbackKey(record({id:'1'})),await C.feedbackKey(record({id:'2'})));
});

test('cosmetic rules accept only safe domain##selector lines',()=>{
  const parsed=C.parseCosmeticRules('! comment\nx.com##.promo\nhttp://bad.com##.x\nx.com##body\nx.com##.ok:hover\nreddit.com##shreddit-post\n[data-adblock]\nx.com##.bad{color:red}');
  assert.deepEqual(parsed.rules.map(r=>r.line),['x.com##.promo','x.com##.ok:hover','reddit.com##shreddit-post']);
  assert.equal(parsed.errors.length,3);
  assert.equal(C.matchingRules('x.com##.promo\nreddit.com##.post','www.x.com')[0].selector,'.promo');
  assert.equal(C.matchingRules('x.com##.promo','youtube.com').length,0);
});

test('presets change thresholds but never disable protection',()=>{
  const balanced=C.sanitizeSettings({...C.DEFAULTS,...C.presetPatch('balanced')});
  const aggressive=C.sanitizeSettings({...C.DEFAULTS,...C.presetPatch('aggressive')});
  assert.equal(balanced.protectUseful,true);
  assert.equal(aggressive.protectUseful,true);
  assert.ok(aggressive.categories.unwantedAd.threshold<balanced.categories.unwantedAd.threshold);
  assert.equal(C.presetPatch('custom').preset,'custom');
});

test('page context distinguishes profiles, threads and feeds',()=>{
  assert.equal(C.pageContext('https://x.com/home'),'feed');
  assert.equal(C.pageContext('https://x.com/someone/status/123'),'thread');
  assert.equal(C.pageContext('https://x.com/someone'),'profile');
  assert.equal(C.pageContext('https://x.com/messages'),'feed');
  assert.equal(C.pageContext('https://www.reddit.com/user/abc'),'profile');
  assert.equal(C.pageContext('https://www.linkedin.com/in/abc'),'profile');
});

test('trusted pages, error codes and key validation stay strict',()=>{
  const id='a'.repeat(32);
  assert.equal(C.trustedPage({id,url:`chrome-extension://${id}/options.html`},id),true);
  assert.equal(C.trustedPage({id,url:`chrome-extension://${id}/content.js`},id),false);
  assert.equal(C.trustedPage({id:'b'.repeat(32),url:`chrome-extension://${id}/options.html`},id),false);
  assert.equal(C.userError(new Error('boom')).code,'INTERNAL_ERROR');
  assert.equal(C.userError({code:'AUTH'}).code,'AUTH');
  assert.ok(!C.userError(new Error('secret text')).message.includes('secret text'));
  assert.equal(C.validKey('short'),false);
  assert.equal(C.validKey('a'.repeat(9)),true);
  assert.equal(C.validKey('bad key'),false);
});

test('vault seals and opens with a strong passphrase only',async()=>{
  const vault=await V.seal('dummy-encrypted-key','long protected passphrase');
  assert.equal(await V.open(vault,'long protected passphrase'),'dummy-encrypted-key');
  await assert.rejects(()=>V.open(vault,'wrong password'),(e)=>e.message==='VAULT_ERROR');
  await assert.rejects(()=>V.open({...vault,iterations:1000},'long protected passphrase'),(e)=>e.message==='VAULT_ERROR');
  await assert.rejects(()=>V.seal('dummy-encrypted-key','short'),(e)=>e.message==='PASSPHRASE');
});

test('vault validate accepts only complete sealed backups',async()=>{
  const vault=await V.seal('dummy-encrypted-key','long protected passphrase');
  const copy=V.validate(vault);
  assert.deepEqual(copy,vault);
  assert.notEqual(copy,vault,'a normalized clone is returned');
  assert.equal(await V.open(copy,'long protected passphrase'),'dummy-encrypted-key');
  for(const bad of [
    {...vault,version:2},
    {...vault,kdf:'PLAIN'},
    {...vault,iterations:1},
    {...vault,salt:'AAAA'},
    {...vault,iv:'AAAA'},
    {...vault,ciphertext:'AAAA'},
    {...vault,ciphertext:'!'+vault.ciphertext},
  ])assert.throws(()=>V.validate(bad),(e)=>e.message==='VAULT_ERROR');
});
