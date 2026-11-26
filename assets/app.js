'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const fmt=(d,opts)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',...opts}).format(new Date(d));
let clusters=[],areaFilter='all',data,day=0,selected='shichirigahama',map,markers=[],dates=[];
const start=new Date(dateKey(new Date())+'T12:00:00+09:00');
for(let i=0;i<7;i++)dates.push(dateKey(new Date(start.getTime()+i*864e5)));
function reading(s,index=day){const date=dates[index];if(index===0&&s.observation?.date===date)return {...s.observation,kind:'observed'};const f=s.forecasts.find(f=>f.date===date);return f?{...f,kind:'forecast',score:null}: {kind:'missing',score:null};}
function waveText(r){return r.kind==='observed'?r.size:r.kind==='forecast'?(r.max===0?'フラット':`${r.min}–${r.max} m`):'未取得';}
function ratio(r){if(r.kind==='forecast')return Math.min(.94,r.max/1.8);if(r.kind==='observed')return /アタマ|頭|オーバー|ダブル/.test(r.size)?.94:/カタ|肩/.test(r.size)?.85:/ムネ|胸/.test(r.size)?.74:/ハラ|腹/.test(r.size)?.62:/コシ|腰/.test(r.size)?.5:/モモ|腿/.test(r.size)?.35:.22;return 0;}
function sizeLevel(r){
 if(r.kind==='missing')return {key:'unknown',label:'サイズ未取得',short:'未取得'};
 if(r.kind==='forecast'){if(r.max===0)return {key:'flat',label:'フラット',short:'フラット'};if(r.max<=.6)return {key:'small',label:'初心者向け · サイズの目安',short:'初心者向け'};if(r.max<=1)return {key:'medium',label:'中級 · サイズの目安',short:'中級'};return {key:'large',label:'上級 · サイズの目安',short:'上級'};}
 const text=r.size;
 if(/ムネ|胸|カタ|肩|アタマ|頭|オーバー|ダブル/.test(text))return {key:'large',label:'上級 · サイズの目安',short:'上級'};
 if(/コシ|腰|ハラ|腹/.test(text))return {key:'medium',label:'中級 · サイズの目安',short:'中級'};
 if(/ヒザ|膝|モモ|腿|スネ|すね/.test(text))return {key:'small',label:'初心者向け · サイズの目安',short:'初心者向け'};
 if(/フラット/.test(text))return {key:'flat',label:'フラット',short:'フラット'};
 return {key:'unknown',label:'サイズ未取得',short:'未取得'};
}
const windDirections={'北':0,'北北東':22.5,'北東':45,'東北東':67.5,'東':90,'東南東':112.5,'南東':135,'南南東':157.5,'南':180,'南南西':202.5,'南西':225,'西南西':247.5,'西':270,'西北西':292.5,'北西':315,'北北西':337.5};
function windInfo(r){
 if(!r.wind)return null;
 if(typeof r.wind==='object')return r.wind;
 const m=r.wind.match(/^(.+?)[（(](.+?)[）)](.+)$/);
 return m?{relative:m[1],strength:m[2],direction:m[3],speedMps:null}:null;
}
function windSummary(r){const w=windInfo(r);return w?`${w.relative??'向き未取得'} / ${w.strength??'強さ未取得'} / ${w.direction??'方角未取得'}${Number.isFinite(w.speedMps)?` / ${w.speedMps} m/s`:''}`:(r.kind==='forecast'?'風予想 未取得':'風情報 未取得');}
function windPanel(r){
 const w=windInfo(r);
 if(!w)return `<section class="wind-panel wind-empty" aria-label="風の情報"><h3>風の情報</h3><p>${r.kind==='forecast'?'この日の風予想は未取得です。':'風情報は未取得です。'}</p><small>強さ・方角・海岸に対する向きは、原典で確認してください。</small></section>`;
 const degree=windDirections[w.direction],bars=({'微':1,'弱':2,'中':3,'強':4,'非常に強い':5})[w.strength]??0;
 return `<section class="wind-panel" aria-label="風の情報"><h3>風の情報 <small>${esc(w.source??'原典情報')}</small></h3><div class="wind-overview"><svg class="wind-compass" viewBox="0 0 80 80" role="img" aria-label="${esc(w.direction??'未取得')}から吹く風"><circle cx="40" cy="43" r="27" fill="none" stroke="currentColor" opacity=".25"/><text x="40" y="10" text-anchor="middle" fill="currentColor" font-size="10">N</text><path d="M40 15v6M12 43h6M62 43h6M40 65v6" stroke="currentColor" opacity=".4"/>${degree!==undefined?`<g transform="rotate(${(degree+180)%360} 40 43)"><path d="M40 60V27m-9 11 9-11 9 11" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`:'<text x="40" y="49" text-anchor="middle" fill="currentColor">—</text>'}</svg><div class="wind-direction"><span>海岸に対する向き</span><b>${esc(w.relative??'未取得')}</b><small>${esc(w.direction??'未取得')}から吹く風</small></div><div class="wind-strength"><span>風の強さ</span><b>${esc(w.strength??'未取得')}</b><div class="wind-bars" aria-hidden="true">${[1,2,3,4,5].map(i=>`<i class="${i<=bars?'filled':''}" style="height:${5+i*3}px"></i>`).join('')}</div></div></div><p class="wind-speed">風速：${Number.isFinite(w.speedMps)?`${esc(w.speedMps)} m/s`:'数値未取得（BCMの強さ表記を表示）'}</p></section>`;
}
function waveGraphic(r,large=false){const h=ratio(r),y=102-h*85;return `<svg class="wave-graphic ${large?'large':''}" viewBox="0 0 210 116" role="img" aria-label="${esc(waveText(r))}の波サイズ比較。人物との比較は目安です"><defs><linearGradient id="water-${large?'l':'s'}-${h}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#86bfe4"/><stop offset="1" stop-color="#86bfe4" stop-opacity=".15"/></linearGradient></defs><path d="M8 102H204M8 61H204M8 21H204" class="wave-guide"/><g class="person" fill="currentColor"><circle cx="46" cy="20" r="7"/><path d="M40 31q6-4 12 0l3 27-5 2 5 40h-6l-5-31-4 31h-6l5-40-5-2 4-23-9 20-5-3z"/></g>${r.kind==='missing'?'':`<path d="M72 103Q90 ${y+8} 125 ${y}Q152 ${y-4} 161 ${y+7}Q139 ${y+1} 139 ${y+22}Q145 ${y+39} 181 ${y+35}Q195 ${y+34} 207 ${y+46}V104Z" fill="url(#water-${large?'l':'s'}-${h})"/><path d="M72 103Q90 ${y+8} 125 ${y}Q152 ${y-4} 161 ${y+7}Q139 ${y+1} 139 ${y+22}Q145 ${y+39} 181 ${y+35}Q195 ${y+34} 207 ${y+46}" fill="none" stroke="#5b9ecb" stroke-width="2.5"/>`}<path d="M25 105h48" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;}
function visibleSpots(){return data.spots.filter(s=>areaFilter==='all'||s.region===areaFilter);}
function initMap(){
 if(!window.L){$('map-failure').hidden=false;return;}
 map=L.map('map',{scrollWheelZoom:true,zoomControl:false}).setView([35.30,139.36],11);
 L.control.zoom({position:'bottomright'}).addTo(map);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
 let errors=0;tiles.on('tileerror',()=>{if(++errors>3)$('map-failure').hidden=false;});tiles.on('tileload',()=>{$('map-failure').hidden=true;});
 for(const s of data.spots){const m=L.marker([s.lat,s.lon],{title:s.name,keyboard:true,icon:L.divIcon({className:'score-pin',html:'',iconSize:[36,36]})});m.on('click',()=>choose(s.id));m.bindTooltip(s.name,{direction:'top',offset:[0,-14],className:'spot-tooltip'});markers.push({m,s});}
 map.on('zoomend',groupMarkers);fitMap();
}
function groupMarkers(){
 if(!map)return;
 for(const c of clusters)map.removeLayer(c);clusters=[];
 for(const {m}of markers)map.removeLayer(m);
 const groups=[];
 for(const entry of markers.filter(e=>areaFilter==='all'||e.s.region===areaFilter)){
  const pixel=map.latLngToLayerPoint(entry.m.getLatLng());
  const group=map.getZoom()<16?groups.find(g=>g.pixel.distanceTo(pixel)<55):null;
  if(group)group.members.push(entry);else groups.push({pixel,members:[entry]});
 }
 for(const group of groups){
  const members=group.members;
  if(members.length===1){members[0].m.addTo(map);if(members[0].s.id===selected)members[0].m.openTooltip();continue;}
  const levels=members.map(e=>sizeLevel(reading(e.s))),level=levels.find(l=>l.key==='large')||levels.find(l=>l.key==='medium')||levels.find(l=>l.key==='small')||levels[0];
  const lat=members.reduce((v,e)=>v+e.s.lat,0)/members.length,lon=members.reduce((v,e)=>v+e.s.lon,0)/members.length;
  const label=members.every(e=>e.s.region===members[0].s.region)?members[0].s.region:'周辺';
  const c=L.marker([lat,lon],{title:members.map(e=>e.s.name).join('・')+'を拡大',icon:L.divIcon({className:`coast-cluster level-${level.key}`,html:`<span>${esc(label)} <b>${members.length}</b></span>`,iconSize:[108,36],iconAnchor:[54,18]})}).addTo(map);
  c.on('click',()=>map.setView([lat,lon],Math.min(17,map.getZoom()+2)));c.bindTooltip(members.map(e=>esc(e.s.name)).join('<br>'),{className:'spot-tooltip'});clusters.push(c);
 }
}
function fitMap(){if(map){const points=visibleSpots();map.fitBounds(points.map(s=>[s.lat,s.lon]),{paddingTopLeft:[55,110],paddingBottomRight:[55,65],maxZoom:14});groupMarkers();}}
function choose(id,focus=false){selected=id;render();if(map&&focus){const s=data.spots.find(s=>s.id===id);map.setView([s.lat,s.lon],16);}}
function filterArea(region){areaFilter=region;const points=visibleSpots();if(!points.some(s=>s.id===selected))selected=points[0].id;render();fitMap();}
function render(){const current=dates[day],s=data.spots.find(s=>s.id===selected),r=reading(s),level=sizeLevel(r);$('selected-date').textContent=fmt(current+'T12:00:00+09:00',{month:'long',day:'numeric',weekday:'long'})+(day===0?' / 今日':' / 波予想');$('day-slider').value=day;$('day-slider').setAttribute('aria-valuetext',`${current} ${day===0?'今日':'予想'}`);$('today-button').disabled=day===0;
$('days').innerHTML=dates.map((d,i)=>{const t=new Date(d+'T12:00:00+09:00'),v=reading(s,i);return `<button class="day ${i===day?'active':''}" data-day="${i}" aria-pressed="${i===day}" aria-label="${d}${i===0?' 今日':''}"><span>${i===0?'今日':i===1?'明日':fmt(t,{weekday:'short'})}</span><b>${fmt(t,{month:'numeric',day:'numeric'})}</b><small>${v.kind==='observed'?'BCM':v.kind==='forecast'?waveText(v).replace(' m',''):'未取得'}</small><i class="mini-line level-${sizeLevel(v).key}"></i></button>`}).join('');
$('source-label').textContent=r.kind==='observed'?'当日情報 · BCM':r.kind==='forecast'?'波高予想 · Surfline':'データ未取得';
const scheduleNote=data.automation?`定期取得：毎日${data.automation.times.join('・')} JST`:'自動更新は未設定';const age=(Date.now()-new Date(data.retrievedAt))/36e5;$('snapshot-bar').textContent=`${age>12?'以前に取得したデータです。':'取得済みデータを表示中。'} 取得：${fmt(data.retrievedAt,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} JST ／ ${scheduleNote}。最新情報は原典へ。`;
$('map-date').textContent=fmt(current+'T12:00:00+09:00',{month:'numeric',day:'numeric',weekday:'short'})+' · '+(day===0?'TODAY':'FORECAST');const kinds=new Set(visibleSpots().map(p=>reading(p).kind));$('legend-text').textContent=kinds.size>1?'数字：BCM点数 ／ Surfline予想上限（m）':kinds.has('observed')?'マーカーの数字はBCMの点数':'マーカーの数字は予想波高の上限（m）';$('list-source').textContent=day===0?'BCM優先 / 最新の取得情報':'Surfline / 日別予想';
for(const {m,s:sp} of markers){const v=reading(sp),value=v.kind==='observed'?v.score:v.kind==='forecast'?v.max.toFixed(1):'—';m.setIcon(L.divIcon({className:`score-pin level-${sizeLevel(v).key} ${sp.id===selected?'selected':''}`,html:`<div class="pin ${v.kind==='forecast'?'forecast':''}">${value}</div>`,iconSize:[v.kind==='forecast'?45:36,36],iconAnchor:[18,18]}));m.setTooltipContent(`${esc(sp.name)}<br><span class="tooltip-wind">${esc(windSummary(v))}</span>`);m.setZIndexOffset(sp.id===selected?500:0);if(sp.id===selected)m.openTooltip();else m.closeTooltip();}
groupMarkers();
$('area-filters').innerHTML=['all','鎌倉','藤沢','茅ヶ崎','平塚','大磯','小田原'].map(region=>`<button class="area-button ${region===areaFilter?'active':''}" data-area="${region}" aria-pressed="${region===areaFilter}">${region==='all'?'全エリア':region}</button>`).join('');
$('spot-count').textContent=visibleSpots().length+(visibleSpots().length===1?' SPOT':' SPOTS');
const runAt=s.modelRunAt===null?null:(s.modelRunAt??data.modelRunAt);const source=r.kind==='observed'?'BCM':r.kind==='forecast'?'Surfline':'データ未取得',origin=r.kind==='observed'?s.bcmUrl:s.surflineUrl;
$('detail').dataset.level=level.key;$('detail').innerHTML=`<div class="detail-heading"><span class="eyebrow">SELECTED SPOT</span><span class="tag">${source}</span></div><h2>${esc(s.name)}</h2><p class="english">${esc(s.region)} / ${s.english}</p><div class="size-badge level-${level.key}">${level.label}</div><div class="score-block"><div class="score-number">${r.score??'—'}<small>/100</small></div><p>${r.kind==='observed'?'BCM 点数':r.kind==='forecast'?'予想の点数なし':'データ未取得'}<small>${r.kind==='observed'?'現地観測の評価':'BCM点数への換算はしません'}</small></p></div><div class="conditions"><div><span>波のサイズ</span><b>${esc(waveText(r))}</b></div><div><span>風の向き</span><b class="wind-value">${esc(windInfo(r)?.relative??'未取得')}</b></div></div>${windPanel(r)}<div class="wave-panel">${waveGraphic(r,true)}<span>人と波の比較は目安イラスト</span></div><div class="feature"><h3>ポイントの特徴・メモ</h3><p>${esc(s.feature)}</p></div><div class="trend"><h3>7日間の波高予想 <span>Surfline / m</span></h3><div class="trend-bars">${dates.map((d,i)=>{const f=s.forecasts.find(v=>v.date===d);return `<div class="trend-bar ${day===i?'active':''}" title="${d} ${f?`${f.min}–${f.max}m`:'未取得'}"><i style="height:${f?Math.max(5,f.max/1.5*100):0}%"></i></div>`}).join('')}</div><div class="trend-labels">${dates.map(d=>`<span>${fmt(d+'T12:00:00+09:00',{day:'numeric'})}</span>`).join('')}</div></div><p class="detail-source">${r.kind==='observed'?`観測：${fmt(r.updatedAt,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} JST`:r.kind==='forecast'?(runAt?`モデル：${fmt(runAt,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} JST`:`予想確認：${fmt(s.forecastRetrievedAt??data.retrievedAt,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} JST`):'この日付の情報はまだ取得されていません。'}<br>表示日：${current} ／ ${source}</p><a class="source-link" href="${origin}" target="_blank" rel="noopener">${r.kind==='observed'?'BCMで最新情報を見る':'Surflineで予想を確認'}</a>`;
$('spot-grid').innerHTML=visibleSpots().map(sp=>{const v=reading(sp);return `<button class="spot-card level-${sizeLevel(v).key} ${sp.id===selected?'active':''}" data-spot="${sp.id}" aria-pressed="${sp.id===selected}"><span class="spot-region">${esc(sp.region)}</span><span class="spot-name">${esc(sp.name)}</span><span class="size-badge level-${sizeLevel(v).key}">${sizeLevel(v).short}</span><span class="spot-value">${v.kind==='observed'?v.score:v.kind==='forecast'?v.max.toFixed(1):'—'}<small>${v.kind==='observed'?'点':v.kind==='forecast'?'m 上限':''}</small></span>${waveGraphic(v)}<span class="spot-size">${esc(waveText(v))}</span><span class="spot-wind">${esc(windSummary(v))}</span><span class="spot-time">${v.kind==='observed'?`BCM · ${fmt(v.updatedAt,{hour:'2-digit',minute:'2-digit'})}`:v.kind==='forecast'?'Surfline · 波高予想':'データ未取得'}</span></button>`}).join('');
$('source-details').innerHTML=`<p><b>色分け：場所ではなく、表示日のサイズで判定</b><br>黄色（初心者向け）：予想上限0.6m以下／BCMヒザ・モモ以下<br>赤（中級）：予想上限0.6m超〜1.0m／BCMコシ・ハラ<br>黒（上級）：予想上限1.0m超／BCMムネ以上<br>灰：フラット・未取得<br>セットを含む大きい側のサイズを使用。地図のグループ色はグループ内の最大区分。BCMの身体表現をメートルに換算せず、それぞれの目安で判定します。風・流れ・混雑・地形は判定に含まず、黄色も安全の保証ではありません。</p><p><b>風の表記</b><br>オフショア：陸から海へ<br>オンショア：海から陸へ<br>サイドオン：海から陸へ斜めに吹く風<br>方角は風が吹いてくる方角、矢印は吹いていく向きです。BCMの「微・弱・中・強」は原典の表記を使用し、m/sへの換算はしません。風予想が未取得の日は、当日の風を流用しません。</p><p><b>取得方式：ブラウザで確認したデータのスナップショット</b><br>取得日時：${fmt(data.retrievedAt,{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} JST<br>BCM：湘南・西湘のログイン後の当日情報、${data.spots.filter(p=>!p.bcmDataOnly).length}ポイント。小田原はモデル配信で現地点数なし<br>Surfline：各ポイントの日別波高予想<br>定期取得：${data.automation?`毎日${data.automation.times.join('・')}（日本時間）に取得を試行`:'未設定'}</p><p>「再読み込み」はリポジトリに保存されたデータを読み直します。その場でBCM・Surflineから直接取得する機能ではありません。定期取得はBCMのみが対象です。BCMのログイン状態はこのサイトに引き継がれません。</p>`;
}
async function load(){const res=await fetch(`data/surf.json?t=${Date.now()}`,{cache:'no-store'});if(!res.ok)throw Error('データ取得に失敗しました');const next=await res.json();if(next.schemaVersion!==1||!Array.isArray(next.spots)||!next.spots.length)throw Error('データ形式が正しくありません');data=next;}
$('day-slider').addEventListener('input',e=>{day=Number(e.target.value);render()});$('today-button').addEventListener('click',()=>{day=0;render()});$('days').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){day=Number(b.dataset.day);render()}});$('spot-grid').addEventListener('click',e=>{const b=e.target.closest('[data-spot]');if(b)choose(b.dataset.spot,true)});$('fit-map').addEventListener('click',fitMap);$('area-filters').addEventListener('click',e=>{const b=e.target.closest('[data-area]');if(b)filterArea(b.dataset.area)});
for(const id of ['sources-button','footer-sources'])$(id).addEventListener('click',()=>$('sources-dialog').showModal());$('close-dialog').addEventListener('click',()=>$('sources-dialog').close());$('sources-dialog').addEventListener('click',e=>{if(e.target===$('sources-dialog')){const box=e.target.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)e.target.close();}});$('reload-data').addEventListener('click',async()=>{try{await load();render();$('reload-status').textContent='公開データを読み直しました。';}catch(e){$('reload-status').textContent=e.message;}});
load().then(()=>{initMap();render()}).catch(e=>{$('snapshot-bar').textContent=e.message+'。ページを再読み込みしてください。';});
