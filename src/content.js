/* SPDX-License-Identifier: GPL-3.0-or-later
 * Original implementation inspired by uBlock Origin's separation of DOM watching,
 * cosmetic filtering and per-site switches. No uBlock code or filter lists are bundled.
 *
 * v3 controller: one document generation owns exactly one observer pair, one
 * cosmetic lifecycle and one HUD host. Status visibility is independent from
 * filtering: hiding the panel never pauses the engine.
 */
(() => {
  'use strict';
  if (globalThis.__FEEDGATE_CONTENT__) return;
  globalThis.__FEEDGATE_CONTENT__=true;
  const C=globalThis.FeedGateCore,A=globalThis.FeedGateAdapters;
  const demo=location.protocol==='chrome-extension:' && location.pathname==='/demo.html';
  const site=demo?'demo':C.siteForURL(location.href);
  if (!site) return;
  let settings=C.clone(C.DEFAULTS),enabled=false,epoch=0,lastURL=location.href;
  let observer=null,intersection=null,scanTimer=null,configSerial=0;
  let pickerCleanup=null,reportTimer=null,hud=null,hudRoot=null,hudText=null,keyReady=false;
  let detectedTotal=0,sweepTicks=0,staleVersion=false,recoveryPaused=false,revealAll=false;
  let pendingCosmeticValidate=new Set(),quarantinedRules=new Set();
  let scansCoalesced=0,ignoredSelfMutations=0,noopApplications=0,selfWrites=0;
  let breakerUntil=0,breakerTrips=0,selfWriteWindow=[];
  let toast=null,toastTimer=null,lastCommittedRule=null;
  const cosmetic={applied:0,restored:0,rejected:0};
  const states=new Map(),roots=new Set();
  let lastError=null;
let lastScrollAt=Date.now(),thriftTimer=null;
const groupsExpanded=new Set();
  const INTERNAL_MARKER='feedgate-internal-element';
  const own=n=>n instanceof Element && (n.matches('feedgate-card,feedgate-status,feedgate-toast,feedgate-group,[data-fg-ui]')||!!n.closest('feedgate-card,feedgate-status,feedgate-toast,feedgate-group,[data-fg-ui]'));
  async function send(type,data={}) {
    const response=await chrome.runtime.sendMessage({type,...data});
    if (!response?.ok) throw new Error(response?.error?.code||'INTERNAL_ERROR');
    return response.data;
  }
  function make(tag,text,cls) {
    const n=document.createElement(tag);
    if (text!==undefined) n.textContent=text;
    if (cls) n.className=cls;
    return n;
  }
  function selfWrite() {
    const now=Date.now();
    selfWrites++;
    selfWriteWindow.push(now);
    if(selfWriteWindow.length>400)selfWriteWindow=selfWriteWindow.filter(t=>now-t<4000);
    if(breakerUntil&&now>breakerUntil)breakerUntil=0;
    if(!breakerUntil&&selfWriteWindow.filter(t=>now-t<2000).length>90){
      // Bounded circuit breaker: our own writes are not converging. Stop
      // cosmetic application for this site, keep the engine and recovery reachable.
      breakerUntil=now+30000;breakerTrips++;
      cosmeticPause=now+30000;
      send('FG_COSMETIC_EVENT',{kind:'breaker',ruleRef:null,reason:'self_write_rate',candidateAction:null,appliedAction:null}).catch(()=>{});
      for(const state of states.values())reapply(state);
      report();
    }
  }
  let cosmeticPause=0;
  function restoreProp(el,key,original) {
    if(original&&original.value)el.style.setProperty(key,original.value,original.priority);
    else el.style.removeProperty(key);
  }
  function ensureOriginal(state) {
    if(state.original)return;
    const el=state.el;
    state.original={display:{value:el.style.getPropertyValue('display'),priority:el.style.getPropertyPriority('display')},opacity:{value:el.style.getPropertyValue('opacity'),priority:el.style.getPropertyPriority('opacity')},aria:el.getAttribute('aria-hidden')};
    state.writes={display:false,opacity:false,aria:false};
  }
  function computeAction(state) {
    if(state.revealed||revealAll)return 'allow';
    if(!enabled)return 'allow';
    let action='allow';
    const decision=state.decision;
    if(decision&&decision.source!=='cosmetic'){
      if(decision.action==='collapse')action='collapse';
      else if(decision.action==='dim')action='dim';
    }
    if(state.cosmetic?.size&&Date.now()>=cosmeticPause)action='collapse';
    if(action==='allow'&&state.groupHidden&&settings.grouping)action='collapse';
    return action;
  }
  function applyAction(state,action) {
    const el=state.el;
    if(!el.isConnected)return;
    const previous=state.appliedAction;
    ensureOriginal(state);
    if(action==='allow'){
      if(state.writes.display){restoreProp(el,'display',state.original.display);state.writes.display=false;selfWrite();}
      if(state.writes.opacity){restoreProp(el,'opacity',state.original.opacity);state.writes.opacity=false;selfWrite();}
      if(state.writes.aria){if(state.original.aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',state.original.aria);state.writes.aria=false;selfWrite();}
      el.removeAttribute('data-fg-action');
    } else {
      if(action==='collapse'){
        if(state.writes.opacity){restoreProp(el,'opacity',state.original.opacity);state.writes.opacity=false;selfWrite();}
        if(!state.writes.display){el.style.setProperty('display','none','important');state.writes.display=true;selfWrite();}
        if(!state.writes.aria){el.setAttribute('aria-hidden','true');state.writes.aria=true;selfWrite();}
      } else {
        if(state.writes.display){restoreProp(el,'display',state.original.display);state.writes.display=false;selfWrite();}
        if(!state.writes.opacity){el.style.setProperty('opacity','0.28','important');state.writes.opacity=true;selfWrite();}
      }
      el.setAttribute('data-fg-action',action);
    }
    if(state.cosmetic?.size&&action!=='allow'&&previous!=='collapse')cosmetic.applied++;
    if(state.cosmetic?.size&&action==='allow'&&previous&&previous!=='allow')cosmetic.restored++;
    state.appliedAction=action;
  }
  function reapply(state) {
    const action=computeAction(state);
    if(action===state.appliedAction){noopApplications++;return;}
    applyAction(state,action);
    updateCard(state,action);
  }
  function restore(state) {
    state.revealed=true;
    applyAction(state,'allow');
    removeCard(state);
    state.appliedAction='allow';
  }
  function pageState() {
    if(!demo&&C.isPrivateRoute(location.href))return 'private';
    if(staleVersion)return 'stale';
    if(recoveryPaused)return 'recovery';
    if(!settings.enabled)return 'paused';
    if(!demo&&!settings.sites.includes(site))return 'site-off';
    if(!settings.consent)return 'no-consent';
    if(!keyReady)return 'locked';
    return lastError?'error':'ready';
  }
  function stats() {
    let collapsed=0,dimmed=0,pending=0,observed=0,completed=0,kept=0,protectedCount=0,errors=0,cosmeticHidden=0;
    for(const s of states.values())if(s.el.isConnected){
      if(s.el.getAttribute('data-fg-action')==='collapse')collapsed++;
      if(s.el.getAttribute('data-fg-action')==='dim')dimmed++;
      if(s.cosmetic?.size)cosmeticHidden++;
      if(s.pending)pending++;
      if(s.record?.text||s.record?.sponsored||s.record?.mediaAlt)observed++;
      if(s.completed)completed++;
      if(s.decision?.action==='allow')kept++;
      if(s.decision?.protected)protectedCount++;
      if(s.error)errors++;
    }
    return {collapsed,dimmed,pending,observed,completed,kept,protected:protectedCount,errors,detectedTotal,enabled,site,lastError,
      state:pageState(),hudMode:settings.hudMode,hudPresent:!!hud,controllerCount:1,
      cosmeticApplied:cosmetic.applied,cosmeticRestored:cosmetic.restored,cosmeticRejected:cosmetic.rejected,
      breakerActivations:breakerTrips,scansCoalesced,ignoredSelfMutations,noopApplications,
      cosmeticHidden,grouped:[...states.values()].filter(s=>s.groupHidden).length,deferred:[...states.values()].filter(s=>s.deferred).length,recoveryPaused,heartbeatAt:Date.now()};
  }
  function hudLabel(s) {
    const labels={ready:settings.mode==='observe'?'Observe only':'Running',paused:'Paused',locked:'Key locked: open settings',
      'no-consent':'Local ads only: cloud consent off',error:'Check diagnostics',private:'Private route','site-off':'Site off',
      stale:'Extension updated: reload this page',recovery:'Filtering paused for this site'};
    return labels[s.state]||'Running';
  }
  function persistHudMode(mode) {
    settings.hudMode=mode;
    send('FG_PATCH_SETTINGS',{patch:{hudMode:mode},domain:'ui',expect:settings.revisions?.ui}).catch(()=>{});
    updateHUD(stats());
  }
  function updateHUD(s) {
    if(demo||s.state==='private'||s.state==='site-off'){hud?.remove();hud=null;hudRoot=null;return;}
    const wantHidden=settings.hudMode==='hidden'&&s.state!=='recovery';
    if(wantHidden){if(hud){hud.remove();hud=null;hudRoot=null;}return;}
    if(!hud||!hud.isConnected) {
      hud=document.createElement('feedgate-status');hud.setAttribute('data-fg-ui','');
      hud.style.cssText='position:fixed!important;bottom:14px!important;left:14px!important;z-index:2147483646!important;display:block!important';
      const shadow=hud.attachShadow({mode:'open'}),style=make('style');
      style.textContent=':host{all:initial;color-scheme:light dark}.pill{border:1px solid #344d40;border-radius:999px;background:#17221c;color:#def0dc;box-shadow:0 3px 18px #0003;padding:6px 11px;cursor:pointer;font:12px/1.4 system-ui}.pill:focus-visible{outline:2px solid #c6fa8c;outline-offset:3px}.panel{border:1px solid #344d40;border-radius:10px;background:#17221c;color:#def0dc;box-shadow:0 4px 22px #0004;padding:10px 12px;font:12px/1.5 system-ui;max-width:min(400px,88vw)}.panel header{display:flex;align-items:center;gap:6px}.panel strong{color:#ccfa92;flex:1}.panel button{font:inherit;color:#def0dc;background:#233227;border:1px solid #3d5745;border-radius:6px;padding:3px 8px;cursor:pointer}.panel button:hover{background:#2f4536}.panel button:focus-visible{outline:2px solid #c6fa8c;outline-offset:2px}.state{margin-top:7px;color:#acbcad}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.hint{margin-top:7px;color:#8fa08e;font-size:11px}';
      hudRoot=make('div');shadow.append(style,hudRoot);document.documentElement.append(hud);
    }
    const label=hudLabel(s);
    hudText=`${label} · ${s.observed} detected · ${s.collapsed+s.dimmed+(s.cosmeticHidden||0)} filtered · ${s.pending} pending`;
    if(settings.hudMode==='compact'&&s.state!=='recovery') {
      hudRoot.textContent='';
      const pill=make('button',`● FeedGate · ${label} · ${s.collapsed+s.dimmed+(s.cosmeticHidden||0)} filtered`,'pill');
      pill.title='FeedGate 3.3.0 status. Open the panel.';
      pill.addEventListener('click',ev=>{if(ev.isTrusted)persistHudMode('expanded');});
      hudRoot.append(pill);
      return;
    }
    hudRoot.textContent='';
    const panel=make('div',undefined,'panel'),header=make('header');
    const title=make('strong','FeedGate 3.3.0');
    const minimize=make('button','–');minimize.title='Minimize to a small status pill';
    const close=make('button','×');close.title='Hide status. Filtering continues.';
    minimize.addEventListener('click',ev=>{if(ev.isTrusted)persistHudMode('compact');});
    close.addEventListener('click',ev=>{if(ev.isTrusted)persistHudMode('hidden');});
    header.append(title,minimize,close);
    const line=make('div',hudText,'state');
    panel.append(header,line);
    const actions=make('div',undefined,'actions');
    if(s.state==='recovery'){
      const resume=make('button','Resume this site');
      resume.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;
        try{await send('FG_RESUME_SITE',{site,expect:settings.revisions?.recovery});}
        catch(error){showToast(C.userError(error).message);}
      });
      actions.append(resume);
    } else {
      const showAll=make('button','Show all');
      showAll.addEventListener('click',ev=>{if(!ev.isTrusted)return;for(const st of states.values()){st.revealed=true;applyAction(st,'allow');}removeCardForAll();report();});
      const pause=make('button',settings.enabled?'Pause filtering':'Resume filtering');
      pause.addEventListener('click',ev=>{
        if(!ev.isTrusted)return;
        send('FG_PATCH_SETTINGS',{patch:{enabled:!settings.enabled},domain:'settings',expect:settings.revisions?.settings}).catch(error=>showToast(C.userError(error).message));
      });
      const pick=make('button','Pick element');
      pick.addEventListener('click',ev=>{if(ev.isTrusted)startPicker();});
      const topicPick=make('button','Mute topic…');topicPick.title='Click a post on the page to mute its topic for a chosen time.';
      topicPick.addEventListener('click',ev=>{if(ev.isTrusted)startTopicPicker();});
      const mutePick=make('button','Mute author…');mutePick.title='Click a post on the page to hide everything from its author.';
      mutePick.addEventListener('click',ev=>{if(ev.isTrusted)startAuthorPicker('mute');});
      const allowPick=make('button','Allow author…');allowPick.title='Click a post on the page to keep everything from its author visible.';
      allowPick.addEventListener('click',ev=>{if(ev.isTrusted)startAuthorPicker('allow');});
      const open=make('button','Settings');
      open.addEventListener('click',ev=>{if(ev.isTrusted)send('FG_OPEN_SETTINGS_FROM_PAGE').catch(()=>{});});
      actions.append(showAll,pause,pick,topicPick,mutePick,allowPick,open);
    }
    panel.append(actions);
    panel.append(make('div','Hiding this panel does not pause filtering.','hint'));
    hudRoot.append(panel);
  }
  function removeCardForAll(){for(const state of states.values())removeCard(state);}
  function report() {
    if(reportTimer)return;
    reportTimer=setTimeout(()=>{
      reportTimer=null;const s=stats();updateHUD(s);
      if(!demo)send('FG_PAGE_STATS',{stats:s}).catch(()=>{});
    },200);
  }
  function removeCard(state) {
    state.placeholder?.remove();state.placeholder=null;state.cardSignature=null;
  }
  function cardNote(decision,cosmeticOwned,groupHidden) {
    if(cosmeticOwned)return 'User cosmetic rule: Hidden by your cosmetic filter';
    if(groupHidden)return 'Similar content: grouped with an earlier post';
    if(settings.mode==='observe'&&decision.wouldAction)return `Observe Only: Would ${decision.wouldAction==='collapse'?'hide':'dim'}; content left unchanged`;
    if(decision.source==='cosmetic')return 'User cosmetic rule: Hidden by your cosmetic filter';
    if(decision.source==='local')return 'Verified platform placement: Platform-labelled ad';
    if(decision.source==='author')return 'Your mute list: Hidden by your request';
    if(decision.source==='topic')return 'Your muted topic: '+decision.reason;
    const label=C.CATEGORIES?.[decision.category]?.label||(decision.rule==='manipulative_bait'?'Manipulative engagement bait':'Filtered by policy');
    return 'Semantic filter: '+label;
  }
  function updateCard(state,action) {
    const decision=state.decision||{};
    const observeNote=settings.mode==='observe'&&decision.wouldAction;
    const cosmeticOwned=action!=='allow'&&(state.cosmetic?.size||0)>0;
    const show=action!=='allow'||observeNote;
    if(!show||!state.el.isConnected){removeCard(state);return;}
    const signature=`${action}|${decision.source}|${decision.rule}|${decision.category}|${observeNote?'o':''}|${state.cosmetic?.size||0}|${state.revealed?'r':''}|${cosmeticOwned?'c':''}${state.groupHidden?'g':''}`;
    if(state.cardSignature===signature&&state.placeholder?.isConnected)return;
    removeCard(state);
    const el=state.el;
    const host=document.createElement('feedgate-card');
    host.setAttribute('data-fg-ui','');host.style.setProperty('display','block','important');
    const shadow=host.attachShadow({mode:'open'});
    const style=make('style');
    style.textContent=`:host{all:initial;display:block;color-scheme:light dark}*{box-sizing:border-box}.card{margin:7px 0;padding:11px 14px;border:1px solid #b8c5b7;border-left:3px solid #6f8e60;border-radius:7px;background:#f1f3ed;color:#20291f;font:12px/1.5 system-ui,sans-serif}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mark{font-weight:800;letter-spacing:.04em}.note{flex:1;min-width:120px;color:#50604c}button{font:inherit;font-weight:650;color:#223020;background:#fff;border:1px solid #c6cec1;border-radius:5px;padding:4px 9px;cursor:pointer}button:hover{background:#e2ebd9}button:focus-visible{outline:2px solid #40712b;outline-offset:2px}.details{margin-top:9px;border-top:1px solid #d2dbcb;padding-top:8px}.details[hidden]{display:none}.score{display:flex;gap:8px;justify-content:space-between}.small{font-size:11px;color:#596b52;margin-top:6px}@media(prefers-color-scheme:dark){.card{background:#18211b;color:#e5eddc;border-color:#425040}.note,.small{color:#abbda2}button{background:#263327;color:#e4efd9;border-color:#455a43}button:hover{background:#354833}}`;
    const card=make('div',undefined,'card'),row=make('div',undefined,'row');
    row.append(make('span','FeedGate','mark'),make('span',cardNote(decision,cosmeticOwned,state.groupHidden),'note'));
    const showBtn=make('button','Show'),why=make('button','Why?');
    const details=make('div',undefined,'details');details.hidden=true;
    details.append(make('div',decision.reason||'Filtered.'));
    if(cosmeticOwned){
      details.append(make('div','A rule you created with the element picker hides this element. Manage it in FeedGate settings under My cosmetic filters.','small'));
    }
    if(decision.adEvidence?.status==='verified')details.append(make('div',`Verified platform ad label (${decision.adEvidence.markerKind||'unknown'}).`,'small'));
    if(decision.protectionEligible===true&&decision.protected!==true)details.append(make('div','Useful-content signals were present; protection is switched off in settings.','small'));
    if(decision.conflict)details.append(make('div','Useful-content signals were also present, so this post is dimmed for review instead of hidden.','small'));
    if(decision.scores) for(const [key,value] of Object.entries(decision.scores)) {
      const title=C.SIGNALS[key];
      if(!title)continue;
      const item=make('div',undefined,'score');item.append(make('span',title),make('strong',`${Math.round(value*100)}%`));details.append(item);
    }
    if(decision.scores)details.append(make('div','Model estimates, not verified facts or bot identity. High information value does not establish truth.','small'));
    if(state.record&&!cosmeticOwned&&decision.source!=='cosmetic') {
      const keep=make('button','Keep this post');
      keep.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;keep.disabled=true;
        try {await send('FG_KEEP_POST',{record:state.record});state.revealed=true;applyAction(state,'allow');removeCard(state);report();}
        catch(error){details.append(make('div',C.userError(error).message));keep.disabled=false;}
      });details.append(keep);
    }
    showBtn.addEventListener('click',ev=>{if(!ev.isTrusted)return;state.revealed=true;applyAction(state,'allow');removeCard(state);report();});
    why.addEventListener('click',ev=>{if(!ev.isTrusted)return;details.hidden=!details.hidden;});
    row.append(showBtn,why);
    if(state.record?.author&&!demo&&!cosmeticOwned&&decision.source!=='cosmetic'&&!state.record.authorNameOnly){
      const identity=state.record.authorId||state.record.author;
      const allow=make('button','Allow author');
      allow.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;allow.disabled=true;
        try{
          const result=await send('FG_ALLOW_AUTHOR',{author:identity});
          showToast('Author allowed on this site. Their posts stay visible here.',{authorUndo:{author:identity,previous:result?.previous,applied:result?.applied}});
        }
        catch(error){details.hidden=false;details.append(make('div',C.userError(error).message));allow.disabled=false;}
      });row.append(allow);
      const mute=make('button','Mute author');
      mute.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;mute.disabled=true;
        try{
          const result=await send('FG_MUTE_AUTHOR',{author:identity});
          showToast('Author muted on this site. This is a local list; manage it in FeedGate settings.',{authorUndo:{author:identity,previous:result?.previous,applied:result?.applied}});
        }
        catch(error){details.hidden=false;details.append(make('div',C.userError(error).message));mute.disabled=false;}
      });row.append(mute);
    }
    card.append(row,details);shadow.append(style,card);
    el.before(host);state.placeholder=host;state.cardSignature=signature;report();
  }
  function nearViewport(el) {
    const r=el.getBoundingClientRect();
    return r.top<innerHeight+1000 && r.bottom>-1000 && r.width>0;
  }
  function process(state) {
    if(!enabled || state.revealed || state.pending || !state.visible || !state.el.isConnected)return;
    if(state.cosmetic?.size){
      const action=computeAction(state);
      applyAction(state,action);
      updateCard(state,action);
      report();
      return;
    }
    if(state.completed)return;
    const r=state.record;
    if(!r)return;
    // Explicit local decisions stay separate from model failures.
    const early=C.decide(r,null,settings);
    render(state,early);
    if(early.source==='allowlist'||early.source==='author'){state.completed=true;report();return;}
    if(!r.text&&!r.mediaAlt&&!r.sponsored){state.completed=true;return;}
    if(settings.thrift&&!thriftEligible(state)){state.deferred=true;armThrift();report();return;}
    state.deferred=false;
    state.pending=true;report();
    const token=++state.token,stamp=epoch,snapshot=state.snapshot;
    send('FG_CLASSIFY',{record:r}).then(response=>{
      if(stamp!==epoch || token!==state.token || !state.el.isConnected || !enabled)return;
      // Re-read before applying; virtualised feeds can recycle a node while HTTP is in flight.
      const current=A.extract(state.el,site);
      if(!current || JSON.stringify(current)!==snapshot){state.pending=false;ensure(state.el);return;}
      state.completed=true;state.pending=false;state.result=response.result;
      state.error=response.error||null;
      if(response.error)lastError=response.error;
      else lastError=null;
      render(state,response.decision);
    }).catch(error=>{
      if(stamp!==epoch||token!==state.token)return;
      state.pending=false;state.completed=true;lastError=C.userError(error);state.error=lastError;
      render(state,C.decide(r,null,settings));
    }).finally(()=>{if(stamp===epoch&&token===state.token){state.pending=false;report();}});
  }
  function render(state,decision) {
    if (!state.el.isConnected) return;
    state.decision=decision;
    const action=computeAction(state);
    applyAction(state,action);
    updateCard(state,action);
    report();
  }
  function ensure(el,cosmeticRules=null) {
    if(!enabled||!el.isConnected||A.privateElement(el)||own(el))return;
    let record=A.extract(el,site);
    if(!record&&!cosmeticRules?.length)return;
    if(!record)record={site,id:'local-rule',author:'',text:'',mediaAlt:'',quotedText:'',sponsored:false,linkDomains:[],context:'feed',kind:'post',adEvidence:null};
    let state=states.get(el);
    const snapshot=JSON.stringify(record);
    if(state&&state.snapshot!==snapshot){
      applyAction(state,'allow');removeCard(state);
      state.token++;state.record=record;state.snapshot=snapshot;state.pending=false;state.completed=false;state.revealed=false;state.result=null;state.error=null;state.appliedAction=null;state.deferred=false;state.groupHidden=false;state.seenAt=Date.now();
    }
    if(!state){
      if(states.size>=1500){
        const old=[...states.values()].find(s=>!s.el.isConnected||!nearViewport(s.el));
        if(old){applyAction(old,'allow');removeCard(old);intersection?.unobserve(old.el);states.delete(old.el);}else return;
      }
      state={el,record,snapshot,token:0,pending:false,completed:false,revealed:false,result:null,visible:nearViewport(el),cosmetic:new Map(),appliedAction:null,decision:null,placeholder:null,original:null,writes:null,deferred:false,groupHidden:false,groupBar:null,seenAt:Date.now()};
      states.set(el,state);detectedTotal++;intersection?.observe(el);
    }
    if(cosmeticRules?.length){
      for(const rule of cosmeticRules)state.cosmetic.set(rule.id,rule);
      state.visible=true;
      state.appliedAction=null;
    }
    if(!state.visible&&nearViewport(el))state.visible=true;
    process(state);
    if(state.cosmetic?.size)validateRuleTargets(state);
  }
  function validateRuleTargets(state) {
    for(const rule of state.cosmetic.values()){
      if(quarantinedRules.has(rule.id)||pendingCosmeticValidate.has(rule.id))continue;
      pendingCosmeticValidate.add(rule.id);
      const count=document.querySelectorAll(rule.selector).length;
      send('FG_RULE_REVALIDATE',{id:rule.id,matchCount:Math.min(count,10000),reason:'ok',expect:settings.revisions?.cosmetic}).catch(()=>{});
    }
  }
  function structuralReject(el) {
    if(!(el instanceof Element))return 'not_hideable';
    if(['HTML','BODY'].includes(el.tagName))return 'document_root';
    if(el.tagName==='MAIN'||el.matches('main,[role="main"],#app,#root'))return 'primary_content_root';
    if(el.closest('nav,header,footer'))return 'primary_navigation';
    if(el.querySelector('nav'))return 'contains_primary_navigation';
    const root=document.querySelector('main,[role="main"]');
    if(root&&el.contains(root))return 'contains_primary_content';
    if(site&&A.SPECS[site]&&el.querySelectorAll(A.SPECS[site].posts).length>2)return 'multiple_items_container';
    if(el.closest('[contenteditable]')||el.matches('input,textarea,select,[contenteditable]')||el.querySelector('textarea,[contenteditable]'))return 'editor_or_input';
    if(el.getAttribute('data-fg-ui')!==null||el.closest('[data-fg-ui]'))return 'feedgate_ui';
    return null;
  }
  function impactReject(matches) {
    const root=document.querySelector('main,[role="main"]');
    for(const el of matches){
      const reason=structuralReject(el);
      if(reason)return reason;
      if(root&&el.contains(root))return 'contains_primary_content';
    }
    if(matches.length>80)return 'match_set_too_large';
    return null;
  }
  function quarantineRule(rule,reason) {
    quarantinedRules.add(rule.id);
    for(const state of states.values()){
      if(state.cosmetic?.delete(rule.id)){reapply(state);}
    }
    cosmetic.rejected++;
    send('FG_RULE_REVALIDATE',{id:rule.id,matchCount:0,reason:reason||'unsafe_at_application',expect:settings.revisions?.cosmetic}).catch(()=>{});
    send('FG_COSMETIC_EVENT',{kind:'rejected',ruleRef:rule.id,reason:reason||'unsafe_at_application',candidateAction:'collapse',appliedAction:'allow'}).catch(()=>{});
  }
  function applyCosmeticRules() {
    if(demo||!settings.cosmeticEnabled||Date.now()<cosmeticPause)return;
    const rules=C.activeCosmeticRules(settings,location.hostname);
    for(const rule of rules){
      if(quarantinedRules.has(rule.id))continue;
      let matches=[];
      try{matches=[...document.querySelectorAll(rule.selector)].slice(0,120);}catch{continue;}
      if(!matches.length)continue; // no target now: keep the rule for later SPA navigation
      const reason=impactReject(matches);
      if(reason){quarantineRule(rule,reason);continue;}
      for(const el of matches)if(el.isConnected)ensure(el,[rule]);
    }
  }
  function validateQuarantinedRules() {
    if(demo||!settings?.cosmeticFilters)return;
    const host=location.hostname;
    for(const rule of settings.cosmeticFilters.rules){
      if(rule.status!=='quarantined'||quarantinedRules.has(rule.id))continue;
      if(!(host===rule.host||host.endsWith('.'+rule.host)))continue;
      if(pendingCosmeticValidate.has(rule.id)||pendingCosmeticValidate.size>=20)continue;
      if(C.selectorProblem(rule.selector))continue;
      let count=0;
      try{count=Math.min(document.querySelectorAll(rule.selector).length,50);}catch{continue;}
      if(count<1)continue; // still no real target: stay unverified
      pendingCosmeticValidate.add(rule.id);
      send('FG_RULE_REVALIDATE',{id:rule.id,matchCount:count,reason:'ok'})
        .then((result)=>{if(result?.status==='active')refresh();})
        .catch(()=>{})
        .finally(()=>pendingCosmeticValidate.delete(rule.id));
    }
  }
  function scan() {
    scanTimer=null;
    if(!enabled)return;
    for(const [el,s] of states){
      if(!el.isConnected){s.token++;applyAction(s,'allow');removeCard(s);intersection?.unobserve(el);states.delete(el);continue;}
      if(s.cosmetic?.size){
        const activeIds=new Set(C.activeCosmeticRules(settings,location.hostname).map(r=>r.id));
        let changed=false;
        for(const [id,rule] of [...s.cosmetic]){
          let stillMatches=true;
          try{stillMatches=el.matches(rule.selector);}catch{stillMatches=false;}
          if(!activeIds.has(id)||!stillMatches){s.cosmetic.delete(id);changed=true;}
        }
        if(changed){if(!s.cosmetic.size&&s.decision?.source!=='cosmetic'&&!s.record?.text&&!s.record?.mediaAlt){intersection?.unobserve(el);states.delete(el);continue;}
          s.appliedAction=null;reapply(s);}
      }
    }
    const pending=[...roots];roots.clear();
    for(const root of pending)for(const el of A.collect(root,site))ensure(el);
    applyCosmeticRules();
    validateQuarantinedRules();
    recomputeGroups();
  }
  function schedule(root) {
    if(root?.nodeType===Node.TEXT_NODE)root=root.parentElement;
    if(root&&root.querySelectorAll&&!own(root))roots.add(root);
    if(scanTimer){scansCoalesced++;return;}
    scanTimer=setTimeout(scan,80);
  }
  function stop() {
    epoch++;
    observer?.disconnect();intersection?.disconnect();observer=null;intersection=null;
    if(scanTimer)clearTimeout(scanTimer);scanTimer=null;roots.clear();
    pickerCleanup?.();
    for(const s of states.values()){s.token++;s.revealed=true;applyAction(s,'allow');removeCard(s);}for(const s of states.values()){if(s.groupBar){s.groupBar.remove();s.groupBar=null;}}groupBars.clear();if(thriftTimer){clearTimeout(thriftTimer);thriftTimer=null;}removeEventListener('scroll',onScroll);removeEventListener('visibilitychange',onVisibility);states.clear();
    report();
  }
  function configSignature(s) {
    return JSON.stringify({enabled:s.enabled,sites:s.sites,mode:s.mode,preset:s.preset,categories:s.categories,cosmeticEnabled:s.cosmeticEnabled,filters:s.cosmeticFilters,recovery:s.recoverySites,consent:s.consent,labelledAds:s.labelledAds,protectUseful:s.protectUseful,profileMode:s.profileMode,customInstruction:s.customInstruction,allowedAuthors:s.allowedAuthors,blockedAuthors:s.blockedAuthors,topics:s.topics,grouping:s.grouping,thrift:s.thrift,thriftDelayMs:s.thriftDelayMs});
  }
  let lastSignature='';
  async function refresh(force=false) {
    const serial=++configSerial;
    let conf;
    try{conf=await send('FG_GET_CONFIG');}catch(error){enabled=false;stop();lastError=C.userError(error);updateHUD(stats());return;}
    if(serial!==configSerial)return;
    settings=C.sanitizeSettings(conf.settings);keyReady=conf.keyReady===true;
    const appVersion=typeof conf.appVersion==='string'?conf.appVersion:'';
    staleVersion=appVersion!==''&&appVersion!==C.VERSION;
    recoveryPaused=conf.recoveryPaused===true;
    const signature=configSignature(settings)+'|'+appVersion;
    if(!force&&signature===lastSignature&&!staleVersion&&!recoveryPaused){
      updateHUD(stats());
      return;
    }
    lastSignature=signature;
    enabled=false;stop();lastError=null;
    enabled=!staleVersion && !recoveryPaused && settings.enabled && (demo||settings.sites.includes(site)) && (demo||!C.isPrivateRoute(location.href));
    report();updateHUD(stats());
    if(!enabled)return;
    intersection=new IntersectionObserver(entries=>{
      for(const entry of entries){const s=states.get(entry.target);if(s){const was=s.visible;s.visible=entry.isIntersecting;if(s.visible){if(!was)s.seenAt=Date.now();if(s.cosmetic?.size)reapply(s);else process(s);}}}
    },{rootMargin:'1000px 0px'});
    observer=new MutationObserver(mutations=>{
      if(!demo&&C.isPrivateRoute(location.href)){enabled=false;stop();return;}
      for(const m of mutations){
        if(own(m.target)){ignoredSelfMutations++;continue;}
        if(m.type==='attributes' && (['style','aria-hidden'].includes(m.attributeName)||m.attributeName.startsWith('data-fg-')||m.attributeName==='outline'))continue;
        if(m.type==='childList' && [...m.addedNodes,...m.removedNodes].length && [...m.addedNodes,...m.removedNodes].every(n=>own(n))){ignoredSelfMutations++;continue;}
        schedule(m.target);
        for(const node of m.addedNodes||[])if(node.nodeType===Node.ELEMENT_NODE&&!own(node))schedule(node);
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true});
    addEventListener('scroll',onScroll,{passive:true});
    addEventListener('visibilitychange',onVisibility);
    if(deferredAny())armThrift();
    schedule(document);
  }
  function selectorFor(el) {
    if(el.id){const value='#'+CSS.escape(el.id);if(document.querySelectorAll(value).length===1)return value;}
    const parts=[];let node=el;
    while(node&&node!==document.body&&parts.length<6){
      let part=node.localName;
      if(!part||part==='html')break;
      const siblings=node.parentElement?[...node.parentElement.children].filter(n=>n.localName===node.localName):[];
      if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(node)+1})`;
      parts.unshift(part);
      const sel=parts.join(' > ');
      if(document.querySelectorAll(sel).length===1)return sel;
      node=node.parentElement;
    }
    return parts.join(' > ');
  }
  function showToast(message,undoAction=null) {
    toast?.remove();
    toast=document.createElement('feedgate-toast');toast.setAttribute('data-fg-ui','');
    toast.style.cssText='position:fixed!important;bottom:18px!important;right:18px!important;z-index:2147483647!important;display:block!important';
    const shadow=toast.attachShadow({mode:'open'});
    const style=make('style');
    style.textContent=':host{all:initial;color-scheme:light dark}.box{display:flex;gap:10px;align-items:center;background:#17221c;color:#def0dc;border:1px solid #3d5745;border-radius:9px;box-shadow:0 4px 22px #0004;padding:9px 12px;font:12px/1.4 system-ui;max-width:min(380px,86vw)}button{font:inherit;color:#def0dc;background:#233227;border:1px solid #3d5745;border-radius:6px;padding:3px 8px;cursor:pointer}button:focus-visible{outline:2px solid #c6fa8c;outline-offset:2px}';
    const box=make('div',undefined,'box');box.append(make('span',message));
    if(undoAction){
      const undo=make('button','Undo');
      undo.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;undo.disabled=true;
        try{
          if(undoAction.authorUndo){
            const result=await send('FG_AUTHOR_UNDO',{author:undoAction.authorUndo.author,previous:undoAction.authorUndo.previous,applied:undoAction.authorUndo.applied});
            showToast(result?.stale?'Undo skipped: a newer decision already changed this author.':'Author list restored to the previous state.');
            refresh(true);
          } else if(undoAction.topicId){
            await send('FG_TOPIC_DELETE',{id:undoAction.topicId});
            showToast('Muted topic removed.');
            refresh(true);
          } else if(undoAction.author){
            await send('FG_FORGET_AUTHOR',{author:undoAction.author});
            showToast('Author removed from your local lists.');
            refresh(true);
          } else {
            await send('FG_RULE_DELETE',{id:undoAction.ruleId,expect:settings.revisions?.cosmetic});
            cosmetic.restored++;
            send('FG_COSMETIC_EVENT',{kind:'undo',ruleRef:undoAction.ruleId,reason:'user_undo_after_pick',candidateAction:null,appliedAction:'allow'}).catch(()=>{});
            showToast('Cosmetic rule removed.');
          }
        }catch(error){showToast(C.userError(error).message);}
      });
      box.append(undo);
    }
    shadow.append(style,box);document.documentElement.append(toast);
    if(toastTimer)clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{toast?.remove();toast=null;toastTimer=null;},15000);
  }
  function thriftEligible(state){
    if(document.hidden||!state||!state.el||!state.el.isConnected)return false;
    const rect=state.el.getBoundingClientRect();
    if(!(rect.width>0&&rect.bottom>0&&rect.top<innerHeight))return false;
    const delay=Math.max(C.THRIFT_DELAY_MIN,settings.thriftDelayMs||800);
    if(Date.now()-(state.seenAt||0)<delay)return false;
    return Date.now()-lastScrollAt>=delay;
  }
  function deferredAny(){for(const s of states.values())if(s.deferred)return true;return false;}
  function armThrift(){
    if(thriftTimer||!settings.thrift)return;
    thriftTimer=setTimeout(()=>{thriftTimer=null;wakeDeferred();},Math.max(120,settings.thriftDelayMs||800));
  }
  function wakeDeferred(){
    if(!enabled)return;
    let pending=false;
    for(const s of states.values()){
      if(!s.deferred)continue;
      if(thriftEligible(s)){s.deferred=false;process(s);}
      else pending=true;
    }
    if(pending&&!document.hidden)armThrift();
    report();
  }
  function onScroll(){lastScrollAt=Date.now();if(settings.thrift)armThrift();}
  function onVisibility(){if(!document.hidden){lastScrollAt=Date.now();if(settings.thrift)armThrift();}}
  function topicExpirySweep(){
    if(!settings.topics||!settings.topics.length)return;
    for(const s of states.values()){
      const d=s.decision;
      if(!d||d.rule!=='topic_muted'||!s.record)continue;
      const next=C.decide(s.record,s.result||null,settings);
      if(next.rule!==d.rule||next.action!==d.action)render(s,next);
    }
  }
  const groupBars=new Set();
  function clearGroupBars(){
    for(const bar of groupBars)bar.remove();
    groupBars.clear();
    for(const s of states.values())s.groupBar=null;
  }
  function groupKeyOf(s){return s.record.site+':'+s.record.id;}
  function recomputeGroups(){
    if(!settings.grouping||!enabled||demo){clearGroupBars();for(const s of states.values()){if(s.groupHidden){s.groupHidden=false;reapply(s);}}return;}
    const cand=[];
    for(const s of states.values()){
      if(!s.record||!s.record.text||s.revealed)continue;
      if(s.decision&&(s.decision.source==='cosmetic'||s.decision.action==='collapse'))continue;
      const norm=C.normalizeText(s.record.text);
      const tokens=norm.split(' ').filter(t=>t.length>=3);
      if(tokens.length<3)continue;
      cand.push({s,sig:C.tokenSignature(s.record.text),norm,tokens});
    }
    const assigned=new Set();
    const groups=[];
    for(let i=0;i<cand.length;i++){
      if(assigned.has(i))continue;
      assigned.add(i);
      const base=cand[i];
      const members=[base.s];
      for(let j=i+1;j<cand.length;j++){
        if(assigned.has(j))continue;
        const other=cand[j];
        let dup=!!(base.sig&&base.sig===other.sig);
        if(!dup&&base.tokens.length>=6&&other.tokens.length>=6&&base.norm.length>=40&&other.norm.length>=40&&C.tokenSimilarity(base.norm,other.norm)>=0.85)dup=true;
        if(dup){assigned.add(j);members.push(other.s);}
      }
      if(members.length>1)groups.push({rep:base.s,members:members.slice(1)});
    }
    clearGroupBars();
    const hiddenNow=new Set();
    for(const g of groups){
      const key=groupKeyOf(g.rep);
      const collapsed=!groupsExpanded.has(key);
      if(collapsed)for(const s of g.members)hiddenNow.add(s);
      const host=document.createElement('feedgate-group');
      host.setAttribute('data-fg-ui','');
      const shadow=host.attachShadow({mode:'open'});
      const style=document.createElement('style');
      style.textContent=':host{display:block;margin:6px 0 2px}.box{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px dashed #c8cbc2;border-radius:8px;background:#f7f8f4;color:#39413a;font:12px/1.4 system-ui,sans-serif}.box button{border:1px solid #c8cbc2;background:#fff;border-radius:6px;padding:2px 8px;font:12px system-ui,sans-serif;cursor:pointer}';
      const box=document.createElement('div');box.className='box';
      const label=document.createElement('span');
      label.textContent=g.members.length+(g.members.length===1?' more similar post':' more similar posts');
      const btn=document.createElement('button');btn.type='button';btn.textContent=collapsed?'Show similar':'Hide similar';
      btn.addEventListener('click',()=>{if(groupsExpanded.has(key))groupsExpanded.delete(key);else groupsExpanded.add(key);recomputeGroups();});
      box.append(label,btn);shadow.append(style,box);
      if(g.rep.el.isConnected){g.rep.groupBar=host;groupBars.add(host);g.rep.el.after(host);}
    }
    for(const s of states.values()){
      const hidden=hiddenNow.has(s);
      if(s.groupHidden!==hidden){s.groupHidden=hidden;reapply(s);}
      else if(hidden)reapply(s);
    }
  }
  function startTopicPicker(){
    if(!enabled||demo||recoveryPaused)return {started:false};
    if(pickerCleanup)pickerCleanup();
    const postRoot=(node)=>node&&node.closest?node.closest(A.SPECS[site].posts):null;
    const bar=document.createElement('div');
    bar.setAttribute('data-fg-ui','');
    bar.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:2147483646;background:#1f2933;color:#f5f7fa;font:13px/1.4 system-ui,sans-serif;padding:8px 14px;border-radius:8px;pointer-events:none';
    bar.textContent='FeedGate: hover a post, click it to mute its topic. Escape cancels.';
    let hovered=null,outlineEl=null,outlinePrev='',preview=null,cleaned=false,timeout=null;
    const setOutline=(el)=>{if(outlineEl===el)return;if(outlineEl){outlineEl.style.outline=outlinePrev;outlineEl=null;}if(el){outlinePrev=el.style.outline;el.style.outline='2px solid #df832d';outlineEl=el;}};
    const cleanup=()=>{if(cleaned)return;cleaned=true;if(outlineEl){outlineEl.style.outline=outlinePrev;outlineEl=null;}if(timeout)clearTimeout(timeout);bar.remove();document.removeEventListener('mousemove',onMove,true);document.removeEventListener('click',onClick,true);document.removeEventListener('keydown',onKey,true);if(preview){preview.remove();preview=null;}pickerCleanup=null;};
    const onMove=(ev)=>{if(preview)return;const root=postRoot(ev.target);hovered=root;setOutline(root);};
    const onKey=(ev)=>{if(ev.key==='Escape'){ev.preventDefault();cleanup();}};
    const showPreview=(root,rec)=>{
      if(preview)preview.remove();
      const host=document.createElement('feedgate-topic');
      host.setAttribute('data-fg-ui','');
      const shadow=host.attachShadow({mode:'open'});
      const style=document.createElement('style');
      style.textContent='.card{position:fixed;right:16px;bottom:18px;width:320px;background:#fff;color:#1f2933;border:1px solid #d3d7cf;border-radius:10px;padding:12px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.18)}.card h4{margin:0 0 8px;font-size:13px}.card label{display:block;margin:8px 0 2px;font-weight:600}.card input,.card select{width:100%;padding:5px;border:1px solid #c8cbc2;border-radius:6px;font:13px system-ui,sans-serif;box-sizing:border-box}.card .note{margin-top:8px;color:#5b6259;font-size:12px}.card .row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}.card button{padding:5px 12px;border-radius:6px;border:1px solid #c8cbc2;background:#fff;cursor:pointer}.card button.primary{background:#1f6f3f;border-color:#1f6f3f;color:#fff}';
      const card=document.createElement('div');card.className='card';
      const h=document.createElement('h4');h.textContent='Mute topic preview: '+location.hostname;
      const l1=document.createElement('label');l1.textContent='Topic name';
      const input=document.createElement('input');input.type='text';input.maxLength=80;input.value=(rec.text||'').slice(0,60).trim();
      const l2=document.createElement('label');l2.textContent='Scope';
      const scope=document.createElement('select');
      const o1=document.createElement('option');o1.value='site';o1.textContent='This site only';
      const o2=document.createElement('option');o2.value='all';o2.textContent='All supported sites';
      scope.append(o1,o2);
      const l3=document.createElement('label');l3.textContent='Duration';
      const dur=document.createElement('select');
      [['24','24 hours'],['168','7 days'],['0','Until I remove it']].forEach((pair)=>{const o=document.createElement('option');o.value=pair[0];o.textContent=pair[1];dur.append(o);});
      const note=document.createElement('div');note.className='note';note.textContent='Semantic matching uses the same Jev request as filtering and can increase API usage. A passing mention stays visible.';
      const row=document.createElement('div');row.className='row';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
      const save=document.createElement('button');save.type='button';save.className='primary';save.textContent='Mute topic';
      cancel.addEventListener('click',()=>cleanup());
      save.addEventListener('click',async(ev)=>{
        if(!ev.isTrusted)return;
        const label=input.value.trim();
        if(!label){input.focus();return;}
        if(!root.isConnected){cleanup();refresh(true);return;}
        const hours=Number(dur.value);
        const until=hours>0?Date.now()+hours*3600000:0;
        const result=await send('FG_TOPIC_ADD',{topic:{label,scope:scope.value,until}});
        if(result&&result.saved){
          const tid=result.topic&&result.topic.id;
          showToast('Topic muted'+(scope.value==='all'?' on all supported sites.':' on this site.')+(hours>0?' It expires later.':' Until you remove it.'),{topicId:tid});
        }
        cleanup();refresh(true);
      });
      card.append(h,l1,input,l2,scope,l3,dur,note,row);row.append(cancel,save);
      shadow.append(style,card);document.documentElement.append(host);
      preview=host;
    };
    const onClick=(ev)=>{
      if(own(ev.target)||(ev.target&&ev.target.closest&&ev.target.closest('[data-fg-ui]')))return;
      if(!ev.isTrusted)return;
      const root=postRoot(ev.target)||hovered;
      ev.preventDefault();ev.stopImmediatePropagation();
      if(!root){showToast('Click a post itself to mute its topic. Nothing was saved.');return;}
      const rec=A.extract(root,site);
      if(!rec||(!rec.text&&!rec.mediaAlt)){showToast('This post has no readable text. Nothing was saved.');return;}
      showPreview(root,rec);
    };
    document.addEventListener('mousemove',onMove,true);
    document.addEventListener('click',onClick,true);
    document.addEventListener('keydown',onKey,true);
    document.documentElement.append(bar);
    timeout=setTimeout(cleanup,60000);
    pickerCleanup=cleanup;
    return {started:true};
  }
  function startPicker() {
    if(!enabled||demo||recoveryPaused)return {started:false};
    pickerCleanup?.();
    const bar=make('div','FeedGate picker: hover a single element, click to preview a rule. Escape cancels.');
    bar.setAttribute('data-fg-ui','');
    bar.style.cssText='position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);background:#202820;color:#e5ffc8;border:1px solid #9eb886;border-radius:8px;padding:15px 20px;font:14px system-ui;max-width:90vw;pointer-events:none';
    document.documentElement.append(bar);
    let target=null,outline='',priority='',preview=null,previewTarget=null,timeout=null;
    function undoOutline(){if(previewTarget){if(outline)previewTarget.style.setProperty('outline',outline,priority);else previewTarget.style.removeProperty('outline');previewTarget=null;}}
    function clearPreview(){preview?.remove();preview=null;}
    function cleanup(){undoOutline();clearPreview();bar.remove();document.removeEventListener('mousemove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);if(timeout)clearTimeout(timeout);pickerCleanup=null;}
    function move(ev){
      if(!ev.isTrusted||own(ev.target)||preview)return;
      undoOutline();target=ev.target;
      if(!(target instanceof HTMLElement))return;
      outline=target.style.getPropertyValue('outline');priority=target.style.getPropertyPriority('outline');
      target.style.setProperty('outline','2px solid #df832d','important');
      previewTarget=target;
    }
    function key(ev){if(ev.key==='Escape'){cleanup();}}
    function reject(reason) {
      showToast(`This element cannot be hidden safely (${reason}). Nothing was saved.`);
      cleanup();
    }
    function showPreview(picked,selector,matches) {
      clearPreview();
      const info=make('div',undefined);
      info.style.cssText='pointer-events:auto;background:#202820;color:#e5ffc8;border:1px solid #9eb886;border-radius:8px;padding:12px 16px;font:13px system-ui;max-width:min(430px,88vw)';
      const count=matches.length;
      info.append(make('div',`Rule preview: ${location.hostname}`,undefined));
      info.append(make('div',`Selector: ${selector}`));
      info.append(make('div',count===1?'Hides 1 element on this page.':`Hides ${count} matching elements on this page.`));
      const tall=matches.some(m=>m.getBoundingClientRect().height>innerHeight*1.5);
      if(tall)info.append(make('div','Note: one match is taller than the viewport. It stays selectable; check the preview.'));
      const buttons=make('div');buttons.style.cssText='display:flex;gap:8px;margin-top:9px';
      const create=make('button','Create rule');
      const cancel=make('button','Cancel');
      create.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;create.disabled=true;
        // Commit revalidates the current target and the match set before saving.
        if(!picked.isConnected){reject('target_replaced');return;}
        if(!picked.matches(selector)){reject('target_replaced');return;}
        let current=[];try{current=[...document.querySelectorAll(selector)].slice(0,120);}catch{reject('unsupported_syntax');return;}
        const reason=impactReject(current);
        if(reason){reject(reason);return;}
        try{
          const saved=await send('FG_ADD_RULE',{selector,expect:settings.revisions?.cosmetic});
          lastCommittedRule=saved.rule;
          cosmetic.applied++;
          send('FG_COSMETIC_EVENT',{kind:'applied',ruleRef:saved.rule.id,reason:'user_created',candidateAction:'collapse',appliedAction:'collapse'}).catch(()=>{});
          showToast('Cosmetic rule created. It stays local to FeedGate.',{ruleId:saved.rule.id});
          cleanup();refresh();
        }catch(error){create.disabled=false;showToast(C.userError(error).message);}
      });
      cancel.addEventListener('click',ev=>{if(ev.isTrusted){cleanup();}});
      buttons.append(create,cancel);info.append(buttons);
      preview=make('div');preview.setAttribute('data-fg-ui','');preview.style.cssText='position:fixed;z-index:2147483647;bottom:18px;left:50%;transform:translateX(-50%);pointer-events:none';
      preview.append(info);document.documentElement.append(preview);
    }
    async function click(ev){
      if(!ev.isTrusted)return;
      // Our own preview/toast controls keep working while the picker is active.
      if(own(ev.target)||preview?.contains(ev.target))return;
      if(preview)return;
      ev.preventDefault();ev.stopImmediatePropagation();
      const picked=ev.target;
      if(!(picked instanceof HTMLElement)){reject('not_hideable');return;}
      const reason=structuralReject(picked);
      if(reason){reject(reason);return;}
      const selector=selectorFor(picked);
      const problem=C.selectorProblem(selector);
      if(problem){reject(problem);return;}
      let matches=[];try{matches=[...document.querySelectorAll(selector)].slice(0,120);}catch{reject('unsupported_syntax');return;}
      const aggregate=impactReject(matches);
      if(aggregate){reject(aggregate);return;}
      target=picked;
      showPreview(picked,selector,matches);
      timeout=setTimeout(cleanup,60000);
    }
    document.addEventListener('mousemove',move,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);pickerCleanup=cleanup;
    return {started:true};
  }
  // The status panel offers the same author decision as the cards, but for any
  // post on the page: hover a post, preview it, then mute or allow its author.
  function startAuthorPicker(mode) {
    if(!enabled||demo||recoveryPaused)return {started:false};
    const allow=mode==='allow';
    pickerCleanup?.();
    const bar=make('div',`FeedGate: hover a post, click it to ${allow?'allow':'mute'} its author. Escape cancels.`);
    bar.setAttribute('data-fg-ui','');
    bar.style.cssText='position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);background:#202820;color:#e5ffc8;border:1px solid #9eb886;border-radius:8px;padding:15px 20px;font:14px system-ui;max-width:90vw;pointer-events:none';
    document.documentElement.append(bar);
    let target=null,outline='',priority='',preview=null,previewTarget=null,timeout=null;
    function undoOutline(){if(previewTarget){if(outline)previewTarget.style.setProperty('outline',outline,priority);else previewTarget.style.removeProperty('outline');previewTarget=null;}}
    function clearPreview(){preview?.remove();preview=null;}
    function cleanup(){undoOutline();clearPreview();bar.remove();document.removeEventListener('mousemove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);if(timeout)clearTimeout(timeout);pickerCleanup=null;}
    function postRoot(node){
      if(!(node instanceof Element))return null;
      const spec=A.SPECS?.[site];
      if(!spec||!spec.posts)return null;
      try{const root=node.closest(spec.posts);return root instanceof HTMLElement?root:null;}catch{return null;}
    }
    function move(ev){
      if(!ev.isTrusted||own(ev.target)||preview)return;
      undoOutline();const root=postRoot(ev.target);target=root;
      if(!root)return;
      outline=root.style.getPropertyValue('outline');priority=root.style.getPropertyPriority('outline');
      root.style.setProperty('outline','2px solid #df832d','important');
      previewTarget=root;
    }
    function key(ev){if(ev.key==='Escape'){cleanup();}}
    function reject(message){showToast(message);cleanup();}
    function showPreview(root,author) {
      clearPreview();
      const info=make('div',undefined);
      info.style.cssText='pointer-events:auto;background:#202820;color:#e5ffc8;border:1px solid #9eb886;border-radius:8px;padding:12px 16px;font:13px system-ui;max-width:min(430px,88vw)';
      info.append(make('div',`${allow?'Allow':'Mute'} preview: ${location.hostname}`,undefined));
      info.append(make('div',`Author: ${author}`));
      info.append(make('div',allow?'Their posts stay visible here. This local choice makes no model request.':'Their posts will be hidden locally. This local choice makes no model request.'));
      const buttons=make('div');buttons.style.cssText='display:flex;gap:8px;margin-top:9px';
      const confirm=make('button',allow?'Allow author':'Mute author');
      const cancel=make('button','Cancel');
      confirm.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;confirm.disabled=true;
        if(!root.isConnected){reject('That post was replaced before saving. Nothing was saved.');return;}
        try{
          const result=await send(allow?'FG_ALLOW_AUTHOR':'FG_MUTE_AUTHOR',{author});
          showToast(allow?'Author allowed on this site. Their posts stay visible here.':'Author muted on this site. Their posts are hidden from now on. Their posts are never sent to the model again.',{authorUndo:{author,previous:result?.previous,applied:result?.applied}});
          cleanup();refresh(true);
        }catch(error){confirm.disabled=false;showToast(C.userError(error).message);}
      });
      cancel.addEventListener('click',ev=>{if(ev.isTrusted){cleanup();}});
      buttons.append(confirm,cancel);info.append(buttons);
      preview=make('div');preview.setAttribute('data-fg-ui','');preview.style.cssText='position:fixed;z-index:2147483647;bottom:18px;left:50%;transform:translateX(-50%);pointer-events:none';
      preview.append(info);document.documentElement.append(preview);
    }
    async function click(ev){
      if(!ev.isTrusted)return;
      if(own(ev.target)||preview?.contains(ev.target))return;
      if(preview)return;
      ev.preventDefault();ev.stopImmediatePropagation();
      const root=postRoot(ev.target)||(target&&target.isConnected?target:null);
      if(!root){reject('Click a post itself to choose its author. Nothing was saved.');return;}
      const rec=A.extract(root,site);
      if(!rec||!rec.author){reject('This post has no readable author. Nothing was saved.');return;}
      if(rec.authorNameOnly){reject('This post has no stable profile link, so author actions are unavailable. Nothing was saved.');return;}
      showPreview(root,rec.authorId||rec.author);
      timeout=setTimeout(cleanup,60000);
    }
    document.addEventListener('mousemove',move,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);pickerCleanup=cleanup;
    return {started:true};
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(message.type==='FG_CONFIG_CHANGED'){refresh();respond({ok:true});}
    else if(message.type==='FG_GET_PAGE_STATE')respond(stats());
    else if(message.type==='FG_RESTORE_ALL'){
      for(const state of states.values()){state.revealed=true;applyAction(state,'allow');removeCard(state);}report();respond({restored:true});
    }else if(message.type==='FG_RESCAN'){refresh(true);respond({rescanned:true});}
    else if(message.type==='FG_PICK_ELEMENT')respond(startPicker());
  });
  // MutationObserver cannot see history.pushState itself. The route guard also runs before each API call.
  const checkNavigation=()=>{
    if(location.href!==lastURL){lastURL=location.href;refresh();}
    else if(enabled&&!document.hidden&&++sweepTicks%5===0){topicExpirySweep();schedule(document);report();}
  };
  let navigationTimer=setInterval(checkNavigation,600);
  addEventListener('pagehide',()=>{enabled=false;stop();hud?.remove();hud=null;hudRoot=null;toast?.remove();toast=null;clearInterval(navigationTimer);});
  addEventListener('pageshow',event=>{
    if(event.persisted){clearInterval(navigationTimer);navigationTimer=setInterval(checkNavigation,600);refresh(true);}
  });
  // The local demo is an extension page, not a tab content script. Handle its
  // buttons directly instead of using tabs.sendMessage to the same page.
  if(demo)document.addEventListener('click',event=>{
    if(!event.isTrusted)return;
    if(event.target.closest('#demo-restore')){for(const s of states.values()){s.revealed=true;applyAction(s,'allow');removeCard(s);}report();}
    if(event.target.closest('#demo-rescan'))refresh(true);
  });
  document.addEventListener('keydown',event=>{
    if(!event.isTrusted||!event.altKey||!event.shiftKey||event.code!=='KeyF')return;
    if(event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]'))return;
    event.preventDefault();
    const hasHidden=[...states.values()].some(s=>s.el.getAttribute('data-fg-action'));
    if(hasHidden){revealAll=true;for(const s of states.values()){applyAction(s,'allow');removeCard(s);}}
    else {revealAll=false;for(const s of states.values())reapply(s);refresh(true);}
    report();
  });
  refresh();
})();
