const SUPABASE_URL = 'https://pjalvxnjcjeirhqtoiva.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4dzvn_Pwji-8MyhP9BzHWQ_XPyZP3Qo';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s, r = document) => r.querySelector(s);
const DB = { customers: [], suppliers: [], products: [], invoices: [], payments: [], expenses: [] };
const fmt = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600); };

/* ---------- login screen widgets ---------- */
(function () {
  const ticks = $('#ticks');
  for (let i = 0; i < 12; i++) {
    const a = i * 30 * Math.PI / 180, r1 = i % 3 === 0 ? 76 : 82, r2 = 88;
    ticks.insertAdjacentHTML('beforeend', `<line x1="${100 + r1 * Math.sin(a)}" y1="${100 - r1 * Math.cos(a)}" x2="${100 + r2 * Math.sin(a)}" y2="${100 - r2 * Math.cos(a)}" stroke="#d4af37" stroke-width="${i % 3 === 0 ? 3 : 1.5}"/>`);
  }
  function tick() {
    const d = new Date(), s = d.getSeconds(), m = d.getMinutes(), h = d.getHours() % 12;
    $('#ss').setAttribute('transform', `rotate(${s * 6} 100 100)`);
    $('#mm').setAttribute('transform', `rotate(${m * 6 + s / 10} 100 100)`);
    $('#hh').setAttribute('transform', `rotate(${h * 30 + m / 2} 100 100)`);
    $('#digital').textContent = d.toLocaleTimeString('en-GB');
    $('#dateText').textContent = d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  tick(); setInterval(tick, 1000);
  let cm = new Date();
  function cal() {
    const y = cm.getFullYear(), m = cm.getMonth();
    $('#calTitle').textContent = MONTHS[m] + ' ' + y;
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), now = new Date();
    let h = ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'].map(d => `<b>${d}</b>`).join('');
    for (let i = 0; i < first; i++) h += '<span></span>';
    for (let d = 1; d <= days; d++) h += `<span class="${now.getFullYear() === y && now.getMonth() === m && now.getDate() === d ? 'today' : ''}">${d}</span>`;
    $('#calGrid').innerHTML = h;
  }
  $('#calPrev').onclick = () => { cm = new Date(cm.getFullYear(), cm.getMonth() - 1, 1); cal(); };
  $('#calNext').onclick = () => { cm = new Date(cm.getFullYear(), cm.getMonth() + 1, 1); cal(); };
  cal();
})();

/* ---------- auth ---------- */
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginErr').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
  if (error) { $('#loginErr').textContent = 'بيانات الدخول غير صحيحة'; return; }
  boot();
});
$('#logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };
async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); return; }
  $('#userEmail').textContent = data.session.user.email;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#topDate').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  await loadAll(); buildNav(); route();
}
async function loadAll() {
  await Promise.all(Object.keys(DB).map(async t => {
    const { data, error } = await sb.from(t).select('*').order('id', { ascending: false });
    if (error) toast('خطأ في تحميل ' + t); else DB[t] = data;
  }));
}

/* ---------- calculations ---------- */
const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
function stockOf(p) {
  let q = Number(p.opening_qty) || 0;
  for (const inv of DB.invoices) for (const l of inv.lines || []) if (l.product_id === p.id) q += (inv.kind === 'purchase' ? 1 : -1) * (Number(l.qty) || 0);
  return q;
}
function customerBalance(id) {
  return sum(DB.invoices.filter(i => i.kind === 'sale' && i.party_id === id), i => i.total - i.paid) - sum(DB.payments.filter(p => p.kind === 'in' && p.party_id === id), p => p.amount);
}
function supplierBalance(id) {
  return sum(DB.invoices.filter(i => i.kind === 'purchase' && i.party_id === id), i => i.total - i.paid) - sum(DB.payments.filter(p => p.kind === 'out' && p.party_id === id), p => p.amount);
}
const inMonth = (d, y, m) => { const x = new Date(d); return x.getFullYear() === y && x.getMonth() === m; };

/* ---------- navigation ---------- */
const PAGES = [
  ['dashboard', '⌂', 'لوحة التحكم'], ['sales', '◈', 'فواتير المبيعات'], ['purchases', '◈', 'فواتير المشتريات'],
  ['products', '▣', 'الأصناف والمخزون'], ['customers', '☺', 'العملاء'], ['suppliers', '⚑', 'الموردون'],
  ['payments', '⇄', 'المدفوعات والمقبوضات'], ['expenses', '▤', 'المصروفات'], ['reports', '◧', 'التقارير']
];
function buildNav() {
  $('#nav').innerHTML = PAGES.map(([k, i, t]) => `<button class="nav-item" data-k="${k}"><i>${i}</i>${t}</button>`).join('');
  $('#nav').onclick = e => { const b = e.target.closest('.nav-item'); if (b) { location.hash = b.dataset.k; $('#sidebar').classList.remove('open'); } };
}
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
window.addEventListener('hashchange', () => $('#app').classList.contains('hidden') || route());
function route() {
  const k = (location.hash || '#dashboard').slice(1);
  const page = PAGES.find(p => p[0] === k) || PAGES[0];
  document.querySelectorAll('.nav-item[data-k]').forEach(b => b.classList.toggle('active', b.dataset.k === page[0]));
  $('#pageTitle').textContent = page[2];
  ({ dashboard, sales: () => invoices('sale'), purchases: () => invoices('purchase'), products, customers: () => parties('customers'), suppliers: () => parties('suppliers'), payments, expenses, reports })[page[0]]();
}
const refresh = async () => { await loadAll(); route(); };

/* ---------- modal helper ---------- */
function openModal(html, wide) { $('#modalBox').className = 'modal-box glass' + (wide ? ' wide' : ''); $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
async function save(table, row, id) {
  const q = id ? sb.from(table).update(row).eq('id', id) : sb.from(table).insert(row);
  const { error } = await q;
  if (error) { toast('تعذر الحفظ: ' + error.message); return false; }
  toast('تم الحفظ'); closeModal(); await refresh(); return true;
}
async function del(table, id) {
  if (!confirm('هل أنت متأكد من الحذف؟')) return;
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) return toast('تعذر الحذف'); toast('تم الحذف'); refresh();
}
/* generic form: fields = [key,label,type,opts,full] */
function formModal(title, table, fields, row = {}) {
  const f = fields.map(([k, l, t, o, full]) => {
    const v = row[k] ?? (t === 'date' ? today() : '');
    const inp = t === 'select' ? `<select name="${k}">${o.map(x => `<option value="${esc(x[0])}" ${String(x[0]) === String(v) ? 'selected' : ''}>${esc(x[1])}</option>`).join('')}</select>`
      : t === 'textarea' ? `<textarea name="${k}" rows="2">${esc(v)}</textarea>` : `<input name="${k}" type="${t || 'text'}" value="${esc(v)}" ${t === 'number' ? 'step="any"' : ''}>`;
    return `<label class="field ${full ? 'full' : ''}"><span>${l}</span>${inp}</label>`;
  }).join('');
  openModal(`<h2>${title}</h2><form id="gf"><div class="form-grid">${f}</div><div class="actions"><button class="btn gold">حفظ</button><button type="button" class="btn" onclick="closeModal()">إلغاء</button></div></form>`);
  $('#gf').onsubmit = e => {
    e.preventDefault(); const o = {};
    fields.forEach(([k, , t]) => { let v = e.target[k].value; if (t === 'number') v = Number(v) || 0; if (t === 'date' && !v) v = null; o[k] = v; });
    save(table, o, row.id);
  };
}
function listPage({ title, addLabel, onAdd, head, rows, searchable = true, extra = '' }) {
  $('#view').innerHTML = `<div class="toolbar">${searchable ? '<input id="q" placeholder="🔍 بحث...">' : ''}<span class="sp"></span>${extra}${onAdd ? `<button class="btn gold" id="addBtn">+ ${addLabel}</button>` : ''}</div>
  <div class="glass tablewrap"><table><thead><tr>${head.map(h => `<th class="${h[1] || ''}">${h[0]}</th>`).join('')}</tr></thead><tbody id="tb"></tbody></table></div>`;
  const draw = () => {
    const q = (($('#q') || {}).value || '').trim().toLowerCase();
    const r = rows.filter(x => !q || x.s.toLowerCase().includes(q));
    $('#tb').innerHTML = r.length ? r.map(x => `<tr>${x.c.map((c, i) => `<td class="${head[i][1] || ''}">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" class="empty">لا توجد بيانات بعد</td></tr>`;
  };
  if ($('#q')) $('#q').oninput = draw; draw();
  if (onAdd) $('#addBtn').onclick = onAdd;
}
const rowBtns = (t, id, editFn) => `<button class="btn" onclick="${editFn}(${id})">تعديل</button> <button class="btn danger" onclick="del('${t}',${id})">حذف</button>`;

/* ---------- dashboard ---------- */
function dashboard() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const sales = sum(DB.invoices.filter(i => i.kind === 'sale' && inMonth(i.inv_date, y, m)), i => i.total);
  const purch = sum(DB.invoices.filter(i => i.kind === 'purchase' && inMonth(i.inv_date, y, m)), i => i.total);
  const exp = sum(DB.expenses.filter(e => inMonth(e.exp_date, y, m)), e => e.amount);
  const recv = sum(DB.customers, c => Math.max(0, customerBalance(c.id)));
  const pay = sum(DB.suppliers, s => Math.max(0, supplierBalance(s.id)));
  const low = DB.products.filter(p => stockOf(p) <= Number(p.min_qty));
  const invVal = sum(DB.products, p => Math.max(0, stockOf(p)) * p.cost);
  const net = sales - purch - exp;
  const mons = []; for (let i = 5; i >= 0; i--) { const d = new Date(y, m - i, 1); mons.push([d.getFullYear(), d.getMonth()]); }
  const ms = mons.map(([yy, mm]) => sum(DB.invoices.filter(i => i.kind === 'sale' && inMonth(i.inv_date, yy, mm)), i => i.total));
  const mp = mons.map(([yy, mm]) => sum(DB.invoices.filter(i => i.kind === 'purchase' && inMonth(i.inv_date, yy, mm)), i => i.total));
  const mx = Math.max(1, ...ms, ...mp);
  const recent = DB.invoices.slice(0, 6);
  $('#view').innerHTML = `
  <div class="kpis">
    <div class="glass kpi gold"><small>مبيعات الشهر</small><b>${fmt(sales)}</b></div>
    <div class="glass kpi"><small>مشتريات الشهر</small><b>${fmt(purch)}</b></div>
    <div class="glass kpi"><small>مصروفات الشهر</small><b>${fmt(exp)}</b></div>
    <div class="glass kpi"><small>صافي الربح التقديري</small><b class="${net >= 0 ? 'ok' : 'bad'}">${fmt(net)}</b></div>
    <div class="glass kpi"><small>مستحق على العملاء</small><b>${fmt(recv)}</b></div>
    <div class="glass kpi"><small>مستحق للموردين</small><b>${fmt(pay)}</b></div>
    <div class="glass kpi"><small>قيمة المخزون</small><b>${fmt(invVal)}</b></div>
    <div class="glass kpi"><small>أصناف تحت حد الطلب</small><b class="${low.length ? 'bad' : 'ok'}">${low.length}</b></div>
  </div>
  <div class="grid2">
    <div class="glass card"><h3>المبيعات والمشتريات (آخر 6 شهور)</h3>
      <div class="bars">${mons.map(([yy, mm], i) => `<div class="col"><div class="pair"><div class="bar s" style="height:${ms[i] / mx * 100}%" title="${fmt(ms[i])}"></div><div class="bar p" style="height:${mp[i] / mx * 100}%" title="${fmt(mp[i])}"></div></div><small class="muted">${MONTHS[mm]}</small></div>`).join('')}</div>
      <div class="legend"><span><i style="background:#d4af37"></i>مبيعات</span><span><i style="background:#3d5aa8"></i>مشتريات</span></div></div>
    <div class="glass card"><h3>تنبيهات المخزون</h3>${low.length ? low.slice(0, 8).map(p => `<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.06)"><span class="link" onclick="location.hash='products'">${esc(p.name)}</span><span class="badge bad">${fmt(stockOf(p))} / ${fmt(p.min_qty)}</span></div>`).join('') : '<div class="empty">المخزون سليم ✓</div>'}</div>
  </div>
  <div class="glass card" style="margin-top:1rem"><h3>آخر الفواتير</h3>
    ${recent.length ? `<div class="tablewrap"><table><thead><tr><th>النوع</th><th>الرقم</th><th>التاريخ</th><th>الطرف</th><th class="num">الإجمالي</th></tr></thead><tbody>${recent.map(i => `<tr><td>${i.kind === 'sale' ? 'بيع' : 'شراء'}</td><td><span class="link" onclick="viewInvoice(${i.id})">${esc(i.number || i.id)}</span></td><td>${i.inv_date || ''}</td><td>${esc(i.party_name)}</td><td class="num">${fmt(i.total)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا توجد فواتير بعد. ابدأ بإضافة فاتورة بيع من قسم المبيعات.</div>'}
  </div>`;
}

/* ---------- parties ---------- */
function parties(t) {
  const isC = t === 'customers', lab = isC ? 'عميل' : 'مورد';
  const bal = id => isC ? customerBalance(id) : supplierBalance(id);
  listPage({
    title: lab, addLabel: 'إضافة ' + lab, onAdd: () => partyForm(t),
    head: [['الاسم'], ['الهاتف'], ['العنوان'], ['الرصيد المستحق', 'num'], ['']],
    rows: DB[t].map(p => ({ s: `${p.name} ${p.phone || ''}`, c: [`<span class="link" onclick="statement('${t}',${p.id})">${esc(p.name)}</span>`, esc(p.phone), esc(p.address), `<span class="${bal(p.id) > 0 ? 'badge bad' : ''}">${fmt(bal(p.id))}</span>`, rowBtns(t, p.id, "partyForm.bind(null,'" + t + "')")] }))
  });
}
window.partyForm = (t, id) => formModal((id ? 'تعديل ' : 'إضافة ') + (t === 'customers' ? 'عميل' : 'مورد'), t,
  [['name', 'الاسم', 'text'], ['phone', 'الهاتف', 'text'], ['address', 'العنوان', 'text', null, 1], ['notes', 'ملاحظات', 'textarea', null, 1]], DB[t].find(x => x.id === id) || {});
window.statement = (t, id) => {
  const isC = t === 'customers', p = DB[t].find(x => x.id === id);
  const invs = DB.invoices.filter(i => i.kind === (isC ? 'sale' : 'purchase') && i.party_id === id);
  const pays = DB.payments.filter(x => x.kind === (isC ? 'in' : 'out') && x.party_id === id);
  const ev = [...invs.map(i => ({ d: i.inv_date, t: (isC ? 'فاتورة بيع ' : 'فاتورة شراء ') + (i.number || i.id), debit: i.total - i.paid, credit: 0 })), ...pays.map(x => ({ d: x.pay_date, t: isC ? 'دفعة مستلمة' : 'دفعة مسددة', debit: 0, credit: x.amount }))].sort((a, b) => String(a.d).localeCompare(String(b.d)));
  let run = 0;
  openModal(`<h2>كشف حساب: ${esc(p.name)}</h2><div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th class="num">مدين</th><th class="num">دائن</th><th class="num">الرصيد</th></tr></thead><tbody>${ev.map(e => { run += e.debit - e.credit; return `<tr><td>${e.d || ''}</td><td>${esc(e.t)}</td><td class="num">${fmt(e.debit)}</td><td class="num">${fmt(e.credit)}</td><td class="num">${fmt(run)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">لا توجد حركات</td></tr>'}</tbody></table></div><div class="totals"><span>الرصيد الحالي: <span class="goldtext">${fmt(run)}</span></span></div><div class="actions no-print"><button class="btn gold" onclick="window.print()">طباعة</button><button class="btn" onclick="closeModal()">إغلاق</button></div>`, true);
};

/* ---------- products ---------- */
function products() {
  listPage({
    addLabel: 'إضافة صنف', onAdd: () => productForm(),
    head: [['الكود'], ['الصنف'], ['الوحدة'], ['التكلفة', 'num'], ['السعر', 'num'], ['الرصيد', 'num'], ['القيمة', 'num'], ['الحالة'], ['']],
    rows: DB.products.map(p => { const q = stockOf(p), low = q <= Number(p.min_qty); return { s: `${p.code || ''} ${p.name}`, c: [esc(p.code), esc(p.name), esc(p.unit), fmt(p.cost), fmt(p.price), fmt(q), fmt(q * p.cost), low ? '<span class="badge bad">تحت حد الطلب</span>' : '<span class="badge ok">متوفر</span>', rowBtns('products', p.id, 'productForm')] }; })
  });
}
window.productForm = id => formModal(id ? 'تعديل صنف' : 'إضافة صنف', 'products',
  [['code', 'الكود', 'text'], ['name', 'اسم الصنف', 'text'], ['unit', 'الوحدة', 'text'], ['opening_qty', 'رصيد أول المدة', 'number'], ['cost', 'سعر التكلفة', 'number'], ['price', 'سعر البيع', 'number'], ['min_qty', 'حد الطلب', 'number']], DB.products.find(x => x.id === id) || { unit: 'قطعة' });

/* ---------- invoices ---------- */
function invoices(kind) {
  const sale = kind === 'sale';
  listPage({
    addLabel: sale ? 'فاتورة بيع جديدة' : 'فاتورة شراء جديدة', onAdd: () => invoiceForm(kind),
    head: [['الرقم'], ['التاريخ'], [sale ? 'العميل' : 'المورد'], ['الإجمالي', 'num'], ['المدفوع', 'num'], ['المتبقي', 'num'], ['']],
    rows: DB.invoices.filter(i => i.kind === kind).map(i => ({ s: `${i.number || ''} ${i.party_name || ''}`, c: [`<span class="link" onclick="viewInvoice(${i.id})">${esc(i.number || i.id)}</span>`, i.inv_date || '', esc(i.party_name), fmt(i.total), fmt(i.paid), `<span class="${i.total - i.paid > 0 ? 'badge bad' : 'badge ok'}">${fmt(i.total - i.paid)}</span>`, `<button class="btn" onclick="viewInvoice(${i.id})">عرض</button> <button class="btn danger" onclick="del('invoices',${i.id})">حذف</button>`] }))
  });
}
window.viewInvoice = id => {
  const i = DB.invoices.find(x => x.id === id); if (!i) return;
  openModal(`<h2>${i.kind === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'} رقم ${esc(i.number || i.id)}</h2><p class="muted">${i.inv_date || ''} · ${esc(i.party_name)}</p>
  <div class="tablewrap"><table><thead><tr><th>الصنف</th><th class="num">الكمية</th><th class="num">السعر</th><th class="num">الإجمالي</th></tr></thead><tbody>${(i.lines || []).map(l => `<tr><td>${esc(l.name)}</td><td class="num">${fmt(l.qty)}</td><td class="num">${fmt(l.price)}</td><td class="num">${fmt(l.qty * l.price)}</td></tr>`).join('')}</tbody></table></div>
  <div class="totals"><span>الإجمالي: ${fmt(i.total)}</span><span>المدفوع: ${fmt(i.paid)}</span><span>المتبقي: <span class="goldtext">${fmt(i.total - i.paid)}</span></span></div>${i.notes ? `<p class="muted">${esc(i.notes)}</p>` : ''}
  <div class="actions no-print"><button class="btn gold" onclick="window.print()">طباعة</button><button class="btn" onclick="closeModal()">إغلاق</button></div>`, true);
};
window.invoiceForm = kind => {
  const sale = kind === 'sale', plist = sale ? DB.customers : DB.suppliers;
  const prods = DB.products;
  const num = (sale ? 'S-' : 'P-') + String(DB.invoices.filter(i => i.kind === kind).length + 1).padStart(4, '0');
  openModal(`<h2>${sale ? 'فاتورة بيع جديدة' : 'فاتورة شراء جديدة'}</h2><form id="inv">
  <div class="form-grid">
    <label class="field"><span>رقم الفاتورة</span><input name="number" value="${num}"></label>
    <label class="field"><span>التاريخ</span><input name="inv_date" type="date" value="${today()}"></label>
    <label class="field full"><span>${sale ? 'العميل' : 'المورد'}</span><select name="party"><option value="">— اختر —</option>${plist.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
  </div>
  <div class="tablewrap"><table class="lines"><thead><tr><th>الصنف</th><th class="num">الكمية</th><th class="num">السعر</th><th class="num">الإجمالي</th><th></th></tr></thead><tbody id="ln"></tbody></table></div>
  <button type="button" class="btn" id="addLn" style="margin-top:.6rem">+ إضافة سطر</button>
  <div class="form-grid" style="margin-top:1rem"><label class="field"><span>المدفوع الآن</span><input name="paid" type="number" step="any" value="0"></label><label class="field"><span>ملاحظات</span><input name="notes"></label></div>
  <div class="totals"><span>الإجمالي: <span class="goldtext" id="tot">0</span></span><span>المتبقي: <span id="rem">0</span></span></div>
  <div class="actions"><button class="btn gold">حفظ الفاتورة</button><button type="button" class="btn" onclick="closeModal()">إلغاء</button></div></form>`, true);
  const ln = $('#ln');
  const calc = () => {
    let t = 0; ln.querySelectorAll('tr').forEach(r => { const v = Number(r.querySelector('.q').value) * Number(r.querySelector('.p').value); r.querySelector('.t').textContent = fmt(v); t += v; });
    $('#tot').textContent = fmt(t); $('#rem').textContent = fmt(t - Number($('#inv').paid.value || 0)); return t;
  };
  const add = () => {
    ln.insertAdjacentHTML('beforeend', `<tr><td><select class="pr"><option value="">— اختر صنف —</option>${prods.map(p => `<option value="${p.id}" data-price="${sale ? p.price : p.cost}">${esc(p.name)}</option>`).join('')}</select></td><td><input class="q" type="number" step="any" value="1"></td><td><input class="p" type="number" step="any" value="0"></td><td class="num t">0</td><td><button type="button" class="btn danger rm">×</button></td></tr>`);
  };
  add();
  $('#addLn').onclick = add;
  ln.addEventListener('input', e => { if (e.target.classList.contains('pr')) { const o = e.target.selectedOptions[0]; e.target.closest('tr').querySelector('.p').value = o.dataset.price || 0; } calc(); });
  ln.addEventListener('click', e => { if (e.target.classList.contains('rm')) { e.target.closest('tr').remove(); calc(); } });
  $('#inv').paid.oninput = calc;
  $('#inv').onsubmit = async e => {
    e.preventDefault(); const f = e.target; const total = calc();
    const lines = [...ln.querySelectorAll('tr')].map(r => { const s = r.querySelector('.pr'); return { product_id: Number(s.value) || null, name: s.selectedOptions[0].textContent, qty: Number(r.querySelector('.q').value), price: Number(r.querySelector('.p').value) }; }).filter(l => l.product_id && l.qty > 0);
    if (!lines.length) return toast('أضف صنفًا واحدًا على الأقل');
    if (sale) for (const l of lines) { const p = prods.find(x => x.id === l.product_id); if (stockOf(p) < l.qty && !confirm(`الكمية المتاحة من "${p.name}" ${fmt(stockOf(p))} فقط. هل تريد المتابعة؟`)) return; }
    const party = plist.find(p => String(p.id) === f.party.value);
    save('invoices', { kind, number: f.number.value, inv_date: f.inv_date.value || null, party_id: party ? party.id : null, party_name: party ? party.name : 'نقدي', lines, total: total, paid: Number(f.paid.value) || 0, notes: f.notes.value });
  };
};

/* ---------- payments ---------- */
function payments() {
  listPage({
    addLabel: 'تسجيل دفعة', onAdd: () => payForm(),
    head: [['التاريخ'], ['النوع'], ['الطرف'], ['المبلغ', 'num'], ['ملاحظات'], ['']],
    rows: DB.payments.map(p => ({ s: `${p.party_name} ${p.notes || ''}`, c: [p.pay_date || '', p.kind === 'in' ? '<span class="badge ok">مقبوضات من عميل</span>' : '<span class="badge">مدفوعات لمورد</span>', esc(p.party_name), fmt(p.amount), esc(p.notes), `<button class="btn danger" onclick="del('payments',${p.id})">حذف</button>`] }))
  });
}
window.payForm = () => {
  const opts = [...DB.customers.map(c => ['in:' + c.id, 'عميل: ' + c.name]), ...DB.suppliers.map(s => ['out:' + s.id, 'مورد: ' + s.name])];
  openModal(`<h2>تسجيل دفعة</h2><form id="pf"><div class="form-grid"><label class="field full"><span>الطرف</span><select name="party">${opts.map(o => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select></label><label class="field"><span>المبلغ</span><input name="amount" type="number" step="any" required></label><label class="field"><span>التاريخ</span><input name="pay_date" type="date" value="${today()}"></label><label class="field full"><span>ملاحظات</span><input name="notes"></label></div><div class="actions"><button class="btn gold">حفظ</button><button type="button" class="btn" onclick="closeModal()">إلغاء</button></div></form>`);
  $('#pf').onsubmit = e => { e.preventDefault(); const f = e.target; const [k, id] = f.party.value.split(':'); if (!id) return toast('أضف عميلاً أو مورداً أولاً');
    const nm = f.party.selectedOptions[0].textContent.replace(/^[^:]+: /, '');
    save('payments', { kind: k, party_id: Number(id), party_name: nm, amount: Number(f.amount.value), pay_date: f.pay_date.value || null, notes: f.notes.value }); };
};

/* ---------- expenses ---------- */
function expenses() {
  const total = sum(DB.expenses, e => e.amount);
  listPage({
    addLabel: 'إضافة مصروف', onAdd: () => expForm(), extra: `<span class="pill">الإجمالي: ${fmt(total)}</span>`,
    head: [['التاريخ'], ['البند'], ['المبلغ', 'num'], ['ملاحظات'], ['']],
    rows: DB.expenses.map(e => ({ s: `${e.category} ${e.notes || ''}`, c: [e.exp_date || '', esc(e.category), fmt(e.amount), esc(e.notes), rowBtns('expenses', e.id, 'expForm')] }))
  });
}
window.expForm = id => formModal(id ? 'تعديل مصروف' : 'إضافة مصروف', 'expenses', [['exp_date', 'التاريخ', 'date'], ['category', 'البند (إيجار، رواتب، كهرباء...)', 'text'], ['amount', 'المبلغ', 'number'], ['notes', 'ملاحظات', 'text']], DB.expenses.find(x => x.id === id) || {});

/* ---------- reports ---------- */
function reports() {
  const sales = sum(DB.invoices.filter(i => i.kind === 'sale'), i => i.total), purch = sum(DB.invoices.filter(i => i.kind === 'purchase'), i => i.total), exp = sum(DB.expenses, e => e.amount);
  let cogs = 0; DB.invoices.filter(i => i.kind === 'sale').forEach(i => (i.lines || []).forEach(l => { const p = DB.products.find(x => x.id === l.product_id); cogs += (p ? p.cost : 0) * l.qty; }));
  const gross = sales - cogs, net = gross - exp;
  $('#view').innerHTML = `<div class="toolbar no-print"><span class="sp"></span><button class="btn gold" onclick="window.print()">طباعة التقرير</button></div>
  <div class="kpis"><div class="glass kpi gold"><small>إجمالي المبيعات</small><b>${fmt(sales)}</b></div><div class="glass kpi"><small>تكلفة البضاعة المباعة</small><b>${fmt(cogs)}</b></div><div class="glass kpi"><small>مجمل الربح</small><b>${fmt(gross)}</b></div><div class="glass kpi"><small>المصروفات</small><b>${fmt(exp)}</b></div><div class="glass kpi"><small>صافي الربح</small><b class="${net >= 0 ? 'ok' : 'bad'}">${fmt(net)}</b></div><div class="glass kpi"><small>إجمالي المشتريات</small><b>${fmt(purch)}</b></div></div>
  <div class="grid2"><div class="glass card"><h3>أرصدة العملاء</h3>${bt(DB.customers.map(c => [c.name, customerBalance(c.id)]))}</div><div class="glass card"><h3>أرصدة الموردين</h3>${bt(DB.suppliers.map(c => [c.name, supplierBalance(c.id)]))}</div></div>
  <div class="glass card" style="margin-top:1rem"><h3>تقرير المخزون</h3>${bt(DB.products.map(p => [p.name + ' (' + fmt(stockOf(p)) + ' ' + (p.unit || '') + ')', stockOf(p) * p.cost]))}</div>`;
  function bt(r) { return r.length ? `<div class="tablewrap"><table><tbody>${r.map(x => `<tr><td>${esc(x[0])}</td><td class="num">${fmt(x[1])}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا توجد بيانات</div>'; }
}

boot();
