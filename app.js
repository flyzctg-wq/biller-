(function(){
"use strict";

const API = 'api.php';
let clients = [];
let currentFilters = { q:'', status:'all', zone:'', due:'all' };
let editingId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- Clock ----------
function updateClock(){
  const now = new Date();
  const opts = { weekday:'long', year:'numeric', month:'short', day:'numeric' };
  $('#clockDate').textContent = now.toLocaleDateString('en-US', opts);
  $('#clockToday').textContent = 'Today: Day ' + now.getDate();
}
updateClock();
setInterval(updateClock, 60000);

// ---------- Toast ----------
let toastTimer;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}

// ---------- API helpers ----------
async function apiGet(action, params){
  const url = new URL(API, window.location.href);
  url.searchParams.set('action', action);
  for(const k in (params||{})) if(params[k] !== undefined && params[k] !== '') url.searchParams.set(k, params[k]);
  const res = await fetch(url);
  return res.json();
}
async function apiPost(action, body){
  const url = new URL(API, window.location.href);
  url.searchParams.set('action', action);
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
  return res.json();
}

// ---------- Stats ----------
async function loadStats(){
  const s = await apiGet('stats');
  if(!s.ok) return;
  $('#statToday').textContent = s.due_today;
  $('#statWeek').textContent = s.due_week;
  $('#statPending').textContent = s.pending;
  $('#statOverdue').textContent = 0; // computed properly below via list call
  apiGet('list', {due:'overdue'}).then(r=>{
    if(r.ok) $('#statOverdue').textContent = r.clients.length;
  });
}

// ---------- Zones ----------
async function loadZones(){
  const z = await apiGet('zones');
  if(!z.ok) return;
  const sel = $('#zoneFilter');
  sel.innerHTML = '<option value="">All Zones | সকল এলাকা</option>' +
    z.zones.map(zn => `<option value="${escapeHtml(zn)}">${escapeHtml(zn)}</option>`).join('');
}

// ---------- List / render ----------
function escapeHtml(s){
  if(s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function dueBadge(daysUntil){
  if(daysUntil === null || daysUntil === undefined) return '';
  if(daysUntil === 0) return `<span class="due-badge today">Today</span>`;
  if(daysUntil <= 7) return `<span class="due-badge soon">${daysUntil}d</span>`;
  return `<span class="due-badge later">${daysUntil}d</span>`;
}

async function loadClients(){
  const r = await apiGet('list', currentFilters);
  if(!r.ok){ toast('Failed to load clients'); return; }
  clients = r.clients;
  renderTable();
}

function renderTable(){
  const body = $('#clientsBody');
  const empty = $('#emptyState');
  if(clients.length === 0){
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = clients.map(c => {
    const statusCls = c.payment_status === 'paid' ? 'paid' : 'pending';
    const statusLbl = c.payment_status === 'paid' ? 'Paid ✓' : 'Pending';
    return `
    <tr data-id="${c.id}">
      <td>
        <div class="client-name">${escapeHtml(c.name)}</div>
        <div class="client-id">${escapeHtml(c.client_id||'')} ${c.zone ? '· '+escapeHtml(c.zone) : ''}</div>
      </td>
      <td class="muted">${escapeHtml(c.mobile||'—')}</td>
      <td class="muted">${escapeHtml(c.package||'—')}${c.speed ? ' · '+escapeHtml(c.speed):''}</td>
      <td class="en">৳${Number(c.m_bill||0).toLocaleString()}</td>
      <td>
        <input type="number" class="ex-edit" min="1" max="31" value="${c.ex_date ?? ''}" data-field="ex_date" data-id="${c.id}">
        <div style="margin-top:3px;">${dueBadge(c.days_until)}</div>
      </td>
      <td>
        <button class="status-pill ${statusCls}" data-id="${c.id}" data-toggle-status="1">${statusLbl}</button>
      </td>
      <td>
        <input type="number" class="bill-edit" step="0.01" value="${c.balance_due ?? ''}" data-field="balance_due" data-id="${c.id}" placeholder="0">
      </td>
      <td class="muted" style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(c.comments||'')}">${escapeHtml(c.comments||'—')}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-sm btn-ghost" data-edit-id="${c.id}">Edit</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ---------- Stat card filters ----------
$$('.stat').forEach(el=>{
  el.addEventListener('click', ()=>{
    $$('.stat').forEach(s=>s.classList.remove('active'));
    el.classList.add('active');
    currentFilters.due = el.dataset.due || 'all';
    currentFilters.status = el.dataset.status || currentFilters.status;
    $('#dueFilter').value = currentFilters.due;
    if(el.dataset.status){ $('#statusFilter').value = el.dataset.status; currentFilters.status = el.dataset.status; }
    loadClients();
  });
});

// ---------- Toolbar filters ----------
let searchDebounce;
$('#searchBox').addEventListener('input', (e)=>{
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(()=>{
    currentFilters.q = e.target.value.trim();
    loadClients();
  }, 250);
});
$('#statusFilter').addEventListener('change', e=>{ currentFilters.status = e.target.value; loadClients(); });
$('#zoneFilter').addEventListener('change', e=>{ currentFilters.zone = e.target.value; loadClients(); });
$('#dueFilter').addEventListener('change', e=>{ currentFilters.due = e.target.value; loadClients(); });

// ---------- Quick edit (inline) ----------
document.addEventListener('click', async (e)=>{
  const toggleBtn = e.target.closest('[data-toggle-status]');
  if(toggleBtn){
    const id = toggleBtn.dataset.id;
    const c = clients.find(x=>String(x.id)===String(id));
    if(!c) return;
    const newStatus = c.payment_status === 'paid' ? 'pending' : 'paid';
    const payload = { id, payment_status: newStatus };
    if(newStatus === 'paid'){
      payload.payment_date = new Date().toISOString().slice(0,10);
      payload.balance_due = 0;
    }
    const r = await apiPost('update', payload);
    if(r.ok){
      c.payment_status = newStatus;
      if(newStatus==='paid') c.balance_due = 0;
      renderTable();
      loadStats();
      toast(newStatus === 'paid' ? 'Marked as Paid ✓' : 'Marked as Pending');
    } else toast('Update failed');
    return;
  }
  const editBtn = e.target.closest('[data-edit-id]');
  if(editBtn){
    openClientModal(editBtn.dataset.editId);
    return;
  }
});

document.addEventListener('change', async (e)=>{
  const field = e.target.dataset && e.target.dataset.field;
  if(field && e.target.dataset.id){
    const id = e.target.dataset.id;
    const val = e.target.value === '' ? null : (field==='ex_date' ? parseInt(e.target.value,10) : parseFloat(e.target.value));
    const r = await apiPost('update', { id, [field]: val });
    if(r.ok){
      const c = clients.find(x=>String(x.id)===String(id));
      if(c) c[field] = val;
      toast('Saved');
      loadStats();
    } else toast('Update failed');
  }
});

// ---------- Add/Edit modal ----------
const modalBackdrop = $('#clientModalBackdrop');
const fields = ['client_id','c_code','name','mobile','email','zone','subzone','address','package','speed','m_bill','ex_date','payment_status','balance_due','client_type','connection_type','comments'];

function openClientModal(id){
  editingId = id || null;
  $('#clientModalTitle').textContent = id ? 'Edit Client' : 'Add Client';
  $('#clientDeleteBtn').style.display = id ? 'inline-block' : 'none';
  const c = id ? clients.find(x=>String(x.id)===String(id)) : {};
  fields.forEach(f=>{
    const el = $('#f_'+f);
    if(el) el.value = (c && c[f] !== undefined && c[f] !== null) ? c[f] : '';
  });
  modalBackdrop.classList.add('open');
}
function closeClientModal(){
  modalBackdrop.classList.remove('open');
  editingId = null;
}
$('#btnAdd').addEventListener('click', ()=>openClientModal(null));
$('#clientModalClose').addEventListener('click', closeClientModal);
$('#clientCancelBtn').addEventListener('click', closeClientModal);
modalBackdrop.addEventListener('click', (e)=>{ if(e.target === modalBackdrop) closeClientModal(); });

$('#clientSaveBtn').addEventListener('click', async ()=>{
  const data = {};
  fields.forEach(f=>{
    const el = $('#f_'+f);
    if(!el) return;
    let v = el.value;
    if(f === 'm_bill' || f === 'balance_due'){ v = v === '' ? null : parseFloat(v); }
    if(f === 'ex_date'){ v = v === '' ? null : parseInt(v,10); }
    data[f] = v === '' ? null : v;
  });
  if(!data.name || !data.name.trim()){ toast('Name is required | নাম আবশ্যক'); return; }

  let r;
  if(editingId){ data.id = editingId; r = await apiPost('update', data); }
  else { r = await apiPost('create', data); }

  if(r.ok){
    toast('Saved');
    closeClientModal();
    loadClients();
    loadStats();
    loadZones();
  } else toast(r.error || 'Save failed');
});

$('#clientDeleteBtn').addEventListener('click', async ()=>{
  if(!editingId) return;
  if(!confirm('Delete this client? This cannot be undone.')) return;
  const r = await apiPost('delete', { id: editingId });
  if(r.ok){
    toast('Client deleted');
    closeClientModal();
    loadClients();
    loadStats();
  } else toast('Delete failed');
});

// ---------- CSV Import ----------
const importBackdrop = $('#importModalBackdrop');
const importBody = $('#importBody');
const importNextBtn = $('#importNextBtn');
let importState = { step:1, headers:[], rows:[], mapping:{} };

const SCHEMA_FIELDS = [
  {key:'client_id', label:'Client ID / IP (unique)', required:true},
  {key:'name', label:'Client Name', required:true},
  {key:'mobile', label:'Mobile'},
  {key:'email', label:'Email'},
  {key:'c_code', label:'Client Code'},
  {key:'zone', label:'Zone'},
  {key:'subzone', label:'Sub Zone'},
  {key:'address', label:'Address'},
  {key:'package', label:'Package'},
  {key:'speed', label:'Speed'},
  {key:'m_bill', label:'Monthly Bill'},
  {key:'ex_date', label:'Commitment Day (1-31)'},
  {key:'balance_due', label:'Balance Due'},
  {key:'advance_payment', label:'Advance Payment'},
  {key:'client_type', label:'Client Type'},
  {key:'connection_type', label:'Connection Type'},
  {key:'b_status', label:'Status (Active/Inactive)'},
  {key:'comments', label:'Comments'},
  {key:'thana', label:'Thana'},
  {key:'district', label:'District'},
  {key:'', label:'— Do not import —'},
];

function guessMapping(header){
  const h = header.toLowerCase().replace(/[^a-z0-9]/g,'');
  const table = {
    'idip':'client_id','id':'client_id','clientid':'client_id',
    'clientname':'name','name':'name',
    'mobile':'mobile','phone':'mobile',
    'email':'email',
    'ccode':'c_code','code':'c_code',
    'zone':'zone','subzone':'subzone',
    'address':'address',
    'package':'package','speed':'speed',
    'mbill':'m_bill','bill':'m_bill','monthlybill':'m_bill',
    'exdate':'ex_date','commitmentdate':'ex_date','duedate':'ex_date','commitmentday':'ex_date',
    'balancedue':'balance_due','balance':'balance_due',
    'advancepayemnt':'advance_payment','advancepayment':'advance_payment',
    'clienttype':'client_type','connectiontype':'connection_type',
    'bstatus':'b_status','status':'b_status',
    'comments':'comments','notes':'comments',
    'thana':'thana','district':'district',
  };
  return table[h] || '';
}

function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i], n = text[i+1];
    if(inQuotes){
      if(c === '"' && n === '"'){ field += '"'; i++; }
      else if(c === '"'){ inQuotes = false; }
      else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\r'){ /* skip */ }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length===1 && r[0].trim()!==''));
}

function resetImport(){
  importState = { step:1, headers:[], rows:[], mapping:{} };
  renderImportStep();
}

function renderImportStep(){
  if(importState.step === 1){
    importBody.innerHTML = `
      <div class="step-tag">Step 1 of 3 — Choose file</div>
      <div class="import-drop" id="importDrop">
        <input type="file" id="importFile" accept=".csv,.xlsx,.xls" style="display:none;">
        <div>Click to choose a CSV or Excel file, or drag it here.</div>
        <div class="bn" style="margin-top:4px;font-size:12.5px;">CSV বা Excel ফাইল আপলোড করুন</div>
      </div>`;
    importNextBtn.style.display = 'none';
    const drop = $('#importDrop');
    const fileInput = $('#importFile');
    drop.addEventListener('click', ()=>fileInput.click());
    drop.addEventListener('dragover', e=>{e.preventDefault(); drop.classList.add('drag');});
    drop.addEventListener('dragleave', ()=>drop.classList.remove('drag'));
    drop.addEventListener('drop', e=>{
      e.preventDefault(); drop.classList.remove('drag');
      if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });
  }
  else if(importState.step === 2){
    const rowsHtml = importState.headers.map((h,i)=>{
      const guessed = guessMapping(h);
      const opts = SCHEMA_FIELDS.map(f=>`<option value="${f.key}" ${f.key===guessed?'selected':''}>${f.label}</option>`).join('');
      importState.mapping[i] = guessed;
      return `<div class="mapping-row">
        <div class="col-name">${escapeHtml(h)}</div>
        <select data-col="${i}">${opts}</select>
      </div>`;
    }).join('');

    const previewRows = importState.rows.slice(0,3);
    const previewHtml = `
      <table class="preview-table">
        <thead><tr>${importState.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${previewRows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;

    importBody.innerHTML = `
      <div class="step-tag">Step 2 of 3 — Map columns</div>
      <p class="muted" style="margin-top:0;font-size:13px;">Match each CSV column to a field. We guessed based on your headers — adjust anything that's wrong.</p>
      ${rowsHtml}
      <p class="muted" style="font-size:12.5px;margin-top:14px;">Preview (first 3 rows):</p>
      ${previewHtml}`;

    importBody.querySelectorAll('select[data-col]').forEach(sel=>{
      sel.addEventListener('change', e=>{ importState.mapping[e.target.dataset.col] = e.target.value; });
    });
    importNextBtn.textContent = 'Next →';
    importNextBtn.style.display = 'inline-block';
  }
  else if(importState.step === 3){
    const mappedFields = Object.values(importState.mapping).filter(Boolean);
    const hasId = mappedFields.includes('client_id');
    const hasName = mappedFields.includes('name');
    importBody.innerHTML = `
      <div class="step-tag">Step 3 of 3 — Confirm import</div>
      <div class="import-summary">
        Ready to import <b>${importState.rows.length}</b> rows.<br>
        Existing clients (matched by Client ID) will be <b>updated</b>; new Client IDs will be <b>added</b>.<br>
        Payment status and edited due dates for existing clients are preserved — only account details are updated.
      </div>
      ${(!hasId || !hasName) ? `<p style="color:var(--red);margin-top:12px;font-size:13.5px;">⚠ You must map both "Client ID / IP" and "Client Name" to continue.</p>` : ''}
    `;
    importNextBtn.textContent = 'Import Now';
    importNextBtn.style.display = (hasId && hasName) ? 'inline-block' : 'none';
  }
}

function loadRowsIntoImport(rows){
  if(rows.length < 2){ toast('File appears empty'); return; }
  importState.headers = rows[0].map(h=>String(h).trim());
  importState.rows = rows.slice(1)
    .map(r => r.map(c => c === null || c === undefined ? '' : String(c)))
    .filter(r => r.some(c=>c.trim()!==''));
  importState.step = 2;
  renderImportStep();
}

function handleFile(file){
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

  if(isExcel){
    if(typeof XLSX === 'undefined'){ toast('Excel support failed to load — try a CSV file instead'); return; }
    const reader = new FileReader();
    reader.onload = (e)=>{
      try{
        const wb = XLSX.read(e.target.result, { type:'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // raw:false renders numbers/dates as display strings, matching what a CSV export would contain
        const rows = XLSX.utils.sheet_to_json(sheet, { header:1, raw:false, defval:'' });
        loadRowsIntoImport(rows);
      } catch(err){
        toast('Could not read Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = (e)=>{
      const rows = parseCSV(e.target.result);
      loadRowsIntoImport(rows);
    };
    reader.readAsText(file);
  }
}

$('#btnImport').addEventListener('click', ()=>{
  resetImport();
  importBackdrop.classList.add('open');
});
$('#importModalClose').addEventListener('click', ()=>importBackdrop.classList.remove('open'));
$('#importCancelBtn').addEventListener('click', ()=>importBackdrop.classList.remove('open'));
importBackdrop.addEventListener('click', (e)=>{ if(e.target === importBackdrop) importBackdrop.classList.remove('open'); });

importNextBtn.addEventListener('click', async ()=>{
  if(importState.step === 2){
    importState.step = 3;
    renderImportStep();
  } else if(importState.step === 3){
    const colIndexByField = {};
    Object.entries(importState.mapping).forEach(([col,field])=>{ if(field) colIndexByField[field] = parseInt(col,10); });
    const payloadRows = importState.rows.map(r=>{
      const obj = {};
      Object.entries(colIndexByField).forEach(([field,idx])=>{ obj[field] = (r[idx]||'').trim(); });
      return obj;
    });
    importNextBtn.disabled = true;
    importNextBtn.textContent = 'Importing…';
    const r = await apiPost('import', { rows: payloadRows });
    importNextBtn.disabled = false;
    if(r.ok){
      toast(`Imported: ${r.inserted} added, ${r.updated} updated, ${r.skipped} skipped`);
      importBackdrop.classList.remove('open');
      loadClients(); loadStats(); loadZones();
    } else {
      toast(r.error || 'Import failed');
      importNextBtn.textContent = 'Import Now';
    }
  }
});

// ---------- Init ----------
(async function init(){
  await Promise.all([loadZones(), loadStats()]);
  await loadClients();
})();

})();
