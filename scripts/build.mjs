import {cp,mkdir,rm,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out=path.join(root,'extension');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await cp(path.join(root,'static'),out,{recursive:true});
for(const name of await readdir(path.join(root,'src')))if(name.endsWith('.js'))await cp(path.join(root,'src',name),path.join(out,name));
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md']){try{await cp(path.join(root,name),path.join(out,name));}catch{}}
const manifest=JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8'));
console.log(`Built FeedGate ${manifest.version} in extension/. No dependencies or network access required.`);
