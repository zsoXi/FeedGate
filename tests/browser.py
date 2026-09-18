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
const H=window.harness={settings:C.clone(C.DEFAULTS),requests:[],listeners:[],mode:'success',delay:0,keyReady:false,hasVault:false,verifiedAt:0,kept:[],pages:[],permissionDenied:false,metrics:{decisions:0,protected:0,usefulPromotions:0,requests:0,filterDecisions:0,lastLatencyMs:0,classified:0,inputTokens:0,outputTokens:0,cacheHits:0,errors:0},log:[],calls:[]};
H.settings.sites=['x'];
H.location={protocol:'https:',hostname:'x.com',pathname:'/home',href:'https://x.com/home'};
H.command=type=>{let result;for(const fn of H.listeners)fn({type},{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},r=>result=r);return result;};
H.refresh=()=>H.command('FG_CONFIG_CHANGED');
H.status=()=>({settings:C.clone(H.settings),keyReady:H.keyReady,authRejected:false,hasVault:H.hasVault,metrics:H.metrics,daily:{requests:H.requests.length},log:H.log,verifiedAt:H.verifiedAt,keptPosts:H.kept.length,pages:H.pages});
window.chrome={runtime:{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',onMessage:{addListener:fn=>H.listeners.push(fn)},openOptionsPage:async()=>{},sendMessage:async message=>{
 H.calls.push(message.type);
 if(message.type==='FG_GET_CONFIG')return {ok:true,data:{settings:C.clone(H.settings),keyReady:H.keyReady}};
 if(message.type==='FG_CLASSIFY'){
   const r=structuredClone(message.record),delay=H.delay,mode=H.mode;H.requests.push(r);
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   const scores={unwantedAd:r.text.includes('BUILDER_FIXTURE')?.9:.01,feedSpam:r.text.includes('SPAM_FIXTURE')?.99:.01,bait:r.text.includes('BAIT_FIXTURE')?.99:.01,lowSignal:.01,useful:r.text.includes('BUILDER_FIXTURE')?.95:.1,original:r.text.includes('BUILDER_FIXTURE')?.9:.1,risk:.01,sufficient:.99};
   const result=mode==='success'?{model:'synthetic-DOM-fixture',scores,usage:{input_tokens:0,output_tokens:0},latencyMs:delay}:null;
   return {ok:true,data:{result,decision:C.decide(r,result,H.settings,{revealed:H.kept.includes(r.id)}),...(mode==='success'?{}:{error:{code:'NETWORK',message:'Simulated offline'}})}};
 }
 if(message.type==='FG_KEEP_POST'){H.kept.push(message.record.id);H.refresh();return {ok:true,data:{saved:true}};}
 if(message.type==='FG_PAGE_STATS'){H.pages=[{...message.stats,site:'x',context:'feed'}];return {ok:true,data:{}};}
 if(message.type==='FG_DIAGNOSTICS')return {ok:true,data:{format:'feedgate-diagnostics',version:3,pages:H.pages}};
 if(message.type==='FG_ALLOW_AUTHOR'){H.settings.allowedAuthors.push(C.authorKey('x',message.author));H.refresh();return {ok:true,data:{}};}
 if(message.type==='FG_ADD_RULE'){H.settings.cosmeticRules+='\nx.com##'+message.selector;H.refresh();return {ok:true,data:{}};}
 if(message.type==='FG_STATUS')return {ok:true,data:H.status()};
 if(message.type==='FG_PATCH_SETTINGS'){H.settings=C.sanitizeSettings({...H.settings,...message.patch,categories:{...H.settings.categories,...message.patch?.categories}});return {ok:true,data:{settings:C.clone(H.settings)}};}
 if(message.type==='FG_SET_KEY'){H.keyReady=true;H.hasVault=message.remember;return {ok:true,data:{saved:true}};}
 if(message.type==='FG_LOCK'){H.keyReady=false;return {ok:true,data:{}};}
 if(message.type==='FG_TEST_CONNECTION'){H.verifiedAt=Date.now();return {ok:true,data:{model:'jev-fixture-only',latencyMs:1,usage:{input_tokens:0,output_tokens:0},scores:{},decision:{action:'allow',reason:'Synthetic test fixture'}}};}
 if(message.type==='FG_EXPORT_SETTINGS')return {ok:true,data:{format:'feedgate-settings',version:3,settings:{...H.settings,sites:[],consent:false}}};
 return {ok:true,data:{}};
}},permissions:{request:async()=>!H.permissionDenied,remove:async()=>true},tabs:{getCurrent:async()=>({id:1}),create:async()=>({id:2}),sendMessage:async(_id,m)=>H.command(m.type),query:async()=>[{id:1,url:'https://x.com/home'}]}};
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
            pg=await fixture(browser,tweet('ad','Independent sponsor text','<span>Sponsored</span>')+tweet('good','Useful practical notes'))
            await pg.wait_for_function("document.querySelector('#ad').style.display==='none'")
            assert await pg.locator('#good').is_visible()
            await pg.locator('feedgate-card').get_by_role('button',name='Why?',exact=True).click()
            assert await pg.locator('feedgate-card').get_by_text('Platform-labelled ad',exact=True).is_visible()
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
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE','<span>Sponsored</span>'),content=False)
            await pg.evaluate("harness.settings.mode='observe'");await code(pg,source('content.js'),True);await pg.wait_for_function('harness.requests.length===1');await pg.wait_for_timeout(100)
            assert await pg.locator('#spam').is_visible();assert await pg.locator('feedgate-card').count()==0;await pg.close()
        await run_case('observe mode preserves even explicitly sponsored content',observation)
        async def whitelist():
            pg=await fixture(browser,tweet('spam','SPAM_FIXTURE',author='alice')+tweet('sponsor','Another promotion','<span>Sponsored</span>',author='alice'))
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
            await pg.evaluate("harness.settings.cosmeticRules='x.com###annoying'");await code(pg,source('content.js'),True)
            await pg.wait_for_function("document.querySelector('#annoying').style.display==='none'")
            await pg.locator('feedgate-card').get_by_role('button',name='Show',exact=True).click();assert await pg.locator('#annoying').is_visible();await pg.close()
        await run_case('domain##selector rule collapses a sidebar reversibly',cosmetic)
        async def cosmetic_precedence():
            pg=await fixture(browser,tweet('local-post','Useful nonspam post',attr='class="custom-ad"'),content=False)
            await pg.evaluate("harness.settings.cosmeticRules='x.com##.custom-ad';harness.delay=200")
            await code(pg,source('content.js'),True)
            await pg.wait_for_function("document.querySelector('#local-post').style.display==='none'")
            await pg.wait_for_timeout(350)
            assert await pg.locator('#local-post').is_hidden()
            await pg.locator('#local-post').evaluate("el=>el.className='ordinary-post'")
            await pg.wait_for_function("document.querySelector('#local-post').style.display!=='none'")
            assert await pg.locator('#local-post').is_visible();await pg.close()
        await run_case('manual post filter wins over pending inference and restores after selector stops matching',cosmetic_precedence)

        async def picker():
            pg=await fixture(browser,'<aside id="pick-target">Click this unwanted panel</aside>'+tweet('good','Useful note'))
            await pg.wait_for_function('harness.requests.length===1');await pg.evaluate("harness.command('FG_PICK_ELEMENT')")
            await pg.locator('#pick-target').click();await pg.wait_for_function("harness.settings.cosmeticRules.includes('#pick-target')")
            await pg.wait_for_function("document.querySelector('#pick-target').style.display==='none'");await pg.close()
        await run_case('element picker trusted click creates a scoped local rule',picker)
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
            assert await pg.locator('#sites .site').count()==5
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
            await pg.locator('[data-page="overview"]').click();await pg.locator('[data-site="x"]').click();assert 'x' in await pg.evaluate('harness.settings.sites')
            assert not errors,errors;await pg.close()
        await run_case('options UI renders, clears key input and saves preferences through mocked messaging',options_ui)
        async def demo_ui():
            pg=await browser.new_page(viewport={'width':1260,'height':1100});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            await pg.set_content(shell('demo.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS)
            await pg.evaluate("Object.assign(harness.location,{protocol:'chrome-extension:',hostname:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',pathname:'/demo.html',href:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/demo.html'});harness.mode='offline'")
            await code(pg,source('adapters.js'),True);await code(pg,source('demo.js'));await code(pg,source('content.js'),True)
            await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===1")
            await pg.screenshot(path=str(ROOT/'evidence/test-feed-local.png'),full_page=True)
            await pg.locator('#demo-restore').click();await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===0")
            await pg.locator('#demo-rescan').click();await pg.wait_for_function("document.querySelectorAll('feedgate-card').length===1")
            await pg.locator('#add-post').click();assert await pg.locator('article').count()==12
            assert not errors,errors;await pg.close()
        await run_case('test-feed UI supports Show all, Rescan and new posts without live inference',demo_ui)
        async def popup_ui():
            pg=await browser.new_page(viewport={'width':420,'height':760});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
            await pg.set_content(shell('popup.html'));await code(pg,source('core.js'));await pg.evaluate(HARNESS);await code(pg,source('popup.js'))
            assert await pg.locator('#host').text_content()=='x.com'
            assert 'Local rules only' in await pg.locator('#page-info').text_content()
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
            assert data['format']=='feedgate-diagnostics' and data['version']==3
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
            assert r['sponsored'] is False;await pg.close()
        await run_case('display names containing Ad or Sponsored are not platform ad markers',ad_name_not_marker)

        async def quoted_ad_not_marker():
            extra='<div data-testid="quoteTweet"><span data-testid="promotedIndicator">Sponsored</span><div data-testid="tweetText">A quoted advertising example.</div></div>'
            pg=await fixture(browser,tweet('quotation','An explanation of this ad example.',extra),content=False)
            r=await pg.evaluate("FeedGateAdapters.extract(document.querySelector('article'),'x')")
            assert r['sponsored'] is False;assert r['quotedText']=='A quoted advertising example.';await pg.close()
        await run_case('a sponsored marker inside a quoted post does not label the outer post as an ad',quoted_ad_not_marker)

        await browser.close()
    report={'scope':'Real Chromium DOM; mocked Chrome APIs, page location and Jev responses. No extension installed; no live API or signed-in feeds tested.','browser':version,'results':REPORT,'passed':sum(r['status']=='PASS' for r in REPORT)}
    (ROOT/'evidence/browser-dom-tests.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':report['passed'],'browser':version}))

if __name__=='__main__':
    try:asyncio.run(main())
    finally:
        if any(r['status']=='FAIL' for r in REPORT):(ROOT/'evidence/browser-dom-failure.json').write_text(json.dumps(REPORT,indent=2),encoding='utf-8')
