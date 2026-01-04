let settings = JSON.parse(localStorage.getItem('cap_settings')) || {
    balance: 7000, maxRiskPct: 1.0, dailyRiskPct: 0.5, dailyTgtPct: 2.0, compoundPct: 33, rr: 5.0
};

let session = JSON.parse(localStorage.getItem('cap_session')) || { trades: [] };
let historyLog = JSON.parse(localStorage.getItem('cap_history')) || [];

let currentRisk = 0, currentStage = 0, currentPnL = 0, chart, currentTab = 'hist', settingsValid = true;
let viewDate = new Date();
let openHistoryId = 'current';
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
    // Trigger Growth Page
    document.getElementById('stat-bal').parentElement.addEventListener('click', () => {
        calculateGlobalStats();
        renderGrowthPage();
        togglePage('growth-page');
    });

    document.getElementById('btn-growth-back').addEventListener('click', () => {
        togglePage('main-page');
    });
}

function renderGrowthPage() {
    renderMainGrowthChart();
    renderDailyAccordion();
    renderCalendar();
}

function calculateGlobalStats() {
    let totalWins = 0;
    let totalTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalRR = 0;
    
    // Safety check: if history is empty and session is empty, stop here
    if (historyLog.length === 0 && session.trades.length === 0) return;

    // Combine History and Current Session for All-Time Stats
    const allDays = [...historyLog];
    
    // Add current session to the calculation so stats are live
    const currentSessionDay = {
        trades: session.trades
    };
    allDays.push(currentSessionDay);

    allDays.forEach(day => {
        if (!day.trades) return;
        day.trades.forEach(t => {
            totalTrades++;
            if (t.type === 'win') {
                totalWins++;
                grossProfit += t.pnl;
                // Use riskAtTime captured during handleTrade
                totalRR += t.riskAtTime ? (t.pnl / t.riskAtTime) : 0;
            } else {
                grossLoss += Math.abs(t.pnl);
            }
        });
    });

    // Calculations with safety fallbacks
    const winRate = totalTrades > 0 ? (totalWins / totalTrades * 100) : 0;
    const pf = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 100 : 0);
    const avgRR = totalWins > 0 ? (totalRR / totalWins) : 0;
    const netPnL = grossProfit - grossLoss;

    // Update the DOM
    document.getElementById('stat-win-rate').innerText = `${winRate.toFixed(0)}%`;
    document.getElementById('stat-pf').innerText = pf.toFixed(2);
    document.getElementById('stat-avg-rr').innerText = `${avgRR.toFixed(1)}R`;
    document.getElementById('stat-total-pnl').innerText = `$${Math.round(netPnL)}`;
    document.getElementById('stat-expect').innerText = `$${totalTrades > 0 ? (netPnL / totalTrades).toFixed(1) : 0}`;

    // Update the visual Win Rate Chart
    renderWinRateChart(totalWins, totalTrades - totalWins);
}
function renderWinRateChart(wins, losses) {
    const ctx = document.getElementById('winRateChart').getContext('2d');
    
    if (window.winRateChartInstance) {
        window.winRateChartInstance.destroy();
    }

    window.winRateChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Wins', 'Losses'],
            datasets: [{
                data: [wins, losses],
                backgroundColor: ['#22c55e', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            cutout: '80%', // Makes it a thin ring
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    document.getElementById('calendar-month-year').innerText = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Fill empty start days
    for (let i = 0; i < firstDay; i++) {
        const d = document.createElement('div'); d.className = 'cal-day empty'; grid.appendChild(d);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const d = document.createElement('div');
        d.className = 'cal-day';
        d.innerHTML = `<span>${i}</span>`;

        // Find if we have data for this date
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

function openDayDetail(day) {
    document.getElementById('detail-date').innerText = day.date;
    const pnl = day.endBal - day.startBal;
    const wins = day.trades.filter(t => t.type === 'win').length;

    document.getElementById('detail-pnl').innerText = `$${pnl.toFixed(2)}`;
    document.getElementById('detail-pnl').style.color = pnl >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('detail-trades').innerText = day.trades.length;
    document.getElementById('detail-winrate').innerText = `${((wins / day.trades.length) * 100).toFixed(0)}%`;

    // Table
    const body = document.getElementById('detail-table-body');
    body.innerHTML = day.trades.map(t => `
        <tr>
            <td>${t.time}</td>
            <td>${t.type.toUpperCase()}</td>
            <td style="color:${t.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">$${t.pnl.toFixed(2)}</td>
            <td>${t.pnl >= 0 ? (t.pnl / t.riskAtTime).toFixed(1) + 'R' : '-1.0R'}</td>
        </tr>
    `).join('');

    togglePage('day-detail-page');
    renderDayDetailChart(day);
}
function renderDayDetailChart(day) {
    const ctx = document.getElementById('dayDetailChart').getContext('2d');
    
    // Calculate the running PnL path for this specific day
    let runningPnL = 0;
    const dataPoints = [0]; // Start at $0
    const labels = ["Start"];

    day.trades.forEach((trade, index) => {
        runningPnL += trade.pnl;
        dataPoints.push(runningPnL);
        labels.push(trade.time);
    });

    // Destroy previous instance to prevent "ghost" charts on hover
    if (window.dayDetailChartInstance) {
        window.dayDetailChartInstance.destroy();
    }

    window.dayDetailChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: dataPoints,
                borderColor: runningPnL >= 0 ? '#22c55e' : '#ef4444', // Green if day ended in profit, Red if loss
                backgroundColor: runningPnL >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` PnL: $${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    grid: { color: '#334155' },
                    ticks: {
                        color: '#94a3b8',
                        callback: function(value) { return '$' + value; }
                    }
                }
            }
        }
    });
}
function changeMonth(dir) {
    viewDate.setMonth(viewDate.getMonth() + dir);
    renderCalendar();
}

function renderMainGrowthChart() {
    const ctx = document.getElementById('growthChart').getContext('2d');
    
    // 1. Data Aggregation
    let currentRunningBal = settings.balance;
    const initialStartingBalance = settings.balance; // Used for breakeven line
    const equityPoints = [initialStartingBalance];
    const labels = ["Start"];

    // Process Archived History
    const chronologicalHistory = [...historyLog].reverse();
    chronologicalHistory.forEach(day => {
        day.trades.forEach(trade => {
            currentRunningBal += trade.pnl;
            equityPoints.push(currentRunningBal);
            labels.push(trade.time);
        });
    });

    // Process Live Session
    session.trades.forEach(trade => {
        currentRunningBal += trade.pnl;
        equityPoints.push(currentRunningBal);
        labels.push(trade.time);
    });

    // 2. DYNAMIC SCALING LOGIC
    // As you get more trades, we shrink the dots to keep the line clean
    const totalPoints = equityPoints.length;
    let pointRadius = 3; 
    if (totalPoints > 50) pointRadius = 1.5;
    if (totalPoints > 100) pointRadius = 0; // Hide points entirely, only show line

    if (window.growthChartInstance) window.growthChartInstance.destroy();
    
    window.growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Equity Curve',
                    data: equityPoints,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: pointRadius, // Dynamic adjustment
                    pointHoverRadius: 5,
                    borderWidth: 2
                },
                {
                    label: 'Starting Balance',
                    data: new Array(equityPoints.length).fill(initialStartingBalance),
                    borderColor: 'rgba(148, 163, 184, 0.4)', // Faded gray
                    borderDash: [5, 5], // Dashed line
                    borderWidth: 1,
                    pointRadius: 0, // Never show dots for the breakeven line
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: '#1e293b',
                    titleColor: '#94a3b8',
                    bodyColor: '#f8fafc',
                    borderColor: '#334155',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        label: (context) => ` $${context.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: { 
                x: { display: false }, 
                y: { 
                    grid: { color: 'rgba(51, 65, 85, 0.5)' },
                    ticks: { 
                        color: '#94a3b8',
                        font: { size: 10 },
                        callback: (value) => '$' + Math.round(value)
                    }
                } 
            }
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
        dayDiv.className = 'day-row';
        dayDiv.innerHTML = `
            <div class="day-header" onclick="toggleDayDetails(${index})">
                <span>${day.date}</span>
                <span style="color: ${color}; font-weight: bold;">${netPnL >= 0 ? '+' : ''}$${netPnL.toFixed(2)}</span>
            </div>
            <div id="details-${index}" class="day-details">
                <div class="mini-chart-box"><canvas id="mini-chart-${index}"></canvas></div>
                <table>
                    <thead><tr><th>Time</th><th>Type</th><th>PnL</th><th>RR</th></tr></thead>
                    <tbody>
                        ${day.trades.map(t => {
            const rrSecured = t.riskAtTime ? (t.pnl / t.riskAtTime).toFixed(1) : "N/A";
            return `
                                <tr>
                                    <td>${t.time}</td>
                                    <td>${t.type.toUpperCase()}</td>
                                    <td style="color: ${t.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">$${t.pnl.toFixed(2)}</td>
                                    <td>${t.pnl >= 0 ? rrSecured + 'R' : '-1.0R'}</td>
                                </tr>
                            `;
        }).join('')}
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

    // Close others
    document.querySelectorAll('.day-details').forEach(d => d.classList.remove('active'));

    if (!isActive) {
        el.classList.add('active');
        renderMiniChart(index);
    }
};

window.toggleHistoryDay = function(id) {
    const el = document.getElementById(`hist-${id}`);
    const isAlreadyOpen = el?.classList.contains('active');
    
    // 1. Close all open accordion items
    document.querySelectorAll('.history-day-content').forEach(content => {
        content.classList.remove('active');
    });

    // 2. Logic: If the clicked item was NOT already open, open it.
    // If it WAS already open (user is closing it), default back to 'current'.
    if (!isAlreadyOpen) {
        el.classList.add('active');
        openHistoryId = id; 
    } else {
        // Fallback: If closing an item, auto-toggle the current session
        const currentEl = document.getElementById('hist-current');
        if (currentEl) currentEl.classList.add('active');
        openHistoryId = 'current'; 
    }
};
function renderMiniChart(index) {
    const day = historyLog[index];
    const ctx = document.getElementById(`mini-chart-${index}`).getContext('2d');

    let roll = 0;
    const pts = [0];
    day.trades.forEach(t => { roll += t.pnl; pts.push(roll); });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: pts.map((_, i) => i),
            datasets: [{
                data: pts,
                borderColor: '#94a3b8',
                tension: 0.2,
                pointRadius: 2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: true, grid: { display: false } } }
        }
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
        else if (v > limit) setFb(id, `⚠️ High: $${(b * v / 100).toFixed(0)}`, 'warn');
        else setFb(id, `= $${(b * v / 100).toFixed(2)}`, 'info');
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
    const drUsd = settings.balance * (settings.dailyRiskPct / 100);
    const dtUsd = settings.balance * (settings.dailyTgtPct / 100);
    const poolRemaining = drUsd + currentPnL;

    const targetHit = currentPnL >= dtUsd;
    const lossLimitHit = currentRisk < 1.0 || poolRemaining <= 1.0;

    if (lossLimitHit) return;
    if (targetHit && type === 'win') return;

    const manual = document.getElementById('manual-pnl').value;
    const riskUsedForThisTrade = currentRisk; // CAPTURE CURRENT RISK

    let pnl = (type === 'win')
        ? (manual ? Math.abs(parseFloat(manual)) : (riskUsedForThisTrade * settings.rr))
        : (manual ? -Math.abs(parseFloat(manual)) : -riskUsedForThisTrade);

    // Save riskAtTime into the trade object
    session.trades.push({
        pnl,
        type,
        time: getFormattedTime(),
        riskAtTime: riskUsedForThisTrade
    });

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

// --- UPDATED UI FUNCTION ---
function updateUI() {
    recalculateState();

    const drUsd = settings.balance * (settings.dailyRiskPct / 100);
    const dtUsd = settings.balance * (settings.dailyTgtPct / 100);
    const poolRemaining = drUsd + currentPnL;

    // 1. Logic for Limits
    const targetHit = currentPnL >= dtUsd;
    const lossLimitHit = currentRisk < 1.0 || poolRemaining <= 1.0;

    // Check if the last archived date matches today's date
    const todayStr = getFormattedDate();
    const isDayLocked = historyLog.length > 0 && historyLog[0].date === todayStr;

    // 2. Update Stats
    try {
        document.getElementById('stat-bal').innerText = `$${Math.round(settings.balance + currentPnL)}`;
        document.getElementById('stat-tgt').innerText = `$${Math.round(dtUsd)}`;
        document.getElementById('stat-stop').innerText = `-$${Math.round(drUsd)}`;
        document.getElementById('stat-risk').innerText = `$${currentRisk.toFixed(2)}`;
        document.getElementById('stat-pnl').innerText = `$${currentPnL.toFixed(1)}`;
        document.getElementById('stat-pool').innerText = `$${Math.max(0, poolRemaining).toFixed(1)}`;

        const bn = document.getElementById('status-note');
        if (bn) {
            if (isDayLocked) {
                // LOCKOUT STATE: Show Countdown
                updateCountdownDisplay(bn);
            } else if (targetHit) {
                const gainPct = ((currentPnL / dtUsd) * 100).toFixed(0);
                bn.innerText = `🏆 TARGET REACHED: ${gainPct}% ($${currentPnL.toFixed(0)} / $${dtUsd.toFixed(0)})`;
                bn.style.color = "var(--success)";
            } else if (lossLimitHit) {
                const lossValue = Math.abs(currentPnL).toFixed(0);
                bn.innerText = `🛑 LOSS LIMIT HIT: ($${lossValue} / $${drUsd.toFixed(0)})`;
                bn.style.color = "var(--danger)";
            } else {
                const progressPct = ((currentPnL / settings.balance) * 100).toFixed(1);
                const prefix = currentPnL >= 0 ? "Up" : "Down";
                bn.innerText = `${prefix} by ${Math.abs(progressPct)}% ($${currentPnL.toFixed(1)})`;
                bn.style.color = currentPnL >= 0 ? "var(--success)" : "var(--danger)";
                bn.style.opacity = "0.8";
            }
        }
    } catch (e) { console.warn("UI Update Error:", e); }

    // 3. DISABLE BUTTONS IF LOCKED
    const winBtn = document.getElementById('btn-win');
    const lossBtn = document.getElementById('btn-loss');
    if (winBtn) winBtn.disabled = (targetHit || lossLimitHit || isDayLocked);
    if (lossBtn) lossBtn.disabled = (lossLimitHit || isDayLocked);

    document.getElementById('new-day-btn').disabled = session.trades.length === 0 || isDayLocked;

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
    const bn = document.getElementById('status-note');
    const todayStr = getFormattedDate();
    const isDayLocked = historyLog.length > 0 && historyLog[0].date === todayStr;

    if (bn && isDayLocked) {
        updateCountdownDisplay(bn);
    }
}, 1000);
function updateChart(tgt, stop) {
    const ctx = document.getElementById('equityChart').getContext('2d');
    let r = 0; const pts = [0]; session.trades.forEach(t => { r += t.pnl; pts.push(r); });
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'line', data: { labels: pts.map((_, i) => i), datasets: [{ data: pts, borderColor: '#3b82f6', tension: 0.2, pointRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { grid: { color: '#334155' } } },
            plugins: {
                legend: { display: false }, annotation: {
                    annotations: {
                        t: { type: 'line', yMin: tgt, yMax: tgt, borderColor: '#22c55e', borderDash: [5, 5] },
                        s: { type: 'line', yMin: -stop, yMax: -stop, borderColor: '#ef4444', borderDash: [5, 5] }
                    }
                }
            }
        }
    });
}

function switchTab(t) {
    currentTab = t;
    const h = document.getElementById('table-head');
    const b = document.getElementById('table-body');
    const maxR = settings.balance * (settings.maxRiskPct / 100);

    // Clear both areas to prevent "ghost" headers or missing data
    if (h) h.innerHTML = '';
    b.innerHTML = '';

    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');

    if (t === 'hist') {
        h.innerHTML = '';
        b.innerHTML = '';

        if (!openHistoryId) {
        openHistoryId = 'current';
    }

        // --- 1. CURRENT SESSION ---
        const sessionPnL = session.trades.reduce((s, t) => s + t.pnl, 0);
        const sessionColor = sessionPnL >= 0 ? 'var(--success)' : 'var(--danger)';

        // Check if this should be open
        const isCurrentActive = openHistoryId === 'current' ? 'active' : '';

        const sessionDiv = document.createElement('div');
        sessionDiv.className = 'history-item';
        sessionDiv.innerHTML = `
        <div class="history-day-header" onclick="toggleHistoryDay('current')">
            <span>Current Session</span>
            <span style="color: ${sessionColor}">$${sessionPnL.toFixed(2)}</span>
        </div>
        <div id="hist-current" class="history-day-content ${isCurrentActive}">
            <table>
                <thead><tr><th>Time</th><th>Type</th><th>PnL</th><th>RR</th></tr></thead>
                <tbody>
                    ${session.trades.length > 0 ? [...session.trades].reverse().map(tr => {
            const rr = tr.riskAtTime ? (tr.pnl / tr.riskAtTime).toFixed(1) : "N/A";
            return `<tr>
                            <td>${tr.time}</td>
                            <td>${tr.type.toUpperCase()}</td>
                            <td style="color:${tr.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:bold">$${tr.pnl.toFixed(2)}</td>
                            <td>${tr.pnl >= 0 ? rr + 'R' : '-1.0R'}</td>
                        </tr>`;
        }).join('') : '<tr><td colspan="4" style="text-align:center; opacity:0.5; padding:20px;">No trades yet today</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
        b.appendChild(sessionDiv);

        // --- 2. ARCHIVED DAYS ---
        historyLog.forEach((day, index) => {
            const netPnL = day.endBal - day.startBal;
            const isThisActive = openHistoryId === index ? 'active' : '';

            const dayDiv = document.createElement('div');
            dayDiv.className = 'history-item';
            dayDiv.innerHTML = `
            <div class="history-day-header" onclick="toggleHistoryDay(${index})">
                <span>${day.date}</span>
                <span style="color: ${netPnL >= 0 ? 'var(--success)' : 'var(--danger)'}">$${netPnL.toFixed(2)}</span>
            </div>
            <div id="hist-${index}" class="history-day-content ${isThisActive}">
                <table>
                    <thead><tr><th>Time</th><th>Type</th><th>PnL</th><th>RR</th></tr></thead>
                    <tbody>
                        ${[...day.trades].reverse().map(tr => {
                const rr = tr.riskAtTime ? (tr.pnl / tr.riskAtTime).toFixed(1) : "N/A";
                return `<tr>
                                <td>${tr.time}</td>
                                <td>${tr.type.toUpperCase()}</td>
                                <td style="color:${tr.pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">$${tr.pnl.toFixed(2)}</td>
                                <td>${tr.pnl >= 0 ? rr + 'R' : '-1.0R'}</td>
                            </tr>`;
            }).join('')}
                    </tbody>
                </table>
            </div>
        `;
            b.appendChild(dayDiv);
        });
    } else if (t === 'win') {
        // --- 3. WIN MAP (ACCORDION STYLE) ---
        const winDiv = document.createElement('div');
        winDiv.className = 'history-item';

        let r = currentRisk, p = currentPnL;
        let rows = '';
        for (let i = 1; i <= 8; i++) {
            let pr = r * settings.rr; p += pr;
            rows += `<tr><td>+${currentStage + i}</td><td>$${r.toFixed(1)}</td><td>$${p.toFixed(1)}</td></tr>`;
            r = Math.min(r + (pr * (settings.compoundPct / 100)), maxR);
        }

        winDiv.innerHTML = `
            <div class="history-day-header">
                <span>Win Streak Map</span>
                <span style="color: var(--success); font-size: 0.7rem;">PROJECTION</span>
            </div>
            <div class="history-day-content active">
                <table>
                    <thead><tr><th>Stage</th><th>Risk</th><th>Total PnL</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        b.appendChild(winDiv);

    } else {
        // --- 4. LOSS MAP (ACCORDION STYLE) ---
        const lossDiv = document.createElement('div');
        lossDiv.className = 'history-item';

        let p = currentPnL, po = (settings.balance * (settings.dailyRiskPct / 100)) + currentPnL;
        let rows = '';
        for (let i = 1; i <= 8; i++) {
            let r = Math.min(po * (settings.compoundPct / 100), maxR);
            po -= r; p -= r;
            rows += `<tr><td>-${Math.abs(currentStage - i)}</td><td>$${r.toFixed(1)}</td><td>$${p.toFixed(1)}</td></tr>`;
        }

        lossDiv.innerHTML = `
            <div class="history-day-header">
                <span>Losing Streak Map</span>
                <span style="color: var(--danger); font-size: 0.7rem;">SURVIVABILITY</span>
            </div>
            <div class="history-day-content active">
                <table>
                    <thead><tr><th>Stage</th><th>Risk</th><th>Total PnL</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        b.appendChild(lossDiv);
    }
}
function startNewDay() {
    const todayStr = getFormattedDate();
    if (historyLog.length > 0 && historyLog[0].date === todayStr) {
        alert("Daily limit reached. Please wait for the next day to start.");
        return;
    }

    const dayPnL = session.trades.reduce((s, t) => s + t.pnl, 0);
    historyLog.unshift({
        date: todayStr,
        startBal: settings.balance,
        endBal: settings.balance + dayPnL,
        trades: [...session.trades]
    });

    settings.balance += dayPnL;
    session = { trades: [] };

    localStorage.setItem('cap_settings', JSON.stringify(settings));
    localStorage.setItem('cap_session', JSON.stringify(session));
    localStorage.setItem('cap_history', JSON.stringify(historyLog));

    loadSettingsToUI();
    updateUI();
}
function togglePage(p) { if (p === 'main-page') saveSettings(); document.querySelectorAll('.page').forEach(el => el.style.display = 'none'); document.getElementById(p).style.display = 'block'; }
function tryCloseSettings() { if (settingsValid) togglePage('main-page'); }
function saveSettings() {
    settings = { balance: parseFloat(document.getElementById('set-balance').value), maxRiskPct: parseFloat(document.getElementById('set-max-risk').value), dailyRiskPct: parseFloat(document.getElementById('set-daily-risk').value), dailyTgtPct: parseFloat(document.getElementById('set-daily-target').value), compoundPct: parseFloat(document.getElementById('set-compound').value), rr: parseFloat(document.getElementById('set-rr').value) };
    localStorage.setItem('cap_settings', JSON.stringify(settings)); saveAndRefresh();
}
function saveAndRefresh() { localStorage.setItem('cap_session', JSON.stringify(session)); localStorage.setItem('cap_history', JSON.stringify(historyLog)); updateUI(); }
function resetApp() { if (confirm("Clear ALL data?")) { localStorage.clear(); location.reload(); } }
init();
