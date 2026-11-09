/* Drag wave, cursor and finger followers, and click bursts. Loaded only when one of them is on.
   Settings come from FA._fxGet(); FA.fxView() swaps in the phone values (m_ keys) on small screens. */
(()=>{
const FA=window.FA;if(!FA||FA._fxRun)return;FA._fxRun=1;
const view=()=>FA.fxView(FA._fxGet()),phone=()=>matchMedia('(max-width:860px)').matches,
 lite=()=>document.documentElement.classList.contains('lite'),TAU=Math.PI*2,R=(a,b)=>a+Math.random()*(b-a),
 hex=c=>{const n=parseInt(String(c||'#2f9bff').slice(1),16);return[n>>16&255,n>>8&255,n&255]},
 rgba=(c,a)=>{const x=hex(c);return`rgba(${x[0]},${x[1]},${x[2]},${a})`},
 mix=(a,b,t)=>{const x=hex(a),y=hex(b);return'#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('')};

/* Water wave: glass rings left behind along the drag path. */
const st=document.createElement('style');st.textContent=`.fa-wv{position:fixed;z-index:9999;pointer-events:none;transform:translate(-50%,-50%);border-radius:50%}.fa-wv b,.fa-wv i{position:absolute;inset:0;border-radius:50%;animation:fa-wv var(--d) cubic-bezier(.2,.7,.2,1) both}.fa-wv b{-webkit-backdrop-filter:var(--bf);backdrop-filter:var(--bf);-webkit-mask:radial-gradient(closest-side,transparent 34%,#000 66%,transparent);mask:radial-gradient(closest-side,transparent 34%,#000 66%,transparent)}@keyframes fa-wv{from{transform:scale(.12);opacity:1}to{transform:scale(1);opacity:0}}`;document.head.appendChild(st);
/* True red, green and blue split of the page under the wave. Chrome, Edge and Samsung Internet only; others show blur and colored edges. */
const canWarp=/Chrome\//.test(navigator.userAgent);let warpOf=null,warpAmt=-1,live=0;
const warp=(amt,split)=>{const key=amt+'|'+split;if(warpOf&&warpAmt===key)return;warpAmt=key;
 if(!warpOf){warpOf=document.createElement('div');warpOf.style.cssText='position:fixed;width:0;height:0;overflow:hidden';document.body.appendChild(warpOf)}
 const ch=(n,s,m)=>`<feDisplacementMap in="SourceGraphic" in2="n" scale="${s}" xChannelSelector="R" yChannelSelector="G"/><feColorMatrix values="${m}" result="${n}"/>`;
 warpOf.innerHTML=`<svg width="0" height="0"><filter id="fa-wv-f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="2" seed="4" result="n"/>${ch('r',amt+split*2,'1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0')}${ch('g',amt,'0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0')}${ch('b',Math.max(0,amt-split*2),'0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0')}<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/></filter></svg>`};
const stamp=(x,y,e)=>{if(live>=e.waveTrail)return;live++;const r=e.waveRadius,D=e.waveDuration*100/Math.max(10,e.waveSpeed),A=e.waveAberration,I=e.waveIntensity,s=(e.waveBlur*.8+1).toFixed(1);
 let bf=`blur(${e.waveBlur}px)`;if(e.waveDistort&&canWarp&&!lite()&&e.waveDistortAmt>0){warp(e.waveDistortAmt,A);bf=`url(#fa-wv-f) ${bf}`}
 const red=`rgba(255,42,85,${I})`,grn=`rgba(34,255,153,${I*.7})`,blu=`rgba(42,123,255,${I})`,d=document.createElement('div');d.className='fa-wv';d.style.cssText=`left:${x}px;top:${y}px;width:${r*2}px;height:${r*2}px;--d:${D}ms;--bf:${bf}`;
 d.innerHTML=`<b></b><i style="box-shadow:${-A}px 0 ${s}px -1px ${red},${A}px 0 ${s}px -1px ${blu},0 ${A*.6}px ${s}px -1px ${grn},inset ${A}px 0 ${s}px -1px ${red},inset ${-A}px 0 ${s}px -1px ${blu},inset 0 0 0 1px ${rgba(e.waveTint,I)}"></i>`;
 document.body.appendChild(d);setTimeout(()=>{d.remove();live--},D+60)};

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
 if(e.waveOn&&(e.waveWhen!=='press'||pressed||phone())){dist+=step;if(dist>=e.waveSpacing){dist=0;stamp(x,y,e)}}
 const m=e.chase;if(!m||m==='none')return;p.on=true;
 if(KIND[m]){f.gap=(f.gap||0)+step;const gap=Math.max(3,120/e.chaseCount);while(f.gap>=gap){f.gap-=gap;emit(e,x,y)}}
 if(m==='comet')tail.push({x,y,t:performance.now()});kick()};
const end=()=>{p.on=false;f.seen=false;dist=0;const e=view();if(e.chase&&e.chase!=='none')kick()};
addEventListener('pointermove',ev=>{if(ev.pointerType!=='touch')move(ev.clientX,ev.clientY,ev.buttons>0)},{passive:true});
addEventListener('touchmove',ev=>{const t=ev.touches[0];if(t)move(t.clientX,t.clientY,true)},{passive:true});
addEventListener('pointerdown',ev=>{if(ev.pointerType==='touch'){p.x=ev.clientX;p.y=ev.clientY;dist=0;const e=view();if(e.chase&&e.chase!=='none'){p.on=true;kick()}}if(!ev.isPrimary)return;const e=view();if(e.click&&e.click!=='none')burst(e,ev.clientX,ev.clientY)},{passive:true});
['touchend','touchcancel'].forEach(n=>addEventListener(n,ev=>{if(!ev.touches.length)end()},{passive:true}));
document.documentElement.addEventListener('mouseleave',end);
})();
