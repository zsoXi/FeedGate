import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
let errors=0;
for(const folder of ['src','scripts','tests'])for(const entry of await readdir(folder))if(/\.(m?js)$/.test(entry)){
 const r=spawnSync(process.execPath,['--check',`${folder}/${entry}`],{encoding:'utf8'});
 if(r.status!==0){console.error(r.stderr);errors++;}
}
if(errors)process.exit(1);
console.log('JavaScript syntax checks passed.');
