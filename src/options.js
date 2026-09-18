/* SPDX-License-Identifier: GPL-3.0-or-later */
import './core.js';
const C=globalThis.FeedGateCore;
const $=id=>document.getElementById(id);
let state=null,toastTimer;
function el(tag,value,cls){const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;}
async function rpc(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.error?.code||'INTERNAL_ERROR');return r.data;}
function notice(id,message,error=false){const n=$(id);n.textContent=message;n.className='statusline '+(error?'error':'success');}
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6500);}
async function action(fn,statusId){try{return await fn();}catch(error){const msg=C.userError(error).message;if(statusId)notice(statusId,msg,true);else toast(msg);return null;}}
function navigate(id){for(const n of document.querySelectorAll('.page'))n.classList.toggle('active',n.id===id);for(const b of document.querySelectorAll('[data-page]'))b.classList.toggle('active',b.dataset.page===id);history.replaceState(null,'','#'+id);}
for(const btn of document.querySelectorAll('[data-page]'))btn.addEventListener('click',()=>navigate(btn.dataset.page));
if(['overview','policy','connection','review','rules'].includes(location.hash.slice(1)))navigate(location.hash.slice(1));
function fillMetrics(){
  if(!state)return;
  const m={...state.metrics,latency:state.metrics.lastLatencyMs||'n/a',daily:state.daily.requests};
  for(const n of document.querySelectorAll('[data-stat]'))n.textContent=typeof m[n.dataset.stat]==='number'?m[n.dataset.stat].toLocaleString():String(m[n.dataset.stat]??0);
  const ready=state.keyReady&&!state.authRejected;
  $('key-badge').textContent=state.authRejected?'Key rejected':ready?(state.verifiedAt?'API verified':'Key unlocked'):'Key locked';
  $('key-badge').className='badge '+(ready?'live':'warn');
  $('global-toggle').textContent=state.settings.enabled?'Pause filtering':'Resume filtering';
  $('unlock-form').classList.toggle('hidden',!state.hasVault);
  const configured=ready&&state.settings.consent&&state.settings.sites.length>0;
  $('setup-form').classList.toggle('hidden',!!configured);
  $('setup-complete').classList.toggle('hidden',!configured);
  $('setup-key').required=!ready;
  $('setup-unlock-link').classList.toggle('hidden',!state.hasVault);
  $('preset-badge').textContent=state.settings.preset;
  for(const n of document.querySelectorAll('[data-preset]'))n.classList.toggle('selected',n.dataset.preset===state.settings.preset);
  fillPages();
  const err=state.metrics.lastError;
  $('last-error').classList.toggle('hidden',!err);
  $('last-error').textContent=err?err.message:'';
}
function fillPages(){
  const list=$('page-reports');list.replaceChildren();
  if(!state.pages?.length){list.append(el('p','No page report yet. Enable a site and open or refresh its feed.','fine'));return;}
  for(const page of state.pages){
    const row=el('div',undefined,'page-report'),label=el('strong',page.site),details=el('code');
    details.textContent=`${page.state} / ${page.context} | detected ${page.observed} | pending ${page.pending} | completed ${page.completed} | kept ${page.kept} | protected ${page.protected} | collapsed ${page.collapsed} | dimmed ${page.dimmed} | errors ${page.errors}`;
    if(page.error)details.textContent+=' | '+page.error;
    row.append(label,details);list.append(row);
  }
}
function fillSites(){
  const list=$('sites');list.replaceChildren();
  for(const [id,def] of Object.entries(C.SITE_DEFS)){
    const row=el('div',undefined,'site'),info=el('div'),button=el('button');
    const on=state.settings.sites.includes(id);
    info.append(el('strong',def.label),el('small',def.status));button.textContent=on?'Enabled':'Enable';button.className=on?'on':'';button.dataset.site=id;
    button.addEventListener('click',async()=>{
      button.disabled=true;
      await action(async()=>{
        if(!on){
          // Must be invoked directly in the trusted user click handler.
          const granted=await chrome.permissions.request({origins:C.originsForSite(id)});
          if(!granted){toast('Chrome did not grant site access. Nothing was enabled.');return;}
        }
        const current=await rpc('FG_STATUS');
        const sites=on?current.settings.sites.filter(x=>x!==id):[...new Set([...current.settings.sites,id])];
        await rpc('FG_PATCH_SETTINGS',{patch:{sites}});
        if(on)await chrome.permissions.remove({origins:C.originsForSite(id)});
        await load();toast(on?'Site disabled and access removed.':`${def.label} enabled. Already-open tabs are injected automatically.`);
      });button.disabled=false;
    });row.append(info,button);list.append(row);
  }
}
function fillCategories(){
  const list=$('categories');list.replaceChildren();
  for(const [id,def] of Object.entries(C.CATEGORIES)){
    const rule=state.settings.categories[id],row=el('div',undefined,'policy'),text=el('div');
    text.append(el('h3',def.label),el('p',def.description));
    const mode=el('select');mode.dataset.categoryMode=id;mode.setAttribute('aria-label',def.label+' action');
    for(const [value,label] of [['off','Off'],['dim','Dim'],['collapse','Collapse']]){const o=el('option',label);o.value=value;mode.append(o);}mode.value=rule.mode;
    const wrap=el('div',undefined,'threshold'),range=el('input'),output=el('output',Math.round(rule.threshold*100)+'%');
    range.type='range';range.min='50';range.max='99.9';range.step='.1';range.value=String(rule.threshold*100);range.dataset.categoryThreshold=id;range.setAttribute('aria-label',def.label+' threshold');
    range.addEventListener('input',()=>output.textContent=Number(range.value).toFixed(1).replace('.0','')+'%');
    wrap.append(range,output);row.append(text,mode,wrap);list.append(row);
  }
}
function fillAllowlist(){
  const list=$('allowlist');list.replaceChildren();
  if(!state.settings.allowedAuthors.length){list.append(el('p','No author exceptions yet.','fine'));return;}
  for(const author of state.settings.allowedAuthors){const row=el('div',undefined,'allow-item'),button=el('button','Remove','small-btn');button.addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{allowedAuthors:fresh.settings.allowedAuthors.filter(a=>a!==author)}});await load();}));row.append(el('span',author),button);list.append(row);}
}
function fillLog(){
  const list=$('log');list.replaceChildren();
  if(!state?.log.length){list.append(el('div','No decisions yet. Enable a feed or open the test feed after adding your key.','log-empty'));return;}
  for(const entry of state.log){
    const item=el('details',undefined,'log-entry'),summary=el('summary'),body=el('div',undefined,'log-body');
    summary.append(el('time',new Date(entry.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})),el('span',entry.site,'source'),el('span',entry.author||'No author label','author'),el('span',entry.error?'unclassified':entry.wouldAction?'observe':entry.action,'action-pill '+entry.action));
    body.append(el('div',entry.reason));
    if(entry.error)body.append(el('div',entry.error.message));
    body.append(el('div',`${entry.model||'Local / no model result'} · ${entry.cached?'cached':(entry.latencyMs+' ms')} · ${entry.source}`,'fine'));
    if(entry.scores){const scores=el('div',undefined,'score-grid');for(const [k,v]of Object.entries(entry.scores))scores.append(el('span',`${k}: ${Math.round(v*100)}%`));body.append(scores);}
    item.append(summary,body);list.append(item);
  }
}
async function load(full=true){
  state=await rpc('FG_STATUS');fillMetrics();
  if(!full)return;
  const s=state.settings;fillSites();fillCategories();fillAllowlist();fillLog();
  $('application-mode').value=s.mode;$('profile-mode').value=s.profileMode;$('protect-useful').checked=s.protectUseful;$('show-status').checked=s.showStatus;$('labelled-ads').checked=s.labelledAds;$('consent').checked=s.consent;
  $('custom-instruction').value=s.customInstruction;$('daily-limit').value=String(s.dailyLimit);$('concurrency').value=String(s.concurrency);$('cache-minutes').value=String(s.cacheMinutes);$('model-id').value=s.model;$('cosmetic-rules').value=s.cosmeticRules;
}
$('global-toggle').addEventListener('click',()=>action(async()=>{const current=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{enabled:!current.settings.enabled}});await load();}));
$('open-demo').addEventListener('click',()=>action(()=>rpc('FG_OPEN_DEMO')));
$('policy-form').addEventListener('submit',ev=>{ev.preventDefault();action(async()=>{
  const categories={};for(const n of document.querySelectorAll('[data-category-mode]')){const id=n.dataset.categoryMode;categories[id]={mode:n.value,threshold:Number(document.querySelector(`[data-category-threshold="${id}"]`).value)/100};}
  await rpc('FG_PATCH_SETTINGS',{patch:{preset:'custom',profileMode:$('profile-mode').value,protectUseful:$('protect-useful').checked,showStatus:$('show-status').checked,mode:$('application-mode').value,labelledAds:$('labelled-ads').checked,customInstruction:$('custom-instruction').value,dailyLimit:Number($('daily-limit').value),concurrency:Number($('concurrency').value),cacheMinutes:Number($('cache-minutes').value),categories}});
  await load();notice('policy-status','Policy saved. Open feeds have been re-evaluated.');
},'policy-status');});
$('remember-key').addEventListener('change',()=>{$('vault-create-field').classList.toggle('hidden',!$('remember-key').checked);$('vault-create-pass').required=$('remember-key').checked;});
$('key-form').addEventListener('submit',async ev=>{
  ev.preventDefault();const button=ev.submitter;button.disabled=true;
  try{await action(async()=>{await rpc('FG_SET_KEY',{key:$('api-key').value,remember:$('remember-key').checked,passphrase:$('vault-create-pass').value});await load();notice('key-status','Key unlocked. Nothing has been sent by saving it; enabled feeds may now request judgments if consent is on.');},'key-status');}
  finally{$('api-key').value='';$('vault-create-pass').value='';button.disabled=false;}
});
$('unlock-form').addEventListener('submit',async ev=>{ev.preventDefault();ev.submitter.disabled=true;try{await action(async()=>{await rpc('FG_UNLOCK',{passphrase:$('unlock-pass').value});await load();notice('key-status','Vault unlocked for this browser session.');},'key-status');}finally{$('unlock-pass').value='';ev.submitter.disabled=false;}});
$('lock-key').addEventListener('click',()=>action(async()=>{await rpc('FG_LOCK');await load();notice('key-status','Key locked. In-flight inference cancelled. Local rules can still run.');},'key-status'));
$('forget-key').addEventListener('click',()=>action(async()=>{await rpc('FG_FORGET_KEY');await load();notice('key-status','Key and saved vault removed.');},'key-status'));
$('consent').addEventListener('change',()=>action(async()=>{await rpc('FG_PATCH_SETTINGS',{patch:{consent:$('consent').checked}});await load(false);toast($('consent').checked?'TypeSafe inference consent enabled.':'Consent withdrawn. Pending requests cancelled.');}));
$('save-model').addEventListener('click',()=>action(async()=>{
  if(!/^jev-[a-zA-Z0-9._-]{1,60}$/.test($('model-id').value)) {notice('test-status','Use a valid Jev model ID, for example jev-latest.',true);return;}
  await rpc('FG_PATCH_SETTINGS',{patch:{model:$('model-id').value}});await load(false);notice('test-status','Model saved. Use the live connection test to check availability.');
},'test-status'));
$('test-connection').addEventListener('click',async()=>{const b=$('test-connection');b.disabled=true;notice('test-status','Calling TypeSafe with one fictional post...');try{await action(async()=>{const r=await rpc('FG_TEST_CONNECTION');notice('test-status',`Connected: ${r.model}\n${r.latencyMs} ms · ${r.usage.input_tokens} input tokens · ${r.usage.output_tokens} output tokens\nPolicy on this fictional project: ${r.decision?.action||'unknown'} (${r.decision?.reason||'no policy result'}).\nValid transport is not proof of classification accuracy.`);await load(false);},'test-status');}finally{b.disabled=false;}});
$('rules-form').addEventListener('submit',ev=>{ev.preventDefault();action(async()=>{
  const raw=$('cosmetic-rules').value,parsed=C.parseCosmeticRules(raw),errors=[...parsed.errors];
  for(const rule of parsed.rules)try{document.querySelector(rule.selector);}catch{errors.push(`Line ${rule.line}: invalid CSS selector.`);}
  if(errors.length){notice('rules-status',errors.slice(0,8).join('\n'),true);return;}
  await rpc('FG_PATCH_SETTINGS',{patch:{cosmeticRules:raw}});await load();notice('rules-status',`Saved ${parsed.rules.length} local cosmetic rules.`);
},'rules-status');});
$('clear-session').addEventListener('click',()=>action(async()=>{await rpc('FG_CLEAR_SESSION');await load();toast('Decision log and result cache cleared. The API key and daily budget count were kept.');}));
$('refresh-log').addEventListener('click',()=>action(async()=>{await load(false);fillLog();}));
$('export-settings').addEventListener('click',()=>action(async()=>{
  const data=await rpc('FG_EXPORT_SETTINGS'),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');
  a.href=url;a.download='feedgate-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}));
$('import-settings').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',()=>action(async()=>{
  const file=$('import-file').files?.[0];if(!file)return;if(file.size>100000)throw new Error('INVALID_RECORD');
  let data;try{data=JSON.parse(await file.text());}catch{throw new Error('INVALID_RECORD');}
  await rpc('FG_IMPORT_SETTINGS',{data});$('import-file').value='';await load();toast('Settings imported. Site access and inference consent must be enabled again.');
}));
function saveDownload(filename,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const anchor=el('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('export-diagnostics').addEventListener('click',()=>action(async()=>{
  const data=await rpc('FG_DIAGNOSTICS');
  saveDownload('feedgate-2.1-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',data);
  toast('Diagnostic file prepared. It does not contain keys, post text, authors or full browsing URLs.');
}));
$('clear-cache').addEventListener('click',()=>action(async()=>{await rpc('FG_CLEAR_CACHE');await load();toast('Cached scores cleared. Enabled feeds may make new API requests.');}));
$('reset-feedback').addEventListener('click',()=>action(async()=>{await rpc('FG_RESET_FEEDBACK');await load();toast('Saved per-post choices cleared.');}));
for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>action(async()=>{
  const name=button.dataset.preset;
  const patch=name==='custom'?{preset:'custom',mode:'filter',protectUseful:true}:C.presetPatch(name);
  await rpc('FG_PATCH_SETTINGS',{patch});await load();
  notice('policy-status','Preset applied. Cached features are being evaluated against the new rules.');
}));
$('setup-remember').addEventListener('change',()=>{
  $('setup-vault-field').classList.toggle('hidden',!$('setup-remember').checked);
  $('setup-passphrase').required=$('setup-remember').checked;
});
$('setup-unlock-link').addEventListener('click',()=>navigate('connection'));
$('open-x').addEventListener('click',()=>action(()=>chrome.tabs.create({url:'https://x.com/home'})));
$('setup-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('setup-connect');button.disabled=true;
  const id=$('setup-site').value,key=$('setup-key').value.trim();
  try {
    if(!$('setup-consent').checked)throw new Error('CONSENT_REQUIRED');
    if(!key&&!state?.keyReady)throw new Error('INVALID_KEY');
    if(key&&!C.validKey(key))throw new Error('INVALID_KEY');
    // Request optional permission while still handling the explicit user gesture.
    const granted=await chrome.permissions.request({origins:C.originsForSite(id)});
    if(!granted){notice('setup-status','Chrome did not grant site access. Nothing was enabled.',true);return;}
    notice('setup-status','Saving your key and checking the real TypeSafe endpoint...');
    if(key)await rpc('FG_SET_KEY',{key,remember:$('setup-remember').checked,passphrase:$('setup-passphrase').value});
    await rpc('FG_PATCH_SETTINGS',{patch:{consent:true,enabled:true}});
    const test=await rpc('FG_TEST_CONNECTION');
    const current=await rpc('FG_STATUS');
    const patch={sites:[...new Set([...current.settings.sites,id])]};
    if(!current.settings.sites.length)Object.assign(patch,C.presetPatch('balanced'));
    await rpc('FG_PATCH_SETTINGS',{patch});
    await load();
    toast(`Connected to ${test.model}. ${test.usage.input_tokens} input tokens in the connection test. ${C.SITE_DEFS[id].label} is enabled.`);
    const tabs=await chrome.tabs.query({url:C.originsForSite(id)});
    if(!tabs.length)await chrome.tabs.create({url:id==='x'?'https://x.com/home':id==='reddit'?'https://www.reddit.com/':'https://www.linkedin.com/feed/'});
  } catch(error){notice('setup-status',C.userError(error).message,true);}
  finally{$('setup-key').value='';$('setup-passphrase').value='';button.disabled=false;}
});
await action(()=>load());
setInterval(()=>{if(!document.hidden)action(()=>load(false));},4000);
