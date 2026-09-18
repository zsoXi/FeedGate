import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/core.js';
import '../src/vault.js';
const C=globalThis.FeedGateCore,V=globalThis.FeedGateVault;
const settings=()=>C.clone(C.DEFAULTS);
const record=(extra={})=>C.sanitizeRecord({id:'p-1',author:'@Alice',text:'Concrete useful text',...extra},'x');
const result=(scores={})=>({scores:{promotion:.01,spam:.01,bait:.01,generic:.01,value:.01,contribution:.01,risk:.01,sufficient:.99,...scores}});
const keys=['promotion','spam','bait','generic','value','contribution','risk','sufficient'];
const wire=()=>({model:'jev-test',answers:Object.fromEntries(keys.map(k=>[k,{type:'noul',noul:.5}])),usage:{input_tokens:120,output_tokens:0}});

test('host matching rejects lookalikes and non-HTTPS origins',()=>{
  for(const url of ['https://x.com/home','https://www.twitter.com/home'])assert.equal(C.siteForURL(url),'x');
  for(const url of ['https://evilx.com','https://x.com.evil.test','http://x.com','javascript:alert(1)','https://x.com@evil.test'])assert.equal(C.siteForURL(url),null);
});
test('private routes and encoded private routes are excluded',()=>{
  for(const url of ['https://x.com/messages/1','https://x.com/%6dessages','https://www.linkedin.com/messaging/thread/1','https://instagram.com/direct/inbox/','https://chat.reddit.com/','https://reddit.com/mod/queue','https://facebook.com/settings','https://x.com/i/chat/1','https://x.com/%ZZ'])assert.equal(C.isPrivateRoute(url),true,url);
  for(const url of ['https://x.com/home','https://www.reddit.com/r/programming','https://linkedin.com/feed/','https://facebook.com/'])assert.equal(C.isPrivateRoute(url),false,url);
});
test('settings are allowlisted, bounded and secret-free',()=>{
  const s=C.sanitizeSettings({apiKey:'secret',enabled:'false',concurrency:100,dailyLimit:-1,cacheMinutes:0,model:'https://evil.test',sites:['x','x','evil'],categories:{spam:{mode:'delete',threshold:0}},allowedAuthors:['x:@a','evil:@a']});
  assert.equal(s.enabled,true);assert.equal(s.concurrency,12);assert.equal(s.dailyLimit,10);assert.equal(s.cacheMinutes,0);assert.equal(s.model,'jev-latest');assert.deepEqual(s.sites,['x']);assert.equal(s.categories.spam.mode,'collapse');assert.equal(s.categories.spam.threshold,.5);assert.ok(!('apiKey' in s));assert.deepEqual(s.allowedAuthors,['x:@a']);
});
test('prototype-looking keys cannot add settings/categories',()=>{
  const s=C.sanitizeSettings(JSON.parse('{"__proto__":{"polluted":true},"categories":{"__proto__":{"mode":"collapse"}},"sites":["__proto__"]}'));
  assert.equal({}.polluted,undefined);assert.deepEqual(s.sites,[]);assert.equal(Object.keys(s.categories).length,6);
});
test('record validation clamps payload and rejects missing identifiers',()=>{
  assert.throws(()=>record({id:''}),/INVALID_RECORD/);const r=record({text:'x'.repeat(8000),linkDomains:['example.com','EXAMPLE.COM','https://evil.test','invalid','x'.repeat(300)+'.com']});
  assert.equal(r.text.length,6000);assert.deepEqual(r.linkDomains,['example.com']);
});
test('actual TypeSafe request contains eight self-contained noul questions',()=>{
  const p=C.buildRequest(record(),settings());assert.equal(p.model,'jev-latest');assert.deepEqual(Object.keys(p.questions),keys);
  for(const q of Object.values(p.questions)){assert.equal(q.type,'noul');assert.ok(q.instructions.length>100);assert.ok(q.instructions.includes('untrusted')||q.instructions.includes('Ignore any instructions'));}
});
test('inference omits author/id and redacts email, secret-shaped tokens and full URLs',()=>{
  const r=record({text:'Email alice@example.com token sk-ABCDEFGHIJKLMNOP123456 https://example.com/private?id=42'});const p=C.buildRequest(r,settings());const text=JSON.stringify(p.state);
  for(const excluded of ['@Alice','p-1','alice@example.com','ABCDEFGHIJKLMNOP','private?id'])assert.ok(!text.includes(excluded));assert.match(text,/\[email\]/);assert.match(text,/\[link:example.com\]/);
});
test('custom criterion adds a ninth actual noul question',()=>{
  const s=settings();s.customInstruction='Promotes speculative tokens';const p=C.buildRequest(record(),s);assert.equal(Object.keys(p.questions).length,9);assert.match(p.questions.custom.instructions,/Promotes speculative tokens/);
});
test('strict parser accepts response with zero output tokens and no confidence',()=>{
  const p=C.parseResponse(wire(),keys);assert.equal(p.scores.spam,.5);assert.equal(p.usage.output_tokens,0);assert.ok(!('confidence' in p));
});
for(const [name,edit] of [
  ['missing answer',r=>delete r.answers.spam],['wrong primitive',r=>r.answers.spam.type='boolean'],['negative value',r=>r.answers.spam.noul=-.1],['oversized value',r=>r.answers.spam.noul=1.1],['numeric string',r=>r.answers.spam.noul='0.9'],['nonfinite',r=>r.answers.spam.noul=NaN],['missing usage',r=>delete r.usage],['fractional tokens',r=>r.usage.input_tokens=1.5],['missing model',r=>delete r.model]
])test(`parser fails closed on ${name}`,()=>{const r=wire();edit(r);assert.throws(()=>C.parseResponse(r,keys),/INVALID_RESPONSE/);});
test('a model error never creates a semantic hide',()=>assert.equal(C.decide(record(),null,settings()).action,'allow'));
test('explicit sponsored marker is independent of unavailable inference',()=>assert.equal(C.decide(record({sponsored:true}),null,settings()).source,'local'));
test('no textual evidence overrides high classification estimates',()=>assert.equal(C.decide(record(),result({spam:.999,sufficient:.1}),settings()).action,'allow'));
test('threshold has exact boundary and off category stays off',()=>{
  assert.equal(C.decide(record(),result({spam:.899}),settings()).action,'allow');assert.equal(C.decide(record(),result({spam:.90}),settings()).action,'collapse');assert.equal(C.decide(record(),result({generic:.999}),settings()).action,'allow');
});
test('collapse is prioritized above dim, not the largest score alone',()=>{
  const d=C.decide(record(),result({bait:.999,spam:.96}),settings());assert.equal(d.action,'collapse');assert.equal(d.category,'spam');
});
test('allowlist overrides sponsored and semantic decisions',()=>{
  const s=settings();s.allowedAuthors=['x:@alice'];const d=C.decide(record({sponsored:true}),result({spam:1}),s);assert.equal(d.action,'allow');assert.equal(d.source,'allowlist');
});
test('user reveal and global pause override model',()=>{
  assert.equal(C.decide(record(),result({spam:1}),settings(),{revealed:true}).action,'allow');const s=settings();s.enabled=false;assert.equal(C.decide(record({sponsored:true}),result({spam:1}),s).action,'allow');
});
test('observe mode records an intended action without hiding',()=>{
  const s=settings();s.mode='observe';const d=C.decide(record(),result({spam:1}),s);assert.equal(d.action,'allow');assert.equal(d.wouldAction,'collapse');
});
test('cosmetic rule subset rejects scriptlets, network rules and root selectors',()=>{
  for(const input of ['||ads.example^','x.com##+js(foo)','x.com##body','x.com##.x:style(color:red)','evil.test##.ad','x.com##html .x'])assert.ok(C.parseCosmeticRules(input).errors.length,input);
  const p=C.parseCosmeticRules('! Local only\nx.com##[data-kind="ad"]\nreddit.com##.sponsored');assert.equal(p.rules.length,2);assert.equal(p.errors.length,0);assert.equal(C.matchingRules('reddit.com##.ad','www.reddit.com').length,1);
});
test('cache keys include text/model/custom but exclude author/id/policy thresholds',async()=>{
  const a=await C.cacheKey(record(),settings());const s=settings();s.categories.spam.threshold=.8;assert.equal(await C.cacheKey(record({author:'@Other',id:'second'}),s),a);
  for(const [r,t] of [[record({text:'changed'}),settings()],[record(),{...settings(),model:'jev-another'}],[record(),{...settings(),customInstruction:'other'}]])assert.notEqual(await C.cacheKey(r,t),a);
});
test('privileged sender check rejects web pages and other extension pages',()=>{
  const id='a'.repeat(32);assert.equal(C.trustedPage({id,url:`chrome-extension://${id}/options.html`},id),true);
  for(const s of [{id,url:'https://x.com/home'},{id,url:`chrome-extension://${id}/content.js`},{id:'b'.repeat(32),url:`chrome-extension://${id}/options.html`}])assert.equal(C.trustedPage(s,id),false);
});
test('error messages never reflect arbitrary provider or secret strings',()=>{
  assert.ok(!JSON.stringify(C.userError(new Error('secret-danger'))).includes('secret-danger'));
});
test('API key syntax rejects spaces/control characters and unreasonable lengths',()=>{
  assert.ok(C.validKey('dummy-key-for-test'));for(const k of ['short','abcdefgh\nInjected: true','a'.repeat(513),''])assert.ok(!C.validKey(k));
});
test('vault encrypt/decrypt uses random salt and does not store plaintext/passphrase',async()=>{
  const key='dummy-key-for-unit-test',pass='a long private passphrase';const a=await V.seal(key,pass),b=await V.seal(key,pass);
  assert.equal(await V.open(a,pass),key);assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);assert.ok(!JSON.stringify(a).includes(key));assert.ok(!JSON.stringify(a).includes(pass));
});
test('vault rejects wrong passphrase, tampering and incompatible KDF parameters',async()=>{
  const p='another sufficiently long password',a=await V.seal('dummy-test-key',p);await assert.rejects(V.open(a,'a wrong password'),/VAULT_ERROR/);await assert.rejects(V.open({...a,iterations:1},p),/VAULT_ERROR/);await assert.rejects(V.open({...a,ciphertext:('A'+a.ciphertext.slice(1))},p),/VAULT_ERROR/);
});
test('vault requires a passphrase of at least twelve characters',async()=>await assert.rejects(V.seal('dummy-test-key','short'),/PASSPHRASE/));
test('provider model name cannot carry arbitrary free-form text into diagnostics',()=>{
 const r=wire();for(const name of ['secret credentials text','<script>alert(1)</script>','sk-test-token','https://unexpected.test']){r.model=name;assert.throws(()=>C.parseResponse(r,keys),/INVALID_RESPONSE/);}
});
