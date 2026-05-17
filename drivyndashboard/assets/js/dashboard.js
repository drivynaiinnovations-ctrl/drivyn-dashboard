/* ─── DRIVYN AI OPERATIONS DASHBOARD JS ─── */

// ─── STATE ───
let state = {
  clients: [],
  invoices: [],
  reports: [],
  activity: [],
  wins: [],
  comms: [],
  referrals: [],
  currentView: 'home',
  currentClientId: null,
  editingClientId: null,
  editingInvoiceId: null,
};

// ─── STORAGE ───
function loadState() {
  try {
    const saved = localStorage.getItem('drivyn-v2');
    if (saved) Object.assign(state, JSON.parse(saved));
  } catch(e) { console.warn('State load failed', e); }
}

function saveState() {
  try {
    localStorage.setItem('drivyn-v2', JSON.stringify({
      clients: state.clients,
      invoices: state.invoices,
      reports: state.reports,
      activity: state.activity,
      wins: state.wins,
      comms: state.comms,
      referrals: state.referrals,
    }));
  } catch(e) { console.warn('State save failed', e); }
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function now() { return new Date().toISOString(); }
function fmtDate(iso) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
function fmtMoney(n) { return '$' + (parseFloat(n)||0).toLocaleString(); }
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
}

// ─── PILOT DAYS ───
function pilotDaysLeft(c) {
  if (!c.pilotDate) return null;
  const start = new Date(c.pilotDate);
  const end = new Date(start.getTime() + 30 * 86400000);
  const diff = Math.ceil((end - new Date()) / 86400000);
  return diff;
}

// ─── HEALTH SCORE ───
function calcHealth(c) {
  let score = 100;
  if (c.status === 'Churned') return 0;
  if (c.status === 'Paused') return 20;
  // Invoice status
  const clientInvoices = state.invoices.filter(i => i.clientId === c.id);
  const overdue = clientInvoices.filter(i => i.status === 'Overdue');
  if (overdue.length > 0) score -= 30;
  const unpaid = clientInvoices.filter(i => i.status === 'Unpaid');
  if (unpaid.length > 1) score -= 10;
  // Onboarding stage
  const stages = ['kickoff','build','approval','live','optimized'];
  const stageIdx = stages.indexOf(c.onboardingStage || 'kickoff');
  if (stageIdx < 2) score -= 15;
  // Recent report
  const clientReports = state.reports.filter(r => r.clientId === c.id);
  if (clientReports.length === 0) score -= 20;
  else {
    const lastReport = new Date(clientReports[clientReports.length - 1].date);
    const daysSince = (new Date() - lastReport) / 86400000;
    if (daysSince > 45) score -= 20;
    else if (daysSince > 30) score -= 10;
  }
  // Wedges active
  const wedgeCount = [c.w1, c.w2, c.w3].filter(Boolean).length;
  if (wedgeCount === 0) score -= 15;
  // API creds
  const missingCreds = checkMissingCreds(c);
  if (missingCreds > 0) score -= missingCreds * 5;
  return Math.max(0, Math.min(100, score));
}

function healthClass(score) {
  if (score >= 70) return 'health-fill-high';
  if (score >= 40) return 'health-fill-mid';
  return 'health-fill-low';
}

function healthBadge(score) {
  if (score >= 70) return '<span class="badge badge-healthy">Healthy</span>';
  if (score >= 40) return '<span class="badge badge-warning">At Risk</span>';
  return '<span class="badge badge-risk">Critical</span>';
}

function checkMissingCreds(c) {
  let missing = 0;
  if (c.w1) {
    const creds = c.creds?.w1 || {};
    if (!creds.vapi_key) missing++;
    if (!creds.ghl_key) missing++;
    if (!creds.make_webhook) missing++;
  }
  if (c.w2) {
    const creds = c.creds?.w2 || {};
    if (!creds.twilio_sid) missing++;
    if (!creds.make_webhook) missing++;
  }
  if (c.w3) {
    const creds = c.creds?.w3 || {};
    if (!creds.make_webhook) missing++;
    if (!creds.nicejob_key) missing++;
  }
  return missing;
}

// ─── CHURN RISK ───
function isChurnRisk(c) {
  if (c.status === 'Churned' || c.status === 'Paused') return false;
  const overdue = state.invoices.filter(i => i.clientId === c.id && i.status === 'Overdue');
  if (overdue.length > 0) return true;
  const reports = state.reports.filter(r => r.clientId === c.id);
  if (reports.length > 0) {
    const last = new Date(reports[reports.length-1].date);
    if ((new Date() - last) / 86400000 > 45) return true;
  }
  if (calcHealth(c) < 40) return true;
  const days = pilotDaysLeft(c);
  if (days !== null && days < 0) return true;
  return false;
}

// ─── BADGES ───
function statusBadge(s) {
  const map = { Active:'badge-active', Pilot:'badge-pilot', Paused:'badge-paused', Churned:'badge-churned' };
  return `<span class="badge ${map[s]||''}"><span class="badge-dot"></span>${s}</span>`;
}
function payBadge(s) {
  const map = { Paid:'badge-paid', Unpaid:'badge-unpaid', Overdue:'badge-overdue' };
  return `<span class="badge ${map[s]||''}"><span class="badge-dot"></span>${s}</span>`;
}
function wedgeBadges(c) {
  let b = '';
  if (c.w1) b += '<span class="badge badge-w1">W1</span> ';
  if (c.w2) b += '<span class="badge badge-w2">W2</span> ';
  if (c.w3) b += '<span class="badge badge-w3">W3</span>';
  return b.trim() || '<span class="text-muted text-small">None</span>';
}
function pilotCountdown(c) {
  if (c.status !== 'Pilot') return '';
  const days = pilotDaysLeft(c);
  if (days === null) return '';
  let cls = days > 14 ? 'countdown-ok' : days > 7 ? 'countdown-warn' : 'countdown-urgent';
  return `<span class="pilot-countdown ${cls}"><span class="pilot-countdown-days">${days < 0 ? 'Expired' : days + 'd'}</span> ${days >= 0 ? 'left' : ''}</span>`;
}

// ─── NAV ───
function showView(id, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const view = document.getElementById('view-' + id);
  if (view) view.classList.add('active');
  if (btn) btn.classList.add('active');
  state.currentView = id;
  const titles = { home:'Dashboard', clients:'Clients', billing:'Billing & Invoices', reports:'Reports', connections:'API Connections', detail:'Client Detail' };
  document.getElementById('topbar-title').textContent = titles[id] || 'Dashboard';
  renderAll();
}

// ─── RENDER ALL ───
function renderAll() {
  renderSidebarMRR();
  renderNavBadges();
  renderHome();
  renderClientsTable();
  renderBillingView();
  renderConnectionBoard();
  renderReportClientSelect();
  renderReportHistory();
  if (state.currentClientId) renderClientDetail(state.currentClientId);
}

// ─── SIDEBAR MRR ───
function renderSidebarMRR() {
  const active = state.clients.filter(c => c.status === 'Active' || c.status === 'Pilot');
  const mrr = active.reduce((s,c) => s + (parseFloat(c.monthly)||0), 0);
  document.getElementById('sidebar-mrr').textContent = fmtMoney(mrr);
  document.getElementById('sidebar-clients').textContent = active.length + ' active client' + (active.length !== 1 ? 's' : '');
}

function renderNavBadges() {
  const overdue = state.invoices.filter(i => i.status === 'Overdue').length;
  const risk = state.clients.filter(c => isChurnRisk(c)).length;
  document.getElementById('nav-badge-billing').textContent = overdue || '';
  document.getElementById('nav-badge-billing').style.display = overdue ? 'inline' : 'none';
  document.getElementById('nav-badge-clients').textContent = risk || '';
  document.getElementById('nav-badge-clients').style.display = risk ? 'inline' : 'none';
}

// ─── HOME ───
function renderHome() {
  const active = state.clients.filter(c => c.status === 'Active');
  const pilots = state.clients.filter(c => c.status === 'Pilot');
  const mrr = [...active, ...pilots].reduce((s,c) => s + (parseFloat(c.monthly)||0), 0);
  const overdue = state.invoices.filter(i => i.status === 'Overdue');
  const overdueAmt = overdue.reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
  const now2 = new Date();
  const week = new Date(now2.getTime() + 7*86400000);
  const expiring = pilots.filter(c => { const d = pilotDaysLeft(c); return d !== null && d >= 0 && d <= 7; });
  const risks = state.clients.filter(c => isChurnRisk(c));
  const totalRecovered = state.reports.reduce((s,r) => {
    return s + (parseFloat(r.data?.w1?.revenue)||0) + (parseFloat(r.data?.w2?.revenue)||0) + (parseFloat(r.data?.w3?.revenue)||0);
  }, 0);

  setHTML('stat-mrr', fmtMoney(mrr));
  setHTML('stat-mrr-sub', active.length + ' active · ' + pilots.length + ' pilot');
  setHTML('stat-active', active.length + pilots.length);
  setHTML('stat-overdue', overdue.length);
  setHTML('stat-overdue-sub', overdue.length ? fmtMoney(overdueAmt) + ' outstanding' : 'All clear');
  setHTML('stat-expiring', expiring.length);
  setHTML('stat-recovered', fmtMoney(totalRecovered));

  // Alerts
  let alerts = '';
  if (risks.length) alerts += `<div class="alert-card alert-red"><div class="alert-icon">⚠️</div><div class="alert-content"><h4>${risks.length} churn risk${risks.length>1?'s':''}</h4><p>${risks.map(c=>c.name).join(', ')} — needs attention now.</p></div></div>`;
  if (expiring.length) alerts += `<div class="alert-card alert-amber"><div class="alert-icon">⏱️</div><div class="alert-content"><h4>Pilot${expiring.length>1?'s':''} expiring soon</h4><p>${expiring.map(c=>c.name+' ('+pilotDaysLeft(c)+'d)').join(', ')} — prepare conversion call.</p></div></div>`;
  if (overdue.length) alerts += `<div class="alert-card alert-red"><div class="alert-icon">💳</div><div class="alert-content"><h4>${overdue.length} overdue invoice${overdue.length>1?'s':''}</h4><p>${fmtMoney(overdueAmt)} outstanding. <a onclick="showView('billing',document.querySelector('[data-view=billing]'))">View invoices →</a></p></div></div>`;
  const noReport = state.clients.filter(c => {
    if (c.status==='Churned'||c.status==='Paused') return false;
    const r = state.reports.filter(x=>x.clientId===c.id);
    if (!r.length) return true;
    return (new Date()-new Date(r[r.length-1].date))/86400000 > 30;
  });
  if (noReport.length) alerts += `<div class="alert-card alert-blue"><div class="alert-icon">📊</div><div class="alert-content"><h4>Reports overdue</h4><p>${noReport.map(c=>c.name).join(', ')} — no report in 30+ days.</p></div></div>`;
  if (!alerts) alerts = `<div class="alert-card alert-green"><div class="alert-icon">✅</div><div class="alert-content"><h4>All clear</h4><p>No urgent actions needed. Keep building.</p></div></div>`;
  setHTML('home-alerts', alerts);

  // Recent clients table
  if (!state.clients.length) {
    setHTML('home-clients', emptyState('🏢','No clients yet','Add your first client to start tracking everything.'));
    return;
  }
  const rows = state.clients.slice(-8).reverse().map(clientTableRow).join('');
  setHTML('home-clients', `<table><thead><tr><th>Company</th><th>Market</th><th>Wedges</th><th>Status</th><th>Pilot</th><th>Health</th><th>MRR</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function clientTableRow(c) {
  const score = calcHealth(c);
  return `<tr>
    <td><div class="td-primary">${c.name}</div><div class="td-secondary">${c.owner||''}</div></td>
    <td><span class="text-small">${c.market||'—'}</span></td>
    <td>${wedgeBadges(c)}</td>
    <td>${statusBadge(c.status)}</td>
    <td>${pilotCountdown(c)}</td>
    <td><div class="health-score"><div class="health-bar"><div class="health-bar-fill ${healthClass(score)}" style="width:${score}%"></div></div><span class="health-num">${score}</span></div></td>
    <td><span class="td-mono">${fmtMoney(c.monthly)}/mo</span></td>
    <td><div class="td-actions">
      <button class="btn btn-ghost btn-xs" onclick="openClientDetail('${c.id}')">View</button>
      <button class="btn btn-ghost btn-xs" onclick="openEditClient('${c.id}')">Edit</button>
    </div></td>
  </tr>`;
}

// ─── CLIENTS TABLE ───
function renderClientsTable() {
  const el = document.getElementById('clients-table-body');
  if (!el) return;
  if (!state.clients.length) { setHTML('clients-table-wrap', emptyState('🏢','No clients yet','Add your first client to get started.')); return; }
  const rows = state.clients.map(clientTableRow).join('');
  el.innerHTML = rows;
  // Stats
  setHTML('c-stat-total', state.clients.length);
  setHTML('c-stat-active', state.clients.filter(c=>c.status==='Active').length);
  setHTML('c-stat-pilot', state.clients.filter(c=>c.status==='Pilot').length);
  setHTML('c-stat-risk', state.clients.filter(c=>isChurnRisk(c)).length);
}

// ─── CLIENT DETAIL ───
function openClientDetail(id) {
  state.currentClientId = id;
  showView('detail', null);
  document.querySelector('.nav-item[data-view="clients"]').classList.add('active');
  renderClientDetail(id);
}

function renderClientDetail(id) {
  const c = state.clients.find(cl=>cl.id===id);
  if (!c) return;
  const el = document.getElementById('view-detail');
  if (!el) return;
  const score = calcHealth(c);
  const days = pilotDaysLeft(c);
  const clientInvoices = state.invoices.filter(i=>i.clientId===id);
  const clientReports = state.reports.filter(r=>r.clientId===id);
  const clientActivity = (state.activity||[]).filter(a=>a.clientId===id).slice(-20).reverse();
  const clientWins = (state.wins||[]).filter(w=>w.clientId===id);
  const clientComms = (state.comms||[]).filter(cm=>cm.clientId===id).slice(-10).reverse();
  const totalRecovered = clientReports.reduce((s,r) => s+(parseFloat(r.data?.w1?.revenue)||0)+(parseFloat(r.data?.w2?.revenue)||0)+(parseFloat(r.data?.w3?.revenue)||0),0);
  const stages = ['kickoff','build','approval','live','optimized'];
  const stageLabels = ['Kickoff','Build','Approval','Live','Optimized'];
  const stageIdx = stages.indexOf(c.onboardingStage||'kickoff');

  el.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <button class="btn btn-ghost btn-sm" onclick="showView('clients',document.querySelector('[data-view=clients]'))">← Back</button>
        <h2>${c.name}</h2>
        ${statusBadge(c.status)}
        ${isChurnRisk(c)?'<span class="badge badge-risk">⚠ Churn Risk</span>':''}
      </div>
      <p>${c.market||''} · ${c.email||''} · ${c.phone||''}</p>
    </div>
    <div class="page-header-right">
      <button class="btn btn-ghost btn-sm" onclick="openEditClient('${c.id}')">Edit Client</button>
      <button class="btn btn-primary btn-sm" onclick="openReportForClient('${c.id}')">Send Report</button>
    </div>
  </div>

  <div class="detail-grid">
    <div class="detail-main">

      <!-- ONBOARDING -->
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-header-left">
            <div class="card-title">Onboarding Progress</div>
            <div class="card-subtitle">${stageLabels[stageIdx]} — Stage ${stageIdx+1} of 5</div>
          </div>
          ${stageIdx < 4 ? `<button class="btn btn-primary btn-sm" onclick="advanceStage('${c.id}')">Advance Stage →</button>` : '<span class="badge badge-active">Complete ✓</span>'}
        </div>
        <div class="card-body">
          <div class="onboarding-progress">
            ${stages.map((s,i) => `
              <div class="onboarding-step">
                <div class="onboarding-dot ${i<=stageIdx?'done':''} ${i===stageIdx?'current':''}" title="${stageLabels[i]}">${i<stageIdx?'✓':(i+1)}</div>
                ${i<stages.length-1?`<div class="onboarding-line ${i<stageIdx?'done':''}"></div>`:''}
              </div>`).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px">
            ${stageLabels.map(l=>`<span style="font-size:0.65rem;color:var(--muted);text-align:center;width:22px">${l.slice(0,3)}</span>`).join('<span style="width:20px"></span>')}
          </div>
        </div>
      </div>

      <!-- WEDGE SERVICES -->
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">Active Wedges & API Credentials</div>
          <button class="btn btn-ghost btn-sm" onclick="openEditClient('${c.id}')">Manage</button>
        </div>
        <div class="card-body" style="padding:12px">
          ${renderWedgeCredsSummary(c)}
        </div>
      </div>

      <!-- RECENT REPORTS -->
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">Reports (${clientReports.length})</div>
          <button class="btn btn-primary btn-sm" onclick="openReportForClient('${c.id}')">+ Send Report</button>
        </div>
        ${clientReports.length ? `<table><thead><tr><th>Date</th><th>W1 Revenue</th><th>W2 Bookings</th><th>W3 Reviews</th><th></th></tr></thead><tbody>${clientReports.slice().reverse().map(r=>`<tr>
          <td class="td-mono">${fmtDate(r.date)}</td>
          <td>${r.data?.w1?.revenue?fmtMoney(r.data.w1.revenue):'—'}</td>
          <td>${r.data?.w2?.booked||'—'}</td>
          <td>${r.data?.w3?.collected||'—'}</td>
          <td><button class="btn btn-ghost btn-xs" onclick="viewReport('${r.id}')">View</button></td>
        </tr>`).join('')}</tbody></table>` : emptyState('📊','No reports yet','Send the first monthly report.')}
      </div>

      <!-- INVOICES -->
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">Invoices (${clientInvoices.length})</div>
          <button class="btn btn-ghost btn-sm" onclick="openAddInvoiceForClient('${c.id}')">+ Add Invoice</button>
        </div>
        ${clientInvoices.length ? `<table><thead><tr><th>Type</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${clientInvoices.slice().reverse().map(inv=>`<tr>
          <td>${inv.type}</td>
          <td class="td-mono">${fmtMoney(inv.amount)}</td>
          <td class="td-mono">${fmtDate(inv.due)}</td>
          <td>${payBadge(inv.status)}</td>
          <td><div class="td-actions">
            ${inv.status!=='Paid'?`<button class="btn btn-success btn-xs" onclick="markPaid('${inv.id}')">Paid</button>`:''}
            ${inv.status!=='Paid'?`<button class="btn btn-amber btn-xs" onclick="sendInvoiceReminder('${inv.id}')">Remind</button>`:''}
          </div></td>
        </tr>`).join('')}</tbody></table>` : emptyState('💳','No invoices','Add the first invoice.')}
      </div>

      <!-- COMMUNICATION LOG -->
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">Communication Log</div>
          <button class="btn btn-ghost btn-sm" onclick="openAddComm('${c.id}')">+ Log Note</button>
        </div>
        <div class="card-body">
          ${clientComms.length ? clientComms.map(cm=>`<div class="activity-item"><div class="activity-dot" style="background:var(--accent)"></div><div class="activity-content"><div class="activity-text">${cm.note}</div><div class="activity-time">${fmtTime(cm.date)} · ${cm.type}</div></div></div>`).join('') : '<div class="text-muted text-small">No communications logged yet.</div>'}
        </div>
      </div>

    </div>

    <!-- RIGHT PANEL -->
    <div class="detail-sidebar">

      <!-- HEALTH -->
      <div class="card mb-16">
        <div class="card-header"><div class="card-title">Health Score</div>${healthBadge(score)}</div>
        <div class="card-body" style="text-align:center;padding:24px">
          <div style="font-size:3rem;font-weight:800;letter-spacing:-2px;color:${score>=70?'var(--green)':score>=40?'var(--amber)':'var(--red)'}">${score}</div>
          <div class="health-bar" style="margin:12px 0;height:8px"><div class="health-bar-fill ${healthClass(score)}" style="width:${score}%"></div></div>
          <div class="text-small text-muted">Updates automatically based on invoices, reports, onboarding, and API status</div>
        </div>
      </div>

      <!-- PILOT COUNTDOWN -->
      ${c.status==='Pilot'?`<div class="card mb-16 ${days!==null&&days<=7?'stat-card-red':days!==null&&days<=14?'stat-card-amber':'stat-card-accent'}">
        <div class="card-body" style="text-align:center;padding:20px">
          <div class="stat-label">Pilot Days Remaining</div>
          <div style="font-size:2.5rem;font-weight:800;letter-spacing:-1px;color:${days!==null&&days<=7?'var(--red)':days!==null&&days<=14?'var(--amber)':'var(--accent)'}">${days===null?'—':days<0?'Expired':days}</div>
          <div class="text-small text-muted" style="margin-top:6px">${c.pilotDate?'Started '+fmtDate(c.pilotDate):''}</div>
          ${days!==null&&days<=14?`<div style="margin-top:12px"><button class="btn btn-primary btn-sm w-full" onclick="prepConversionCall('${c.id}')">Prepare Conversion Call</button></div>`:''}
        </div>
      </div>`:''}

      <!-- REVENUE RECOVERED -->
      <div class="card mb-16">
        <div class="card-header"><div class="card-title">Revenue Recovered</div></div>
        <div class="revenue-total">
          <div class="revenue-total-num">${fmtMoney(totalRecovered)}</div>
          <div class="revenue-total-label">Total across all reports</div>
        </div>
      </div>

      <!-- QUICK WINS -->
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">Quick Wins</div>
          <button class="btn btn-ghost btn-xs" onclick="openAddWin('${c.id}')">+ Add</button>
        </div>
        <div class="card-body">
          ${clientWins.length ? clientWins.slice().reverse().map(w=>`<div class="win-item"><div class="win-icon">⭐</div><div><div class="win-text">${w.text}</div><div class="win-date">${fmtDate(w.date)}</div></div></div>`).join('') : '<div class="text-muted text-small">No wins recorded yet.</div>'}
        </div>
      </div>

      <!-- CLIENT INFO -->
      <div class="card mb-16">
        <div class="card-header"><div class="card-title">Client Info</div></div>
        <div class="card-body">
          ${[
            ['Email', c.email||'—'],
            ['Phone', c.phone||'—'],
            ['Website', c.website||'—'],
            ['Monthly Fee', fmtMoney(c.monthly)],
            ['Setup Fee', fmtMoney(c.setup)],
            ['Added', fmtDate(c.created)],
          ].map(([l,v])=>`<div class="detail-info-row"><div class="detail-info-label">${l}</div><div class="detail-info-val">${v}</div></div>`).join('')}
          ${c.notes?`<div style="margin-top:12px;padding:10px;background:var(--surface2);border-radius:var(--radius-sm);font-size:0.82rem;color:var(--muted)">${c.notes}</div>`:''}
        </div>
      </div>

      <!-- ACTIVITY LOG -->
      <div class="card">
        <div class="card-header"><div class="card-title">Activity Log</div></div>
        <div class="card-body">
          ${clientActivity.length ? clientActivity.map(a=>`<div class="activity-item"><div class="activity-dot" style="background:${a.color||'var(--muted)'}"></div><div class="activity-content"><div class="activity-text">${a.text}</div><div class="activity-time">${fmtTime(a.date)}</div></div></div>`).join('') : '<div class="text-muted text-small">No activity yet.</div>'}
        </div>
      </div>

    </div>
  </div>`;
}

function renderWedgeCredsSummary(c) {
  const wedges = [
    { key:'w1', label:'⚡ Wedge 1 — Missed Lead Recovery', active:c.w1, color:'var(--accent)',
      tools:[
        { name:'VAPI', fields:['vapi_key','vapi_phone_id','vapi_assistant_id'] },
        { name:'GoHighLevel', fields:['ghl_key','ghl_location_id','ghl_subaccount_id'] },
        { name:'Make.com', fields:['make_webhook'] },
        { name:'Calendly / Cal.com', fields:['cal_key','cal_url'] },
      ]},
    { key:'w2', label:'🔄 Wedge 2 — Dead Database', active:c.w2, color:'var(--purple)',
      tools:[
        { name:'GoHighLevel', fields:['ghl_key','ghl_location_id'] },
        { name:'Make.com', fields:['make_webhook'] },
        { name:'Twilio', fields:['twilio_sid','twilio_token','twilio_number'] },
        { name:'NeverBounce', fields:['neverbounce_key'] },
        { name:'Mailgun', fields:['mailgun_key','mailgun_domain'] },
      ]},
    { key:'w3', label:'⭐ Wedge 3 — Review Gap', active:c.w3, color:'var(--green)',
      tools:[
        { name:'GoHighLevel', fields:['ghl_key','ghl_location_id'] },
        { name:'Make.com', fields:['make_webhook'] },
        { name:'Twilio', fields:['twilio_sid','twilio_token','twilio_number'] },
        { name:'NiceJob / Birdeye', fields:['nicejob_key','nicejob_location_id'] },
      ]},
  ];

  return wedges.filter(w=>w.active).map(w => {
    const creds = c.creds?.[w.key] || {};
    const allFields = w.tools.flatMap(t=>t.fields);
    const filled = allFields.filter(f=>creds[f]).length;
    const total = allFields.length;
    let statusCls = filled===total?'badge-connected':filled===0?'badge-missing':'badge-warning';
    let statusTxt = filled===total?'All connected':filled+'/'+total+' configured';
    return `<div style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:0.82rem;font-weight:700">${w.label}</span>
        <span class="badge ${statusCls}">${statusTxt}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${w.tools.map(t=>{
          const tFilled = t.fields.filter(f=>creds[f]).length;
          const tCls = tFilled===t.fields.length?'badge-connected':tFilled===0?'badge-missing':'badge-warning';
          return `<span class="badge ${tCls}">${t.name}</span>`;
        }).join('')}
      </div>
    </div>`;
  }).join('') || '<div class="text-muted text-small">No wedges active. Edit client to add services.</div>';
}

// ─── ADD / EDIT CLIENT MODAL ───
function openAddClient() {
  state.editingClientId = null;
  document.getElementById('modal-client-title').textContent = 'Add New Client';
  clearClientForm();
  document.getElementById('c-pilot-date').value = new Date().toISOString().split('T')[0];
  openModal('modal-add-client');
}

function openEditClient(id) {
  const c = state.clients.find(cl=>cl.id===id);
  if (!c) return;
  state.editingClientId = id;
  document.getElementById('modal-client-title').textContent = 'Edit — ' + c.name;
  fillClientForm(c);
  openModal('modal-add-client');
}

function clearClientForm() {
  ['c-name','c-owner','c-email','c-phone','c-website','c-notes','c-monthly','c-setup','c-pilot-date','c-next-invoice'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('c-market').value = 'Professional Services';
  document.getElementById('c-status').value = 'Pilot';
  document.getElementById('c-pay-status').value = 'Unpaid';
  document.getElementById('c-onboarding').value = 'kickoff';
  ['c-w1','c-w2','c-w3'].forEach(id => { const el=document.getElementById(id); if(el) el.checked=false; });
  clearAllApiFields();
}

function fillClientForm(c) {
  const set = (id,val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
  set('c-name', c.name); set('c-owner', c.owner); set('c-email', c.email); set('c-phone', c.phone);
  set('c-website', c.website); set('c-notes', c.notes); set('c-monthly', c.monthly);
  set('c-setup', c.setup); set('c-pilot-date', c.pilotDate); set('c-next-invoice', c.nextInvoice);
  document.getElementById('c-market').value = c.market || 'Professional Services';
  document.getElementById('c-status').value = c.status || 'Pilot';
  document.getElementById('c-pay-status').value = c.payStatus || 'Unpaid';
  document.getElementById('c-onboarding').value = c.onboardingStage || 'kickoff';
  ['w1','w2','w3'].forEach(w => { const el=document.getElementById('c-'+w); if(el) el.checked=c[w]||false; });
  if (c.creds) fillApiFields(c.creds);
}

function saveClient() {
  const name = document.getElementById('c-name').value.trim();
  const email = document.getElementById('c-email').value.trim();
  if (!name) { showToast('Business name is required','error'); return; }

  const creds = collectApiFields();
  const data = {
    name, email,
    owner: document.getElementById('c-owner').value.trim(),
    phone: document.getElementById('c-phone').value.trim(),
    website: document.getElementById('c-website').value.trim(),
    market: document.getElementById('c-market').value,
    status: document.getElementById('c-status').value,
    payStatus: document.getElementById('c-pay-status').value,
    pilotDate: document.getElementById('c-pilot-date').value,
    nextInvoice: document.getElementById('c-next-invoice').value,
    monthly: document.getElementById('c-monthly').value,
    setup: document.getElementById('c-setup').value,
    notes: document.getElementById('c-notes').value.trim(),
    onboardingStage: document.getElementById('c-onboarding').value,
    w1: document.getElementById('c-w1').checked,
    w2: document.getElementById('c-w2').checked,
    w3: document.getElementById('c-w3').checked,
    creds,
  };

  if (state.editingClientId) {
    const idx = state.clients.findIndex(c=>c.id===state.editingClientId);
    if (idx > -1) {
      state.clients[idx] = { ...state.clients[idx], ...data };
      logActivity(state.editingClientId, 'Client details updated', 'var(--accent)');
    }
    showToast('Client updated', 'success');
  } else {
    data.id = uid();
    data.created = now();
    state.clients.push(data);
    logActivity(data.id, 'Client added to Drivyn AI', 'var(--green)');
    showToast('Client added', 'success');
  }
  saveState(); closeModal('modal-add-client'); renderAll();
}

function deleteClient(id) {
  if (!confirm('Delete this client and all their data? This cannot be undone.')) return;
  state.clients = state.clients.filter(c=>c.id!==id);
  state.invoices = state.invoices.filter(i=>i.clientId!==id);
  state.reports = state.reports.filter(r=>r.clientId!==id);
  state.activity = (state.activity||[]).filter(a=>a.clientId!==id);
  state.wins = (state.wins||[]).filter(w=>w.clientId!==id);
  state.comms = (state.comms||[]).filter(c=>c.clientId!==id);
  saveState(); renderAll(); showToast('Client deleted', 'info');
}

// ─── ONBOARDING STAGE ───
function advanceStage(id) {
  const c = state.clients.find(cl=>cl.id===id);
  if (!c) return;
  const stages = ['kickoff','build','approval','live','optimized'];
  const idx = stages.indexOf(c.onboardingStage||'kickoff');
  if (idx < stages.length-1) {
    c.onboardingStage = stages[idx+1];
    const labels = ['Kickoff','Build','Approval','Live','Optimized'];
    logActivity(id, 'Onboarding advanced to ' + labels[idx+1], 'var(--green)');
    saveState(); renderAll(); showToast('Stage advanced to ' + labels[idx+1], 'success');
  }
}

// ─── API FIELDS ───
const apiFields = {
  w1: {
    VAPI: ['vapi_key|VAPI API Key', 'vapi_phone_id|Phone Number ID', 'vapi_assistant_id|Assistant ID'],
    GoHighLevel: ['ghl_key|GHL API Key', 'ghl_location_id|Location ID', 'ghl_subaccount_id|Subaccount ID'],
    'Make.com': ['make_webhook|Webhook URL'],
    'Calendly / Cal.com': ['cal_key|API Key', 'cal_url|Scheduling URL'],
  },
  w2: {
    GoHighLevel: ['ghl_key|GHL API Key', 'ghl_location_id|Location ID'],
    'Make.com': ['make_webhook_w2|Webhook URL'],
    Twilio: ['twilio_sid|Account SID', 'twilio_token|Auth Token', 'twilio_number|Phone Number'],
    NeverBounce: ['neverbounce_key|API Key'],
    Mailgun: ['mailgun_key|API Key', 'mailgun_domain|Domain'],
  },
  w3: {
    GoHighLevel: ['ghl_key|GHL API Key', 'ghl_location_id|Location ID'],
    'Make.com': ['make_webhook_w3|Webhook URL'],
    Twilio: ['twilio_sid|Account SID', 'twilio_token|Auth Token', 'twilio_number|Phone Number'],
    'NiceJob / Birdeye': ['nicejob_key|API Key', 'nicejob_location_id|Location ID'],
  },
};

function renderApiFields() {
  ['w1','w2','w3'].forEach(w => {
    const active = document.getElementById('c-'+w)?.checked;
    const body = document.getElementById('api-body-'+w);
    if (!body) return;
    if (!active) { body.style.display='none'; return; }
    body.style.display = 'block';
    const tools = apiFields[w];
    body.innerHTML = Object.entries(tools).map(([tool, fields]) => `
      <div class="api-field-group">
        <div class="api-tool-name">${tool}</div>
        ${fields.map(f => {
          const [key, label] = f.split('|');
          const isSensitive = key.includes('key')||key.includes('token')||key.includes('sid');
          return `<div class="form-group" style="margin-bottom:8px">
            <label class="form-label">${label}</label>
            <input type="${isSensitive?'password':'text'}" class="form-input form-input-masked" id="api-${w}-${key}" placeholder="Enter ${label}" autocomplete="off">
          </div>`;
        }).join('')}
      </div>`).join('');
  });
}

function fillApiFields(creds) {
  Object.entries(creds).forEach(([w, fields]) => {
    Object.entries(fields).forEach(([key, val]) => {
      const el = document.getElementById(`api-${w}-${key}`);
      if (el) el.value = val || '';
    });
  });
}

function clearAllApiFields() {
  document.querySelectorAll('[id^="api-"]').forEach(el => { el.value = ''; });
}

function collectApiFields() {
  const creds = {};
  ['w1','w2','w3'].forEach(w => {
    creds[w] = {};
    const tools = apiFields[w];
    Object.values(tools).flat().forEach(f => {
      const key = f.split('|')[0];
      const el = document.getElementById(`api-${w}-${key}`);
      if (el && el.value.trim()) creds[w][key] = el.value.trim();
    });
  });
  return creds;
}

// ─── INVOICES ───
function renderBillingView() {
  const paid = state.invoices.filter(i=>i.status==='Paid');
  const unpaid = state.invoices.filter(i=>i.status!=='Paid');
  const active = state.clients.filter(c=>c.status==='Active'||c.status==='Pilot');
  const mrr = active.reduce((s,c)=>s+(parseFloat(c.monthly)||0),0);
  const collected = paid.reduce((s,i)=>s+(parseFloat(i.amount)||0),0);
  const outstanding = unpaid.reduce((s,i)=>s+(parseFloat(i.amount)||0),0);
  const setup = state.invoices.filter(i=>i.type==='Setup').reduce((s,i)=>s+(parseFloat(i.amount)||0),0);
  setHTML('b-mrr', fmtMoney(mrr));
  setHTML('b-collected', fmtMoney(collected));
  setHTML('b-outstanding', fmtMoney(outstanding));
  setHTML('b-setup', fmtMoney(setup));

  const el = document.getElementById('billing-table-body');
  if (!el) return;
  if (!state.invoices.length) { setHTML('billing-table-wrap', emptyState('💳','No invoices yet','Add a client first then create invoices.')); return; }
  const sorted = [...state.invoices].sort((a,b)=>new Date(b.date)-new Date(a.date));
  el.innerHTML = sorted.map(inv => {
    const c = state.clients.find(cl=>cl.id===inv.clientId);
    return `<tr>
      <td><div class="td-primary">${c?c.name:'Unknown'}</div></td>
      <td><span class="text-small">${inv.type}</span></td>
      <td class="td-mono">${fmtMoney(inv.amount)}</td>
      <td class="td-mono">${fmtDate(inv.date)}</td>
      <td class="td-mono">${fmtDate(inv.due)}</td>
      <td>${payBadge(inv.status)}</td>
      <td><div class="td-actions">
        ${inv.status!=='Paid'?`<button class="btn btn-success btn-xs" onclick="markPaid('${inv.id}')">Paid</button>`:''}
        ${inv.status!=='Paid'?`<button class="btn btn-amber btn-xs" onclick="sendInvoiceReminder('${inv.id}')">Remind</button>`:''}
        <button class="btn btn-danger btn-xs" onclick="deleteInvoice('${inv.id}')">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openAddInvoice() {
  state.editingInvoiceId = null;
  const sel = document.getElementById('inv-client');
  sel.innerHTML = state.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('inv-amount').value = '';
  document.getElementById('inv-notes').value = '';
  document.getElementById('inv-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('inv-due').value = '';
  document.getElementById('inv-status').value = 'Unpaid';
  document.getElementById('inv-type').value = 'Monthly';
  openModal('modal-add-invoice');
}

function openAddInvoiceForClient(clientId) {
  openAddInvoice();
  document.getElementById('inv-client').value = clientId;
  const c = state.clients.find(cl=>cl.id===clientId);
  if (c) document.getElementById('inv-amount').value = c.monthly || '';
}

function saveInvoice() {
  const clientId = document.getElementById('inv-client').value;
  const amount = document.getElementById('inv-amount').value;
  if (!clientId || !amount) { showToast('Client and amount required','error'); return; }
  const inv = { id:uid(), clientId, type:document.getElementById('inv-type').value, amount, status:document.getElementById('inv-status').value, date:document.getElementById('inv-date').value, due:document.getElementById('inv-due').value, notes:document.getElementById('inv-notes').value, created:now() };
  state.invoices.push(inv);
  const c = state.clients.find(cl=>cl.id===clientId);
  logActivity(clientId, `Invoice added — ${fmtMoney(amount)} ${inv.type}`, 'var(--amber)');
  saveState(); closeModal('modal-add-invoice'); renderAll(); showToast('Invoice added','success');
}

function markPaid(id) {
  const inv = state.invoices.find(i=>i.id===id);
  if (!inv) return;
  inv.status = 'Paid';
  logActivity(inv.clientId, `Invoice marked paid — ${fmtMoney(inv.amount)}`, 'var(--green)');
  saveState(); renderAll(); showToast('Marked as paid','success');
}

function deleteInvoice(id) {
  if (!confirm('Delete this invoice?')) return;
  state.invoices = state.invoices.filter(i=>i.id!==id);
  saveState(); renderAll(); showToast('Invoice deleted','info');
}

function sendInvoiceReminder(invId) {
  const inv = state.invoices.find(i=>i.id===invId);
  if (!inv) return;
  const c = state.clients.find(cl=>cl.id===inv.clientId);
  logActivity(inv.clientId, `Invoice reminder sent — ${fmtMoney(inv.amount)} ${inv.type}`, 'var(--amber)');
  saveState(); renderAll();
  showToast(`Reminder sent to ${c?c.email:'client'}`,'info');
}

// ─── CONNECTION BOARD ───
function renderConnectionBoard() {
  const el = document.getElementById('connection-grid');
  if (!el) return;
  if (!state.clients.length) { el.innerHTML = emptyState('🔌','No clients yet','Add clients to see API connection status.'); return; }
  const active = state.clients.filter(c=>c.status==='Active'||c.status==='Pilot');
  if (!active.length) { el.innerHTML = emptyState('🔌','No active clients','Active and pilot clients appear here.'); return; }
  el.innerHTML = active.map(c => {
    const creds = c.creds || {};
    const checks = [];
    if (c.w1) {
      checks.push({ tool:'VAPI', ok:!!(creds.w1?.vapi_key) });
      checks.push({ tool:'GHL (W1)', ok:!!(creds.w1?.ghl_key) });
      checks.push({ tool:'Make (W1)', ok:!!(creds.w1?.make_webhook) });
      checks.push({ tool:'Calendly', ok:!!(creds.w1?.cal_key) });
    }
    if (c.w2) {
      checks.push({ tool:'Twilio', ok:!!(creds.w2?.twilio_sid) });
      checks.push({ tool:'NeverBounce', ok:!!(creds.w2?.neverbounce_key) });
      checks.push({ tool:'Make (W2)', ok:!!(creds.w2?.make_webhook_w2) });
    }
    if (c.w3) {
      checks.push({ tool:'NiceJob', ok:!!(creds.w3?.nicejob_key) });
      checks.push({ tool:'Make (W3)', ok:!!(creds.w3?.make_webhook_w3) });
    }
    const allOk = checks.every(ch=>ch.ok);
    const anyOk = checks.some(ch=>ch.ok);
    return `<div class="connection-card ${allOk?'':''}">
      <div class="flex-between mb-8">
        <div class="connection-client">${c.name}</div>
        <span class="badge ${allOk?'badge-connected':anyOk?'badge-warning':'badge-missing'}">${allOk?'All connected':anyOk?'Partial':'Not configured'}</span>
      </div>
      <div class="connection-items">
        ${checks.map(ch=>`<div class="connection-item"><span class="connection-tool">${ch.tool}</span><span class="badge ${ch.ok?'badge-connected':'badge-missing'}" style="font-size:0.6rem">${ch.ok?'✓':'Missing'}</span></div>`).join('')}
        ${!checks.length?'<div class="text-muted text-small">No wedges active</div>':''}
      </div>
      <button class="btn btn-ghost btn-xs w-full" style="margin-top:10px" onclick="openEditClient('${c.id}')">Manage Credentials</button>
    </div>`;
  }).join('');
}

// ─── REPORTS ───
function renderReportClientSelect() {
  const sel = document.getElementById('report-client-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select a client —</option>' +
    state.clients.filter(c=>c.status!=='Churned').map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  if (prev) sel.value = prev;
}

function openReportForClient(id) {
  showView('reports', document.querySelector('[data-view=reports]'));
  setTimeout(()=>{ const sel=document.getElementById('report-client-select'); if(sel){ sel.value=id; onReportClientChange(); } },100);
}

function onReportClientChange() {
  const id = document.getElementById('report-client-select').value;
  const inputs = document.getElementById('report-inputs');
  const empty = document.getElementById('report-empty');
  if (!id) { inputs.style.display='none'; empty.style.display='block'; return; }
  inputs.style.display='block'; empty.style.display='none';
  const c = state.clients.find(cl=>cl.id===id);
  if (!c) return;
  document.getElementById('rw1-section').style.display = c.w1?'block':'none';
  document.getElementById('rw2-section').style.display = c.w2?'block':'none';
  document.getElementById('rw3-section').style.display = c.w3?'block':'none';
}

function getReportData() {
  return {
    clientId: document.getElementById('report-client-select').value,
    w1:{ leads:getVal('r-w1-leads'), converted:getVal('r-w1-converted'), response:getVal('r-w1-response'), revenue:getVal('r-w1-revenue') },
    w2:{ contacted:getVal('r-w2-contacted'), replies:getVal('r-w2-replies'), booked:getVal('r-w2-booked'), rate:getVal('r-w2-rate'), revenue:getVal('r-w2-revenue') },
    w3:{ sent:getVal('r-w3-sent'), collected:getVal('r-w3-collected'), stars:getVal('r-w3-stars'), intercepted:getVal('r-w3-intercepted') },
    note: getVal('r-note'),
  };
}

function getVal(id) { const el=document.getElementById(id); return el?el.value:''; }

function buildReportHTML(data, c) {
  const month = new Date().toLocaleString('default',{month:'long',year:'numeric'});
  const totalRev = (parseFloat(data.w1?.revenue)||0)+(parseFloat(data.w2?.revenue)||0);
  return `
    <div style="border-bottom:2px solid var(--black);padding-bottom:16px;margin-bottom:20px">
      <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:6px">Monthly Performance Report · ${month}</div>
      <div style="font-size:1.4rem;font-weight:800;letter-spacing:-0.3px">${c.name}</div>
      <div style="font-size:0.8rem;color:var(--muted);margin-top:2px">Drivyn AI Revenue Recovery System · ${c.market||''}</div>
    </div>
    ${totalRev>0?`<div style="background:var(--green-light);border:1px solid var(--green-mid);border-radius:var(--radius);padding:16px 20px;margin-bottom:20px;text-align:center">
      <div style="font-size:2rem;font-weight:800;color:var(--green);letter-spacing:-0.5px">${fmtMoney(totalRev)}</div>
      <div style="font-size:0.75rem;color:var(--muted);margin-top:2px">Total revenue recovered this month</div>
    </div>`:''}
    ${c.w1?`<div class="report-wedge-section">
      <div class="report-wedge-title" style="color:var(--accent)">⚡ Wedge 1 — Missed Lead Recovery</div>
      <div class="report-metrics-grid">
        <div class="report-metric"><div class="report-metric-val">${data.w1.leads||0}</div><div class="report-metric-label">Leads responded to</div></div>
        <div class="report-metric"><div class="report-metric-val">${data.w1.converted||0}</div><div class="report-metric-label">Converted to bookings</div></div>
        <div class="report-metric"><div class="report-metric-val">${data.w1.response||'—'}</div><div class="report-metric-label">Avg response time</div></div>
        <div class="report-metric"><div class="report-metric-val" style="color:var(--green)">${fmtMoney(data.w1.revenue||0)}</div><div class="report-metric-label">Revenue recovered</div></div>
      </div>
    </div>`:''}
    ${c.w2?`<div class="report-wedge-section">
      <div class="report-wedge-title" style="color:var(--purple)">🔄 Wedge 2 — Dead Database Reactivation</div>
      <div class="report-metrics-grid">
        <div class="report-metric"><div class="report-metric-val">${data.w2.contacted||0}</div><div class="report-metric-label">Contacts messaged</div></div>
        <div class="report-metric"><div class="report-metric-val">${data.w2.replies||0}</div><div class="report-metric-label">Replies received</div></div>
        <div class="report-metric"><div class="report-metric-val">${data.w2.booked||0}</div><div class="report-metric-label">Appointments booked</div></div>
        <div class="report-metric"><div class="report-metric-val">${data.w2.rate||0}%</div><div class="report-metric-label">Reactivation rate</div></div>
      </div>
    </div>`:''}
    ${c.w3?`<div class="report-wedge-section">
      <div class="report-wedge-title" style="color:var(--green)">⭐ Wedge 3 — Review Gap System</div>
      <div class="report-metrics-grid">
        <div class="report-metric"><div class="report-metric-val">${data.w3.sent||0}</div><div class="report-metric-label">Review requests sent</div></div>
        <div class="report-metric"><div class="report-metric-val">${data.w3.collected||0}</div><div class="report-metric-label">Reviews collected</div></div>
        <div class="report-metric"><div class="report-metric-val">${data.w3.stars||'—'} ★</div><div class="report-metric-label">Avg star rating</div></div>
        <div class="report-metric"><div class="report-metric-val">${data.w3.intercepted||0}</div><div class="report-metric-label">Negatives intercepted</div></div>
      </div>
    </div>`:''}
    ${data.note?`<div style="margin-top:16px;padding:14px;background:var(--accent-light);border:1px solid var(--accent-mid);border-radius:var(--radius);font-size:0.875rem">${data.note}</div>`:''}
    <div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--border);font-size:0.72rem;color:var(--muted)">
      Drivyn AI · GetStarted@getdrivynai.com · (443) 333-9344
    </div>`;
}

function previewReport() {
  const data = getReportData();
  if (!data.clientId) { showToast('Select a client first','error'); return; }
  const c = state.clients.find(cl=>cl.id===data.clientId);
  document.getElementById('report-preview-body').innerHTML = buildReportHTML(data, c);
  openModal('modal-report-preview');
}

function sendReport() {
  const data = getReportData();
  if (!data.clientId) { showToast('Select a client','error'); return; }
  const c = state.clients.find(cl=>cl.id===data.clientId);
  const r = { id:uid(), clientId:data.clientId, clientName:c.name, date:now(), data };
  state.reports.push(r);
  logActivity(data.clientId, 'Monthly report sent to '+c.email, 'var(--accent)');
  saveState(); closeModal('modal-report-preview');
  renderAll(); showToast('Report sent to '+c.email,'success');
}

function renderReportHistory() {
  const el = document.getElementById('report-history');
  if (!el) return;
  if (!state.reports.length) { el.innerHTML = emptyState('📊','No reports sent yet','Send a report above.'); return; }
  const sorted = [...state.reports].sort((a,b)=>new Date(b.date)-new Date(a.date));
  el.innerHTML = `<table><thead><tr><th>Client</th><th>Date Sent</th><th>W1 Revenue</th><th>W3 Reviews</th><th></th></tr></thead><tbody>${sorted.map(r=>`<tr>
    <td class="td-primary">${r.clientName}</td>
    <td class="td-mono">${fmtDate(r.date)}</td>
    <td>${r.data?.w1?.revenue?fmtMoney(r.data.w1.revenue):'—'}</td>
    <td>${r.data?.w3?.collected||'—'}</td>
    <td><button class="btn btn-ghost btn-xs" onclick="viewReport('${r.id}')">View</button></td>
  </tr>`).join('')}</tbody></table>`;
}

function viewReport(id) {
  const r = state.reports.find(rp=>rp.id===id);
  if (!r) return;
  const c = state.clients.find(cl=>cl.id===r.clientId);
  document.getElementById('report-preview-body').innerHTML = buildReportHTML(r.data, c);
  openModal('modal-report-preview');
}

// ─── QUICK WINS ───
function openAddWin(clientId) {
  document.getElementById('win-client-id').value = clientId;
  document.getElementById('win-text').value = '';
  openModal('modal-add-win');
}

function saveWin() {
  const clientId = document.getElementById('win-client-id').value;
  const text = document.getElementById('win-text').value.trim();
  if (!text) { showToast('Enter a win description','error'); return; }
  if (!state.wins) state.wins = [];
  state.wins.push({ id:uid(), clientId, text, date:now() });
  logActivity(clientId, '⭐ Quick win recorded: '+text, 'var(--amber)');
  saveState(); closeModal('modal-add-win'); renderAll(); showToast('Win recorded','success');
}

// ─── COMMUNICATION LOG ───
function openAddComm(clientId) {
  document.getElementById('comm-client-id').value = clientId;
  document.getElementById('comm-note').value = '';
  document.getElementById('comm-type').value = 'Call';
  openModal('modal-add-comm');
}

function saveComm() {
  const clientId = document.getElementById('comm-client-id').value;
  const note = document.getElementById('comm-note').value.trim();
  if (!note) { showToast('Enter a note','error'); return; }
  if (!state.comms) state.comms = [];
  const type = document.getElementById('comm-type').value;
  state.comms.push({ id:uid(), clientId, note, type, date:now() });
  logActivity(clientId, type+' logged', 'var(--purple)');
  saveState(); closeModal('modal-add-comm'); renderAll(); showToast('Note logged','success');
}

// ─── REFERRALS ───
function prepConversionCall(id) {
  const c = state.clients.find(cl=>cl.id===id);
  if (!c) return;
  const reports = state.reports.filter(r=>r.clientId===id);
  const totalRev = reports.reduce((s,r)=>(s+(parseFloat(r.data?.w1?.revenue)||0)+(parseFloat(r.data?.w2?.revenue)||0)),0);
  showToast(`Conversion call prep: ${c.name} · ${fmtMoney(totalRev)} recovered so far`,'info');
  logActivity(id,'Conversion call prepared for pilot expiry','var(--amber)');
  saveState();
}

// ─── ACTIVITY LOG ───
function logActivity(clientId, text, color) {
  if (!state.activity) state.activity = [];
  state.activity.push({ id:uid(), clientId, text, color:color||'var(--muted)', date:now() });
  if (state.activity.length > 500) state.activity = state.activity.slice(-500);
}

// ─── MODAL HELPERS ───
function openModal(id) { const el=document.getElementById(id); if(el) el.classList.add('open'); }
function closeModal(id) { const el=document.getElementById(id); if(el) el.classList.remove('open'); }

// ─── TOAST ───
function showToast(msg, type='info') {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.className = 'toast toast-'+type;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 3000);
}

// ─── HELPERS ───
function setHTML(id, html) { const el=document.getElementById(id); if(el) el.innerHTML=html; }
function emptyState(icon, title, desc) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><h3>${title}</h3><p>${desc}</p></div>`;
}

// ─── INIT ───
loadState();
document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if(e.target===m) m.classList.remove('open'); });
  });
  document.getElementById('report-client-select')?.addEventListener('change', onReportClientChange);
  ['c-w1','c-w2','c-w3'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderApiFields);
  });
});
