import {cp,mkdir,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out=path.join(root,'extension');
async function walk(dir,prefix=''){let found=[];for(const ent of await readdir(dir,{withFileTypes:true})){const rel=prefix+ent.name;if(ent.isDirectory())found=found.concat(await walk(path.join(dir,ent.name),rel+'/'));else if(ent.isFile())found.push(rel);}return found;}
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await cp(path.join(root,'static'),out,{recursive:true});
for(const name of await readdir(path.join(root,'src')))if(name.endsWith('.js'))await cp(path.join(root,'src',name),path.join(out,name));
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md']){try{await cp(path.join(root,name),path.join(out,name));}catch{}}
const manifest=JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8'));
const names=[...(await walk(path.join(root,'static'))).map(n=>'static/'+n),...(await walk(path.join(root,'src'))).map(n=>'src/'+n)].sort();
const hash=createHash('sha256');
for(const name of names)hash.update(name+'\0').update(await readFile(path.join(root,name))).update('\0');
const build={release:manifest.version,buildId:hash.digest('hex').slice(0,12),builtAt:new Date().toISOString()};
await writeFile(path.join(out,'build.json'),JSON.stringify(build,null,2)+'\n');
console.log(`Built FeedGate ${manifest.version} in extension/ (build ${build.buildId}). No dependencies or network access required.`);
