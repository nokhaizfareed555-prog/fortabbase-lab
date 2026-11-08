/* Anonymous visit counter. No names, phone numbers or IP addresses. Staff browsers, bots and admin previews are never counted. */
(function(){try{
var q=new URLSearchParams(location.search),L=localStorage,c=window.FA_CONFIG;
if(!c||!c.url||q.has('fa_check')||q.has('fa_preview')||L.getItem('fa_staff')||L.getItem('fa_session'))return;
if(navigator.webdriver||/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp\//i.test(navigator.userAgent))return;
var id=function(){return (crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36)).replace(/-/g,'').slice(0,24)};
var vid=L.getItem('fa_vid');if(!vid){vid=id();L.setItem('fa_vid',vid)}
var now=Date.now(),s={};try{s=JSON.parse(L.getItem('fa_sv'))||{}}catch(e){}
var entry=!s.id||now-s.t>18e5;if(entry)s.id=id();s.t=now;L.setItem('fa_sv',JSON.stringify(s));
var w=innerWidth,b={sid:s.id,vid:vid,path:location.pathname,entry:entry,device:w<768?'Phone':w<1100?'Tablet':'Computer'};
if(entry){var r=document.referrer||'';try{if(r&&new URL(r).host===location.host)r=''}catch(e){}b.ref=r;b.us=q.get('utm_source')||'';b.um=q.get('utm_medium')||'';b.uc=q.get('utm_campaign')||'';b.click=q.has('gclid')?'gclid':q.has('fbclid')?'fbclid':''}
fetch(c.url+'/rest/v1/rpc/track_visit',{method:'POST',keepalive:true,headers:{apikey:c.anon,authorization:'Bearer '+c.anon,'content-type':'application/json'},body:JSON.stringify({v:b})}).catch(function(){});
}catch(e){}})();
