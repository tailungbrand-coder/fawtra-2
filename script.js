/* ========================================================
   1. إعدادات قاعدة البيانات السحابية Supabase
======================================================== */
const SUPABASE_URL = "https://ifrfwuhsazsajiwnyxtw.supabase.co/rest/v1/"; 
const SUPABASE_KEY = "sb_secret_edABioqNjzwI7B3EizyGUw_Pv5z0wcp"; 

const useSupabase = SUPABASE_URL !== "" && SUPABASE_KEY !== "";
// تغيير اسم المتغير إلى supabaseClient لتجنب التضارب
const supabaseClient = useSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/* ========================================================
   2. إدارة البيانات (تعمل أونلاين وأوفلاين معاً)
======================================================== */
const appData = {
  invoices: [],
  shipping: [],
  customers: [],
  invCounter: parseInt(localStorage.getItem('tl_counter') || '0', 10),
  shipCounter: parseInt(localStorage.getItem('tl_ship_counter') || '0', 10)
};

// عملاؤك الأساسيون
const initialCustomersData = [
  { name: "كريم عيد", phone: "01227802916", address: "اسيوط مركز القواصيه" },
  { name: "طاهر العباسي", phone: "01009334074", address: "العاصمه الاداريه" },
  { name: "محمد احمد بني سويف", phone: "0109987456", address: "بني سويف الوسطي محل تيتو" },
  { name: "محمد عبدالكريم", phone: "0102993235", address: "العدليه" }
];

// دالة التشغيل التي تقرأ البيانات أول ما تفتح البرنامج
async function initApp() {
  if (useSupabase) {
      try {
          const { data: invData } = await supabaseClient.from('invoices').select('*').order('savedAt', { ascending: false });
          if (invData) appData.invoices = invData;
          
          const { data: shpData } = await supabaseClient.from('shipping').select('*').order('savedAt', { ascending: false });
          if (shpData) appData.shipping = shpData;
          
          const { data: cstData } = await supabaseClient.from('customers').select('*');
          if (cstData) appData.customers = cstData;
          
          const { data: metaData } = await supabaseClient.from('metadata').select('*').eq('id', 'counters').single();
          if (metaData) {
              appData.invCounter = metaData.inv || 0;
              appData.shipCounter = metaData.ship || 0;
          }
      } catch (e) { console.error("Supabase Error: ", e); toast("خطأ في جلب البيانات من السيرفر"); }
  } else {
      appData.invoices = JSON.parse(localStorage.getItem('tl_invoices') || '[]');
      appData.shipping = JSON.parse(localStorage.getItem('tl_shipping') || '[]');
      appData.customers = JSON.parse(localStorage.getItem('tl_customers') || '[]');
  }

  if (appData.customers.length === 0) {
      appData.customers = initialCustomersData;
      if (!useSupabase) localStorage.setItem('tl_customers', JSON.stringify(appData.customers));
  }

  document.getElementById('loading-screen').style.opacity = '0';
  setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 500);
  
  refreshCustomerDatalist();
  resetForm();
  resetShippingForm();
  renderArchive();
  renderShippingArchive();
  renderCustomers();
}

window.addEventListener('DOMContentLoaded', initApp);

function getNextInvNum() {
  appData.invCounter++; let n = appData.invCounter;
  if (useSupabase) supabaseClient.from('metadata').upsert({ id: 'counters', inv: n, ship: appData.shipCounter }).then();
  else localStorage.setItem('tl_counter', String(n));
  return 'INV-' + String(n).padStart(5, '0');
}

function getNextShipNum() {
  appData.shipCounter++; let n = appData.shipCounter;
  if (useSupabase) supabaseClient.from('metadata').upsert({ id: 'counters', inv: appData.invCounter, ship: n }).then();
  else localStorage.setItem('tl_ship_counter', String(n));
  return 'AWB-' + String(n).padStart(6, '0');
}

async function saveCustomerDB(custObj) {
  let existing = appData.customers.find(c => c.name === custObj.name);
  if (existing) { existing.phone = custObj.phone || existing.phone; existing.address = custObj.address || existing.address; }
  else { appData.customers.push(custObj); }
  
  if (useSupabase) await supabaseClient.from('customers').upsert(existing || custObj);
  else localStorage.setItem('tl_customers', JSON.stringify(appData.customers));
  refreshCustomerDatalist();
}


/* ========================================================
   3. نظام الملفات وتوليد الـ HTML المستقل
======================================================== */
let dirHandle = null;
const folderDot = document.getElementById('folderDot');
const folderLabel = document.getElementById('folderLabel');
document.getElementById('pickFolderBtn').addEventListener('click', async ()=>{
  if(!window.showDirectoryPicker){ toast('متصفحك لا يدعم نظام المجلدات. سيتم التحميل كملف عادي'); return; }
  try{
      dirHandle = await window.showDirectoryPicker();
      folderDot.classList.add('on'); folderLabel.textContent = 'مجلد الأرشيف: ' + dirHandle.name; toast('تم ربط المجلد بنجاح');
  }catch(e){ }
});

let cachedCSS = "";
async function getStandaloneCSS() {
  if (cachedCSS) return cachedCSS;
  try {
      const res = await fetch('style.css');
      const text = await res.text();
      // تم فصل التنسيقات الإضافية في وسم style مستقل لمنع أخطاء @import
      cachedCSS = `
      <style>${text}</style>
      <style>
        body { background: #fff !important; padding: 20px; display: flex; justify-content: center; align-items: flex-start; } 
        .print-container { display: block !important; position: relative !important; visibility: visible !important; width:100%; } 
        .print-container * { visibility: visible !important; } 
        .inv-print-sheet, .ship-print-sheet { box-shadow: 0 0 15px rgba(0,0,0,0.1) !important; margin-bottom: 50px !important; } 
      </style>`;
      return cachedCSS;
  } catch(e) { return `<style>body{background:#fff;}</style>`; }
}

async function writeInvoiceFile(filename, rawHTML){
  const css = await getStandaloneCSS();
  const fullHTML = `<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<title>${filename.replace('.html','')}</title>\n${css}\n</head>\n<body>\n<div class="print-container active-print">\n${rawHTML}\n</div>\n</body>\n</html>`;

  if(dirHandle){
      try{
          const fh = await dirHandle.getFileHandle(filename, {create:true});
          const writable = await fh.createWritable(); 
          await writable.write(fullHTML); await writable.close(); 
          return true;
      }catch(e){ console.error(e); }
  }
  const blob = new Blob([fullHTML], {type:'text/html'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; 
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); 
  return false;
}

/* ========================================================
   4. التابات (Tabs) والأدوات
======================================================== */
function toast(msg){ const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2500); }
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
      if(btn.dataset.view === 'archive') renderArchive();
      if(btn.dataset.view === 'customers') renderCustomers();
      if(btn.dataset.view === 'shipping') renderShippingArchive();
  });
});
function printArea(areaId) {
  document.querySelectorAll('.print-container').forEach(el => el.classList.remove('active-print'));
  document.getElementById(areaId).classList.add('active-print');
  window.print();
  setTimeout(()=> document.getElementById(areaId).classList.remove('active-print'), 1000);
}

/* ========================================================
   5. إدارة الفواتير
======================================================== */
const itemsBody = document.getElementById('itemsBody');
const fPaid = document.getElementById('f-paid');

function addRow(desc='', qty=1, price=0){
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="it-desc" value="${desc}" placeholder="اسم الصنف / التفاصيل"></td><td><input class="it-qty" type="number" min="0" step="1" value="${qty}" style="text-align:center;"></td><td><input class="it-price" type="number" min="0" step="0.01" value="${price}" style="text-align:center;"></td><td class="row-total" style="text-align:left;">0</td><td><button type="button" class="rm-row">✕</button></td>`;
  itemsBody.appendChild(tr);
  tr.querySelectorAll('input').forEach(inp=>inp.addEventListener('input', recalc));
  tr.querySelector('.rm-row').addEventListener('click', ()=>{ tr.remove(); recalc(); });
  recalc();
}

function recalc(){
  let subtotal = 0;
  itemsBody.querySelectorAll('tr').forEach(tr=>{
      const qty = parseFloat(tr.querySelector('.it-qty').value) || 0, price = parseFloat(tr.querySelector('.it-price').value) || 0, total = qty * price;
      tr.querySelector('.row-total').textContent = parseFloat(total.toFixed(2)); subtotal += total;
  });
  const paid = parseFloat(fPaid.value) || 0, remain = subtotal - paid;
  document.getElementById('subtotalCell').textContent = parseFloat(subtotal.toFixed(2));
  document.getElementById('remainCell').textContent = parseFloat(remain.toFixed(2));
}

document.getElementById('addRowBtn').addEventListener('click', ()=>addRow());
fPaid.addEventListener('input', recalc);

function resetForm(newNumber=true){
  itemsBody.innerHTML = ''; addRow();
  document.getElementById('f-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('f-name').value = ''; document.getElementById('f-phone').value = ''; document.getElementById('f-address').value = ''; fPaid.value = '0';
  if(newNumber) document.getElementById('f-invnum').value = getNextInvNum();
  recalc();
}

document.getElementById('clearBtn').addEventListener('click', ()=>{ if(confirm('تفريغ الفاتورة؟')) resetForm(); });
document.getElementById('f-name').addEventListener('change', ()=>{
  const cust = appData.customers.find(c=>c.name === document.getElementById('f-name').value.trim());
  if(cust){ document.getElementById('f-phone').value = cust.phone; document.getElementById('f-address').value = cust.address; }
});
function refreshCustomerDatalist(){ document.getElementById('customerNames').innerHTML = appData.customers.map(c=>`<option value="${c.name}">`).join(''); }

function buildPrintSheet(){
  document.getElementById('p-invnum').textContent = document.getElementById('f-invnum').value; document.getElementById('p-date').textContent = document.getElementById('f-date').value;
  document.getElementById('p-name').textContent = document.getElementById('f-name').value || '—'; document.getElementById('p-phone').textContent = document.getElementById('f-phone').value || '—'; document.getElementById('p-address').textContent = document.getElementById('f-address').value || '—';
  const pItems = document.getElementById('p-items'); pItems.innerHTML = '';
  itemsBody.querySelectorAll('tr').forEach(tr=>{
      const desc = tr.querySelector('.it-desc').value, qty = parseFloat(tr.querySelector('.it-qty').value), price = parseFloat(tr.querySelector('.it-price').value), total = parseFloat(tr.querySelector('.row-total').textContent);
      if(!desc && (!qty || qty==0)) return;
      pItems.innerHTML += `<tr><td>${desc}</td><td style="text-align:center;">${qty}</td><td style="text-align:center;">${price}</td><td style="text-align:center; font-weight:bold;">${total}</td></tr>`;
  });
  document.getElementById('p-subtotal').textContent = document.getElementById('subtotalCell').textContent; document.getElementById('p-paid').textContent = parseFloat((parseFloat(fPaid.value)||0).toFixed(2)); document.getElementById('p-remain').textContent = document.getElementById('remainCell').textContent;
}

document.getElementById('printBtn').addEventListener('click', ()=>{ buildPrintSheet(); printArea('invoice-print'); });

document.getElementById('saveBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('f-name').value.trim(); if(!name){ toast('أدخل اسم العميل'); return; }
  const items = [];
  itemsBody.querySelectorAll('tr').forEach(tr=>{
      const desc = tr.querySelector('.it-desc').value, qty = parseFloat(tr.querySelector('.it-qty').value), price = parseFloat(tr.querySelector('.it-price').value);
      if(desc || (qty && qty!=0)) items.push({desc, qty, price, total: tr.querySelector('.row-total').textContent});
  });

  const invoice = { id: document.getElementById('f-invnum').value, date: document.getElementById('f-date').value, name, phone: document.getElementById('f-phone').value, address: document.getElementById('f-address').value, items, subtotal: document.getElementById('subtotalCell').textContent, paid: fPaid.value, remain: document.getElementById('remainCell').textContent, savedAt: new Date().toISOString() };
  
  appData.invoices.unshift(invoice);
  if(useSupabase) await supabaseClient.from('invoices').upsert(invoice);
  else localStorage.setItem('tl_invoices', JSON.stringify(appData.invoices));
  
  await saveCustomerDB({name: invoice.name, phone: invoice.phone, address: invoice.address});
  
  buildPrintSheet();
  const rawHTML = document.getElementById('invoice-print').innerHTML;
  const wrote = await writeInvoiceFile(`فاتورة - ${name.replace(/[\\/:*?"<>|]/g,'-')} - ${invoice.id}.html`, rawHTML);
  toast(wrote ? 'تم حفظ الفاتورة في الأرشيف المجلد ✅' : 'تم الحفظ كملف HTML ✅'); resetForm();
});

function renderArchive(filter=''){
  const list = document.getElementById('archiveList');
  const filtered = appData.invoices.filter(inv=>{ const q = filter.trim().toLowerCase(); return !q || inv.name.toLowerCase().includes(q) || inv.id.toLowerCase().includes(q) || (inv.date||'').includes(q); });
  if(filtered.length === 0){ list.innerHTML = '<div class="empty-state">لا توجد فواتير محفوظة بعد</div>'; return; }
  list.innerHTML = filtered.map(inv=>`<div class="list-item"><div class="info"><strong>${inv.name} — ${inv.id}</strong><span>${inv.date} · المتبقي: ${parseFloat(Number(inv.remain).toFixed(2))} ج.م</span></div><div class="actions"><button class="btn-accent" onclick="viewInvoice('${inv.id}')">طباعة</button><button class="btn-danger" onclick="deleteInvoice('${inv.id}')">حذف</button></div></div>`).join('');
}
function viewInvoice(id){
  const inv = appData.invoices.find(i=>i.id === id); if(!inv) return;
  document.getElementById('p-invnum').textContent = inv.id; document.getElementById('p-date').textContent = inv.date; document.getElementById('p-name').textContent = inv.name; document.getElementById('p-phone').textContent = inv.phone || '—'; document.getElementById('p-address').textContent = inv.address || '—';
  document.getElementById('p-items').innerHTML = inv.items.map(it=>`<tr><td>${it.desc}</td><td style="text-align:center;">${parseFloat(it.qty)}</td><td style="text-align:center;">${parseFloat(it.price)}</td><td style="text-align:center; font-weight:bold;">${parseFloat(it.total)}</td></tr>`).join('');
  document.getElementById('p-subtotal').textContent = parseFloat(Number(inv.subtotal).toFixed(2)) || '0'; document.getElementById('p-paid').textContent = parseFloat((parseFloat(inv.paid)||0).toFixed(2)); document.getElementById('p-remain').textContent = parseFloat(Number(inv.remain).toFixed(2)) || '0';
  printArea('invoice-print');
}
async function deleteInvoice(id){ 
  if(confirm('حذف الفاتورة نهائياً؟')){ 
      appData.invoices = appData.invoices.filter(i=>i.id !== id);
      if(useSupabase) await supabaseClient.from('invoices').delete().eq('id', id);
      else localStorage.setItem('tl_invoices', JSON.stringify(appData.invoices));
      renderArchive(document.getElementById('archiveSearch').value); 
  } 
}
window.viewInvoice = viewInvoice; window.deleteInvoice = deleteInvoice;
document.getElementById('archiveSearch').addEventListener('input', (e)=>renderArchive(e.target.value));


/* ========================================================
   6. إدارة بوليصات الشحن
======================================================== */
const sAmountInput = document.getElementById('s-amount');
const sAmountWords = document.getElementById('s-amount-words');

function tafqeet(number) {
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"], tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"], teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"], hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  if (number === 0) return "صفر"; if (number < 0) return "سالب " + tafqeet(Math.abs(number));
  function convertGroup(n) { let text = "", h = Math.floor(n / 100), rem = n % 100; if (h > 0) text += hundreds[h]; if (rem > 0) { if (text !== "") text += " و"; if (rem < 10) text += ones[rem]; else if (rem < 20) text += teens[rem - 10]; else { let t = Math.floor(rem / 10), o = rem % 10; if (o > 0) text += ones[o] + " و" + tens[t]; else text += tens[t]; } } return text; }
  let result = "";
  if (number >= 1000) { let th = Math.floor(number / 1000), rem = number % 1000; if (th === 1) result += "ألف"; else if (th === 2) result += "ألفان"; else if (th < 10) result += convertGroup(th) + " آلاف"; else result += convertGroup(th) + " ألف"; if (rem > 0) result += " و" + convertGroup(rem); } 
  else { result = convertGroup(number); }
  return "فقط " + result + " جنيهاً لا غير";
}
function calculateShippingCOD(baseAmount) {
  const net = parseFloat(baseAmount) || 0; let codFee = 0;
  if (net > 0) { if (net <= 1000) codFee = 30; else codFee = 30 + (Math.ceil((net - 1000) / 1000) * 5); } return net + codFee; 
}

sAmountInput.addEventListener('input', () => { const val = parseFloat(sAmountInput.value) || 0; sAmountWords.value = val > 0 ? tafqeet(calculateShippingCOD(val)) + ' (بعد الضريبة)' : ''; });
function resetShippingForm(newNumber=true){ document.getElementById('s-date').value = new Date().toISOString().slice(0,10); document.getElementById('s-name').value = ''; document.getElementById('s-phone').value = ''; document.getElementById('s-address').value = ''; document.getElementById('s-details').value = ''; sAmountInput.value = ''; sAmountWords.value = ''; if(newNumber) document.getElementById('s-invnum').value = getNextShipNum(); }
document.getElementById('clearShippingBtn').addEventListener('click', ()=>{ if(confirm('تفريغ البوليصة؟')) resetShippingForm(); });
document.getElementById('s-name').addEventListener('change', ()=>{ const cust = appData.customers.find(c=>c.name === document.getElementById('s-name').value.trim()); if(cust){ document.getElementById('s-phone').value = cust.phone; document.getElementById('s-address').value = cust.address; } });

function buildShippingPrint(){
  document.getElementById('ps-invnum').textContent = document.getElementById('s-invnum').value; document.getElementById('ps-name').textContent = document.getElementById('s-name').value || '—'; document.getElementById('ps-phone').textContent = document.getElementById('s-phone').value || '—'; document.getElementById('ps-address').textContent = document.getElementById('s-address').value || '—'; document.getElementById('ps-details').textContent = document.getElementById('s-details').value || 'لا يوجد تعليمات خاصة';
  const finalAmt = calculateShippingCOD(parseFloat(sAmountInput.value) || 0); document.getElementById('ps-amount').textContent = parseFloat(finalAmt.toFixed(2)) + ' EGP'; document.getElementById('ps-amount-words').textContent = finalAmt > 0 ? tafqeet(finalAmt) : '';
}
document.getElementById('printShippingBtn').addEventListener('click', ()=>{ buildShippingPrint(); printArea('shipping-print'); });

document.getElementById('saveShippingBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('s-name').value.trim(); if(!name){ toast('أدخل اسم المستلم'); return; }
  const shipObj = { id: document.getElementById('s-invnum').value, date: document.getElementById('s-date').value, name, phone: document.getElementById('s-phone').value, address: document.getElementById('s-address').value, details: document.getElementById('s-details').value, amount: sAmountInput.value, words: sAmountWords.value, savedAt: new Date().toISOString() };
  
  appData.shipping.unshift(shipObj);
  if(useSupabase) await supabaseClient.from('shipping').upsert(shipObj);
  else localStorage.setItem('tl_shipping', JSON.stringify(appData.shipping));
  
  await saveCustomerDB({name: shipObj.name, phone: shipObj.phone, address: shipObj.address});

  buildShippingPrint();
  const rawHTML = document.getElementById('shipping-print').innerHTML;
  const wrote = await writeInvoiceFile(`بوليصة - ${name.replace(/[\\/:*?"<>|]/g,'-')} - ${shipObj.id}.html`, rawHTML);
  toast(wrote ? 'تم حفظ البوليصة في المجلد ✅' : 'تم الحفظ كملف HTML ✅'); resetShippingForm(); renderShippingArchive();
});

function renderShippingArchive(filter=''){
  const list = document.getElementById('shippingList');
  const filtered = appData.shipping.filter(s=>{ const q = filter.trim().toLowerCase(); return !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || (s.phone||'').includes(q); });
  if(filtered.length === 0){ list.innerHTML = '<div class="empty-state">لا توجد شحنات محفوظة بعد</div>'; return; }
  list.innerHTML = filtered.map(s => { const finalAmt = calculateShippingCOD(parseFloat(s.amount) || 0); return `<div class="list-item"><div class="info"><strong>${s.name} — ${s.id}</strong><span>التحصيل: ${parseFloat(finalAmt.toFixed(2))} ج.م</span></div><div class="actions"><button class="btn-accent" onclick="viewShipping('${s.id}')">طباعة Label</button><button class="btn-danger" onclick="deleteShipping('${s.id}')">حذف</button></div></div>`; }).join('');
}
function viewShipping(id){
  const s = appData.shipping.find(i=>i.id === id); if(!s) return;
  document.getElementById('ps-invnum').textContent = s.id; document.getElementById('ps-name').textContent = s.name; document.getElementById('ps-phone').textContent = s.phone || '—'; document.getElementById('ps-address').textContent = s.address || '—'; document.getElementById('ps-details').textContent = s.details || 'لا يوجد تعليمات خاصة';
  const finalAmt = calculateShippingCOD(parseFloat(s.amount) || 0); document.getElementById('ps-amount').textContent = parseFloat(finalAmt.toFixed(2)) + ' EGP'; document.getElementById('ps-amount-words').textContent = finalAmt > 0 ? tafqeet(finalAmt) : ''; printArea('shipping-print');
}
async function deleteShipping(id){ 
  if(confirm('حذف بوليصة الشحن نهائياً؟')){ 
      appData.shipping = appData.shipping.filter(i=>i.id !== id);
      if(useSupabase) await supabaseClient.from('shipping').delete().eq('id', id);
      else localStorage.setItem('tl_shipping', JSON.stringify(appData.shipping));
      renderShippingArchive(document.getElementById('shippingSearch').value); 
  } 
}
window.viewShipping = viewShipping; window.deleteShipping = deleteShipping;
document.getElementById('shippingSearch').addEventListener('input', (e)=>renderShippingArchive(e.target.value));

/* ========================================================
   7. إدارة العملاء
======================================================== */
function renderCustomers(filter=''){
  const list = document.getElementById('customersList');
  const filtered = appData.customers.filter(c=>{ const q = filter.trim().toLowerCase(); return !q || c.name.toLowerCase().includes(q) || (c.phone||'').includes(q); });
  if(filtered.length === 0){ list.innerHTML = '<div class="empty-state">لا يوجد عملاء مسجلون بعد</div>'; return; }
  list.innerHTML = filtered.map(c=>`<div class="list-item"><div class="info"><strong>${c.name}</strong><span>${c.phone || '—'} · ${c.address || '—'}</span></div><div class="actions"><button class="btn-accent" onclick="useCustomer('${c.name.replace(/'/g,"\\'")}')">فاتورة</button><button class="btn-dark" onclick="useCustomerShipping('${c.name.replace(/'/g,"\\'")}')">شحن</button><button class="btn-danger" onclick="deleteCustomer('${c.name.replace(/'/g,"\\'")}')">حذف</button></div></div>`).join('');
}
document.getElementById('addCustomerBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('c-name').value.trim(), phone = document.getElementById('c-phone').value.trim(), address = document.getElementById('c-address').value.trim();
  if(!name){ toast('أدخل اسم العميل'); return; } if(appData.customers.some(c=>c.name === name)){ toast('العميل موجود بالفعل'); return; }
  await saveCustomerDB({name, phone, address});
  document.getElementById('c-name').value = ''; document.getElementById('c-phone').value = ''; document.getElementById('c-address').value = '';
  renderCustomers(); toast('تم الحفظ بنجاح');
});
document.getElementById('customerSearch').addEventListener('input', (e)=>renderCustomers(e.target.value));
function useCustomer(name){ document.querySelector('.tab[data-view="new"]').click(); const cust = appData.customers.find(c=>c.name === name); document.getElementById('f-name').value = cust.name; document.getElementById('f-phone').value = cust.phone; document.getElementById('f-address').value = cust.address; }
function useCustomerShipping(name){ document.querySelector('.tab[data-view="shipping"]').click(); const cust = appData.customers.find(c=>c.name === name); document.getElementById('s-name').value = cust.name; document.getElementById('s-phone').value = cust.phone; document.getElementById('s-address').value = cust.address; }
async function deleteCustomer(name){ 
  if(confirm('حذف العميل؟')){ 
      appData.customers = appData.customers.filter(c=>c.name !== name); 
      if(useSupabase) await supabaseClient.from('customers').delete().eq('name', name);
      else localStorage.setItem('tl_customers', JSON.stringify(appData.customers));
      refreshCustomerDatalist(); renderCustomers(); 
  } 
}
window.useCustomer = useCustomer; window.useCustomerShipping = useCustomerShipping; window.deleteCustomer = deleteCustomer;