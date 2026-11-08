/* Shared by site and admin: data access, theme, background mesh, click ripple. */
(function(){
const cfg=window.FA_CONFIG||{},D=window.FA_DEFAULTS,URL_=cfg.url,KEY=cfg.anon,demo=!URL_;
const SES='fa_session',DB='fa_demo';
const rs=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}};
const ws=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v))}catch{}};
const merge=(d,v)=>{if(v===undefined||v===null)return d;if(Array.isArray(v)||typeof v!=='object'||typeof d!=='object'||Array.isArray(d)||d===null)return v;const o={...d};for(const k in v)o[k]=merge(d[k],v[k]);return o};
/* Preview backend: same calls as the real one, kept in this browser, used only until Supabase is connected. */
const demoDb=()=>rs(DB)||{sections:{},bookings:[],audit:[],posts:[],keys:{},staff:[
 {id:'a',email:'nokhaizfareedawan@gmail.com',name:'',role:'owner',perms:{},active:true,can_edit:false,is_me:true},
 {id:'b',email:'hamzairshad25@gmail.com',name:'',role:'owner',perms:{},active:true,can_edit:false,is_me:false}]};
const demoRpc=(n,a)=>{const d=demoDb(),log=(action,area,detail={})=>d.audit.unshift({id:Date.now(),at:new Date().toISOString(),actor_email:'preview',action,area,detail});let r=null;
 switch(n){case'my_profile':r={id:'a',email:'nokhaizfareedawan@gmail.com',role:'owner',real_role:'owner',perms:{},must_change_password:false};break;
 case'list_staff':r=d.staff;break;
 case'set_staff':Object.assign(d.staff.find(s=>s.id===a.target),{role:a.new_role,perms:a.new_perms,name:a.new_name,active:a.new_active});log('Changed staff member','users');break;
 case'save_section':d.sections[a.k]=a.v;log('Saved section',a.k,{fields:Object.keys(a.v)});r=new Date().toISOString();break;
 case'create_booking':r=Math.random().toString(36).slice(2,9).toUpperCase();d.bookings.unshift({...a.b,id:r,ref:r,kind:a.b.kind||'booking',status:'new',notes:'',created_at:new Date().toISOString(),total:0});log('New booking','bookings',{ref:r});break;
 case'list_bookings':r=d.bookings;break;
 case'update_booking':Object.assign(d.bookings.find(b=>b.id===a.i),{status:a.new_status,notes:a.new_notes});log('Updated booking','bookings');break;
 case'list_audit':r=d.audit;break;case'list_posts':r=d.posts;break;
 case'save_post':{const i=a.p.id||String(Date.now());d.posts=d.posts.filter(p=>p.id!==i);d.posts.unshift({...a.p,id:i,created_at:new Date().toISOString()});log('Saved article','blog');r=i;break}
 case'delete_post':d.posts=d.posts.filter(p=>p.id!==a.i);log('Deleted article','blog');break;
 case'set_ai_key':d.keys[a.p]=a.k;log('Saved AI key','blog_agent',{ending:a.k.slice(-3)});break;
 case'ai_keys_info':r=Object.keys(d.keys).map(p=>({provider:p,last3:d.keys[p].slice(-3),can_view:true}));break;
 case'reveal_ai_key':r=d.keys[a.p];log('Viewed AI key','blog_agent');break;case'password_changed':break;}
 ws(DB,d);return r};
const session=()=>rs(SES);
const hdr=()=>({apikey:KEY,'content-type':'application/json',authorization:'Bearer '+(session()?.access_token||KEY)});
async function refresh(){const s=session();if(!s||Date.now()<s.exp-60000)return;const r=await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});if(r.ok){const j=await r.json();ws(SES,{...j,exp:Date.now()+j.expires_in*1e3})}else ws(SES,null)}
const WGHT={'Lato':'400;700;900','Merriweather':'400;700;900','Noto Nastaliq Urdu':'400;700','Noto Naskh Arabic':'400;700','Amiri':'400;700','Scheherazade New':'400;700','Lateef':'400;700','Gulzar':'400'};
const FA=window.FA={demo,D,merge,
 sections(c,view){const own=c.views?.[view]?.sections,base=own&&own.length?own:c.layout.sections,out=base.map(x=>({...x}));D.layout.sections.forEach((x,i)=>{if(!out.some(y=>y.id===x.id)){const b=i&&out.findIndex(y=>y.id===D.layout.sections[i-1].id);out.splice(b>=0&&i?b+1:Math.min(i,out.length),0,{...x})}});return out},
 setIcon(u){let l=document.querySelector('link[rel=icon]');if(!l){l=document.createElement('link');l.rel='icon';document.head.appendChild(l)}l.href=u||'/favicon.png'},
 async shrink(f,o){if(!o?.compress||!/^image\/(jpeg|png|webp)$/.test(f.type))return f;try{const b=await createImageBitmap(f),k=Math.min(1,o.maxWidth/b.width),c=document.createElement('canvas');c.width=Math.round(b.width*k);c.height=Math.round(b.height*k);c.getContext('2d').drawImage(b,0,0,c.width,c.height);const out=await new Promise(ok=>c.toBlob(ok,'image/webp',o.quality));return out&&out.size<f.size?new File([out],f.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'}):f}catch{return f}},
 async content(){let rows={};if(demo)rows=demoDb().sections;else{try{const r=await fetch(`${URL_}/rest/v1/site_sections?select=key,data`,{headers:{apikey:KEY,authorization:'Bearer '+KEY},cache:'no-store'});(await r.json()).forEach(x=>rows[x.key]=x.data)}catch{}}
  if(new URLSearchParams(location.search).has('fa_preview')){const p=rs('fa_preview');if(p)Object.assign(rows,p)}
  const o={};for(const k in D)o[k]=merge(D[k],rows[k]);return o},
 /* Returning visitors get the page at once from saved content, then it is checked against the database. */
 async contentFast(){const q=new URLSearchParams(location.search);if(demo||q.has('fa_preview'))return FA.content();
  const build=r=>{const o={};for(const k in D)o[k]=merge(D[k],r[k]);return o},get=async()=>{const r=await fetch(`${URL_}/rest/v1/site_sections?select=key,data&order=key`,{headers:{apikey:KEY,authorization:'Bearer '+KEY},cache:'no-store'});if(!r.ok)throw 0;const o={};(await r.json()).forEach(x=>o[x.key]=x.data);if(o.optimize)delete o.optimize.history;return o};
  let old=null;try{old=localStorage.getItem('fa_rows')}catch{}
  const put=t=>{try{localStorage.setItem('fa_rows',t)}catch{}};
  if(old){try{const rows=JSON.parse(old);get().then(n=>{const t=JSON.stringify(n);if(t!==old){put(t);let last=0;try{last=+sessionStorage.getItem('fa_rl')||0;sessionStorage.setItem('fa_rl',Date.now())}catch{}if(Date.now()-last>15000)location.reload()}}).catch(()=>{});return build(rows)}catch{}}
  try{const n=await get();put(JSON.stringify(n));return build(n)}catch{return build({})}},
 async token(){if(demo)return"";await refresh();return session()?.access_token||""},
 async rpc(n,a={}){if(demo)return demoRpc(n,a);await refresh();const r=await fetch(`${URL_}/rest/v1/rpc/${n}`,{method:'POST',headers:hdr(),body:JSON.stringify(a)});const t=await r.text(),j=t?JSON.parse(t):null;if(!r.ok)throw new Error(j?.message||'Something went wrong');return j},
 async posts(){if(demo)return demoDb().posts.filter(p=>p.status==='published');const r=await fetch(`${URL_}/rest/v1/blog_posts?select=*&order=published_at.desc`,{headers:{apikey:KEY}});return r.json()},
 async login(e,p){if(demo){ws(SES,{demo:1});return}const r=await fetch(`${URL_}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({email:e,password:p})});const j=await r.json();if(!r.ok)throw new Error('Wrong email or password');ws(SES,{...j,exp:Date.now()+j.expires_in*1e3})},
 logout(){ws(SES,null)},session,
 async setPassword(p){if(demo)return;await refresh();const r=await fetch(`${URL_}/auth/v1/user`,{method:'PUT',headers:hdr(),body:JSON.stringify({password:p})});if(!r.ok)throw new Error((await r.json()).msg||'Could not change the password');await FA.rpc('password_changed')},
 async adminChat(b){await refresh();const r=await fetch(`${URL_}/functions/v1/admin-chat`,{method:'POST',headers:hdr(),body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'The helper could not answer');return j},
 async sendEmail(b){await refresh();const r=await fetch(`${URL_}/functions/v1/send-email`,{method:'POST',headers:hdr(),body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Could not send');return j},
 async staffAdmin(b){if(demo){const d=demoDb();if(b.action==='create')d.staff.push({id:String(Date.now()),email:b.email,name:b.name,role:b.role,perms:b.perms,active:true,can_edit:true});else d.staff=d.staff.filter(s=>s.id!==b.id);ws(DB,d);return}await refresh();const r=await fetch(`${URL_}/functions/v1/staff-admin`,{method:'POST',headers:hdr(),body:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j},
 async upload(f){if(demo)return new Promise(ok=>{const r=new FileReader;r.onload=()=>ok(r.result);r.readAsDataURL(f)});await refresh();const n=Date.now()+'-'+f.name.replace(/[^a-z0-9.]+/gi,'-');const r=await fetch(`${URL_}/storage/v1/object/media/${n}`,{method:'POST',headers:{apikey:KEY,authorization:hdr().authorization,'content-type':f.type||'image/png'},body:f});if(!r.ok){let m='';try{m=(await r.json()).message}catch{}throw new Error('Upload failed'+(m?': '+m:''))}return `${URL_}/storage/v1/object/public/media/${n}`},
 esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 applyTheme(c){const t=c.theme,e=c.effects,o=c.optimize||{},h=document.documentElement,r=h.style,ur=h.lang==='ur';
  const fh=ur?t.urduFont:t.siteFont||t.headingFont,fb=ur?t.urduFont:t.siteFont||t.bodyFont;
  let blur=e.glassBlur*(1+(e.frost??0)/50);if(o.mobileBlurCap&&matchMedia('(max-width:860px)').matches)blur=Math.min(blur,o.mobileBlurCap);
  r.setProperty('--base',t.base);r.setProperty('--accent',t.accent);r.setProperty('--hi',t.highlight);r.setProperty('--radius',t.radius+'px');r.setProperty('--fh',`"${fh}",system-ui,sans-serif`);r.setProperty('--fb',`"${fb}",system-ui,sans-serif`);r.setProperty('--glass-blur',blur.toFixed(1)+'px');
  r.setProperty('--card',`rgba(255,255,255,${e.frostMilk})`);r.setProperty('--card-b',`rgba(255,255,255,${e.frostEdge})`);r.setProperty('--nav-bg',`rgba(255,255,255,${Math.min(.95,e.frostMilk+.12)})`);r.setProperty('--glass-sat',e.frostSat+'%');r.setProperty('--grain',e.frostGrain);r.setProperty('--glow',e.frostGlow+'%');
  h.classList.toggle('no-glass',!e.glassOn);
  let l=document.getElementById('fa-fonts');if(!l){l=document.createElement('link');l.id='fa-fonts';l.rel='stylesheet';document.head.appendChild(l)}
  l.href='https://fonts.googleapis.com/css2?'+[...new Set([fh,fb])].map(f=>'family='+encodeURIComponent(f)+':wght@'+(WGHT[f]||'400;500;600;700;800')).join('&')+'&display=swap'},
 meshTile(e){const s=e.meshSize,c=e.meshColor||'#14396f',sw=e.meshStroke??1.3,N=e.meshDensity??40,st=e.meshStyle||'benzene';let seed=Math.max(1,Math.round(e.meshSeed||7))*48271%2147483647;const R=()=>(seed=seed*16807%2147483647)/2147483647,h=s*Math.sqrt(3),b=h/2;
  const hex=(x,y,r=s,rot=0,ring=.5)=>{const p=[...Array(6)].map((_,i)=>[x+r*Math.cos(rot+i*Math.PI/3),y+r*Math.sin(rot+i*Math.PI/3)]);return `<path d="M${p.map(q=>q.map(n=>n.toFixed(1)).join(' ')).join('L')}Z"/>`+(ring?`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r*ring).toFixed(1)}"/>`:'')};
  const gap=Math.max(10,s*(2.4-N/55));let W=3*s,H=h,body='';
  if(st==='benzene'||st==='honeycomb'){const q=st==='benzene'?.5:0;body=hex(s,b,s,0,q)+hex(2.5*s,0,s,0,q)+hex(2.5*s,h,s,0,q)+hex(-.5*s,0,s,0,q)+hex(-.5*s,h,s,0,q)}
  else if(st==='random'){W=H=Math.max(600,s*22);const n=Math.min(140,Math.round(N/100*W*H/(s*s*12)));for(let i=0;i<n;i++){const r=s*(.5+R()*1.1),x=r+R()*(W-2*r),y=r+R()*(H-2*r);body+=`<g opacity="${(.35+R()*.65).toFixed(2)}">${hex(x,y,r,R()*Math.PI,.5)}</g>`}}
  else if(st==='molecules'){W=H=Math.max(600,s*20);const n=Math.round(N/100*14)+2;for(let i=0;i<n;i++){let x=s*2+R()*(W-4*s),y=s*2+R()*(H-4*s),a=R()*6.28;const k=2+Math.floor(R()*3);for(let j=0;j<k;j++){const r=s*.7;body+=hex(x,y,r,a,.5);const nx=x+Math.cos(a)*r*3.2,ny=y+Math.sin(a)*r*3.2;if(j<k-1&&nx>s&&nx<W-s&&ny>s&&ny<H-s){body+=`<path d="M${(x+Math.cos(a)*r).toFixed(1)} ${(y+Math.sin(a)*r).toFixed(1)}L${(nx-Math.cos(a)*r).toFixed(1)} ${(ny-Math.sin(a)*r).toFixed(1)}"/>`;x=nx;y=ny;a+=(R()-.5)*1.6}else{body+=`<circle cx="${(x+Math.cos(a)*r*1.7).toFixed(1)}" cy="${(y+Math.sin(a)*r*1.7).toFixed(1)}" r="${(r*.14).toFixed(1)}" fill="${c}"/>`;break}}}}
  else if(st==='dots'){W=H=gap;body=`<circle cx="${gap/2}" cy="${gap/2}" r="${Math.max(1,s*.07).toFixed(1)}" fill="${c}" stroke="none"/>`}
  else if(st==='grid'){W=H=gap;body=`<path d="M${gap} 0V${gap}H0"/>`}
  else if(st==='crosses'){W=H=gap*1.7;const m=W/2,a=s*.22;body=`<path d="M${m-a} ${m}H${m+a}M${m} ${m-a}V${m+a}" stroke-linecap="round"/>`}
  else if(st==='waves'){W=s*6;H=gap;const y=H/2,a=Math.min(H*.7,s*.5);body=`<path d="M0 ${y}Q${W/4} ${y-a} ${W/2} ${y}T${W} ${y}"/>`}
  else if(st==='dna'){W=s*4;H=s*7;const m=W/2,a=W*.36,wave=f=>`M${m} 0C${m+f*a} ${H*.17} ${m+f*a} ${H*.33} ${m} ${H*.5}S${m-f*a} ${H*.83} ${m} ${H}`;body=`<path d="${wave(1)}"/><path d="${wave(-1)}"/>`;for(let i=1;i<8;i++){if(i===4)continue;const t=i/8,x=Math.sin(t*2*Math.PI)*a*.82;body+=`<path d="M${(m-x).toFixed(1)} ${(H*t).toFixed(1)}L${(m+x).toFixed(1)} ${(H*t).toFixed(1)}"/>`}}
  return{W,H,uri:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H.toFixed(1)}" fill="none" stroke="${c}" stroke-width="${sw}">${body}</svg>`)}},
 mesh(e){let m=document.getElementById('fa-mesh');if(m)m.remove();if(!e.meshOn)return;
  const {W,H,uri}=FA.meshTile(e);
  m=document.createElement('div');m.id='fa-mesh';m.setAttribute('aria-hidden','true');
  const sp=e.meshSpeed||90,mv=e.meshMotion!==false;
  if(e.meshLayout==='full')m.innerHTML=`<i style="inset:0;-webkit-mask:none;mask:none;opacity:${e.meshOpacity}"><s style="inset:-${H.toFixed(1)}px 0 0 -${W}px;background-image:url('${uri}');--mx:${W}px;--my:${H.toFixed(1)}px;${mv?`animation:meshdrift ${sp}s linear infinite`:''}"></s></i>`;else m.innerHTML=[['-6%','2%','40vw',1],['68%','16%','34vw',.7],['12%','38%','30vw',.55],['62%','58%','38vw',.8],['-4%','78%','32vw',.5]].map(([l,t,w,o],i)=>`<b style="left:${l};top:${t};width:${w};height:${w};min-width:260px;min-height:260px;${mv?`animation:meshfloat ${sp*.6}s ease-in-out ${-i*7}s infinite alternate`:''}"><i style="opacity:${o*e.meshOpacity}"><s style="inset:-${H.toFixed(1)}px 0 0 -${W}px;background-image:url('${uri}');--mx:${W}px;--my:${H.toFixed(1)}px;${mv?`animation:meshdrift ${sp}s linear ${-i*11}s infinite ${i%2?'reverse':''}`:''}"></s></i></b>`).join('');
  document.body.prepend(m);
  /* Rings start below the home section; pages without one use the whole page. */
  const place=()=>{const h=e.meshBehindHero?null:document.querySelector('.hero');m.style.top=(h?h.getBoundingClientRect().bottom+scrollY:0)+'px'};place();
  FA._mo?.disconnect();if(window.ResizeObserver){FA._mo=new ResizeObserver(place);FA._mo.observe(document.body)}},
 /* Hover animation for section widgets. The site and the admin sample cards share this, so the preview is exact. */
 hoverSel:{services:'#services .card',team:'#team .person',panels:'#panels .card',glance:'.gl-i',trust:'.trust-i',gallery:'.gal-i',faq:'#faq details',visit:'.visit',tests:'.ti'},
 hoverCss(h,only){if(!h||!h.on)return'';const list=only?[only]:Object.keys(FA.hoverSel).filter(k=>h[k]).map(k=>FA.hoverSel[k]);if(!list.length)return'';
  const a=Math.max(0,+h.amount||0),ms=Math.max(0,+h.speed||0),[dx,dy]={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],upleft:[-.7,-.7],upright:[.7,-.7],downleft:[-.7,.7],downright:[.7,.7]}[h.direction]||[0,-1],col=/^#[0-9a-f]{3,8}$/i.test(h.color||'')?h.color:'#0c8f8b',ease={smooth:'cubic-bezier(.2,.8,.2,1)',snappy:'cubic-bezier(.85,0,.15,1)',bouncy:'cubic-bezier(.34,1.56,.64,1)',gentle:'ease-in-out',linear:'linear'}[h.ease]||'ease',n=x=>+x.toFixed(3),mv=k=>`translate(${n(dx*a*k)}px,${n(dy*a*k)}px)`,soft=`0 ${n(a*.5)}px ${n(a*1.1)}px -${n(a*.45)}px rgba(20,30,50,.45)`;
  const FX={lift:{t:mv(.4),s:soft},slide:{t:mv(.4)},grow:{t:`scale(${n(1+a*.002)})`,s:soft},shrink:{t:`perspective(320px) translateZ(-${n(a*.5)}px)`},tilt:{p:`perspective(700px) rotateX(${n(-dy*a*.3)}deg) rotateY(${n(dx*a*.3)}deg)`,s:soft},glow:{s:`0 0 ${n(a*.8)}px ${n(a*.14)}px ${col}`},ring:{s:`0 0 0 ${n(Math.max(1,a*.1))}px ${col}`},wash:{s:`inset 0 0 0 999px color-mix(in srgb,${col} ${n(Math.min(70,a*.5))}%,transparent)`},shine:{shine:1},image:{img:1},float:{a0:'translate(0,0)',a1:mv(.3)},pulse:{a0:'scale(1)',a1:`scale(${n(1+a*.0015)})`},wiggle:{a0:`rotate(-${n(a*.06)}deg)`,a1:`rotate(${n(a*.06)}deg)`}};
  const fx=[h.effect,h.effect2].map(k=>FX[k]).filter(Boolean),pre=fx.map(f=>f.p||'').join(''),T=pre+fx.map(f=>f.t||'').join(''),sh=fx.map(f=>f.s).filter(Boolean).join(','),a0=fx.map(f=>f.a0||'').join(''),a1=fx.map(f=>f.a1||'').join(''),anim=!!a0,img=fx.some(f=>f.img),shine=fx.some(f=>f.shine),from=dx<0?'120%':'-120%',to=dx<0?'-120%':'120%';
  const X=list.map(x=>'html '+x).join(','),on=s=>list.map(x=>`html ${x}:hover${s}`).join(','),pr=s=>list.map(x=>`html ${x}.press${s}`).join(','),both=(s,b)=>`@media(hover:hover){${on(s)}{${b}}}`+(only||h.touch?`${pr(s)}{${b}}`:''),tr=`${ms}ms ${ease}`;
  let c=`${X}{transition:transform ${tr},box-shadow ${tr}!important${img||shine?';overflow:hidden':''}}`,b='';if(anim){const k='hv'+(only?'p':'s');c+=`@keyframes ${k}{from{transform:${T} ${a0}}to{transform:${T} ${a1}}}`;b+=`animation:${k} ${Math.max(240,ms*2)}ms ease-in-out infinite alternate;`}else if(T)b+=`transform:${T}!important;`;if(sh)b+=`box-shadow:${sh}!important;`;if(b)c+=both('',b);
  if(img){const G=list.map(x=>`html ${x} img`).join(',');c+=`${G}{transition:transform ${tr}}`+both(' img',`transform:scale(${n(1+a*.004)})`)}
  if(shine){c+=list.map(x=>`html ${x}::after`).join(',')+`{content:""!important;display:block!important;position:absolute;inset:0;opacity:1!important;pointer-events:none;border-radius:inherit;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,${n(Math.min(.95,.25+a*.008))}) 50%,transparent 70%)!important;transform:translateX(${from});transition:transform ${tr}}`+both('::after',`transform:translateX(${to})`)}
  return c},
 /* Touch screens have no hover: a finger on a button, or dragged across buttons, shows the same animation. */
 press(extra=''){if(FA._p||!matchMedia('(hover:none),(pointer:coarse)').matches)return;FA._p=1;const S='.btn,.chip,.lang,.person,.trust-i',S0=extra?S+','+extra:S;let cur=null,last=0;
  const set=el=>{if(el===cur)return;if(cur){const o=cur;o._pt=setTimeout(()=>o.classList.remove('press'),170)}cur=el;if(el){clearTimeout(el._pt);el.classList.add('press')}};
  const at=t=>{const n=document.elementFromPoint(t.clientX,t.clientY);return n&&n.closest?n.closest(S):null};
  const opt={passive:true,capture:true};document.addEventListener('touchstart',ev=>set(ev.target.closest?.(S0)||null),opt);
  document.addEventListener('touchmove',ev=>{const now=performance.now();if(now-last<48)return;last=now;set(at(ev.touches[0]))},opt);
  for(const n of['touchend','touchcancel'])document.addEventListener(n,()=>set(null),opt)},
 ripple(getE){if(FA._r)return;FA._r=1;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  document.addEventListener('pointerdown',ev=>{const e=getE();if(!e||!e.rippleOn)return;const R=e.rippleRadius,I=e.rippleIntensity,A=e.rippleAberration,D_=e.rippleDuration;
   const w=document.createElement('div');w.className='fa-ripple';w.style.cssText=`left:${ev.clientX}px;top:${ev.clientY}px;width:${R*2}px;height:${R*2}px;--d:${D_}ms;--blur:${e.rippleBlur}px`;
   let h='<b class="lens"></b>';for(let i=0;i<e.rippleRings;i++){const dl=i*D_*.14;[['#ff2a55',-A,A*.4],['#22ff99',0,-A*.5],['#2a7bff',A,A*.4]].forEach(([c,x,y])=>{h+=`<u style="border-color:${c};transform-origin:50% 50%;translate:${x}px ${y}px;opacity:${I};animation-delay:${dl}ms"></u>`});h+=`<u style="border-color:${e.rippleTint};border-width:3px;opacity:${I};animation-delay:${dl}ms"></u>`}
   w.innerHTML=h;document.body.appendChild(w);setTimeout(()=>w.remove(),D_*(1+e.rippleRings*.2)+80)},{passive:true})}
};
})();
