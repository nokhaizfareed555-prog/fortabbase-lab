/* Water surface on click and drag, cursor and finger followers, and click bursts. Loaded only when one of them is on.
   Settings come from FA._fxGet(); FA.fxView() swaps in the phone values (m_ keys) on small screens. */
(()=>{
const FA=window.FA;if(!FA||FA._fxRun)return;FA._fxRun=1;
const view=()=>{const e=FA.fxView(FA._fxGet());return FA._fxRippleOnly?{...e,waveOn:false,chase:'none',click:'none'}:e},phone=()=>matchMedia('(max-width:860px)').matches,
 lite=()=>document.documentElement.classList.contains('lite'),TAU=Math.PI*2,R=(a,b)=>a+Math.random()*(b-a),
 hex=c=>{const n=parseInt(String(c||'#2f9bff').slice(1),16);return[n>>16&255,n>>8&255,n&255]},
 rgba=(c,a)=>{const x=hex(c);return`rgba(${x[0]},${x[1]},${x[2]},${a})`},
 mix=(a,b,t)=>{const x=hex(a),y=hex(b);return'#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('')};

/* Water surface: a small wave simulation drawn as smooth light and shade over the page.
   Clicks drop into it, dragging stirs it, and the waves spread, cross and fade by themselves. */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const W_={cell:0,w:0,h:0,a:null,b:null,L:null,T:null,cv:null,g:null,img:null,raf:0,last:0,acc:0,c2:.2,steps:1,damp:.98,I:.5,A:4,blur:1,tint:[191,233,255]};
const wSetup=()=>{const c=phone()?8:5,w=Math.ceil(innerWidth/c)+2,h=Math.ceil(innerHeight/c)+2;if(W_.w===w&&W_.h===h&&W_.cell===c&&W_.cv)return;
 if(!W_.cv){W_.cv=document.createElement('canvas');W_.cv.setAttribute('aria-hidden','true');W_.cv.style.cssText='position:fixed;left:0;top:0;z-index:9999;pointer-events:none';W_.g=W_.cv.getContext('2d');document.body.appendChild(W_.cv)}
 Object.assign(W_,{cell:c,w,h,a:new Float32Array(w*h),b:new Float32Array(w*h),L:new Float32Array(w*h),T:new Float32Array(w*h)});W_.cv.width=w;W_.cv.height=h;W_.cv.style.width=w*c+'px';W_.cv.style.height=h*c+'px';W_.img=W_.g.createImageData(w,h)};
addEventListener('resize',()=>{if(W_.cv)wSetup()},{passive:true});
const wTune=(speed,life,I,A,blur,tint)=>{const v=3*Math.max(.1,speed/100)/W_.cell,steps=Math.max(1,Math.ceil(v/.6)),c=v/steps;W_.c2=c*c;W_.steps=steps;W_.damp=Math.pow(.02,16.67/(Math.max(200,life)*steps));W_.I=I;W_.A=A/W_.cell;W_.blur=Math.min(5,Math.round(blur/W_.cell*1.2));W_.tint=hex(tint)};
const wDrop=(x,y,rad,amt)=>{wSetup();const{cell,w,h,a}=W_,s=Math.max(1.5,rad*.12/cell),cx=x/cell,cy=y/cell,R=Math.ceil(s*3),amp=s*amt;for(let j=Math.max(1,Math.floor(cy-R));j<Math.min(h-1,cy+R);j++)for(let i=Math.max(1,Math.floor(cx-R));i<Math.min(w-1,cx+R);i++){const d=(i-cx)**2+(j-cy)**2;a[j*w+i]+=amp*Math.exp(-d/(2*s*s))}if(!W_.raf){W_.last=performance.now();W_.raf=requestAnimationFrame(wTick)}};
const wBox=(S,D,w,h,dx)=>{const n=w*h;for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++){const k=j*w+i,o=dx?1:w;D[k]=(S[k-o]+S[k]*2+S[k+o])/4}D.fill(0,0,w);D.fill(0,n-w,n)};
function wTick(t){const n=Math.min(2.4,(t-W_.last||16)/16.67);W_.last=t;W_.raf=0;const{w,h}=W_;W_.acc+=W_.steps*n;let run=Math.min(10,Math.floor(W_.acc));W_.acc-=run;
 while(run-->0){const{a,b,c2,damp}=W_;for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++){const k=j*w+i;b[k]=((a[k-1]+a[k+1]+a[k-w]+a[k+w]-4*a[k])*c2+2*a[k]-b[k])*damp}W_.a=b;W_.b=a}
 const{a}=W_;let L=W_.L,T=W_.T,top=0;const gain=1.15*W_.I;for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++){const k=j*w+i,v=clamp(((a[k-1]-a[k+1])*.62+(a[k-w]-a[k+w])*.78)*gain,-.8,.8);L[k]=v;const q=v<0?-v:v;if(q>top)top=q}
 for(let p=0;p<W_.blur;p++){wBox(L,T,w,h,1);wBox(T,L,w,h,0)}
 const px=W_.img.data,A=W_.A,fi=A-Math.floor(A),ai=Math.floor(A),tn=W_.tint,sm=(i,k)=>L[clamp(k,0,w*h-1)]*(1-fi)+L[clamp(k+1,0,w*h-1)]*fi;
 const e=[0,0,0];for(let j=0;j<h;j++)for(let i=0;i<w;i++){const k=j*w+i,o=k*4,in_=i>ai+1&&i<w-ai-2;e[0]=in_?sm(0,k-ai-1):L[k];e[1]=L[k];e[2]=in_?sm(0,k+ai):L[k];const m=Math.max(Math.abs(e[0]),Math.abs(e[1]),Math.abs(e[2]));if(m<.004){px[o+3]=0;continue}
  for(let c=0;c<3;c++){const u=e[c]/m,b=tn[c];px[o+c]=u>=0?b+(255-b)*u:b-(b*.8)*-u}px[o+3]=Math.min(255,m*255)}
 W_.g.putImageData(W_.img,0,0);
 if(top>.004&&!document.hidden)W_.raf=requestAnimationFrame(wTick);else{W_.a.fill(0);W_.b.fill(0);W_.g.clearRect(0,0,w,h)}}
/* Real bending of the page under a wave. Chrome, Edge and Samsung Internet only; the water surface above works everywhere. */
const canWarp=/Chrome\//.test(navigator.userAgent);let bendBox=null,bendMap='',live=0;const bendKey={};
const st=document.createElement('style');st.textContent=`.fa-wv{position:fixed;z-index:9998;pointer-events:none;transform:translate(-50%,-50%);border-radius:50%}.fa-wv b{position:absolute;inset:0;border-radius:50%;-webkit-backdrop-filter:var(--bf);backdrop-filter:var(--bf);-webkit-mask:radial-gradient(closest-side,#000 62%,transparent);mask:radial-gradient(closest-side,#000 62%,transparent);animation:fa-wv var(--d) cubic-bezier(.16,.6,.3,1) both}@keyframes fa-wv{from{transform:scale(.15);opacity:1}to{transform:scale(1);opacity:0}}`;document.head.appendChild(st);
const bendImg=()=>{if(bendMap)return bendMap;const S=128,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d'),m=x.createImageData(S,S);for(let j=0;j<S;j++)for(let i=0;i<S;i++){const u=(i+.5)/S*2-1,v=(j+.5)/S*2-1,r=Math.hypot(u,v),k=(j*S+i)*4,env=r<1?Math.sin(Math.PI*r)**2:0,w=Math.sin(r*Math.PI*5)*env,q=r||1;m.data[k]=128+127*w*u/q;m.data[k+1]=128+127*w*v/q;m.data[k+2]=128;m.data[k+3]=255}x.putImageData(m,0,0);return bendMap=c.toDataURL()};
const bendF=(id,amt,split)=>{const key=amt+'|'+split;if(bendKey[id]===key)return;bendKey[id]=key;if(!bendBox){bendBox=document.createElement('div');bendBox.style.cssText='position:fixed;width:0;height:0;overflow:hidden';document.body.appendChild(bendBox)}let n=bendBox.querySelector('#fa-b-'+id);if(!n){n=document.createElement('div');n.id='fa-b-'+id;bendBox.appendChild(n)}
 const ch=(r,s,m)=>`<feDisplacementMap in="SourceGraphic" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G"/><feColorMatrix values="${m}" result="${r}"/>`;
 n.innerHTML=`<svg width="0" height="0"><filter id="fa-wv-${id}" x="0" y="0" width="100%" height="100%" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB"><feImage href="${bendImg()}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="m"/>${ch('r',amt/200+split/120,'1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0')}${ch('g',amt/200,'0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0')}${ch('b',Math.max(0,amt/200-split/120),'0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0')}<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/></filter></svg>`};
const bend=(id,x,y,R,D,amt,split,blur,max)=>{if(!canWarp||lite()||live>=max)return;live++;bendF(id,amt,split);const z=R*2.4,d=document.createElement('div');d.className='fa-wv';d.style.cssText=`left:${x}px;top:${y}px;width:${z}px;height:${z}px;--d:${D}ms;--bf:url(#fa-wv-${id}) blur(${Math.min(2,blur*.2)}px)`;d.innerHTML='<b></b>';document.body.appendChild(d);setTimeout(()=>{d.remove();live--},D+60)};
const ripple=(e,x,y)=>{if(!e.rippleOn)return;wSetup();const life=e.rippleDuration*1.8*100/Math.max(10,e.rippleSpeed);wTune(e.rippleSpeed,life,e.rippleIntensity,e.rippleAberration,e.rippleBlur,e.rippleTint);for(let i=0;i<e.rippleRings;i++)setTimeout(()=>wDrop(x,y,e.rippleRadius,1),i*170*100/Math.max(25,e.rippleSpeed));if(e.rippleDistort)bend('r',x,y,e.rippleRadius,life*.75,e.rippleDistortAmt,e.rippleAberration,e.rippleBlur,6)};
let lastBend=0;
const stir=(e,x,y,px,py)=>{wSetup();const life=e.waveDuration*100/Math.max(10,e.waveSpeed);wTune(e.waveSpeed,life,e.waveIntensity,e.waveAberration,e.waveBlur,e.waveTint);wDrop(x,y,e.waveRadius,.3);lastBend+=Math.hypot(x-px,y-py);if(e.waveDistort&&lastBend>=e.waveRadius*1.2){lastBend=0;bend('w',x,y,e.waveRadius,life*.75,e.waveDistortAmt,e.waveAberration,e.waveBlur,e.waveTrail)}};

/* One full-screen canvas for followers and bursts; it only draws while something is moving. */
let cv=null,g=null,W=0,H=0,raf=0,last=0,parts=[],tail=[],chain=[],alpha=0,dist=0,mode='';
const p={x:0,y:0,on:false},f={x:0,y:0,seen:false},
 size=()=>{if(!cv)return;const k=Math.min(devicePixelRatio||1,phone()?1.5:2);W=innerWidth;H=innerHeight;cv.width=W*k;cv.height=H*k;g.setTransform(k,0,0,k,0,0)},
 ensure=()=>{if(cv)return;cv=document.createElement('canvas');cv.setAttribute('aria-hidden','true');cv.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:9998;pointer-events:none';g=cv.getContext('2d');document.body.appendChild(cv);size()},
 kick=()=>{ensure();if(!raf){last=performance.now();raf=requestAnimationFrame(tick)}};
addEventListener('resize',size,{passive:true});
const star=(x,y,r,rot)=>{g.save();g.translate(x,y);g.rotate(rot);g.beginPath();for(let i=0;i<8;i++){const a=i*TAU/8,q=i%2?r*.28:r;g.lineTo(Math.cos(a)*q,Math.sin(a)*q)}g.closePath();g.fill();g.restore()},
 plus=(x,y,r,rot)=>{g.save();g.translate(x,y);g.rotate(rot);const t=r*.36;g.fillRect(-r,-t,r*2,t*2);g.fillRect(-t,-r,t*2,r*2);g.restore()},
 draw=q=>{const t=q.age/q.life,a=q.a*(1-t*t);g.fillStyle=g.strokeStyle=rgba(q.c,Math.max(0,a));const r=q.r*(q.k==='ring'?t:q.k==='bubble'?.6+t*.6:1-t*.45);
  if(q.k==='dot'){g.beginPath();g.arc(q.x,q.y,Math.max(.3,r),0,TAU);g.fill()}
  else if(q.k==='star')star(q.x,q.y,r*(.7+.3*Math.sin(q.age*.02)),q.o);
  else if(q.k==='plus')plus(q.x,q.y,r,q.o);
  else if(q.k==='rect'){g.save();g.translate(q.x,q.y);g.rotate(q.o);g.fillRect(-r,-r*.55,r*2,r*1.1);g.restore()}
  else{g.lineWidth=q.k==='ring'?Math.max(.5,3*(1-t)):1.4;g.beginPath();g.arc(q.x,q.y,Math.max(.3,r),0,TAU);g.stroke()}};
const KIND={dust:'dot',sparkles:'star',bubbles:'bubble',crosses:'plus'},SCALE={dust:.09,sparkles:.3,bubbles:.28,crosses:.22};
const emit=(e,x,y)=>{if(parts.length>(phone()?140:320))return;const v=e.chaseSpeed/100,m=e.chase,z=e.chaseSize*SCALE[m],sp=e.chaseSize*.35;
 parts.push({k:KIND[m],x:x+R(-sp,sp),y:y+R(-sp,sp),vx:R(-.5,.5)*v,vy:(m==='bubbles'?R(-1.3,-.5):R(-.5,.6))*v,gr:m==='dust'?.008*v:0,age:0,life:e.chaseLife*R(.6,1.2),r:z*R(.6,1.2),c:Math.random()<.5?e.chaseColor:e.chaseColor2,a:e.chaseOpacity,o:R(0,TAU),vo:R(-.05,.05)})};
const burst=(e,x,y)=>{const n=e.click==='ring'?Math.min(4,Math.ceil(e.clickCount/8)):e.clickCount,v=e.clickSpeed/100,c=()=>Math.random()<.5?e.clickColor:e.clickColor2,z=e.clickSize;
 for(let i=0;i<n&&parts.length<420;i++){const a=i/n*TAU+R(-.3,.3),s=R(1.5,6)*v,L=e.clickLife*R(.7,1.15);
  if(e.click==='ring')parts.push({k:'ring',x,y,vx:0,vy:0,gr:0,age:-i*90,life:e.clickLife,r:z*3,c:i%2?e.clickColor2:e.clickColor,a:.85,o:0,vo:0});
  else if(e.click==='burst')parts.push({k:'dot',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,gr:.03,dr:.96,age:0,life:L,r:z*.09*R(.6,1.3),c:c(),a:1,o:0,vo:0});
  else if(e.click==='confetti')parts.push({k:'rect',x,y,vx:Math.cos(a)*s*1.1,vy:Math.sin(a)*s*1.1-2*v,gr:.13*v,dr:.975,age:0,life:L*1.3,r:z*.12*R(.7,1.3),c:c(),a:1,o:R(0,TAU),vo:R(-.25,.25)});
  else if(e.click==='bubbles')parts.push({k:'bubble',x:x+R(-z,z)*.6,y:y+R(-z,z)*.6,vx:R(-.5,.5)*v,vy:R(-2.4,-.8)*v,gr:0,age:0,life:L*1.4,r:z*.3*R(.5,1.3),c:c(),a:.9,o:0,vo:0});
  else parts.push({k:e.click==='crosses'?'plus':'star',x,y,vx:Math.cos(a)*s*.8,vy:Math.sin(a)*s*.8,gr:.02,dr:.96,age:0,life:L,r:z*.2*R(.6,1.3),c:c(),a:1,o:R(0,TAU),vo:R(-.08,.08)})}
 kick()};
function tick(t){const dt=Math.min(40,t-last||16),n=dt/16.67,e=view();last=t;raf=0;g.clearRect(0,0,W,H);let busy=false;const m=e.chase||'none';
 if(m!==mode){mode=m;chain=[];tail=[];f.seen=false}
 if(m!=='none'){const tgt=p.on?1:0;alpha+=(tgt-alpha)*(1-Math.pow(.86,n));if(Math.abs(tgt-alpha)>.01)busy=true;else alpha=tgt;
  if(!f.seen&&p.on){f.x=p.x;f.y=p.y;f.seen=true}
  const k=1-Math.pow(1-Math.min(.9,.16*e.chaseSpeed/100),n),O=e.chaseOpacity*alpha;f.x+=(p.x-f.x)*k;f.y+=(p.y-f.y)*k;if(Math.hypot(p.x-f.x,p.y-f.y)>.4)busy=true;
  if(alpha>0&&m==='light'){const r=e.chaseSize*5,c=g.createRadialGradient(f.x,f.y,0,f.x,f.y,r);c.addColorStop(0,rgba(e.chaseColor,O));c.addColorStop(.5,rgba(e.chaseColor2,O*.38));c.addColorStop(1,rgba(e.chaseColor2,0));g.fillStyle=c;g.fillRect(f.x-r,f.y-r,r*2,r*2)}
  if(alpha>0&&m==='dots'){const N=Math.round(e.chaseCount);while(chain.length<N)chain.push({x:f.x,y:f.y});chain.length=N;let a=p;chain.forEach((d,i)=>{const q=1-Math.pow(1-Math.min(.9,.34*e.chaseSpeed/100),n);d.x+=(a.x-d.x)*q;d.y+=(a.y-d.y)*q;a=d;if(Math.hypot(d.x-p.x,d.y-p.y)>.6)busy=true;const u=i/Math.max(1,N-1);g.fillStyle=rgba(mix(e.chaseColor,e.chaseColor2,u),O);g.beginPath();g.arc(d.x,d.y,e.chaseSize*.2*(1-u*.75),0,TAU);g.fill()})}
  if(alpha>0&&m==='ring'){g.strokeStyle=rgba(e.chaseColor,O);g.lineWidth=2;g.beginPath();g.arc(f.x,f.y,e.chaseSize*.55,0,TAU);g.stroke();g.fillStyle=rgba(e.chaseColor2,O);g.beginPath();g.arc(p.x,p.y,Math.max(2,e.chaseSize*.08),0,TAU);g.fill()}
  if(m==='comet'){const q=e.chaseLife;tail=tail.filter(a=>t-a.t<q);if(tail.length>1)busy=true;g.lineCap='round';for(let i=1;i<tail.length;i++){const u=1-(t-tail[i].t)/q;g.strokeStyle=rgba(mix(e.chaseColor2,e.chaseColor,u),e.chaseOpacity*u);g.lineWidth=Math.max(.5,e.chaseSize*.3*u);g.beginPath();g.moveTo(tail[i-1].x,tail[i-1].y);g.lineTo(tail[i].x,tail[i].y);g.stroke()}}}
 parts=parts.filter(q=>{q.age+=dt;if(q.age<0)return true;if(q.age>=q.life)return false;if(q.dr){q.vx*=Math.pow(q.dr,n);q.vy*=Math.pow(q.dr,n)}q.vy+=q.gr*n;q.x+=q.vx*n;q.y+=q.vy*n;q.o+=q.vo*n;draw(q);return true});
 if(parts.length)busy=true;if(busy&&!document.hidden)raf=requestAnimationFrame(tick)}
const move=(x,y,pressed)=>{const e=view(),dx=x-(p.x||x),dy=y-(p.y||y),step=Math.hypot(dx,dy);p.x=x;p.y=y;
 if(e.waveOn&&(e.waveWhen!=='press'||pressed||phone())){dist+=step;if(dist>=e.waveSpacing){dist=0;stir(e,x,y,x-dx,y-dy)}}
 const m=e.chase;if(!m||m==='none')return;p.on=true;
 if(KIND[m]){f.gap=(f.gap||0)+step;const gap=Math.max(3,120/e.chaseCount);while(f.gap>=gap){f.gap-=gap;emit(e,x,y)}}
 if(m==='comet')tail.push({x,y,t:performance.now()});kick()};
const end=()=>{p.on=false;f.seen=false;dist=0;const e=view();if(e.chase&&e.chase!=='none')kick()};
addEventListener('pointermove',ev=>{if(ev.pointerType!=='touch')move(ev.clientX,ev.clientY,ev.buttons>0)},{passive:true});
addEventListener('touchmove',ev=>{const t=ev.touches[0];if(t)move(t.clientX,t.clientY,true)},{passive:true});
addEventListener('pointerdown',ev=>{if(ev.pointerType==='touch'){p.x=ev.clientX;p.y=ev.clientY;dist=0;const e=view();if(e.chase&&e.chase!=='none'){p.on=true;kick()}}if(!ev.isPrimary)return;const e=view();ripple(e,ev.clientX,ev.clientY);if(e.click&&e.click!=='none')burst(e,ev.clientX,ev.clientY)},{passive:true});
['touchend','touchcancel'].forEach(n=>addEventListener(n,ev=>{if(!ev.touches.length)end()},{passive:true}));
document.documentElement.addEventListener('mouseleave',end);
})();
