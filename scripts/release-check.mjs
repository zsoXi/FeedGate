/* SPDX-License-Identifier: GPL-3.0-or-later */
import assert from 'node:assert/strict';
import {readdir,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import '../src/core.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),out=path.join(root,'extension');
const read=p=>readFile(path.join(root,p));
const manifest=JSON.parse(await read('extension/manifest.json'));
const pkg=JSON.parse(await read('package.json'));const checks=[];
function check(name,fn){fn();checks.push({name,passed:true});}
check('Single 3.3.0 version',()=>{assert.equal(pkg.version,'3.3.0');assert.equal(manifest.version,pkg.version);assert.equal(globalThis.FeedGateCore.VERSION,pkg.version);});
check('Manifest V3 and module worker',()=>{assert.equal(manifest.manifest_version,3);assert.equal(manifest.background.type,'module');assert.equal(manifest.background.service_worker,'background.js');});
check('Limited permissions and fixed provider host',()=>{assert.deepEqual(manifest.permissions,['storage','scripting','activeTab']);assert.deepEqual(manifest.host_permissions,['https://api.typesafe.ai/*']);assert.ok(!JSON.stringify(manifest).includes('<all_urls>'));assert.ok(manifest.optional_host_permissions.includes('https://wykop.pl/*')&&manifest.optional_host_permissions.includes('https://*.wykop.pl/*'));assert.equal(manifest.incognito,'not_allowed');assert.ok(!manifest.externally_connectable);});
const required=['manifest.json',manifest.background.service_worker,manifest.action.default_popup,manifest.options_ui.page,...Object.values(manifest.icons)];
for(const file of new Set(required))assert.ok((await stat(path.join(out,file))).isFile(),`Missing manifest asset ${file}`);
checks.push({name:'Manifest assets exist',passed:true});
async function files(dir,prefix=''){let found=[];for(const ent of await readdir(dir,{withFileTypes:true})){const rel=prefix+ent.name;if(ent.isDirectory())found.push(...await files(path.join(dir,ent.name),rel+'/'));else if(ent.isFile())found.push(rel);else throw new Error('Unexpected non-regular release file');}return found.sort();}
for(const name of await files(path.join(root,'static')))assert.deepEqual(await read(`static/${name}`),await read(`extension/${name}`),`Static build mismatch: ${name}`);
for(const name of (await readdir(path.join(root,'src'))).filter(x=>x.endsWith('.js')))assert.deepEqual(await read(`src/${name}`),await read(`extension/${name}`),`Source build mismatch: ${name}`);
checks.push({name:'Ready-made assets match current source and static inputs',passed:true});
const build=JSON.parse((await read('extension/build.json')).toString());
const buildHash=createHash('sha256');
const inputs=[...(await files(path.join(root,'static'))).map(n=>'static/'+n),...(await files(path.join(root,'src'))).map(n=>'src/'+n)].sort();
for(const name of inputs)buildHash.update(name+'\0').update(await read(name)).update('\0');
assert.ok((await stat(path.join(out,'build.json'))).isFile(),'Missing build.json');
assert.equal(build.release,pkg.version,'build.json release must match package.json version');
assert.equal(build.buildId,buildHash.digest('hex').slice(0,12),'build.json buildId must match current sources');
checks.push({name:'Packaged build.json matches current version and sources',passed:true});
const names=await files(out);
check('No bridge, executable installer or key file in runtime',()=>{assert.ok(names.every(n=>!/(^|\/)(bridge|node_modules)(\/|$)|\.(?:cmd|bat|ps1|exe|pem|key)$|(^|\/)\.env/i.test(n)));});
const js=(await Promise.all(names.filter(n=>n.endsWith('.js')).map(n=>read(`extension/${n}`)))).join('\n');
check('No localhost transport or dynamic executable source',()=>{assert.ok(!/https?:\/\/(?:localhost|127\.0\.0\.1)|\beval\s*\(|new\s+Function\s*\(/.test(js));assert.ok(js.includes('https://api.typesafe.ai/v1/systemone'));});
for(const n of names.filter(x=>x.endsWith('.html'))){const text=(await read(`extension/${n}`)).toString();assert.ok(!/<script[^>]+src=["']https?:/i.test(text));for(const match of text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))assert.ok(names.includes(match[1]),`Missing script ${match[1]}`);}
checks.push({name:'Extension pages reference packaged scripts',passed:true});
const runtimeHashes=[];for(const name of names){const bytes=await read(`extension/${name}`);runtimeHashes.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await mkdir(path.join(root,'evidence'),{recursive:true});
await writeFile(path.join(root,'evidence/release-checks.json'),JSON.stringify({version:pkg.version,createdAt:new Date().toISOString(),scope:'Static packaging integrity only; not native installation, live provider validation or a security audit',checks,runtimeHashes},null,2)+'\n');
console.log(`${checks.length} release integrity checks passed; ${runtimeHashes.length} runtime file hashes recorded.`);
