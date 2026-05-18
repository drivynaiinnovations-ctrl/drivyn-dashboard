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
  calls: [],
  campaigns: [],
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
      calls: state.calls,
      campaigns: state.campaigns,
      sofHistory: state.sofHistory || [],
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
  const titles = { home:'Dashboard', clients:'Clients', billing:'Billing & Payments', reports:'Reports', connections:'API Connections', detail:'Client Detail', results:'Results Board', voice:'Voice Intelligence', reviews:'Review Intelligence', winback:'Win-Back Lab', sof:'SOF Generator' };
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
          <div style="display:flex;align-items:center;width:100%;margin-bottom:10px">
            ${stages.map((s,i) => `
              <div style="display:flex;align-items:center;flex:${i<stages.length-1?'1':'0'}">
                <div class="onboarding-dot ${i<=stageIdx?'done':''} ${i===stageIdx?'current':''}" title="${stageLabels[i]}" style="flex-shrink:0">${i<stageIdx?'✓':(i+1)}</div>
                ${i<stages.length-1?`<div class="onboarding-line ${i<stageIdx?'done':''}" style="flex:1;min-width:40px"></div>`:''}
              </div>`).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;width:100%">
            ${stageLabels.map(l=>`<span style="font-size:0.68rem;color:var(--muted);text-align:center;flex:1">${l}</span>`).join('')}
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

      <!-- ZOHO BILLING -->
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">Billing & Payment</div>
          <div style="display:flex;gap:8px">
            ${c.zohoUrl?`<a href="${c.zohoUrl}" target="_blank" class="btn btn-black btn-sm">Open Zoho Invoice ↗</a>`:'<button class="btn btn-ghost btn-sm" onclick="openEditClient(\''+c.id+'\')">Add Zoho URL</button>'}
          </div>
        </div>
        <div class="card-body">
          <div class="detail-info-row">
            <div class="detail-info-label">Monthly Fee</div>
            <div class="detail-info-val td-mono">${fmtMoney(c.monthly)}/mo</div>
          </div>
          <div class="detail-info-row">
            <div class="detail-info-label">Setup Fee</div>
            <div class="detail-info-val td-mono">${fmtMoney(c.setup)}</div>
          </div>
          <div class="detail-info-row">
            <div class="detail-info-label">Payment Status</div>
            <div class="detail-info-val">${payBadge(c.payStatus||'Unpaid')}</div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-success btn-sm" onclick="updatePayStatus('${c.id}','Paid')">Mark Paid</button>
            <button class="btn btn-danger btn-sm" onclick="updatePayStatus('${c.id}','Overdue')">Mark Overdue</button>
            <button class="btn btn-ghost btn-sm" onclick="updatePayStatus('${c.id}','Unpaid')">Reset</button>
          </div>
          ${!c.zohoUrl?`<div style="margin-top:12px;padding:10px 12px;background:var(--amber-light);border:1px solid var(--amber-mid);border-radius:var(--radius-sm);font-size:0.78rem;color:var(--amber)">No Zoho invoice URL added yet. Edit client to add it.</div>`:''}
        </div>
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
          ${c.zohoUrl?`<div style="margin-top:12px"><a href="${c.zohoUrl}" target="_blank" class="btn btn-ghost w-full" style="justify-content:center">Open Zoho Invoice ↗</a></div>`:''}
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
  ['c-name','c-owner','c-email','c-phone','c-website','c-notes','c-monthly','c-setup','c-pilot-date','c-next-invoice','c-zoho-url','c-score-before','c-reviews-before','c-score-current','c-reviews-current','c-subindustry','c-services','c-service-area','c-avg-value','c-emergency-line'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
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
  set('c-zoho-url', c.zohoUrl);
  set('c-score-before', c.scoreBefore); set('c-reviews-before', c.reviewsBefore);
  set('c-score-current', c.scoreCurrent); set('c-reviews-current', c.reviewsCurrent);
  set('c-subindustry', c.subindustry); set('c-services', c.services);
  set('c-service-area', c.serviceArea); set('c-avg-value', c.avgValue);
  set('c-emergency-line', c.emergencyLine);
  document.getElementById('c-qualify').value = c.qualify || 'no';
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
    zohoUrl: document.getElementById('c-zoho-url')?.value.trim(),
    scoreBefore: document.getElementById('c-score-before')?.value,
    reviewsBefore: document.getElementById('c-reviews-before')?.value,
    scoreCurrent: document.getElementById('c-score-current')?.value,
    reviewsCurrent: document.getElementById('c-reviews-current')?.value,
    subindustry: document.getElementById('c-subindustry')?.value.trim(),
    services: document.getElementById('c-services')?.value.trim(),
    serviceArea: document.getElementById('c-service-area')?.value.trim(),
    avgValue: document.getElementById('c-avg-value')?.value,
    qualify: document.getElementById('c-qualify')?.value,
    emergencyLine: document.getElementById('c-emergency-line')?.value.trim(),
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
// ─── BILLING VIEW ───
function renderBillingView() {
  const active = state.clients.filter(c => c.status === 'Active' || c.status === 'Pilot');
  const mrr = active.reduce((s,c) => s + (parseFloat(c.monthly)||0), 0);
  const paid = active.filter(c => c.payStatus === 'Paid').length;
  const unpaid = active.filter(c => c.payStatus !== 'Paid').length;

  setHTML('b-mrr', fmtMoney(mrr));
  setHTML('b-paid', paid);
  setHTML('b-unpaid', unpaid);

  const el = document.getElementById('billing-table-body');
  if (!el) return;

  if (!active.length) {
    el.innerHTML = `<tr><td colspan="7">${emptyState('💳','No active clients yet','Add clients to track payment status.')}</td></tr>`;
    return;
  }

  el.innerHTML = state.clients.map(c => {
    const days = pilotDaysLeft(c);
    const zohoBtn = c.zohoUrl
      ? `<a href="${c.zohoUrl}" target="_blank" class="btn btn-ghost btn-xs">Open in Zoho ↗</a>`
      : `<button class="btn btn-ghost btn-xs" onclick="openEditClient('${c.id}')">Add URL</button>`;
    return `<tr>
      <td><div class="td-primary">${c.name}</div><div class="td-secondary">${c.email||''}</div></td>
      <td><span class="text-small">${c.market||'—'}</span></td>
      <td class="td-mono">${fmtMoney(c.monthly)}/mo</td>
      <td>${payBadge(c.payStatus||'Unpaid')}</td>
      <td>${c.status==='Pilot'&&days!==null?pilotCountdown(c):'<span class="text-muted text-small">—</span>'}</td>
      <td>${zohoBtn}</td>
      <td><div class="td-actions">
        <button class="btn btn-success btn-xs" onclick="updatePayStatus('${c.id}','Paid')">Paid</button>
        <button class="btn btn-danger btn-xs" onclick="updatePayStatus('${c.id}','Overdue')">Overdue</button>
      </div></td>
    </tr>`;
  }).join('');
}

function updatePayStatus(clientId, status) {
  const c = state.clients.find(cl => cl.id === clientId);
  if (!c) return;
  c.payStatus = status;
  logActivity(clientId, `Payment status updated to ${status}`, status==='Paid'?'var(--green)':'var(--red)');
  saveState(); renderAll();
  showToast(`${c.name} marked as ${status}`, status==='Paid'?'success':'error');
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

// ─── RESULTS BOARD ───
function renderResultsBoard() {
  const allReports = state.reports;
  const totalRevenue = allReports.reduce((s,r) => s+(parseFloat(r.data?.w1?.revenue)||0)+(parseFloat(r.data?.w2?.revenue)||0),0);
  const totalReviews = allReports.reduce((s,r) => s+(parseFloat(r.data?.w3?.collected)||0),0);
  const totalLeads = allReports.reduce((s,r) => s+(parseFloat(r.data?.w1?.leads)||0),0);

  const clients = state.clients.filter(c => c.scoreBefore && c.scoreCurrent);
  const avgLift = clients.length ? clients.reduce((s,c) => s+(parseFloat(c.scoreCurrent)-parseFloat(c.scoreBefore)),0)/clients.length : 0;

  setHTML('rb-revenue', fmtMoney(totalRevenue));
  setHTML('rb-reviews', totalReviews);
  setHTML('rb-score-lift', (avgLift>=0?'+':'')+avgLift.toFixed(1)+' ⭐');
  setHTML('rb-leads', totalLeads);

  const el = document.getElementById('results-table-body');
  if (!el) return;
  if (!state.clients.length) { el.innerHTML = `<tr><td colspan="9">${emptyState('📊','No clients yet','Add clients to see results.')}</td></tr>`; return; }

  el.innerHTML = state.clients.map(c => {
    const clientReports = allReports.filter(r => r.clientId === c.id);
    const rev = clientReports.reduce((s,r) => s+(parseFloat(r.data?.w1?.revenue)||0)+(parseFloat(r.data?.w2?.revenue)||0),0);
    const leads = clientReports.reduce((s,r) => s+(parseFloat(r.data?.w1?.leads)||0),0);
    const reviews = clientReports.reduce((s,r) => s+(parseFloat(r.data?.w3?.collected)||0),0);
    const lastRate = clientReports.length ? clientReports[clientReports.length-1].data?.w2?.rate : null;
    const scoreBefore = parseFloat(c.scoreBefore)||0;
    const scoreCurrent = parseFloat(c.scoreCurrent)||0;
    const lift = scoreBefore && scoreCurrent ? (scoreCurrent-scoreBefore).toFixed(1) : null;
    const score = calcHealth(c);

    return `<tr style="cursor:pointer" onclick="openClientDetail('${c.id}')">
      <td><div class="td-primary">${c.name}</div><div class="td-secondary">${c.subindustry||c.market||''}</div></td>
      <td><span class="text-small">${c.market||'—'}</span></td>
      <td>
        ${scoreBefore?`<div style="font-size:0.78rem">
          <span style="color:var(--muted)">Before: ${scoreBefore}⭐</span><br>
          <span style="color:var(--green);font-weight:700">Now: ${scoreCurrent||'—'}⭐</span>
          ${lift?`<span style="color:var(--green);font-weight:800"> (+${lift})</span>`:''}
        </div>`:'<span class="text-muted text-small">Not set</span>'}
      </td>
      <td class="td-mono">${leads||0}</td>
      <td class="td-mono">${fmtMoney(rev)}</td>
      <td class="td-mono">${lastRate?lastRate+'%':'—'}</td>
      <td class="td-mono">${reviews||0} ⭐</td>
      <td><div class="health-score"><div class="health-bar"><div class="health-bar-fill ${healthClass(score)}" style="width:${score}%"></div></div><span class="health-num">${score}</span></div></td>
      <td><button class="btn btn-ghost btn-xs">View →</button></td>
    </tr>`;
  }).join('');
}

// ─── VOICE INTELLIGENCE ───
function renderVoiceView() {
  if (!state.calls) state.calls = [];
  const calls = state.calls;
  const total = calls.length;
  const booked = calls.filter(c => c.booked === 'yes').length;
  const followupSent = calls.filter(c => c.followupSent === 'yes').length;
  const needsFollowup = calls.filter(c => c.booked === 'no' && c.followupSent !== 'yes' && c.outcome !== 'not-qualified').length;

  setHTML('v-total', total);
  setHTML('v-booked', booked);
  setHTML('v-followup', followupSent);
  setHTML('v-needs', needsFollowup);

  // populate filter
  const sel = document.getElementById('voice-client-filter');
  if (sel) {
    const prev = sel.value;
    sel.innerHTML = '<option value="">All Clients</option>' + state.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    if (prev) sel.value = prev;
  }
  renderVoiceLog();
}

function renderVoiceLog() {
  const el = document.getElementById('voice-log-body');
  if (!el) return;
  if (!state.calls) state.calls = [];
  const filter = document.getElementById('voice-client-filter')?.value;
  const calls = filter ? state.calls.filter(c=>c.clientId===filter) : state.calls;
  const sorted = [...calls].sort((a,b)=>new Date(b.datetime)-new Date(a.datetime));

  if (!sorted.length) { el.innerHTML = emptyState('📞','No calls logged yet','Click "+ Log Call" to add a call.'); return; }

  const outcomeColors = { qualified:'var(--green)', interested:'var(--amber)', voicemail:'var(--muted)', callback:'var(--accent)', 'not-qualified':'var(--muted)', 'wrong-number':'var(--muted)' };
  const outcomeLabels = { qualified:'Qualified ✓', interested:'Interested', voicemail:'Voicemail', callback:'Callback Req.', 'not-qualified':'Not Qualified', 'wrong-number':'Wrong #' };

  el.innerHTML = `<table><thead><tr>
    <th>Date/Time</th><th>Client</th><th>Duration</th>
    <th>Service Interest</th><th>Outcome</th><th>Booked</th>
    <th>Follow-Up</th><th>Offer</th><th>Result</th><th></th>
  </tr></thead><tbody>${sorted.map(call => {
    const c = state.clients.find(cl=>cl.id===call.clientId);
    const needsAction = call.booked==='no' && call.followupSent!=='yes' && call.outcome!=='not-qualified';
    return `<tr ${needsAction?'style="background:rgba(204,51,51,0.04)"':''}>
      <td class="td-mono" style="font-size:0.78rem">${call.datetime?new Date(call.datetime).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—'}</td>
      <td><div class="td-primary">${c?c.name:'—'}</div></td>
      <td class="td-mono">${call.duration||'—'}</td>
      <td style="font-size:0.82rem;max-width:160px">${call.interest||'—'}</td>
      <td><span style="font-size:0.75rem;font-weight:700;color:${outcomeColors[call.outcome]||'var(--muted)'}">${outcomeLabels[call.outcome]||call.outcome||'—'}</span></td>
      <td>${call.booked==='yes'?'<span class="badge badge-active">Booked</span>':'<span class="badge badge-unpaid">No</span>'}</td>
      <td>${call.followupSent==='yes'?'<span class="badge badge-paid">Sent</span>':needsAction?'<span class="badge badge-risk">⚠ Needed</span>':'<span class="text-muted text-small">—</span>'}</td>
      <td style="font-size:0.78rem">${call.offer?'Offer '+call.offer:'—'}</td>
      <td style="font-size:0.78rem;color:${call.followupResult==='booked'?'var(--green)':call.followupResult==='no-response'?'var(--muted)':'var(--red)'}">${call.followupResult||'—'}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="viewCallDetail('${call.id}')">Detail</button></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function openAddCall() {
  const sel = document.getElementById('call-client');
  sel.innerHTML = state.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('call-datetime').value = new Date().toISOString().slice(0,16);
  ['call-number','call-duration','call-interest','call-objection','call-transcript'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('call-outcome').value='interested';
  document.getElementById('call-booked').value='no';
  document.getElementById('call-followup-sent').value='no';
  document.getElementById('call-offer').value='';
  document.getElementById('call-followup-result').value='pending';
  openModal('modal-add-call');
}

function saveCall() {
  const clientId = document.getElementById('call-client').value;
  if (!clientId) { showToast('Select a client','error'); return; }
  if (!state.calls) state.calls = [];
  const call = {
    id: uid(), clientId,
    datetime: document.getElementById('call-datetime').value,
    number: document.getElementById('call-number').value,
    duration: document.getElementById('call-duration').value,
    outcome: document.getElementById('call-outcome').value,
    booked: document.getElementById('call-booked').value,
    interest: document.getElementById('call-interest').value,
    objection: document.getElementById('call-objection').value,
    transcript: document.getElementById('call-transcript').value,
    followupSent: document.getElementById('call-followup-sent').value,
    offer: document.getElementById('call-offer').value,
    followupResult: document.getElementById('call-followup-result').value,
    created: now(),
  };
  state.calls.push(call);
  const c = state.clients.find(cl=>cl.id===clientId);
  logActivity(clientId, `Call logged — ${call.outcome} — ${call.interest||'no service noted'}`, call.booked==='yes'?'var(--green)':'var(--amber)');
  saveState(); closeModal('modal-add-call'); renderAll();
  showToast('Call logged','success');
}

function viewCallDetail(id) {
  const call = (state.calls||[]).find(c=>c.id===id);
  if (!call) return;
  const c = state.clients.find(cl=>cl.id===call.clientId);
  const html = `
    <div style="margin-bottom:16px"><h3 style="font-size:1rem;font-weight:700">${c?c.name:'Unknown'} — Call Detail</h3>
    <div style="font-size:0.78rem;color:var(--muted)">${call.datetime?new Date(call.datetime).toLocaleString():''}</div></div>
    <div class="detail-info-row"><div class="detail-info-label">Service Interest</div><div class="detail-info-val">${call.interest||'—'}</div></div>
    <div class="detail-info-row"><div class="detail-info-label">Outcome</div><div class="detail-info-val">${call.outcome}</div></div>
    <div class="detail-info-row"><div class="detail-info-label">Objection</div><div class="detail-info-val">${call.objection||'None noted'}</div></div>
    <div class="detail-info-row"><div class="detail-info-label">Follow-Up Offer</div><div class="detail-info-val">${call.offer?'Offer '+call.offer:'None sent'}</div></div>
    <div class="detail-info-row"><div class="detail-info-label">Follow-Up Result</div><div class="detail-info-val">${call.followupResult}</div></div>
    ${call.transcript?`<div style="margin-top:16px"><div class="form-section-title">Transcript</div><div style="margin-top:8px;padding:14px;background:var(--surface2);border-radius:var(--radius-sm);font-size:0.82rem;line-height:1.7;white-space:pre-wrap">${call.transcript}</div></div>`:''}`;
  document.getElementById('report-preview-body').innerHTML = html;
  openModal('modal-report-preview');
}

// ─── REVIEW INTELLIGENCE ───
function renderReviewIntel() {
  const allReports = state.reports;
  const totalReviews = allReports.reduce((s,r)=>s+(parseFloat(r.data?.w3?.collected)||0),0);
  const totalIntercepted = allReports.reduce((s,r)=>s+(parseFloat(r.data?.w3?.intercepted)||0),0);
  const clients = state.clients.filter(c=>c.scoreBefore&&c.scoreCurrent);
  const avgLift = clients.length?clients.reduce((s,c)=>s+(parseFloat(c.scoreCurrent)-parseFloat(c.scoreBefore)),0)/clients.length:0;

  setHTML('ri-total', totalReviews);
  setHTML('ri-avg-lift', (avgLift>=0?'+':'')+avgLift.toFixed(1)+' ⭐');
  setHTML('ri-intercepted', totalIntercepted);

  const sel = document.getElementById('ri-client-select');
  if (sel) sel.innerHTML = '<option value="">— Select client —</option>'+state.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');

  const el = document.getElementById('review-score-body');
  if (!el) return;
  if (!state.clients.length) { el.innerHTML = `<tr><td colspan="8">${emptyState('⭐','No clients yet','Add clients and record their Drivyn Score.')}</td></tr>`; return; }

  el.innerHTML = state.clients.map(c => {
    const before = parseFloat(c.scoreBefore)||0;
    const current = parseFloat(c.scoreCurrent)||0;
    const lift = before&&current?(current-before).toFixed(1):null;
    const revBefore = parseInt(c.reviewsBefore)||0;
    const revCurrent = parseInt(c.reviewsCurrent)||0;
    const newRevs = revCurrent-revBefore;
    return `<tr>
      <td class="td-primary">${c.name}</td>
      <td style="font-size:0.82rem">${c.market||'—'}</td>
      <td class="td-mono">${before?before+' ⭐':'<span class="text-muted">Not set</span>'}</td>
      <td class="td-mono" style="color:var(--green);font-weight:700">${current?current+' ⭐':'<span class="text-muted">Not set</span>'}</td>
      <td style="font-weight:800;color:${lift&&parseFloat(lift)>0?'var(--green)':'var(--muted)'}">${lift?(parseFloat(lift)>0?'+':'')+lift+' ⭐':'—'}</td>
      <td class="td-mono">${revBefore||'—'}</td>
      <td class="td-mono">${revCurrent||'—'}</td>
      <td class="td-mono" style="color:var(--green);font-weight:700">${newRevs>0?'+'+newRevs:'—'}</td>
    </tr>`;
  }).join('');
}

async function analyzeReview() {
  const text = document.getElementById('ri-review-text').value.trim();
  const clientId = document.getElementById('ri-client-select').value;
  if (!text) { showToast('Paste a review to analyze','error'); return; }
  const c = state.clients.find(cl=>cl.id===clientId);
  const vertical = c?.market || 'Service Business';
  const result = document.getElementById('review-analysis-result');
  result.style.display = 'block';
  result.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:0.85rem">Analyzing review with AI...</div>';
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: `You are analyzing a customer review for a ${vertical} business using the Drivyn AI system. Review: "${text}"\n\nRespond in JSON only with no markdown:\n{"sentiment":"positive|neutral|negative","star_estimate":4,"what_is_working":["list of positives"],"what_needs_fixing":["list of negatives"],"key_themes":["main topics mentioned"],"suggested_response":"a professional response to this review","follow_up_action":"what the business should do next"}` }]
      })
    });
    const data = await response.json();
    const raw = data.content?.[0]?.text || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim());
    const sentColor = parsed.sentiment==='positive'?'var(--green)':parsed.sentiment==='negative'?'var(--red)':'var(--amber)';
    result.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <span style="font-weight:700;font-size:0.9rem">AI Analysis</span>
          <span style="font-weight:800;color:${sentColor};text-transform:capitalize">${parsed.sentiment} · ${parsed.star_estimate}⭐ est.</span>
        </div>
        ${parsed.what_is_working?.length?`<div style="margin-bottom:12px"><div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--green);margin-bottom:6px">What's Working</div>${parsed.what_is_working.map(w=>`<div style="font-size:0.82rem;padding:4px 0;border-bottom:1px solid var(--border)">✓ ${w}</div>`).join('')}</div>`:''}
        ${parsed.what_needs_fixing?.length?`<div style="margin-bottom:12px"><div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--red);margin-bottom:6px">Needs Fixing</div>${parsed.what_needs_fixing.map(w=>`<div style="font-size:0.82rem;padding:4px 0;border-bottom:1px solid var(--border)">⚠ ${w}</div>`).join('')}</div>`:''}
        ${parsed.suggested_response?`<div style="margin-bottom:12px"><div style="font-size:0.7rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:6px">Suggested Response</div><div style="font-size:0.82rem;padding:10px;background:var(--surface);border-radius:var(--radius-sm);font-style:italic">"${parsed.suggested_response}"</div></div>`:''}
        ${parsed.follow_up_action?`<div style="padding:10px 12px;background:var(--accent-light);border:1px solid var(--accent-mid);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--accent)">💡 ${parsed.follow_up_action}</div>`:''}
      </div>`;
  } catch(e) {
    result.innerHTML = '<div style="padding:12px;color:var(--red);font-size:0.82rem">Analysis failed. Check your connection and try again.</div>';
  }
}

function clearReviewAnalysis() {
  document.getElementById('ri-review-text').value = '';
  const el = document.getElementById('review-analysis-result');
  el.style.display = 'none';
  el.innerHTML = '';
}

// ─── WIN-BACK LAB ───
function renderWinBackLab() {
  if (!state.campaigns) state.campaigns = [];
  const active = state.campaigns.filter(c=>c.status==='active').length;
  const allRates = state.campaigns.filter(c=>c.sent>0).map(c=>((parseInt(c.booked)||0)/(parseInt(c.sent)||1)*100));
  const avgRate = allRates.length?allRates.reduce((a,b)=>a+b,0)/allRates.length:0;
  const winner = state.campaigns.reduce((best,c) => {
    const rate = c.sent>0?(parseInt(c.booked)||0)/(parseInt(c.sent))*100:0;
    const bestRate = best?(parseInt(best.booked)||0)/(parseInt(best.sent)||1)*100:0;
    return rate>bestRate?c:best;
  }, null);

  setHTML('wb-active', active);
  setHTML('wb-best', winner?`${winner.name} (${((parseInt(winner.booked)||0)/(parseInt(winner.sent)||1)*100).toFixed(0)}%)`:'—');
  setHTML('wb-avg-rate', avgRate.toFixed(0)+'%');

  const el = document.getElementById('winback-campaigns');
  if (!el) return;
  if (!state.campaigns.length) {
    el.innerHTML = `<div class="table-wrap">${emptyState('🔄','No campaigns yet','Click "+ New Campaign" to start A/B testing.')}</div>`;
    return;
  }

  // Group by client
  const byClient = {};
  state.campaigns.forEach(camp => {
    if (!byClient[camp.clientId]) byClient[camp.clientId] = [];
    byClient[camp.clientId].push(camp);
  });

  el.innerHTML = Object.entries(byClient).map(([clientId, camps]) => {
    const c = state.clients.find(cl=>cl.id===clientId);
    const topCamp = camps.reduce((best,camp) => {
      const rate = camp.sent>0?(parseInt(camp.booked)||0)/(parseInt(camp.sent))*100:0;
      const bestRate = best?(parseInt(best.booked)||0)/(parseInt(best.sent)||1)*100:0;
      return rate>bestRate?camp:best;
    }, null);

    return `<div class="table-wrap" style="margin-bottom:16px">
      <div class="table-header">
        <div>
          <div class="card-title">${c?c.name:'Unknown'}</div>
          <div style="font-size:0.75rem;color:var(--muted)">${c?.market||''} · ${camps.length} campaign${camps.length!==1?'s':''}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openAddCampaignForClient('${clientId}')">+ Add Campaign</button>
      </div>
      <table><thead><tr>
        <th>Campaign</th><th>Strategy</th><th>Variant</th>
        <th>Sent</th><th>Replies</th><th>Booked</th>
        <th>Rate</th><th>Revenue</th><th>Status</th>
      </tr></thead><tbody>${camps.map(camp => {
        const rate = camp.sent>0?((parseInt(camp.booked)||0)/(parseInt(camp.sent))*100).toFixed(0):0;
        const isWinner = topCamp&&camp.id===topCamp.id&&parseInt(camp.booked)>0;
        return `<tr ${isWinner?'style="background:rgba(26,156,91,0.04)"':''}>
          <td><div class="td-primary">${camp.name}${isWinner?' 🏆':''}</div><div class="td-secondary">${fmtDate(camp.date)}</div></td>
          <td style="font-size:0.8rem">${camp.strategy||'—'}</td>
          <td><span class="badge ${camp.variant==='A'?'badge-w1':camp.variant==='B'?'badge-w2':'badge-w3'}">Offer ${camp.variant}</span></td>
          <td class="td-mono">${camp.sent||0}</td>
          <td class="td-mono">${camp.replies||0}</td>
          <td class="td-mono">${camp.booked||0}</td>
          <td style="font-weight:700;color:${parseFloat(rate)>=10?'var(--green)':parseFloat(rate)>=5?'var(--amber)':'var(--muted)'}">${rate}%</td>
          <td class="td-mono">${fmtMoney(camp.revenue||0)}</td>
          <td>${camp.status==='active'?'<span class="badge badge-active">Active</span>':camp.status==='complete'?'<span class="badge badge-paid">Done</span>':'<span class="badge badge-paused">Paused</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table>
    </div>`;
  }).join('');
}

function openAddCampaign() {
  const sel = document.getElementById('camp-client');
  sel.innerHTML = state.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  ['camp-name','camp-message','camp-sent','camp-replies','camp-booked','camp-revenue'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('camp-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('camp-status').value = 'active';
  document.getElementById('camp-variant').value = 'A';
  openModal('modal-add-campaign');
}

function openAddCampaignForClient(clientId) {
  openAddCampaign();
  document.getElementById('camp-client').value = clientId;
}

function saveCampaign() {
  const clientId = document.getElementById('camp-client').value;
  const name = document.getElementById('camp-name').value.trim();
  if (!clientId||!name) { showToast('Client and campaign name required','error'); return; }
  if (!state.campaigns) state.campaigns = [];
  const camp = {
    id: uid(), clientId, name,
    strategy: document.getElementById('camp-strategy').value,
    variant: document.getElementById('camp-variant').value,
    message: document.getElementById('camp-message').value,
    sent: document.getElementById('camp-sent').value,
    replies: document.getElementById('camp-replies').value,
    booked: document.getElementById('camp-booked').value,
    revenue: document.getElementById('camp-revenue').value,
    date: document.getElementById('camp-date').value,
    status: document.getElementById('camp-status').value,
    created: now(),
  };
  state.campaigns.push(camp);
  const c = state.clients.find(cl=>cl.id===clientId);
  logActivity(clientId, `Win-back campaign launched: ${name}`, 'var(--purple)');
  saveState(); closeModal('modal-add-campaign'); renderAll();
  showToast('Campaign saved','success');
}

// ─── HOOK INTO RENDER ALL ───
const _origRenderAll = renderAll;
function renderAll() {
  _origRenderAll();
  renderResultsBoard();
  renderVoiceView();
  renderReviewIntel();
  renderWinBackLab();
}

// ═══════════════════════════════════════════
// SOF GENERATOR — DRIVYN AI
// ═══════════════════════════════════════════

// ─── PRICING CONSTANTS ───
const SOF_PRICES = {
  voice: {
    monthly: { label:'Monthly', amount:750, period:'/mo' },
    annual:  { label:'Annual (save $1,350)', amount:7650, period:'/yr' },
    bundle:  { label:'Bundle w/ Review', amount:950, period:'/mo' },
    setup:   { standard:1497 }
  },
  review: {
    monthly: { label:'Monthly', amount:297, period:'/mo' },
    annual:  { label:'Annual (save $534)', amount:3029, period:'/yr' },
    bundle:  { label:'Bundle w/ Voice', amount:950, period:'/mo' },
    setup:   { standard:997 }
  }
};

// ─── SOF STATE ───
let sofCurrentHTML = '';
let sofCurrentClientId = '';

// ─── POPULATE SOF CLIENT SELECT ───
function populateSofClient() {
  const sel = document.getElementById('sof-client');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select a client —</option>' +
    state.clients.filter(c => c.status !== 'Churned')
      .map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (prev) sel.value = prev;
}

function onSofClientChange() {
  const id = document.getElementById('sof-client').value;
  sofCurrentClientId = id;
  const prev = document.getElementById('sof-client-preview');
  if (!id) { prev.style.display = 'none'; return; }
  const c = state.clients.find(cl => cl.id === id);
  if (!c) return;
  prev.style.display = 'block';
  document.getElementById('sof-preview-name').textContent = c.name + (c.owner ? ' · ' + c.owner : '');
  document.getElementById('sof-preview-addr').textContent = c.serviceArea || c.website || '—';
  document.getElementById('sof-preview-contact').textContent = (c.email || '') + (c.phone ? ' · ' + c.phone : '');
}

// ─── SETUP FEE CHANGE ───
function sofSetupChange(svc) {
  const val = document.getElementById(`sof-${svc}-setup`).value;
  const wrap = document.getElementById(`sof-${svc}-custom-wrap`);
  if (wrap) wrap.style.display = val === 'custom' ? 'block' : 'none';
  calcSofTotal();
}

// ─── TOGGLE SOF SERVICE CARD ───
function toggleSofSection(bodyId, header) {
  const body = document.getElementById(bodyId);
  if (body) body.classList.toggle('open');
  if (header) header.classList.toggle('active');
}

// ─── CALCULATE SOF TOTALS ───
function calcSofTotal() {
  const hasVoice = document.getElementById('sof-voice')?.checked;
  const hasReview = document.getElementById('sof-review')?.checked;

  let setupTotal = 0;
  let recurringTotal = 0;
  let recurringPeriod = '/mo';
  const lines = [];

  if (hasVoice) {
    const plan = document.getElementById('sof-voice-plan').value;
    const setupSel = document.getElementById('sof-voice-setup').value;
    let setup = setupSel === '0' ? 0 : setupSel === 'custom'
      ? (parseFloat(document.getElementById('sof-voice-setup-custom')?.value) || 0)
      : 1497;
    const p = SOF_PRICES.voice[plan];
    setupTotal += setup;
    recurringTotal += p.amount;
    recurringPeriod = p.period;
    lines.push({ label: `Voice Agent — ${p.label}`, setup, recurring: p.amount, period: p.period });
  }

  if (hasReview) {
    const plan = document.getElementById('sof-review-plan').value;
    const setupSel = document.getElementById('sof-review-setup').value;
    let setup = setupSel === '0' ? 0 : setupSel === 'custom'
      ? (parseFloat(document.getElementById('sof-review-setup-custom')?.value) || 0)
      : 997;
    const p = SOF_PRICES.review[plan];
    setupTotal += setup;
    recurringTotal += p.amount;
    recurringPeriod = p.period;
    lines.push({ label: `Review Agent — ${p.label}`, setup, recurring: p.amount, period: p.period });
  }

  // Bundle dedup — if both bundle selected, only charge $950/mo once
  const vPlan = document.getElementById('sof-voice-plan')?.value;
  const rPlan = document.getElementById('sof-review-plan')?.value;
  if (hasVoice && hasReview && (vPlan === 'bundle' || rPlan === 'bundle')) {
    recurringTotal = 950;
    recurringPeriod = '/mo';
  }

  // Discount
  const discType = document.getElementById('sof-discount-type').value;
  const discVal = parseFloat(document.getElementById('sof-discount-val')?.value) || 0;
  let discountAmt = 0;
  let discountLabel = '';
  if (discType === 'pct' && discVal > 0) {
    discountAmt = Math.round(setupTotal * discVal / 100);
    discountLabel = `${discVal}% discount on setup`;
  } else if (discType === 'flat' && discVal > 0) {
    discountAmt = discVal;
    discountLabel = `$${discVal} discount`;
  } else if (discType === 'setup') {
    discountAmt = setupTotal;
    discountLabel = 'Setup fee waived';
  }
  setupTotal = Math.max(0, setupTotal - discountAmt);

  // Render summary
  const summaryEl = document.getElementById('sof-summary');
  if (summaryEl) {
    summaryEl.innerHTML = lines.map(l => `
      <div style="display:flex;justify-content:space-between;font-size:0.78rem">
        <span style="color:rgba(255,255,255,0.6)">${l.label}</span>
        <span style="color:rgba(255,255,255,0.8)">$${l.setup} setup · $${l.recurring}${l.period}</span>
      </div>`).join('') +
      (discountAmt > 0 ? `<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--green)"><span>🎁 ${discountLabel}</span><span>−$${discountAmt}</span></div>` : '') +
      (!hasVoice && !hasReview ? '<div style="font-size:0.78rem;color:rgba(255,255,255,0.3)">No services selected</div>' : '');
  }

  setHTML('sof-total-setup', '$' + setupTotal.toLocaleString());
  setHTML('sof-total-recurring', hasVoice || hasReview ? '$' + recurringTotal.toLocaleString() + recurringPeriod : '—');

  return { lines, setupTotal, recurringTotal, recurringPeriod, discountAmt, discountLabel, hasVoice, hasReview };
}

// ─── GENERATE SOF ───
function generateSOF() {
  const clientId = document.getElementById('sof-client').value;
  if (!clientId) { showToast('Select a client first', 'error'); return; }
  const c = state.clients.find(cl => cl.id === clientId);
  if (!c) return;

  const totals = calcSofTotal();
  if (!totals.hasVoice && !totals.hasReview) { showToast('Select at least one service', 'error'); return; }

  const vPlan = document.getElementById('sof-voice-plan')?.value;
  const rPlan = document.getElementById('sof-review-plan')?.value;
  const notes = document.getElementById('sof-notes')?.value?.trim();
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const refNum = 'DAI-' + Date.now().toString(36).toUpperCase().slice(-6);

  // Determine which SOF refs to include
  const sofRefs = [];
  if (totals.hasVoice) sofRefs.push('DAI-VOICE-001');
  if (totals.hasReview) sofRefs.push('DAI-REVIEW-001');

  const html = buildSOFHTML(c, totals, vPlan, rPlan, notes, today, refNum, sofRefs);
  sofCurrentHTML = html;

  const area = document.getElementById('sof-preview-area');
  area.innerHTML = html;

  const btns = document.getElementById('sof-action-btns');
  if (btns) btns.style.display = 'flex';

  showToast('SOF generated — review and send', 'success');
}

function buildSOFHTML(c, totals, vPlan, rPlan, notes, today, refNum, sofRefs) {
  const styles = `
    <style>
      .sof-wrap{font-family:'DM Sans',sans-serif;font-size:13px;color:#111;line-height:1.65;max-width:720px;margin:0 auto}
      .sof-header{text-align:center;border-bottom:3px solid #0a0a0a;padding-bottom:16px;margin-bottom:20px}
      .sof-logo{font-size:20px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}
      .sof-logo span{color:#0066FF}
      .sof-tagline{font-size:11px;color:#888;letter-spacing:0.06em;text-transform:uppercase}
      .sof-title{font-size:16px;font-weight:800;margin:14px 0 4px;text-align:center}
      .sof-ref{font-size:11px;color:#888;text-align:center;font-family:monospace}
      .sof-meta{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin:16px 0}
      .sof-meta-row{display:contents}
      .sof-meta-label{background:#f8f8f8;padding:7px 12px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#666;border-bottom:1px solid #e0e0e0}
      .sof-meta-val{padding:7px 12px;border-bottom:1px solid #e0e0e0;font-size:12px}
      .sof-section{margin:20px 0}
      .sof-section-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#0066FF;border-bottom:2px solid #0066FF;padding-bottom:4px;margin-bottom:12px}
      .sof-service-block{background:#f8f9ff;border:1px solid #d4ddff;border-radius:8px;padding:14px 16px;margin-bottom:12px}
      .sof-service-name{font-weight:800;font-size:14px;margin-bottom:6px;display:flex;align-items:center;gap:8px}
      .sof-service-ref{font-size:10px;font-family:monospace;background:#e8eeff;color:#0066FF;padding:2px 7px;border-radius:4px;font-weight:700}
      .sof-service-detail{font-size:12px;color:#444;line-height:1.6}
      .sof-bullet{padding-left:14px;margin:4px 0}
      .sof-bullet li{margin-bottom:2px}
      .sof-price-table{width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden}
      .sof-price-table th{background:#0a0a0a;color:#fff;padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em}
      .sof-price-table td{padding:9px 12px;border-bottom:1px solid #eee;font-size:12px}
      .sof-price-table tr:last-child td{border-bottom:none;font-weight:700;background:#f8f8f8}
      .sof-price-table .val{text-align:right;font-family:monospace;font-weight:600}
      .sof-discount{color:#1a9c5b;font-weight:700}
      .sof-total-row td{background:#f0f4ff !important;color:#0066FF;font-weight:800;font-size:13px}
      .sof-terms{font-size:11px;color:#555;line-height:1.7}
      .sof-sig-block{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px}
      .sof-sig-party{border-top:2px solid #0a0a0a;padding-top:10px}
      .sof-sig-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px}
      .sof-sig-line{border-bottom:1px solid #bbb;margin-bottom:4px;height:32px}
      .sof-sig-label{font-size:10px;color:#888}
      .sof-footer{margin-top:20px;padding-top:12px;border-top:1px solid #e0e0e0;text-align:center;font-size:10px;color:#aaa}
      @media print{.sof-wrap{font-size:11px}.sof-title{font-size:14px}}
    </style>`;

  const voiceServiceHTML = totals.hasVoice ? `
    <div class="sof-service-block">
      <div class="sof-service-name">📞 Alli — 24/7 AI Voice Agent <span class="sof-service-ref">DAI-VOICE-001</span></div>
      <div class="sof-service-detail">
        <ul class="sof-bullet">
          <li>Answers every inbound call 24 hours a day, 7 days a week — no hold times, no voicemail</li>
          <li>Custom-trained on Client's services, pricing, hours, and location</li>
          <li>Natural conversational tone calibrated to Client's brand voice</li>
          <li>Escalation handling — de-escalates frustrated callers before live transfer</li>
          <li>Handles multiple simultaneous calls without quality degradation</li>
          <li>Ongoing: monthly performance review and AI Agent optimization</li>
        </ul>
        <div style="margin-top:8px"><b>Plan Selected:</b> ${SOF_PRICES.voice[vPlan || 'monthly'].label}</div>
      </div>
    </div>` : '';

  const reviewServiceHTML = totals.hasReview ? `
    <div class="sof-service-block">
      <div class="sof-service-name">⭐ Alli — Review Response AI Agent <span class="sof-service-ref">DAI-REVIEW-001</span></div>
      <div class="sof-service-detail">
        <ul class="sof-bullet">
          <li>Monitors Google Business Profile and responds to every review within minutes</li>
          <li>4 & 5 star path: warm personalized response + referral ask + staff alert email</li>
          <li>1–3 star path: empathetic response + HappyGuest@ resolution loop + staff briefing</li>
          <li>HappyGuest Resolution Loop: AI collects guest details, confirms follow-up within 24 hrs</li>
          <li>No per-response approval required — Client retains full visibility via alert emails</li>
          <li>Ongoing: monthly prompt optimization based on response performance</li>
        </ul>
        <div style="margin-top:8px"><b>Plan Selected:</b> ${SOF_PRICES.review[rPlan || 'monthly'].label}</div>
      </div>
    </div>` : '';

  // Build price table rows
  let priceRows = '';
  if (totals.hasVoice) {
    const vSetupSel = document.getElementById('sof-voice-setup')?.value;
    const vSetup = vSetupSel === '0' ? 0 : vSetupSel === 'custom'
      ? (parseFloat(document.getElementById('sof-voice-setup-custom')?.value) || 0) : 1497;
    const vp = SOF_PRICES.voice[vPlan || 'monthly'];
    priceRows += `<tr><td>Alli Voice Agent — ${vp.label}</td><td class="val">$${vSetup.toLocaleString()}</td><td class="val">$${vp.amount.toLocaleString()}${vp.period}</td></tr>`;
  }
  if (totals.hasReview) {
    const rSetupSel = document.getElementById('sof-review-setup')?.value;
    const rSetup = rSetupSel === '0' ? 0 : rSetupSel === 'custom'
      ? (parseFloat(document.getElementById('sof-review-setup-custom')?.value) || 0) : 997;
    const rp = SOF_PRICES.review[rPlan || 'monthly'];
    priceRows += `<tr><td>Alli Review Agent — ${rp.label}</td><td class="val">$${rSetup.toLocaleString()}</td><td class="val">$${rp.amount.toLocaleString()}${rp.period}</td></tr>`;
  }
  if (totals.discountAmt > 0) {
    priceRows += `<tr><td class="sof-discount">🎁 ${totals.discountLabel}</td><td class="val sof-discount">−$${totals.discountAmt.toLocaleString()}</td><td class="val">—</td></tr>`;
  }
  priceRows += `<tr class="sof-total-row"><td><b>TOTAL DUE AT SIGNING</b></td><td class="val"><b>$${totals.setupTotal.toLocaleString()}</b></td><td class="val"><b>$${totals.recurringTotal.toLocaleString()}${totals.recurringPeriod}</b></td></tr>`;

  const clientResps = totals.hasVoice
    ? '<li>Forward main business line to the Alli number provided by Drivyn AI</li><li>Provide accurate service menu, pricing, and hours for the knowledge base</li>'
    : '';
  const clientRespsReview = totals.hasReview
    ? '<li>Create HappyGuest@[yourdomain].com and designate one staff member to monitor it</li><li>Grant Drivyn AI access to Google Business Profile</li><li>Designate one staff member to receive negative review briefing emails</li>'
    : '';

  return `${styles}
  <div class="sof-wrap">
    <div class="sof-header">
      <div class="sof-logo">Drivyn<span>AI</span></div>
      <div class="sof-tagline">Service Order Form</div>
    </div>
    <div class="sof-title">SERVICE ORDER FORM — ${sofRefs.join(' + ')}</div>
    <div class="sof-ref">REF: ${refNum} &nbsp;·&nbsp; ${today}</div>

    <div class="sof-meta">
      <div class="sof-meta-label">CLIENT</div><div class="sof-meta-val"><b>${c.name}</b>${c.owner ? ' · ' + c.owner : ''}</div>
      <div class="sof-meta-label">EMAIL</div><div class="sof-meta-val">${c.email || '—'}</div>
      <div class="sof-meta-label">PHONE</div><div class="sof-meta-val">${c.phone || '—'}</div>
      <div class="sof-meta-label">ADDRESS</div><div class="sof-meta-val">${c.serviceArea || '—'}</div>
      <div class="sof-meta-label">PROVIDER</div><div class="sof-meta-val"><b>Drivyn AI</b> · Ryan Whitfield, CEO</div>
      <div class="sof-meta-label">PROVIDER EMAIL</div><div class="sof-meta-val">ryan@getdrivynai.com</div>
    </div>

    <div class="sof-section">
      <div class="sof-section-title">1. Overview</div>
      <p>This Service Order Form ("SOF") governs the delivery of Drivyn AI services to <b>${c.name}</b> ("Client"). This document is entered into between ${c.name} and Drivyn AI ("Provider") and becomes effective upon signature by both parties. Services commence on the go-live date confirmed by Drivyn AI after setup completion.</p>
    </div>

    <div class="sof-section">
      <div class="sof-section-title">2. Services Included</div>
      ${voiceServiceHTML}
      ${reviewServiceHTML}
    </div>

    <div class="sof-section">
      <div class="sof-section-title">3. Pricing & Payment Terms</div>
      <table class="sof-price-table">
        <thead><tr><th>Service</th><th>Setup Fee</th><th>Recurring</th></tr></thead>
        <tbody>${priceRows}</tbody>
      </table>
      <p class="sof-terms">Setup fee is due upon signing. Recurring billing begins on go-live date. Payment accepted via ACH, credit card, or check. Invoices due within 7 days of receipt.</p>
    </div>

    <div class="sof-section">
      <div class="sof-section-title">4. Term & Cancellation</div>
      <p class="sof-terms"><b>Monthly Plan:</b> No minimum commitment. Cancel with 30 days written notice to ryan@getdrivynai.com.<br>
      <b>Annual Plan:</b> Billed in full at signing. Cancel after 90 days with 30 days written notice. No refund for unused months.</p>
    </div>

    <div class="sof-section">
      <div class="sof-section-title">5. Client Responsibilities</div>
      <ul class="sof-bullet sof-terms">
        ${clientResps}${clientRespsReview}
        <li>Notify Drivyn AI of material changes to services, pricing, or hours within 5 business days</li>
        <li>Designate a primary internal contact for communications with Drivyn AI</li>
      </ul>
    </div>

    <div class="sof-section">
      <div class="sof-section-title">6. Intellectual Property</div>
      <p class="sof-terms">All AI Agent prompts, workflows, and system architecture developed by Drivyn AI remain the intellectual property of Drivyn AI. Knowledge base content derived from Client's operational data remains the property of Client. Upon termination, Drivyn AI will deactivate all services and provide Client with their content upon request.</p>
    </div>

    <div class="sof-section">
      <div class="sof-section-title">7. Limitation of Liability</div>
      <p class="sof-terms">Drivyn AI's total liability shall not exceed fees paid by Client in the three months preceding the claim. Drivyn AI is not liable for service interruptions caused by third-party providers (telephony, Google API, etc.) or revenue loss resulting from system downtime.</p>
    </div>

    <div class="sof-section">
      <div class="sof-section-title">8. Confidentiality</div>
      <p class="sof-terms">Both parties agree to keep the terms of this SOF and all proprietary business information shared during the engagement confidential. This obligation survives termination for two years.</p>
    </div>

    ${notes ? `<div class="sof-section"><div class="sof-section-title">9. Special Terms & Notes</div><p class="sof-terms">${notes}</p></div>` : ''}

    <div class="sof-section">
      <div class="sof-section-title">${notes ? '10' : '9'}. Signature & Acceptance</div>
      <p class="sof-terms">By signing below, both parties agree to the terms of this Service Order Form.${totals.hasReview ? ' Client acknowledges that review responses will be posted to Google Business Profile automatically without prior per-response approval.' : ''}</p>
      <div class="sof-sig-block">
        <div class="sof-sig-party">
          <div class="sof-sig-title">Client</div>
          <div class="sof-sig-line"></div><div class="sof-sig-label">Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>
          <br>
          <div class="sof-sig-line" style="margin-top:20px"></div><div class="sof-sig-label">Printed Name</div>
          <br>
          <div class="sof-sig-line" style="margin-top:20px"></div><div class="sof-sig-label">Title</div>
        </div>
        <div class="sof-sig-party">
          <div class="sof-sig-title">Drivyn AI</div>
          <div class="sof-sig-line"></div><div class="sof-sig-label">Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>
          <br>
          <div style="margin-top:20px;padding-top:8px;border-top:1px solid #bbb;font-size:12px"><b>Ryan Whitfield</b></div>
          <div class="sof-sig-label">CEO, Drivyn AI</div>
        </div>
      </div>
    </div>

    <div class="sof-footer">
      Drivyn AI &nbsp;·&nbsp; ryan@getdrivynai.com &nbsp;·&nbsp; getdrivynai.com &nbsp;·&nbsp; Ref: ${refNum}
    </div>
  </div>`;
}

// ─── PRINT SOF ───
function printSOF() {
  if (!sofCurrentHTML) { showToast('Generate a SOF first', 'error'); return; }
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>SOF — Drivyn AI</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>body{margin:40px;background:#fff;}</style></head>
    <body>${sofCurrentHTML}<script>window.onload=()=>{window.print();}<\/script></body></html>`);
  win.document.close();
}

// ─── SEND SOF ───
function sendSOF() {
  const clientId = document.getElementById('sof-client').value;
  if (!sofCurrentHTML || !clientId) { showToast('Generate a SOF first', 'error'); return; }
  const c = state.clients.find(cl => cl.id === clientId);
  if (!c) return;
  if (!c.email) { showToast('No email on file for this client', 'error'); return; }

  if (!state.sofHistory) state.sofHistory = [];
  const entry = {
    id: uid(),
    clientId,
    clientName: c.name,
    email: c.email,
    date: now(),
    services: [
      document.getElementById('sof-voice')?.checked ? 'Voice Agent' : null,
      document.getElementById('sof-review')?.checked ? 'Review Agent' : null,
    ].filter(Boolean).join(' + '),
    setup: document.getElementById('sof-total-setup')?.textContent,
    recurring: document.getElementById('sof-total-recurring')?.textContent,
  };
  state.sofHistory.push(entry);
  logActivity(clientId, `SOF sent to ${c.email} — ${entry.services}`, 'var(--accent)');
  saveState();
  renderSofHistory();
  showToast(`SOF sent to ${c.email}`, 'success');
  // Real email would trigger via Make.com webhook or Mailgun here
}

// ─── SOF HISTORY ───
function renderSofHistory() {
  const el = document.getElementById('sof-history-list');
  if (!el) return;
  if (!state.sofHistory || !state.sofHistory.length) {
    el.innerHTML = '<div style="padding:16px;font-size:0.82rem;color:var(--muted)">No SOFs sent yet.</div>';
    return;
  }
  const sorted = [...state.sofHistory].sort((a,b) => new Date(b.date)-new Date(a.date));
  el.innerHTML = `<table><thead><tr><th>Client</th><th>Services</th><th>Setup</th><th>Recurring</th><th>Date</th></tr></thead>
  <tbody>${sorted.map(s => `<tr>
    <td class="td-primary">${s.clientName}</td>
    <td style="font-size:0.78rem">${s.services}</td>
    <td class="td-mono">${s.setup}</td>
    <td class="td-mono">${s.recurring}</td>
    <td class="td-mono" style="font-size:0.75rem">${fmtDate(s.date)}</td>
  </tr>`).join('')}</tbody></table>`;
}

// Hook SOF into renderAll
const _origRenderAllPre = renderAll;
function renderAll() {
  _origRenderAllPre();
  populateSofClient();
  renderSofHistory();
  // Also update report client select for restaurant vertical
  const rsel = document.getElementById('report-client-select');
  if (rsel && !rsel.querySelector('option[value=""]')) {
    rsel.innerHTML = '<option value="">— Select a client —</option>' +
      state.clients.filter(c=>c.status!=='Churned').map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
}
