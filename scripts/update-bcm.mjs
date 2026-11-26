import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const key=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const fail=message=>{throw new Error(message)};
const args=process.argv.slice(2),index=args.indexOf('--input');
if(index<0||!args[index+1])fail('Usage: node scripts/update-bcm.mjs --input /absolute/path/bcm.json [--check]');
const input=JSON.parse(fs.readFileSync(args[index+1],'utf8'));
if(!['https://m.bc01.com/wave/5','https://m.bc01.com/wave/6'].includes(input.sourceUrl)||input.sample!==false)fail('Require verified authenticated BCM source; sample pages must not be imported.');
const retrieved=new Date(input.retrievedAt),now=new Date();
if(!Number.isFinite(+retrieved)||+retrieved>+now+60000||+now-retrieved>2*3600000)fail('retrievedAt must be the actual recent retrieval time.');
if(!Array.isArray(input.observations)||!input.observations.length)fail('No observations to update.');
const target=path.join(root,'data/surf.json'),data=JSON.parse(fs.readFileSync(target,'utf8')),seen=new Set(),updated=[],skipped=[];
for(const record of input.observations){
 if(seen.has(record.id))fail('Duplicate point: '+record.id);seen.add(record.id);
 const point=data.spots.find(p=>p.id===record.id);if(!point)fail('Unknown point: '+record.id);if(point.bcmDataOnly||point.bcmUnavailable||!point.bcmUrl)fail('Model-only point has no observed BCM score: '+record.id);
 const at=new Date(record.updatedAt);
 if(!Number.isFinite(+at)||record.date!==key(at)||record.date!==key(retrieved)||+at>+retrieved+60000)fail('Require a verified observation for today, not yesterday: '+record.id);
 if(!Number.isInteger(record.score)||record.score<0||record.score>100||typeof record.size!=='string'||!record.size.trim())fail('Invalid score or size: '+record.id);
 const wind=record.wind;
 if(!wind||typeof wind.direction!=='string'||typeof wind.strength!=='string'||typeof wind.relative!=='string'||wind.source!=='BCM')fail('Require BCM wind direction, strength, relative and source: '+record.id);
 if(wind.speedMps!==null&&(!Number.isFinite(wind.speedMps)||wind.speedMps<0))fail('Wind speed must be a sourced number or null.');
 const previous=+new Date(point.observation?.updatedAt??0);
 if(+at<previous){skipped.push(record.id);continue;}
 const next={date:record.date,updatedAt:record.updatedAt,score:record.score,size:record.size,wind:{relative:wind.relative,strength:wind.strength,direction:wind.direction,speedMps:wind.speedMps,source:'BCM'}};
 if(JSON.stringify(next)===JSON.stringify(point.observation)){skipped.push(record.id);continue;}
 point.observation=next;updated.push(record.id);
}
if(updated.length){data.retrievedAt=input.retrievedAt;data.updateMode='scheduled-browser';if(!args.includes('--check')){const temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,target);}}
console.log(JSON.stringify({checkOnly:args.includes('--check'),updated,skipped,changed:updated.length>0}));
