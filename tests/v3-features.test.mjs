/** Version 3 features: cosmetic model, scoped settings, recovery, statuses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,post,sender,sleep} from './worker-harness.mjs';
import '../src/core.js';
const C=globalThis.FeedGateCore;
const base=()=>C.clone(C.DEFAULTS);
const settings=(patch={})=>C.sanitizeSettings({...base(),...patch});
const rule=(patch={})=>({id:'r-abc12345',host:'x.com',selector:'.promo',status:'active',source:'picker',reason:'user_created',createdAt:1,validatedAt:1,...patch});

test('cosmetic selector subset accepts scoped selectors and rejects unsafe syntax or protected roots',()=>{
  assert.equal(C.selectorProblem('.promo'),null);
  assert.equal(C.selectorProblem('#sidebar-promo'),null);
  assert.equal(C.selectorProblem('[data-testid="ad-slot"]'),null);
  assert.equal(C.selectorProblem('section .link-body'),null);
  assert.equal(C.selectorProblem('body'),'protected_target');
  assert.equal(C.selectorProblem('main'),'protected_target');
  assert.equal(C.selectorProblem('#root'),'protected_target');
  assert.equal(C.selectorProblem('.layout'),'protected_target');
  assert.equal(C.selectorProblem('[role="main"]'),'protected_target');
  assert.equal(C.selectorProblem('div:has(main)'),'unsupported_syntax');
  assert.equal(C.selectorProblem('.promo:hover'),'unsupported_syntax');
  assert.equal(C.selectorProblem('a, b'),'multiple_targets_not_supported');
  assert.equal(C.selectorProblem('a'.repeat(301)),'selector_too_long');
  assert.equal(C.selectorProblem('   '),'empty_selector');
});

test('cosmetic rule sanitization pins identity, enums and safety checks',()=>{
  const kept=C.sanitizeCosmeticRule(rule());
  assert.equal(kept.id,'r-abc12345');
  assert.equal(kept.status,'active');
  assert.equal(kept.source,'picker');
  assert.equal(C.sanitizeCosmeticRule(rule({status:'weird',source:'weird'})).status,'quarantined');
  assert.equal(C.sanitizeCosmeticRule(rule({status:'weird',source:'weird'})).source,'import');
  assert.equal(C.sanitizeCosmeticRule(rule({id:'bad'})),null);
  assert.equal(C.sanitizeCosmeticRule(rule({host:'evil.example'})),null);
  assert.equal(C.sanitizeCosmeticRule(rule({selector:'body'})),null);
  assert.equal(C.sanitizeCosmeticRule(rule({selector:'div:has(main)'})),null);
  assert.equal(C.sanitizeCosmeticRule(rule({reason:'x'.repeat(200)})).reason.length,80);
});

test('only active rules matching the host apply, and the master switch stops all of them',()=>{
  const s=settings({cosmeticFilters:{version:3,revision:0,rules:[
    rule({id:'r-active01'}),
    rule({id:'r-disabled1',status:'disabled'}),
    rule({id:'r-reddit01',host:'reddit.com'}),
    rule({id:'r-quarant1',status:'quarantined'})
  ]}});
  assert.deepEqual(C.activeCosmeticRules(s,'x.com').map(r=>r.id),['r-active01']);
  assert.deepEqual(C.activeCosmeticRules(s,'www.x.com').map(r=>r.id),['r-active01']);
  assert.deepEqual(C.activeCosmeticRules(s,'reddit.com').map(r=>r.id),['r-reddit01']);
  const off=settings({cosmeticEnabled:false,cosmeticFilters:{version:3,revision:0,rules:[rule()]}});
  assert.deepEqual(C.activeCosmeticRules(off,'x.com'),[]);
});

test('legacy settings migrate to HUD modes and quarantined cosmetic review',()=>{
  const hidden=C.migrateSettings({version:3,showStatus:false,cosmeticRules:'x.com##.ad'});
  assert.equal(hidden.version,4);
  assert.equal(hidden.hudMode,'hidden');
  assert.equal(hidden.cosmeticFilters.rules.length,1);
  assert.equal(hidden.cosmeticFilters.rules[0].status,'quarantined');
  assert.equal(hidden.cosmeticFilters.rules[0].source,'legacy');
  assert.equal(hidden.cosmeticFilters.rules[0].reason,'legacy_unvalidated');
  const kept=C.migrateSettings({version:3,hudMode:'expanded'});
  assert.equal(kept.hudMode,'expanded');
  assert.deepEqual(kept.revisions,{settings:1,ui:1,cosmetic:1,recovery:1});
  const junk=C.migrateSettings({version:3,hudMode:'floating'});
  assert.equal(junk.hudMode,'compact');
});

test('record kinds and cache identity separate link cards from entries',async()=>{
  const link=C.sanitizeRecord({site:'wykop',text:'Title',kind:'entry'},'wykop');
  assert.equal(link.kind,'entry');
  const junk=C.sanitizeRecord({site:'wykop',text:'Title',kind:'junk'},'wykop');
  assert.equal(junk.kind,'post');
  const s=settings();
  const a=await C.cacheKey(C.sanitizeRecord({site:'wykop',text:'Same text',kind:'link'},'wykop'),s);
  const b=await C.cacheKey(C.sanitizeRecord({site:'wykop',text:'Same text',kind:'entry'},'wykop'),s);
  assert.notEqual(a,b);
});

test('new recovery and rule error codes stay fixed and never echo raw text',()=>{
  assert.equal(C.userError(new Error('STALE_SETTINGS')).code,'STALE_SETTINGS');
  assert.equal(C.userError(new Error('UNSAFE_SELECTOR')).code,'UNSAFE_SELECTOR');
  assert.equal(C.userError(new Error('RULE_NOT_FOUND')).code,'RULE_NOT_FOUND');
  assert.equal(C.userError(new Error('RECOVERY_ACTIVE')).code,'RECOVERY_ACTIVE');
  const unknown=C.userError(new Error('secret boom'));
  assert.equal(unknown.code,'INTERNAL_ERROR');
  assert.ok(!unknown.message.includes('boom'));
});

test('Wykop is a first class beta site with bounded, reviewed boundaries',()=>{
  assert.equal(C.SITE_DEFS.wykop.status,'beta');
  assert.deepEqual(C.originsForSite('wykop'),['https://wykop.pl/*','https://www.wykop.pl/*']);
  assert.equal(C.siteForURL('https://wykop.pl/link/123/title'),'wykop');
  assert.equal(C.siteForHost('www.wykop.pl'),'wykop');
  assert.equal(C.isPrivateRoute('https://wykop.pl/logowanie'),true);
  assert.equal(C.isPrivateRoute('https://wykop.pl/rejestracja'),true);
  assert.equal(C.isPrivateRoute('https://wykop.pl/link/123/title'),false);
  assert.equal(C.isPrivateRoute('https://wykop.pl/mikroblog'),false);
});

test('Wykop ad evidence can never become a verified local collapse',()=>{
  const claimed=(markerKind)=>C.sanitizeAdEvidence({adapter:'wykop',status:'verified',markerKind,selectorId:'wykop-x',ownerMatched:true,renderedLabel:true,evidenceKind:'rendered_label',scope:'outer_post'},'wykop');
  assert.equal(claimed('wykop_expired_promotion_note').status,'ambiguous');
  assert.equal(claimed('wykop_ad_slot').status,'ambiguous');
  const record=C.sanitizeRecord({site:'wykop',text:'Link body',adEvidence:claimed('wykop_ad_slot')},'wykop');
  assert.equal(record.sponsored,false);
  const decision=C.decide(record,null,settings());
  assert.notEqual(decision.rule,'platform_labelled_ad');
});

test('rule lifecycle: add, edit, disable, delete, undo and revalidate',async()=>{
  const w=await createWorker();
  await w.enable();
  const added=await w.ok({type:'FG_ADD_RULE',selector:'.promo-card'},sender);
  const id=added.rule.id;
  assert.equal(added.rule.status,'active');
  assert.equal(added.rule.source,'picker');
  let st=await w.ok({type:'FG_STATUS'});
  await w.ok({type:'FG_RULE_UPDATE',id,patch:{status:'disabled'},expect:st.settings.revisions.cosmetic});
  st=await w.ok({type:'FG_STATUS'});
  assert.equal(st.settings.cosmeticFilters.rules.find(r=>r.id===id).status,'disabled');
  await w.ok({type:'FG_RULE_UPDATE',id,patch:{selector:'.promo-card-2'},expect:st.settings.revisions.cosmetic});
  st=await w.ok({type:'FG_STATUS'});
  const edited=st.settings.cosmeticFilters.rules.find(r=>r.id===id);
  assert.equal(edited.selector,'.promo-card-2');
  assert.ok(edited.validatedAt>=1);
  await assert.rejects(w.ok({type:'FG_RULE_UPDATE',id:'r-zzzzzzzz',patch:{status:'disabled'}}),/RULE_NOT_FOUND/);
  await w.ok({type:'FG_RULE_DELETE',id,expect:st.settings.revisions.cosmetic});
  st=await w.ok({type:'FG_STATUS'});
  assert.equal(st.settings.cosmeticFilters.rules.find(r=>r.id===id).status,'deleted');
  await w.ok({type:'FG_RULE_UNDO',id,expect:st.settings.revisions.cosmetic});
  st=await w.ok({type:'FG_STATUS'});
  const restored=st.settings.cosmeticFilters.rules.find(r=>r.id===id);
  assert.equal(restored.status,'quarantined');
  assert.equal(restored.reason,'undo_of_deletion');
  const revalidated=await w.ok({type:'FG_RULE_REVALIDATE',id,matchCount:3,reason:'ok'},sender);
  assert.equal(revalidated.status,'active');
  const orphaned=await w.ok({type:'FG_RULE_REVALIDATE',id,matchCount:0,reason:'ok'},sender);
  assert.equal(orphaned.status,'quarantined');
  assert.equal(orphaned.reason,'no_current_target');
  const unsafe=await w.ok({type:'FG_RULE_REVALIDATE',id,matchCount:2,reason:'unsafe_at_application'},sender);
  assert.equal(unsafe.status,'quarantined');
  assert.equal(unsafe.reason,'unsafe_at_application');
});

test('bulk cosmetic controls disable and delete without losing identity',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.ok({type:'FG_ADD_RULE',selector:'.one'},sender);
  await w.ok({type:'FG_ADD_RULE',selector:'.two'},sender);
  let st=await w.ok({type:'FG_STATUS'});
  await w.ok({type:'FG_RULES_DISABLE_ALL',expect:st.settings.revisions.cosmetic});
  st=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(st.settings.cosmeticFilters.rules.map(r=>r.status),['disabled','disabled']);
  await w.ok({type:'FG_RULES_DELETE_ALL',expect:st.settings.revisions.cosmetic});
  st=await w.ok({type:'FG_STATUS'});
  assert.equal(st.settings.cosmeticFilters.rules.length,0);
});

test('stale revisions are rejected instead of overwriting newer settings',async()=>{
  const w=await createWorker();
  await w.enable();
  const st=await w.ok({type:'FG_STATUS'});
  const expect=st.settings.revisions.settings;
  await assert.rejects(w.ok({type:'FG_PATCH_SETTINGS',patch:{mode:'observe'},domain:'settings',expect:expect-1}),/STALE_SETTINGS/);
  await w.ok({type:'FG_PATCH_SETTINGS',patch:{mode:'observe'},domain:'settings',expect});
  const after=await w.ok({type:'FG_STATUS'});
  assert.equal(after.settings.mode,'observe');
  assert.equal(after.settings.revisions.settings,expect+1);
});

test('settings domains keep HUD, cosmetic and recovery revisions independent',async()=>{
  const w=await createWorker();
  await w.enable();
  let st=await w.ok({type:'FG_STATUS'});
  const start=st.settings.revisions;
  await w.ok({type:'FG_PATCH_SETTINGS',patch:{feedsOpen:true},domain:'ui',expect:start.ui});
  st=await w.ok({type:'FG_STATUS'});
  assert.equal(st.settings.revisions.ui,start.ui+1);
  assert.equal(st.settings.revisions.settings,start.settings);
  assert.equal(st.settings.revisions.cosmetic,start.cosmetic);
  assert.equal(st.settings.feedsOpen,true);
});

test('recovery latches before cleanup and resume reports quarantined rules',async()=>{
  const w=await createWorker();
  await w.enable();
  let st=await w.ok({type:'FG_STATUS'});
  const first=await w.ok({type:'FG_RECOVER_SITE',site:'x',expect:st.settings.revisions.recovery});
  assert.equal(first.persisted,true);
  assert.equal(first.acknowledged,true);
  assert.equal(w.local.settings.recoverySites.includes('x'),true);
  assert.ok(w.events.extensionBroadcasts.some(m=>m.type==='FG_CONFIG_CHANGED'));
  const added=await w.ok({type:'FG_ADD_RULE',selector:'.later'},sender);
  await w.ok({type:'FG_RULE_REVALIDATE',id:added.rule.id,matchCount:0},sender);
  st=await w.ok({type:'FG_STATUS'});
  const resumed=await w.ok({type:'FG_RESUME_SITE',site:'x',expect:st.settings.revisions.recovery});
  assert.equal(resumed.resumed,true);
  assert.equal(resumed.quarantined,1);
  assert.equal(w.local.settings.recoverySites.includes('x'),false);
});

test('recovery pause is persisted even when a content script never acknowledges',async()=>{
  const w=await createWorker({silent:true});
  await w.enable();
  const started=Date.now();
  const result=await w.ok({type:'FG_RECOVER_SITE',site:'x'});
  assert.equal(result.persisted,true);
  assert.equal(result.acknowledged,false);
  assert.ok(Date.now()-started>=1400,'cleanup waits are bounded by a timeout');
});

test('reload with filtering paused refuses private routes and latches first',async()=>{
  const w=await createWorker({tabs:{3:'https://x.com/home',4:'https://x.com/messages'}});
  await assert.rejects(w.ok({type:'FG_RELOAD_PAUSED',tabId:4}),/PRIVATE_ROUTE/);
  const result=await w.ok({type:'FG_RELOAD_PAUSED',tabId:3});
  assert.equal(result.reloading,true);
  assert.ok(w.events.reloads.includes(3));
  const st=await w.ok({type:'FG_STATUS'});
  assert.equal(st.settings.recoverySites.includes('x'),true);
});

test('cosmetic events are counted and reject unknown kinds',async()=>{
  const w=await createWorker();
  await w.enable();
  for(const kind of ['applied','restored','rejected','breaker','undo'])await w.ok({type:'FG_COSMETIC_EVENT',kind,ruleRef:'r-abc12345',reason:'test_event'},sender);
  const st=await w.ok({type:'FG_STATUS'});
  assert.equal(st.metrics.cosmeticApplied,1);
  assert.equal(st.metrics.cosmeticRestored,1);
  assert.equal(st.metrics.cosmeticRejected,1);
  assert.equal(st.metrics.breakerActivations,1);
  const diagnostics=await w.ok({type:'FG_DIAGNOSTICS'});
  assert.equal(diagnostics.cosmeticEvents.length,5);
  await assert.rejects(w.ok({type:'FG_COSMETIC_EVENT',kind:'smashed'},sender),/INVALID_RECORD/);
});

test('site status reports honest reasons, revisions and effective flags',async()=>{
  const on=await createWorker({local:{settings:{...base(),sites:['x','wykop']}}});
  let st=await on.ok({type:'FG_STATUS'});
  const byId=list=>Object.fromEntries(list.map(s=>[s.site,s]));
  let states=byId(st.siteStates);
  assert.equal(states.x.reason,'ready');
  assert.equal(states.x.effective,true);
  assert.equal(states.reddit.reason,'not_selected');
  assert.equal(states.wykop.effective,true);
  const off=await createWorker({permissions:false,local:{settings:{...base(),sites:['x']}}});
  states=byId((await off.ok({type:'FG_STATUS'})).siteStates);
  assert.equal(states.x.reason,'permission_required');
  assert.equal(states.x.effective,false);
  const paused=await createWorker({local:{settings:{...base(),enabled:false,sites:['x']}}});
  states=byId((await paused.ok({type:'FG_STATUS'})).siteStates);
  assert.equal(states.x.reason,'engine_paused');
  const recovery=await createWorker({local:{settings:{...base(),sites:['x'],recoverySites:['x']}}});
  states=byId((await recovery.ok({type:'FG_STATUS'})).siteStates);
  assert.equal(states.x.reason,'recovery_pause');
  const stale=await createWorker({local:{settings:{...base(),sites:['reddit']},cleanup:{sites:['reddit']}}});
  states=byId((await stale.ok({type:'FG_STATUS'})).siteStates);
  assert.equal(states.reddit.reason,'refresh_required');
  assert.equal(states.reddit.effective,false);
});

test('exports are v4 while imports re-quarantine unverified rules and reject v1',async()=>{
  const w=await createWorker();
  const exported=await w.ok({type:'FG_EXPORT_SETTINGS'});
  assert.equal(exported.version,4);
  const data={format:'feedgate-settings',version:4,settings:{...base(),cosmeticFilters:{version:3,revision:0,rules:[
    rule({id:'r-keep0001',selector:'.keep',validatedAt:5}),
    rule({id:'r-review01',selector:'.review',validatedAt:0})
  ]}}};
  await w.ok({type:'FG_IMPORT_SETTINGS',data});
  const st=await w.ok({type:'FG_STATUS'});
  const rules=Object.fromEntries(st.settings.cosmeticFilters.rules.map(r=>[r.selector,r]));
  assert.equal(rules['.keep'].status,'active');
  assert.equal(rules['.review'].status,'quarantined');
  assert.equal(rules['.review'].reason,'imported_unverified');
  assert.equal(st.settings.consent,false);
  assert.deepEqual(st.settings.sites,[]);
  await assert.rejects(w.ok({type:'FG_IMPORT_SETTINGS',data:{format:'feedgate-settings',version:1,settings:{}}}),/INVALID_RECORD/);
});

test('history window reports retained and dropped while counters keep counting',async()=>{
  const w=await createWorker();
  await w.enable({concurrency:6,cacheMinutes:0});
  await Promise.all(Array.from({length:160},(_,i)=>w.classify(post('bulk post '+i,'b'+i))));
  const st=await w.ok({type:'FG_STATUS'});
  assert.equal(st.metrics.decisions,160);
  assert.equal(st.log.length,150);
  assert.equal(st.metrics.logDropped,10);
  const diagnostics=await w.ok({type:'FG_DIAGNOSTICS'});
  assert.deepEqual(diagnostics.logStats,{retained:150,capacity:150,dropped:10});
  const provider=diagnostics.provider;
  assert.equal(provider.unaccounted,Math.max(0,provider.requests-provider.classified-provider.cancellations-provider.errors));
});

test('a fresh content script hears recovery state and clears the refresh flag once',async()=>{
  const w=await createWorker({local:{settings:{...base(),sites:['x'],recoverySites:['x']},cleanup:{sites:['x']}}});
  const before=await w.ok({type:'FG_STATUS'});
  assert.equal(before.siteStates.find(s=>s.site==='x').reason,'recovery_pause');
  const first=await w.ok({type:'FG_GET_CONFIG'},sender);
  assert.equal(first.recoveryPaused,true);
  assert.equal(first.cleanupRequired,false);
  assert.deepEqual(w.local.cleanup.sites,[]);
  const second=await w.ok({type:'FG_GET_CONFIG'},sender);
  assert.equal(second.cleanupRequired,false);
});
