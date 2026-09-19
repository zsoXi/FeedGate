"""Real Chromium DOM tests; Chrome messaging/location and Jev results are fixtures.

These are NOT installed-extension or live-site integration tests. This environment
blocks extension installation by enterprise policy; no policy is modified.
Requires: Python 3.10+, playwright, and an available Chromium executable.
"""
import asyncio, base64, json, os, re, shutil, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
REPORT=[]

def source(name): return (ROOT/'src'/name).read_text(encoding='utf-8')
def shell(name):
    html=(ROOT/'static'/name).read_text(encoding='utf-8')
    html=re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
    html=re.sub(r'<link[^>]+>', '', html)
    html=html.replace('</head>','<style>'+(ROOT/'static/ui.css').read_text(encoding='utf-8')+'</style></head>')
    icon=base64.b64encode((ROOT/'static/icons/48.png').read_bytes()).decode()
    return html.replace('src="icons/48.png"','src="data:image/png;base64,'+icon+'"')

def tweet(id,text,extra='',author='fixture',attr=''):
    return f'<article id="{id}" data-testid="tweet" {attr}><header data-testid="User-Name">@{author}</header><a href="https://x.com/{author}/status/{id}">Timestamp</a><div data-testid="tweetText">{text}</div>{extra}</article>'

HARNESS=r'''() => {
const C=FeedGateCore;
const H=window.harness={settings:C.clone(C.DEFAULTS),requests:[],listeners:[],mode:'success',delay:0,keyReady:false,hasVault:false,verifiedAt:0,kept:[],pages:[],permissionDenied:false,appVersion:C.VERSION,cosmeticEvents:[],promoteQuarantined:false,metrics:{decisions:0,protected:0,usefulPromotions:0,requests:0,filterDecisions:0,lastLatencyMs:0,classified:0,inputTokens:0,outputTokens:0,cacheHits:0,errors:0,cancellations:0,logDropped:0,cosmeticApplied:0,cosmeticRestored:0,cosmeticRejected:0,breakerActivations:0},log:[],calls:[]};
H.settings.sites=['x'];
H.location={protocol:'https:',hostname:'x.com',pathname:'/home',href:'https://x.com/home'};
H.command=type=>{let result;for(const fn of H.listeners)fn({type},{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},r=>result=r);return result;};
H.refresh=()=>H.command('FG_CONFIG_CHANGED');
H.bump=(domain)=>{const r={...H.settings.revisions};r[domain]=(r[domain]||0)+1;H.settings.revisions=r;};
H.cosmeticCounts=()=>{const counts={total:0,active:0,quarantined:0,disabled:0,deleted:0};for(const rule of H.settings.cosmeticFilters.rules){counts.total++;counts[rule.status]=(counts[rule.status]||0)+1;}return counts;};
H.siteStates=()=>Object.values(C.SITE_DEFS).map(def=>({site:def.id,label:def.label,status:def.status,selected:H.settings.sites.includes(def.id),permitted:!H.permissionDenied,recoveryPaused:H.settings.recoverySites.includes(def.id),effective:H.settings.enabled&&H.settings.sites.includes(def.id)&&!H.permissionDenied&&!H.settings.recoverySites.includes(def.id),reason:!H.settings.enabled?'engine_paused':!H.settings.sites.includes(def.id)?'not_selected':H.permissionDenied?'permission_required':H.settings.recoverySites.includes(def.id)?'recovery_pause':'ready'}));
H.status=()=>({settings:C.clone(H.settings),keyReady:H.keyReady,authRejected:false,hasVault:H.hasVault,metrics:H.metrics,daily:{requests:H.requests.length},log:H.log,verifiedAt:H.verifiedAt,keptPosts:H.kept.length,pages:H.pages,siteStates:H.siteStates(),cosmetic:{enabled:H.settings.cosmeticEnabled,...H.cosmeticCounts()},hudMode:H.settings.hudMode,feedsOpen:H.settings.feedsOpen,cleanupSites:[]});
window.chrome={runtime:{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',onMessage:{addListener:fn=>H.listeners.push(fn)},openOptionsPage:async()=>{},sendMessage:async message=>{
 H.calls.push(message.type);
 if(message.type==='FG_GET_CONFIG'){const site=C.siteForHost(H.location.hostname);return {ok:true,data:{settings:C.clone(H.settings),keyReady:H.keyReady,appVersion:H.appVersion||C.VERSION,recoveryPaused:site?H.settings.recoverySites.includes(site):false,cleanupRequired:false}};}
 if(message.type==='FG_CLASSIFY'){
   const r=structuredClone(message.record),delay=H.delay,mode=H.mode;H.requests.push(r);
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   const scores={unwantedAd:r.text.includes('BUILDER_FIXTURE')?.9:.01,feedSpam:r.text.includes('SPAM_FIXTURE')?.99:.01,bait:r.text.includes('BAIT_FIXTURE')?.99:.01,lowSignal:.01,useful:r.text.includes('BUILDER_FIXTURE')?.95:.1,original:r.text.includes('BUILDER_FIXTURE')?.9:.1,risk:.01,sufficient:.99};
   const result=mode==='success'?{model:'synthetic-DOM-fixture',scores,usage:{input_tokens:0,output_tokens:0},latencyMs:delay}:null;
   return {ok:true,data:{result,decision:C.decide(r,result,H.settings,{revealed:H.kept.includes(r.id)}),...(mode==='success'?{}:{error:{code:'NETWORK',message:'Simulated offline'}})}};
 }
 if(message.type==='FG_KEEP_POST'){H.kept.push(message.record.id);H.refresh();return {ok:true,data:{saved:true}};}
 if(message.type==='FG_PAGE_STATS'){H.pages=[{...message.stats,site:'x',context:'feed'}];return {ok:true,data:{}};}
 if(message.type==='FG_DIAGNOSTICS')return {ok:true,data:{format:'feedgate-diagnostics',version:5,build:{release:'3.0.0',rubric:'feed-v2.1.0',policy:'policy-2.1.1',detector:'ad-3.0.0',extraction:'extract-3.0.0',schema:5},pages:H.pages,cosmeticEvents:H.cosmeticEvents}};
 if(message.type==='FG_ALLOW_AUTHOR'){H.settings.allowedAuthors.push(C.authorKey('x',message.author));H.refresh();return {ok:true,data:{}};}
 if(message.type==='FG_ADD_RULE'){
   const rule=C.sanitizeCosmeticRule({id:'r-'+Math.random().toString(36).slice(2,10),host:new URL(H.location.href).hostname,selector:message.selector,status:'active',source:'picker',reason:'user_created',createdAt:Date.now(),validatedAt:Date.now()});
   if(!rule)return {ok:false,error:{code:'UNSAFE_SELECTOR',message:'selector rejected'}};
   H.settings.cosmeticFilters={version:3,revision:H.settings.cosmeticFilters.revision+1,rules:[...H.settings.cosmeticFilters.rules,rule]};H.bump('cosmetic');H.refresh();
   return {ok:true,data:{saved:true,rule,revision:H.settings.revisions.cosmetic}};
 }
 if(message.type==='FG_RULE_REVALIDATE'){
   const rule=H.settings.cosmeticFilters.rules.find(r=>r.id===message.id);
   if(!rule)return {ok:false,error:{code:'RULE_NOT_FOUND',message:'missing'}};
   if(H.promoteQuarantined&&message.matchCount>0){rule.status='active';rule.validatedAt=Date.now();rule.reason='revalidated_with_target';return {ok:true,data:{status:'active',reason:'revalidated_with_target'}};}
   return {ok:true,data:{status:rule.status,reason:rule.reason}};
 }
 if(message.type==='FG_RULE_DELETE'){const rule=H.settings.cosmeticFilters.rules.find(r=>r.id===message.id);if(rule){rule.status='deleted';H.bump('cosmetic');H.refresh();}return {ok:true,data:{deleted:true}};}
 if(message.type==='FG_COSMETIC_EVENT'){H.cosmeticEvents.push(message);if(message.kind==='applied')H.metrics.cosmeticApplied++;if(message.kind==='restored')H.metrics.cosmeticRestored++;if(message.kind==='rejected')H.metrics.cosmeticRejected++;if(message.kind==='breaker')H.metrics.breakerActivations++;return {ok:true,data:{}};}
 if(message.type==='FG_RECOVER_SITE'){H.settings.recoverySites=[...new Set([...H.settings.recoverySites,message.site])];H.bump('recovery');H.refresh();return {ok:true,data:{persisted:true,sites:H.settings.recoverySites,acknowledged:true,tabs:1}};}
 if(message.type==='FG_RESUME_SITE'){H.settings.recoverySites=H.settings.recoverySites.filter(s=>s!==message.site);H.bump('recovery');H.refresh();return {ok:true,data:{resumed:true,quarantined:H.settings.cosmeticFilters.rules.filter(r=>r.status==='quarantined').length}};}
 if(message.type==='FG_STATUS')return {ok:true,data:H.status()};
 if(message.type==='FG_PATCH_SETTINGS'){const domain=message.domain||'settings';H.bump(domain);H.settings=C.sanitizeSettings({...H.settings,...message.patch,revisions:H.settings.revisions,categories:{...H.settings.categories,...message.patch?.categories}});return {ok:true,data:{settings:C.clone(H.settings)}};}
 if(message.type==='FG_SET_KEY'){H.keyReady=true;H.hasVault=message.remember;return {ok:true,data:{saved:true}};}
 if(message.type==='FG_LOCK'){H.keyReady=false;return {ok:true,data:{}};}
 if(message.type==='FG_TEST_CONNECTION'){H.verifiedAt=Date.now();return {ok:true,data:{model:'jev-fixture-only',latencyMs:1,usage:{input_tokens:0,output_tokens:0},scores:{},decision:{action:'allow',reason:'Synthetic test fixture'}}};}
 if(message.type==='FG_EXPORT_SETTINGS')return {ok:true,data:{format:'feedgate-settings',version:4,settings:{...H.settings,sites:[],consent:false}}};
 if(message.type==='FG_TAB_COMMAND')return {ok:true,data:{}};
 return {ok:true,data:{}};
}},storage:{local:{get:async()=>({}),set:async()=>{},remove:async()=>{}},session:{get:async()=>({}),set:async()=>{}}},permissions:{request:async()=>!H.permissionDenied,remove:async()=>true,contains:async()=>!H.permissionDenied,getAll:async()=>({permissions:['storage','scripting','activeTab'],origins:H.permissionDenied?[]:['https://x.com/*','https://twitter.com/*']})},tabs:{getCurrent:async()=>({id:1,url:H.location.href}),create:async()=>({id:2}),sendMessage:async(_id,m)=>H.command(m.type),query:async()=>[{id:1,url:'https://x.com/home'}]}};
}'''

async def code(page,script,location=False):
    if location: await page.evaluate('(function(location){\n'+script+'\n})(harness.location)')
    else: await page.evaluate('(async()=>{\n'+re.sub(r"^import '\./.+';\n",'',script,flags=re.M)+'\n})()')

async def fixture(browser,html='',content=True,url='https://x.com/home'):
    page=await browser.new_page(viewport={'width':1300,'height':1050})
    await page.set_content('<!doctype html><style>body{font:16px system-ui;max-width:780px;margin:32px auto;background:#f5f5f0}article{padding:20px;margin:10px;border:1px solid #ccc;background:white}article a{font-size:12px}header{font-weight:700}input{display:block}</style>'+html)
    await code(page,source('core.js'));await page.evaluate(HARNESS)
    await page.evaluate('(url)=>{const u=new URL(url);Object.assign(harness.location,{protocol:u.protocol,hostname:u.hostname,pathname:u.pathname,href:url});harness.settings.sites=[FeedGateCore.siteForURL(url)];}',url)
    await code(page,source('adapters.js'),True)
    if content:await code(page,source('content.js'),True)
    return page

async def run_case(name,fn):
    started=time.monotonic()
    try:await fn();REPORT.append({'name':name,'status':'PASS','seconds':round(time.monotonic()-started,3)});print('PASS',name,flush=True)
    except Exception as e:
        REPORT.append({'name':name,'status':'FAIL','error':str(e)});print('FAIL',name,str(e),flush=True);raise

async def main():
    executable=os.environ.get('CHROMIUM_PATH') or ('/usr/lib/chromium/chromium' if Path('/usr/lib/chromium/chromium').exists() else shutil.which('chromium'))
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'])
        version=browser.version
        async def local_ad():
            pg=await fixture(browser,tweet('ad','Independent sponsor text','','fixture','data-promoted="true"')+tweet('good','Useful practical notes'))
            await pg.wait_for_function("document.querySelector('#ad').style.display==='none'")
            assert await pg.locator('#good').is_visible()
            await pg.locator('feedgate-card').get_by_role('button',name='Why?',exact=True).click()
            assert await pg.locator('feedgate-card').get_by_text('Platform-labelled ad',exact=True).is_visible()
            assert await pg.locator('feedgate-card').get_by_text('Verified platform ad label (x_data_promoted_attribute).',exact=True).is_visible()
            await pg.locator('feedgate-card').get_by_role('button',name='Show',exact=True).click()
            assert await pg.locator('#ad').is_visible()
            await pg.close()
        await run_case('local sponsored collapse, explanation and trusted Show click',local_ad)
        async def semantic():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE unsolicited content')+tweet('bait','BAIT_FIXTURE empty reactions')+tweet('good','Useful release notes'))
            await pg.wait_for_function("document.querySelector('#spam').style.display==='none' && document.querySelector('#bait').style.opacity==='0.28'")
            assert await pg.locator('#good').is_visible()
            assert await pg.locator('feedgate-card').count()==2
            await pg.close()
        await run_case('mock semantic scores cause collapse/dim; useful post remains visible',semantic)
        async def mutation():
            pg=await fixture(browser,tweet('first','Useful note'))
            await pg.wait_for_function('harness.requests.length===1')
            await pg.evaluate('(html)=>document.body.insertAdjacentHTML("beforeend",html)',tweet('second','SPAM_FIXTURE appended'))
            await pg.wait_for_function("document.querySelector('#second').style.display==='none'")
            assert await pg.evaluate('harness.requests.length')==2
            await pg.close()
        await run_case('MutationObserver detects appended feed posts',mutation)
        async def stale():
            pg=await fixture(browser,tweet('reuse','SPAM_FIXTURE old post'),content=False)
            await pg.evaluate('harness.delay=350');await code(pg,source('content.js'),True)
            await pg.wait_for_function('harness.requests.length===1')
            await pg.locator('#reuse [data-testid="tweetText"]').evaluate('(el)=>el.textContent="Useful replacement post"')
            await pg.locator('#reuse a').evaluate('(el)=>el.href="https://x.com/fixture/status/replacement"')
            await pg.wait_for_function('harness.requests.length===2');await pg.wait_for_timeout(500)
            assert await pg.locator('#reuse').is_visible();assert await pg.locator('feedgate-card').count()==0
            await pg.close()
        await run_case('recycled node ignores old in-flight spam result',stale)
        async def recycled_hidden():
            pg=await fixture(browser,tweet('reuse','SPAM_FIXTURE old post'))
            await pg.wait_for_function("document.querySelector('#reuse').style.display==='none'")
            await pg.locator('#reuse [data-testid="tweetText"]').evaluate('(el)=>el.textContent="Useful replacement"')
            await pg.wait_for_function("document.querySelector('#reuse').style.display!== 'none' && harness.requests.length===2")
            assert await pg.locator('#reuse').is_visible();await pg.close()
        await run_case('recycled previously hidden node restores before reclassification',recycled_hidden)
        async def failure():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE'),content=False);await pg.evaluate("harness.mode='offline'");await code(pg,source('content.js'),True)
            await pg.wait_for_function('harness.requests.length===1');await pg.wait_for_timeout(200)
            assert await pg.locator('#spam').is_visible();assert await pg.locator('feedgate-card').count()==0
            await pg.wait_for_timeout(400);assert await pg.evaluate('harness.requests.length')==1;await pg.close()
        await run_case('HTTP-error fixture fails open without a resubmission loop',failure)
        async def observation():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE','','fixture','data-promoted="true"'),content=False)
            await pg.evaluate("harness.settings.mode='observe'");await code(pg,source('content.js'),True);await pg.wait_for_function('harness.requests.length===1');await pg.wait_for_timeout(100)
            assert await pg.locator('#spam').is_visible()
            await pg.wait_for_function("document.querySelector('feedgate-card')!==null")
            text=await pg.evaluate("document.querySelector('feedgate-card').shadowRoot.textContent")
            assert 'Observe Only' in text,'observe mode explains what would happen without changing the page: '+text
            await pg.close()
        await run_case('observe mode preserves even explicitly sponsored content',observation)
        async def whitelist():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE',author='alice')+tweet('sponsor','Another promotion','','alice','data-promoted="true"'))
            await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===2")
            await pg.locator('feedgate-card').first.get_by_role('button',name='Allow author').click()
            await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===0")
            assert await pg.locator('#spam').is_visible();assert await pg.locator('#sponsor').is_visible();assert 'x:@alice' in await pg.evaluate('harness.settings.allowedAuthors');await pg.close()
        await run_case('author allowlist restores both semantic and local ad decisions',whitelist)
        async def private_text():
            pg=await fixture(browser,tweet('safe','Useful public post<input value="INPUT_SECRET"><textarea>TEXTAREA_SECRET</textarea><span hidden>HIDDEN_SECRET</span><span contenteditable="true">EDIT_SECRET</span>')+'<div role="dialog">'+tweet('private','DIALOG_SECRET')+'</div>')
            await pg.wait_for_function('harness.requests.length===1');data=await pg.evaluate('JSON.stringify(harness.requests)')
            for value in ['INPUT_SECRET','TEXTAREA_SECRET','HIDDEN_SECRET','EDIT_SECRET','DIALOG_SECRET']:assert value not in data,value
            await pg.close()
        await run_case('inputs, editors, hidden text and dialog posts are not extracted',private_text)
        async def private_route():
            pg=await fixture(browser,tweet('safe','Public post'));await pg.wait_for_function('harness.requests.length===1')
            await pg.evaluate("harness.location.href='https://x.com/messages';harness.location.pathname='/messages'")
            await pg.evaluate('(html)=>document.body.insertAdjacentHTML("beforeend",html)',tweet('private','PRIVATE_ROUTE_SECRET'))
            await pg.wait_for_timeout(850);assert await pg.evaluate('harness.requests.length')==1
            assert await pg.evaluate("harness.command('FG_GET_PAGE_STATE').enabled") is False;await pg.close()
        await run_case('SPA navigation to messages disables observation and extraction',private_route)
        async def cosmetic():
            pg=await fixture(browser,'<aside id="annoying">Sidebar promotion</aside>'+tweet('safe','Public note'),content=False)
            await pg.evaluate("harness.settings.cosmeticFilters={version:3,revision:0,rules:[FeedGateCore.sanitizeCosmeticRule({id:'r-annoy1234',host:'x.com',selector:'#annoying',status:'active',source:'picker',reason:'user_created',createdAt:1,validatedAt:1})]}")
            await code(pg,source('content.js'),True)
            await pg.wait_for_function("document.querySelector('#annoying').style.display==='none'")
            assert await pg.locator('feedgate-card').get_by_text('User cosmetic rule: Hidden by your cosmetic filter').count()==1
            await pg.locator('feedgate-card').get_by_role('button',name='Show',exact=True).click();assert await pg.locator('#annoying').is_visible();await pg.close()
        await run_case('an active cosmetic rule collapses a sidebar reversibly with an explicit reason',cosmetic)
        async def cosmetic_precedence():
            pg=await fixture(browser,tweet('local-post','Useful nonspam post',attr='class="custom-ad"'),content=False)
            await pg.evaluate("harness.delay=200;harness.settings.cosmeticFilters={version:3,revision:0,rules:[FeedGateCore.sanitizeCosmeticRule({id:'r-local1234',host:'x.com',selector:'.custom-ad',status:'active',source:'picker',reason:'user_created',createdAt:1,validatedAt:1})]}")
            await code(pg,source('content.js'),True)
            await pg.wait_for_function("document.querySelector('#local-post').style.display==='none'")
            await pg.wait_for_timeout(350)
            assert await pg.locator('#local-post').is_hidden()
            await pg.locator('#local-post').evaluate("el=>el.className='ordinary-post'")
            await pg.wait_for_function("document.querySelector('#local-post').style.display!=='none'")
            assert await pg.locator('#local-post').is_visible();await pg.close()
        await run_case('a cosmetic rule wins over pending inference and restores when the selector stops matching',cosmetic_precedence)

        async def picker():
            pg=await fixture(browser,'<aside id="pick-target">Click this unwanted panel</aside>'+tweet('good','Useful note'))
            await pg.wait_for_function('harness.requests.length===1');await pg.evaluate("harness.command('FG_PICK_ELEMENT')")
            await pg.locator('#pick-target').click()
            # v3 is transactional: the click opens a preview and saves nothing yet.
            create=pg.get_by_role('button',name='Create rule')
            await create.wait_for(state='visible')
            assert await pg.locator('text=Hides 1 element on this page.').count()==1
            assert 'FG_ADD_RULE' not in await pg.evaluate('harness.calls')
            assert await pg.locator('#pick-target').is_visible()
            await create.click()
            await pg.wait_for_function("harness.calls.includes('FG_ADD_RULE')")
            rules=await pg.evaluate('harness.settings.cosmeticFilters.rules')
            assert len(rules)==1 and rules[0]['selector']=='#pick-target' and rules[0]['status']=='active'
            await pg.wait_for_function("document.querySelector('#pick-target').style.display==='none'")
            # Undo from the toast removes the rule again.
            await pg.locator('feedgate-toast').get_by_role('button',name='Undo').click()
            await pg.wait_for_function("harness.settings.cosmeticFilters.rules[0].status==='deleted'")
            await pg.wait_for_function("document.querySelector('#pick-target').style.display!=='none'")
            await pg.close()
        await run_case('element picker previews before commit, saves one scoped rule and undo restores it',picker)
        async def restore_style():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE',attr='style="display:flex!important;opacity:0.8"'))
            await pg.wait_for_function("document.querySelector('#spam').style.display==='none'");await pg.evaluate("harness.command('FG_RESTORE_ALL')")
            assert await pg.locator('#spam').evaluate("el=>[el.style.display,el.style.getPropertyPriority('display'),el.style.opacity,el.hasAttribute('aria-hidden')]")==['flex','important','0.8',False];await pg.close()
        await run_case('restoring preserves original inline styles and accessibility attributes',restore_style)
        async def duplicate_injection():
            pg=await fixture(browser,tweet('good','A useful note'));await pg.wait_for_function('harness.requests.length===1');await code(pg,source('content.js'),True);await pg.wait_for_timeout(150);assert await pg.evaluate('harness.requests.length')==1;await pg.close()
        await run_case('re-injection does not duplicate observers or model calls',duplicate_injection)
        async def adapters():
            fixtures=[
                ('reddit','https://www.reddit.com/r/test','<shreddit-post id="r1" post-title="Specific title" author="fixture"><div slot="text-body">Useful Reddit body</div></shreddit-post>','Useful Reddit body'),
                ('linkedin','https://www.linkedin.com/feed/','<div class="feed-shared-update-v2" data-urn="urn:li:1"><span class="update-components-actor__title">Alice</span><div class="update-components-text">Useful LinkedIn body</div></div>','Useful LinkedIn body'),
                ('facebook','https://www.facebook.com/','<div role="feed"><div role="article"><h2>Alice</h2><div data-ad-preview="message">Useful Facebook body</div></div></div>','Useful Facebook body'),
                ('instagram','https://www.instagram.com/','<main><article><header><a href="/alice">Alice</a></header><h1>Useful Instagram caption</h1></article></main>','Useful Instagram caption')]
            for site,url,html,expected in fixtures:
                pg=await fixture(browser,html,content=False,url=url)
                values=await pg.evaluate('(site)=>FeedGateAdapters.collect(document,site).map(el=>FeedGateAdapters.extract(el,site))',site)
                assert len(values)==1,(site,values);assert expected in values[0]['text'];await pg.close()
        await run_case('Reddit/LinkedIn/Facebook/Instagram adapter fixtures extract expected posts',adapters)
        async def bfcache():
            pg=await fixture(browser,tweet('good','Useful note'));await pg.wait_for_function('harness.requests.length===1')
            await pg.evaluate("dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
            await pg.wait_for_function('harness.requests.length===2');await pg.close()
        await run_case('back-forward-cache lifecycle refreshes observers on pageshow',bfcache)
        async def options_ui():
            pg=await browser.new_page(viewport={'width':1440,'height':1100});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            await pg.set_content(shell('options.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS);await pg.evaluate('harness.settings.sites=[]');await code(pg,source('options.js'))
            await pg.wait_for_function("document.querySelectorAll('#sites .site').length===6")
            summary=await pg.locator('#feeds-summary').text_content()
            assert '0 selected' in summary and '6 permitted' in summary,(summary,)
            assert await pg.locator('#feeds-details').evaluate('el=>el.open') is False,'feeds start collapsed on a fresh v3 profile'
            assert await pg.locator('#enable-all').is_visible(),'the combined action stays outside the collapsed list'
            assert await pg.evaluate('harness.calls.filter(c=>c===\'FG_ADD_RULE\'||c===\'FG_TEST_CONNECTION\').length')==0
            assert await pg.locator('#key-badge').text_content()=='Key locked', (await pg.locator('#key-badge').text_content(), errors)
            await pg.screenshot(path=str(ROOT/'evidence/options-overview.png'),full_page=True)
            await pg.locator('[data-page="connection"]').click();await pg.wait_for_timeout(250);await pg.screenshot(path=str(ROOT/'evidence/options-connection.png'),full_page=True)
            await pg.locator('#api-key').fill('dummy-ui-test-key');await pg.locator('#key-form button[type="submit"]').click()
            await pg.wait_for_function("document.querySelector('#key-badge').textContent==='Key unlocked'")
            assert await pg.locator('#api-key').input_value()==''
            await pg.locator('#consent').check();assert await pg.evaluate('harness.settings.consent') is True
            await pg.locator('[data-page="policy"]').click();await pg.locator('[data-category-mode="feedSpam"]').select_option('dim');await pg.locator('#policy-form button[type="submit"]').click()
            assert await pg.evaluate('harness.settings.categories.feedSpam.mode')=='dim'
            await pg.wait_for_timeout(250);await pg.screenshot(path=str(ROOT/'evidence/options-policy.png'),full_page=True)
            await pg.locator('[data-page="overview"]').click()
            await pg.locator('#feeds-details summary').click()
            assert await pg.locator('#feeds-details').evaluate('el=>el.open') is True
            await pg.locator('[data-site="x"]').click()
            await pg.wait_for_function("harness.settings.sites.includes('x')")
            assert 'x' in await pg.evaluate('harness.settings.sites')
            assert not errors,errors;await pg.close()
        await run_case('options UI renders, clears key input and saves preferences through mocked messaging',options_ui)
        async def demo_ui():
            pg=await browser.new_page(viewport={'width':1260,'height':1100});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            await pg.set_content(shell('demo.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS)
            await pg.evaluate("Object.assign(harness.location,{protocol:'chrome-extension:',hostname:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',pathname:'/demo.html',href:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/demo.html'});harness.mode='offline'")
            await code(pg,source('adapters.js'),True);await code(pg,source('demo.js'));await code(pg,source('content.js'),True)
            await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===1")
            assert await pg.evaluate("FeedGateCore.VERSION")=='3.0.0'
            assert await pg.locator('feedgate-status').count()==0,'demo mode keeps the HUD out of the fixture'
            await pg.screenshot(path=str(ROOT/'evidence/test-feed-local.png'),full_page=True)
            await pg.locator('#demo-restore').click();await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===0")
            await pg.locator('#demo-rescan').click();await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===1")
            await pg.locator('#add-post').click();assert await pg.locator('article').count()==12
            assert not errors,errors;await pg.close()
        await run_case('test-feed UI supports Show all, Rescan and new posts without live inference',demo_ui)
        async def popup_ui():
            pg=await browser.new_page(viewport={'width':420,'height':760});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            await pg.set_content(shell('popup.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS);await code(pg,source('popup.js'))
            assert await pg.locator('#host').text_content()=='X'
            assert 'Open or refresh' in await pg.locator('#page-info').text_content()
            await pg.locator('#pause').click();assert await pg.evaluate('harness.settings.enabled') is False
            await pg.locator('#pause').click();assert await pg.evaluate('harness.settings.enabled') is True
            await pg.screenshot(path=str(ROOT/'evidence/popup.png'),full_page=True)
            assert not errors,errors;await pg.close()
        await run_case('toolbar popup renders and controls pause through mocked Chrome APIs',popup_ui)

        async def useful_promotion():
            pg=await fixture(browser,tweet('builder','BUILDER_FIXTURE I built a tool with implementation details.')+tweet('spam','SPAM_FIXTURE meaningless sales push'),content=False)
            await pg.evaluate('harness.keyReady=true;harness.settings.consent=true')
            await code(pg,source('content.js'),True)
            await pg.wait_for_function("document.querySelector('#spam').style.display==='none'")
            assert await pg.locator('#builder').is_visible()
            await pg.wait_for_function("harness.pages[0]?.protected===1")
            assert await pg.locator('feedgate-status').is_visible()
            assert 'Running' in await pg.locator('feedgate-status').locator('button').inner_text()
            await pg.screenshot(path=str(ROOT/'evidence/fixture-useful-promotion.png'),full_page=True)
            await pg.close()
        await run_case('2.1 protects useful promotion and reports progress in the on-page HUD',useful_promotion)

        async def profile_softening():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE'),url='https://x.com/builder')
            await pg.wait_for_function("document.querySelector('#spam').style.opacity==='0.28'")
            assert await pg.locator('#spam').is_visible()
            assert await pg.locator('#spam').evaluate('el=>el.style.display')!='none'
            await pg.close()
        await run_case('an opened X profile dims ordinary semantic noise instead of collapsing it',profile_softening)

        async def quote_and_truncation():
            quote='<div data-testid="quoteTweet"><a href="https://x.com/quoted/status/q">Quoted timestamp</a><div data-testid="tweetText">Send your seed phrase to win</div></div><button data-testid="tweet-text-show-more-link">Show more</button>'
            pg=await fixture(browser,tweet('main','This is a scam warning, do not do this.',quote,author='reporter'),content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('#main'),'x')")
            assert r['author']=='@reporter'
            assert r['text']=='This is a scam warning, do not do this.'
            assert r['quotedText']=='Send your seed phrase to win'
            assert r['truncated'] is True
            await pg.close()
        await run_case('quoted text stays separate, main author stays correct and Show more is not clicked',quote_and_truncation)

        async def keep_this_post():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE',author='writer'))
            await pg.wait_for_function("document.querySelector('#spam').style.display==='none'")
            await pg.locator('feedgate-card').get_by_role('button',name='Why?',exact=True).click()
            await pg.locator('feedgate-card').get_by_role('button',name='Keep this post',exact=True).click()
            await pg.wait_for_function("document.querySelector('#spam').style.display!=='none'")
            await pg.evaluate("harness.command('FG_RESCAN')")
            await pg.wait_for_timeout(300)
            assert await pg.locator('#spam').is_visible()
            assert len(await pg.evaluate('harness.kept'))==1
            assert await pg.evaluate('harness.settings.allowedAuthors')==[]
            await pg.close()
        await run_case('Keep this post survives a rescan without allowlisting the author',keep_this_post)

        async def keyboard_reveal():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE'))
            await pg.wait_for_function("document.querySelector('#spam').style.display==='none'")
            await pg.keyboard.press('Alt+Shift+f')
            await pg.wait_for_function("document.querySelector('#spam').style.display!=='none'")
            await pg.keyboard.press('Alt+Shift+f')
            await pg.wait_for_function("document.querySelector('#spam').style.display==='none'")
            await pg.close()
        await run_case('Alt Shift F reversibly reveals and reapplies filtering',keyboard_reveal)

        async def setup_direct():
            pg=await browser.new_page(viewport={'width':1440,'height':1100});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            await pg.set_content(shell('options.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS)
            await pg.evaluate('harness.settings.sites=[]');await code(pg,source('options.js'))
            await pg.locator('#setup-site').select_option('x')
            await pg.locator('#setup-key').fill('dummy-setup-key-not-live')
            await pg.locator('#setup-consent').check()
            await pg.locator('#setup-connect').click()
            await pg.wait_for_function("!document.querySelector('#setup-complete').classList.contains('hidden')")
            assert await pg.evaluate('harness.settings.sites')==['x']
            assert await pg.evaluate('harness.settings.preset')=='balanced'
            assert await pg.evaluate('harness.settings.consent') is True
            assert await pg.locator('#setup-key').input_value()==''
            assert await pg.locator('#key-badge').text_content()=='API verified'
            calls=await pg.evaluate('harness.calls')
            assert calls.index('FG_SET_KEY')<calls.index('FG_TEST_CONNECTION')
            assert all('BRIDGE' not in c and 'PAIR' not in c for c in calls)
            assert not errors,errors
            await pg.screenshot(path=str(ROOT/'evidence/setup-complete-fixture.png'),full_page=True)
            await pg.close()
        await run_case('Connect and start saves key, verifies provider and enables X without bridge messages',setup_direct)

        async def permission_denial():
            pg=await browser.new_page();await pg.set_content(shell('options.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS)
            await pg.evaluate('harness.settings.sites=[];harness.permissionDenied=true');await code(pg,source('options.js'))
            await pg.locator('#setup-key').fill('dummy-setup-key-not-live');await pg.locator('#setup-consent').check();await pg.locator('#setup-connect').click()
            await pg.wait_for_function("document.querySelector('#setup-status').textContent.includes('did not grant')")
            assert await pg.evaluate('harness.settings.sites')==[]
            assert 'FG_SET_KEY' not in await pg.evaluate('harness.calls')
            assert 'FG_TEST_CONNECTION' not in await pg.evaluate('harness.calls')
            assert await pg.locator('#setup-key').input_value()==''
            await pg.close()
        await run_case('denied setup permissions prevent key saving and network test',permission_denial)

        async def preset_and_export():
            pg=await browser.new_page(viewport={'width':1440,'height':1100});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            await pg.set_content(shell('options.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS)
            await pg.evaluate("harness.pages=[{site:'x',context:'feed',state:'ready',observed:12,pending:0,completed:12,kept:10,protected:4,collapsed:1,dimmed:1,errors:0}];window.savedBlobs=[];URL.createObjectURL=blob=>{window.savedBlobs.push(blob);return 'blob:synthetic-export';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){}")
            await code(pg,source('options.js'));await pg.locator('[data-page="policy"]').click()
            await pg.locator('[data-preset="aggressive"]').click()
            await pg.wait_for_function("harness.settings.preset==='aggressive'")
            assert await pg.evaluate('harness.settings.categories.bait.mode')=='collapse'
            await pg.locator('[data-preset="balanced"]').click()
            await pg.wait_for_function("harness.settings.categories.bait.mode==='dim'")
            await pg.locator('[data-page="review"]').click()
            assert 'detected 12' in await pg.locator('#page-reports').inner_text()
            await pg.locator('#export-diagnostics').click()
            await pg.wait_for_function('window.savedBlobs.length===1')
            data=await pg.evaluate('async()=>JSON.parse(await window.savedBlobs[0].text())')
            assert data['format']=='feedgate-diagnostics' and data['version']==5
            assert data['build']['detector']=='ad-3.0.0' and data['build']['release']=='3.0.0'
            assert not errors,errors
            await pg.screenshot(path=str(ROOT/'evidence/diagnostics-fixture.png'),full_page=True)
            await pg.close()
        await run_case('presets apply and diagnostic JSON export is constructed through the UI',preset_and_export)

        async def mobile_layout():
            pg=await browser.new_page(viewport={'width':390,'height':844});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            await pg.set_content(shell('options.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS)
            await pg.evaluate('harness.settings.sites=[]');await code(pg,source('options.js'))
            assert await pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            await pg.locator('[data-page="policy"]').click()
            assert await pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            assert not errors,errors;await pg.close()
        await run_case('settings and policy pages fit a narrow 390px viewport',mobile_layout)

        async def ad_name_not_marker():
            html='<article id="named-ad" data-testid="tweet"><div data-testid="User-Name"><span>Ad</span><span>Sponsored</span></div><a href="https://x.com/author/status/1">time</a><div data-testid="tweetText">A detailed implementation note.</div></article>'
            pg=await fixture(browser,html,content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('article'),'x')")
            assert r['sponsored'] is False;assert r['adEvidence']['status']!='verified';await pg.close()
        await run_case('display names containing Ad or Sponsored are not platform ad markers',ad_name_not_marker)

        async def quoted_ad_not_marker():
            extra='<div data-testid="quoteTweet"><span data-testid="promotedIndicator">Sponsored</span><div data-testid="tweetText">A quoted advertising example.</div></div>'
            pg=await fixture(browser,tweet('quotation','An explanation of this ad example.',extra),content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('article'),'x')")
            assert r['sponsored'] is False;assert r['quotedText']=='A quoted advertising example.'
            assert r['adEvidence']['status']=='ambiguous' and r['adEvidence']['scope']=='quote';await pg.close()
        await run_case('a sponsored marker inside a quoted post does not label the outer post as an ad',quoted_ad_not_marker)

        async def ad01_tracking_pipeline():
            extra='<div data-testid="placementTracking"></div><div data-testid="quoteTweet"><div data-testid="tweetText">Quoted claim about benchmarks</div><img src="x.png" alt="Chart"></div>'
            pg=await fixture(browser,tweet('organic','We reduced indexing time from 18 seconds to 2.4 seconds. Methods and repository inside.',extra),content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('article'),'x')")
            assert r['sponsored'] is False and r['adEvidence']['status']!='verified' and r['adEvidence']['markerKind']=='x_placement_tracking'
            await code(pg,source('content.js'),True);await pg.wait_for_function('harness.requests.length===1');await pg.wait_for_timeout(150)
            assert await pg.locator('#organic').is_visible();assert await pg.locator('feedgate-card').count()==0;await pg.close()
        await run_case('AD01/AD02: tracking wrappers, video and quoted media never verify an outer ad',ad01_tracking_pipeline)

        async def ad04_siblings():
            html=tweet('organic','A normal engineering discussion')+tweet('paid','A clearly purchased placement','','fixture','data-promoted="true"')
            pg=await fixture(browser,html,content=False)
            statuses=await pg.evaluate("[...document.querySelectorAll('article')].map(a=>FeedGateAdapters.extract(a,'x').adEvidence.status)")
            assert statuses==['none','verified'],statuses;await pg.close()
        await run_case('AD04: only the post that owns the marker is affected',ad04_siblings)

        async def ad05_labels_not_standalone():
            html='<article id="labels" data-testid="tweet"><header data-testid="User-Name">@author</header><a href="https://x.com/a/status/1">time</a><div data-testid="tweetText">Sponsored by nobody. Publicidad. A real engineering note.</div><a href="https://ads.example.com/" aria-label="Sponsored by ACME">partner</a><img alt="Advertisement banner" src="x.png"></article>'
            pg=await fixture(browser,html,content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('article'),'x')")
            assert r['sponsored'] is False and r['adEvidence']['status']!='verified';await pg.close()
        await run_case('AD05/AD09: words, links, alt text and unsupported labels are not standalone markers',ad05_labels_not_standalone)

        async def ad06_hidden_marker():
            html='<article id="hidden" data-testid="tweet"><div data-testid="tweetText">Ordinary content</div><span data-testid="promotedIndicator" style="display:none">Promoted</span><a href="https://x.com/h/status/6">t</a></article>'
            pg=await fixture(browser,html,content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('article'),'x')")
            assert r['sponsored'] is False and r['adEvidence']['status']!='verified';await pg.close()
        await run_case('AD06: hidden templates and menu-only labels are not rendered evidence',ad06_hidden_marker)

        async def ad08_strict_attributes():
            html=('<article id="a" data-testid="tweet" is-promoted="false"><div data-testid="tweetText">One</div><a href="https://x.com/a/status/1">t</a></article>'
                  '<article id="b" data-testid="tweet" is-promoted="mixed"><div data-testid="tweetText">Two</div><a href="https://x.com/b/status/2">t</a></article>'
                  '<article id="c" data-testid="tweet" data-promoted="false"><div data-testid="tweetText">Three</div><a href="https://x.com/c/status/3">t</a></article>'
                  '<article id="d" data-testid="tweet" is-promoted="true"><div data-testid="tweetText">Four</div><a href="https://x.com/d/status/4">t</a></article>')
            pg=await fixture(browser,html,content=False)
            out=await pg.evaluate("[...document.querySelectorAll('article')].map(a=>({s:FeedGateAdapters.extract(a,'x').adEvidence.status,k:FeedGateAdapters.extract(a,'x').adEvidence.markerKind}))")
            assert out[0]['s']=='none' and out[1]['s']!='verified' and out[2]['s']=='none',out
            assert out[3]['s']=='verified' and out[3]['k']=='x_is_promoted_attribute',out;await pg.close()
        await run_case('AD08: only documented true forms verify; false and unknown stay unverified',ad08_strict_attributes)

        async def ad10_offviewport():
            html=tweet('first','Top of the timeline')+'<div style="height:3000px"></div>'+tweet('far','Far below the fold','<span data-testid="promotedIndicator">Promoted</span>')
            pg=await fixture(browser,html,content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('#far'),'x')")
            assert r['sponsored'] is True and r['adEvidence']['markerKind']=='x_promoted_indicator';await pg.close()
        await run_case('AD10: a rendered marker outside the viewport is still rendered evidence',ad10_offviewport)

        async def ad11_marker_removed_restores():
            pg=await fixture(browser,tweet('promo','Independent sponsor text','','fixture','data-promoted="true"'))
            await pg.wait_for_function("document.querySelector('#promo').style.display==='none'")
            await pg.evaluate("document.querySelector('#promo').removeAttribute('data-promoted');document.querySelector('#promo [data-testid=\\\"tweetText\\\"]').textContent='An honest update after the placement ended.'")
            await pg.wait_for_function("document.querySelector('#promo').style.display!=='none'")
            assert await pg.locator('feedgate-card').count()==0;await pg.close()
        await run_case('AD11: a local ad action cannot survive the marker disappearing',ad11_marker_removed_restores)

        async def ad12_toggle_off_restores():
            pg=await fixture(browser,tweet('promo2','Independent sponsor text','','fixture','data-promoted="true"'))
            await pg.wait_for_function("document.querySelector('#promo2').style.display==='none'")
            await pg.evaluate('harness.settings.labelledAds=false;harness.refresh()')
            await pg.wait_for_function("document.querySelector('#promo2').style.display!=='none'");await pg.close()
        await run_case('AD12: switching local ad filtering off restores collapsed content',ad12_toggle_off_restores)

        async def ad13_no_self_loop():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE')+tweet('ad2','Independent sponsor text','','fixture','data-promoted="true"'))
            await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===2")
            before=await pg.evaluate('harness.requests.length');await pg.wait_for_timeout(600)
            assert await pg.evaluate('harness.requests.length')==before;await pg.close()
        await run_case('AD13: FeedGate UI mutations never trigger new classifications',ad13_no_self_loop)

        async def ad14_reddit():
            html=('<shreddit-ad-post id="r-ad"><div slot="credit-bar"><span>Promoted</span></div><div slot="text-body">A clearly labelled placement.</div></shreddit-ad-post>'
                  '<shreddit-post id="r-org"><div slot="credit-bar"><a href="/user/alice">alice</a></div><div slot="text-body">We discuss advertising practices in this thread.</div></shreddit-post>')
            pg=await fixture(browser,html,content=False,url='https://www.reddit.com/')
            a=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('#r-ad'),'reddit').adEvidence")
            o=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('#r-org'),'reddit').adEvidence")
            assert a['status']=='verified' and a['markerKind']=='reddit_ad_post',a
            assert o['status']!='verified',o;await pg.close()
        await run_case('AD14: Reddit uses its own platform rules, not borrowed X heuristics',ad14_reddit)

        async def ext01_reddit_title_dedupe():
            html='<shreddit-post id="r" post-title="Indexing benchmark results"><h1 slot="title">Indexing benchmark results</h1><div slot="text-body">Full methodology inside.</div></shreddit-post>'
            pg=await fixture(browser,html,content=False,url='https://www.reddit.com/')
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('#r'),'reddit')")
            assert r['text'].count('Indexing benchmark results')==1,r['text']
            assert 'Full methodology inside.' in r['text'];await pg.close()
        await run_case('EXT01: a Reddit title published twice in the DOM is extracted once',ext01_reddit_title_dedupe)

        async def ext03_limitations():
            html=('<article id="media" data-testid="tweet"><div data-testid="User-Name">@a</div><a href="https://x.com/a/status/9">t</a><img src="x.png" alt="A latency chart"></article>'
                  '<shreddit-post id="title" post-title="Only a title"></shreddit-post>')
            pg=await fixture(browser,html,content=False,url='https://www.reddit.com/')
            m=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('#media'),'x')")
            t=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('#title'),'reddit')")
            assert 'A latency chart' in m['mediaAlt'] and m['text']==''
            assert t['text']=='Only a title';await pg.close()
        await run_case('EXT03: media-only and title-only posts keep documented limitations',ext03_limitations)

        async def ext04_ui_excluded():
            extra='<feedgate-card>CARD_SECRET</feedgate-card><div data-fg-ui="1">UI_SECRET</div>'
            pg=await fixture(browser,tweet('one','Useful engineering note',extra),content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('article'),'x')")
            assert 'CARD_SECRET' not in json.dumps(r) and 'UI_SECRET' not in json.dumps(r);await pg.close()
        await run_case('EXT04: FeedGate UI text never enters the inference payload',ext04_ui_excluded)

        async def ext05_stable():
            pg=await fixture(browser,tweet('stable','A stable extraction fixture'),content=False)
            a=await pg.evaluate("JSON.stringify(FeedGateAdapters.extract(document.querySelector('article'),'x'))")
            b=await pg.evaluate("JSON.stringify(FeedGateAdapters.extract(document.querySelector('article'),'x'))")
            assert a==b;await pg.close()
        await run_case('EXT05: repeated extraction of an unchanged post is stable',ext05_stable)

        async def stale_version():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE'),content=False)
            await pg.evaluate("harness.appVersion='2.1.0'");await code(pg,source('content.js'),True);await pg.wait_for_timeout(300)
            assert await pg.locator('#spam').is_visible();assert await pg.evaluate('harness.requests.length')==0
            assert 'reload' in (await pg.locator('feedgate-status').locator('button').inner_text());await pg.close()
        await run_case('a content script from an older release refuses to filter and asks for a reload',stale_version)

        async def ui_hud_trio():
            pg=await fixture(browser,tweet('good','A calm useful note'))
            await pg.wait_for_function("document.querySelector('feedgate-status')!==null")
            pill=pg.locator('feedgate-status').locator('button')
            assert 'FeedGate' in await pill.inner_text()
            await pg.screenshot(path=str(ROOT/'evidence/hud-compact.png'),full_page=True)
            await pill.click()
            panel=pg.locator('feedgate-status').get_by_role('button',name='–')
            await panel.wait_for(state='visible')
            await pg.wait_for_function("harness.settings.hudMode==='expanded'")
            await pg.screenshot(path=str(ROOT/'evidence/hud-expanded.png'),full_page=True)
            await panel.click()
            await pg.wait_for_function("harness.settings.hudMode==='compact'")
            await pg.locator('feedgate-status').locator('button').click()
            await pg.wait_for_function("harness.settings.hudMode==='expanded'")
            await pg.locator('feedgate-status').get_by_role('button',name='×').click()
            await pg.wait_for_function("harness.settings.hudMode==='hidden'")
            assert await pg.locator('feedgate-status').count()==0,'closing hides the panel completely'
            await pg.screenshot(path=str(ROOT/'evidence/hud-hidden.png'),full_page=True)
            await pg.close()
        await run_case('UI01/UI02/UI03: compact pill, expanded controls and genuinely hidden status',ui_hud_trio)

        async def ui_hidden_keeps_filtering():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE while hidden')+tweet('good','Visible good post'))
            await pg.wait_for_function("document.querySelector('#spam').style.display==='none'")
            await pg.locator('feedgate-status').locator('button').click()
            await pg.wait_for_function("harness.settings.hudMode==='expanded'")
            await pg.locator('feedgate-status').get_by_role('button',name='×').click()
            await pg.wait_for_function("harness.settings.hudMode==='hidden'")
            await pg.evaluate('(html)=>document.body.insertAdjacentHTML("beforeend",html)',tweet('late','SPAM_FIXTURE appended later'))
            await pg.wait_for_function("document.querySelector('#late').style.display==='none'")
            assert await pg.locator('feedgate-status').count()==0,'routine filtering must not recreate a hidden panel'
            assert await pg.evaluate('harness.requests.length')==3
            await pg.close()
        await run_case('UI04/UI10: hidden status never returns on its own and filtering continues',ui_hidden_keeps_filtering)

        async def ui_status_reopen_via_settings():
            pg=await fixture(browser,tweet('good','A calm useful note'))
            await pg.wait_for_function("document.querySelector('feedgate-status')!==null")
            await pg.locator('feedgate-status').locator('button').click()
            await pg.wait_for_function("harness.settings.hudMode==='expanded'")
            await pg.locator('feedgate-status').get_by_role('button',name='×').click()
            await pg.wait_for_function("harness.settings.hudMode==='hidden'")
            await pg.evaluate("harness.settings.hudMode='compact';harness.command('FG_CONFIG_CHANGED')")
            await pg.wait_for_function("document.querySelector('feedgate-status')!==null")
            assert await pg.locator('feedgate-status').locator('button').is_visible()
            await pg.close()
        await run_case('UI05/UI06: an explicit later change reopens exactly one status host',ui_status_reopen_via_settings)

        async def picker_rejects_structural_targets():
            html='<main id="primary" style="min-height:220px;background:#eee">Primary content column</main><div id="feedgate-zone" style="min-height:80px"></div>'+tweet('a','First post')+tweet('b','Second post')+tweet('c','Third post')
            pg=await fixture(browser,html)
            await pg.wait_for_function('harness.requests.length===3')
            await pg.evaluate("harness.command('FG_PICK_ELEMENT')")
            await pg.locator('#primary').click()
            await pg.wait_for_function("document.querySelector('feedgate-toast')!==null")
            toast=await pg.evaluate("document.querySelector('feedgate-toast').shadowRoot.textContent")
            assert 'cannot be hidden safely' in toast,toast
            await pg.screenshot(path=str(ROOT/'evidence/picker-rejected-root.png'),full_page=True)
            assert 'FG_ADD_RULE' not in await pg.evaluate('harness.calls')
            await pg.close()
        await run_case('PICK01/PICK02: a primary content root is rejected before anything is saved',picker_rejects_structural_targets)

        async def picker_rejects_own_ui():
            pg=await fixture(browser,tweet('good','A calm useful note'))
            await pg.wait_for_function("document.querySelector('feedgate-status')!==null")
            await pg.evaluate("harness.command('FG_PICK_ELEMENT')")
            await pg.locator('feedgate-status').locator('button').first.click()
            await pg.wait_for_timeout(250)
            assert 'FG_ADD_RULE' not in await pg.evaluate('harness.calls')
            assert await pg.get_by_role('button',name='Create rule').count()==0
            await pg.close()
        await run_case('PICK05: FeedGate UI cannot be picked into a hiding rule',picker_rejects_own_ui)

        async def picker_rejects_aggregate_sets():
            blobs=''.join(f'<p class="blob">noise {i}</p>' for i in range(90))
            pg=await fixture(browser,tweet('good','Useful post')+blobs)
            await pg.wait_for_function('harness.requests.length===1')
            await pg.evaluate("harness.command('FG_PICK_ELEMENT')")
            await pg.locator('.blob').first.click()
            await pg.wait_for_function("document.querySelector('feedgate-toast')!==null")
            toast=await pg.evaluate("document.querySelector('feedgate-toast').shadowRoot.textContent")
            assert 'cannot be hidden safely' in toast,toast
            assert 'FG_ADD_RULE' not in await pg.evaluate('harness.calls')
            await pg.close()
        await run_case('PICK03: an aggregate match set that would hide most of the page is rejected',picker_rejects_aggregate_sets)

        async def picker_tall_target_allowed():
            pg=await fixture(browser,tweet('good','Useful post')+'<aside id="tall-card" style="height:2600px;background:#eee">A tall but single card</aside>')
            await pg.wait_for_function('harness.requests.length===1')
            await pg.evaluate("harness.command('FG_PICK_ELEMENT')")
            await pg.locator('#tall-card').click()
            await pg.wait_for_function("document.querySelector('feedgate-toast')===null")
            create=pg.get_by_role('button',name='Create rule')
            await create.wait_for(timeout=3000)
            assert 'taller than the viewport' in await pg.locator('text=Note: one match is taller').inner_text()
            await pg.screenshot(path=str(ROOT/'evidence/picker-preview.png'),full_page=True)
            await create.click()
            await pg.wait_for_function("harness.calls.includes('FG_ADD_RULE')")
            await pg.close()
        await run_case('PICK04: a tall legitimate card is flagged by geometry, not rejected',picker_tall_target_allowed)

        async def picker_runtime_quarantine():
            wrapper='<div id="zone" style="border:1px solid #999">'+tweet('a','First')+tweet('b','Second')+tweet('c','Third')+'</div>'
            pg=await fixture(browser,wrapper+'<aside id="side">Sidebar</aside>',content=False)
            await pg.evaluate("harness.settings.cosmeticFilters={version:3,revision:0,rules:[FeedGateCore.sanitizeCosmeticRule({id:'r-zone1234',host:'x.com',selector:'#zone',status:'active',source:'legacy',reason:'legacy_unvalidated',createdAt:1,validatedAt:1})]}")
            await code(pg,source('content.js'),True)
            await pg.wait_for_function("harness.cosmeticEvents.some(e=>e.kind==='rejected')")
            assert await pg.locator('#zone').is_visible(),'a rule that now matches a multi-item container must not hide it'
            assert await pg.locator('#zone').evaluate('el=>el.style.display')!='none'
            await pg.close()
        await run_case('PICK13: a previously safe selector that now matches a container is quarantined before applying',picker_runtime_quarantine)

        async def cosmetic_and_semantic_same_post():
            pg=await fixture(browser,tweet('both','SPAM_FIXTURE with a local rule',attr='class="hidden-by-me"'))
            await pg.evaluate("harness.settings.cosmeticFilters={version:3,revision:0,rules:[FeedGateCore.sanitizeCosmeticRule({id:'r-both1234',host:'x.com',selector:'.hidden-by-me',status:'active',source:'picker',reason:'user_created',createdAt:1,validatedAt:1})]}")
            await pg.evaluate("harness.command('FG_CONFIG_CHANGED')")
            await pg.wait_for_function("document.querySelector('#both').style.display==='none'")
            await pg.wait_for_function("document.querySelector('feedgate-card')!==null")
            cards=await pg.evaluate("[...document.querySelectorAll('feedgate-card')].map(c=>c.shadowRoot.textContent).join(' ')")
            assert 'User cosmetic rule' in cards and 'Semantic filter' not in cards,cards
            await pg.evaluate("harness.settings.cosmeticFilters.rules[0].status='disabled';harness.command('FG_CONFIG_CHANGED')")
            await pg.wait_for_function("document.querySelector('#both').style.display==='none'")
            await pg.wait_for_timeout(300)
            cards=await pg.evaluate("[...document.querySelectorAll('feedgate-card')].map(c=>c.shadowRoot.textContent).join(' ')")
            assert 'Semantic filter' in cards,cards
            await pg.close()
        await run_case('PICK18/PICK19: rule and model ownership stay separate on one element',cosmetic_and_semantic_same_post)

        async def loop_breaker_contains_runaway():
            junk=''.join(f'<div class="junk">junk {i}</div>' for i in range(60))
            pg=await fixture(browser,junk+tweet('good','Useful post'),content=False)
            await pg.evaluate("harness.settings.cosmeticFilters={version:3,revision:0,rules:[FeedGateCore.sanitizeCosmeticRule({id:'r-junk1234',host:'x.com',selector:'.junk',status:'active',source:'picker',reason:'user_created',createdAt:1,validatedAt:1})]}")
            await code(pg,source('content.js'),True)
            await pg.wait_for_function("harness.cosmeticEvents.some(e=>e.kind==='breaker')")
            assert await pg.locator('.junk').first.is_visible(),'the breaker must restore the effects it cannot attribute'
            await pg.close()
        await run_case('LOOP04: the bounded circuit breaker contains a runaway self-write storm',loop_breaker_contains_runaway)

        async def loop_reinjection_single_controller():
            pg=await fixture(browser,tweet('good','A calm useful note'))
            await pg.wait_for_function('harness.requests.length===1')
            await code(pg,source('content.js'),True)
            await pg.wait_for_timeout(200)
            state=await pg.evaluate("harness.command('FG_GET_PAGE_STATE')")
            assert state['controllerCount']==1
            assert await pg.evaluate('harness.requests.length')==1
            assert await pg.locator('feedgate-status').count()==1,'one status host per document'
            await pg.close()
        await run_case('UI06/LOOP06: re-injection keeps exactly one controller and one status host',loop_reinjection_single_controller)

        async def wykop_fixture():
            html=('<section id="link-8014301" class="link-block stream-home" data-scroll-closest="true">'
                  '<article><header><h2 class="heading"><a href="/link/8014301/w-ios-27-zmiany-xd">W iOS 27 zmiany w dźwiękach alarmów — co dokładnie się zmienia</a></h2></header>'
                  '<div class="content"><section class="info"><p><span>Wystarczyły niemal dwie dekady, żeby osobny suwak głośności alarmów trafił do systemu.</span></p></section></div>'
                  '<li class="expired-pub"><div class="button expired-pub-icon"><p class="popper">To Znalezisko było promowane w ramach usługi Wykop Poleca.</p></div></li>'
                  '</article></section>'
                  '<section id="comment-87631081" class="entry stream-microblog" data-scroll-closest="true"><section class="entry-content"><div class="wrapper"><p>Krótki wpis z polskimi znakami: żółć, źródło, ćwicz.</p></div></section>'
                  '<a class="username" href="/ludzie/Tired_">Tired_</a></section>'
                  '<section id="comment-999" class="entry reply"><section class="entry-content"><div class="wrapper">A comment reply that must never be extracted.</div></section></section>')
            pg=await fixture(browser,html,content=False,url='https://wykop.pl/')
            values=await pg.evaluate("FeedGateAdapters.collect(document,'wykop').map(el=>FeedGateAdapters.extract(el,'wykop'))")
            assert len(values)==2,values
            link,entry=values
            assert link['kind']=='link' and entry['kind']=='entry'
            assert 'W iOS 27' in link['text'] and link['text'].count('W iOS 27')==1
            assert 'Wystarczyły niemal dwie dekady' in link['text']
            assert link['adEvidence']['status']=='ambiguous' and link['adEvidence']['markerKind']=='wykop_expired_promotion_note'
            assert link['sponsored'] is False
            assert entry['kind']=='entry' and 'żółć' in entry['text']
            assert 'must never be extracted' not in json.dumps(values)
            await pg.screenshot(path=str(ROOT/'evidence/wykop-fixture.png'),full_page=True)
            await pg.close()
        await run_case('WYK01/WYK02/WYK07/WYK11: Wykop link and entry fixtures stay separate, Polish text intact and the Poleca note is not a verified ad',wykop_fixture)

        async def wykop_policy_and_privacy():
            html=('<section id="link-900" class="link-block stream-home"><article><header><h2 class="heading"><a href="/link/900/promowany">Promowany artykuł techniczny</a></h2></header>'
                  '<div class="content"><section class="info"><p><span>Rzetelny opis narzędzia i wyników.</span></p></section></div></article></section>')
            pg=await fixture(browser,html,content=False,url='https://wykop.pl/')
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('#link-900'),'wykop')")
            decision=await pg.evaluate('(record)=>FeedGateCore.decide(FeedGateCore.sanitizeRecord(record,\'wykop\'),null,FeedGateCore.sanitizeSettings({...FeedGateCore.DEFAULTS,sites:["wykop"]}))',r)
            assert decision['rule']!='platform_labelled_ad',decision
            assert await pg.evaluate("FeedGateCore.isPrivateRoute('https://wykop.pl/logowanie')") is True
            assert await pg.evaluate("FeedGateCore.siteForURL('https://wykop.pl/')")=='wykop'
            await pg.close()
        await run_case('WYK09: an unverified Wykop placement is never labelled a platform ad and auth routes stay private',wykop_policy_and_privacy)

        await browser.close()
    report={'scope':'Real Chromium DOM; mocked Chrome APIs, page location and Jev responses. No extension installed; no live API or signed-in feeds tested.','browser':version,'results':REPORT,'passed':sum(r['status']=='PASS' for r in REPORT)}
    (ROOT/'evidence/browser-dom-tests.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':report['passed'],'browser':version}))

if __name__=='__main__':
    try:asyncio.run(main())
    finally:
        if any(r['status']=='FAIL' for r in REPORT):(ROOT/'evidence/browser-dom-failure.json').write_text(json.dumps(REPORT,indent=2),encoding='utf-8')
