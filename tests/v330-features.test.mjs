import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/core.js';
import {createWorker,post,sender,sleep} from './worker-harness.mjs';

const C=globalThis.FeedGateCore;
const KEYS=['unwantedAd','feedSpam','bait','lowSignal','useful','original','risk','sufficient','topic'];
const result=(extra={})=>({
  model:'jev-test-fixture',
  scores:Object.fromEntries(KEYS.map((k)=>[k,k==='sufficient'?0.99:0.01]).concat(Object.entries(extra))),
  usage:{input_tokens:1,output_tokens:0},
  latencyMs:1,
});

test('A1: concurrent author mutes keep every author (atomic read-modify-write)',async()=>{
  const w=await createWorker();
  await w.enable();
  await Promise.all([
    w.ok({type:'FG_MUTE_AUTHOR',author:'@alpha'},sender),
    w.ok({type:'FG_MUTE_AUTHOR',author:'@beta'},sender),
  ]);
  const s=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(s.settings.blockedAuthors.slice().sort(),['x:@alpha','x:@beta']);
});

test('A1: sequential changes of the same author settle on the last write',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.ok({type:'FG_MUTE_AUTHOR',author:'@one'},sender);
  await w.ok({type:'FG_ALLOW_AUTHOR',author:'@one'},sender);
  await w.ok({type:'FG_MUTE_AUTHOR',author:'@one'},sender);
  const s=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(s.settings.allowedAuthors,[]);
  assert.deepEqual(s.settings.blockedAuthors,['x:@one']);
});

test('A2: undo restores the exact previous state (mute and allow)',async()=>{
  const w=await createWorker();
  await w.enable();
  const first=await w.ok({type:'FG_MUTE_AUTHOR',author:'@u1'},sender);
  assert.equal(first.previous,'none');
  assert.equal(first.applied,'blocked');
  const undo=await w.ok({type:'FG_AUTHOR_UNDO',author:'@u1',previous:first.previous,applied:first.applied},sender);
  assert.equal(undo.saved,true);
  let s=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(s.settings.blockedAuthors,[]);
  assert.deepEqual(s.settings.allowedAuthors,[]);

  await w.ok({type:'FG_MUTE_AUTHOR',author:'@u1'},sender);
  const second=await w.ok({type:'FG_ALLOW_AUTHOR',author:'@u1'},sender);
  assert.equal(second.previous,'blocked');
  assert.equal(second.applied,'allowed');
  const undo2=await w.ok({type:'FG_AUTHOR_UNDO',author:'@u1',previous:'blocked',applied:'allowed'},sender);
  assert.equal(undo2.saved,true);
  s=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(s.settings.blockedAuthors,['x:@u1']);
  assert.deepEqual(s.settings.allowedAuthors,[]);
});

test('A2: an outdated undo never overwrites a newer decision',async()=>{
  const w=await createWorker();
  await w.enable();
  const first=await w.ok({type:'FG_MUTE_AUTHOR',author:'@old'},sender);
  await w.ok({type:'FG_ALLOW_AUTHOR',author:'@old'},sender);
  const stale=await w.ok({type:'FG_AUTHOR_UNDO',author:'@old',previous:first.previous,applied:first.applied},sender);
  assert.equal(stale.saved,false);
  assert.equal(stale.stale,true);
  const s=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(s.settings.allowedAuthors,['x:@old']);
  assert.deepEqual(s.settings.blockedAuthors,[]);
});

test('A2: undo for one author does not disturb another author',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.ok({type:'FG_MUTE_AUTHOR',author:'@keep'},sender);
  const m=await w.ok({type:'FG_MUTE_AUTHOR',author:'@drop'},sender);
  await w.ok({type:'FG_AUTHOR_UNDO',author:'@drop',previous:m.previous,applied:m.applied},sender);
  const s=await w.ok({type:'FG_STATUS'});
  assert.deepEqual(s.settings.blockedAuthors,['x:@keep']);
});

test('A3: display-name-only records never match author lists',()=>{
  const nameOnly=C.sanitizeRecord({site:'linkedin',author:'Jan Kowalski',text:'A substantive post with real detail.'},'linkedin');
  assert.equal(nameOnly.authorId,'');
  assert.equal(nameOnly.authorNameOnly,true);
  const named=C.sanitizeRecord({site:'linkedin',author:'Jan Kowalski',authorId:'in:jan-kowalski-123',text:'Another substantive post.'},'linkedin');
  assert.equal(named.authorNameOnly,false);
  assert.equal(named.authorId,'in:jan-kowalski-123');

  const settings=C.sanitizeSettings({...C.DEFAULTS,blockedAuthors:['linkedin:in:jan-kowalski-123','linkedin:jan kowalski']});
  const quiet=C.decide(nameOnly,result(),settings);
  assert.notEqual(quiet.rule,'author_muted');
  const matched=C.decide(named,result(),settings);
  assert.equal(matched.rule,'author_muted');
  assert.equal(matched.source,'author');
  assert.equal(matched.action,'collapse');
});

test('A3: the same display name with a different profile id stays a different author',()=>{
  const a=C.sanitizeRecord({site:'linkedin',author:'Jan Kowalski',authorId:'in:jan-kowalski-123',text:'First post body text.'},'linkedin');
  const b=C.sanitizeRecord({site:'linkedin',author:'Jan Kowalski',authorId:'in:jan-kowalski-999',text:'Second post body text.'},'linkedin');
  const ka=C.authorKey(a.site,a.authorId);
  const kb=C.authorKey(b.site,b.authorId);
  assert.notEqual(ka,kb);
  const settings=C.sanitizeSettings({...C.DEFAULTS,blockedAuthors:[ka]});
  assert.equal(C.decide(a,result(),settings).rule,'author_muted');
  assert.notEqual(C.decide(b,result(),settings).rule,'author_muted');
});

test('B5: a muted topic collapses matching posts through the semantic path',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.ok({type:'FG_TOPIC_ADD',topic:{label:'crypto gambling',scope:'site',until:0}},sender);
  const d=await w.classify(post('TOPIC_FIXTURE something about the muted subject','t1'));
  assert.equal(d.decision.action,'collapse');
  assert.equal(d.decision.rule,'topic_muted');
  assert.equal(d.decision.source,'topic');
  assert.equal(d.decision.category,'topic');
});

test('B5: a passing mention of a muted topic keeps the post visible',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.ok({type:'FG_TOPIC_ADD',topic:{label:'crypto gambling',scope:'site',until:0}},sender);
  const d=await w.classify(post('Useful fixture','t2'));
  assert.equal(d.decision.action,'allow');
  assert.notEqual(d.decision.rule,'topic_muted');
});

test('B5: an expired topic stops hiding posts',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.ok({type:'FG_TOPIC_ADD',topic:{label:'old subject',scope:'site',until:Date.now()-1000,createdAt:Date.now()-100000}},sender);
  const d=await w.classify(post('TOPIC_FIXTURE still around','t3'));
  assert.equal(d.decision.action,'allow');
  assert.notEqual(d.decision.rule,'topic_muted');
});

test('B5: keeping a post wins over an active topic mute',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.ok({type:'FG_TOPIC_ADD',topic:{label:'crypto gambling',scope:'site',until:0}},sender);
  const r=post('TOPIC_FIXTURE kept by the user','t4');
  await w.ok({type:'FG_KEEP_POST',record:r},sender);
  const d=await w.classify(r);
  assert.equal(d.decision.rule,'kept_by_you');
  assert.equal(d.decision.action,'allow');
});

test('B5: deleting a topic restores matching posts',async()=>{
  const w=await createWorker();
  await w.enable();
  const added=await w.ok({type:'FG_TOPIC_ADD',topic:{label:'crypto gambling',scope:'site',until:0}},sender);
  const first=await w.classify(post('TOPIC_FIXTURE payload','t5'));
  assert.equal(first.decision.action,'collapse');
  await w.ok({type:'FG_TOPIC_DELETE',id:added.topic.id},sender);
  const second=await w.classify(post('TOPIC_FIXTURE payload','t5'));
  assert.equal(second.decision.action,'allow');
});

test('B5: editing a topic invalidates cached decisions',async()=>{
  const w=await createWorker();
  await w.enable();
  const added=await w.ok({type:'FG_TOPIC_ADD',topic:{label:'crypto gambling',scope:'site',until:0}},sender);
  await w.classify(post('TOPIC_FIXTURE payload','t6'));
  const before=w.calls.length;
  await w.ok({type:'FG_TOPIC_UPDATE',id:added.topic.id,patch:{label:'crypto betting'}});
  const after=await w.ok({type:'FG_STATUS'});
  assert.equal(after.settings.topics[0].label,'crypto betting');
  await w.classify(post('TOPIC_FIXTURE payload','t6'));
  assert.ok(w.calls.length>before,'a changed topic set must invalidate the cache key');
});

test('B5: topic rules are validated and bounded',async()=>{
  const w=await createWorker();
  await w.enable();
  await assert.rejects(w.ok({type:'FG_TOPIC_ADD',topic:{label:''}},sender),/INVALID_RECORD/);
  for(let i=0;i<C.TOPICS_MAX;i+=1)await w.ok({type:'FG_TOPIC_ADD',topic:{label:'subject number '+i,scope:'site',until:0}},sender);
  await assert.rejects(w.ok({type:'FG_TOPIC_ADD',topic:{label:'one too many'}},sender),/TOPIC_LIMIT/);
});

test('B6: duplicate detection uses signatures and similarity',()=>{
  assert.equal(C.tokenSignature('Hello   WORLD, hello world!'),C.tokenSignature('world hello'));
  assert.ok(C.tokenSimilarity('alpha beta gamma delta epsilon zeta','alpha beta gamma delta epsilon eta')>0.5);
  assert.equal(C.tokenSimilarity('alpha beta','gamma delta'),0);
});

test('B7: usage counters separate attempts, classifications and cache hits',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.classify(post('Useful fixture','c1'));
  await w.classify(post('Useful fixture','c1'));
  const s=await w.ok({type:'FG_STATUS'});
  assert.equal(s.metrics.requests,1);
  assert.equal(s.metrics.classified,1);
  assert.equal(s.metrics.cacheHits,1);
  assert.equal(s.metrics.decisions,2);
});

test('B7: the daily counter survives a worker restart',async()=>{
  const w=await createWorker();
  await w.enable();
  await w.classify(post('Useful fixture','c2'));
  const before=await w.ok({type:'FG_STATUS'});
  assert.equal(before.daily.requests,1);
  const w2=await createWorker({local:w.local,session:w.session});
  const after=await w2.ok({type:'FG_STATUS'});
  assert.equal(after.daily.requests,1);
});

test('B7: topic management spends no provider requests',async()=>{
  const w=await createWorker();
  await w.enable();
  const added=await w.ok({type:'FG_TOPIC_ADD',topic:{label:'some subject here',scope:'site',until:0}},sender);
  await w.ok({type:'FG_TOPIC_UPDATE',id:added.topic.id,patch:{label:'renamed subject'}});
  await w.ok({type:'FG_TOPIC_DELETE',id:added.topic.id});
  assert.equal(w.calls.length,0);
});
