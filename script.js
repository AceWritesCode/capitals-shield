let accounts = JSON.parse(localStorage.getItem('cap_accounts')) || {};
let activeAccountId = localStorage.getItem('cap_active_account') || 'acct_1';

if (Object.keys(accounts).length === 0) {
    if (localStorage.getItem('cap_settings')) {
        accounts['acct_1'] = {
            id: 'acct_1',
            name: 'Account 1',
            settings: JSON.parse(localStorage.getItem('cap_settings')),
            session: JSON.parse(localStorage.getItem('cap_session')) || { trades: [] },
            historyLog: JSON.parse(localStorage.getItem('cap_history')) || []
        };
    } else {
        accounts['acct_1'] = {
            id: 'acct_1',
            name: 'Account 1',
            settings: { balance: 7000, dailyRiskPct: 0.5, dailyTgtPct: 2.0, compoundPct: 33, rr: 5.0, autoLock: true },
            session: { trades: [], date: getFormattedDate(), isLocked: false },
            historyLog: []
        };
    }
    localStorage.setItem('cap_accounts', JSON.stringify(accounts));
    localStorage.setItem('cap_active_account', 'acct_1');
}

let settings = accounts[activeAccountId].settings;
if (settings.autoLock === undefined) settings.autoLock = true;
let session = accounts[activeAccountId].session;
let historyLog = accounts[activeAccountId].historyLog;

Object.values(accounts).forEach(acc => {
    if (!acc.session) acc.session = { trades: [], date: getFormattedDate(), isLocked: false };
    if (!acc.session.date) acc.session.date = getFormattedDate();
    if (acc.session.isLocked === undefined) acc.session.isLocked = false;
});

let currentRisk = 0, currentStage = 0, currentPnL = 0, chart, currentTab = 'hist', settingsValid = true;
let openHistoryIds = new Set(['current']);
let viewDate = new Date();
let undoneSessionTrades = [];

window.toggleHistoryDay = function(id) {
    const el = document.getElementById(`hist-${id}`);
    if (!el) return;

    if (el.classList.contains('active')) {
        el.classList.remove('active');
        openHistoryIds.delete(id);
    } else {
        el.classList.add('active');
        openHistoryIds.add(id);
    }
};

// --- FORMATTERS ---
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
    populateSettingsAccountDropdown();
    loadSettingsToUI();
    attachListeners();
    checkMidnightRollover();
    recalculateState();
    updateUI();
}

function loadSettingsToUI() {
    document.getElementById('set-balance').value = settings.balance;
    document.getElementById('set-daily-risk').value = settings.dailyRiskPct;
    document.getElementById('set-daily-target').value = settings.dailyTgtPct;
    document.getElementById('set-compound').value = settings.compoundPct;
    document.getElementById('set-rr').value = settings.rr;
    document.getElementById('set-auto-lock').checked = settings.autoLock;
    updateSettingsFeedback();
}

// --- NEW: EVENT LISTENER BINDING (Fixes Manifest V3 issue) ---
function attachListeners() {
    // Buttons
    document.getElementById('btn-win').addEventListener('click', () => handleTrade('win'));
    document.getElementById('btn-loss').addEventListener('click', () => handleTrade('loss'));
    document.getElementById('btn-undo').addEventListener('click', undoTrade);
    document.getElementById('btn-redo').addEventListener('click', redoTrade);
    document.getElementById('btn-reset').addEventListener('click', resetApp);
    
    // Page Navigation
    document.getElementById('go-to-settings').addEventListener('click', () => togglePage('settings-page'));
    document.getElementById('go-to-help').addEventListener('click', () => togglePage('help-page'));
    document.getElementById('btn-settings-done').addEventListener('click', tryCloseSettings);
    document.getElementById('btn-help-back').addEventListener('click', () => togglePage('main-page'));

    // Account Switcher Navigation
    document.getElementById('btn-prev-acct').addEventListener('click', prevAccount);
    document.getElementById('btn-next-acct').addEventListener('click', nextAccount);
    document.getElementById('btn-add-account').addEventListener('click', createNewAccount);
    const editBtn = document.getElementById('btn-edit-account');
    if (editBtn) editBtn.addEventListener('click', editCurrentAccount);
    const delBtn = document.getElementById('btn-del-account');
    if (delBtn) delBtn.addEventListener('click', deleteCurrentAccount);
    
    document.getElementById('settings-account-select').addEventListener('change', (e) => switchAccount(e.target.value));

    // Tabs
    document.getElementById('tab-hist').addEventListener('click', () => switchTab('hist'));
    document.getElementById('tab-win').addEventListener('click', () => switchTab('win'));
    document.getElementById('tab-loss').addEventListener('click', () => switchTab('loss'));

    // Trigger Growth Page
    document.getElementById('stat-bal').parentElement.addEventListener('click', () => {
        calculateGlobalStats();
        renderGrowthPage();
        togglePage('growth-page');
    });

    document.getElementById('btn-growth-back').addEventListener('click', () => {
        togglePage('main-page');
    });

    // Settings Input Real-time Feedback
    ['set-balance', 'set-daily-risk', 'set-daily-target', 'set-compound', 'set-rr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateSettingsFeedback);
    });
    const autoLockEl = document.getElementById('set-auto-lock');
    if (autoLockEl) autoLockEl.addEventListener('change', updateSettingsFeedback);
}

// --- LOGIC ---
function recalculateState() {
    currentPnL = 0; currentStage = 0;
    
    const getRisk = (pnl) => {
        const bal = settings.balance + pnl;
        const dRisk = bal * (settings.dailyRiskPct / 100);
        return dRisk * (settings.compoundPct / 100);
    };

    currentRisk = getRisk(0);

    session.trades.forEach(t => {
        currentPnL += t.pnl;
        currentRisk = getRisk(currentPnL);
        
        if (t.type === 'win') {
            currentStage++;
        } else {
            currentStage--;
        }
    });
}

function handleTrade(type) {
    const manual = document.getElementById('manual-pnl').value;
    let pnl = (type === 'win') ? (manual ? Math.abs(parseFloat(manual)) : (currentRisk * settings.rr)) : (manual ? -Math.abs(parseFloat(manual)) : -currentRisk);
    
    // Track risk at time of trade for accurate RR calculation in analytics
    const riskAtTime = currentRisk;

    session.trades.push({ pnl, type, riskAtTime, time: getFormattedTime() });
    undoneSessionTrades = []; // Clear redo stack on new trade
    document.getElementById('manual-pnl').value = '';
    saveAndRefresh();
}

function undoTrade() { 
    if (session.trades.length > 0) { 
        undoneSessionTrades.push(session.trades.pop()); 
        saveAndRefresh(); 
    } 
}

function redoTrade() {
    if (undoneSessionTrades.length > 0) {
        session.trades.push(undoneSessionTrades.pop());
        saveAndRefresh();
    }
}

function toggleLockDay() {
    session.isLocked = !session.isLocked;
    saveAndRefresh();
}

function checkMidnightRollover() {
    const today = getFormattedDate();
    let updated = false;
    
    Object.values(accounts).forEach(acc => {
        if (acc.session.date && acc.session.date !== today) {
            if (acc.session.trades && acc.session.trades.length > 0) {
                const dayPnL = acc.session.trades.reduce((s, t) => s + t.pnl, 0);
                acc.historyLog.unshift({ 
                    date: acc.session.date, 
                    startBal: acc.settings.balance, 
                    endBal: acc.settings.balance + dayPnL, 
                    trades: [...acc.session.trades] 
                });
                acc.settings.balance += dayPnL;
            }
            acc.session = { trades: [], date: today, isLocked: false };
            updated = true;
        }
    });
    
    if (updated) {
        localStorage.setItem('cap_accounts', JSON.stringify(accounts));
        settings = accounts[activeAccountId].settings;
        session = accounts[activeAccountId].session;
        historyLog = accounts[activeAccountId].historyLog;
        undoneSessionTrades = [];
        loadSettingsToUI();
        recalculateState();
        updateUI();
    }
}

function updateUI() {
    recalculateState();

    const drUsd = settings.balance * (settings.dailyRiskPct / 100);
    const dtUsd = settings.balance * (settings.dailyTgtPct / 100);
    const poolRemaining = drUsd + currentPnL;

    // 1. Logic for Limits
    const targetHit = currentPnL >= dtUsd;
    const lossLimitHit = currentRisk < 1.0 || poolRemaining <= 1.0;
    
    const shouldLockTarget = settings.autoLock && targetHit;
    const shouldLockLoss = settings.autoLock && lossLimitHit;

    // 2. Update Stats
    try {
        const nameEl = document.getElementById('current-account-name');
        if (nameEl) nameEl.textContent = accounts[activeAccountId].name;
        
        document.getElementById('stat-bal').innerText = `$${Math.round(settings.balance + currentPnL)}`;
        document.getElementById('stat-tgt').innerText = `$${Math.round(dtUsd)}`;
        document.getElementById('stat-stop').innerText = `-$${Math.round(drUsd)}`;
        document.getElementById('stat-risk').innerText = `$${currentRisk.toFixed(2)}`;
        document.getElementById('stat-pnl').innerText = `$${(currentRisk * settings.rr).toFixed(2)}`;
        document.getElementById('stat-pool').innerText = `$${Math.max(0, poolRemaining).toFixed(1)}`;

        const bn = document.getElementById('status-note');
        if (bn) {
            if (session.isLocked) {
                updateCountdownDisplay(bn);
            } else if (targetHit) {
                const gainPct = ((currentPnL / dtUsd) * 100).toFixed(0);
                bn.innerText = `🏆 TARGET REACHED: ${gainPct}% ($${currentPnL.toFixed(0)} / $${dtUsd.toFixed(0)})`;
                bn.style.color = "var(--success)";
                bn.style.opacity = "1";
            } else if (lossLimitHit) {
                const lossValue = Math.abs(currentPnL).toFixed(0);
                bn.innerText = `🛑 LOSS LIMIT HIT: ($${lossValue} / $${drUsd.toFixed(0)})`;
                bn.style.color = "var(--danger)";
                bn.style.opacity = "1";
            } else if (currentRisk < 0.01 && currentStage === 0) {
                bn.innerText = "Setup your settings to begin calculating risk.";
                bn.style.color = "var(--text)";
                bn.style.opacity = "0.7";
            } else {
                const progressPct = ((currentPnL / settings.balance) * 100).toFixed(1);
                const prefix = currentPnL >= 0 ? "Up" : "Down";
                bn.innerText = `${prefix} by ${Math.abs(progressPct)}% ($${currentPnL.toFixed(1)})`;
                bn.style.color = currentPnL >= 0 ? "var(--success)" : "var(--danger)";
                bn.style.opacity = "0.8";
            }
        }
    } catch(e) {}

    // 3. DISABLE BUTTONS IF LOCKED
    const winBtn = document.getElementById('btn-win');
    const lossBtn = document.getElementById('btn-loss');
    if (winBtn) winBtn.disabled = session.isLocked || shouldLockTarget || shouldLockLoss;
    if (lossBtn) lossBtn.disabled = session.isLocked || shouldLockTarget || shouldLockLoss;

    const btnNewDay = document.getElementById('new-day-btn');
    if (session.isLocked) {
        btnNewDay.innerText = "🔒 RESUME TRADING";
        btnNewDay.style.background = "#475569"; // Grey
        btnNewDay.disabled = false;
        btnNewDay.onclick = toggleLockDay;
    } else {
        btnNewDay.innerText = "🔒 LOCK DAY";
        btnNewDay.style.background = "var(--primary)";
        btnNewDay.disabled = false;
        btnNewDay.onclick = toggleLockDay;
    }

    updateChart(dtUsd, drUsd);
    switchTab(currentTab);
}

function updateCountdownDisplay(element) {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const diff = tomorrow - now; // milliseconds until midnight

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    element.innerText = `⏳ Next Session in: ${hours}h ${minutes}m ${seconds}s`;
    element.style.color = "var(--primary)";
    element.style.opacity = "1";
}

// Ensure the UI refreshes every second to update the countdown
setInterval(() => {
    checkMidnightRollover();
    const bn = document.getElementById('status-note');
    if (bn && session.isLocked) {
        updateCountdownDisplay(bn);
    }
}, 1000);

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
    const container = document.getElementById('data-container');
    container.innerHTML = '';
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');

    if (t === 'hist') {
        if (openHistoryIds.size === 0) {
            // Keep empty if user closed all, or optionally open 'current'
        }

        const sessionPnL = session.trades.reduce((s, tr) => s + tr.pnl, 0);
        const isCurrentActive = openHistoryIds.has('current') ? 'active' : '';

        const startBal = settings.balance;
        const endBal = startBal + sessionPnL;
        const sessionPct = startBal > 0 ? ((sessionPnL / startBal) * 100).toFixed(1) : 0;
        const sessionHtml = `
        <div class="history-item">
            <div class="history-day-header" onclick="toggleHistoryDay('current')">
                <span>Today</span>
                <span style="color: ${sessionPnL >= 0 ? 'var(--success)' : 'var(--danger)'}; font-size: 0.9em;">
                    ${sessionPnL >= 0 ? '+$' : '-$'}${Math.abs(sessionPnL).toFixed(1)} | $${Math.round(startBal)} ➔ $${Math.round(endBal)} | ${sessionPnL >= 0 ? '+' : ''}${sessionPct}%
                </span>
            </div>
            <div id="hist-current" class="history-day-content ${isCurrentActive}">
                <table>
                    <thead><tr><th>Gain %</th><th>Type</th><th>PnL</th></tr></thead>
                    <tbody>
                        ${session.trades.length > 0 ? [...session.trades].reverse().map(tr => `<tr><td style="color:${tr.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">${tr.pnl >= 0 ? '+' : ''}${((tr.pnl / startBal) * 100).toFixed(2)}%</td><td>${tr.type.toUpperCase()}</td><td style="color:${tr.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:bold">$${tr.pnl.toFixed(2)}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center; padding:20px; color:#64748b; font-style:italic;">No trades logged yet</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`;
        container.innerHTML += sessionHtml;

        historyLog.forEach((day, index) => {
            const netPnL = day.endBal - day.startBal;
            const dayPct = day.startBal > 0 ? ((netPnL / day.startBal) * 100).toFixed(1) : 0;
            const isActive = openHistoryIds.has(index) ? 'active' : '';
            const dayHtml = `
            <div class="history-item">
                <div class="history-day-header" onclick="toggleHistoryDay(${index})">
                    <span>${day.date}</span>
                    <span style="color: ${netPnL >= 0 ? 'var(--success)' : 'var(--danger)'}; font-size: 0.9em;">
                        ${netPnL >= 0 ? '+$' : '-$'}${Math.abs(netPnL).toFixed(1)} | $${Math.round(day.startBal)} ➔ $${Math.round(day.endBal)} | ${netPnL >= 0 ? '+' : ''}${dayPct}%
                    </span>
                </div>
                <div id="hist-${index}" class="history-day-content ${isActive}">
                    <table>
                        <thead><tr><th>Gain %</th><th>Type</th><th>PnL</th></tr></thead>
                        <tbody>
                            ${[...day.trades].reverse().map(tr => `<tr><td style="color:${tr.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">${tr.pnl >= 0 ? '+' : ''}${((tr.pnl / day.startBal) * 100).toFixed(2)}%</td><td>${tr.type.toUpperCase()}</td><td style="color:${tr.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:bold">$${tr.pnl.toFixed(2)}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
            container.innerHTML += dayHtml;
        });

    } else if (t === 'win') {
        let r = currentRisk, p = currentPnL, rows = '';
        for (let i = 1; i <= 8; i++) {
            let pr = r * settings.rr; p += pr;
            let st = currentStage + i;
            let stStr = st > 0 ? `+${st}` : `${st}`;
            rows += `<tr><td>${stStr}</td><td>$${r.toFixed(1)}</td><td style="color:var(--success)">+$${pr.toFixed(1)}</td><td>$${p.toFixed(1)}</td></tr>`;
            
            let nextBal = settings.balance + p;
            let nextDRisk = nextBal * (settings.dailyRiskPct / 100);
            r = nextDRisk * (settings.compoundPct / 100);
        }
        container.innerHTML = `
        <div class="history-item">
            <div class="history-day-header" style="cursor:default;">
                <span>Win Streak Map</span>
                <span style="color: var(--success); font-size: 0.7rem;">PROJECTION</span>
            </div>
            <div class="history-day-content active">
                <table><thead><tr><th>Stage</th><th>Risk</th><th>Reward</th><th>Total PnL</th></tr></thead><tbody>${rows}</tbody></table>
            </div>
        </div>`;

    } else {
        let p = currentPnL, rows = '';
        let r = currentRisk;
        for (let i = 1; i <= 8; i++) {
            let st = currentStage - i;
            let stStr = st > 0 ? `+${st}` : `${st}`;
            let pr = r * settings.rr;
            rows += `<tr><td>${stStr}</td><td>$${r.toFixed(1)}</td><td style="color:var(--success)">+$${pr.toFixed(1)}</td><td>$${p.toFixed(1)}</td></tr>`;
            
            p -= r;
            let nextBal = settings.balance + p;
            let nextDRisk = nextBal * (settings.dailyRiskPct / 100);
            r = nextDRisk * (settings.compoundPct / 100);
        }
        container.innerHTML = `
        <div class="history-item">
            <div class="history-day-header" style="cursor:default;">
                <span>Losing Streak Map</span>
                <span style="color: var(--danger); font-size: 0.7rem;">SURVIVABILITY</span>
            </div>
            <div class="history-day-content active">
                <table><thead><tr><th>Stage</th><th>Risk</th><th>Reward</th><th>Total PnL</th></tr></thead><tbody>${rows}</tbody></table>
            </div>
        </div>`;
    }
}

function updateSettingsFeedback() {
    let isValid = true;
    const b = parseFloat(document.getElementById('set-balance').value) || 0;
    const dr = parseFloat(document.getElementById('set-daily-risk').value) || 0;
    const dt = parseFloat(document.getElementById('set-daily-target').value) || 0;
    const c = parseFloat(document.getElementById('set-compound').value) || 0;
    const r = parseFloat(document.getElementById('set-rr').value) || 0;

    const setFb = (id, msg, type) => {
        const el = document.getElementById(id);
        el.innerText = msg; 
        el.className = 'setting-feedback ' + (type === 'error' ? 'feedback-error' : 'feedback-info');
        if (type === 'error') isValid = false;
    };

    if (b <= 0) setFb('fb-balance', 'Your account balance must be > 0.', 'error'); 
    else setFb('fb-balance', `Your account balance is $${b.toFixed(2)}`, 'info');

    if (r <= 0) setFb('fb-rr', 'Reward to risk ratio must be > 0.', 'error'); 
    else setFb('fb-rr', `You are expecting to win ${r.toFixed(1)}X of risk taken on each trade.`, 'info');

    if (dr <= 0 || dr > 100) setFb('fb-daily-risk', 'Daily risk limit must be > 0% and <= 100%.', 'error');
    else setFb('fb-daily-risk', `You want to risk overall maximum ${dr}% ($${(b * (dr/100)).toFixed(2)}) of your account balance in one day.`, 'info');

    if (dt <= 0) setFb('fb-daily-target', 'Daily target must be > 0%.', 'error');
    else setFb('fb-daily-target', `${dt > 100 ? '⚠️ ' : ''}You want to make ${dt}% ($${(b * (dt/100)).toFixed(2)}) profit of your account balance.`, 'info');

    if (c < 0) setFb('fb-compound', 'Compound risk must be >= 0%.', 'error'); 
    else setFb('fb-compound', `${c > 100 ? '⚠️ ' : ''}You want to risk ${c}% of the daily risk limit on each trade.`, 'info');

    const autoLock = document.getElementById('set-auto-lock').checked;
    if (autoLock) setFb('fb-auto-lock', 'Buttons will automatically lock when limits are hit.', 'info');
    else setFb('fb-auto-lock', 'Buttons will remain manually unlocked at all times.', 'warn');

    settingsValid = isValid;
    document.getElementById('btn-settings-done').disabled = !isValid;
}

function togglePage(p) { if(p === 'main-page') saveSettings(); document.querySelectorAll('.page').forEach(el => { el.style.display = ''; el.classList.remove('active'); }); document.getElementById(p).classList.add('active'); }
function tryCloseSettings() { if (settingsValid) togglePage('main-page'); }
function saveSettings() { 
    settings = { balance: parseFloat(document.getElementById('set-balance').value), dailyRiskPct: parseFloat(document.getElementById('set-daily-risk').value), dailyTgtPct: parseFloat(document.getElementById('set-daily-target').value), compoundPct: parseFloat(document.getElementById('set-compound').value), rr: parseFloat(document.getElementById('set-rr').value), autoLock: document.getElementById('set-auto-lock').checked };
    accounts[activeAccountId].settings = settings;
    saveAndRefresh(); 
}
function saveAndRefresh() { 
    accounts[activeAccountId].session = session;
    accounts[activeAccountId].historyLog = historyLog;
    localStorage.setItem('cap_accounts', JSON.stringify(accounts));
    updateUI(); 
}
function resetApp() { 
    if(confirm("Clear data for the current account?")) { 
        session = { trades: [], date: getFormattedDate(), isLocked: false };
        historyLog = [];
        saveAndRefresh();
        location.reload(); 
    } 
}

// --- ACCOUNT MANAGEMENT ---
function getSortedAccounts() {
    return Object.values(accounts).sort((a,b) => a.id.localeCompare(b.id));
}

function switchAccount(id) {
    if (!accounts[id]) return;
    activeAccountId = id;
    localStorage.setItem('cap_active_account', id);
    
    settings = accounts[id].settings;
    if (settings.autoLock === undefined) settings.autoLock = true;
    session = accounts[id].session;
    historyLog = accounts[id].historyLog;
    
    currentRisk = 0; currentStage = 0; currentPnL = 0;
    openHistoryIds = new Set(['current']);
    undoneSessionTrades = [];
    
    checkMidnightRollover();
    loadSettingsToUI();
    recalculateState();
    updateUI();
    populateSettingsAccountDropdown();
}

function nextAccount() {
    const list = getSortedAccounts();
    const idx = list.findIndex(a => a.id === activeAccountId);
    if (idx < list.length - 1) switchAccount(list[idx + 1].id);
    else switchAccount(list[0].id);
}

function prevAccount() {
    const list = getSortedAccounts();
    const idx = list.findIndex(a => a.id === activeAccountId);
    if (idx > 0) switchAccount(list[idx - 1].id);
    else switchAccount(list[list.length - 1].id);
}

function createNewAccount() {
    const name = prompt("Enter new account name:");
    if (!name || name.trim() === '') return;
    const id = 'acct_' + Date.now();
    accounts[id] = {
        id: id,
        name: name.trim(),
        settings: { balance: 7000, dailyRiskPct: 0.5, dailyTgtPct: 2.0, compoundPct: 33, rr: 5.0, autoLock: true },
        session: { trades: [], date: getFormattedDate(), isLocked: false },
        historyLog: []
    };
    localStorage.setItem('cap_accounts', JSON.stringify(accounts));
    switchAccount(id);
    populateSettingsAccountDropdown();
}

function editCurrentAccount() {
    const select = document.getElementById('settings-account-select');
    const targetId = select ? select.value : activeAccountId;
    
    if (!accounts[targetId]) return;
    const currentName = accounts[targetId].name;
    const newName = prompt("Enter new name for this account:", currentName);
    
    if (!newName || newName.trim() === '' || newName.trim() === currentName) return;
    
    accounts[targetId].name = newName.trim();
    localStorage.setItem('cap_accounts', JSON.stringify(accounts));
    populateSettingsAccountDropdown();
    updateUI(); // Refresh main dashboard account name
}

function deleteCurrentAccount() {
    const select = document.getElementById('settings-account-select');
    const targetId = select ? select.value : activeAccountId;
    
    if (Object.keys(accounts).length <= 1) {
        alert("You cannot delete your only account! Create a new one first.");
        return;
    }
    
    if (!accounts[targetId]) return;
    
    if (confirm(`Are you sure you want to permanently delete "${accounts[targetId].name}"? This cannot be undone.`)) {
        delete accounts[targetId];
        localStorage.setItem('cap_accounts', JSON.stringify(accounts));
        
        // If they deleted the active account, switch to the first available
        if (activeAccountId === targetId) {
            switchAccount(Object.keys(accounts)[0]);
        } else {
            populateSettingsAccountDropdown();
        }
    }
}

function populateSettingsAccountDropdown() {
    const select = document.getElementById('settings-account-select');
    if (!select) return;
    select.innerHTML = '';
    getSortedAccounts().forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = acc.name;
        if (acc.id === activeAccountId) opt.selected = true;
        select.appendChild(opt);
    });
}

// --- ACCOUNT ANALYTICS ---
function renderGrowthPage() {
    renderMainGrowthChart();
    renderDailyAccordion();
    renderCalendar();
}

function calculateGlobalStats() {
    let totalWins = 0, totalTrades = 0, grossProfit = 0, grossLoss = 0, totalRR = 0;
    if (historyLog.length === 0 && session.trades.length === 0) return;

    const allDays = [...historyLog];
    allDays.push({ trades: session.trades });

    allDays.forEach(day => {
        if (!day.trades) return;
        day.trades.forEach(t => {
            totalTrades++;
            if (t.type === 'win') {
                totalWins++;
                grossProfit += t.pnl;
                totalRR += t.riskAtTime ? (t.pnl / t.riskAtTime) : 0;
            } else {
                grossLoss += Math.abs(t.pnl);
            }
        });
    });

    const winRate = totalTrades > 0 ? (totalWins / totalTrades * 100) : 0;
    const pf = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 100 : 0);
    const avgRR = totalWins > 0 ? (totalRR / totalWins) : 0;
    const netPnL = grossProfit - grossLoss;

    document.getElementById('stat-win-rate').innerText = `${winRate.toFixed(0)}%`;
    document.getElementById('stat-pf').innerText = pf.toFixed(2);
    document.getElementById('stat-avg-rr').innerText = `${avgRR.toFixed(1)}R`;
    document.getElementById('stat-total-pnl').innerText = `$${Math.round(netPnL)}`;
    document.getElementById('stat-expect').innerText = `$${totalTrades > 0 ? (netPnL / totalTrades).toFixed(1) : 0}`;

    renderWinRateChart(totalWins, totalTrades - totalWins);
}

function renderWinRateChart(wins, losses) {
    const ctx = document.getElementById('winRateChart').getContext('2d');
    if (window.winRateChartInstance) window.winRateChartInstance.destroy();

    window.winRateChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Wins', 'Losses'],
            datasets: [{ data: [wins, losses], backgroundColor: ['#22c55e', '#ef4444'], borderWidth: 0, hoverOffset: 4 }]
        },
        options: {
            cutout: '80%', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const month = viewDate.getMonth(), year = viewDate.getFullYear();
    document.getElementById('calendar-month-year').innerText = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const d = document.createElement('div'); d.className = 'cal-day empty'; grid.appendChild(d);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const d = document.createElement('div'); d.className = 'cal-day'; d.innerHTML = `<span>${i}</span>`;
        const dateStr = `${i} ${viewDate.toLocaleString('default', { month: 'short' })} ${year}`;
        const dayData = historyLog.find(h => h.date === dateStr);

        if (dayData) {
            const pnl = dayData.endBal - dayData.startBal;
            d.classList.add(pnl >= 0 ? 'profit' : 'loss');
            d.innerHTML += `<b>${pnl >= 0 ? '+' : ''}${Math.round(pnl)}</b>`;
            d.onclick = () => openDayDetail(dayData);
        }
        grid.appendChild(d);
    }
}

function changeMonth(dir) {
    viewDate.setMonth(viewDate.getMonth() + dir);
    renderCalendar();
}

function openDayDetail(day) {
    document.getElementById('detail-date').innerText = day.date;
    const pnl = day.endBal - day.startBal;
    const wins = day.trades.filter(t => t.type === 'win').length;

    document.getElementById('detail-pnl').innerText = `$${pnl.toFixed(2)}`;
    document.getElementById('detail-pnl').style.color = pnl >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('detail-trades').innerText = day.trades.length;
    document.getElementById('detail-winrate').innerText = `${((wins / day.trades.length) * 100).toFixed(0)}%`;

    const body = document.getElementById('detail-table-body');
    body.innerHTML = day.trades.map(t => `
        <tr>
            <td>${t.time}</td>
            <td>${t.type.toUpperCase()}</td>
            <td style="color:${t.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">$${t.pnl.toFixed(2)}</td>
            <td>${t.pnl >= 0 ? (t.riskAtTime ? (t.pnl / t.riskAtTime).toFixed(1) + 'R' : 'N/A') : '-1.0R'}</td>
        </tr>
    `).join('');

    togglePage('day-detail-page');
    renderDayDetailChart(day);
}

function renderDayDetailChart(day) {
    const ctx = document.getElementById('dayDetailChart').getContext('2d');
    let runningPnL = 0; const dataPoints = [0]; const labels = ["Start"];
    day.trades.forEach(trade => { runningPnL += trade.pnl; dataPoints.push(runningPnL); labels.push(trade.time); });

    if (window.dayDetailChartInstance) window.dayDetailChartInstance.destroy();

    window.dayDetailChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: dataPoints,
                borderColor: runningPnL >= 0 ? '#22c55e' : '#ef4444',
                backgroundColor: runningPnL >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ` PnL: $${c.parsed.y.toFixed(2)}`; } } } },
            scales: { x: { display: false }, y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', callback: function(v) { return '$' + v; } } } }
        }
    });
}

function renderMainGrowthChart() {
    const ctx = document.getElementById('growthChart').getContext('2d');
    let currentRunningBal = settings.balance; const initialStartingBalance = settings.balance;
    const equityPoints = [initialStartingBalance]; const labels = ["Start"];

    [...historyLog].reverse().forEach(day => {
        day.trades.forEach(trade => { currentRunningBal += trade.pnl; equityPoints.push(currentRunningBal); labels.push(trade.time); });
    });
    session.trades.forEach(trade => { currentRunningBal += trade.pnl; equityPoints.push(currentRunningBal); labels.push(trade.time); });

    const totalPoints = equityPoints.length;
    let pointRadius = 3; if (totalPoints > 50) pointRadius = 1.5; if (totalPoints > 100) pointRadius = 0;

    if (window.growthChartInstance) window.growthChartInstance.destroy();
    window.growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Equity Curve', data: equityPoints, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.05)', fill: true, tension: 0.2, pointRadius: pointRadius, pointHoverRadius: 5, borderWidth: 2 },
                { label: 'Starting Balance', data: new Array(equityPoints.length).fill(initialStartingBalance), borderColor: 'rgba(148, 163, 184, 0.4)', borderDash: [5, 5], borderWidth: 1, pointRadius: 0, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: '#1e293b', titleColor: '#94a3b8', bodyColor: '#f8fafc', borderColor: '#334155', borderWidth: 1, displayColors: false, callbacks: { label: (c) => ` $${c.parsed.y.toFixed(2)}` } } },
            scales: { x: { display: false }, y: { grid: { color: 'rgba(51, 65, 85, 0.5)' }, ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => '$' + Math.round(v) } } }
        }
    });
}

function renderDailyAccordion() {
    const container = document.getElementById('daily-log-container');
    container.innerHTML = '';
    historyLog.forEach((day, index) => {
        const netPnL = day.endBal - day.startBal;
        const color = netPnL >= 0 ? 'var(--success)' : 'var(--danger)';
        const dayDiv = document.createElement('div');
        dayDiv.className = 'history-item';
        dayDiv.innerHTML = `
            <div class="history-day-header" onclick="toggleDayDetails(${index})">
                <span>${day.date}</span>
                <span style="color: ${color};">${netPnL >= 0 ? '+' : ''}$${netPnL.toFixed(2)}</span>
            </div>
            <div id="details-${index}" class="history-day-content">
                <div class="mini-chart-box" style="height:120px;"><canvas id="mini-chart-${index}"></canvas></div>
                <table>
                    <thead><tr><th>Time</th><th>Type</th><th>PnL</th><th>RR</th></tr></thead>
                    <tbody>
                        ${day.trades.map(t => `
                            <tr>
                                <td>${t.time}</td>
                                <td>${t.type.toUpperCase()}</td>
                                <td style="color: ${t.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">$${t.pnl.toFixed(2)}</td>
                                <td>${t.pnl >= 0 ? (t.riskAtTime ? (t.pnl / t.riskAtTime).toFixed(1) + 'R' : 'N/A') : '-1.0R'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(dayDiv);
    });
}

window.toggleDayDetails = function (index) {
    const el = document.getElementById(`details-${index}`);
    const isActive = el.classList.contains('active');
    
    if (!isActive) { 
        el.classList.add('active'); 
        renderMiniChart(index); 
    } else {
        el.classList.remove('active');
    }
};

function renderMiniChart(index) {
    const day = historyLog[index];
    const ctx = document.getElementById(`mini-chart-${index}`).getContext('2d');
    let roll = 0; const pts = [0]; day.trades.forEach(t => { roll += t.pnl; pts.push(roll); });
    new Chart(ctx, { type: 'line', data: { labels: pts.map((_, i) => i), datasets: [{ data: pts, borderColor: '#94a3b8', tension: 0.2, pointRadius: 2, fill: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } } });
}

init();