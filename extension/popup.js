/* SPDX-License-Identifier: GPL-3.0-or-later */
import './core.js';
const C=globalThis.FeedGateCore,$=id=>document.getElementById(id);
let state,tab,site;
async function rpc(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.error?.code||'INTERNAL_ERROR');return r.data;}
async function run(fn){try{await fn();}catch(error){$('message').textContent=C.userError(error).message;$('message').classList.add('error');}}
async function load(){
  state=await rpc('FG_STATUS');[tab]=await chrome.tabs.query({active:true,currentWindow:true});site=C.siteForURL(tab?.url);
  let host='No supported feed';try{host=new URL(tab.url).hostname;}catch{}
  $('host').textContent=host;
  const keyReady=state.keyReady&&!state.authRejected;
  $('connection').textContent=keyReady?(state.verifiedAt?'API verified':'Key ready'):'Key locked';$('connection').className='badge '+(keyReady?'live':'warn');
  const on=!!site&&state.settings.sites.includes(site),privateRoute=site&&C.isPrivateRoute(tab?.url);
  $('site-toggle').disabled=!site||!!privateRoute;
  $('site-toggle').textContent=on?'Disable on this platform':'Enable on this platform';
  $('pause').textContent=state.settings.enabled?'Pause everywhere':'Resume everywhere';
  let page;
  try{page=await chrome.tabs.sendMessage(tab.id,{type:'FG_GET_PAGE_STATE'});}catch{}
  for(const id of ['restore','rescan','pick'])$(id).disabled=!on||!!privateRoute||!page;
  $('filtered').textContent=String((page?.collapsed||0)+(page?.dimmed||0));$('observed').textContent=String(page?.observed||0);$('pending').textContent=page?.pending?`${page.pending} pending`:'No pending requests';
  const description=!site?'Supported feeds: X, Reddit, LinkedIn, Facebook and Instagram.':privateRoute?'Private or unsupported route. FeedGate is paused here.':!on?'This platform is off. No post text is being read.':!state.settings.enabled?'Globally paused. Posts are left visible.':!state.settings.consent?'Local rules only. Enable TypeSafe data-sharing consent in Settings.':!keyReady?'Local rules only. Unlock your key to use Jev.':!page?'Adapter starting. Reload the tab if it does not appear.':state.settings.mode==='observe'?'Observe mode. Judgments are logged without hiding posts.':'Live filtering enabled. Every change can be undone.';
  $('page-info').textContent=description;
  $('message').textContent=page?.lastError?.message||'';
  $('message').classList.toggle('error',!!page?.lastError);
}
$('diagnostics').addEventListener('click',()=>run(()=>chrome.tabs.create({url:chrome.runtime.getURL('options.html#review')})));
$('settings').addEventListener('click',()=>run(()=>rpc('FG_OPEN_SETTINGS')));
$('site-toggle').addEventListener('click',async()=>{
  if(!site)return;$('site-toggle').disabled=true;
  await run(async()=>{
    const on=state.settings.sites.includes(site);
    if(!on&&!await chrome.permissions.request({origins:C.originsForSite(site)}))return;
    const current=await rpc('FG_STATUS');
    const sites=on?current.settings.sites.filter(s=>s!==site):[...new Set([...current.settings.sites,site])];
    await rpc('FG_PATCH_SETTINGS',{patch:{sites}});
    if(on)await chrome.permissions.remove({origins:C.originsForSite(site)});
    await load();
  });$('site-toggle').disabled=!site;
});
$('pause').addEventListener('click',()=>run(async()=>{await rpc('FG_PATCH_SETTINGS',{patch:{enabled:!state.settings.enabled}});await load();}));
for(const [id,command]of [['restore','FG_RESTORE_ALL'],['rescan','FG_RESCAN'],['pick','FG_PICK_ELEMENT']])$(id).addEventListener('click',()=>run(async()=>{await rpc('FG_TAB_COMMAND',{command,tabId:tab.id});if(id==='pick')window.close();else await load();}));
await run(load);
