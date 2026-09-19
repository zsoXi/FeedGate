/** Test harness only: real worker source, in-memory Chrome APIs, synthetic HTTP. */
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const sources=await Promise.all(['core.js','vault.js','typesafe.js','background.js'].map(async name=>(await readFile(new URL('../src/'+name,import.meta.url),'utf8')).replace(/^import '\.\/.+';\r?\n/gm,'')));
export const TEST_ID='a'.repeat(32);
export const trusted={id:TEST_ID,url:`chrome-extension://${TEST_ID}/options.html`};
export const sender={id:TEST_ID,url:'https://x.com/home',frameId:0,tab:{id:1}};
export const post=(text='Useful fixture',id='p-1')=>({id,author:'@fixture',text,mediaAlt:'',linkDomains:[],sponsored:false});
export const adEvidenceVerified={adapter:'x',status:'verified',markerKind:'x_is_promoted_attribute',selectorId:'x-attr-is-promoted',ownerMatched:true,renderedLabel:null,evidenceKind:'platform_metadata',scope:'outer_post'};
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function createWorker(options={}) {
  const clone=v=>structuredClone(v),events={},calls=[],registrations=[],tabs=new Map([[1,{id:1,url:'https://x.com/home'}]]);
  for(const [id,url] of Object.entries(options.tabs||{}))tabs.set(Number(id),{id:Number(id),url});
  const local=clone(options.local||{}),session=clone(options.session||{}),levels={};
  let mode='success',delay=0,fetchActive=0,maxActive=0;
  function storage(data,label){return {
    async get(keys){const names=keys==null?Object.keys(data):Array.isArray(keys)?keys:[keys];return Object.fromEntries(names.filter(k=>k in data).map(k=>[k,clone(data[k])]));},
    async set(values){Object.assign(data,clone(values));},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[k];},async setAccessLevel(v){levels[label]=v.accessLevel;}
  };}
  const listeners=()=>({addListener(fn){this.fn=fn;}});
  const chrome={runtime:{id:TEST_ID,onMessage:listeners(),onInstalled:listeners(),onStartup:listeners(),getURL:p=>`chrome-extension://${TEST_ID}/${p}`,async openOptionsPage(){},async sendMessage(message){(events.extensionBroadcasts??=[]).push(clone(message));return {};}},storage:{local:storage(local,'local'),session:storage(session,'session')},
    permissions:{async getAll(){return {permissions:['storage','scripting','activeTab'],origins:['https://api.typesafe.ai/*','https://x.com/*']};},async contains(){return options.permissions!==false;},onRemoved:listeners()},
    tabs:{async get(id){if(!tabs.has(id))throw Error('Missing tab');return clone(tabs.get(id));},async query(filter){const urls=!filter?.url?null:Array.isArray(filter.url)?filter.url:[filter.url];return [...tabs.values()].filter(t=>!urls||urls.some(u=>t.url.startsWith(String(u).replace(/\*$/,'')))).map(clone);},      async sendMessage(id,message){if(options.silent&&message?.type==='FG_RESTORE_ALL')return new Promise(()=>{});(events.broadcasts??=[]).push({id,message:clone(message)});return {};},async reload(id){(events.reloads??=[]).push(id);return {};},async create(){return {id:2};}},
    scripting:{async getRegisteredContentScripts(){return clone(registrations);},async registerContentScripts(items){registrations.push(...clone(items));},async unregisterContentScripts({ids}){for(let i=registrations.length-1;i>=0;i--)if(ids.includes(registrations[i].id))registrations.splice(i,1);},async executeScript(){}},
    action:{async setBadgeText(){},async setBadgeBackgroundColor(){}}
  };
  const fetch=async(url,o)=>{
    if(String(url).endsWith('build.json')){
      (events.buildFetches??=[]).push(String(url));
      const release=options.buildRelease===undefined?'3.3.0':options.buildRelease;
      if(release===null)return new Response('missing',{status:404});
      return Response.json({release,buildId:'harness-build',builtAt:'2026-01-01T00:00:00.000Z'});
    }
    calls.push({url,headers:clone(o.headers),body:JSON.parse(o.body)});fetchActive++;maxActive=Math.max(maxActive,fetchActive);
    try{
      if(delay)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,delay);o.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
      if(mode==='network')throw Error('synthetic network failure');
      if(typeof mode==='number')return new Response('untrusted provider text',{status:mode,headers:{'Retry-After':'30'}});
      if(mode==='malformed')return Response.json({invalid:true});
      const body=JSON.parse(o.body),high=body.state.post_text.includes('SPAM_FIXTURE'),topicHigh=body.state.post_text.includes('TOPIC_FIXTURE');
      return Response.json({model:'jev-fixture-not-live',answers:Object.fromEntries(Object.keys(body.questions).map(k=>[k,{type:'noul',noul:k==='sufficient'?.99:k==='feedSpam'&&high?.99:k==='topic'&&topicHigh?.99:.01}])),usage:{input_tokens:42,output_tokens:0}});
    }finally{fetchActive--;}
  };
  const context=vm.createContext({chrome,crypto:webcrypto,TextEncoder,TextDecoder,URL,AbortController,DOMException,Uint8Array,Response,performance,fetch,atob,btoa,console,
    setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout});
  for(const source of sources)vm.runInContext(source,context);
  async function send(message,from=trusted){return new Promise(resolve=>chrome.runtime.onMessage.fn(clone(message),clone(from),r=>resolve(clone(r))));}
  async function ok(message,from=trusted){const r=await send(message,from);if(!r.ok)throw new Error(r.error.code);return r.data;}
  await ok({type:'FG_STATUS'});
  return {send,ok,local,session,levels,calls,registrations,tabs,events,chrome,context,get maxActive(){return maxActive;},setMode(v){mode=v;},setDelay(v){delay=v;},setPermissions(v){options.permissions=v;},setBuildRelease(v){options.buildRelease=v;},
    async enable(patch={}){await ok({type:'FG_SET_KEY',key:'dummy-worker-test-key'});await ok({type:'FG_PATCH_SETTINGS',patch:{consent:true,sites:['x'],...patch}});},
    async classify(r=post(),s=sender){return ok({type:'FG_CLASSIFY',record:r},s);}
  };
}
