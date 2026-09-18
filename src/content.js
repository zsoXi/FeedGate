/* SPDX-License-Identifier: GPL-3.0-or-later
 * Original implementation inspired by uBlock Origin's separation of DOM watching,
 * cosmetic filtering and per-site switches. No uBlock code or filter lists are bundled.
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
  let pickerCleanup=null,reportTimer=null,hud=null,hudText=null,keyReady=false;
  let detectedTotal=0,sweepTicks=0;
  const states=new Map(),roots=new Set();
  let lastError=null;
  const own=n=>n instanceof Element && (n.matches('feedgate-card,[data-fg-ui]')||!!n.closest('feedgate-card,[data-fg-ui]'));
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
  function restore(state) {
    const el=state.el;
    if (state.original) {
      for (const key of ['display','opacity']) {
        if (state.changed?.[key] && el.style.getPropertyValue(key)===state.changed[key]) {
          const old=state.original[key];
          if(old.value)el.style.setProperty(key,old.value,old.priority);else el.style.removeProperty(key);
        }
      }
      if (state.changed?.aria && el.getAttribute('aria-hidden')==='true') {
        if(state.original.aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',state.original.aria);
      }
    }
    state.placeholder?.remove();state.placeholder=null;state.original=null;state.changed=null;
    el.removeAttribute('data-fg-action');
  }
  function pageState() {
    if(!demo&&C.isPrivateRoute(location.href))return 'private';
    if(!settings.enabled)return 'paused';
    if(!demo&&!settings.sites.includes(site))return 'site-off';
    if(!settings.consent)return 'no-consent';
    if(!keyReady)return 'locked';
    return lastError?'error':'ready';
  }
  function stats() {
    let collapsed=0,dimmed=0,pending=0,observed=0,completed=0,kept=0,protectedCount=0,errors=0;
    for(const s of states.values())if(s.el.isConnected){
      if(s.el.getAttribute('data-fg-action')==='collapse')collapsed++;
      if(s.el.getAttribute('data-fg-action')==='dim')dimmed++;
      if(s.pending)pending++;
      if(s.record?.text||s.record?.sponsored||s.record?.mediaAlt)observed++;
      if(s.completed)completed++;
      if(s.decision?.action==='allow')kept++;
      if(s.decision?.protected)protectedCount++;
      if(s.error)errors++;
    }
    return {collapsed,dimmed,pending,observed,completed,kept,protected:protectedCount,errors,detectedTotal,enabled,site,lastError,state:pageState()};
  }
  function updateHUD(s) {
    if(demo||!settings.showStatus||s.state==='private'||s.state==='site-off'){hud?.remove();hud=null;return;}
    if(!hud||!hud.isConnected) {
      hud=document.createElement('feedgate-status');hud.setAttribute('data-fg-ui','');
      hud.style.cssText='position:fixed!important;bottom:14px!important;left:14px!important;z-index:2147483646!important;display:block!important';
      const shadow=hud.attachShadow({mode:'open'}),style=make('style');
      style.textContent=':host{all:initial;color-scheme:dark}button{border:1px solid #344d40;border-radius:9px;background:#17221c;color:#def0dc;box-shadow:0 3px 18px #0003;padding:9px 12px;cursor:pointer;font:12px/1.4 system-ui;max-width:min(390px,85vw);text-align:left}button:focus-visible{outline:2px solid #c6fa8c;outline-offset:3px}strong{color:#ccfa92}span{display:block;color:#acbcad;font-size:11px;margin-top:2px}';
      const b=make('button');b.type='button';b.title='Open FeedGate settings and diagnostics';
      const title=make('strong','FeedGate 2.1');hudText=make('span');
      b.append(title,hudText);b.addEventListener('click',ev=>{if(ev.isTrusted)send('FG_OPEN_SETTINGS_FROM_PAGE').catch(()=>{});});
      shadow.append(style,b);document.documentElement.append(hud);
    }
    const labels={ready:settings.mode==='observe'?'Observe only':'Running',paused:'Paused',locked:'Key locked: open settings',
      'no-consent':'Local ads only: cloud consent off',error:'Check diagnostics',private:'Private route','site-off':'Site off'};
    hudText.textContent=`${labels[s.state]} · ${s.observed} detected · ${s.collapsed+s.dimmed} filtered · ${s.pending} pending`;
  }
  function report() {
    if(reportTimer)return;
    reportTimer=setTimeout(()=>{
      reportTimer=null;const s=stats();updateHUD(s);
      if(!demo)send('FG_PAGE_STATS',{stats:s}).catch(()=>{});
    },200);
  }
  function render(state,decision) {
    if (!state.el.isConnected) return;
    restore(state);
    state.decision=decision;
    if (state.revealed || !enabled || decision.action==='allow') {report();return;}
    const el=state.el;
    state.original={display:{value:el.style.getPropertyValue('display'),priority:el.style.getPropertyPriority('display')},opacity:{value:el.style.getPropertyValue('opacity'),priority:el.style.getPropertyPriority('opacity')},aria:el.getAttribute('aria-hidden')};
    state.changed={};
    if(decision.action==='collapse'){
      el.style.setProperty('display','none','important');state.changed.display='none';
      el.setAttribute('aria-hidden','true');state.changed.aria=true;
    }else{el.style.setProperty('opacity','0.28','important');state.changed.opacity='0.28';}
    el.setAttribute('data-fg-action',decision.action);
    const host=document.createElement('feedgate-card');
    host.setAttribute('data-fg-ui','');host.style.setProperty('display','block','important');
    const shadow=host.attachShadow({mode:'open'});
    const style=make('style');
    style.textContent=`:host{all:initial;display:block;color-scheme:light dark}*{box-sizing:border-box}.card{margin:7px 0;padding:11px 14px;border:1px solid #b8c5b7;border-left:3px solid #6f8e60;border-radius:7px;background:#f1f3ed;color:#20291f;font:12px/1.5 system-ui,sans-serif}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mark{font-weight:800;letter-spacing:.04em}.note{flex:1;min-width:120px;color:#50604c}button{font:inherit;font-weight:650;color:#223020;background:#fff;border:1px solid #c6cec1;border-radius:5px;padding:4px 9px;cursor:pointer}button:hover{background:#e2ebd9}button:focus-visible{outline:2px solid #40712b;outline-offset:2px}.details{margin-top:9px;border-top:1px solid #d2dbcb;padding-top:8px}.details[hidden]{display:none}.score{display:flex;gap:8px;justify-content:space-between}.small{font-size:11px;color:#596b52;margin-top:6px}@media(prefers-color-scheme:dark){.card{background:#18211b;color:#e5eddc;border-color:#425040}.note,.small{color:#abbda2}button{background:#263327;color:#e4efd9;border-color:#455a43}button:hover{background:#354833}}`;
    const card=make('div',undefined,'card'),row=make('div',undefined,'row');
    row.append(make('span','FeedGate','mark'),make('span',decision.action==='collapse'?'Post collapsed':(decision.conflict?'Post dimmed for review':'Post dimmed'),'note'));
    const show=make('button','Show'),why=make('button','Why?');
    const details=make('div',undefined,'details');details.hidden=true;
    details.append(make('div',decision.reason));
    if(decision.conflict)details.append(make('div','Useful-content signals were also present, so this post is dimmed for review instead of hidden.','small'));
    if(decision.scores) for(const [key,value] of Object.entries(decision.scores)) {
      const title=C.SIGNALS[key];
      if(!title)continue;
      const item=make('div',undefined,'score');item.append(make('span',title),make('strong',`${Math.round(value*100)}%`));details.append(item);
    }
    details.append(make('div','Model estimates, not verified facts or bot identity. High information value does not establish truth.','small'));
    if(state.record&&!state.manualReason) {
      const keep=make('button','Keep this post');
      keep.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;keep.disabled=true;
        try {await send('FG_KEEP_POST',{record:state.record});state.revealed=true;restore(state);report();}
        catch(error){details.append(make('div',C.userError(error).message));keep.disabled=false;}
      });details.append(keep);
    }
    show.addEventListener('click',ev=>{if(!ev.isTrusted)return;state.revealed=true;restore(state);report();});
    why.addEventListener('click',ev=>{if(!ev.isTrusted)return;details.hidden=!details.hidden;});
    row.append(show,why);
    if(state.record?.author && !demo){
      const allow=make('button','Allow author');
      allow.addEventListener('click',async ev=>{
        if(!ev.isTrusted)return;allow.disabled=true;
        try{await send('FG_ALLOW_AUTHOR',{author:state.record.author});}
        catch(error){details.hidden=false;details.append(make('div',C.userError(error).message));allow.disabled=false;}
      });row.append(allow);
    }
    card.append(row,details);shadow.append(style,card);
    el.before(host);state.placeholder=host;report();
  }
  function nearViewport(el) {
    const r=el.getBoundingClientRect();
    return r.top<innerHeight+1000 && r.bottom>-1000 && r.width>0;
  }
  function process(state) {
    if(!enabled || state.revealed || state.pending || !state.visible || !state.el.isConnected)return;
    if(state.manualReason){render(state,{action:settings.mode==='observe'?'allow':'collapse',reason:state.manualReason,source:'cosmetic'});return;}
    if(state.completed)return;
    const r=state.record;
    if(!r)return;
    // Explicit local decisions stay separate from model failures.
    render(state,C.decide(r,null,settings));
    if(C.decide(r,null,settings).source==='allowlist'){state.completed=true;report();return;}
    if(!r.text&&!r.mediaAlt&&!r.sponsored){state.completed=true;return;}
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
  function ensure(el,manualReason=null,manualSelector=null) {
    if(!enabled||!el.isConnected||A.privateElement(el)||own(el))return;
    let record=A.extract(el,site);
    if(!record && !manualReason)return;
    if(!record)record={site,id:'local-rule',author:'',text:'',mediaAlt:'',sponsored:false,linkDomains:[]};
    const snapshot=JSON.stringify(record);
    let state=states.get(el);
    if(state&&state.snapshot!==snapshot){
      restore(state);state.token++;state.record=record;state.snapshot=snapshot;state.pending=false;state.completed=false;state.revealed=false;state.result=null;state.error=null;
    }
    if(!state){
      if(states.size>=1500){
        const old=[...states.values()].find(s=>!s.el.isConnected||!nearViewport(s.el));
        if(old){restore(old);intersection?.unobserve(old.el);states.delete(old.el);}else return;
      }
      state={el,record,snapshot,token:0,pending:false,completed:false,revealed:false,result:null,visible:nearViewport(el),manualReason:null,manualSelector:null};
      states.set(el,state);detectedTotal++;intersection?.observe(el);
    }
    if(manualReason){
      if(state.manualReason!==manualReason||state.manualSelector!==manualSelector){
        state.token++;state.pending=false;state.completed=false;
      }
      state.manualReason=manualReason;state.manualSelector=manualSelector;state.visible=true;
    }
    if(!state.visible&&nearViewport(el))state.visible=true;
    process(state);
  }
  function scan() {
    scanTimer=null;
    if(!enabled)return;
    for(const [el,s] of states){
      if(!el.isConnected){s.token++;restore(s);intersection?.unobserve(el);states.delete(el);continue;}
      if(s.manualSelector&&!el.matches(s.manualSelector)){
        s.token++;restore(s);s.manualReason=null;s.manualSelector=null;s.pending=false;s.completed=false;
        if(el.matches(A.SPECS[site].posts))ensure(el);
        else{intersection?.unobserve(el);states.delete(el);}
      }
    }
    const pending=[...roots];roots.clear();
    for(const root of pending)for(const el of A.collect(root,site))ensure(el);
    if(!demo){
      for(const rule of C.matchingRules(settings.cosmeticRules,location.hostname)){
        let matches=[];try{matches=[...document.querySelectorAll(rule.selector)].slice(0,100);}catch{continue;}
        for(const el of matches){
          if(['HTML','BODY','MAIN'].includes(el.tagName)||el.contains(document.querySelector('main'))||own(el))continue;
          ensure(el,`Your local cosmetic rule: ${rule.host}##${rule.selector}`,rule.selector);
        }
      }
    }
  }
  function schedule(root) {
    if(root?.nodeType===Node.TEXT_NODE)root=root.parentElement;
    if(root&&root.querySelectorAll&&!own(root))roots.add(root);
    if(!scanTimer)scanTimer=setTimeout(scan,80);
  }
  function stop() {
    epoch++;
    observer?.disconnect();intersection?.disconnect();observer=null;intersection=null;
    if(scanTimer)clearTimeout(scanTimer);scanTimer=null;roots.clear();
    pickerCleanup?.();
    for(const s of states.values()){s.token++;restore(s);}states.clear();report();
  }
  async function refresh() {
    const serial=++configSerial;
    let conf;
    try{conf=await send('FG_GET_CONFIG');}catch(error){enabled=false;stop();lastError=C.userError(error);return;}
    if(serial!==configSerial)return;
    enabled=false;stop();settings=C.sanitizeSettings(conf.settings);keyReady=conf.keyReady===true;lastError=null;
    enabled=settings.enabled && (demo||settings.sites.includes(site)) && (demo||!C.isPrivateRoute(location.href));
    report();if(!enabled)return;
    intersection=new IntersectionObserver(entries=>{
      for(const entry of entries){const s=states.get(entry.target);if(s){s.visible=entry.isIntersecting;if(s.visible)process(s);}}
    },{rootMargin:'1000px 0px'});
    observer=new MutationObserver(mutations=>{
      if(!demo&&C.isPrivateRoute(location.href)){enabled=false;stop();return;}
      for(const m of mutations){
        if(own(m.target))continue;
        if(m.type==='attributes' && (['style','aria-hidden'].includes(m.attributeName)||m.attributeName.startsWith('data-fg-')))continue;
        if(m.type==='childList' && [...m.addedNodes,...m.removedNodes].length && [...m.addedNodes,...m.removedNodes].every(n=>own(n)))continue;
        schedule(m.target);
        for(const node of m.addedNodes||[])if(node.nodeType===Node.ELEMENT_NODE&&!own(node))schedule(node);
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true});
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
  function startPicker() {
    if(!enabled||demo)return {started:false};
    pickerCleanup?.();
    const bar=make('div','FeedGate picker: click an element to hide it with a local CSS rule. Escape cancels.');
    bar.setAttribute('data-fg-ui','');
    bar.style.cssText='position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);background:#202820;color:#e5ffc8;border:1px solid #9eb886;border-radius:8px;padding:15px 20px;font:14px system-ui;max-width:90vw;pointer-events:none';
    document.documentElement.append(bar);
    let target=null,outline='',priority='';
    function undo(){if(target){if(outline)target.style.setProperty('outline',outline,priority);else target.style.removeProperty('outline');target=null;}}
    function move(ev){if(!ev.isTrusted||own(ev.target))return;undo();target=ev.target;if(!(target instanceof HTMLElement))return;outline=target.style.getPropertyValue('outline');priority=target.style.getPropertyPriority('outline');target.style.setProperty('outline','2px solid #df832d','important');}
    function cleanup(){undo();bar.remove();document.removeEventListener('mousemove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);pickerCleanup=null;}
    function key(ev){if(ev.key==='Escape')cleanup();}
    async function click(ev){
      if(!ev.isTrusted)return;ev.preventDefault();ev.stopImmediatePropagation();
      const picked=ev.target;cleanup();
      if(!(picked instanceof HTMLElement)||['HTML','BODY','MAIN'].includes(picked.tagName)||own(picked))return;
      const selector=selectorFor(picked);
      try{await send('FG_ADD_RULE',{selector});}catch(error){lastError=C.userError(error);}
    }
    document.addEventListener('mousemove',move,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);pickerCleanup=cleanup;
    return {started:true};
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(message.type==='FG_CONFIG_CHANGED'){refresh();respond({ok:true});}
    else if(message.type==='FG_GET_PAGE_STATE')respond(stats());
    else if(message.type==='FG_RESTORE_ALL'){
      for(const state of states.values()){state.revealed=true;restore(state);}report();respond({restored:true});
    }else if(message.type==='FG_RESCAN'){refresh();respond({rescanned:true});}
    else if(message.type==='FG_PICK_ELEMENT')respond(startPicker());
  });
  // MutationObserver cannot see history.pushState itself. The route guard also runs before each API call.
  const checkNavigation=()=>{
    if(location.href!==lastURL){lastURL=location.href;refresh();}
    else if(enabled&&!document.hidden&&++sweepTicks%5===0){schedule(document);report();}
  };
  let navigationTimer=setInterval(checkNavigation,600);
  addEventListener('pagehide',()=>{enabled=false;stop();hud?.remove();hud=null;clearInterval(navigationTimer);});
  addEventListener('pageshow',event=>{
    if(event.persisted){clearInterval(navigationTimer);navigationTimer=setInterval(checkNavigation,600);refresh();}
  });
  // The local demo is an extension page, not a tab content script. Handle its
  // buttons directly instead of using tabs.sendMessage to the same page.
  if(demo)document.addEventListener('click',event=>{
    if(!event.isTrusted)return;
    if(event.target.closest('#demo-restore')){for(const s of states.values()){s.revealed=true;restore(s);}report();}
    if(event.target.closest('#demo-rescan'))refresh();
  });
  document.addEventListener('keydown',event=>{
    if(!event.isTrusted||!event.altKey||!event.shiftKey||event.code!=='KeyF')return;
    if(event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]'))return;
    event.preventDefault();
    const hasHidden=[...states.values()].some(s=>s.el.getAttribute('data-fg-action'));
    if(hasHidden){for(const s of states.values()){s.revealed=true;restore(s);}report();}
    else refresh();
  });
  refresh();
})();
