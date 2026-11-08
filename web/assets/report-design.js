/* Lab report designs. One layout drives the on-screen pages and the PDF, so what staff preview is what patients download. */
(function(){
const W=595,H=842,L=44,R=551,BOTTOM=782;
const COLORS={Navy:'#14386f',Teal:'#0f6b6b',Green:'#1f6b3f',Maroon:'#8a1f3d',Slate:'#36424f',Purple:'#4b2e83',Ink:'#111111'};
const OPT={h:{plain:'Plain',band:'Band',center:'Letterhead',split:'Split'},p:{lines:'Lines',card:'Card',boxes:'Boxes'},t:{rules:'Clean',zebra:'Striped',grid:'Grid',lined:'Ruled'},f:{sans:'Sans',serif:'Serif'}};
const CLASSIC={n:'Clinic Classic',h:'plain',p:'lines',t:'rules',c:COLORS.Navy,f:'sans',r:0};
const PRESETS=[CLASSIC,
 {n:'Solid Band',h:'band',p:'card',t:'zebra',c:COLORS.Navy,f:'sans',r:0},
 {n:'Formal Letterhead',h:'center',p:'lines',t:'grid',c:COLORS.Ink,f:'serif',r:0},
 {n:'Teal Modern',h:'split',p:'boxes',t:'lined',c:COLORS.Teal,f:'sans',r:0},
 {n:'Side Rail',h:'plain',p:'card',t:'lined',c:COLORS.Maroon,f:'sans',r:1},
 {n:'Green Clinic',h:'band',p:'boxes',t:'grid',c:COLORS.Green,f:'sans',r:0},
 {n:'Ink Saver',h:'split',p:'lines',t:'lined',c:COLORS.Slate,f:'sans',r:0},
 {n:'Royal Serif',h:'center',p:'card',t:'zebra',c:COLORS.Purple,f:'serif',r:0}];
const pick=a=>a[Math.floor(Math.random()*a.length)];
const random=()=>{const c=pick(Object.entries(COLORS)),d={h:pick(Object.keys(OPT.h)),p:pick(Object.keys(OPT.p)),t:pick(Object.keys(OPT.t)),c:c[1],f:pick(Object.keys(OPT.f)),r:Math.random()<.25?1:0};d.n=`${c[0]} ${OPT.h[d.h]} ${OPT.t[d.t]}`;return d};
const randoms=n=>{const seen=new Set,o=[];while(o.length<n){const d=random(),k=[d.h,d.p,d.t,d.c,d.f,d.r].join();if(!seen.has(k)){seen.add(k);o.push(d)}}return o};
/* Saved designs come back from the database, so only known values are ever drawn. */
const clean=d=>{if(!d||typeof d!=='object')return{...CLASSIC};const k=(g,v)=>Object.prototype.hasOwnProperty.call(OPT[g],v)?v:CLASSIC[g];return{n:String(d.n||'Custom').slice(0,50),h:k('h',d.h),p:k('p',d.p),t:k('t',d.t),f:k('f',d.f),c:Object.values(COLORS).includes(d.c)?d.c:CLASSIC.c,r:d.r?1:0}};
const same=(a,b)=>!!a&&!!b&&['h','p','t','c','f','r'].every(k=>(a[k]||0)===(b[k]||0));

/* PDF built-in fonts cover Western characters only. The micro sign prints as u because some PDF viewers drop it; other common lab symbols are kept. Anything else shows as ? in both preview and PDF. */
const text=t=>String(t??'').replace(/[μµ]/g,'u').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/[–—−]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').replace(/[^\x20-\x7e\xa0-\xff]/g,'?');
const FONT={sans:'Helvetica,Arial,"Liberation Sans",sans-serif',serif:'"Times New Roman","Liberation Serif",Times,serif'};
let cx;const width=(s,z,b,f)=>{cx=cx||document.createElement('canvas').getContext('2d');cx.font=`${b?'bold ':''}${z}px ${FONT[f]}`;return cx.measureText(s).width};
const wrap=(t,w,z,b,f)=>{const out=[];let c='';text(t).split(' ').forEach(word=>{let x=c?c+' '+word:word;if(width(x,z,b,f)<=w){c=x;return}if(c)out.push(c);c=word;while(width(c,z,b,f)>w&&c.length>1){let n=c.length-1;while(n>1&&width(c.slice(0,n),z,b,f)>w)n--;out.push(c.slice(0,n));c=c.slice(n)}});if(c)out.push(c);return out.length?out:['']};
const tint=(hex,a)=>{const n=parseInt(hex.slice(1),16),m=s=>Math.round(((n>>s)&255)*a+255*(1-a)).toString(16).padStart(2,'0');return'#'+m(16)+m(8)+m(0)};
const RED='#c01a1f',GREY='#666b7a',LINE='#ccd1db',BLACK='#000000';

/* Turns a report into pages of simple drawing steps, top-left origin, in PDF points. */
function layout(design,data){const d=clean(design),f=d.f,A=d.c,TINT=tint(A,.09),pages=[[]];let y=0;
 const ops=()=>pages[pages.length-1],T=(x,yy,s,z=10,b=0,col=BLACK)=>ops().push({k:'t',x,y:yy,s:text(s),z,b,col}),TC=(cxx,yy,s,z,b,col)=>T(cxx-width(text(s),z,b,f)/2,yy,s,z,b,col),TR=(x,yy,s,z,b,col)=>T(x-width(text(s),z,b,f),yy,s,z,b,col),RECT=(x,yy,w,h,fill,stroke)=>ops().push({k:'r',x,y:yy,w,h,fill,stroke}),LN=(a,yy,b,col=LINE,w=.7,y2=yy)=>ops().push({k:'l',x1:a,y1:yy,x2:b,y2,col,w}),IMG=(x,yy,s)=>{if(data.logo)ops().push({k:'i',x,y:yy,s})};
 const rail=()=>{if(d.r)RECT(0,0,18,H,A)};rail();
 const addr=wrap(data.address,360,8.5,0,f).slice(0,2);
 if(d.h==='plain'){IMG(L,32,54);const x=data.logo?108:L;T(x,50,data.brand,14,1,A);addr.forEach((l,i)=>T(x,66+i*11,l,8.5));T(x,88,data.phone,8.5);y=106;LN(L,y,R)}
 else if(d.h==='band'){RECT(0,0,W,104,A);if(data.logo){RECT(L-3,22,60,60,'#ffffff');IMG(L,25,54)}const x=data.logo?116:L;T(x,46,data.brand,15,1,'#ffffff');addr.forEach((l,i)=>T(x,62+i*11,l,8.5,0,'#ffffff'));T(x,86,data.phone,8.5,0,'#ffffff');y=104}
 else if(d.h==='center'){IMG(W/2-23,26,46);const t0=data.logo?90:48;TC(W/2,t0,data.brand,16,1,A);addr.forEach((l,i)=>TC(W/2,t0+15+i*11,l,8.5,0,BLACK));const yp=t0+15+addr.length*11;TC(W/2,yp,data.phone,8.5,0,BLACK);y=yp+12;LN(L,y,R,A,1.4);LN(L,y+3,R,A,.5)}
 else{IMG(L,30,50);const x=data.logo?104:L;T(x,50,data.brand,14,1,A);addr.forEach((l,i)=>T(x,65+i*11,l,8.5));TR(R,48,'LABORATORY REPORT',9.5,1,A);TR(R,62,data.phone,8.5,0,BLACK);y=98;LN(L,y,R,A,2.2)}
 y+=d.h==='band'?30:26;
 wrap(data.title,R-L,14,1,f).forEach(l=>{T(L,y,l,14,1);y+=18});y+=4;
 const F=data.fields.filter(x=>x[1]);
 if(d.p==='boxes'){const bw=(R-L-18)/4,rows=Math.ceil(F.length/4);F.forEach((x,i)=>{const c=L+(i%4)*(bw+6),t=y-10+Math.floor(i/4)*42,v=wrap(x[1],bw-12,9.5,1,f)[0];RECT(c,t,bw,36,null,tint(A,.45));T(c+6,t+13,x[0],7.5,0,GREY);T(c+6,t+27,v,9.5,1)});y+=rows*42+12}
 else{const rows=Math.ceil(F.length/2),h=rows*15,card=d.p==='card';if(card){RECT(L,y-12,R-L,h+14,TINT);}const pad=card?10:0;F.forEach((x,i)=>{const c=(i%2?320:L+pad),yy=y+pad/2+Math.floor(i/2)*15,lw=80;T(c,yy,x[0]+':',9,1);T(c+lw,yy,wrap(x[1],(i%2?R-320:276-pad)-lw-4,9,0,f)[0],9)});y+=h+(card?18:8)}
 const P=d.t==='rules'?0:6,C=[L,L+206,L+322,L+382,R],COLW=[0,1,2,3].map(i=>C[i+1]-C[i]-P*2-4),HD=['Test','Result','Unit','Normal range'];
 const grid=(t,h)=>{RECT(L,t,R-L,h,null,LINE);[1,2,3].forEach(i=>LN(C[i],t,C[i],LINE,.7,t+h))};
 const head=()=>{if(d.t==='zebra'){RECT(L,y-11,R-L,18,A);HD.forEach((s,i)=>T(C[i]+P,y+2,s,9.5,1,'#ffffff'));y+=18}else if(d.t==='grid'){RECT(L,y-11,R-L,18,TINT);grid(y-11,18);HD.forEach((s,i)=>T(C[i]+P,y+2,s,9.5,1,A));y+=18}else if(d.t==='lined'){HD.forEach((s,i)=>T(C[i]+P,y,s.toUpperCase(),8,1,GREY));y+=6;LN(L,y,R,A,1);y+=14}else{HD.forEach((s,i)=>T(C[i],y,s,9.5,1,A));y+=6;LN(L,y,R);y+=15}};
 const page=()=>{pages.push([]);rail();y=56};
 y+=6;head();
 (data.results||[]).forEach((x,idx)=>{const fl=x.flag==='High'||x.flag==='Low',val=`${x.value??''}${x.flag&&x.flag!=='Normal'?' ('+x.flag+')':''}`,cells=[wrap(x.test,COLW[0],9.5,0,f),wrap(val,COLW[1],9.5,1,f),wrap(x.unit,COLW[2],9.5,0,f),wrap(x.range,COLW[3],9.5,0,f)],n=Math.max(...cells.map(c=>c.length)),h=n*12+(d.t==='rules'?6:8);
  if(y+h>BOTTOM){page();head()}
  const top=y-11;if(d.t==='zebra'&&idx%2)RECT(L,top,R-L,h,TINT);if(d.t==='grid')grid(top,h);
  cells.forEach((c,i)=>c.forEach((l,j)=>T(C[i]+P,y+1+j*12,l,9.5,i===1?1:0,i===1&&fl?RED:BLACK)));
  if(d.t==='lined')LN(L,top+h,R);y+=h});
 y+=d.t==='rules'?8:16;const need=h=>{if(y+h>BOTTOM)page()};
 if(data.notes)wrap('Notes: '+data.notes,R-L,9.5,0,f).forEach(l=>{need(13);T(L,y,l,9.5);y+=13});
 if(data.signed){y+=6;need(13);T(L,y,'Approved by: '+data.signed,9.5,1);y+=14}
 y+=8;wrap(data.foot,R-L,8,0,f).forEach(l=>{need(11);T(L,y,l,8,0,GREY);y+=11});
 pages.forEach((_,i)=>{const s=`Page ${i+1} of ${pages.length}`;pages[i].push({k:'t',x:R-width(s,8,0,f),y:822,s,z:8,b:0,col:GREY},{k:'t',x:L,y:822,s:text(data.footLeft||''),z:8,b:0,col:GREY})});
 return{pages,design:d}}

const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const svgPage=(ops,f,logo,label)=>`<svg class="rd-page" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label||'Report page')}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#fff"/>${ops.map(o=>o.k==='t'?`<text x="${o.x.toFixed(2)}" y="${o.y.toFixed(2)}" font-size="${o.z}" font-weight="${o.b?700:400}" fill="${o.col}" xml:space="preserve">${esc(o.s)}</text>`:o.k==='r'?`<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.fill||'none'}"${o.stroke?` stroke="${o.stroke}" stroke-width=".7"`:''}/>`:o.k==='l'?`<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.col}" stroke-width="${o.w}"/>`:`<image x="${o.x}" y="${o.y}" width="${o.s}" height="${o.s}" href="${esc(logo)}"/>`).join('')}</svg>`.replace('<rect',`<style>text{font-family:${FONT[f].replace(/"/g,"'")}}</style><rect`);
const svg=(design,data)=>{const{pages,design:d}=layout(design,data);return pages.map((o,i)=>svgPage(o,d.f,data.logo,`Report page ${i+1}`)).join('')};

async function logoBytes(url){if(!url)return null;try{const im=new Image;im.crossOrigin='anonymous';await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src=url});const c=document.createElement('canvas');c.width=c.height=180;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,180,180);const k=Math.min(180/im.width,180/im.height),w=im.width*k,h=im.height*k;g.drawImage(im,(180-w)/2,(180-h)/2,w,h);return atob(c.toDataURL('image/jpeg',.9).split(',')[1])}catch{return null}}
const rgb=h=>[1,3,5].map(i=>(parseInt(h.slice(i,i+2),16)/255).toFixed(3)).join(' ');
const pdfEsc=t=>t.replace(/[\\()]/g,'\\$&');
function pdfBytes(design,data,logo){const{pages,design:d}=layout(design,{...data,logo:logo?data.logo:''}),ser=d.f==='serif';
 const stream=ops=>ops.map(o=>{if(o.k==='t')return`BT ${rgb(o.col)} rg /F${o.b?2:1} ${o.z} Tf ${o.x.toFixed(2)} ${(H-o.y).toFixed(2)} Td (${pdfEsc(o.s)}) Tj ET`;if(o.k==='r'){const b=`${o.x} ${(H-o.y-o.h).toFixed(2)} ${o.w} ${o.h} re`;return o.fill?`${rgb(o.fill)} rg ${b} f`:`${rgb(o.stroke)} RG .7 w ${b} S`}if(o.k==='l')return`${rgb(o.col)} RG ${o.w} w ${o.x1} ${(H-o.y1).toFixed(2)} m ${o.x2} ${(H-o.y2).toFixed(2)} l S`;return`q ${o.s} 0 0 ${o.s} ${o.x} ${(H-o.y-o.s).toFixed(2)} cm /Im1 Do Q`}).join('\n');
 const objs=[],add=b=>{objs.push(b);return objs.length},cat=add(''),pgs=add(''),font=n=>add(`<</Type/Font/Subtype/Type1/BaseFont/${n}/Encoding/WinAnsiEncoding>>`),f1=font(ser?'Times-Roman':'Helvetica'),f2=font(ser?'Times-Bold':'Helvetica-Bold'),im=logo?add(`<</Type/XObject/Subtype/Image/Width 180/Height 180/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${logo.length}>>\nstream\n${logo}\nendstream`):0;
 const kids=pages.map(o=>{const c=stream(o),cn=add(`<</Length ${c.length}>>\nstream\n${c}\nendstream`);return add(`<</Type/Page/Parent ${pgs} 0 R/MediaBox[0 0 ${W} ${H}]/Resources<</Font<</F1 ${f1} 0 R/F2 ${f2} 0 R>>${im?`/XObject<</Im1 ${im} 0 R>>`:''}>>/Contents ${cn} 0 R>>`)});
 objs[cat-1]=`<</Type/Catalog/Pages ${pgs} 0 R>>`;objs[pgs-1]=`<</Type/Pages/Count ${kids.length}/Kids[${kids.map(k=>k+' 0 R').join(' ')}]>>`;
 let out='%PDF-1.4\n';const off=objs.map((o,i)=>{const at=out.length;out+=`${i+1} 0 obj\n${o}\nendobj\n`;return at}),xr=out.length;out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<</Size ${objs.length+1}/Root ${cat} 0 R>>\nstartxref\n${xr}\n%%EOF`;
 return Uint8Array.from(out,c=>c.charCodeAt(0)&255)}

/* Same report details for the staff preview and the patient download. */
const details=({C,r,patient,fd})=>{const v=C.visit,person=r.person_name||patient.name;return{brand:C.brand.name,address:v.address,phone:v.phone,logo:C.brand.logo,title:r.title,fields:[['Patient',person],['Relation',r.relation?`${r.relation} of ${patient.name}`:''],['Patient ID',patient.code],['Age',r.age],['Gender',r.gender],['Sample date',fd(r.collected_at)],['Report approved',fd(r.approved_at)]],results:r.results||[],notes:r.notes,signed:r.signed_by,foot:C.portal.reportFoot,footLeft:`${person} - ${patient.code}`}};
const unprintable=data=>[data.title,data.notes,data.signed,...data.fields.map(x=>x[1]),...data.results.flatMap(x=>[x.test,x.value,x.unit,x.range])].some(t=>text(t).includes('?')&&!String(t??'').includes('?'));
window.FA_RD={PRESETS,CLASSIC,randoms,clean,same,svg,pdfBytes,logoBytes,details,unprintable};
})();
