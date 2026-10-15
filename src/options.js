/* SPDX-License-Identifier: GPL-3.0-or-later */
import './core.js';
const C=globalThis.FeedGateCore;
const $=id=>document.getElementById(id);
let state=null,toastTimer,lastDeletedRule=null;
function el(tag,value,cls){const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;}
async function rpc(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.error?.code||'INTERNAL_ERROR');return r.data;}
function notice(id,message,error=false){const n=$(id);if(!n)return;n.textContent=message;n.className='statusline '+(error?'error':'success');}
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6500);}
async function action(fn,statusId){try{return await fn();}catch(error){const msg=C.userError(error).message;if(statusId)notice(statusId,msg,true);else toast(msg);return null;}}
function navigate(id){for(const n of document.querySelectorAll('.page'))n.classList.toggle('active',n.id===id);for(const b of document.querySelectorAll('[data-page]'))b.classList.toggle('active',b.dataset.page===id);history.replaceState(null,'','#'+id);}
for(const btn of document.querySelectorAll('[data-page]'))btn.addEventListener('click',()=>navigate(btn.dataset.page));
if(['overview','policy','connection','review','rules','updates'].includes(location.hash.slice(1)))navigate(location.hash.slice(1));
const REASON_LABEL={engine_paused:'Engine paused',not_selected:'Not selected',permission_required:'Needs Chrome access',recovery_pause:'Filtering paused',refresh_required:'Refresh required',ready:'Ready'};
function patchSettings(patch,domain='settings'){
  const expect=state?.settings?.revisions?.[domain];
  return rpc('FG_PATCH_SETTINGS',{patch,domain,expect});
}
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
  fillPages();fillFeeds();fillCosmeticStats();
  const err=state.metrics.lastError;
  $('last-error').classList.toggle('hidden',!err);
  $('last-error').textContent=err?err.message:'';
}
function fillPages(){
  const list=$('page-reports');list.replaceChildren();
  if(!state.pages?.length){list.append(el('p','No page report yet. Enable a site and open or refresh its feed. An empty list does not prove that no renderer is running.','fine'));return;}
  for(const page of state.pages){
    const row=el('div',undefined,'page-report'),label=el('strong',page.site),details=el('code');
    details.textContent=`${page.state} / ${page.context} | detected ${page.observed} | pending ${page.pending} | completed ${page.completed} | kept ${page.kept} | protected ${page.protected} | collapsed ${page.collapsed} | dimmed ${page.dimmed} | cosmetic ${page.cosmeticApplied||0} | errors ${page.errors}`;
    if(page.error)details.textContent+=' | '+page.error;
    row.append(label,details);list.append(row);
  }
}
function fillFeeds(){
  if(!state.siteStates)return;
  const selected=state.siteStates.filter(s=>s.selected).length;
  const permitted=state.siteStates.filter(s=>s.permitted).length;
  const need=Math.max(0,selected-permitted);
  $('feeds-count').textContent=`${selected} selected · ${permitted} permitted`;
  $('feeds-summary').textContent=`Feeds ${selected} selected · ${permitted} permitted · ${need} need Chrome access`;
  const list=$('sites');list.replaceChildren();
  for(const st of state.siteStates){
    const def=C.SITE_DEFS[st.site],row=el('div',undefined,'site'),info=el('div'),badge=el('span',REASON_LABEL[st.reason]||st.reason,'status-chip '+(st.effective?'ok':'warn'));
    info.append(el('strong',`${def.label}${def.status==='beta'?' (beta)':def.status==='primary'?'':' (experimental)'}`),el('small',`${def.status} · ${st.permitted?'access granted':'no access'}${st.recoveryPaused?' · paused':''}`));
    const button=el('button');
    button.textContent=st.selected?'Disable':'Enable';button.className=st.selected?'on':'';button.dataset.site=st.site;
    button.addEventListener('click',async()=>{
      button.disabled=true;
      await action(async()=>{
        if(!st.selected){
          // Permission requests must stay inside the trusted click handler.
          const granted=await chrome.permissions.request({origins:C.originsForSite(st.site)});
          if(!granted){toast('Chrome did not grant site access. Nothing was enabled.');return;}
        }
        const current=await rpc('FG_STATUS');
        const sites=st.selected?current.settings.sites.filter(x=>x!==st.site):[...new Set([...current.settings.sites,st.site])];
        await rpc('FG_PATCH_SETTINGS',{patch:{sites},domain:'settings',expect:current.settings.revisions.settings});
        if(st.selected)await chrome.permissions.remove({origins:C.originsForSite(st.site)});
        await load();toast(st.selected?'Site disabled and access removed. Effects are cleaned up in open tabs.':`${def.label} enabled. Already-open tabs are initialized automatically.`);
      });button.disabled=false;
    });
    row.append(info,badge,button);list.append(row);
  }
}
function fillCosmeticStats(){
  const node=$('cosmetic-stats');if(!node||!state?.cosmetic)return;
  const c=state.cosmetic,m=state.metrics;
  node.textContent=`Applied ${m.cosmeticApplied||0} · Restored ${m.cosmeticRestored||0} · Safety rejections ${m.cosmeticRejected||0} · Breaker activations ${m.breakerActivations||0} · Rules ${c.active} active / ${c.quarantined} quarantined / ${c.disabled} disabled / ${c.deleted} deleted (of ${c.total})${c.enabled?'':' · cosmetic filtering is switched off'}`;
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
  for(const author of state.settings.allowedAuthors){const row=el('div',undefined,'allow-item'),button=el('button','Remove','small-btn');button.addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{allowedAuthors:fresh.settings.allowedAuthors.filter(a=>a!==author)},domain:'settings',expect:fresh.settings.revisions.settings});await load();}));row.append(el('span',author),button);list.append(row);}
}
function fillMuted(){
  const list=$('mute-list');list.replaceChildren();
  if(!state.settings.blockedAuthors.length){list.append(el('p','No muted authors yet. Use “Mute author…” in the status panel (click a post) or on a filtered post card.','fine'));return;}
  for(const author of state.settings.blockedAuthors){const row=el('div',undefined,'allow-item'),button=el('button','Unmute','small-btn');button.addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{blockedAuthors:fresh.settings.blockedAuthors.filter(a=>a!==author)},domain:'settings',expect:fresh.settings.revisions.settings});await load();toast('Author unmuted. Posts from this author can appear again after the next scan.');}));row.append(el('span',author),button);list.append(row);}
}
function fillUsage(state){
  const node=$('usage-stats'),cost=$('usage-cost'),badge=$('usage-badge');
  if(!node||!state?.metrics)return;
  const m=state.metrics,d=state.daily||{requests:0},limit=state.settings.dailyLimit||0;
  const used=d.requests||0,remaining=Math.max(0,limit-used);
  badge.textContent=`${used} / ${limit} today`;
  badge.className='badge '+(remaining>0?'live':'warn');
  const unaccounted=Math.max(0,(m.requests||0)-(m.classified||0)-(m.cancellations||0)-(m.errors||0));
  node.textContent=`${used} used · ${remaining} left today · ${(m.requests||0).toLocaleString()} provider attempts · ${(m.classified||0).toLocaleString()} classified · ${(m.cacheHits||0).toLocaleString()} cache hits · ${(m.errors||0).toLocaleString()} errors · ${(m.cancellations||0).toLocaleString()} cancelled · ${unaccounted.toLocaleString()} unaccounted · ${(m.inputTokens||0).toLocaleString()} in / ${(m.outputTokens||0).toLocaleString()} out tokens`;
  const next=new Date();next.setUTCHours(24,0,0,0);
  const reset=`Daily limit resets at ${next.toLocaleString()} (00:00 UTC).`;
  const p=state.settings.pricing||{inputPerMTok:null,outputPerMTok:null,currency:''};
  if(p.inputPerMTok===null&&p.outputPerMTok===null){cost.textContent=reset+' Provider cost is not calculated (no rates configured).';return;}
  const estimate=((m.inputTokens||0)/1e6)*(p.inputPerMTok||0)+((m.outputTokens||0)/1e6)*(p.outputPerMTok||0);
  cost.textContent=`${reset} ${p.currency?p.currency+' ':''}${estimate.toFixed(4)}: estimate from your own rates, not a provider bill.`;
}
function fillTopics(state){
  if(!state?.settings)return;
  const list=$('topic-list');if(!list)return;list.replaceChildren();
  const topics=state.settings.topics||[];
  if(!topics.length){list.append(el('p','No muted topics yet. Use “Mute topic…” in the status panel or on a post card.','fine'));return;}
  for(const topic of topics){
    const row=el('div',undefined,'allow-item'),info=el('div');
    const expiry=topic.until===0?'No expiry':'Expires '+new Date(topic.until).toLocaleString();
    info.append(el('strong',topic.label),el('small',`${topic.scope==='all'?'All supported sites':'This site'} · ${expiry}`));
    const buttons=el('div',undefined,'rule-actions');
    const edit=el('button','Edit','small-btn');
    edit.addEventListener('click',()=>{
      const label=el('input');label.value=topic.label;label.maxLength=80;label.spellcheck=false;
      const scope=el('select');for(const [v,t] of [['site','This site'],['all','All supported sites']]){const o=el('option',t);o.value=v;scope.append(o);}scope.value=topic.scope;
      const duration=el('select');for(const [v,t] of [['24','24 hours'],['168','7 days'],['0','No expiry']]){const o=el('option',t);o.value=v;duration.append(o);}
      if(topic.until===0)duration.value='0';else duration.value=Math.round((topic.until-Date.now())/3600000)<=24?'24':'168';
      const save=el('button','Save','small-btn'),cancel=el('button','Cancel','small-btn');
      save.addEventListener('click',()=>action(async()=>{
        const hours=Number(duration.value);
        const fresh=await rpc('FG_STATUS');
        await rpc('FG_TOPIC_UPDATE',{id:topic.id,patch:{label:label.value.trim(),scope:scope.value,site:topic.site,until:hours>0?Date.now()+hours*3600000:0},expect:fresh.settings.revisions.settings});
        await load();notice('rules-status','Muted topic updated.');
      }));
      cancel.addEventListener('click',()=>fillTopics(state));
      info.replaceChildren(el('strong',topic.label),label,scope,duration,save,cancel);
    });
    buttons.append(edit);
    const del=el('button','Delete','small-btn danger');
    del.addEventListener('click',()=>action(async()=>{
      const fresh=await rpc('FG_STATUS');
      await rpc('FG_TOPIC_DELETE',{id:topic.id,expect:fresh.settings.revisions.settings});
      await load();toast('Muted topic removed. Posts hidden only by this topic can appear again after the next scan.');
    }));
    buttons.append(del);
    row.append(info,buttons);list.append(row);
  }
}
function updateCustomStatus(){
  const field=$('custom-instruction');if(!field)return;
  const value=field.value.trim();
  $('custom-count').textContent=`${value.length} / 700 characters sent as an extra question`;
  const chip=$('custom-status');chip.textContent=value?'Sent with every cloud request':'Not active';
  chip.classList.toggle('ok',value.length>0);
}
function fillLog(){
  const list=$('log');list.replaceChildren();
  if(!state?.log.length){list.append(el('div','No decisions yet. Enable a feed or open the test feed after adding your key.','log-empty'));return;}
  for(const entry of state.log){
    const item=el('details',undefined,'log-entry'),summary=el('summary'),body=el('div',undefined,'log-body');
    summary.append(el('time',new Date(entry.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})),el('span',entry.site,'source'),el('span',entry.author||'No author label','author'),el('span',entry.error?'unclassified':entry.wouldAction?'observe':entry.action,'action-pill '+entry.action));
    body.append(el('div',entry.reason));
    if(entry.rule)body.append(el('div','rule: '+entry.rule,'fine'));
    if(entry.error)body.append(el('div',entry.error.message));
    body.append(el('div',`${entry.model||'Local / no model result'} · ${entry.cached?'cached':(entry.latencyMs+' ms')} · ${entry.source}`,'fine'));
    if(entry.scores){const scores=el('div',undefined,'score-grid');for(const [k,v]of Object.entries(entry.scores))scores.append(el('span',`${k}: ${Math.round(v*100)}%`));body.append(scores);}
    item.append(summary,body);list.append(item);
  }
}
function ruleStatusText(rule){
  if(rule.status==='active')return 'Active';
  if(rule.status==='quarantined')return `Needs review${rule.reason?': '+rule.reason.replace(/_/g,' '):''}`;
  if(rule.status==='disabled')return 'Disabled';
  return 'Deleted';
}
function fillRuleManager(){
  if(!state?.settings?.cosmeticFilters)return;
  const rules=state.settings.cosmeticFilters.rules,list=$('rule-manager');list.replaceChildren();
  const counts={active:0,quarantined:0,disabled:0,deleted:0};
  for(const rule of rules)counts[rule.status]=(counts[rule.status]||0)+1;
  $('rules-count').textContent=`${counts.active||0} active / ${rules.length} total`;
  if(!rules.length){list.append(el('p','No cosmetic rules yet. Use “Pick element” from the popup or the status panel to add one with a live preview.','fine'));return;}
  const commit=async(patch,id,statusId='rules-status')=>action(async()=>{
    const fresh=await rpc('FG_STATUS');
    await rpc('FG_RULE_UPDATE',{id,patch,expect:fresh.settings.revisions.cosmetic});
    await load();notice(statusId,'Rule updated.');
  },statusId);
  for(const rule of rules){
    const row=el('div',undefined,'rule-row'),info=el('div',undefined,'rule-info');
    info.append(el('strong',rule.host),el('code',rule.selector),el('small',`${rule.source} · ${ruleStatusText(rule)}`,undefined));
    const buttons=el('div',undefined,'rule-actions');
    if(rule.status!=='deleted'){
      const edit=el('button','Edit','small-btn');
      edit.addEventListener('click',()=>{
        const input=el('input');input.value=rule.selector;input.spellcheck=false;
        const save=el('button','Save','small-btn'),cancel=el('button','Cancel','small-btn');
        save.addEventListener('click',async()=>{
          const selector=input.value.trim();
          const problem=C.selectorProblem(selector);
          if(problem){notice('rules-status','That selector is not allowed: '+problem.replace(/_/g,' '),true);return;}
          await commit({selector},rule.id);
        });
        cancel.addEventListener('click',fillRuleManager);
        info.replaceChildren(el('strong',rule.host),input,save,cancel);
      });
      buttons.append(edit);
    }
    if(rule.status==='active'){const b=el('button','Disable','small-btn');b.addEventListener('click',()=>commit({status:'disabled'},rule.id));buttons.append(b);}
    if(rule.status==='disabled'||rule.status==='quarantined'){const b=el('button','Enable','small-btn');b.addEventListener('click',()=>commit({status:'active'},rule.id));buttons.append(b);}
    if(rule.status==='deleted'){
      const b=el('button','Undo deletion','small-btn');
      b.addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_RULE_UNDO',{id:rule.id,expect:fresh.settings.revisions.cosmetic});await load();notice('rules-status','Rule restored as quarantined; it must pass current safety checks.');},'rules-status'));
      buttons.append(b);
    }else{
      const b=el('button','Delete','small-btn danger');
      b.addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_RULE_DELETE',{id:rule.id,expect:fresh.settings.revisions.cosmetic});lastDeletedRule=rule.id;await load();notice('rules-status','Rule deleted. Its live effect was removed; use Undo deletion to restore it.');},'rules-status'));
      buttons.append(b);
    }
    row.append(info,buttons);list.append(row);
  }
  if(lastDeletedRule&&rules.some(r=>r.id===lastDeletedRule&&r.status==='deleted'))list.prepend(el('p',`Last deletion: ${lastDeletedRule} (use Undo deletion in its row).`,'fine'));
}
function fillRecovery(){
  const list=$('recovery-list');list.replaceChildren();
  for(const st of state.siteStates||[]){
    const def=C.SITE_DEFS[st.site],row=el('div',undefined,'recovery-row');
    const info=el('div');info.append(el('strong',def.label),el('small',st.recoveryPaused?'Filtering paused for this site':'Active'+(st.reason!=='ready'?' · '+(REASON_LABEL[st.reason]||st.reason):'')));
    const buttons=el('div',undefined,'rule-actions');
    if(!st.recoveryPaused){
      const restore=el('button','Restore this site','small-btn');
      restore.addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');const r=await rpc('FG_RECOVER_SITE',{site:st.site,expect:fresh.settings.revisions.recovery});await load();notice('recovery-status',r.acknowledged?`Pause saved and ${r.tabs} open tab(s) acknowledged cleanup.`:'Pause saved first. No open tab acknowledged cleanup; reload the tab with filtering paused if it still shows hidden posts.');},'recovery-status'));
      buttons.append(restore);
    }else{
      const resume=el('button','Resume this site','small-btn');
      resume.addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');const r=await rpc('FG_RESUME_SITE',{site:st.site,expect:fresh.settings.revisions.recovery});await load();notice('recovery-status',`Filtering resumed. ${r.quarantined} rule(s) for this site still need review.`);},'recovery-status'));
      buttons.append(resume);
    }
    row.append(info,buttons);list.append(row);
  }
}
function fillUpgradeBanner(){
  chrome.storage.local.get('upgrade').then(result=>{
    const banner=$('upgrade-banner');if(!banner)return;
    banner.classList.toggle('hidden',!result?.upgrade);
  }).catch(()=>{});
}
function fillUpdate(info){
  const badge=$('update-badge'),box=$('update-info');
  const running=info&&typeof info.running==='string'?info.running:'—';
  const disk=info&&typeof info.onDisk==='string'?info.onDisk:null;
  const available=info?.updateAvailable===true;
  badge.textContent=available?'Update available':(disk?'Up to date':'Unknown');
  badge.className='badge '+(available?'warn':(disk?'live':''));
  const parts=[`Running build: ${running}`];
  parts.push(disk?`Files on disk: ${disk}${info.buildId?` (build ${info.buildId})`:''}`:'Files on disk: no readable build.json for this page context.');
  if(available)parts.push('Replace the files in this folder, then press Reload on chrome://extensions. Your vault and settings stay.');
  box.textContent=parts.join(' · ');
}
async function loadUpdate(){const info=await rpc('FG_UPDATE_INFO');fillUpdate(info);return info;}
async function load(full=true){
  state=await rpc('FG_STATUS');fillMetrics();
  if(!full)return;
  const s=state.settings;fillFeeds();fillCategories();fillAllowlist();fillMuted();fillLog();fillRuleManager();fillRecovery();fillUsage(state);fillTopics(state);
  $('application-mode').value=s.mode;$('profile-mode').value=s.profileMode;$('protect-useful').checked=s.protectUseful;
  $('labelled-ads').checked=s.labelledAds;$('consent').checked=s.consent;$('hud-mode').value=s.hudMode||'compact';
  $('grouping').checked=s.grouping===true;$('thrift').checked=s.thrift===true;$('thrift-delay').value=String(s.thriftDelayMs||800);
  $('pricing-input').value=s.pricing&&s.pricing.inputPerMTok!==null?String(s.pricing.inputPerMTok):'';
  $('pricing-output').value=s.pricing&&s.pricing.outputPerMTok!==null?String(s.pricing.outputPerMTok):'';
  $('pricing-currency').value=(s.pricing&&s.pricing.currency)||'';
  $('feeds-details').open=s.feedsOpen===true;
  $('custom-instruction').value=s.customInstruction;updateCustomStatus();$('daily-limit').value=String(s.dailyLimit);$('concurrency').value=String(s.concurrency);$('cache-minutes').value=String(s.cacheMinutes);$('model-id').value=s.model;
}
$('feeds-details').addEventListener('toggle',()=>action(()=>patchSettings({feedsOpen:$('feeds-details').open},'ui')));
$('enable-all').addEventListener('click',()=>action(async()=>{
  const missing=[];for(const [id] of Object.entries(C.SITE_DEFS)){const st=state.siteStates?.find(x=>x.site===id);if(!st?.permitted)missing.push(...C.originsForSite(id));}
  if(missing.length){const granted=await chrome.permissions.request({origins:missing});if(!granted)toast('Chrome did not grant the requested origins. Nothing changed.');}
  const fresh=await rpc('FG_STATUS');
  const allowed=fresh.siteStates.filter(x=>x.permitted).map(x=>x.site);
  await rpc('FG_PATCH_SETTINGS',{patch:{sites:allowed},domain:'settings',expect:fresh.settings.revisions.settings});
  await load();
  toast(`Selected ${allowed.length} of ${Object.keys(C.SITE_DEFS).length} supported feeds with Chrome access. Cloud consent and your key gate provider calls separately.`);
}));
$('disable-all').addEventListener('click',()=>action(async()=>{
  const fresh=await rpc('FG_STATUS');
  await rpc('FG_PATCH_SETTINGS',{patch:{sites:[]},domain:'settings',expect:fresh.settings.revisions.settings});
  for(const id of Object.keys(C.SITE_DEFS))await chrome.permissions.remove({origins:C.originsForSite(id)});
  await load();toast('All feeds disabled. Open tabs will clean up their visible effects.');
}));
$('upgrade-all').addEventListener('click',()=>action(async()=>{
  $('enable-all').click();await chrome.storage.local.remove('upgrade');fillUpgradeBanner();
}));
$('upgrade-dismiss').addEventListener('click',()=>action(async()=>{await chrome.storage.local.remove('upgrade');fillUpgradeBanner();}));
$('global-toggle').addEventListener('click',()=>action(async()=>{const current=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{enabled:!current.settings.enabled},domain:'settings',expect:current.settings.revisions.settings});await load();}));
$('open-demo').addEventListener('click',()=>action(()=>rpc('FG_OPEN_DEMO')));
$('custom-instruction').addEventListener('input',updateCustomStatus);
$('policy-form').addEventListener('submit',ev=>{ev.preventDefault();action(async()=>{
  const categories={};for(const n of document.querySelectorAll('[data-category-mode]')){const id=n.dataset.categoryMode;categories[id]={mode:n.value,threshold:Number(document.querySelector(`[data-category-threshold="${id}"]`).value)/100};}
  const lr=await rpc('FG_STATUS');
  await rpc('FG_PATCH_SETTINGS',{patch:{preset:'custom',profileMode:$('profile-mode').value,protectUseful:$('protect-useful').checked,mode:$('application-mode').value,labelledAds:$('labelled-ads').checked,customInstruction:$('custom-instruction').value,dailyLimit:Number($('daily-limit').value),concurrency:Number($('concurrency').value),cacheMinutes:Number($('cache-minutes').value),grouping:$('grouping').checked,thrift:$('thrift').checked,thriftDelayMs:Number($('thrift-delay').value),categories},domain:'settings',expect:lr.settings.revisions.settings});
  await load();notice('policy-status','Policy saved. Open feeds have been re-evaluated.');
},'policy-status');});
$('hud-mode').addEventListener('change',()=>action(async()=>{
  const fresh=await rpc('FG_STATUS');
  await rpc('FG_PATCH_SETTINGS',{patch:{hudMode:$('hud-mode').value},domain:'ui',expect:fresh.settings.revisions.ui});
  await load(false);toast($('hud-mode').value==='hidden'?'Status panel hidden. Filtering continues in open tabs.':'Status panel mode updated in open tabs.');
}));
$('remember-key').addEventListener('change',()=>{$('vault-create-field').classList.toggle('hidden',!$('remember-key').checked);$('vault-create-pass').required=$('remember-key').checked;});
$('key-form').addEventListener('submit',async ev=>{
  ev.preventDefault();const button=ev.submitter;button.disabled=true;
  try{await action(async()=>{await rpc('FG_SET_KEY',{key:$('api-key').value,remember:$('remember-key').checked,passphrase:$('vault-create-pass').value});await load();notice('key-status','Key unlocked. Nothing has been sent by saving it; enabled feeds may now request judgments if consent is on.');},'key-status');}
  finally{$('api-key').value='';$('vault-create-pass').value='';button.disabled=false;}
});
$('unlock-form').addEventListener('submit',async ev=>{ev.preventDefault();ev.submitter.disabled=true;try{await action(async()=>{await rpc('FG_UNLOCK',{passphrase:$('unlock-pass').value});await load();notice('key-status','Vault unlocked for this browser session.');},'key-status');}finally{$('unlock-pass').value='';ev.submitter.disabled=false;}});
$('lock-key').addEventListener('click',()=>action(async()=>{await rpc('FG_LOCK');await load();notice('key-status','Key locked. In-flight inference cancelled. Local rules can still run.');},'key-status'));
$('forget-key').addEventListener('click',()=>action(async()=>{await rpc('FG_FORGET_KEY');await load();notice('key-status','Key and saved vault removed.');},'key-status'));
$('consent').addEventListener('change',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_PATCH_SETTINGS',{patch:{consent:$('consent').checked},domain:'settings',expect:fresh.settings.revisions.settings});await load(false);toast($('consent').checked?'TypeSafe inference consent enabled.':'Consent withdrawn. Pending requests cancelled.');}));
$('save-model').addEventListener('click',()=>action(async()=>{
  if(!/^jev-[a-zA-Z0-9._-]{1,60}$/.test($('model-id').value)) {notice('test-status','Use a valid Jev model ID, for example jev-latest.',true);return;}
  const fresh=await rpc('FG_STATUS');
  await rpc('FG_PATCH_SETTINGS',{patch:{model:$('model-id').value},domain:'settings',expect:fresh.settings.revisions.settings});await load(false);notice('test-status','Model saved. Use the live connection test to check availability.');
},'test-status'));
$('test-connection').addEventListener('click',async()=>{const b=$('test-connection');b.disabled=true;notice('test-status','Calling TypeSafe with one fictional post...');try{await action(async()=>{const r=await rpc('FG_TEST_CONNECTION');notice('test-status',`Connected: ${r.model}\n${r.latencyMs} ms · ${r.usage.input_tokens} input tokens · ${r.usage.output_tokens} output tokens\nPolicy on this fictional project: ${r.decision?.action||'unknown'} (${r.decision?.reason||'no policy result'}).\nValid transport is not proof of classification accuracy.`);await load(false);},'test-status');}finally{b.disabled=false;}});
$('rules-disable-all').addEventListener('click',()=>action(async()=>{const fresh=await rpc('FG_STATUS');await rpc('FG_RULES_DISABLE_ALL',{expect:fresh.settings.revisions.cosmetic});await load();notice('rules-status','All active cosmetic rules disabled. Rules and other settings are kept.');},'rules-status'));
$('rules-delete-all').addEventListener('click',()=>action(async()=>{
  const confirmed=confirm('Delete all cosmetic rules? Deleted rules can still be restored from a recent export, but not from this list.');
  if(!confirmed)return;
  const fresh=await rpc('FG_STATUS');await rpc('FG_RULES_DELETE_ALL',{expect:fresh.settings.revisions.cosmetic});await load();notice('rules-status','All cosmetic rules deleted.');
},'rules-status'));
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
  await rpc('FG_IMPORT_SETTINGS',{data});$('import-file').value='';await load();toast('Settings imported. Cosmetic rules without a verified target are quarantined; site access and consent must be enabled again.');
}));
function saveDownload(filename,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const anchor=el('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('export-diagnostics').addEventListener('click',()=>action(async()=>{
  const data=await rpc('FG_DIAGNOSTICS');
  saveDownload('feedgate-3.3.0-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',data);
  toast('Diagnostic file prepared. It does not contain keys, post text, authors, full browsing URLs or raw cosmetic selectors.');
}));
$('clear-cache').addEventListener('click',()=>action(async()=>{await rpc('FG_CLEAR_CACHE');await load();toast('Cached scores cleared. Enabled feeds may make new API requests.');}));
$('reset-feedback').addEventListener('click',()=>action(async()=>{await rpc('FG_RESET_FEEDBACK');await load();toast('Saved per-post choices cleared.');}));
$('update-check').addEventListener('click',()=>action(async()=>{const info=await loadUpdate();notice('update-status',info.updateAvailable?'Update available on disk. Replace files in the same folder, then press Reload on chrome://extensions.':'Files on disk match the running build.',false);},'update-status'));
$('open-extensions').addEventListener('click',()=>action(()=>chrome.tabs.create({url:'chrome://extensions/'})));
$('export-vault').addEventListener('click',()=>action(async()=>{const data=await rpc('FG_EXPORT_VAULT');saveDownload('feedgate-key-backup.json',data);notice('vault-status','Key backup prepared. It is sealed with your vault passphrase; keep it private.');},'vault-status'));
$('import-vault').addEventListener('click',()=>$('import-vault-file').click());
$('import-vault-file').addEventListener('change',()=>action(async()=>{
  const file=$('import-vault-file').files?.[0];if(!file)return;if(file.size>20000)throw new Error('INVALID_RECORD');
  let data;try{data=JSON.parse(await file.text());}catch{throw new Error('INVALID_RECORD');}
  if(data?.format!=='feedgate-key-backup'||data.version!==1)throw new Error('INVALID_RECORD');
  await rpc('FG_IMPORT_VAULT',{vault:data.vault});$('import-vault-file').value='';await load();notice('vault-status','Key backup imported. Unlock it with its passphrase on the API & privacy page.');
},'vault-status'));
$('save-pricing').addEventListener('click',()=>action(async()=>{
  const input=$('pricing-input').value.trim(),output=$('pricing-output').value.trim();
  const fresh=await rpc('FG_STATUS');
  await rpc('FG_PATCH_SETTINGS',{patch:{pricing:{inputPerMTok:input===''?null:Number(input),outputPerMTok:output===''?null:Number(output),currency:$('pricing-currency').value.trim()}},domain:'settings',expect:fresh.settings.revisions.settings});
  await load();toast('Rates saved. Cost estimates use your own numbers and are not a provider bill.');
}));
for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>action(async()=>{
  const name=button.dataset.preset;
  const patch=name==='custom'?{preset:'custom',mode:'filter',protectUseful:true}:C.presetPatch(name);
  const fresh=await rpc('FG_STATUS');
  await rpc('FG_PATCH_SETTINGS',{patch,domain:'settings',expect:fresh.settings.revisions.settings});await load();
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
  const choice=$('setup-site').value,key=$('setup-key').value.trim();
  try {
    if(!$('setup-consent').checked)throw new Error('CONSENT_REQUIRED');
    if(!key&&!state?.keyReady)throw new Error('INVALID_KEY');
    if(key&&!C.validKey(key))throw new Error('INVALID_KEY');
    const wanted=choice==='all'?Object.keys(C.SITE_DEFS):[choice];
    const missing=[];for(const id of wanted)missing.push(...C.originsForSite(id));
    // One logical request for the supported origins; Chrome shows its own prompts.
    const granted=missing.length?await chrome.permissions.request({origins:missing}):true;
    if(!granted){notice('setup-status','Chrome did not grant site access. Nothing was enabled.',true);return;}
    notice('setup-status','Saving your key and checking the real TypeSafe endpoint...');
    if(key)await rpc('FG_SET_KEY',{key,remember:$('setup-remember').checked,passphrase:$('setup-passphrase').value});
    await rpc('FG_PATCH_SETTINGS',{patch:{consent:true,enabled:true},domain:'settings',expect:state.settings.revisions.settings});
    const test=await rpc('FG_TEST_CONNECTION');
    const current=await rpc('FG_STATUS');
    const permitted=current.siteStates.filter(x=>x.permitted&&wanted.includes(x.site)).map(x=>x.site);
    const patch={sites:permitted};
    if(!current.settings.sites.length)Object.assign(patch,C.presetPatch('balanced'));
    await rpc('FG_PATCH_SETTINGS',{patch,domain:'settings',expect:current.settings.revisions.settings});
    await load();
    toast(`Connected to ${test.model}. ${test.usage.input_tokens} input tokens in the connection test. ${permitted.length} of ${Object.keys(C.SITE_DEFS).length} feeds selected.`);
    if(permitted.length){const origin=C.originsForSite(permitted[0]);const tabs=await chrome.tabs.query({url:origin});if(!tabs.length&&permitted[0]==='x')await chrome.tabs.create({url:'https://x.com/home'});}
  } catch(error){notice('setup-status',C.userError(error).message,true);}
  finally{$('setup-key').value='';$('setup-passphrase').value='';button.disabled=false;}
});
await action(()=>load());
fillUpgradeBanner();
action(()=>loadUpdate());
setInterval(()=>{if(!document.hidden)action(async()=>{await load(false);fillUsage(state);});},4000);
