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
const emptyDay = () => ({date:new Date().toISOString().slice(0,10),requests:0});
function freshMetrics() { return {decisions:0,protected:0,usefulPromotions:0,requests:0,classified:0,cacheHits:0,filterDecisions:0,errors:0,inputTokens:0,outputTokens:0,lastLatencyMs:0,lastModel:'',lastError:null}; }

const ready = (async () => {
  // Local holds preferences/ciphertext. Session holds the live key, scores and counters.
  // Neither area is exposed to content scripts.
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const local = await chrome.storage.local.get(['settings','keptPosts']);
  const session = await chrome.storage.session.get(['apiKey','runtimeState']);
  settings = local.settings ? C.migrateSettings(local.settings) : C.clone(C.DEFAULTS);
  if(Array.isArray(local.keptPosts)) keptPosts=new Map(local.keptPosts.filter(e=>Array.isArray(e)&&/^[a-f0-9]{64}$/.test(e[0])&&Number.isFinite(e[1])).slice(-2000));
  apiKey = C.validKey(session.apiKey) ? session.apiKey : '';
  const old = session.runtimeState;
  // Cached decisions use the old rubric semantics; a version mismatch drops them.
  if (C.object(old) && old.version === 3) {
    if (C.object(old.metrics)) metrics = {...freshMetrics(),...old.metrics};
    if (Array.isArray(old.log)) log = old.log.slice(-150);
    if (Array.isArray(old.cache)) cache = new Map(old.cache.filter(e=>Array.isArray(e)&&typeof e[0]==='string'&&C.object(e[1])&&e[1].expires>Date.now()).slice(-MAX_CACHE));
    cooldownUntil = Number(old.cooldownUntil)||0;
    authRejected = old.authRejected === true;
    verifiedAt=Number(old.verifiedAt)||0;
    if(Array.isArray(old.pageReports))pageReports=new Map(old.pageReports.slice(-100));
  }
})();
function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    const runtimeState = {version:3,metrics,log,cache:[...cache.entries()],cooldownUntil,authRejected,verifiedAt,pageReports:[...pageReports]};
    chrome.storage.session.set({runtimeState}).catch(() => {});
  },100);
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
async function saveSettings(patch) {
  return serializeChange(async () => {
    const next = C.sanitizeSettings({...settings,...patch,categories:{...settings.categories,...(C.object(patch.categories)?patch.categories:{})}});
    for (const site of next.sites) {
      if (!await chrome.permissions.contains({origins:C.originsForSite(site)})) throw new Error('FORBIDDEN');
    }
    cancelPending();
    await chrome.storage.local.set({settings:next});
    settings = next;
    await broadcast();
    await syncScripts();
    return C.clone(settings);
  });
}
function publicConfig(site) {
  const value = C.clone(settings);
  value.allowedAuthors = value.allowedAuthors.filter(a=>a.startsWith(site+':'));
  return {settings:value,keyReady:!!apiKey && !authRejected,revision};
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
    latencyMs:result?.latencyMs||0,cached,error,category:decision.category||null,protected:decision.protected===true,conflict:decision.conflict===true});
  metrics.decisions++;
  if(decision.protected)metrics.protected++;
  if(decision.usefulPromotion)metrics.usefulPromotions++;
  if (log.length>150) log.splice(0,log.length-150);
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
  if (early.source==='allowlist' || early.source==='local') {addLog(r,early,null);return {decision:early,result:null,cached:false};}
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
async function status() {
  const stored = await chrome.storage.local.get(['vault','dailyUsage']);
  const today = emptyDay();
  return {settings:C.clone(settings),keyReady:!!apiKey,authRejected,hasVault:!!stored.vault,
    metrics:C.clone(metrics),daily:stored.dailyUsage?.date===today.date?stored.dailyUsage:today,
    queue:queue.length,active,cached:cache.size,revision,log:C.clone(log).reverse(),cooldownUntil,verifiedAt,keptPosts:keptPosts.size,pages:[...pageReports.values()]};
}
async function diagnostics() {
  const s=await status();
  const permissions=await chrome.permissions.getAll();
  return {
    format:'feedgate-diagnostics',version:3,extensionVersion:C.VERSION,rubric:C.RUBRIC_VERSION,
    generatedAt:new Date().toISOString(),environment:'chrome-extension',
    privacy:'No keys, vault ciphertext, post text, author names, post hashes, full URLs, custom rule text or browser history included.',
    connection:{transport:'direct TypeSafe HTTPS',model:settings.model,keyReady:s.keyReady,authRejected,verifiedAt,
      hasEncryptedVault:s.hasVault,cooldownUntil},
    settings:{enabled:settings.enabled,consent:settings.consent,sites:settings.sites,preset:settings.preset,
      mode:settings.mode,protectUseful:settings.protectUseful,profileMode:settings.profileMode,labelledAds:settings.labelledAds,
      categories:settings.categories,concurrency:settings.concurrency,dailyLimit:settings.dailyLimit,cacheMinutes:settings.cacheMinutes,
      hasCustomRule:!!settings.customInstruction,cosmeticRuleCount:C.parseCosmeticRules(settings.cosmeticRules).rules.length,
      allowedAuthorCount:settings.allowedAuthors.length,savedPostChoices:keptPosts.size},
    metrics:C.clone(metrics),daily:s.daily,queue:queue.length,active,cached:cache.size,
    permissions:{permissions:permissions.permissions||[],origins:permissions.origins||[]},
    pages:[...pageReports.values()].filter(p=>Date.now()-p.updatedAt<86400000),
    decisions:log.slice(-150).map(e=>({at:e.at,site:e.site,action:e.action,wouldAction:e.wouldAction,source:e.source,
      rule:e.rule||null,category:e.category,protected:e.protected,conflict:e.conflict===true,
      sufficient:C.finite(e.scores?.sufficient),scores:e.scores,model:e.model,latencyMs:e.latencyMs,cached:e.cached,error:e.error?.code||null}))
  };
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
    return publicConfig(site);
  }
  if(message.type==='FG_OPEN_SETTINGS_FROM_PAGE') {
    await validateContentSender(sender,{allowPrivate:true,allowDisabled:true});
    await chrome.runtime.openOptionsPage();return {opened:true};
  }
  if (message.type==='FG_CLASSIFY') return classify(message.record,sender,trusted);
  if (message.type==='FG_ALLOW_AUTHOR') {
    const site = trusted ? message.site : await validateContentSender(sender);
    const key = C.authorKey(site,message.author);
    if (!key) throw new Error('INVALID_RECORD');
    await saveSettings({allowedAuthors:[...settings.allowedAuthors,key]});
    return {saved:true};
  }
  if (message.type==='FG_ADD_RULE') {
    const site = await validateContentSender(sender);
    const host = new URL(sender.url).hostname;
    const selector = C.text(message.selector,400);
    const line = `${host}##${selector}`;
    const parsed = C.parseCosmeticRules(line);
    if (!site || parsed.errors.length || parsed.rules.length!==1) throw new Error('INVALID_RECORD');
    const lines = settings.cosmeticRules.split('\n');
    if (!lines.includes(line)) lines.push(line);
    await saveSettings({cosmeticRules:lines.join('\n')});
    return {saved:true};
  }
  if (message.type==='FG_PAGE_STATS') {
    const site=await validateContentSender(sender,{allowPrivate:true,allowDisabled:true});
    const value=C.object(message.stats)?message.stats:{};
    const summary={site,context:C.pageContext(sender.url),updatedAt:Date.now()};
    for(const name of ['observed','collapsed','dimmed','pending','completed','kept','protected','errors','detectedTotal']) {
      summary[name]=C.clamp(Math.floor(Number(value[name])||0),0,1000000);
    }
    summary.enabled=value.enabled===true;
    summary.state=['ready','paused','no-consent','locked','private','site-off','error'].includes(value.state)?value.state:'error';
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
  if (!trusted) throw new Error('FORBIDDEN');
  switch(message.type) {
    case 'FG_STATUS': return status();
    case 'FG_DIAGNOSTICS': return diagnostics();
    case 'FG_PATCH_SETTINGS': return {settings:await saveSettings(C.object(message.patch)?message.patch:{})};
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
      const stamp=++credentialEpoch;
      return commitCredential(stamp,async()=>{await keyChange('');await chrome.storage.local.remove('vault');return {forgotten:true};});
    }
    case 'FG_TEST_CONNECTION': {
      checkReady();
      const r = C.sanitizeRecord({id:'connection-test',text:'I built an open-source Discord moderation tool using Jev. My test processed 1,000 messages per day. Here are the implementation details, measured API usage, known false positives and setup instructions. Human moderators still handle appeals.',author:'',mediaAlt:'',linkDomains:[]},'demo');
      const stamp=revision;
      const result = await enqueue(()=>makeRemote(r,stamp,async()=>{}),stamp);
      return {model:result.model,latencyMs:result.latencyMs,usage:result.usage,scores:result.scores,decision:C.decide(r,result,settings)};
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
      clean.consent=false;clean.sites=[];
      return {format:'feedgate-settings',version:3,settings:clean};
    }
    case 'FG_IMPORT_SETTINGS': {
      if (!C.object(message.data)||message.data.format!=='feedgate-settings'||(message.data.version!==3&&message.data.version!==2)) throw new Error('INVALID_RECORD');
      // 2.0 exports are migrated safely: thresholds never map promotion onto unwanted advertising.
      const imported=C.migrateSettings(message.data.settings);
      imported.consent=false;imported.sites=[];
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
  }).catch(()=>{});
});
chrome.runtime.onStartup.addListener(()=>{ready.then(syncScripts).catch(()=>{});});
chrome.permissions.onRemoved.addListener(()=>{
  ready.then(()=>serializeChange(async()=>{
    const sites=[];
    for (const site of settings.sites) if (await chrome.permissions.contains({origins:C.originsForSite(site)})) sites.push(site);
    cancelPending();settings={...settings,sites};
    await chrome.storage.local.set({settings});
    await broadcast();await syncScripts();
  })).catch(()=>{});
});

chrome.tabs.onRemoved?.addListener(tabId=>{pageReports.delete(tabId);persistSoon();});
