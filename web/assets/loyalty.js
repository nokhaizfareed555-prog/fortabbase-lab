/* Patient rewards on /reports: a trophy room for what is won and a winding map of the road ahead.
   The server sends only earned awards and the next three, so the top of the ladder stays private. */
(function(){
const METALS={
  bronze:{a:'#f6c79a',b:'#c47a3c',c:'#7a4318'},
  silver:{a:'#ffffff',b:'#c5d0dc',c:'#74808f'},
  gold:{a:'#fff3b0',b:'#f2bd2c',c:'#a86a06'},
  platinum:{a:'#f2fdff',b:'#9fe3ee',c:'#3c8ea6'}
};
const ORDER=['bronze','silver','gold','platinum'];
const metal=(name,i)=>{const n=String(name).toLowerCase();return METALS[ORDER.find(k=>n.includes(k))||(/diamond|champion|legend/.test(n)?'platinum':ORDER[i%4])]};
let uid=0;

/* An original trophy drawing, tinted to the metal of the award. */
function cup(m,cls){const g='lyg'+(++uid);return `<svg class="${cls}" viewBox="0 0 120 150" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="${m.c}"/><stop offset=".32" stop-color="${m.a}"/><stop offset=".62" stop-color="${m.b}"/><stop offset="1" stop-color="${m.c}"/></linearGradient></defs><g fill="none" stroke="url(#${g})" stroke-width="7" stroke-linecap="round"><path d="M29 24H12c0 26 8 42 26 46"/><path d="M91 24h17c0 26-8 42-26 46"/></g><path fill="url(#${g})" d="M27 12h66v34c0 25-14 42-33 42S27 71 27 46z"/><path fill="#fff" opacity=".34" d="M38 18h9v32c0 12 4 21 10 28-12-4-19-15-19-29z"/><path fill="#fff" opacity=".9" d="m60 28 5.2 10.6 11.7 1.7-8.5 8.2 2 11.7L60 54.7l-10.4 5.5 2-11.7-8.5-8.2 11.7-1.7z"/><path fill="url(#${g})" d="M53 86h14v20H53z"/><path fill="url(#${g})" d="M40 106h40a4 4 0 0 1 4 4v8H36v-8a4 4 0 0 1 4-4z"/><rect x="28" y="118" width="64" height="20" rx="4" fill="#0c1d3d" stroke="url(#${g})" stroke-width="3"/></svg>`}

/* Smooth wave through the stops; each segment is one cubic curve so progress can stop exactly mid-way. */
const segs=(pts,v)=>pts.slice(1).map((q,i)=>{const p=pts[i];return v?[p,[p[0],p[1]+(q[1]-p[1])*.55],[q[0],q[1]-(q[1]-p[1])*.55],q]:[p,[p[0]+(q[0]-p[0])*.55,p[1]],[q[0]-(q[0]-p[0])*.55,q[1]],q]});
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const cut=(s,t)=>{const a=mix(s[0],s[1],t),b=mix(s[1],s[2],t),c=mix(s[2],s[3],t),d=mix(a,b,t),f=mix(b,c,t);return [s[0],a,d,mix(d,f,t)]};
const n=x=>Math.round(x*10)/10;
const dOf=list=>list.length?`M${n(list[0][0][0])} ${n(list[0][0][1])}`+list.map(s=>`C${n(s[1][0])} ${n(s[1][1])} ${n(s[2][0])} ${n(s[2][1])} ${n(s[3][0])} ${n(s[3][1])}`).join(''):'';
const short=s=>{s=String(s);return s.length>15?s.slice(0,14)+'…':s};

function map(nodes,pts,e,vert){
  const W=vert?340:1000,count=nodes.length,step=vert?116:(W-140)/Math.max(count-1,1),H=vert?90+step*(count-1)+60:330;
  const at=nodes.map((_,i)=>vert?[i%2?250:90,70+step*i]:[70+step*i,i%2?100:200]);
  const S=segs(at,vert);let done=0;nodes.forEach((x,i)=>{if(x.min<=pts)done=i});
  const nx=nodes[done+1],t=nx?Math.min(1,(pts-nodes[done].min)/Math.max(nx.min-nodes[done].min,1)):0;
  const gold=S.slice(0,done);if(nx&&t>0)gold.push(cut(S[done],t));
  const tip=gold.length?gold[gold.length-1][3]:at[0];
  const stars=[];for(let i=0;i<(vert?26:44);i++){const x=(i*271+37)%W,y=(i*137+19)%H;stars.push(`<circle cx="${x}" cy="${y}" r="${i%5?1:1.8}" class="ly-st" style="animation-delay:${(i%7)*.5}s"/>`)}
  const stops=nodes.map((x,i)=>{const[cx,cy]=at[i],won=x.min<=pts,start=x.start,now=won&&i===done,m=metal(x.name,x.rank||0),g='lyn'+(++uid);
    const tx=vert?(i%2?cx-56:cx+56):cx,ty=vert?cy-4:(i%2?cy-74:cy+62),anchor=vert?(i%2?'end':'start'):'middle';
    return `<g class="ly-stop ${won?'won':'lock'}${now?' now':''}"><defs><radialGradient id="${g}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="${m.a}"/><stop offset=".55" stop-color="${m.b}"/><stop offset="1" stop-color="${m.c}"/></radialGradient></defs>${won&&!start?`<circle class="ly-halo" cx="${cx}" cy="${cy}" r="46" fill="${m.b}"/>`:''}<circle cx="${cx}" cy="${cy}" r="${start?22:36}" class="ly-disc" ${won?`fill="url(#${g})"`:''}/><circle cx="${cx}" cy="${cy}" r="${start?16:29}" class="ly-in"/><text x="${cx}" y="${cy+(start?6:9)}" text-anchor="middle" class="ly-ic" style="font-size:${start?16:26}px" data-nt>${start?'➤':e(x.icon)}</text>${!won?`<g transform="translate(${cx+21} ${cy-33})"><circle r="11" class="ly-lk"/><path d="M-3.5-1v-2.5a3.5 3.5 0 0 1 7 0V-1M-5-1h10v6.5H-5z" fill="none" stroke="#c9d6ea" stroke-width="1.7" stroke-linejoin="round"/></g>`:(!start?`<g transform="translate(${cx+24} ${cy-27})"><circle r="10" fill="#17a673" stroke="#fff" stroke-width="2"/><path d="m-4.500 0 3 3 6-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`:'')}<text x="${tx}" y="${ty}" text-anchor="${anchor}" class="ly-nm">${e(short(x.name))}</text><text x="${tx}" y="${ty+19}" text-anchor="${anchor}" class="ly-pt">${start?'':`<tspan>${e(x.min)}</tspan> pts`}</text></g>`}).join('');
  return `<svg class="ly-svg ${vert?'v':'h'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rewards map. ${e(pts)} points so far.">${stars.join('')}<path class="ly-road" d="${dOf(S)}"/><path class="ly-trail" d="${dOf(S)}"/>${gold.length?`<path class="ly-glow" d="${dOf(gold)}"/><path class="ly-gold" d="${dOf(gold)}"/>`:''}${stops}${nx&&t>0?`<g transform="translate(${n(tip[0])} ${n(tip[1])})"><circle class="ly-pulse" r="11"/><circle r="8" fill="#fff" stroke="#f2bd2c" stroke-width="4"/></g>`:''}</svg>`}

function html(l,patient,e){
  const pts=Math.max(0,Number(l.points)||0),path=(l.path||l.awards||[]).map((a,i)=>({name:a.name,icon:a.icon,min:Number(a.min)||0,rank:i})).sort((a,b)=>a.min-b.min);
  const won=path.filter(a=>a.min<=pts),next=path.find(a=>a.min>pts);
  const top=won[won.length-1],m=top?metal(top.name,top.rank):METALS.gold;
  /* Long journeys keep the map readable: the latest wins and everything still ahead. */
  const shown=[...won.slice(-4),...path.filter(a=>a.min>pts)],first=won.length>4?shown[0].min:0;
  const nodes=won.length>4?shown:[{name:'Start',icon:'',min:first,start:true,rank:0},...shown];
  const toGo=next?next.min-Math.max(pts,0):0;
  const shelf=won.slice().reverse().map(a=>`<li class="ly-award">${cup(metal(a.name,a.rank),'ly-mini')}<b>${e(a.name)}</b><small><span class="ly-n">${e(a.min)}</span> points</small></li>`).join('');
  const waiting=next?`<li class="ly-award wait">${cup({a:'#8fa3c2',b:'#5f7498',c:'#33476b'},'ly-mini')}<b>${e(next.name)}</b><small>Waiting for you</small></li>`:'';
  return `<section class="ly" aria-label="Your rewards">
  <div class="ly-room">
    <div class="ly-stage${top?'':' empty'}"><div class="ly-rays" aria-hidden="true"></div>${cup(top?m:{a:'#8fa3c2',b:'#5f7498',c:'#33476b'},'ly-big')}<div class="ly-plaque"><small>${top?'Awarded to':'Your first trophy'}</small><strong ${top?'data-nt':''}>${top?e(patient.name):e(next?next.name:'')}</strong>${top?`<em>${e(top.icon)} ${e(top.name)}</em>`:''}</div></div>
    <div class="ly-info"><p class="ly-kick">Your trophy room</p><div class="ly-nums"><div><b class="ly-count" data-to="${pts}">${e(pts)}</b><small>Loyalty points</small></div><div><b>${e(l.visits)}</b><small>Completed visits</small></div></div>
    ${next?`<p class="ly-next"><span>Next award</span> <strong>${e(next.icon)} ${e(next.name)}</strong> <span class="ly-go"><b>${e(toGo)}</b> points to go</span></p>`:`<p class="ly-next"><span>Every completed test adds to your points.</span></p>`}
    <ul class="ly-shelf">${shelf}${waiting}</ul>
    <button type="button" class="ly-jump" id="lyj">My reports ↓</button></div>
  </div>
  <div class="ly-map"><h2>Your rewards map</h2>${map(nodes,pts,e,false)}${map(nodes,pts,e,true)}</div>
  </section>`}

function wake(root){
  const j=root.querySelector('#lyj');if(j)j.onclick=()=>document.querySelector('#rq')?.scrollIntoView({behavior:'smooth',block:'center'});
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  /* The gold line draws itself in. At rest it is a plain solid line, so it can never vanish. */
  root.querySelectorAll('.ly-gold,.ly-glow').forEach(g=>{let L=0;try{L=g.getTotalLength()}catch{}if(L>0&&g.animate)g.animate([{strokeDasharray:`0 ${L}`},{strokeDasharray:`${L} 0`}],{duration:1800,easing:'ease-out'})});
  const c=root.querySelector('.ly-count');if(!c)return;
  const to=+c.dataset.to,t0=performance.now();if(!to)return;
  const f=t=>{const k=Math.min(1,(t-t0)/1100);c.textContent=Math.round(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)}

window.FA_LY={html,wake};
})();
