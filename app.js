'use strict';
async function loadSettings(){const rows=await fetchAll('settings');E.settings={};rows.forEach(r=>E.settings[r.key]=r.value);$('#coName').textContent=E.settings.company?.name||''}
function startClock(){
  const t=$('#ticks');if(t&&!t.children.length)for(let i=0;i<12;i++){const l=document.createElementNS('http://www.w3.org/2000/svg','line');const a=i*30*Math.PI/180;l.setAttribute('x1',100+Math.sin(a)*80);l.setAttribute('y1',100-Math.cos(a)*80);l.setAttribute('x2',100+Math.sin(a)*(i%3?86:76));l.setAttribute('y2',100-Math.cos(a)*(i%3?86:76));l.setAttribute('stroke','#d4af37');l.setAttribute('stroke-width',i%3?1.5:3);t.append(l)}
  const tick=()=>{const d=new Date(),s=d.getSeconds(),m=d.getMinutes(),h=d.getHours()%12;const rot=(id,a)=>{const e=$('#'+id);if(e)e.setAttribute('transform',`rotate(${a} 100 100)`)};rot('ss',s*6);rot('mm',m*6+s*.1);rot('hh',h*30+m*.5);const dg=$('#digital');if(dg)dg.textContent=d.toLocaleTimeString('en-GB');const dl=$('#dateline');if(dl)dl.textContent=d.toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric'});const td=$('#today');if(td)td.textContent=d.toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'})};
  tick();setInterval(tick,1000);
  let off=0;const cal=()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+off);const y=d.getFullYear(),mo=d.getMonth();$('#calTitle').textContent=d.toLocaleDateString('ar-EG',{month:'long',year:'numeric'});const first=new Date(y,mo,1).getDay(),n=new Date(y,mo+1,0).getDate(),now=new Date();let h=['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'].map(x=>`<b>${x}</b>`).join('');for(let i=0;i<first;i++)h+='<span></span>';for(let i=1;i<=n;i++)h+=`<span class="${off===0&&i===now.getDate()?'today':''}">${i}</span>`;$('#calGrid').innerHTML=h};
  $('#calNext').onclick=()=>{off++;cal()};$('#calPrev').onclick=()=>{off--;cal()};cal();
}
async function enter(){
  const{data:{user}}=await sb.auth.getUser();
  const{data:me}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(!me||!me.active){await sb.auth.signOut();throw new Error('هذا الحساب غير مفعّل. تواصل مع مدير النظام.')}
  E.user=user;E.me=me;
  await Promise.all([loadAccounts(),loadSettings()]);
  $('#login').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#userPill').textContent=(me.full_name||me.email)+' · '+ROLES[me.role];
  buildNav();go((location.hash||'#dashboard').slice(1));
}
$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#lgErr').textContent='';const b=e.submitter;b.disabled=true;
  try{const{error}=await sb.auth.signInWithPassword({email:$('#lgEmail').value.trim(),password:$('#lgPass').value});if(error)throw new Error(error.message==='Invalid login credentials'?'البريد أو كلمة المرور غير صحيحة':error.message);await enter()}catch(x){$('#lgErr').textContent=errMsg(x)}b.disabled=false};
$('#logoutBtn').onclick=async()=>{await sb.auth.signOut();location.hash='';location.reload()};
$('#menuBtn').onclick=()=>$('#side').classList.toggle('open');
window.addEventListener('hashchange',()=>{if(E.me)go((location.hash||'#dashboard').slice(1))});
(async()=>{startClock();const{data:{session}}=await sb.auth.getSession();if(session){try{await enter();return}catch(e){}}$('#login').classList.remove('hidden')})();
