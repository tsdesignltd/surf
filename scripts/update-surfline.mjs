import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),i=args.indexOf('--input');if(i<0||!args[i+1])throw Error('Use --input path [--check]');
const input=JSON.parse(fs.readFileSync(args[i+1],'utf8')),at=new Date(input.retrievedAt),now=new Date();
const day=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
if(!Number.isFinite(+at)||+at>+now+60000||+now-at>7200000)throw Error('Invalid or stale retrieval time');
if(!Array.isArray(input.spots)||!input.spots.length)throw Error('No records');
const file=path.join(root,'data/surf.json'),data=JSON.parse(fs.readFileSync(file,'utf8')),seen=new Set(),updated=[];
const expected=Array.from({length:7},(_,n)=>day(new Date(new Date(day(at)+'T12:00:00+09:00').getTime()+n*86400000)));
const checkWave=f=>{if(!f||!expected.includes(f.date)||!Number.isFinite(f.min)||!Number.isFinite(f.max)||f.min<0||f.max<f.min)throw Error('Invalid wave forecast');};
for(const row of input.spots){
 const point=data.spots.find(s=>s.id===row.id);if(!point?.forecastAutoUpdate||seen.has(row.id))throw Error('Unsupported or duplicate Surfline point');seen.add(row.id);
 if(row.sourceUrl!==point.surflineUrl)throw Error('Source URL must match the configured point');
 if(!Array.isArray(row.forecasts)||row.forecasts.length!==7||new Set(row.forecasts.map(f=>f.date)).size!==7)throw Error('Require seven verified daily forecasts');
 row.forecasts.forEach(checkWave);
 const next=row.forecasts.map(f=>({date:f.date,min:f.min,max:f.max})).sort((a,b)=>a.date.localeCompare(b.date));
 let current=null;
 if(row.currentForecast){checkWave(row.currentForecast);if(row.currentForecast.date!==day(at))throw Error('Current model must be for today');current={date:row.currentForecast.date,min:row.currentForecast.min,max:row.currentForecast.max};
  const w=row.currentForecast.wind;
  if(w){if(w.source!=='Surfline'||!Number.isFinite(w.speedKph)||w.speedKph<0||typeof w.direction!=='string'||typeof w.relative!=='string')throw Error('Invalid sourced wind');const speed=Math.round(w.speedKph/3.6*10)/10;current.wind={source:'Surfline',direction:w.direction,relative:w.relative,speedKph:w.speedKph,speedMps:speed,strength:speed+' m/s'};}
 }
 if(JSON.stringify(next)===JSON.stringify(point.forecasts)&&JSON.stringify(current)===JSON.stringify(point.currentForecast??null))continue;
 point.forecasts=next;point.currentForecast=current;point.forecastRetrievedAt=input.retrievedAt;point.modelRunAt=null;if(point.bcmUnavailable||point.bcmDataOnly)point.observation=null;updated.push(point.id);
}
if(updated.length&&!args.includes('--check')){data.retrievedAt=input.retrievedAt;fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');fs.renameSync(file+'.tmp',file);}
console.log(JSON.stringify({updated,changed:updated.length>0,checkOnly:args.includes('--check')}));
