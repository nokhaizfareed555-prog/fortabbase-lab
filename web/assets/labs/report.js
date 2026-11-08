/* Report on your phone: a tilted blank report forms from falling dots each time the section comes into view, and scatters away when it leaves.
   Rows are bars only: no patient and no result is ever shown. site.js renders the empty markup and calls mount(). */
(function(){
var ctl;
function mount(){
  var root=document.querySelector('.rg');if(!root||root.dataset.on)return;root.dataset.on='1';
  if(ctl)ctl.abort();ctl=new AbortController();var signal=ctl.signal;
  var section=root,stage=section.querySelector('.rg-stage'),canvas=section.querySelector('canvas'),copy=section.querySelector('.rg-copy'),ctx=canvas.getContext('2d');
  var still=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('lite');
  if(still)section.classList.add('still');

  var INK='#14396f',TW=900,TH=1224;
  var seed=20261108;
  function rnd(){seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}
  function clamp(v,a,b){return v<a?a:v>b?b:v}
  function smooth(a,b,v){v=clamp((v-a)/(b-a),0,1);return v*v*(3-2*v)}
  function easeOut(v){return 1-Math.pow(1-v,3)}
  function mix(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}

  // The report sheet. Rows are deliberately blank bars: no patient and no result is ever shown.
  function paintSheet(){
    var c=document.createElement('canvas');c.width=TW;c.height=TH;
    var g=c.getContext('2d',{willReadFrequently:true}),i,k;
    g.fillStyle='#f7f8fd';g.fillRect(0,0,TW,TH);

    g.strokeStyle='rgba(20,57,111,.2)';g.lineWidth=1;
    for(i=-TH;i<TW;i+=7){g.beginPath();g.moveTo(i,0);g.lineTo(i+TH,TH);g.stroke()}
    g.fillStyle='rgba(247,248,253,.8)';g.fillRect(74,250,TW-148,830);

    g.strokeStyle=INK;g.lineWidth=7;g.strokeRect(30,30,TW-60,TH-60);
    g.lineWidth=1.5;g.strokeRect(44,44,TW-88,TH-88);
    g.lineWidth=1.1;
    for(i=0;i<2;i++){var edge=i?TH-58:58;g.beginPath();for(k=56;k<=TW-56;k+=2){var y=edge+Math.sin(k/5.5)*7;k===56?g.moveTo(k,y):g.lineTo(k,y)}g.stroke()}
    for(i=0;i<2;i++){var ex=i?TW-58:58;g.beginPath();for(k=70;k<=TH-70;k+=2){var x=ex+Math.sin(k/5.5)*7;k===70?g.moveTo(x,k):g.lineTo(x,k)}g.stroke()}

    g.fillStyle=INK;g.font='800 48px "Plus Jakarta Sans",system-ui,sans-serif';g.textBaseline='alphabetic';g.fillText('Fort Abbas Poly Clinic',92,150);
    g.font='500 30px "Inter",system-ui,sans-serif';g.fillText('Laboratory report',92,198);

    var sx=TW-160,sy=148;g.lineWidth=.9;
    for(i=0;i<46;i++){g.save();g.translate(sx,sy);g.rotate(i*Math.PI/46);g.beginPath();g.ellipse(0,0,68,26,0,0,7);g.stroke();g.restore()}
    g.beginPath();g.arc(sx,sy,24,0,7);g.fillStyle='#f7f8fd';g.fill();g.fillStyle='#d81f26';g.fillRect(sx-5,sy-16,10,32);g.fillRect(sx-16,sy-5,32,10);

    g.fillStyle=INK;g.fillRect(92,232,TW-184,5);
    g.fillStyle='rgba(20,57,111,.45)';
    [[92,270,190],[92,306,250],[520,270,170],[520,306,230]].forEach(function(b){g.fillRect(b[0],b[1],b[2],13)});

    g.fillStyle=INK;g.fillRect(92,356,TW-184,50);
    g.fillStyle='rgba(255,255,255,.85)';g.fillRect(116,376,130,10);g.fillRect(470,376,120,10);g.fillRect(690,376,70,10);

    var rows=[.82,.62,.74,.5,.9,.58,.7,.66,.84];
    rows.forEach(function(w,r){
      var y=430+r*58;
      g.fillStyle=INK;g.fillRect(116,y+6,270*w,13);
      g.fillStyle='rgba(20,57,111,.32)';g.fillRect(470,y+10,176,5);
      g.fillStyle='rgba(12,143,139,.65)';g.fillRect(516,y+10,84,5);
      g.beginPath();g.arc(516+84*(.18+(r*37%64)/100),y+12.5,8,0,7);g.fillStyle=INK;g.fill();
      g.fillStyle='rgba(20,57,111,.55)';g.fillRect(690,y+6,64+w*26,13);
      g.fillStyle='rgba(20,57,111,.14)';g.fillRect(92,y+40,TW-184,1.5);
    });

    g.strokeStyle=INK;g.lineWidth=3.5;g.beginPath();
    for(k=0;k<=200;k++){var px=620+k,py=1072+Math.sin(k/11)*(18-k/16)-k/8+Math.sin(k/3.1)*5;k?g.lineTo(px,py):g.moveTo(px,py)}
    g.stroke();
    g.fillStyle='rgba(20,57,111,.5)';g.fillRect(620,1102,200,3);g.fillRect(92,1076,330,13);g.fillRect(92,1102,250,13);

    g.font='800 21px "Inter",system-ui,sans-serif';g.fillStyle='#d81f26';g.textAlign='right';g.fillText('SAMPLE',TW-96,306);g.textAlign='left';

    // Cool wash, then the warm light through the middle of the sheet.
    g.globalCompositeOperation='multiply';
    var wash=g.createRadialGradient(TW*.5,TH*.5,20,TW*.5,TH*.5,TW*.82);
    wash.addColorStop(0,'#ffab78');wash.addColorStop(.3,'#ffc3a4');wash.addColorStop(.62,'#c9cdf0');wash.addColorStop(1,'#8498e2');
    g.fillStyle=wash;g.fillRect(0,0,TW,TH);
    g.globalCompositeOperation='screen';
    var edge2=g.createLinearGradient(TW*.7,0,TW*.34,TH*.3);edge2.addColorStop(0,'rgba(255,190,110,.55)');edge2.addColorStop(1,'rgba(255,190,110,0)');
    g.fillStyle=edge2;g.fillRect(0,0,TW,TH);
    g.globalCompositeOperation='source-over';

    var img=g.getImageData(0,0,TW,TH),d=img.data;
    for(i=0;i<d.length;i+=4){var n=(rnd()-.5)*36;d[i]=clamp(d[i]+n,0,255);d[i+1]=clamp(d[i+1]+n,0,255);d[i+2]=clamp(d[i+2]+n,0,255)}
    g.putImageData(img,0,0);
    return{canvas:c,data:d};
  }

  var io,sheet,W=0,H=0,dpr=1,G,dots,shade,raf=0,q=still?1:0,target=still?1:0,visible=false,lastT=0,stride=1,slow=0;
  var SHOW=.6,HIDE=.5,IN_MS=1500,OUT_MS=850;

  function bucketize(list){
    var map=new Map(),styles=[],order;
    list.forEach(function(p){var key=p.c;if(!map.has(key)){map.set(key,styles.length);styles.push(key)}p.b=map.get(key)});
    order=list.sort(function(a,b){return a.b-b.b});
    return{list:order,styles:styles};
  }

  function layout(){
    var r=stage.getBoundingClientRect();
    W=r.width;H=r.height;dpr=Math.min(window.devicePixelRatio||1,1.5);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);

    var cr=copy.getBoundingClientRect(),narrow=cr.width>W*.7,area;
    if(narrow){var top=cr.bottom-r.top+22;area={x:16,y:top,w:W-32,h:Math.max(180,H-top-26)}}
    else{var left=cr.right-r.left+24;area={x:left,y:H*.09,w:W-left-Math.max(20,W*.05),h:H*.82}}

    var boxW=1.11,boxH=1.56,k=Math.min(area.w/boxW*.86,area.h/(boxH+(narrow?.16:.08)));
    k=Math.min(k,560);
    var u={x:.88*k,y:.34*k},v={x:-.17*k*1.36,y:.9*k*1.36};
    var bx=area.x+area.w/2,by=area.y+area.h/2-(narrow?.1*k:.03*k);
    var o={x:bx-(u.x+v.x)/2,y:by-(u.y+v.y)/2};
    G={u:u,v:v,o:o,k:k,copyBottom:narrow?area.y-4:-1,narrow:narrow};

    seed=20261108;
    var nD=W<760?11000:26000,nS=W<760?6500:15000,size=W<760?1.25:1.35,list=[],i,tries=0,data=sheet.data;
    while(list.length<nD&&tries<nD*40){
      tries++;
      var a=rnd(),b=rnd(),tx=(a*TW)|0,ty=(b*TH)|0,idx=(ty*TW+tx)*4,rr=data[idx],gg=data[idx+1],bl=data[idx+2],lum=(rr+gg+bl)/765;
      if(rnd()>1.12-lum)continue;
      var ex=o.x+u.x*a+v.x*b,ey=o.y+u.y*a+v.y*b;
      var col=Math.round(ex/6)*6+(rnd()-.5)*.8,rise=k*1.36*(.42+Math.pow(rnd(),1.25)*1.25),sy=ey-rise;
      if(G.narrow&&sy<G.copyBottom)sy=G.copyBottom+rnd()*Math.max(10,ey-G.copyBottom)*.8;
      var r8=Math.round(rr*.82/32)*32,g8=Math.round(gg*.82/32)*32,b8=Math.round(bl*.92/32)*32;
      list.push({x:ex,y:ey,sx:col,sy:sy,d:(1-b)*.3+rnd()*.2,a:.5+rnd()*.5,c:'rgb('+r8+','+g8+','+b8+')'});
    }
    dots=bucketize(list);dots.size=size;

    var pts=[],orange=[255,126,70],red=[216,46,48],navy=[20,44,112],pale=[150,170,220];
    var A={x:o.x+v.x,y:o.y+v.y},dir={x:narrow?-.34*k:-.58*k,y:narrow?.2*k:.34*k},maxLeft=narrow?4:area.x-10;
    tries=0;
    while(pts.length<nS&&tries<nS*30){
      tries++;
      var s=rnd(),t=Math.pow(rnd(),1.7);
      if(rnd()<t*.45)continue;
      var fan=1-s*.72;
      var px=A.x+u.x*s+dir.x*t*fan+(rnd()-.5)*k*.09*t,py=A.y+u.y*s+dir.y*t*fan+(rnd()-.5)*k*.12*t;
      if(px<maxLeft||px>W||py>H)continue;
      var base=s<.42?mix(orange,red,s/.42):mix(red,navy,Math.min(1,(s-.42)/.34));
      var rgb=mix(base,pale,smooth(.45,1,t)*.75),al=Math.round((.92-t*.66)*8)/8;
      pts.push({x:px,y:py,th:.2+t*.45+rnd()*.3,c:'rgba('+(Math.round(rgb[0]/16)*16)+','+(Math.round(rgb[1]/16)*16)+','+(Math.round(rgb[2]/16)*16)+','+al+')'});
    }
    shade=bucketize(pts);shade.size=W<760?1.15:1.25;
  }

  function draw(){
    var o=G.o,u=G.u,v=G.v,k=G.k;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);

    var glowA=smooth(.42,.95,q);
    if(glowA>0){
      var cx=o.x+u.x*.56,cy=o.y+u.y*.56,gl=ctx.createRadialGradient(cx,cy,0,cx,cy,k*.62);
      gl.addColorStop(0,'rgba(255,176,92,'+.55*glowA+')');gl.addColorStop(.5,'rgba(255,190,140,'+.2*glowA+')');gl.addColorStop(1,'rgba(255,200,170,0)');
      ctx.fillStyle=gl;ctx.fillRect(cx-k*.62,cy-k*.62,k*1.24,k*1.24);
    }

    var every=q===1||q===0?1:stride,i,p,cur,n,sz,st;
    if(q>.2){
      n=shade.list.length;sz=shade.size;st=shade.styles;cur=-1;
      for(i=0;i<n;i+=every){p=shade.list[i];if(q<p.th)continue;if(p.b!==cur){cur=p.b;ctx.fillStyle=st[cur]}ctx.fillRect(p.x,p.y,sz,sz)}
    }

    var crisp=smooth(.8,.98,q);
    if(crisp>0){
      ctx.save();ctx.globalAlpha=crisp;
      ctx.fillStyle='#c9d2f0';ctx.beginPath();
      var e=k*.012;
      ctx.moveTo(o.x+u.x,o.y+u.y);ctx.lineTo(o.x+u.x+e,o.y+u.y+e*.7);ctx.lineTo(o.x+u.x+v.x+e,o.y+u.y+v.y+e*.7);ctx.lineTo(o.x+v.x+e,o.y+v.y+e*.7);ctx.lineTo(o.x+v.x,o.y+v.y);ctx.closePath();ctx.fill();
      ctx.transform(u.x/TW,u.y/TW,v.x/TH,v.y/TH,o.x,o.y);
      ctx.imageSmoothingQuality='high';ctx.drawImage(sheet.canvas,0,0);
      ctx.restore();
    }

    var dotA=(1-smooth(.9,.995,q))*smooth(0,.14,q);
    if(dotA>0){
      ctx.globalAlpha=dotA;
      n=dots.list.length;sz=dots.size;st=dots.styles;cur=-1;
      for(i=0;i<n;i+=every){
        p=dots.list[i];
        var t=(q*.98-p.d)/.5;t=t<0?0:t>1?1:t;t=1-t;t=1-t*t*t;
        if(p.b!==cur){cur=p.b;ctx.fillStyle=st[cur]}
        ctx.fillRect(p.sx+(p.x-p.sx)*t,p.sy+(p.y-p.sy)*t,sz,sz);
      }
      ctx.globalAlpha=1;
    }
  }

  // Share of the screen-sized section in view decides whether the report is there. The gap between SHOW and HIDE stops flicker at the edge.
  function readScroll(){
    if(still||!visible)return;
    var r=section.getBoundingClientRect(),vh=innerHeight,seen=(Math.min(r.bottom,vh)-Math.max(r.top,0))/Math.min(r.height,vh);
    if(seen>=SHOW)target=1;else if(seen<HIDE)target=0;
    wake();
  }
  function tick(now){
    raf=0;
    var real=lastT?now-lastT:16,dt=Math.min(real,50);lastT=now;
    // A device that cannot keep up draws fewer dots rather than stuttering.
    if(real>24){if(++slow>=3&&stride<4){stride++;slow=0}}else slow=0;
    var step=dt/(target>q?IN_MS:OUT_MS);
    q=Math.abs(target-q)<=step?target:q+(target>q?step:-step);
    draw();
    if(q!==target&&visible)wake();else lastT=0;
  }
  function wake(){if(!raf&&visible)raf=requestAnimationFrame(tick)}

  function idle(fn){if(window.requestIdleCallback)requestIdleCallback(fn,{timeout:300});else setTimeout(fn,30)}
  function start(){
    // The heavy drawing is built only when the visitor gets near, in two slices so scrolling is not held up.
    var near=new IntersectionObserver(function(en){
      if(!en[0].isIntersecting)return;near.disconnect();
      idle(function(){
        if(signal.aborted)return;sheet=paintSheet();
        idle(function(){
          if(signal.aborted)return;layout();
          var r=stage.getBoundingClientRect();lastW=r.width;lastH=r.height;
          if(still){draw();return}
          draw();
          io=new IntersectionObserver(function(en){visible=en[0].isIntersecting;if(visible)readScroll();else{if(raf)cancelAnimationFrame(raf);raf=0;lastT=0;q=target=0;draw()}});io.observe(section);
          signal.addEventListener('abort',function(){io.disconnect();if(raf)cancelAnimationFrame(raf)});
          addEventListener('scroll',readScroll,{passive:true,signal:signal});
        });
      });
    },{rootMargin:'120% 0px'});
    near.observe(section);signal.addEventListener('abort',function(){near.disconnect()});
  }

  var lastW=0,lastH=0,rt;
  addEventListener('resize',function(){
    clearTimeout(rt);
    rt=setTimeout(function(){
      var r=stage.getBoundingClientRect();
      if(!sheet||(r.width===lastW&&Math.abs(r.height-lastH)<120))return;
      lastW=r.width;lastH=r.height;layout();draw();
    },160);
  },{signal:signal});

  var began=false;
  function go(){if(began||signal.aborted)return;began=true;start()}
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(go);
  setTimeout(go,1400);
}
window.FA_REPORT={mount:mount};mount();
})();
