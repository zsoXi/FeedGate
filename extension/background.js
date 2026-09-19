/* SPDX-License-Identifier: GPL-3.0-or-later */
import './core.js';
import './vault.js';
import './typesafe.js';

const C = globalThis.FeedGateCore;
const VAULT = globalThis.FeedGateVault;
const API = globalThis.FeedGateTypeSafe;
let settings = C.clone(C.DEFAULTS);
let apiKey = '';
let revision = 0;
let active = 0;
let cooldownUntil = 0;
let authRejected = false;
let queue = [];
let cache = new Map();
let inFlight = new Map();
let controllers = new Set();
let log = [];
let keptPosts = new Map();
let pageReports = new Map();
let cosmeticLog = [];
let cleanupSites = [];
let migratedFrom = 0;
let updateInfo = null;
let verifiedAt = 0;
let metrics = freshMetrics();
let persistTimer;
let changeTail = Promise.resolve();
let budgetTail = Promise.resolve();
let credentialEpoch = 0;
let credentialTail = Promise.resolve();
function commitCredential(stamp, fn) {
  const task = credentialTail.then(async () => {
    if (stamp !== credentialEpoch) throw new Error('ABORTED');
    return fn();
  });
  credentialTail = task.catch(() => {});
  return task;
}
const MAX_CACHE = 1600;
const MAX_QUEUE = 150;
const MAX_COSMETIC_LOG = 100;
const emptyDay = () => ({date:new Date().toISOString().slice(0,10),requests:0});
function freshMetrics() { return {decisions:0,protected:0,usefulPromotions:0,requests:0,classified:0,cacheHits:0,filterDecisions:0,errors:0,cancellations:0,logDropped:0,cosmeticApplied:0,cosmeticRestored:0,cosmeticRejected:0,breakerActivations:0,inputTokens:0,outputTokens:0,lastLatencyMs:0,lastModel:'',lastError:null}; }

const ready = (async () => {
  // Local holds preferences/ciphertext. Session holds the live key, scores and counters.
  // Neither area is exposed to content scripts.
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const local = await chrome.storage.local.get(['settings','keptPosts','cleanup','upgrade']);
  const session = await chrome.storage.session.get(['apiKey','runtimeState']);
  migratedFrom = C.object(local.settings) ? Math.round(Number(local.settings.version)||0) : 0;
  settings = local.settings ? C.migrateSettings(local.settings) : C.clone(C.DEFAULTS);
  if (C.object(local.cleanup) && Array.isArray(local.cleanup.sites)) {
    cleanupSites = local.cleanup.sites.filter((site) => typeof site === 'string' && C.SITE_DEFS[site]).slice(0, 8);
  }
  // One-time v3 upgrade notice: never re-offer on later restarts.
  if (migratedFrom > 0 && migratedFrom < C.SETTINGS_VERSION && !C.object(local.upgrade)) {
    await chrome.storage.local.set({upgrade:{from:migratedFrom,seenAt:Date.now()}});
  }
  if(Array.isArray(local.keptPosts)) keptPosts=new Map(local.keptPosts.filter(e=>Array.isArray(e)&&/^[a-f0-9]{64}$/.test(e[0])&&Number.isFinite(e[1])).slice(-2000));
  apiKey = C.validKey(session.apiKey) ? session.apiKey : '';
  const old = session.runtimeState;
  // Cached decisions use the old rubric semantics; a version mismatch drops them.
  if (C.object(old) && old.version === C.RUNTIME_VERSION) {
    if (C.object(old.metrics)) metrics = {...freshMetrics(),...old.metrics};
    if (Array.isArray(old.log)) log = old.log.slice(-150);
    if (Array.isArray(old.cache)) cache = new Map(old.cache.filter(e=>Array.isArray(e)&&typeof e[0]==='string'&&C.object(e[1])&&e[1].expires>Date.now()).slice(-MAX_CACHE));
    cooldownUntil = Number(old.cooldownUntil)||0;
    authRejected = old.authRejected === true;
    verifiedAt=Number(old.verifiedAt)||0;
    if(Array.isArray(old.cosmeticLog))cosmeticLog=old.cosmeticLog.slice(-MAX_COSMETIC_LOG);
    if(Array.isArray(old.pageReports))pageReports=new Map(old.pageReports.slice(-100));
  }
})();
function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    const runtimeState = {version:C.RUNTIME_VERSION,metrics,log,cosmeticLog,cache:[...cache.entries()],cooldownUntil,authRejected,verifiedAt,pageReports:[...pageReports]};
    chrome.storage.session.set({runtimeState}).catch(() => {});
  },100);
}
async function persistCleanup() {
  await chrome.storage.local.set({cleanup:{sites:cleanupSites,updatedAt:Date.now()}}).catch(()=>{});
}
function serializeChange(fn) {
  const task = changeTail.then(fn);
  changeTail = task.catch(()=>{});
  return task;
}
function cancelPending() {
  revision++;
  for (const controller of controllers) controller.abort();
  for (const item of queue) item.reject(new Error('ABORTED'));
  queue = [];
}
async function broadcast() {
  // Nothing secret, including storage change payloads, is broadcast.
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(t=>typeof t.id==='number').map(t=>chrome.tabs.sendMessage(t.id,{type:'FG_CONFIG_CHANGED'}).catch(()=>{})));
  // Extension pages (including the local test feed) do not receive tabs messages.
  await chrome.runtime.sendMessage({type:'FG_CONFIG_CHANGED'}).catch(()=>{});
}
async function syncScripts() {
  const present = await chrome.scripting.getRegisteredContentScripts();
  const old = present.filter(s=>s.id.startsWith('feedgate-'));
  const wanted = [];
  for (const site of settings.sites) {
    if (await chrome.permissions.contains({origins:C.originsForSite(site)})) wanted.push(site);
  }
  for (const script of old) if (!wanted.includes(script.id.slice(9))) await chrome.scripting.unregisterContentScripts({ids:[script.id]});
  const existing = new Set(old.map(s=>s.id));
  for (const site of wanted) if (!existing.has('feedgate-'+site)) {
    await chrome.scripting.registerContentScripts([{
      id:'feedgate-'+site,matches:C.originsForSite(site),js:['core.js','adapters.js','content.js'],
      runAt:'document_idle',allFrames:false,world:'ISOLATED',persistAcrossSessions:true
    }]);
  }
  for (const site of wanted) {
    const tabs = await chrome.tabs.query({url:C.originsForSite(site)});
    for (const tab of tabs) if (typeof tab.id === 'number' && !C.isPrivateRoute(tab.url)) {
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['core.js','adapters.js','content.js'],world:'ISOLATED'}).catch(()=>{});
    }
  }
}
async function saveSettings(patch, domain='settings', expect) {
  return serializeChange(async () => {
    const target = C.SETTINGS_DOMAINS.includes(domain) ? domain : 'settings';
    const current = C.finite(expect);
    if (current !== null && current !== (settings.revisions[target]||0)) throw new Error('STALE_SETTINGS');
    const revisions = {...settings.revisions};
    revisions[target] = (revisions[target]||0)+1;
    // A patch may be a function so list changes read-modify-write atomically
    // inside this queue instead of from a pre-queue snapshot.
    const materialized = typeof patch === 'function' ? patch(C.clone(settings)) : patch;
    const base = {...settings,...materialized,revisions};
    if (C.object(materialized.categories)) base.categories = {...settings.categories,...materialized.categories};
    const next = C.sanitizeSettings(base);
    for (const site of next.sites) {
      if (!await chrome.permissions.contains({origins:C.originsForSite(site)})) throw new Error('FORBIDDEN');
    }
    // Sites that just lost selection or access need a cleanup refresh in open tabs.
    const removed = settings.sites.filter(s=>!next.sites.includes(s));
    cancelPending();
    await chrome.storage.local.set({settings:next});
    settings = next;
    await trackCleanup(removed);
    await broadcast();
    await syncScripts();
    return C.clone(settings);
  });
}
function publicConfig(site) {
  const value = C.clone(settings);
  value.allowedAuthors = value.allowedAuthors.filter(a=>a.startsWith(site+':'));
  value.blockedAuthors = value.blockedAuthors.filter(a=>a.startsWith(site+':'));
  value.topics = value.topics.filter(t=>t.scope==='all'||t.site===site);
  // appVersion lets a content script detect a reloaded worker with new schemas.
  return {settings:value,keyReady:!!apiKey && !authRejected,revision,appVersion:C.VERSION,
    recoveryPaused:settings.recoverySites.includes(site),cleanupRequired:cleanupSites.includes(site)};
}
// Best-effort cleanup message to open supported tabs. Never blocks recovery.
async function notifySite(site,message,timeoutMs=1500) {
  let count = 0, acknowledged = false;
  let tabs = [];
  try { tabs = await chrome.tabs.query({url:C.originsForSite(site)}); } catch (_) { return {acknowledged,count}; }
  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || C.isPrivateRoute(tab.url)) continue;
    count++;
    const sent = chrome.tabs.sendMessage(tab.id,message).then(()=>true).catch(()=>false);
    const timer = new Promise(resolve=>setTimeout(()=>resolve(false),timeoutMs));
    if (await Promise.race([sent,timer])) acknowledged = true;
  }
  return {acknowledged,count};
}
// Cleanup tracking exists only for documents that could still show old effects.
// A site with no open supported tab has nothing to refresh, so it is never listed
// and a stale entry is pruned as soon as its last tab closes.
async function siteHasOpenTab(site) {
  try {
    const matches = await chrome.tabs.query({url:C.originsForSite(site)});
    return matches.some((tab) => tab && typeof tab.url === 'string' && !C.isPrivateRoute(tab.url));
  } catch (_) { return false; }
}
async function trackCleanup(sites) {
  const wanted = [...new Set(sites)].filter((site) => C.SITE_DEFS[site] && !cleanupSites.includes(site));
  let changed = false;
  for (const site of wanted) {
    if (await siteHasOpenTab(site)) { cleanupSites.push(site); changed = true; }
  }
  if (changed) { cleanupSites = cleanupSites.slice(0,8); await persistCleanup(); }
}
async function pruneCleanup() {
  const keep = [];
  for (const site of cleanupSites) if (await siteHasOpenTab(site)) keep.push(site);
  if (keep.length !== cleanupSites.length) { cleanupSites = keep; await persistCleanup(); }
}
async function siteStatuses() {
  await pruneCleanup();
  const list = [];
  for (const id of Object.keys(C.SITE_DEFS)) {
    const selected = settings.sites.includes(id);
    let permitted = false;
    try { permitted = await chrome.permissions.contains({origins:C.originsForSite(id)}); } catch (_) { permitted = false; }
    const recoveryPaused = settings.recoverySites.includes(id);
    const cleanup = cleanupSites.includes(id);
    let reason = 'ready';
    if (!settings.enabled) reason = 'engine_paused';
    else if (!selected) reason = 'not_selected';
    else if (!permitted) reason = 'permission_required';
    else if (recoveryPaused) reason = 'recovery_pause';
    else if (cleanup) reason = 'refresh_required';
    const effective = settings.enabled && selected && permitted && !recoveryPaused && !cleanup;
    list.push({site:id,label:C.SITE_DEFS[id].label,status:C.SITE_DEFS[id].status||'primary',
      selected,permitted,recoveryPaused,effective,reason});
  }
  return list;
}
async function reserveRequest() {
  const task = budgetTail.then(async () => {
    const saved = (await chrome.storage.local.get('dailyUsage')).dailyUsage;
    const today = emptyDay();
    const daily = C.object(saved) && saved.date===today.date && Number.isSafeInteger(saved.requests) && saved.requests>=0 ? saved : today;
    if (daily.requests >= settings.dailyLimit) throw new Error('BUDGET');
    daily.requests++;
    // Reserve before the HTTP call. A crash can overcount, never bypass the limit.
    await chrome.storage.local.set({dailyUsage:daily});
  });
  budgetTail = task.catch(()=>{});
  return task;
}
function checkReady() {
  if (!settings.enabled) throw new Error('DISABLED');
  if (!settings.consent) throw new Error('CONSENT_REQUIRED');
  if (!apiKey) throw new Error('LOCKED');
  if (authRejected) throw new Error('AUTH');
  if (Date.now()<cooldownUntil) throw new Error('RATE_LIMIT');
}
async function validateContentSender(sender, {allowPrivate=false, allowDisabled=false}={}) {
  if (!sender || sender.id!==chrome.runtime.id || sender.frameId!==0 || !sender.tab || typeof sender.tab.id!=='number') throw new Error('FORBIDDEN');
  const site = C.siteForURL(sender.url);
  const tab = await chrome.tabs.get(sender.tab.id).catch(()=>null);
  if (!site || !tab || C.siteForURL(tab.url)!==site) throw new Error('FORBIDDEN');
  if (!allowPrivate && (C.isPrivateRoute(sender.url)||C.isPrivateRoute(tab.url))) throw new Error('PRIVATE_ROUTE');
  if (!allowDisabled && (!settings.enabled||!settings.sites.includes(site))) throw new Error('DISABLED');
  if (!allowDisabled && !await chrome.permissions.contains({origins:C.originsForSite(site)})) throw new Error('FORBIDDEN');
  return site;
}
function enqueue(fn,stamp) {
  if (queue.length>=MAX_QUEUE) return Promise.reject(new Error('QUEUE_FULL'));
  return new Promise((resolve,reject)=>{queue.push({fn,stamp,resolve,reject});pump();});
}
function pump() {
  while (queue.length && active<settings.concurrency) {
    const item = queue.shift();
    if (item.stamp!==revision) {item.reject(new Error('ABORTED'));continue;}
    active++;
    Promise.resolve().then(item.fn).then(item.resolve,item.reject).finally(()=>{active--;pump();});
  }
}
function addLog(record,decision,result,cached=false,error=null) {
  // No post body or full browsing URL is retained. Author names stay local.
  log.push({at:Date.now(),site:record.site,author:record.author,action:decision.action,wouldAction:decision.wouldAction||null,
    reason:decision.reason,source:decision.source,rule:decision.rule||null,scores:result?.scores||null,model:result?.model||null,
    latencyMs:result?.latencyMs||0,cached,error,category:decision.category||null,protected:decision.protected===true,conflict:decision.conflict===true,
    protectionEligible:decision.protectionEligible===true,
    adEvidence:decision.adEvidence?{status:decision.adEvidence.status,markerKind:decision.adEvidence.markerKind,
      selectorId:decision.adEvidence.selectorId,ownerMatched:decision.adEvidence.ownerMatched===true,
      renderedLabel:decision.adEvidence.renderedLabel===true,evidenceKind:decision.adEvidence.evidenceKind,
      scope:decision.adEvidence.scope}:null});
  metrics.decisions++;
  if(decision.protected)metrics.protected++;
  if(decision.usefulPromotion)metrics.usefulPromotions++;
  if (log.length>150) {metrics.logDropped += log.length-150;log.splice(0,log.length-150);}
  if (decision.action!=='allow' || decision.wouldAction) metrics.filterDecisions++;
  persistSoon();
}
async function makeRemote(record,stamp,validateAgain) {
  checkReady();
  if (stamp!==revision) throw new Error('ABORTED');
  await validateAgain();
  const controller = new AbortController();
  controllers.add(controller);
  try {
    await reserveRequest();
    if (stamp!==revision) throw new Error('ABORTED');
    checkReady();
    await validateAgain();
    const body = C.buildRequest(record,settings);
    metrics.requests++;
    persistSoon();
    const result = await API.evaluate(apiKey,body,controller.signal);
    if (stamp!==revision) throw new Error('ABORTED');
    metrics.classified++;
    verifiedAt=Date.now();
    metrics.inputTokens += result.usage.input_tokens;
    metrics.outputTokens += result.usage.output_tokens;
    metrics.lastLatencyMs = result.latencyMs;
    metrics.lastModel = result.model;
    metrics.lastError = null;
    persistSoon();
    return result;
  } catch (error) {
    if (error.message==='AUTH') authRejected = true;
    if (error.message==='RATE_LIMIT') cooldownUntil = Date.now()+(error.retryAfterMs||30000);
    if (error.message==='ABORTED') metrics.cancellations++;
    if (error.message!=='ABORTED') {metrics.errors++;metrics.lastError=C.userError(error);}
    persistSoon();
    throw error;
  } finally { controllers.delete(controller); }
}
async function classify(record,sender,trusted) {
  const isDemo = trusted && new URL(sender.url).pathname==='/demo.html';
  const site = isDemo ? 'demo' : await validateContentSender(sender);
  const r = C.sanitizeRecord(record,site);
  if(!isDemo) {
    const tab=await chrome.tabs.get(sender.tab.id);
    r.context=C.pageContext(tab.url);
  }
  if(keptPosts.has(await C.feedbackKey(r))) {
    const decision=C.decide(r,null,settings,{revealed:true});
    addLog(r,decision,null);
    return {decision,result:null,cached:false};
  }
  const stamp = revision;
  const early = C.decide(r,null,settings);
  if (early.source==='allowlist' || early.source==='local' || early.source==='author') {addLog(r,early,null);return {decision:early,result:null,cached:false};}
  if (!r.text && !r.mediaAlt && !r.sponsored) return {decision:early,result:null,cached:false};
  try {
    checkReady();
    const key = await C.cacheKey(r,settings);
    if (stamp!==revision) throw new Error('ABORTED');
    const hit = cache.get(key);
    if (settings.cacheMinutes>0 && hit && hit.expires>Date.now()) {
      cache.delete(key);cache.set(key,hit);
      metrics.cacheHits++;
      const decision = C.decide(r,hit.result,settings);
      addLog(r,decision,hit.result,true);
      return {decision,result:hit.result,cached:true};
    }
    const validateAgain = async () => {
      if (!isDemo) {
        await validateContentSender(sender);
        if (!settings.sites.includes(site)) throw new Error('DISABLED');
      }
    };
    // In-flight deduplication does not weaken per-sender validation above.
    const flightKey = `${stamp}:${key}`;
    let job = inFlight.get(flightKey);
    if (!job) {
      job = enqueue(()=>makeRemote(r,stamp,validateAgain),stamp);
      inFlight.set(flightKey,job);
      job.finally(()=>inFlight.delete(flightKey)).catch(()=>{});
    }
    const result = await job;
    if (stamp!==revision) throw new Error('ABORTED');
    await validateAgain();
    if (settings.cacheMinutes>0) {
      cache.set(key,{expires:Date.now()+settings.cacheMinutes*60000,result});
      while(cache.size>MAX_CACHE) cache.delete(cache.keys().next().value);
    }
    const decision = C.decide(r,result,settings);
    addLog(r,decision,result);
    return {decision,result,cached:false};
  } catch (error) {
    // Explicit local sponsored markers may still match. An API error itself never hides anything.
    const safe = C.userError(error);
    const decision = C.decide(r,null,settings);
    if (!['ABORTED','DISABLED','PRIVATE_ROUTE'].includes(safe.code)) addLog(r,decision,null,false,safe);
    return {decision,result:null,cached:false,error:safe};
  }
}
function cosmeticCounts() {
  const rules = settings.cosmeticFilters.rules;
  const counts = {total:rules.length,active:0,quarantined:0,disabled:0,deleted:0};
  for (const rule of rules) counts[rule.status]++;
  return counts;
}
async function status() {
  const stored = await chrome.storage.local.get(['vault','dailyUsage']);
  const today = emptyDay();
  return {settings:C.clone(settings),keyReady:!!apiKey,authRejected,hasVault:!!stored.vault,
    metrics:C.clone(metrics),daily:stored.dailyUsage?.date===today.date?stored.dailyUsage:today,
    siteStates:await siteStatuses(),cosmetic:{enabled:settings.cosmeticEnabled,...cosmeticCounts()},
    hudMode:settings.hudMode,feedsOpen:settings.feedsOpen,cleanupSites:[...cleanupSites],
    migratedFrom,queue:queue.length,active,cached:cache.size,revision,log:C.clone(log).reverse(),cooldownUntil,verifiedAt,keptPosts:keptPosts.size,pages:[...pageReports.values()]};
}
async function diagnostics() {
  const s=await status();
  const permissions=await chrome.permissions.getAll();
  const now=Date.now();
  const reports=[...pageReports.values()];
  const lastHeartbeat=reports.reduce((max,p)=>Math.max(max,Number(p.heartbeatAt)||Number(p.updatedAt)||0),0)||null;
  return {
    format:'feedgate-diagnostics',version:C.DIAGNOSTICS_VERSION,extensionVersion:C.VERSION,rubric:C.RUBRIC_VERSION,
    generatedAt:new Date().toISOString(),environment:'chrome-extension',
    build:{release:C.VERSION,rubric:C.RUBRIC_VERSION,policy:C.POLICY_VERSION,detector:C.AD_DETECTOR_VERSION,
      extraction:C.EXTRACTION_VERSION,schema:C.DIAGNOSTICS_VERSION},
    privacy:'No keys, vault ciphertext, post text, author names, post hashes, full URLs, custom rule text, raw cosmetic selectors or browser history included. Cosmetic rules appear as random local rule references only.',
    connection:{transport:'direct TypeSafe HTTPS',model:settings.model,keyReady:s.keyReady,authRejected,verifiedAt,
      hasEncryptedVault:s.hasVault,cooldownUntil},
    ui:{hudMode:settings.hudMode,feedsOpen:settings.feedsOpen,engineEnabled:settings.enabled,preset:settings.preset,mode:settings.mode,
      grouping:settings.grouping,thrift:settings.thrift,thriftDelayMs:settings.thriftDelayMs},
    sites:s.siteStates,
    cosmetic:{enabled:settings.cosmeticEnabled,...cosmeticCounts(),applications:metrics.cosmeticApplied,
      restorations:metrics.cosmeticRestored,rejections:metrics.cosmeticRejected,breakerActivations:metrics.breakerActivations},
    renderer:{reportsReceived:reports.length,lastHeartbeat,reportsLastHour:reports.filter(p=>now-(Number(p.updatedAt)||0)<3600000).length,
      cleanupSites:[...cleanupSites],
      note:'Absent page reports never prove that no filtering activity happened.'},
    provider:{requests:metrics.requests,classified:metrics.classified,cacheHits:metrics.cacheHits,
      cancellations:metrics.cancellations,errors:metrics.errors,
      unaccounted:Math.max(0,metrics.requests-metrics.classified-metrics.cancellations-metrics.errors),
      inputTokens:metrics.inputTokens,outputTokens:metrics.outputTokens,lastLatencyMs:metrics.lastLatencyMs,lastModel:metrics.lastModel},
    logStats:{retained:log.length,capacity:150,dropped:metrics.logDropped},
    update:updateInfo?{...updateInfo}:{running:C.VERSION,onDisk:null,updateAvailable:null,checkedAt:null,
      note:'Run a check from the Updates panel to compare the loaded build with the files on disk.'},
    cosmeticEvents:cosmeticLog.slice(-100),
    settings:{enabled:settings.enabled,consent:settings.consent,sites:settings.sites,hudMode:settings.hudMode,feedsOpen:settings.feedsOpen,
      mode:settings.mode,protectUseful:settings.protectUseful,profileMode:settings.profileMode,labelledAds:settings.labelledAds,
      categories:settings.categories,concurrency:settings.concurrency,dailyLimit:settings.dailyLimit,cacheMinutes:settings.cacheMinutes,
      hasCustomRule:!!settings.customInstruction,cosmeticEnabled:settings.cosmeticEnabled,recoverySites:[...settings.recoverySites],
      allowedAuthorCount:settings.allowedAuthors.length,savedPostChoices:keptPosts.size,
      mutedAuthorCount:settings.blockedAuthors.length,mutedTopicCount:settings.topics.length},
    metrics:C.clone(metrics),daily:s.daily,queue:queue.length,active,cached:cache.size,
    permissions:{permissions:permissions.permissions||[],origins:permissions.origins||[]},
    pages:reports.filter(p=>now-(Number(p.updatedAt)||0)<86400000),
    decisions:log.slice(-150).map(e=>({at:e.at,site:e.site,action:e.action,wouldAction:e.wouldAction,source:e.source,
      rule:e.rule||null,category:e.category,protected:e.protected,conflict:e.conflict===true,
      protectionEligible:e.protectionEligible===true,adEvidence:e.adEvidence||null,
      sufficient:C.finite(e.scores?.sufficient),scores:e.scores,model:e.model,latencyMs:e.latencyMs,cached:e.cached,error:e.error?.code||null}))
  };
}
async function updateCheck() {
  // The loaded manifest is the running build; build.json on disk is what the
  // folder would deliver on the next reload. Nothing leaves the machine.
  let onDisk = null;
  let buildId = null;
  try {
    const response = await fetch(chrome.runtime.getURL('build.json'), {cache:'no-store'});
    if (response.ok) {
      const data = JSON.parse(await response.text());
      if (C.object(data) && typeof data.release === 'string' && /^\d+\.\d+\.\d+$/.test(data.release)) {
        onDisk = data.release;
        buildId = typeof data.buildId === 'string' ? data.buildId : null;
      }
    }
  } catch {}
  updateInfo = {running:C.VERSION,onDisk,buildId,updateAvailable:onDisk!==null&&onDisk!==C.VERSION,checkedAt:Date.now()};
  return updateInfo;
}
async function keyChange(key) {
  cancelPending();
  apiKey = key;
  authRejected=false;cooldownUntil=0;verifiedAt=0;
  if (key) await chrome.storage.session.set({apiKey:key});
  else await chrome.storage.session.remove('apiKey');
  persistSoon();
  await broadcast();
}
async function handle(message,sender) {
  await ready;
  if (!C.object(message) || typeof message.type!=='string' || sender.id!==chrome.runtime.id) throw new Error('FORBIDDEN');
  const trusted = C.trustedPage(sender,chrome.runtime.id);
  if (message.type==='FG_GET_CONFIG') {
    const site = trusted ? 'demo' : await validateContentSender(sender,{allowPrivate:true,allowDisabled:true});
    // A fresh content script means the document was rebuilt after a cleanup request.
    if (!trusted && cleanupSites.includes(site)) {cleanupSites=cleanupSites.filter(s=>s!==site);await persistCleanup();}
    return publicConfig(site);
  }
  if(message.type==='FG_OPEN_SETTINGS_FROM_PAGE') {
    await validateContentSender(sender,{allowPrivate:true,allowDisabled:true});
    await chrome.runtime.openOptionsPage();return {opened:true};
  }
  if (message.type==='FG_CLASSIFY') return classify(message.record,sender,trusted);
  if (message.type==='FG_ALLOW_AUTHOR'||message.type==='FG_MUTE_AUTHOR'||message.type==='FG_FORGET_AUTHOR') {
    const site = trusted ? message.site : await validateContentSender(sender);
    const key = C.authorKey(site,message.author);
    if (!key) throw new Error('INVALID_RECORD');
    let previous = 'none';
    const saved = await saveSettings((current)=>{
      const hadBlocked = current.blockedAuthors.includes(key);
      const hadAllowed = current.allowedAuthors.includes(key);
      previous = hadBlocked ? 'blocked' : (hadAllowed ? 'allowed' : 'none');
      if (message.type==='FG_ALLOW_AUTHOR') return {
        allowedAuthors:[...current.allowedAuthors.filter(a=>a!==key),key],
        blockedAuthors:current.blockedAuthors.filter(a=>a!==key),
      };
      if (message.type==='FG_MUTE_AUTHOR') return {
        blockedAuthors:[...current.blockedAuthors.filter(a=>a!==key),key],
        allowedAuthors:current.allowedAuthors.filter(a=>a!==key),
      };
      return {
        allowedAuthors:current.allowedAuthors.filter(a=>a!==key),
        blockedAuthors:current.blockedAuthors.filter(a=>a!==key),
      };
    });
    const applied = message.type==='FG_ALLOW_AUTHOR' ? 'allowed' : (message.type==='FG_MUTE_AUTHOR' ? 'blocked' : 'none');
    return {saved:true,key,previous,applied,revision:saved.revisions.settings};
  }
  if (message.type==='FG_AUTHOR_UNDO') {
    const site = trusted ? message.site : await validateContentSender(sender);
    const key = C.authorKey(site,message.author);
    if (!key) throw new Error('INVALID_RECORD');
    const previous = ['none','blocked','allowed'].includes(message.previous) ? message.previous : 'none';
    const applied = message.applied==='allowed' ? 'allowed' : 'blocked';
    let stale = false;
    await saveSettings((current)=>{
      const stateOf = current.blockedAuthors.includes(key) ? 'blocked' : (current.allowedAuthors.includes(key) ? 'allowed' : 'none');
      // An old undo must never overwrite a newer decision for the same author.
      if (stateOf !== applied) { stale = true; return {}; }
      const allowedAuthors = current.allowedAuthors.filter(a=>a!==key);
      const blockedAuthors = current.blockedAuthors.filter(a=>a!==key);
      if (previous==='allowed') allowedAuthors.push(key);
      if (previous==='blocked') blockedAuthors.push(key);
      return {allowedAuthors,blockedAuthors};
    });
    return {saved:!stale,stale,key,state:applied};
  }
  if (message.type==='FG_ADD_RULE') {
    const site = await validateContentSender(sender);
    const host = new URL(sender.url).hostname;
    const selector = C.text(message.selector,300);
    if (C.selectorProblem(selector)) throw new Error('UNSAFE_SELECTOR');
    if (settings.cosmeticFilters.rules.length>=C.COSMETIC_RULES_MAX) throw new Error('RULE_LIMIT');
    const id = 'r-'+(globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    const now = Date.now();
    const rule = C.sanitizeCosmeticRule({id,host,selector,status:'active',source:'picker',reason:'user_created',createdAt:now,validatedAt:now});
    if (!rule) throw new Error('UNSAFE_SELECTOR');
    const rules = [...settings.cosmeticFilters.rules,rule];
    const saved = await saveSettings({cosmeticFilters:{...settings.cosmeticFilters,rules}},'cosmetic',message.expect);
    return {saved:true,rule,revision:saved.revisions.cosmetic};
  }
  if (message.type==='FG_PAGE_STATS') {
    const site=await validateContentSender(sender,{allowPrivate:true,allowDisabled:true});
    const value=C.object(message.stats)?message.stats:{};
    const summary={site,context:C.pageContext(sender.url),updatedAt:Date.now()};
    for(const name of ['observed','collapsed','dimmed','pending','completed','kept','protected','errors','detectedTotal',
      'cosmeticApplied','cosmeticRestored','cosmeticRejected','breakerActivations','scansCoalesced','ignoredSelfMutations']) {
      summary[name]=C.clamp(Math.floor(Number(value[name])||0),0,1000000);
    }
    summary.controllerCount=C.clamp(Math.floor(Number(value.controllerCount)||0),0,8);
    summary.heartbeatAt=Number.isFinite(Number(value.heartbeatAt))&&Number(value.heartbeatAt)>0?Number(value.heartbeatAt):Date.now();
    summary.enabled=value.enabled===true;
    summary.state=['ready','paused','no-consent','locked','private','site-off','error','recovery','stale'].includes(value.state)?value.state:'error';
    summary.error=value.lastError?C.userError(value.lastError.code).code:null;
    pageReports.set(sender.tab.id,summary);
    while(pageReports.size>100)pageReports.delete(pageReports.keys().next().value);
    const count=summary.collapsed+summary.dimmed;
    await chrome.action.setBadgeText({tabId:sender.tab.id,text:count?String(count):''});
    await chrome.action.setBadgeBackgroundColor({tabId:sender.tab.id,color:'#24332B'});
    persistSoon();
    return {ok:true};
  }
  if(message.type==='FG_KEEP_POST') {
    const site=trusted && new URL(sender.url).pathname==='/demo.html'?'demo':await validateContentSender(sender);
    const record=C.sanitizeRecord(message.record,site);
    const key=await C.feedbackKey(record);
    return serializeChange(async()=>{
      keptPosts.delete(key);keptPosts.set(key,Date.now());
      while(keptPosts.size>2000)keptPosts.delete(keptPosts.keys().next().value);
      await chrome.storage.local.set({keptPosts:[...keptPosts]});
      await broadcast();
      return {saved:true};
    });
  }
  if (message.type==='FG_RECOVER_SITE' || message.type==='FG_RESUME_SITE') {
    const site = trusted ? message.site : await validateContentSender(sender,{allowPrivate:true,allowDisabled:true});
    if (!C.SITE_DEFS[site]) throw new Error('INVALID_RECORD');
    if (message.type==='FG_RECOVER_SITE') {
      // The pause is persisted in the trusted context before any page cleanup runs.
      const saved = await saveSettings({recoverySites:[...new Set([...settings.recoverySites,site])]},'recovery',message.expect);
      const cleanup = await notifySite(site,{type:'FG_RESTORE_ALL'},1500);
      cosmeticLog.push({at:Date.now(),site,source:'cosmetic',kind:'recovery_pause',ruleRef:null,reason:'user_requested',candidateAction:null,appliedAction:null});
      while(cosmeticLog.length>MAX_COSMETIC_LOG)cosmeticLog.shift();
      persistSoon();
      return {persisted:true,sites:saved.recoverySites,acknowledged:cleanup.acknowledged,tabs:cleanup.count};
    }
    const quarantined = settings.cosmeticFilters.rules.filter(r=>r.status==='quarantined'&&C.siteForHost(r.host)===site).length;
    const saved = await saveSettings({recoverySites:settings.recoverySites.filter(s=>s!==site)},'recovery',message.expect);
    return {resumed:true,sites:saved.recoverySites,quarantined};
  }
  if (message.type==='FG_COSMETIC_EVENT') {
    const site = await validateContentSender(sender,{allowPrivate:true,allowDisabled:true});
    if (!['applied','restored','rejected','breaker','undo'].includes(message.kind)) throw new Error('INVALID_RECORD');
    const ruleRef = typeof message.ruleRef==='string' && /^[a-z0-9][a-z0-9-]{7,47}$/.test(message.ruleRef) ? message.ruleRef : null;
    const actions = ['collapse','dim','allow'];
    cosmeticLog.push({at:Date.now(),site,source:'cosmetic',kind:message.kind,ruleRef,
      reason:C.text(message.reason,80),
      candidateAction:actions.includes(message.candidateAction)?message.candidateAction:null,
      appliedAction:actions.includes(message.appliedAction)?message.appliedAction:null});
    while(cosmeticLog.length>MAX_COSMETIC_LOG)cosmeticLog.shift();
    if (message.kind==='applied') metrics.cosmeticApplied++;
    if (message.kind==='restored') metrics.cosmeticRestored++;
    if (message.kind==='rejected') metrics.cosmeticRejected++;
    if (message.kind==='breaker') metrics.breakerActivations++;
    persistSoon();
    return {recorded:true};
  }
  if (message.type==='FG_RULE_REVALIDATE') {
    // Application-time check from the page that owns the rule: a selector that now
    // reaches protected content is quarantined before its effect is applied.
    const site = await validateContentSender(sender,{allowPrivate:true,allowDisabled:true});
    const host = new URL(sender.url).hostname;
    const rule = settings.cosmeticFilters.rules.find(r=>r.id===message.id);
    if (!rule) throw new Error('RULE_NOT_FOUND');
    if (rule.host!==host && !host.endsWith('.'+rule.host)) throw new Error('FORBIDDEN');
    if (rule.status==='disabled'||rule.status==='deleted') return {status:rule.status};
    const matchCount = C.clamp(Math.floor(Number(message.matchCount)||0),0,1000000);
    const reported = typeof message.reason==='string'?message.reason:'ok';
    const unsafe = reported==='unsafe_at_application' || C.selectorProblem(rule.selector)!==null;
    if (unsafe || reported==='no_current_target' || matchCount===0) {
      const reason = unsafe?'unsafe_at_application':'no_current_target';
      if (rule.status==='quarantined' && rule.reason===reason) return {status:'quarantined',reason};
      const rules = settings.cosmeticFilters.rules.map(r=>r.id===rule.id?{...r,status:'quarantined',reason}:r);
      await saveSettings({cosmeticFilters:{...settings.cosmeticFilters,rules}},'cosmetic',message.expect);
      return {status:'quarantined',reason};
    }
    // A quarantined rule may be promoted again once a real target exists and it
    // still passes the current safety subset.
    if (rule.status==='active' && rule.validatedAt) return {status:'active'};
    const rules = settings.cosmeticFilters.rules.map(r=>r.id===rule.id?{...r,status:'active',validatedAt:Date.now(),reason:'revalidated_with_target'}:r);
    await saveSettings({cosmeticFilters:{...settings.cosmeticFilters,rules}},'cosmetic',message.expect);
    return {status:'active',reason:'revalidated_with_target'};
  }
  if (message.type==='FG_TOPIC_ADD') {
    const site = trusted ? C.text(message.topic && message.topic.site,40) : await validateContentSender(sender);
    const raw = message.topic && C.object(message.topic) ? message.topic : {};
    const candidate = {
      id: typeof raw.id==='string' ? raw.id : 't-'+(globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)),
      label: raw.label,
      scope: raw.scope==='all' ? 'all' : 'site',
      site,
      until: raw.until,
      createdAt: C.finite(raw.createdAt) || Date.now(),
    };
    const clean = C.sanitizeTopics([candidate])[0];
    if (!clean) throw new Error('INVALID_RECORD');
    let created = false;
    let savedTopic = clean;
    const saved = await saveSettings((current)=>{
      const existing = current.topics.find(t=>t.id===clean.id);
      if (existing) { savedTopic = existing; return {topics:current.topics}; }
      if (current.topics.length >= C.TOPICS_MAX) throw new Error('TOPIC_LIMIT');
      created = true;
      return {topics:[...current.topics,clean]};
    });
    return {saved:true,created,topic:savedTopic,revision:saved.revisions.settings};
  }
  if (message.type==='FG_TOPIC_DELETE') {
    let removed = null;
    const saved = await saveSettings((current)=>{
      const found = current.topics.find(t=>t.id===message.id);
      if (!found) throw new Error('TOPIC_NOT_FOUND');
      removed = found;
      return {topics:current.topics.filter(t=>t.id!==message.id)};
    });
    return {saved:true,topic:removed,revision:saved.revisions.settings};
  }
  if (!trusted) throw new Error('FORBIDDEN');
  switch(message.type) {
    case 'FG_STATUS': return status();
    case 'FG_DIAGNOSTICS': return diagnostics();
    case 'FG_PATCH_SETTINGS': return {settings:await saveSettings(C.object(message.patch)?message.patch:{},typeof message.domain==='string'?message.domain:'settings',message.expect)};
    case 'FG_TOPIC_UPDATE': {
      const patch = message.patch && C.object(message.patch) ? message.patch : {};
      let updated = null;
      const saved = await saveSettings((current)=>{
        const index = current.topics.findIndex(t=>t.id===message.id);
        if (index < 0) throw new Error('TOPIC_NOT_FOUND');
        const existing = current.topics[index];
        const merged = {
          id: existing.id,
          label: patch.label!==undefined ? C.text(patch.label,C.TOPIC_LABEL_MAX) : existing.label,
          scope: patch.scope!==undefined ? (patch.scope==='all'?'all':'site') : existing.scope,
          site: patch.site!==undefined ? C.text(patch.site,40) : existing.site,
          until: patch.until!==undefined ? (C.finite(patch.until)>0?Math.round(patch.until):0) : existing.until,
          createdAt: existing.createdAt,
        };
        const clean = C.sanitizeTopics([merged])[0];
        if (!clean) throw new Error('INVALID_RECORD');
        const topics = current.topics.slice();
        topics[index] = clean;
        updated = clean;
        return {topics};
      });
      return {saved:true,topic:updated,revision:saved.revisions.settings};
    }
    case 'FG_SET_KEY': {
      const stamp = ++credentialEpoch;
      const key = typeof message.key==='string'?message.key.trim():'';
      if (!C.validKey(key)) throw new Error('INVALID_KEY');
      const vault = message.remember===true ? await VAULT.seal(key,message.passphrase) : null;
      return commitCredential(stamp,async()=>{
        if (vault) await chrome.storage.local.set({vault});
        else await chrome.storage.local.remove('vault');
        if (stamp!==credentialEpoch) throw new Error('ABORTED');
        await keyChange(key);
        return {saved:true};
      });
    }
    case 'FG_UNLOCK': {
      const stamp=++credentialEpoch;
      const {vault} = await chrome.storage.local.get('vault');
      const key = await VAULT.open(vault,message.passphrase);
      return commitCredential(stamp,async()=>{await keyChange(key);return {unlocked:true};});
    }
    case 'FG_LOCK': {
      const stamp=++credentialEpoch;
      return commitCredential(stamp,async()=>{await keyChange('');return {locked:true};});
    }
    case 'FG_FORGET_KEY': {
      const stamp = ++credentialEpoch;
      return commitCredential(stamp,async()=>{await keyChange('');await chrome.storage.local.remove('vault');return {forgotten:true};});
    }
    case 'FG_EXPORT_VAULT': {
      // Sealed ciphertext only; the passphrase and the plaintext key never leave the worker.
      const {vault} = await chrome.storage.local.get('vault');
      if (!vault) throw new Error('NO_VAULT');
      return {format:'feedgate-key-backup',version:1,vault:VAULT.validate(vault)};
    }
    case 'FG_IMPORT_VAULT': {
      const vault = VAULT.validate(message.vault);
      await chrome.storage.local.set({vault});
      return {imported:true};
    }
    case 'FG_UPDATE_INFO': return updateCheck();
    case 'FG_TEST_CONNECTION': {
      checkReady();
      const r = C.sanitizeRecord({id:'connection-test',text:'I built an open-source Discord moderation tool using Jev. My test processed 1,000 messages per day. Here are the implementation details, measured API usage, known false positives and setup instructions. Human moderators still handle appeals.',author:'',mediaAlt:'',linkDomains:[]},'demo');
      const stamp=revision;
      const result = await enqueue(()=>makeRemote(r,stamp,async()=>{}),stamp);
      return {model:result.model,latencyMs:result.latencyMs,usage:result.usage,scores:result.scores,decision:C.decide(r,result,settings)};
    }
    case 'FG_RULE_UPDATE': {
      const rec = settings.cosmeticFilters.rules.find(r=>r.id===message.id);
      if (!rec) throw new Error('RULE_NOT_FOUND');
      const patch = C.object(message.patch)?message.patch:{};
      const next = {...rec};
      if (typeof patch.selector==='string') {
        const selector = C.text(patch.selector,300);
        if (C.selectorProblem(selector)) throw new Error('UNSAFE_SELECTOR');
        next.selector = selector;
        next.validatedAt = Date.now();
      }
      if (C.COSMETIC_RULE_STATUSES.includes(patch.status) && patch.status!=='deleted') {
        if (patch.status==='active' && C.selectorProblem(next.selector)) throw new Error('UNSAFE_SELECTOR');
        next.status = patch.status;
        if (patch.status==='active') {next.validatedAt=Date.now();next.reason='revalidated_by_user';}
        if (patch.status==='disabled') next.reason='disabled_by_user';
        if (patch.status==='quarantined') next.reason='quarantined_by_user';
      }
      const rules = settings.cosmeticFilters.rules.map(r=>r.id===rec.id?next:r);
      await saveSettings({cosmeticFilters:{...settings.cosmeticFilters,rules}},'cosmetic',message.expect);
      return {saved:true,rule:next};
    }
    case 'FG_RULE_DELETE': {
      const rec = settings.cosmeticFilters.rules.find(r=>r.id===message.id);
      if (!rec) throw new Error('RULE_NOT_FOUND');
      // Deletion keeps the record so Undo can restore it after fresh safety checks.
      const rules = settings.cosmeticFilters.rules.map(r=>r.id===rec.id?{...r,status:'deleted'}:r);
      await saveSettings({cosmeticFilters:{...settings.cosmeticFilters,rules}},'cosmetic',message.expect);
      return {deleted:true,rule:rec};
    }
    case 'FG_RULE_UNDO': {
      const rec = settings.cosmeticFilters.rules.find(r=>r.id===message.id);
      if (!rec || rec.status!=='deleted') throw new Error('RULE_NOT_FOUND');
      if (C.selectorProblem(rec.selector)) throw new Error('UNSAFE_SELECTOR');
      const rules = settings.cosmeticFilters.rules.map(r=>r.id===rec.id?{...r,status:'quarantined',reason:'undo_of_deletion'}:r);
      await saveSettings({cosmeticFilters:{...settings.cosmeticFilters,rules}},'cosmetic',message.expect);
      return {restored:true,rule:{...rec,status:'quarantined'}};
    }
    case 'FG_RULES_DISABLE_ALL': {
      const rules = settings.cosmeticFilters.rules.map(r=>r.status==='active'?{...r,status:'disabled',reason:'disabled_by_user'}:r);
      await saveSettings({cosmeticFilters:{...settings.cosmeticFilters,rules}},'cosmetic',message.expect);
      return {disabled:rules.filter(r=>r.status==='disabled').length};
    }
    case 'FG_RULES_DELETE_ALL': {
      await saveSettings({cosmeticFilters:{...settings.cosmeticFilters,rules:[]}},'cosmetic',message.expect);
      return {deleted:true};
    }
    case 'FG_RELOAD_PAUSED': {
      if (!Number.isInteger(message.tabId)) throw new Error('FORBIDDEN');
      const tab = await chrome.tabs.get(message.tabId);
      const site = C.siteForURL(tab.url);
      if (!site || C.isPrivateRoute(tab.url)) throw new Error('PRIVATE_ROUTE');
      if (!settings.recoverySites.includes(site)) {
        await saveSettings({recoverySites:[...settings.recoverySites,site]},'recovery',message.expect);
      }
      await chrome.tabs.reload(message.tabId);
      return {reloading:true};
    }
    case 'FG_CLEAR_CACHE': {
      cancelPending();cache.clear();persistSoon();await broadcast();return {cleared:true};
    }
    case 'FG_CLEAR_LOG': {log=[];persistSoon();return {cleared:true};}
    case 'FG_RESET_FEEDBACK': {
      return serializeChange(async()=>{keptPosts.clear();await chrome.storage.local.remove('keptPosts');await broadcast();return {cleared:true};});
    }
    case 'FG_CLEAR_SESSION': {
      cancelPending(); cache.clear();log=[];metrics=freshMetrics();
      persistSoon();await broadcast();return {cleared:true};
    }
    case 'FG_EXPORT_SETTINGS': {
      const clean = C.clone(settings);
      // Imported settings cannot silently grant data-sharing consent or site permissions.
      // Cosmetic rules travel with a user-requested local backup; they never appear in diagnostics.
      clean.consent=false;clean.sites=[];
      return {format:'feedgate-settings',version:C.SETTINGS_VERSION,settings:clean};
    }
    case 'FG_IMPORT_SETTINGS': {
      const version = message.data&&C.finite(message.data.version);
      if (!C.object(message.data)||message.data.format!=='feedgate-settings'||![6,5,4,3,2].includes(version===null?NaN:version)) throw new Error('INVALID_RECORD');
      // Older exports are migrated safely: thresholds never map promotion onto unwanted advertising,
      // and legacy selector lines arrive quarantined for review.
      const imported=C.migrateSettings(message.data.settings);
      imported.consent=false;imported.sites=[];
      imported.cosmeticFilters={...imported.cosmeticFilters,rules:imported.cosmeticFilters.rules.map(rule=>
        rule.validatedAt>0&&!C.selectorProblem(rule.selector)?rule:{...rule,status:'quarantined',reason:'imported_unverified'})};
      return {settings:await saveSettings(imported)};
    }
    case 'FG_OPEN_DEMO': await chrome.tabs.create({url:chrome.runtime.getURL('demo.html')}); return {opened:true};
    case 'FG_OPEN_SETTINGS': await chrome.runtime.openOptionsPage(); return {opened:true};
    case 'FG_TAB_COMMAND': {
      if (!['FG_RESTORE_ALL','FG_RESCAN','FG_PICK_ELEMENT'].includes(message.command) || !Number.isInteger(message.tabId)) throw new Error('FORBIDDEN');
      const tab = await chrome.tabs.get(message.tabId);
      if (!C.siteForURL(tab.url)||C.isPrivateRoute(tab.url)) throw new Error('PRIVATE_ROUTE');
      return chrome.tabs.sendMessage(message.tabId,{type:message.command});
    }
    default: throw new Error('FORBIDDEN');
  }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  handle(message,sender).then(data=>respond({ok:true,data})).catch(error=>respond({ok:false,error:C.userError(error)}));
  return true;
});
chrome.runtime.onInstalled.addListener(details=>{
  ready.then(async()=>{
    await syncScripts();
    if (details.reason==='install') await chrome.runtime.openOptionsPage();
    // One-time visible v3 upgrade setup; never re-offered on later restarts.
    if (details.reason==='update') {
      const stored = await chrome.storage.local.get('upgrade');
      if (C.object(stored.upgrade)) await chrome.runtime.openOptionsPage();
    }
  }).catch(()=>{});
});
chrome.runtime.onStartup.addListener(()=>{ready.then(syncScripts).catch(()=>{});});
chrome.permissions.onRemoved.addListener(()=>{
  ready.then(()=>serializeChange(async()=>{
    const sites=[];const removed=[];
    for (const site of settings.sites) {
      if (await chrome.permissions.contains({origins:C.originsForSite(site)})) sites.push(site);
      else removed.push(site);
    }
    // A site whose access was revoked may still carry injected effects: mark it for refresh.
    await trackCleanup(removed);
    cancelPending();settings={...settings,sites};
    await chrome.storage.local.set({settings});
    await broadcast();await syncScripts();
  })).catch(()=>{});
});

chrome.tabs.onRemoved?.addListener(tabId=>{pageReports.delete(tabId);persistSoon();});
