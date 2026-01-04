let settings = JSON.parse(localStorage.getItem('cap_settings')) || {
    balance: 7000, maxRiskPct: 1.0, dailyRiskPct: 0.5, dailyTgtPct: 2.0, compoundPct: 33, rr: 5.0
};

let session = JSON.parse(localStorage.getItem('cap_session')) || { trades: [] };
let historyLog = JSON.parse(localStorage.getItem('cap_history')) || [];

let currentRisk = 0, currentStage = 0, currentPnL = 0, chart, currentTab = 'hist', settingsValid = true;

// --- UTILS & FORMATTING ---
function getFormattedDate() {
    const d = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getFormattedTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
}

// --- INITIALIZATION ---
function init() {
    loadSettingsToUI();
    attachSettingsListeners();
    recalculateState();
    updateUI();
}

function loadSettingsToUI() {
    document.getElementById('set-balance').value = settings.balance;
    document.getElementById('set-max-risk').value = settings.maxRiskPct;
    document.getElementById('set-daily-risk').value = settings.dailyRiskPct;
    document.getElementById('set-daily-target').value = settings.dailyTgtPct;
    document.getElementById('set-compound').value = settings.compoundPct;
    document.getElementById('set-rr').value = settings.rr;
    updateSettingsFeedback();
}

function attachSettingsListeners() {
    ['set-balance', 'set-max-risk', 'set-daily-risk', 'set-daily-target', 'set-compound', 'set-rr'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateSettingsFeedback);
    });
}

function updateSettingsFeedback() {
    let isValid = true;
    const b = parseFloat(document.getElementById('set-balance').value) || 0;
    const dr = parseFloat(document.getElementById('set-daily-risk').value) || 0;
    const dt = parseFloat(document.getElementById('set-daily-target').value) || 0;
    const mr = parseFloat(document.getElementById('set-max-risk').value) || 0;
    const c = parseFloat(document.getElementById('set-compound').value) || 0;
    const r = parseFloat(document.getElementById('set-rr').value) || 0;

    const setFb = (id, msg, type) => {
        const el = document.getElementById(id);
        el.innerText = msg; el.className = 'setting-feedback ' + (type ? `feedback-${type}` : '');
        if (type === 'error') isValid = false;
    };

    if (b <= 0 || b > 1000000) setFb('fb-balance', 'Valid: $1 - $1M', 'error'); else setFb('fb-balance', 'Core Capital', 'info');
    
    const checkPct = (v, id, limit) => {
        if (v <= 0 || v > 100) setFb(id, 'Invalid %', 'error');
        else if (v > limit) setFb(id, `⚠️ High: $${(b*v/100).toFixed(0)}`, 'warn');
        else setFb(id, `= $${(b*v/100).toFixed(2)}`, 'info');
    };

    checkPct(dr, 'fb-daily-risk', 5);
    checkPct(dt, 'fb-daily-target', 15);
    checkPct(mr, 'fb-max-risk', 5);

    if (c < 1 || c > 100) setFb('fb-compound', '1-100%', 'error'); else setFb('fb-compound', 'Reinvestment rate', 'info');
    if (r <= 0 || r >= 100) setFb('fb-rr', 'Invalid R:R', 'error'); else setFb('fb-rr', `Target: ${r}x Risk`, 'info');

    settingsValid = isValid;
    document.getElementById('btn-settings-done').disabled = !isValid;
}

// --- LOGIC ---
function recalculateState() {
    const dailyRiskUsd = settings.balance * (settings.dailyRiskPct / 100);
    const maxRiskUsd = settings.balance * (settings.maxRiskPct / 100);
    currentPnL = 0; currentStage = 0;
    currentRisk = Math.min(dailyRiskUsd * (settings.compoundPct / 100), maxRiskUsd);

    session.trades.forEach(t => {
        currentPnL += t.pnl;
        if (t.type === 'win') {
            currentStage++;
            currentRisk = Math.min(currentRisk + (t.pnl * (settings.compoundPct / 100)), maxRiskUsd);
        } else {
            currentStage--;
            currentRisk = Math.min(Math.max(0, (dailyRiskUsd + currentPnL) * (settings.compoundPct / 100)), maxRiskUsd);
        }
    });
}

function handleTrade(type) {
    const manual = document.getElementById('manual-pnl').value;
    let pnl = (type === 'win') ? (manual ? Math.abs(parseFloat(manual)) : (currentRisk * settings.rr)) : (manual ? -Math.abs(parseFloat(manual)) : -currentRisk);
    session.trades.push({ pnl, type, time: getFormattedTime() });
    document.getElementById('manual-pnl').value = '';
    saveAndRefresh();
}

function undoTrade() { if (session.trades.length > 0) { session.trades.pop(); saveAndRefresh(); } }

function startNewDay() {
    const dayPnL = session.trades.reduce((s, t) => s + t.pnl, 0);
    historyLog.unshift({ date: getFormattedDate(), startBal: settings.balance, endBal: settings.balance + dayPnL, trades: [...session.trades] });
    settings.balance += dayPnL;
    session = { trades: [] };
    localStorage.setItem('cap_settings', JSON.stringify(settings));
    loadSettingsToUI();
    saveAndRefresh();
}

// --- UI ---
function updateUI() {
    recalculateState();
    
    const drUsd = settings.balance * (settings.dailyRiskPct / 100);
    const dtUsd = settings.balance * (settings.dailyTgtPct / 100);
    const poolRemaining = drUsd + currentPnL;
    
    // 1. Logic for Limits
    const targetHit = currentPnL >= dtUsd;
    const lossLimitHit = currentRisk < 1.0 || poolRemaining <= 1.0;

    // 2. Update Stats (Safe check)
    try {
        document.getElementById('stat-bal').innerText = `$${Math.round(settings.balance + currentPnL)}`;
        document.getElementById('stat-tgt').innerText = `$${Math.round(dtUsd)}`;
        document.getElementById('stat-stop').innerText = `-$${Math.round(drUsd)}`;
        document.getElementById('stat-risk').innerText = `$${currentRisk.toFixed(2)}`;
        document.getElementById('stat-pnl').innerText = `$${currentPnL.toFixed(1)}`;
        document.getElementById('stat-pool').innerText = `$${Math.max(0, poolRemaining).toFixed(1)}`;

        const bn = document.getElementById('status-note');
        if (bn) {
            if (targetHit) { 
                // Displays Actual Gain vs Set Goal
                const gainPct = ((currentPnL / dtUsd) * 100).toFixed(0);
                bn.innerText = `🏆 TARGET REACHED: ${gainPct}% ($${currentPnL.toFixed(0)} / $${dtUsd.toFixed(0)})`; 
                bn.style.color = "var(--success)"; 
            } else if (lossLimitHit) { 
                // Displays Actual Loss vs Daily Stop
                const lossValue = Math.abs(currentPnL).toFixed(0);
                bn.innerText = `🛑 LOSS LIMIT HIT: ($${lossValue} / $${drUsd.toFixed(0)})`; 
                bn.style.color = "var(--danger)"; 
            } else { 
                // Standard Progress Text
                const progressPct = ((currentPnL / settings.balance) * 100).toFixed(1);
                const prefix = currentPnL >= 0 ? "Up" : "Down";
                const color = currentPnL >= 0 ? "var(--success)" : "var(--danger)";
                
                bn.innerText = `${prefix} by ${Math.abs(progressPct)}% ($${currentPnL.toFixed(1)})`;
                bn.style.color = color;
                bn.style.opacity = "0.8";
            }
        }
    } catch (e) { console.warn("Stats UI missing elements:", e); }

    // 3. THE DISABLED STATE LOGIC
    const winBtn = document.getElementById('btn-win');
    const lossBtn = document.getElementById('btn-loss');
    const newDayBtn = document.getElementById('new-day-btn');

    if (winBtn) winBtn.disabled = (targetHit || lossLimitHit);
    if (lossBtn) lossBtn.disabled = lossLimitHit;
    if (newDayBtn) newDayBtn.disabled = session.trades.length === 0;

    // 4. FINAL VISUALS
    updateChart(dtUsd, drUsd);
    switchTab(currentTab);
}

function updateChart(tgt, stop) {
    const ctx = document.getElementById('equityChart').getContext('2d');
    let r = 0; const pts = [0]; session.trades.forEach(t => { r += t.pnl; pts.push(r); });
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'line', data: { labels: pts.map((_,i)=>i), datasets: [{ data: pts, borderColor: '#3b82f6', tension: 0.2, pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { grid: { color: '#334155' } } },
            plugins: { legend: { display: false }, annotation: { annotations: {
                t: { type: 'line', yMin: tgt, yMax: tgt, borderColor: '#22c55e', borderDash: [5,5] },
                s: { type: 'line', yMin: -stop, yMax: -stop, borderColor: '#ef4444', borderDash: [5,5] }
            } } }
        }
    });
}

function switchTab(t) {
    currentTab = t;
    const h = document.getElementById('table-head'), b = document.getElementById('table-body'), maxR = settings.balance * (settings.maxRiskPct/100);
    b.innerHTML = ''; document.querySelectorAll('.tab').forEach(el => el.classList.remove('active')); document.getElementById(`tab-${t}`).classList.add('active');

    if (t === 'hist') {
        h.innerHTML = '<th>Time</th><th>Type</th><th>PnL</th>';
        if(session.trades.length > 0) {
            b.innerHTML += `<tr class="history-header"><td colspan="3">Current Session</td></tr>`;
            [...session.trades].reverse().forEach(tr => b.innerHTML += `<tr><td>${tr.time}</td><td>${tr.type.toUpperCase()}</td><td style="color:${tr.pnl>=0?'var(--success)':'var(--danger)'}; font-weight:bold">$${tr.pnl.toFixed(2)}</td></tr>`);
        }
        historyLog.forEach(d => {
            b.innerHTML += `<tr class="history-header"><td colspan="3">${d.date} (Net: $${(d.endBal-d.startBal).toFixed(2)})</td></tr>`;
            [...d.trades].reverse().forEach(tr => b.innerHTML += `<tr><td>${tr.time}</td><td>${tr.type.toUpperCase()}</td><td style="color:${tr.pnl>=0?'var(--success)':'var(--danger)'}; font-weight:bold">$${tr.pnl.toFixed(2)}</td></tr>`);
        });
    } else if (t === 'win') {
        h.innerHTML = '<th>Stage</th><th>Risk</th><th>Total PnL</th>';
        let r = currentRisk, p = currentPnL;
        for(let i=1; i<=8; i++) {
            let pr = r * settings.rr; p += pr;
            b.innerHTML += `<tr><td>+${currentStage+i}</td><td>$${r.toFixed(1)}</td><td>$${p.toFixed(1)}</td></tr>`;
            r = Math.min(r + (pr * settings.compoundPct/100), maxR);
        }
    } else {
        h.innerHTML = '<th>Stage</th><th>Risk</th><th>Total PnL</th>';
        let p = currentPnL, po = (settings.balance * settings.dailyRiskPct/100) + currentPnL;
        for(let i=1; i<=8; i++) {
            let r = Math.min(po * (settings.compoundPct/100), maxR); po -= r; p -= r;
            b.innerHTML += `<tr><td>-${Math.abs(currentStage-i)}</td><td>$${r.toFixed(1)}</td><td>$${p.toFixed(1)}</td></tr>`;
        }
    }
}

function togglePage(p) { if(p === 'main-page') saveSettings(); document.querySelectorAll('.page').forEach(el => el.style.display = 'none'); document.getElementById(p).style.display = 'block'; }
function tryCloseSettings() { if (settingsValid) togglePage('main-page'); }
function saveSettings() { 
    settings = { balance: parseFloat(document.getElementById('set-balance').value), maxRiskPct: parseFloat(document.getElementById('set-max-risk').value), dailyRiskPct: parseFloat(document.getElementById('set-daily-risk').value), dailyTgtPct: parseFloat(document.getElementById('set-daily-target').value), compoundPct: parseFloat(document.getElementById('set-compound').value), rr: parseFloat(document.getElementById('set-rr').value) };
    localStorage.setItem('cap_settings', JSON.stringify(settings)); saveAndRefresh(); 
}
function saveAndRefresh() { localStorage.setItem('cap_session', JSON.stringify(session)); localStorage.setItem('cap_history', JSON.stringify(historyLog)); updateUI(); }
function resetApp() { if(confirm("Clear ALL data?")) { localStorage.clear(); location.reload(); } }

init();
