/* Footer: one builder used by the server page and by site.js, so both print the same thing.
   The skyline is drawn here from simple shapes. Ground is y=0, heights go up. Every solid is wound the same way so overlaps stay filled. */
(function(){
const n=x=>Math.round(x*10)/10;
function pen(x0){const X=x=>n(x0+x),Y=y=>n(-y);let s='',h='';
 const rect=(x,y,w,t)=>`M${X(x)} ${Y(y)}V${Y(y+t)}H${X(x+w)}V${Y(y)}Z`;
 const poly=p=>'M'+p.map(([a,b])=>`${X(a)} ${Y(b)}`).join('L')+'Z';
 const onion=(c,y,r,t)=>`M${X(c-r)} ${Y(y)}C${X(c-r*1.32)} ${Y(y+t*.52)} ${X(c-r*.3)} ${Y(y+t*.74)} ${X(c)} ${Y(y+t)}C${X(c+r*.3)} ${Y(y+t*.74)} ${X(c+r*1.32)} ${Y(y+t*.52)} ${X(c+r)} ${Y(y)}Z`;
 const arch=(c,y,w,t)=>`M${X(c-w/2)} ${Y(y)}V${Y(y+t*.62)}Q${X(c-w/2)} ${Y(y+t*.86)} ${X(c)} ${Y(y+t)}Q${X(c+w/2)} ${Y(y+t*.86)} ${X(c+w/2)} ${Y(y+t*.62)}V${Y(y)}Z`;
 const P={
  r:(x,y,w,t)=>{s+=rect(x,y,w,t);return P},p:a=>{s+=poly(a);return P},
  dome:(c,y,r,t,tip=7)=>{s+=onion(c,y,r,t)+rect(c-.7,y+t-1,1.4,tip);return P},
  hole:(c,y,w,t)=>{h+=arch(c,y,w,t);return P},cut:(x,y,w,t)=>{h+=rect(x,y,w,t);return P},cutp:a=>{h+=poly(a);return P},
  raw:f=>{s+=f(X,Y);return P},
  crenel:(x,y,w,size=5)=>{for(let i=0;i<Math.floor(w/(size*2));i++)s+=rect(x+i*size*2+size/2,y-.5,size,size);return P},
  minaret:(c,y,w,t,cap=1)=>{s+=poly([[c-w/2,y],[c-w*.36,y+t],[c+w*.36,y+t],[c+w/2,y]]);[.42,.74].forEach(k=>s+=rect(c-w*.72,y+t*k,w*1.44,2.4));s+=rect(c-w*.75,y+t,w*1.5,2.4);if(cap){s+=rect(c-w*.42,y+t+2,w*.84,5);s+=onion(c,y+t+7,w*.62,w*1.3)+rect(c-.5,y+t+6+w*1.3,1,5)}return P},
  out:()=>({s,h})};
 return P}
const LM={
 khyber:{w:160,d:p=>{p.r(0,0,160,6).r(10,6,140,34).r(0,6,36,76).r(124,6,36,76).r(30,6,100,66).r(44,72,72,12).crenel(0,82,36,4.5).crenel(124,82,36,4.5).crenel(44,84,72,4.5).hole(80,6,48,58).hole(18,42,10,20).hole(142,42,10,20).cut(58,74,6,6).cut(77,74,6,6).cut(96,74,6,6)}},
 alamgiri:{w:190,d:p=>{p.r(0,0,190,6).r(36,6,118,70).crenel(36,76,118,5);[24,166].forEach(c=>p.raw((X,Y)=>`M${X(c-24)} ${Y(6)}L${X(c-19)} ${Y(92)}H${X(c+19)}L${X(c+24)} ${Y(6)}Z`).r(c-22,92,44,3).r(c-13,95,3,12).r(c+10,95,3,12).r(c-3,95,6,12).r(c-16,106,32,3).dome(c,109,13,19,6));p.hole(95,6,44,58).hole(58,36,14,26).hole(132,36,14,26)}},
 minar:{w:130,d:p=>{p.r(0,0,130,5).r(14,5,102,5);
  p.raw((X,Y)=>`M${X(22)} ${Y(10)}C${X(44)} ${Y(14)} ${X(52)} ${Y(30)} ${X(54)} ${Y(66)}H${X(76)}C${X(78)} ${Y(30)} ${X(86)} ${Y(14)} ${X(108)} ${Y(10)}Z`);
  p.hole(65,10,26,32).cutp([[37,10],[47,28],[47,10]]).cutp([[93,10],[83,28],[83,10]]);
  p.p([[53,66],[58.5,188],[71.5,188],[77,66]]);[66,110,150].forEach(y=>p.r(50+(y-66)*.046,y,30-(y-66)*.09,4));p.r(53,187,24,4).r(57,191,16,8).dome(65,199,9,15,7)}},
 badshahi:{w:340,d:p=>{p.r(0,0,340,18).r(46,18,248,52).crenel(46,70,248,5).r(128,18,84,84).crenel(128,102,84,5);
  p.r(158,102,24,8).dome(170,100,34,58,10);[88,252].forEach(c=>p.r(c-16,70,32,7).dome(c,74,24,40,8));
  [[14,108],[326,108],[46,86],[294,86]].forEach(([c,t])=>p.minaret(c,18,12,t));
  p.hole(170,18,48,72);[64,92,120,220,248,276].forEach(c=>p.hole(c,18,16,38));p.hole(138,44,10,30).hole(202,44,10,30);
  [8,28,50,70,92,114,136,158,180,202,224,246,268,290,312,332].forEach(x=>p.cut(x,4,6,9))}},
 faisal:{w:270,d:p=>{p.r(0,0,270,10).r(6,10,258,8);
  p.raw((X,Y)=>`M${X(56)} ${Y(18)}Q${X(112)} ${Y(50)} ${X(135)} ${Y(118)}Q${X(158)} ${Y(50)} ${X(214)} ${Y(18)}Z`);
  [[18,178],[60,160],[210,160],[252,178]].forEach(([c,t])=>p.p([[c-4.5,18],[c-3,18+t],[c,18+t+26],[c+3,18+t],[c+4.5,18]]).r(c-6,18+t*.68,12,3));
  p.cutp([[134,108],[136,108],[150,26],[120,26]]).cutp([[100,24],[116,62],[112,24]]).cutp([[170,24],[154,62],[158,24]])}},
 mazar:{w:160,d:p=>{p.r(0,0,160,7).r(10,7,140,7).r(30,14,100,62).r(26,74,108,5).r(44,79,72,6);
  p.raw((X,Y)=>`M${X(46)} ${Y(85)}C${X(40)} ${Y(112)} ${X(58)} ${Y(138)} ${X(80)} ${Y(142)}C${X(102)} ${Y(138)} ${X(120)} ${Y(112)} ${X(114)} ${Y(85)}Z`).r(79.2,141,1.6,14);
  p.hole(80,14,36,54).hole(46,26,12,38).hole(114,26,12,38)}},
 monument:{w:190,d:p=>{p.r(0,0,190,8);const leaf=(a,t,b)=>p.raw((X,Y)=>`M${X(a)} ${Y(8)}C${X(a+(b-a)*.08)} ${Y(50)} ${X(t-12)} ${Y(82)} ${X(t)} ${Y(100)}C${X(t+6)} ${Y(70)} ${X(b)} ${Y(38)} ${X(b)} ${Y(8)}Z`);
  leaf(14,46,88);leaf(102,144,176);p.raw((X,Y)=>`M${X(50)} ${Y(8)}C${X(58)} ${Y(66)} ${X(84)} ${Y(104)} ${X(95)} ${Y(122)}C${X(106)} ${Y(104)} ${X(132)} ${Y(66)} ${X(140)} ${Y(8)}Z`);
  p.cutp([[88,8],[94,104],[96,104],[102,8]]).cutp([[56,8],[62,46],[64,8]]).cutp([[134,8],[128,46],[126,8]])}},
 derawar:{w:260,d:p=>{p.r(0,0,260,6).r(8,6,244,62).crenel(8,68,244,5);[22,74,130,186,238].forEach(c=>{p.p([[c-20,6],[c-14,84],[c+14,84],[c+20,6]]).crenel(c-16,84,32,4.5);p.cut(c-2,58,4,12).cut(c-2,30,4,10)});p.hole(102,6,20,40)}},
 rukn:{w:120,d:p=>{p.r(0,0,120,6).p([[12,6],[20,60],[100,60],[108,6]]).r(30,60,60,28).p([[26,60],[30,72],[30,60]]);[14,106].forEach(c=>p.p([[c-5,6],[c-2.5,70],[c+2.5,70],[c+5,6]]).dome(c,70,4.5,9,4));[30,90].forEach(c=>p.r(c-2,88,4,6));
  p.r(32,88,56,4).raw((X,Y)=>`M${X(32)} ${Y(92)}C${X(30)} ${Y(116)} ${X(46)} ${Y(132)} ${X(60)} ${Y(136)}C${X(74)} ${Y(132)} ${X(90)} ${Y(116)} ${X(88)} ${Y(92)}Z`).r(59.2,135,1.6,12);p.hole(60,6,18,36).hole(38,20,8,22).hole(82,20,8,22).hole(60,64,10,18)}}
};
const G=14,TOP=236;
function city(W){let r=73,x=-4,d='';const rn=()=>(r=(r*137+187)%1000)/1000;while(x<W){const w=26+rn()*46,h=34+rn()*(rn()>.72?122:70);d+=`M${n(x)} 0V${n(-h)}H${n(x+w)}V0Z`;if(rn()>.8)d+=`M${n(x+w/2-.8)} ${n(-h)}V${n(-h-20)}h1.6V${n(-h)}Z`;x+=w+(rn()>.7?rn()*12:-5)}return d}
function sky(list,W,id,ghost){const tot=list.reduce((a,m)=>a+m.w,0),n_=list.length,gap=(W-tot)/(n_+1);let x=gap,s='',h='';list.forEach(m=>{const p=pen(x);m.d(p);const o=p.out();s+=o.s;h+=o.h;x+=m.w+gap});
 return`<svg class="ft-sky ${id==='d'?'ft-sky-d':'ft-sky-p'}" viewBox="0 ${-TOP} ${n(W)} ${TOP+G}" preserveAspectRatio="xMidYMax meet" fill="currentColor" aria-hidden="true" focusable="false"><defs><mask id="ft-m-${id}" maskUnits="userSpaceOnUse" x="0" y="${-TOP}" width="${n(W)}" height="${TOP+G}"><rect x="0" y="${-TOP}" width="${n(W)}" height="${TOP+G}" fill="#fff"/><path d="${h}" fill="#000"/></mask></defs>${ghost>0?`<path d="${city(W)}" opacity="${ghost/100}"/>`:''}<path d="${s}" mask="url(#ft-m-${id})"/><rect x="0" y="-1" width="${n(W)}" height="${G+1}"/></svg>`}
function skyline(f){const on=(f.landmarks||[]).filter(l=>l.on&&LM[l.id]).map(l=>LM[l.id]);if(!on.length)return'';const size=Math.max(50,+f.skySize||100)/100,tot=a=>a.reduce((s,m)=>s+m.w,0);
 const dW=Math.max(2000/size,tot(on)+16*(on.length+1));
 const k=Math.min(on.length,Math.max(1,+f.phoneCount||4)),st=Math.floor((on.length-k)/2),ph=on.slice(st,st+k),pW=Math.max(tot(ph)*1.12,tot(ph)+12*(ph.length+1));
 const g=+f.skyGhost||0;return sky(on,dW,'d',g)+sky(ph,pW,'p',g)}
function html(c,e){const f=c.footer||{},v=c.visit||{},safe=u=>/^\s*(javascript|data):/i.test(u||'')?'#':u,list=a=>(a||[]).filter(x=>x.on&&x.label).map(x=>`<a href="${e(safe(x.url))}">${e(x.label)}</a>`).join('');
 const addr=f.address||v.address,phone=f.phone||v.phone,hours=f.hours||v.hours,note=f.note||v.footer,tel=f.phone?String(f.phone).replace(/[^\d+]/g,''):'+'+v.whatsapp,cols=[];
 if(f.brandOn!==false)cols.push(`<div class="ft-c ft-brand"><b class="ft-name">${e(f.brandName||c.brand.name)}</b>${f.about?`<p>${e(f.about)}</p>`:''}</div>`);
 [[f.links1Heading,f.links1],[f.links2Heading,f.links2]].forEach(([t,l],i)=>{const a=list(l);if(a)cols.push(`<nav class="ft-c" aria-label="${e(t||'Site pages')}">${t?`<h2>${e(t)}</h2>`:''}<div class="foot-l">${a}</div></nav>`)});
 if(f.contactOn!==false)cols.push(`<div class="ft-c">${f.contactHeading?`<h2>${e(f.contactHeading)}</h2>`:''}<p>${e(addr)}</p><p><a href="tel:${e(tel)}">${e(phone)}</a></p><p>${e(hours)}</p></div>`);
 const st=f.ownColors?`--ft-bg:${e(f.bg)};--ft-ink:${e(f.ink)};--ft-link:${e(f.link)}`:'';
 return`<div class="ft ft-${f.align==='left'?'left':'center'}"${st?` style="${st}"`:''}>${f.skyOn===false?'':skyline(f)}<div class="ft-b"><div class="wrap"><div class="ft-g" style="--ft-n:${cols.length||1}">${cols.join('')}</div>${note||f.copyright?`<div class="ft-end">${note?`<p>${e(note)}</p>`:''}${f.copyright?`<p>${e(f.copyright)}</p>`:''}</div>`:''}</div></div></div>`}
window.FA_FOOTER={html};
})();
