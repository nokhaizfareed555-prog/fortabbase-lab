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
const FA=window.FA={demo,D,merge,
 async content(){let rows={};if(demo)rows=demoDb().sections;else{try{const r=await fetch(`${URL_}/rest/v1/site_sections?select=key,data`,{headers:{apikey:KEY,authorization:'Bearer '+KEY},cache:'no-store'});(await r.json()).forEach(x=>rows[x.key]=x.data)}catch{}}
  const o={};for(const k in D)o[k]=merge(D[k],rows[k]);return o},
 async rpc(n,a={}){if(demo)return demoRpc(n,a);await refresh();const r=await fetch(`${URL_}/rest/v1/rpc/${n}`,{method:'POST',headers:hdr(),body:JSON.stringify(a)});const t=await r.text(),j=t?JSON.parse(t):null;if(!r.ok)throw new Error(j?.message||'Something went wrong');return j},
 async posts(){if(demo)return demoDb().posts.filter(p=>p.status==='published');const r=await fetch(`${URL_}/rest/v1/blog_posts?select=*&order=published_at.desc`,{headers:{apikey:KEY}});return r.json()},
 async login(e,p){if(demo){ws(SES,{demo:1});return}const r=await fetch(`${URL_}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({email:e,password:p})});const j=await r.json();if(!r.ok)throw new Error('Wrong email or password');ws(SES,{...j,exp:Date.now()+j.expires_in*1e3})},
 logout(){ws(SES,null)},session,
 async setPassword(p){if(demo)return;await refresh();const r=await fetch(`${URL_}/auth/v1/user`,{method:'PUT',headers:hdr(),body:JSON.stringify({password:p})});if(!r.ok)throw new Error((await r.json()).msg||'Could not change the password');await FA.rpc('password_changed')},
 async staffAdmin(b){if(demo){const d=demoDb();if(b.action==='create')d.staff.push({id:String(Date.now()),email:b.email,name:b.name,role:b.role,perms:b.perms,active:true,can_edit:true});else d.staff=d.staff.filter(s=>s.id!==b.id);ws(DB,d);return}await refresh();const r=await fetch(`${URL_}/functions/v1/staff-admin`,{method:'POST',headers:hdr(),body:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j},
 async upload(f){if(demo)return new Promise(ok=>{const r=new FileReader;r.onload=()=>ok(r.result);r.readAsDataURL(f)});await refresh();const n=Date.now()+'-'+f.name.replace(/[^a-z0-9.]+/gi,'-');const r=await fetch(`${URL_}/storage/v1/object/media/${n}`,{method:'POST',headers:{apikey:KEY,authorization:hdr().authorization,'content-type':f.type},body:f});if(!r.ok)throw new Error('Upload failed');return `${URL_}/storage/v1/object/public/media/${n}`},
 esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 applyTheme(c){const t=c.theme,e=c.effects,r=document.documentElement.style;
  r.setProperty('--base',t.base);r.setProperty('--accent',t.accent);r.setProperty('--hi',t.highlight);r.setProperty('--radius',t.radius+'px');r.setProperty('--fh',`"${t.headingFont}",system-ui,sans-serif`);r.setProperty('--fb',`"${t.bodyFont}",system-ui,sans-serif`);r.setProperty('--glass-blur',e.glassBlur+'px');
  document.documentElement.classList.toggle('no-glass',!e.glassOn);
  let l=document.getElementById('fa-fonts');if(!l){l=document.createElement('link');l.id='fa-fonts';l.rel='stylesheet';document.head.appendChild(l)}
  l.href='https://fonts.googleapis.com/css2?'+[...new Set([t.headingFont,t.bodyFont])].map(f=>'family='+encodeURIComponent(f)+':wght@400;500;600;700;800').join('&')+'&display=swap'},
 mesh(e){let m=document.getElementById('fa-mesh');if(m)m.remove();if(!e.meshOn)return;
  const s=e.meshSize,h=s*Math.sqrt(3),a=s*.5,b=h/2,R=s*.5;
  const hex=(x,y)=>{const p=[...Array(6)].map((_,i)=>[x+s*Math.cos(i*Math.PI/3),y+s*Math.sin(i*Math.PI/3)]);return `<path d="M${p.map(q=>q.map(n=>n.toFixed(1)).join(' ')).join('L')}Z"/><circle cx="${x}" cy="${y}" r="${R.toFixed(1)}"/>`};
  const W=3*s,H=h,tile=hex(s,b)+hex(s+1.5*s,0)+hex(s+1.5*s,h)+hex(-.5*s,0)+hex(-.5*s,h);
  const uri='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H.toFixed(1)}" fill="none" stroke="#14396f" stroke-width="2.4">${tile}</svg>`);
  m=document.createElement('div');m.id='fa-mesh';m.setAttribute('aria-hidden','true');
  m.innerHTML=[['-4%','6%','46vw',1],['66%','38%','42vw',.65],['8%','72%','36vw',.45]].map(([l,t,w,o])=>`<i style="left:${l};top:${t};width:${w};height:${w};min-width:300px;min-height:300px;opacity:${o*e.meshOpacity};background-image:url('${uri}')"></i>`).join('');
  document.body.prepend(m)},
 ripple(getE){if(FA._r)return;FA._r=1;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  document.addEventListener('pointerdown',ev=>{const e=getE();if(!e||!e.rippleOn)return;const R=e.rippleRadius,I=e.rippleIntensity,A=e.rippleAberration,D_=e.rippleDuration;
   const w=document.createElement('div');w.className='fa-ripple';w.style.cssText=`left:${ev.clientX}px;top:${ev.clientY}px;width:${R*2}px;height:${R*2}px;--d:${D_}ms;--blur:${e.rippleBlur}px`;
   let h='<b class="lens"></b>';for(let i=0;i<e.rippleRings;i++){const dl=i*D_*.14;[['#ff2a55',-A,A*.4],['#22ff99',0,-A*.5],['#2a7bff',A,A*.4]].forEach(([c,x,y])=>{h+=`<u style="border-color:${c};transform-origin:50% 50%;translate:${x}px ${y}px;opacity:${I};animation-delay:${dl}ms"></u>`});h+=`<u style="border-color:${e.rippleTint};border-width:3px;opacity:${I};animation-delay:${dl}ms"></u>`}
   w.innerHTML=h;document.body.appendChild(w);setTimeout(()=>w.remove(),D_*(1+e.rippleRings*.2)+80)},{passive:true})}
};
})();
