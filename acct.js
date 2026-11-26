'use strict';
const sign=(a,r)=>['asset','expense'].includes(a.type)?(+r.debit-+r.credit):(+r.credit-+r.debit);
async function balancesMap(from,to){const rows=await rpc('acct_balances',{p_from:from||null,p_to:to||null});const m={};rows.forEach(r=>m[r.account_id]=r);return m}
const bOf=(m,a)=>m[a.id]?sign(a,m[a.id]):0;
/* roll up: sum of leaf + children for parent accounts */
function rollup(m){const r={};const kids=c=>E.accounts.filter(x=>x.parent_code===c);const f=a=>{if(r[a.id]!==undefined)return r[a.id];const k=kids(a.code);r[a.id]=bOf(m,a)+k.reduce((s,x)=>s+f(x),0);return r[a.id]};E.accounts.forEach(f);return r}
const range=(el)=>({from:$('#df',el).value||null,to:$('#dt',el).value||null});
const dateBar=(extra='',def={})=>`<div class="bar"><label style="margin:0">من<input type="date" id="df" value="${def.from??yearStart()}"></label><label style="margin:0">إلى<input type="date" id="dt" value="${def.to??today()}"></label>${extra}<button class="btn gold-btn" id="go">عرض</button><button class="btn" id="csv">تصدير Excel</button><button class="btn" id="prt">طباعة</button></div>`;

page('dashboard',{title:'لوحة التحكم',group:'الرئيسية',icon:'⌂',async render(el){
  const [all,mon]=await Promise.all([balancesMap(),balancesMap(monthStart(),today())]);
  const sumType=(m,t)=>E.accounts.filter(a=>a.type===t&&isLeaf(a)).reduce((s,a)=>s+bOf(m,a),0);
  const cash=E.accounts.filter(a=>a.is_cash).reduce((s,a)=>s+bOf(all,a),0);
  const by=c=>bOf(all,acctByCode(c)||{});
  const rev=sumType(mon,'revenue'),exp=sumType(mon,'expense');
  const d=new Date();d.setMonth(d.getMonth()-5);d.setDate(1);const ms=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
  const mp=await rpc('monthly_pl',{p_from:ms});
  const months=[];for(let i=0;i<6;i++){const x=new Date(d.getFullYear(),d.getMonth()+i,1);months.push(x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'))}
  const val=(m,t)=>+(mp.find(r=>r.m===m&&r.t===t)?.amt||0);const mx=Math.max(1,...months.flatMap(m=>[val(m,'revenue'),val(m,'expense')]));
  const ents=await fetchAll('journal_entries','id,entry_no,entry_date,description',q=>q.order('id',{ascending:false})).then(r=>r.slice(0,8)).catch(()=>[]);
  el.innerHTML=`<div class="cards">
  <div class="kpi glass"><div class="l">النقدية والبنوك</div><div class="v g num">${fmt(cash)}</div></div>
  <div class="kpi glass"><div class="l">مستحق على العملاء</div><div class="v num">${fmt(by('1201'))}</div></div>
  <div class="kpi glass"><div class="l">مستحق للموردين</div><div class="v num">${fmt(by('2101'))}</div></div>
  <div class="kpi glass"><div class="l">قيمة المخزون</div><div class="v num">${fmt(by('1301'))}</div></div>
  <div class="kpi glass"><div class="l">إيرادات الشهر</div><div class="v ok num">${fmt(rev)}</div></div>
  <div class="kpi glass"><div class="l">مصروفات الشهر</div><div class="v bad num">${fmt(exp)}</div></div>
  <div class="kpi glass"><div class="l">صافي ربح الشهر</div><div class="v ${rev-exp>=0?'g':'bad'} num">${fmt(rev-exp)}</div></div></div>
  <div class="grid2"><div class="panel glass"><h3>الإيرادات والمصروفات (آخر 6 شهور)</h3><div class="chart">${months.map(m=>`<div class="col"><div class="bars"><div class="b r" title="${fmt(val(m,'revenue'))}" style="height:${val(m,'revenue')/mx*100}%"></div><div class="b e" title="${fmt(val(m,'expense'))}" style="height:${val(m,'expense')/mx*100}%"></div></div><span class="muted s">${m.slice(5)}/${m.slice(2,4)}</span></div>`).join('')}</div><div class="legend"><span><i style="background:var(--gold)"></i>إيرادات</span><span><i style="background:#3f58b5"></i>مصروفات</span></div></div>
  <div class="panel glass"><h3>آخر القيود</h3>${ents.length?ents.map(e=>`<div style="display:flex;justify-content:space-between;padding:.45rem 0;border-bottom:1px solid var(--line2)"><span><b class="gold">${esc(e.entry_no||'')}</b> ${esc(e.description||'')}</span><span class="muted s">${e.entry_date}</span></div>`).join(''):'<div class="empty">لا توجد قيود بعد. ابدأ من «القيود اليومية».</div>'}</div></div>`;
}});

/* chart of accounts */
page('accounts',{title:'دليل الحسابات',group:'المحاسبة',icon:'▤',roles:['admin','accountant','viewer'],async render(el){
  const m=await balancesMap();const roll=rollup(m);const w=can(['admin','accountant']);
  const TN={asset:'أصول',liability:'خصوم',equity:'حقوق ملكية',revenue:'إيرادات',expense:'مصروفات'};
  const depth=a=>{let d=0,x=a;while(x&&x.parent_code){x=acctByCode(x.parent_code);d++}return d};
  el.innerHTML=`<div class="bar"><div class="grow muted">دليل حسابات شجري. الحسابات الرئيسية تجمع أرصدة فروعها.</div>${w?'<button class="btn gold-btn" id="add">+ حساب جديد</button>':''}</div>
  ${tableHtml([{label:'الكود',cls:'num',html:a=>`<span class="ind${Math.min(depth(a),2)}">${esc(a.code)}</span>`},{label:'اسم الحساب',html:a=>`<span class="ind${Math.min(depth(a),2)}">${isLeaf(a)?`<a class="lnk" data-l="${a.id}">${esc(a.name)}</a>`:'<b>'+esc(a.name)+'</b>'}</span>`},{label:'النوع',f:a=>TN[a.type]},{label:'نقدية',html:a=>a.is_cash?'<span class="tag ok">نقدية/بنك</span>':''},{label:'الرصيد',cls:'num',html:a=>fmt(roll[a.id])},...(w?[{label:'',cls:'act',html:a=>`<button class="btn sm" data-e="${a.id}">تعديل</button>`}]:[])],E.accounts.map(a=>({...a,_cls:isLeaf(a)?'':'grp'})))}`;
  $$('[data-l]',el).forEach(b=>b.onclick=()=>{E.ledgerAcc=b.dataset.l;location.hash='#ledger'});
  const fields=[{k:'code',label:'الكود',req:1},{k:'name',label:'اسم الحساب',req:1},{k:'type',label:'النوع',type:'select',options:Object.entries(TN)},{k:'parent_code',label:'الحساب الأب (كود)',type:'select',options:()=>[['','— بدون —'],...E.accounts.map(a=>[a.code,a.code+' - '+a.name])]},{k:'is_cash',label:'حساب نقدية/بنك',type:'checkbox'},{k:'is_active',label:'نشط',type:'checkbox',def:true}];
  const form=a=>modal(a?'تعديل حساب':'حساب جديد',formHtml(fields,a||{type:'asset'}),{onSave:async ov=>{const v=readForm(ov,fields);if(a)await upd('accounts',a.id,v);else await ins('accounts',v);await loadAccounts();toast('تم الحفظ');go('accounts')}});
  if(w){$('#add',el).onclick=()=>form();$$('[data-e]',el).forEach(b=>b.onclick=()=>form(acct(b.dataset.e)))}
}});

/* journal */
page('journal',{title:'القيود اليومية',group:'المحاسبة',icon:'✎',roles:['admin','accountant','viewer'],async render(el){
  const w=can(['admin','accountant']);
  const ents=await fetchAll('journal_entries','*',q=>q.order('id',{ascending:false})).then(r=>r.slice(0,150));
  const lines=ents.length?await fetchAll('journal_lines','*',q=>q.in('entry_id',ents.map(e=>e.id))):[];
  el.innerHTML=`<div class="bar"><div class="grow"><input id="q" placeholder="🔍 بحث في القيود..."></div>${w?'<button class="btn gold-btn" id="add">+ قيد يومية جديد</button>':''}</div><div id="jl"></div>`;
  const draw=()=>{const q=$('#q',el).value.toLowerCase();const fl=ents.filter(e=>!q||(e.description||'').toLowerCase().includes(q)||(e.entry_no||'').toLowerCase().includes(q));
    $('#jl',el).innerHTML=fl.length?fl.map(e=>{const L=lines.filter(l=>l.entry_id===e.id);const t=L.reduce((s,l)=>s+ +l.debit,0);return `<div class="panel glass" style="padding:.8rem 1rem"><div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap"><b class="gold">${esc(e.entry_no||'#'+e.id)}</b><span class="muted">${e.entry_date}</span><span style="flex:1">${esc(e.description||'')}</span>${e.ref_type?`<span class="tag">${esc(e.ref_type)}</span>`:''}<b class="num">${fmt(t)}</b>${w?`<button class="btn sm" data-rev="${e.id}">عكس القيد</button>${e.ref_type?'':`<button class="btn sm danger" data-del="${e.id}">حذف</button>`}`:''}</div><table class="tbl" style="margin-top:.5rem"><tbody>${L.map(l=>`<tr><td>${esc(acctLabel(acct(l.account_id)))}${l.memo?` <span class="muted s">- ${esc(l.memo)}</span>`:''}</td><td class="num" style="width:130px">${+l.debit?fmt(l.debit):''}</td><td class="num" style="width:130px">${+l.credit?fmt(l.credit):''}</td></tr>`).join('')}</tbody></table></div>`}).join(''):'<div class="tw"><div class="empty">لا توجد قيود</div></div>';
    $$('[data-del]',el).forEach(b=>b.onclick=()=>confirmDlg('حذف القيد نهائياً؟ سيسجل الحذف في سجل التدقيق.',async()=>{await deleteEntry(b.dataset.del);toast('تم الحذف');go('journal')},'حذف'));
    $$('[data-rev]',el).forEach(b=>b.onclick=()=>confirmDlg('إنشاء قيد عكسي بتاريخ اليوم؟',async()=>{const e=ents.find(x=>x.id==b.dataset.rev);const L=lines.filter(l=>l.entry_id===e.id);await postEntry({date:today(),description:'عكس '+(e.entry_no||'')+' - '+(e.description||''),ref_type:'reversal',ref_id:e.id,lines:L.map(l=>({account_id:l.account_id,debit:l.credit,credit:l.debit,memo:l.memo}))});toast('تم القيد العكسي');go('journal')}));};
  $('#q',el).oninput=draw;draw();
  if(w)$('#add',el).onclick=()=>journalForm();
}});
async function journalForm(){
  const ccs=await fetchAll('cost_centers','*',q=>q.eq('active',true)).catch(()=>[]);
  const row=()=>`<tr><td><select class="ac">${acctOptions(a=>isLeaf(a))}</select></td><td><select class="cc"><option value="">—</option>${ccs.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></td><td><input class="dr" type="number" step="any" min="0" placeholder="0.00"></td><td><input class="cr" type="number" step="any" min="0" placeholder="0.00"></td><td><input class="mm" placeholder="بيان"></td><td><button class="btn sm danger rm">✕</button></td></tr>`;
  const {ov}=modal('قيد يومية جديد',`<div class="fg"><label>التاريخ<input type="date" id="jd" value="${today()}"></label><label>البيان<input id="jx" placeholder="وصف القيد"></label></div><div class="tw"><table class="tbl lines"><thead><tr><th>الحساب</th><th>مركز التكلفة</th><th>مدين</th><th>دائن</th><th>بيان البند</th><th></th></tr></thead><tbody id="jb">${row()}${row()}</tbody></table></div><button class="btn sm" id="ar" style="margin-top:.6rem">+ سطر</button><div class="bal"><span>مدين: <b id="td" class="num">0.00</b></span><span>دائن: <b id="tc" class="num">0.00</b></span><b id="tst"></b></div>`,{wide:true,save:'ترحيل القيد',onSave:async o=>{
    const lines=$$('#jb tr',o).map(r=>({account_id:+$('.ac',r).value||null,debit:$('.dr',r).value,credit:$('.cr',r).value,memo:$('.mm',r).value,cost_center_id:$('.cc',r).value||null})).filter(l=>l.account_id);
    if(lines.some(l=>+l.debit>0&&+l.credit>0))throw new Error('البند الواحد إما مدين أو دائن');
    await postEntry({date:$('#jd',o).value,description:$('#jx',o).value||'قيد يومية',lines});toast('تم ترحيل القيد');go('journal')}});
  const calc=()=>{let d=0,c=0;$$('#jb tr',ov).forEach(r=>{d+=+$('.dr',r).value||0;c+=+$('.cr',r).value||0});$('#td',ov).textContent=fmt(d);$('#tc',ov).textContent=fmt(c);const ok=Math.abs(d-c)<0.005&&d>0;$('#tst',ov).textContent=ok?'✓ القيد متوازن':'القيد غير متوازن';$('#tst',ov).className=ok?'ok':'bad'};
  const bind=()=>{$$('#jb input',ov).forEach(i=>i.oninput=calc);$$('.rm',ov).forEach(b=>b.onclick=()=>{b.closest('tr').remove();calc()})};
  $('#ar',ov).onclick=()=>{$('#jb',ov).insertAdjacentHTML('beforeend',row());bind()};bind();calc();
}

/* ledger */
page('ledger',{title:'كشف حساب',group:'المحاسبة',icon:'☰',roles:['admin','accountant','viewer'],async render(el){
  el.innerHTML=dateBar(`<label style="margin:0">الحساب<select id="ac" style="min-width:260px">${acctOptions(null,E.ledgerAcc)}</select></label>`,{from:yearStart()})+'<div id="out"></div>';
  let data=null;
  const run=async()=>{const id=+$('#ac',el).value;if(!id){$('#out',el).innerHTML='<div class="tw"><div class="empty">اختر حساباً</div></div>';return}
    const{from,to}=range(el);const a=acct(id);
    const all=await fetchAll('journal_lines','*, journal_entries(entry_no,entry_date,description)',q=>q.eq('account_id',id));
    const op=all.filter(l=>from&&l.journal_entries.entry_date<from).reduce((s,l)=>s+sign(a,l),0);
    const L=all.filter(l=>(!from||l.journal_entries.entry_date>=from)&&(!to||l.journal_entries.entry_date<=to)).sort((x,y)=>x.journal_entries.entry_date.localeCompare(y.journal_entries.entry_date)||x.id-y.id);
    let run=op;const rows=L.map(l=>({d:l.journal_entries.entry_date,no:l.journal_entries.entry_no,t:l.journal_entries.description||l.memo,dr:+l.debit,cr:+l.credit,bal:(run+=sign(a,l))}));
    data=[['التاريخ','القيد','البيان','مدين','دائن','الرصيد'],['','','رصيد افتتاحي','','',op],...rows.map(r=>[r.d,r.no,r.t,r.dr,r.cr,r.bal])];
    $('#out',el).innerHTML=`<div class="sec-t">${esc(acctLabel(a))}</div>`+tableHtml([{label:'التاريخ',k:'d'},{label:'القيد',k:'no'},{label:'البيان',k:'t'},{label:'مدين',cls:'num',f:r=>r.dr?fmt(r.dr):''},{label:'دائن',cls:'num',f:r=>r.cr?fmt(r.cr):''},{label:'الرصيد',cls:'num',f:r=>fmt(r.bal)}],[{d:'',no:'',t:'رصيد افتتاحي',dr:0,cr:0,bal:op},...rows],{foot:`<tr><td colspan="3">الإجمالي</td><td class="num">${fmt(rows.reduce((s,r)=>s+r.dr,0))}</td><td class="num">${fmt(rows.reduce((s,r)=>s+r.cr,0))}</td><td class="num">${fmt(run)}</td></tr>`})};
  $('#go',el).onclick=run;$('#prt',el).onclick=()=>print();$('#csv',el).onclick=()=>data&&exportCSV('ledger',data);if(E.ledgerAcc)run();
}});

/* trial balance */
page('trial',{title:'ميزان المراجعة',group:'المحاسبة',icon:'⚖',roles:['admin','accountant','viewer'],async render(el){
  el.innerHTML=dateBar()+'<div id="out"></div>';let data=null;
  const run=async()=>{const{from,to}=range(el);const m=await balancesMap(from,to);
    const rows=E.accounts.filter(a=>isLeaf(a)&&m[a.id]).map(a=>{const n=+m[a.id].debit-+m[a.id].credit;return{a,dr:+m[a.id].debit,cr:+m[a.id].credit,bd:n>0?n:0,bc:n<0?-n:0}});
    const T=k=>rows.reduce((s,r)=>s+r[k],0);const ok=Math.abs(T('bd')-T('bc'))<0.005;
    data=[['الكود','الحساب','مدين','دائن','رصيد مدين','رصيد دائن'],...rows.map(r=>[r.a.code,r.a.name,r.dr,r.cr,r.bd,r.bc])];
    $('#out',el).innerHTML=tableHtml([{label:'الكود',cls:'num',f:r=>r.a.code},{label:'الحساب',f:r=>r.a.name},{label:'حركة مدينة',cls:'num',f:r=>fmt(r.dr)},{label:'حركة دائنة',cls:'num',f:r=>fmt(r.cr)},{label:'رصيد مدين',cls:'num',f:r=>r.bd?fmt(r.bd):''},{label:'رصيد دائن',cls:'num',f:r=>r.bc?fmt(r.bc):''}],rows,{foot:`<tr><td colspan="2">الإجمالي ${ok?'<span class="tag ok">متوازن ✓</span>':'<span class="tag bad">غير متوازن</span>'}</td><td class="num">${fmt(T('dr'))}</td><td class="num">${fmt(T('cr'))}</td><td class="num">${fmt(T('bd'))}</td><td class="num">${fmt(T('bc'))}</td></tr>`,empty:'لا توجد حركة في هذه الفترة'})};
  $('#go',el).onclick=run;$('#prt',el).onclick=()=>print();$('#csv',el).onclick=()=>data&&exportCSV('trial-balance',data);run();
}});

function stmtSection(title,accts,m){const rows=accts.filter(a=>isLeaf(a)&&bOf(m,a)!==0);return {rows,total:rows.reduce((s,a)=>s+bOf(m,a),0),html:`<div class="sec-t">${title}</div>`+tableHtml([{label:'الحساب',f:a=>acctLabel(a)},{label:'المبلغ',cls:'num',f:a=>fmt(bOf(m,a))}],rows,{empty:'—'})}}
page('pnl',{title:'قائمة الدخل',group:'المحاسبة',icon:'▲',roles:['admin','accountant','viewer'],async render(el){
  el.innerHTML=dateBar('',{from:monthStart()})+'<div id="out"></div>';let data=null;
  const run=async()=>{const{from,to}=range(el);const m=await balancesMap(from,to);
    const cogs=acctByCode('5101');const R=stmtSection('الإيرادات',E.accounts.filter(a=>a.type==='revenue'),m);
    const C=stmtSection('تكلفة البضاعة المباعة',[cogs],m);const X=stmtSection('المصروفات التشغيلية',E.accounts.filter(a=>a.type==='expense'&&a.code!=='5101'),m);
    const gp=R.total-C.total,np=gp-X.total;
    data=[['البند','المبلغ'],['إجمالي الإيرادات',R.total],['تكلفة المبيعات',C.total],['مجمل الربح',gp],['المصروفات',X.total],['صافي الربح',np]];
    $('#out',el).innerHTML=R.html+C.html+`<div class="panel glass stmt-total">مجمل الربح: <b class="num gold">${fmt(gp)}</b></div>`+X.html+`<div class="panel glass stmt-total">صافي الربح للفترة: <b class="num ${np>=0?'gold':''}" style="${np<0?'color:var(--bad)':''}">${fmt(np)}</b> ${cur()}</div>`};
  $('#go',el).onclick=run;$('#prt',el).onclick=()=>print();$('#csv',el).onclick=()=>data&&exportCSV('income-statement',data);run();
}});
page('bs',{title:'المركز المالي',group:'المحاسبة',icon:'▣',roles:['admin','accountant','viewer'],async render(el){
  el.innerHTML=`<div class="bar"><label style="margin:0">حتى تاريخ<input type="date" id="dt" value="${today()}"></label><button class="btn gold-btn" id="go">عرض</button><button class="btn" id="csv">تصدير Excel</button><button class="btn" id="prt">طباعة</button></div><div id="out"></div>`;let data=null;
  const run=async()=>{const to=$('#dt',el).value;const m=await balancesMap(null,to);
    const A=stmtSection('الأصول',E.accounts.filter(a=>a.type==='asset'),m),L=stmtSection('الخصوم',E.accounts.filter(a=>a.type==='liability'),m),Q=stmtSection('حقوق الملكية',E.accounts.filter(a=>a.type==='equity'),m);
    const pl=E.accounts.filter(a=>isLeaf(a)&&a.type==='revenue').reduce((s,a)=>s+bOf(m,a),0)-E.accounts.filter(a=>isLeaf(a)&&a.type==='expense').reduce((s,a)=>s+bOf(m,a),0);
    const eq=Q.total+pl,ok=Math.abs(A.total-(L.total+eq))<0.005;
    data=[['البند','المبلغ'],['إجمالي الأصول',A.total],['إجمالي الخصوم',L.total],['حقوق الملكية',Q.total],['أرباح الفترة',pl],['إجمالي الخصوم وحقوق الملكية',L.total+eq]];
    $('#out',el).innerHTML=`<div class="grid2"><div>${A.html}<div class="panel glass stmt-total">إجمالي الأصول: <b class="num gold">${fmt(A.total)}</b></div></div><div>${L.html}<div class="panel glass">إجمالي الخصوم: <b class="num">${fmt(L.total)}</b></div>${Q.html}<div class="panel glass">أرباح (خسائر) الفترة غير المقفلة: <b class="num">${fmt(pl)}</b></div><div class="panel glass stmt-total">إجمالي الخصوم وحقوق الملكية: <b class="num gold">${fmt(L.total+eq)}</b> ${ok?'<span class="tag ok">متوازنة ✓</span>':'<span class="tag bad">غير متوازنة</span>'}</div></div></div>`};
  $('#go',el).onclick=run;$('#prt',el).onclick=()=>print();$('#csv',el).onclick=()=>data&&exportCSV('balance-sheet',data);run();
}});
