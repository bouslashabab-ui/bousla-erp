'use strict';
const SUPABASE_URL='https://pjalvxnjcjeirhqtoiva.supabase.co';
const SUPABASE_KEY='sb_publishable_4dzvn_Pwji-8MyhP9BzHWQ_XPyZP3Qo';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const E={user:null,me:null,accounts:[],settings:{},pages:{},groups:[],cur:null};
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt0=n=>(Number(n)||0).toLocaleString('en-US',{maximumFractionDigits:2});
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const monthStart=()=>today().slice(0,8)+'01';
const yearStart=()=>today().slice(0,5)+'01-01';
const ROLES={admin:'مدير النظام',accountant:'محاسب',sales:'مبيعات',warehouse:'مخازن ومشتريات',hr:'موارد بشرية',viewer:'مشاهدة فقط'};
const can=(roles)=>!roles||roles==='*'||roles.includes(E.me?.role);
const cur=()=>E.settings.currency||'ج.م';

function toast(m,bad){const t=document.createElement('div');t.className='toast'+(bad?' bad':'');t.textContent=m;$('#toastRoot').append(t);setTimeout(()=>t.remove(),3200)}
function errMsg(e){return (e&&(e.message||e.error_description))||String(e)}
function modal(title,body,{wide=false,save='حفظ',onSave,hideFooter=false}={}){
  const ov=document.createElement('div');ov.className='ov';
  ov.innerHTML=`<div class="md glass${wide?' wide':''}"><h2>${esc(title)}</h2><div class="mb">${body}</div><div class="err" id="mErr"></div>${hideFooter?'':`<div class="ft">${onSave?`<button class="btn gold-btn" id="mSave">${esc(save)}</button>`:''}<button class="btn" id="mCancel">${onSave?'إلغاء':'إغلاق'}</button></div>`}</div>`;
  $('#modalRoot').append(ov);const close=()=>ov.remove();
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close()});
  const c=$('#mCancel',ov);if(c)c.onclick=close;
  const s=$('#mSave',ov);
  if(s)s.onclick=async()=>{s.disabled=true;$('#mErr',ov).textContent='';try{const r=await onSave(ov);if(r!==false)close()}catch(e){$('#mErr',ov).textContent=errMsg(e)}s.disabled=false};
  return {ov,close};
}
function confirmDlg(msg,fn,label='تأكيد'){modal('تأكيد',`<p>${esc(msg)}</p>`,{save:label,onSave:async()=>{await fn()}})}

async function fetchAll(table,sel='*',build){
  let out=[],from=0;
  for(;;){let q=sb.from(table).select(sel);if(build)q=build(q);const{data,error}=await q.range(from,from+999);if(error)throw error;out=out.concat(data);if(data.length<1000)break;from+=1000}
  return out;
}
async function ins(table,row){const{data,error}=await sb.from(table).insert(row).select().single();if(error)throw error;return data}
async function upd(table,id,row){const{data,error}=await sb.from(table).update(row).eq('id',id).select().single();if(error)throw error;return data}
async function del(table,id){const{error}=await sb.from(table).delete().eq('id',id);if(error)throw error}
async function rpc(fn,args){const{data,error}=await sb.rpc(fn,args);if(error)throw error;return data}

async function loadAccounts(){E.accounts=await fetchAll('accounts','*',q=>q.order('code'))}
const acct=id=>E.accounts.find(a=>a.id==id);
const acctByCode=c=>E.accounts.find(a=>a.code===c);
const acctLabel=a=>a?a.code+' - '+a.name:'';
function acctOptions(filter,sel){return '<option value="">— اختر —</option>'+E.accounts.filter(a=>a.is_active&&(!filter||filter(a))).map(a=>`<option value="${a.id}"${a.id==sel?' selected':''}>${esc(acctLabel(a))}</option>`).join('')}
const isLeaf=a=>!E.accounts.some(x=>x.parent_code===a.code);

/* journal posting: lines=[{account_id|code,debit,credit,memo,party_type,party_id,cost_center_id,branch_id}] */
async function postEntry({date,description,ref_type=null,ref_id=null,lines}){
  const L=lines.map(l=>({account_id:l.account_id||acctByCode(l.code)?.id,debit:+(+l.debit||0).toFixed(2),credit:+(+l.credit||0).toFixed(2),memo:l.memo||null,party_type:l.party_type||null,party_id:l.party_id||null,cost_center_id:l.cost_center_id||null,branch_id:l.branch_id||null})).filter(l=>l.debit>0||l.credit>0);
  const d=L.reduce((s,l)=>s+l.debit,0),c=L.reduce((s,l)=>s+l.credit,0);
  if(!L.length)throw new Error('القيد بدون بنود');
  if(Math.abs(d-c)>0.005)throw new Error('القيد غير متوازن: مدين '+fmt(d)+' دائن '+fmt(c));
  if(L.some(l=>!l.account_id))throw new Error('حساب غير معروف في القيد');
  const e=await ins('journal_entries',{entry_date:date,description,ref_type,ref_id});
  const{error}=await sb.from('journal_lines').insert(L.map(l=>({...l,entry_id:e.id})));
  if(error){await sb.from('journal_entries').delete().eq('id',e.id);throw error}
  await sb.from('journal_entries').update({entry_no:'JV-'+String(e.id).padStart(5,'0')}).eq('id',e.id);
  return e;
}
async function deleteEntry(id){const{error}=await sb.from('journal_entries').delete().eq('id',id);if(error)throw error}

/* form + table helpers */
function fieldHtml(f,v){
  const val=v??f.def??'';const req=f.req?' required':'';const nm=`data-k="${f.k}"`;
  let inp;
  if(f.type==='select')inp=`<select ${nm}${req}>${(typeof f.options==='function'?f.options():f.options).map(o=>{const[ov,ol]=Array.isArray(o)?o:[o,o];return `<option value="${esc(ov)}"${String(ov)===String(val)?' selected':''}>${esc(ol)}</option>`}).join('')}</select>`;
  else if(f.type==='textarea')inp=`<textarea ${nm} rows="2">${esc(val)}</textarea>`;
  else if(f.type==='checkbox')inp=`<input type="checkbox" ${nm} ${val===true||val==='true'||val==1?'checked':''} style="width:auto">`;
  else inp=`<input ${nm} type="${f.type||'text'}" value="${esc(val)}"${req}${f.type==='number'?' step="any"':''}>`;
  return `<label class="${f.full?'full':''}">${esc(f.label)}${inp}</label>`;
}
function formHtml(fields,row={}){return `<div class="fg">${fields.map(f=>fieldHtml(f,row[f.k])).join('')}</div>`}
function readForm(root,fields){const o={};for(const f of fields){const el=$(`[data-k="${f.k}"]`,root);if(!el)continue;let v=f.type==='checkbox'?el.checked:el.value;if(f.type==='number')v=v===''?null:+v;else if(v==='')v=null;if(f.type==='select'&&f.num&&v!==null)v=+v;o[f.k]=v;if(f.req&&(v===null||v===''))throw new Error('الحقل مطلوب: '+f.label)}return o}
function tableHtml(cols,rows,{foot,empty='لا توجد بيانات'}={}){
  if(!rows.length)return `<div class="tw"><div class="empty">${esc(empty)}</div></div>`;
  return `<div class="tw"><table class="tbl"><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr${r._cls?` class="${r._cls}"`:''}>${cols.map(c=>`<td class="${c.cls||''}">${c.html?c.html(r):esc(c.f?c.f(r):r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table></div>`;
}
function exportCSV(name,rows){const csv='\ufeff'+rows.map(r=>r.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=name+'.csv';a.click()}

/* generic CRUD page */
function crud(cfg){
  return async function(el){
    const writable=can(cfg.write);let rows=[],q='';
    const load=async()=>{rows=await fetchAll(cfg.table,'*',x=>x.order('id',{ascending:false}));draw()};
    const draw=()=>{
      const fl=rows.filter(r=>!q||JSON.stringify(Object.values(r)).toLowerCase().includes(q));
      const cols=[...cfg.cols,...(writable?[{label:'',cls:'act',html:r=>`<button class="btn sm" data-e="${r.id}">تعديل</button> <button class="btn sm danger" data-d="${r.id}">حذف</button>`}]:[])];
      $('#crudT',el).innerHTML=tableHtml(cols,fl.map(r=>({...r})),{empty:'لا توجد سجلات بعد'});
      $$('[data-e]',el).forEach(b=>b.onclick=()=>form(rows.find(r=>r.id==b.dataset.e)));
      $$('[data-d]',el).forEach(b=>b.onclick=()=>confirmDlg('حذف هذا السجل نهائياً؟',async()=>{await del(cfg.table,b.dataset.d);toast('تم الحذف');await load()},'حذف'));
      $('#cnt',el).textContent=fl.length+' سجل';
    };
    const form=(row)=>modal((row?'تعديل ':'إضافة ')+cfg.single,formHtml(cfg.fields,row||{}),{onSave:async ov=>{const v=readForm(ov,cfg.fields);if(cfg.before)await cfg.before(v,row);if(row)await upd(cfg.table,row.id,v);else await ins(cfg.table,v);toast('تم الحفظ');await load();if(cfg.after)cfg.after()}});
    el.innerHTML=`<div class="bar"><div class="grow"><input id="q" placeholder="🔍 بحث..."></div><span class="muted s" id="cnt"></span>${writable?`<button class="btn gold-btn" id="add">+ إضافة ${esc(cfg.single)}</button>`:''}</div><div id="crudT"></div>`;
    $('#q',el).oninput=e=>{q=e.target.value.toLowerCase();draw()};
    if(writable)$('#add',el).onclick=()=>form();
    await load();
  };
}

/* navigation */
function page(id,def){E.pages[id]={id,...def}}
function buildNav(){
  const nav=$('#nav');let html='',g='';
  for(const p of Object.values(E.pages)){
    if(!can(p.roles)||p.hidden)continue;
    if(p.group!==g){g=p.group;html+=`<div class="nav-group">${esc(g)}</div>`}
    html+=`<button class="nav-item" data-p="${p.id}"><span class="ic">${p.icon||'◈'}</span>${esc(p.title)}</button>`;
  }
  nav.innerHTML=html;
  $$('.nav-item[data-p]',nav).forEach(b=>b.onclick=()=>{location.hash='#'+b.dataset.p;$('#side').classList.remove('open')});
}
async function go(id){
  const p=E.pages[id]&&can(E.pages[id].roles)?E.pages[id]:E.pages.dashboard;
  E.cur=p.id;$('#pageTitle').textContent=p.title;
  $$('.nav-item[data-p]').forEach(b=>b.classList.toggle('on',b.dataset.p===p.id));
  const v=$('#view');v.innerHTML='<div class="empty">جارٍ التحميل…</div>';
  try{await p.render(v)}catch(e){v.innerHTML=`<div class="panel glass"><b>تعذر تحميل الصفحة</b><p class="muted">${esc(errMsg(e))}</p></div>`}
}
