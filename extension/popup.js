/* SPDX-License-Identifier: GPL-3.0-or-later */
import './core.js';
const C=globalThis.FeedGateCore;
const $=id=>document.getElementById(id);
let activeTab=null,site=null,status=null;
async function rpc(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.error?.code||'INTERNAL_ERROR');return r.data;}
function showError(error){const box=$('error-box'),msg=C.userError(error).message;box.textContent=msg;box.classList.remove('hidden');$('message').textContent='';}
function clearError(){$('error-box').classList.add('hidden');$('error-box').textContent='';}
async function action(fn){try{clearError();await fn();await refresh();}catch(error){showError(error);}}
function openPage(hash){chrome.tabs.create({url:chrome.runtime.getURL('options.html'+hash)});}
async function pageState(){
  if(!site&&!isDemo())return null;
  try{return await chrome.tabs.sendMessage(activeTab.id,{type:'FG_GET_PAGE_STATE'});}catch{return null;}
}
function isDemo(){return activeTab?.url?.startsWith('chrome-extension://');}
function describe(page,state){
  if(!site&&!isDemo())return 'This platform is not supported. Nothing is read here.';
  if(!state)return 'Open or refresh a supported feed page so the content script can report.';
  if(state.state==='private')return 'Private or editor route. Nothing is read here.';
  if(state.state==='recovery')return 'Filtering is paused for this site. Posts are visible; recovery is available below.';
  if(state.state==='stale')return 'The extension was updated. Reload this page to enable filtering again.';
  if(!status.settings.enabled)return 'Filtering is paused everywhere. The status panel choice is kept.';
  if(state.state==='site-off')return 'This site is not enabled. Nothing is sent anywhere.';
  if(state.state==='no-consent')return 'Local rules only. TypeSafe consent is off, so no cloud judgments are requested.';
  if(state.state==='locked')return 'Key locked. Add or unlock your TypeSafe key to enable judgments; local rules still run.';
  if(state.state==='error')return 'Last request failed. Local decisions still protect you. Check diagnostics.';
  if(status.settings.mode==='observe')return 'Observe Only. Judgments are logged without hiding posts.';
  return 'Running. Local hiding is reversible with Show filtered posts.';
}
function cosmeticCounts(){const rules=status?.settings?.cosmeticFilters?.rules||[];const counts={total:rules.length,active:0,quarantined:0};for(const r of rules){if(r.status==='active')counts.active++;else if(r.status==='quarantined')counts.quarantined++;}return counts;}
async function refresh(){
  status=await rpc('FG_STATUS');
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});activeTab=tabs[0]||null;
  site=activeTab&&!isDemo()?C.siteForURL(activeTab.url):null;
  const page=await pageState();
  $('host').textContent=activeTab?(isDemo()?'Local test feed':site?C.SITE_DEFS[site].label:new URL(activeTab.url||'https://x.com').hostname):'No active tab';
  $('page-info').textContent=describe(page,page);
  const ready=status.keyReady&&!status.authRejected;
  $('connection').textContent=status.authRejected?'Key rejected':ready?(status.verifiedAt?'API verified':'Key unlocked'):'Key locked';
  $('connection').className='badge '+(ready?'live':'warn');
  const st=status.siteStates?.find(x=>x.site===site);
  const selected=!!st?.selected;
  $('site-toggle').disabled=!site;
  $('site-toggle').textContent=site?(selected?'Disable on this platform':'Enable on this platform'):'Unsupported platform';
  $('site-toggle').dataset.selected=selected?'1':'0';
  const observed=page?.observed||0,hidden=(page?.collapsed||0)+(page?.dimmed||0);
  $('filtered').textContent=hidden;$('observed').textContent=observed;
  $('pending').textContent=page?.pending?`${page.pending} pending judgment(s)`:'No pending requests';
  $('hud-mode').value=status.settings.hudMode||'compact';
  $('pause').textContent=status.settings.enabled?'Pause everywhere':'Resume everywhere';
  const supported=!!site||isDemo();
  for(const id of ['restore','rescan','pick'])$(id).disabled=!supported;
  const states=status.siteStates||[];
  const perm=states.filter(s=>s.permitted).length,sel=states.filter(s=>s.selected).length;
  $('feeds-line').textContent=`${sel} selected · ${perm} permitted · ${Math.max(0,sel-perm)} need Chrome access`;
  $('enable-all').textContent='Enable all supported feeds';$('disable-all').textContent='Disable all feeds';
  const counts=cosmeticCounts();
  $('cosmetic-line').textContent=`${counts.active} active · ${counts.quarantined} needs review · of ${counts.total} rule(s)${status.settings.cosmeticEnabled?'':' · cosmetic filtering is off'}`;
  $('cosmetic-toggle').textContent=status.settings.cosmeticEnabled?'Disable cosmetic filtering':'Enable cosmetic filtering';
  const picker=status.settings.cosmeticFilters.rules.filter(r=>r.source==='picker'&&r.status==='active').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
  $('undo-rule').disabled=!picker;$('undo-rule').dataset.rule=picker?.id||'';
  const paused=!!st?.recoveryPaused;
  $('reload-paused').disabled=!supported||!paused;
  $('recover-site').disabled=!supported||paused;$('resume-site').disabled=!supported||!paused;
  $('recovery-line').textContent=paused?'Filtering is paused for this site. Open tabs were asked to restore; reload if anything remains hidden.':(st?.reason&&st.reason!=='ready')?'Current site state: '+(st.reason.replace(/_/g,' '))+'.':'Nothing to recover on this site.';
  $('message').textContent='';
}
$('site-toggle').addEventListener('click',()=>action(async()=>{
  const selected=$('site-toggle').dataset.selected==='1';
  if(!selected){const granted=await chrome.permissions.request({origins:C.originsForSite(site)});if(!granted)throw new Error('FORBIDDEN');}
  const fresh=await rpc('FG_STATUS');
  const sites=selected?fresh.settings.sites.filter(x=>x!==site):[...new Set([...fresh.settings.sites,site])];
  await rpc('FG_PATCH_SETTINGS',{patch:{sites},domain:'settings',expect:fresh.settings.revisions.settings});
  if(selected)await chrome.permissions.remove({origins:C.originsForSite(site)});
}));
$('pause').addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{enabled:!fresh.settings.enabled},domain:'settings',expect:fresh.settings.revisions.settings});}));
$('hud-mode').addEventListener('change',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{hudMode:$('hud-mode').value},domain:'ui',expect:fresh.settings.revisions.ui});}));
for(const [id,command] of [['restore','FG_RESTORE_ALL'],['rescan','FG_RESCAN'],['pick','FG_PICK_ELEMENT']])$(id).addEventListener('click',()=>action(()=>rpc('FG_TAB_COMMAND',{command,tabId:activeTab.id})));
$('enable-all').addEventListener('click',()=>action(async()=>{
  const missing=[];for(const [id] of Object.entries(C.SITE_DEFS)){const st=status.siteStates.find(x=>x.site===id);if(!st?.permitted)missing.push(...C.originsForSite(id));}
  if(missing.length){const granted=await chrome.permissions.request({origins:missing});if(!granted)$('message').textContent='Chrome did not grant the requested origins; declined feeds stay off.';}
  const fresh=await rpc('FG_STATUS');
  await rpc('FG_PATCH_SETTINGS',{patch:{sites:fresh.siteStates.filter(x=>x.permitted).map(x=>x.site)},domain:'settings',expect:fresh.settings.revisions.settings});
}));
$('disable-all').addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{sites:[]},domain:'settings',expect:fresh.settings.revisions.settings});for(const id of Object.keys(C.SITE_DEFS))await chrome.permissions.remove({origins:C.originsForSite(id)});}));
$('cosmetic-toggle').addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{cosmeticEnabled:!fresh.settings.cosmeticEnabled},domain:'cosmetic',expect:fresh.settings.revisions.cosmetic});}));
$('undo-rule').addEventListener('click',()=>action(async()=>{const id=$('undo-rule').dataset.rule;if(!id)return;const fresh=await rpc('FG_STATUS');await rpc('FG_RULE_DELETE',{id,expect:fresh.settings.revisions.cosmetic});$('message').textContent='The latest picked rule was undone. Its live effect is removed from open tabs.';}));
$('manage-rules').addEventListener('click',()=>openPage('#rules'));
$('recover-site').addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');const r=await rpc('FG_RECOVER_SITE',{site,expect:fresh.settings.revisions.recovery});$('message').textContent=r.acknowledged?`Pause saved. ${r.tabs} open tab(s) cleaned up their effects.`:'Pause saved first. No tab acknowledged cleanup; use “Reload this tab with filtering paused” if posts remain hidden.';}));
$('resume-site').addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');const r=await rpc('FG_RESUME_SITE',{site,expect:fresh.settings.revisions.recovery});$('message').textContent=`Filtering resumed. ${r.quarantined} rule(s) still need review.`;}));
$('reload-paused').addEventListener('click',()=>action(async()=>{await rpc('FG_RELOAD_PAUSED',{tabId:activeTab.id});}));
$('diagnostics').addEventListener('click',()=>openPage('#review'));
$('settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
refresh().catch(showError);
