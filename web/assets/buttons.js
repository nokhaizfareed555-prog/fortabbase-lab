/* Button look from Admin > Look > Buttons, shared by the public site (site.js) and the admin panels.
   FA.btnCss(content, {lang, page}) returns the CSS for style#fa-btns: desktop rules above 860px, phone rules (m_ keys) at 860px and below. */
(function(){FA.btnCss=function(C,o){o=o||{};const lang=o.lang||'',pg=o.page||'';
const b=C.buttons,P='body[data-page]',R={nav:`.nav .btn,.dock .btn`,hero:`.hero .btn`,panels:`#panels .btn`,tests:`${P} #main .btn`,reports:`${P} #main .btn`,form:`${P} #main .f .btn,${P} #qp .f .btn,${P} #main .rp-f .btn`,dialog:`.dlg .btn,.popd .btn`},GLASS='0 0 22px 3px color-mix(in srgb,var(--base) 16%,transparent),0 16px 26px -14px rgba(20,30,50,.42),0 3px 8px -3px rgba(20,30,50,.16),inset 0 1px 0 rgba(255,255,255,.45)',ink=c=>{const f=i=>{const x=parseInt(c.substr(i,2),16)/255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)};return(.2126*f(1)+.7152*f(3)+.0722*f(5))>.4?'#10231a':'#ffffff'};
 const build=p=>{const v=k=>b[p+k],L=k=>v(k)==='same'?b[k]:v(k),X='.btn:not(#_)',all=+v('allRadius');let c='';
  if(all<32)c+=`.btn,.chip,.lang,.crumbs>a,nav.seo-crumbs a,.gc-pill{border-radius:${all}px}`;
  if(v('perArea'))for(const k in R){if((k==='tests'&&pg!=='tests')||(k==='reports'&&pg!=='reports'))continue;const r=+v(k+'Radius');if(r<32)c+=`${R[k]}{border-radius:${r}px}`;else if(all<32)c+=`${R[k]}{border-radius:999px}`}
  if(L('heroWidth')==='full')c+='.hero .cta .btn{flex:1 1 100%}';
  if(L('dialogLayout')==='stack')c+=`${P} .acts{flex-direction:column-reverse}${P} .acts .btn{flex:none;width:100%}`;else if(L('dialogLayout')==='end')c+=`${P} .acts{justify-content:flex-end}${P} .acts .btn{flex:0 0 auto}.popd .in .btn{align-self:flex-end}`;
  if(L('formWidth')==='auto')c+=`${P} .f .btn,${P} .rp-f .btn{justify-self:end;width:auto}`;
  if(L('panelsWidth')==='full')c+='#panels .card .in>.btn{align-self:stretch}';else if(L('panelsAlign')!=='center')c+=`#panels .card .in>.btn{align-self:${L('panelsAlign')==='left'?'flex-start':'flex-end'}}`;
  const st=v('style'),col=v('color'),acc=v('accent'),bw=+v('borderW')||0,bc=v('borderColor'),tx=x=>v('textMode')==='custom'?v('text'):x,flat=`-webkit-backdrop-filter:none;backdrop-filter:none`;
  if(st!=='site'){c+=`${X}::before{display:none}`;
   if(st==='solid')c+=`${X}{${flat};background:${col}!important;color:${tx(ink(col))}!important;border:${bw}px solid ${bw?bc:'transparent'}}.btn.acc:not(#_){background:${acc}!important;color:${tx(ink(acc))}!important}.btn.ghost:not(#_){background:transparent!important;color:${tx(col)}!important;border:${Math.max(bw,1)}px solid ${col}}`;
   else if(st==='outline')c+=`${X}{${flat};background:transparent!important;color:${tx(col)}!important;border:${Math.max(bw,1)}px solid ${col}}.btn.acc:not(#_){color:${tx(acc)}!important;border-color:${acc}}`;
   else c+=`${X}{${flat};background:color-mix(in srgb,${col} 16%,#fff)!important;color:${tx(col)}!important;border:${bw}px solid ${bw?bc:'transparent'}}.btn.acc:not(#_){background:color-mix(in srgb,${acc} 18%,#fff)!important;color:${tx(acc)}!important}`}
  const z=(+v('textSize')||100)/100;if(z!==1)c+=`${X}{font-size:${(.95*z).toFixed(3)}rem}.sm${X}{font-size:${(.87*z).toFixed(3)}rem}`;
  if(+v('height'))c+=`${X}{min-height:${+v('height')}px}`;if(+v('padX'))c+=`${X}{padding-inline:${+v('padX')}px}`;
  if(v('weight')!=='site')c+=`${X}{font-weight:${+v('weight')}}`;
  const sh={none:'none',soft:'0 6px 14px -6px rgba(20,30,50,.4)',strong:'0 14px 26px -10px rgba(20,30,50,.6)'}[v('shadow')];if(sh)c+=`${X}{box-shadow:${sh}}`;
  if(v('fx')!=='site'){const rest=sh||(st==='site'&&C.effects.glassButtons?GLASS:'none'),h={on:1,effect:v('fx'),effect2:v('fx2'),amount:+v('amount'),speed:+v('speed'),direction:v('direction'),ease:v('ease'),color:v('fxColor'),touch:true};for(const q of['.btn','.lang','.chip']){const Y=q+':not(#_)';c+=`${Y}:hover,${Y}.press,${Y}:active{transform:none;box-shadow:${q==='.btn'?rest:'none'};text-shadow:none;padding-bottom:${lang==='ur'&&q==='.btn'?4:0}px}`;if(v('fx')!=='none')c+=FA.hoverCss(h,q).replace(/hvp/g,'hvb'+(p?'m':'d'))}}
  return c};

 return`@media(min-width:861px){${build('')}}@media(max-width:860px){${build('m_')}}`};
 FA.btnApply=function(C,o){let s=document.getElementById('fa-btns');if(!s){s=document.createElement('style');s.id='fa-btns';document.head.appendChild(s)}s.textContent=FA.btnCss(C,o)}})();
