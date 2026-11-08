/* Admin > Messages: compose, templates, contacts, sent log and email setup. */
window.FAMessages=async function(p,{e,toast,confirm2,close}){
 let tab='compose',M=await FA.rpc('msg_get'),sel=new Set(),tplKey='general',edit=null;
 const brand={clinic:FA.D.brand.name,phone:FA.D.visit.phone};
 const AUTO=['name','email','clinic','phone'];
 const varsIn=t=>[...new Set([...(t||'').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map(m=>m[1].toLowerCase()))];
 const parse=s=>s.split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
 const valid=x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);
 const reload=async()=>{M=await FA.rpc('msg_get');draw()};
 const tabs=[['compose','Compose'],['templates','Templates'],['contacts','Contacts'],['sent','Sent'],['setup','Email setup']];
 function draw(){
  const ready=M.key_set&&M.from;
  p.innerHTML=`<h2>Messages</h2><p class="psub">Write emails, keep reusable templates and save the people you email.</p>${ready?'':`<div class="note">Emails cannot be sent yet. Finish <a href="#" data-tab="setup">Email setup</a> first.</div>`}<div class="vtabs">${tabs.map(([k,l])=>`<button class="${k===tab?'on':''}" data-tab="${k}"${k===tab?' aria-current="true"':''}>${l}</button>`).join('')}</div><div id="mb"></div>`;
  p.querySelectorAll('[data-tab]').forEach(b=>b.onclick=ev=>{ev.preventDefault();tab=b.dataset.tab;edit=null;draw()});
  ({compose,templates,contacts,sent,setup}[tab])(p.querySelector('#mb'));
 }
 function compose(b){
  const t=M.templates.find(x=>x.key===tplKey)||M.templates[0]||{subject:'',body:''};
  b.innerHTML=`<div class="pnl glass"><div class="fld"><label for="mt">Template</label><select id="mt">${M.templates.map(x=>`<option value="${e(x.key)}"${x.key===t.key?' selected':''}>${e(x.name)}</option>`).join('')}</select></div>
  <div class="fld"><label for="mto">Send to (type emails, separated by commas)</label><textarea id="mto" rows="2" placeholder="someone@example.com, another@example.com"></textarea></div>
  ${M.contacts.length?`<div class="fld"><label>Or pick saved contacts</label><div class="mc">${M.contacts.map(c=>`<label class="chk"><input type="checkbox" data-c="${c.id}"${sel.has(c.id)?' checked':''}> ${e(c.name||c.email)}</label>`).join('')}</div></div>`:''}
  <div class="fld"><label for="ms">Subject</label><input type="text" id="ms" maxlength="200" value="${e(t.subject)}"></div>
  <div class="fld"><label for="mbd">Message</label><textarea id="mbd" rows="10">${e(t.body)}</textarea></div>
  <div id="mv"></div><div class="fld"><label>Preview (first recipient)</label><div class="mprev" id="mpv"></div></div>
  <button class="btn acc sm" id="msend">Send</button><p class="err" id="mer"></p></div>`;
  const $=s=>b.querySelector(s),vals={};
  const custom=()=>varsIn($('#ms').value+' '+$('#mbd').value).filter(k=>!AUTO.includes(k));
  const fill=(s,v)=>s.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,(_,k)=>v[k.toLowerCase()]??'');
  const list=()=>[...parse($('#mto').value).map(email=>({email,name:M.contacts.find(c=>c.email===email)?.name||''})),...M.contacts.filter(c=>sel.has(c.id)).map(c=>({email:c.email,name:c.name}))].filter((r,i,a)=>a.findIndex(x=>x.email===r.email)===i);
  const pv=()=>{const r=list()[0]||{},v={...brand,...vals,name:r.name||'Patient',email:r.email||''};$('#mpv').innerHTML=`<b>${e(fill($('#ms').value,v))}</b><br><br>${e(fill($('#mbd').value,v)).replace(/\n/g,'<br>')}`};
  const fields=()=>{$('#mv').innerHTML=custom().map(k=>`<div class="fld"><label>Fill in: ${e(k)}</label><input type="text" data-v="${e(k)}" value="${e(vals[k]||'')}"></div>`).join('');b.querySelectorAll('[data-v]').forEach(i=>i.oninput=()=>{vals[i.dataset.v]=i.value;pv()});pv()};
  $('#mt').onchange=ev=>{tplKey=ev.target.value;compose(b)};
  $('#ms').oninput=$('#mbd').oninput=fields;$('#mto').oninput=pv;
  b.querySelectorAll('[data-c]').forEach(c=>c.onchange=()=>{c.checked?sel.add(c.dataset.c):sel.delete(c.dataset.c);pv()});
  fields();
  $('#msend').onclick=()=>{const bad=parse($('#mto').value).filter(x=>!valid(x)),to=list();$('#mer').textContent='';
   if(bad.length){$('#mer').textContent='Not a valid email: '+bad.join(', ');return}
   if(!to.length){$('#mer').textContent='Add at least one email address.';return}
   const miss=custom().filter(k=>!vals[k]);if(miss.length){$('#mer').textContent='Fill in: '+miss.join(', ');return}
   confirm2('Send this email?',`It will go to ${to.length} ${to.length===1?'person':'people'} and cannot be taken back.`,'Send',async()=>{close();const btn=$('#msend');btn.disabled=true;btn.textContent='Sending…';
    try{const r=await FA.sendEmail({template:t.key,to,subject:$('#ms').value,body:$('#mbd').value,vars:{...brand,...vals}});toast(r.failed?`${r.sent} sent, ${r.failed} failed: ${r.error}`:`Sent to ${r.sent}`);tab='sent';await reload()}catch(er){btn.disabled=false;btn.textContent='Send';$('#mer').textContent=er.message}})};
 }
 function templates(b){
  if(edit){b.innerHTML=`<div class="pnl glass"><div class="fld"><label for="tn">Template name</label><input type="text" id="tn" maxlength="120" value="${e(edit.name||'')}"></div><div class="fld"><label for="ts">Subject</label><input type="text" id="ts" maxlength="200" value="${e(edit.subject||'')}"></div><div class="fld"><label for="tb">Message</label><textarea id="tb" rows="12">${e(edit.body||'')}</textarea></div><p class="psub">Fill-in words: {{name}}, {{clinic}}, {{phone}} fill by themselves. Any other word in double curly brackets, like {{ref}} or {{date}}, is asked for when you send.</p><button class="btn acc sm" id="tsv">Save template</button> <button class="btn ghost sm" id="tcn">Cancel</button><p class="err" id="ter"></p></div>`;
   b.querySelector('#tcn').onclick=()=>{edit=null;draw()};
   b.querySelector('#tsv').onclick=async()=>{const name=b.querySelector('#tn').value.trim();if(!name){b.querySelector('#ter').textContent='Give the template a name.';return}try{await FA.rpc('msg_save_template',{p:{key:edit.key||'',name,subject:b.querySelector('#ts').value,body:b.querySelector('#tb').value}});edit=null;toast('Template saved');await reload()}catch(er){b.querySelector('#ter').textContent=er.message}};return}
  b.innerHTML=`<div class="pnl glass"><button class="btn acc sm" id="tnew">New template</button><table class="tb" style="margin-top:12px"><tr><th>Name</th><th>Subject</th><th></th></tr>${M.templates.map(t=>`<tr><td><b>${e(t.name)}</b></td><td>${e(t.subject)}</td><td style="white-space:nowrap"><button class="btn ghost sm" data-te="${e(t.key)}">Edit</button>${t.builtin?'':` <button class="btn ghost sm" data-td="${e(t.key)}">Delete</button>`}</td></tr>`).join('')}</table></div>`;
  b.querySelector('#tnew').onclick=()=>{edit={};draw()};
  b.querySelectorAll('[data-te]').forEach(x=>x.onclick=()=>{edit=M.templates.find(t=>t.key===x.dataset.te);draw()});
  b.querySelectorAll('[data-td]').forEach(x=>x.onclick=()=>confirm2('Delete this template?','This cannot be undone.','Delete',async()=>{close();await FA.rpc('msg_delete_template',{k:x.dataset.td});await reload()},1));
 }
 function contacts(b){
  b.innerHTML=`<div class="pnl glass"><h3>Add emails</h3><div class="fld"><label for="ca">Emails (one or many, separated by commas)</label><textarea id="ca" rows="3"></textarea></div><div class="fld"><label for="cn">Name (used when adding one email)</label><input type="text" id="cn" maxlength="120"></div><div class="fld"><label for="co">Note (only staff see this)</label><input type="text" id="co" maxlength="300"></div><button class="btn acc sm" id="cadd">Add</button><p class="err" id="cer"></p></div><div class="pnl glass scroll"><table class="tb"><tr><th>Name</th><th>Email</th><th>Note</th><th></th></tr>${M.contacts.map(c=>`<tr><td>${e(c.name)}</td><td>${e(c.email)}</td><td>${e(c.note)}</td><td><button class="btn ghost sm" data-cd="${c.id}">Remove</button></td></tr>`).join('')||'<tr><td colspan=4>No contacts yet.</td></tr>'}</table></div>`;
  b.querySelector('#cadd').onclick=async()=>{const a=parse(b.querySelector('#ca').value),bad=a.filter(x=>!valid(x)),er=b.querySelector('#cer');if(!a.length||bad.length){er.textContent=bad.length?'Not a valid email: '+bad.join(', '):'Enter an email.';return}const name=a.length===1?b.querySelector('#cn').value.trim():'',note=b.querySelector('#co').value.trim();try{const n=await FA.rpc('msg_save_contacts',{p:a.map(email=>({email,name,note}))});toast(n+' saved');await reload()}catch(x){er.textContent=x.message}};
  b.querySelectorAll('[data-cd]').forEach(x=>x.onclick=()=>confirm2('Remove this contact?','Their past emails stay in Sent.','Remove',async()=>{close();await FA.rpc('msg_delete_contact',{i:x.dataset.cd});sel.delete(x.dataset.cd);await reload()},1));
 }
 function sent(b){b.innerHTML=`<div class="pnl glass scroll"><table class="tb"><tr><th>When</th><th>To</th><th>Subject</th><th>Result</th><th>By</th></tr>${M.log.map(l=>`<tr><td>${new Date(l.at).toLocaleString()}</td><td>${e(l.recipient)}</td><td>${e(l.subject)}</td><td><span class="bdg">${e(l.status)}</span>${l.error?`<br><small>${e(l.error)}</small>`:''}</td><td>${e(l.actor||'')}</td></tr>`).join('')||'<tr><td colspan=5>Nothing sent yet.</td></tr>'}</table></div>`}
 function setup(b){
  b.innerHTML=`<div class="pnl glass"><p class="psub">Emails go out through Resend. Create a free account at resend.com, verify your domain, then paste the key here. The blog agent's alerts use this same sender.</p><div class="fld"><label for="sk">Resend API key ${M.key_set?'(saved; leave empty to keep it)':''}</label><input type="password" id="sk" autocomplete="off"></div><div class="fld"><label for="sf">Sender</label><input type="text" id="sf" value="${e(M.from||'')}" placeholder="Fort Abbas Poly Clinic <info@fortabbaspolyclinic.com>"></div><div class="fld"><label for="sr">Replies go to (optional)</label><input type="email" id="sr" value="${e(M.reply_to||'')}"></div><button class="btn acc sm" id="ssv">Save</button><p class="err" id="ser"></p></div>`;
  b.querySelector('#ssv').onclick=async()=>{try{await FA.rpc('msg_save_settings',{p_from:b.querySelector('#sf').value,p_reply:b.querySelector('#sr').value,p_key:b.querySelector('#sk').value});toast('Email setup saved');await reload()}catch(er){b.querySelector('#ser').textContent=er.message}};
 }
 draw();
};
