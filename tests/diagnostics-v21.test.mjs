import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,post,sender,trusted,sleep,adEvidenceVerified} from './worker-harness.mjs';

test('direct transport never opens a localhost bridge and verified local ads cost no API request',async()=>{
 const w=await createWorker();await w.enable();const r=await w.classify({...post('Labelled placement'),adEvidence:adEvidenceVerified});
 assert.equal(r.decision.source,'local');assert.equal(r.decision.rule,'platform_labelled_ad');assert.equal(w.calls.length,0);
 const d=await w.ok({type:'FG_DIAGNOSTICS'});assert.equal(d.connection.transport,'direct TypeSafe HTTPS');assert.equal(d.version,5);assert.equal(d.rubric,'feed-v2.1.0');
 assert.equal(d.build.release,'3.0.1');assert.equal(d.build.rubric,'feed-v2.1.0');assert.equal(d.build.policy,'policy-2.1.1');assert.equal(d.build.detector,'ad-3.0.0');assert.equal(d.build.extraction,'extract-3.0.0');assert.equal(d.build.schema,5);
 const local=d.decisions.find(x=>x.rule==='platform_labelled_ad');
 assert.equal(local.adEvidence.status,'verified');assert.equal(local.adEvidence.markerKind,'x_is_promoted_attribute');assert.equal(local.adEvidence.scope,'outer_post');assert.equal(local.protectionEligible,false);
});
test('diagnostics record rule names but omit secrets, text, author identities, custom rules and post hashes',async()=>{
 const w=await createWorker();await w.enable({customInstruction:'PERSONAL_FILTER_SECRET',allowedAuthors:['x:PRIVATE_AUTHOR']});
 await w.ok({type:'FG_ADD_RULE',selector:'.PRIVATE_SELECTOR'},sender);
 await w.classify({...post('SPAM_FIXTURE POST_BODY_SECRET'),author:'OBSERVED_AUTHOR_SECRET'});
 await w.ok({type:'FG_KEEP_POST',record:post('POST_BODY_SECRET')},sender);
 await w.ok({type:'FG_PAGE_STATS',stats:{observed:5,completed:4,state:'ready',lastError:{code:'secret-provider-error'}}},sender);
 const d=await w.ok({type:'FG_DIAGNOSTICS'}),raw=JSON.stringify(d);
 for(const secret of ['dummy-worker-test-key','POST_BODY_SECRET','PERSONAL_FILTER_SECRET','PRIVATE_SELECTOR','PRIVATE_AUTHOR','OBSERVED_AUTHOR_SECRET','secret-provider-error','https://x.com/home'])assert.ok(!raw.includes(secret),secret);
 for(const [hash] of w.local.keptPosts)assert.ok(!raw.includes(hash));
 const spam=d.decisions.find(x=>x.action==='collapse');
 assert.equal(spam.rule,'feed_spam');
 assert.equal(typeof spam.sufficient,'number');
 assert.equal(spam.protected,false);
 assert.equal(spam.adEvidence,null);
 assert.equal(typeof spam.protectionEligible,'boolean');
 assert.equal(d.pages[0].observed,5);assert.equal(d.pages[0].error,'INTERNAL_ERROR');assert.equal(d.settings.savedPostChoices,1);
});
test('content script cannot export diagnostics or obtain the key',async()=>{
 const w=await createWorker();await w.enable();assert.equal((await w.send({type:'FG_DIAGNOSTICS'},sender)).error.code,'FORBIDDEN');
});
test('saved keep choice survives worker and browser restart without saving raw content',async()=>{
 const w=await createWorker();await w.enable();const record=post('SPAM_FIXTURE PRIVATE_TEXT');
 await w.ok({type:'FG_KEEP_POST',record},sender);const d=await w.classify(record);
 assert.equal(d.decision.source,'override');assert.equal(w.calls.length,0);
 assert.ok(!JSON.stringify(w.local).includes('PRIVATE_TEXT'));
 const next=await createWorker({local:w.local});await next.enable();assert.equal((await next.classify(record)).decision.source,'override');assert.equal(next.calls.length,0);
 const edit=await next.classify(post('SPAM_FIXTURE EDITED_TEXT'));assert.equal(edit.decision.action,'collapse');assert.equal(next.calls.length,1);
});
test('resetting saved choices does not destroy the key or reset the API budget',async()=>{
 const w=await createWorker();await w.enable();await w.classify();await w.ok({type:'FG_KEEP_POST',record:post()},sender);
 await w.ok({type:'FG_RESET_FEEDBACK'});const status=await w.ok({type:'FG_STATUS'});
 assert.equal(status.keptPosts,0);assert.equal(status.keyReady,true);assert.equal(status.daily.requests,1);
});
test('provider verification resets when key changes, not when thresholds change',async()=>{
 const w=await createWorker();await w.enable();assert.equal((await w.ok({type:'FG_STATUS'})).verifiedAt,0);
 await w.classify();assert.ok((await w.ok({type:'FG_STATUS'})).verifiedAt>0);
 await w.ok({type:'FG_PATCH_SETTINGS',patch:{profileMode:'normal'}});assert.ok((await w.ok({type:'FG_STATUS'})).verifiedAt>0);
 await w.ok({type:'FG_SET_KEY',key:'replacement-test-key'});assert.equal((await w.ok({type:'FG_STATUS'})).verifiedAt,0);
});
test('worker derives profile context from actual current tab, not submitted record',async()=>{
 const w=await createWorker();await w.enable();w.tabs.set(1,{id:1,url:'https://x.com/builder'});
 const r=await w.classify({...post('SPAM_FIXTURE'),context:'feed'});assert.equal(r.decision.action,'dim');
});
test('legacy settings keep safe preferences but never reuse old thresholds',async()=>{
 const w=await createWorker({local:{settings:{version:1,consent:true,sites:['x'],categories:{promotion:{mode:'collapse',threshold:.5}}}},session:{runtimeState:{metrics:{requests:999},log:[{reason:'OLD'}]}}});
 const s=await w.ok({type:'FG_STATUS'});assert.equal(s.settings.version,4);assert.equal(s.settings.hudMode,'compact');assert.equal(s.settings.consent,true);assert.deepEqual(s.settings.sites,['x']);assert.equal(s.settings.categories.unwantedAd.threshold,.85);assert.equal(s.settings.categories.promotion,undefined);assert.equal(s.metrics.requests,0);
});
test('settings export format is explicitly v4, v3 and v2 imports migrate and v1 imports are rejected',async()=>{
 const w=await createWorker();const data=await w.ok({type:'FG_EXPORT_SETTINGS'});assert.equal(data.version,4);
 const r=await w.send({type:'FG_IMPORT_SETTINGS',data:{...data,version:1}});assert.equal(r.error.code,'INVALID_RECORD');
 const legacy={format:'feedgate-settings',version:2,settings:{version:2,consent:true,sites:['x'],categories:{promotion:{mode:'collapse',threshold:.5},spam:{mode:'collapse',threshold:.5}},allowedAuthors:['x:@friend'],dailyLimit:321}};
 const imported=await w.ok({type:'FG_IMPORT_SETTINGS',data:legacy});
 assert.equal(imported.settings.version,4);assert.equal(imported.settings.consent,false);assert.deepEqual(imported.settings.sites,[]);
 assert.equal(imported.settings.categories.unwantedAd.threshold,.85);assert.equal(imported.settings.categories.feedSpam.threshold,.9);
 assert.deepEqual(imported.settings.allowedAuthors,['x:@friend']);assert.equal(imported.settings.dailyLimit,321);
});
