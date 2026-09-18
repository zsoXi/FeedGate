/* SPDX-License-Identifier: GPL-3.0-or-later */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import '../src/core.js';
import '../src/typesafe.js';
const C=globalThis.FeedGateCore,root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const examples=(await readFile(path.join(root,'evaluation/examples.jsonl'),'utf8')).trim().split(/\r?\n/).map(x=>JSON.parse(x));
if(!examples.length || examples.length>50 || examples.some(x=>!x.id || !x.text || !Array.isArray(x.expectedActions) || x.expectedActions.some(a=>!['allow','dim','collapse'].includes(a))))throw new Error('Invalid evaluation corpus');
if(!process.argv.includes('--live')) {
  console.log(`Validated ${examples.length} fictional cases. No network requests made.`);
  console.log('Live evaluation requires --live and TYPESAFE_API_KEY in the environment. It may incur provider charges.');
  process.exit(0);
}
const key=process.env.TYPESAFE_API_KEY || '';
if(!C.validKey(key)){console.error('A valid TYPESAFE_API_KEY environment variable is required. Do not paste keys into source files.');process.exit(2);}
const settings=C.clone(C.DEFAULTS);settings.consent=true;
const report={version:C.VERSION,rubric:C.RUBRIC_VERSION,createdAt:new Date().toISOString(),source:'live TypeSafe API',corpus:'fictional hand-labelled examples; not representative accuracy',attempts:0,inputTokens:0,outputTokens:0,results:[]};
for(const example of examples){
  const record=C.sanitizeRecord({id:example.id,text:example.text,quotedText:example.quotedText||'',truncated:!!example.truncated,context:example.context||'feed'},'x');
  report.attempts++;
  try{
    const result=await globalThis.FeedGateTypeSafe.evaluate(key,C.buildRequest(record,settings));
    const decision=C.decide(record,result,settings);
    report.inputTokens+=result.usage.input_tokens;report.outputTokens+=result.usage.output_tokens;
    report.results.push({id:example.id,expectedActions:example.expectedActions,action:decision.action,met:example.expectedActions.includes(decision.action),scores:result.scores,model:result.model,usage:result.usage,latencyMs:result.latencyMs});
  }catch(error){
    const safe=C.userError(error);report.results.push({id:example.id,error:safe.code,met:false});
    // Avoid repeated charges or auth/rate-limit loops after a failed transport.
    report.stoppedAfterTransportError=true;break;
  }
}
report.matched=report.results.filter(x=>x.met).length;
report.completed=report.results.filter(x=>!x.error).length;
const dir=path.join(root,'evaluation/results');await mkdir(dir,{recursive:true});
const out=path.join(dir,`live-${Date.now()}.json`);await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(`Completed ${report.completed}/${examples.length}; policy targets matched ${report.matched}/${report.completed}. Input tokens ${report.inputTokens}.`);
console.log(`Saved ${path.relative(root,out)}. No raw post text or key was written to the report.`);
if(report.stoppedAfterTransportError)process.exitCode=2;
