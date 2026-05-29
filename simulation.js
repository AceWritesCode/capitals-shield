let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize empty chart on load
    const ctx = document.getElementById('simChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: [''], datasets: [{ data: [], label: 'Equity' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false }, min: 0, max: 1000 },
                x: { grid: { display: false }, border: { display: false } }
            }
        }
    });

    // Wrap number inputs in custom stepper
    const numberInputs = document.querySelectorAll('.controls-panel input[type="number"]:not(.range-input-box)');
    numberInputs.forEach(input => {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-stepper';
        input.parentNode.insertBefore(wrapper, input);
        
        if (input.id === 'sim-growth') {
            const prefixBtn = document.createElement('button');
            prefixBtn.type = 'button';
            prefixBtn.id = 'growth-type-toggle';
            prefixBtn.className = 'stepper-prefix-btn';
            prefixBtn.innerText = 'x';
            prefixBtn.onclick = toggleGrowthType;
            wrapper.appendChild(prefixBtn);
        }
        
        wrapper.appendChild(input);
        input.classList.add('stepper-input');
        
        const controls = document.createElement('div');
        controls.className = 'stepper-controls';
        
        const upBtn = document.createElement('button');
        upBtn.className = 'stepper-btn stepper-up';
        upBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>';
        
        const downBtn = document.createElement('button');
        downBtn.className = 'stepper-btn stepper-down';
        downBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
        
        controls.appendChild(upBtn);
        controls.appendChild(downBtn);
        wrapper.appendChild(controls);
        
        upBtn.addEventListener('click', () => {
            const step = parseFloat(input.getAttribute('step')) || 1;
            let current = parseFloat(input.value) || 0;
            input.value = (current + step).toFixed(step < 1 ? 1 : 0);
            if (input.onchange) input.onchange();
            if (input.oninput) input.oninput();
        });
        
        downBtn.addEventListener('click', () => {
            const step = parseFloat(input.getAttribute('step')) || 1;
            const min = parseFloat(input.getAttribute('min'));
            let current = parseFloat(input.value) || 0;
            let next = current - step;
            if (!isNaN(min) && next < min) next = min;
            input.value = next.toFixed(step < 1 ? 1 : 0);
            if (input.onchange) input.onchange();
            if (input.oninput) input.oninput();
        });
    });
});

let growthType = 'multiple'; // 'multiple' or 'currency'
function toggleGrowthType() {
    const btn = document.getElementById('growth-type-toggle');
    const input = document.getElementById('sim-growth');
    const lbl = document.getElementById('lbl-growth');
    const startBal = parseFloat(document.getElementById('sim-bal').value) || 1000;
    
    let currentVal = parseFloat(input.value) || 0;

    if (growthType === 'multiple') {
        growthType = 'currency';
        btn.innerText = '$';
        lbl.innerText = 'Growth Target (Money)';
        let moneyVal = startBal + (startBal * currentVal);
        input.value = moneyVal.toFixed(0);
        input.step = 100;
    } else {
        growthType = 'multiple';
        btn.innerText = 'x';
        lbl.innerText = 'Growth Target (Multiple)';
        let multVal = (currentVal - startBal) / startBal;
        if (multVal < 0) multVal = 0.1;
        input.value = multVal.toFixed(2);
        input.step = 0.1;
    }
}

function toggleRRUI() {
    const type = document.getElementById('sim-rr-type').value;
    document.getElementById('rr-fixed-ui').style.display = type === 'fixed' ? 'flex' : 'none';
    document.getElementById('rr-dynamic-ui').style.display = type === 'dynamic' ? 'flex' : 'none';
    updateSliderTrack();
}

function toggleTradesUI() {
    const type = document.getElementById('sim-trades-type').value;
    document.getElementById('lbl-trades-count').innerText = type === 'fixed' ? 'Trades / Day' : 'Trades / Day (Max)';
}

function syncInput(source) {
    const minSlider = document.getElementById('sim-slider-min');
    const maxSlider = document.getElementById('sim-slider-max');
    const minInput = document.getElementById('sim-rr-min');
    const maxInput = document.getElementById('sim-rr-max');

    let minVal = parseFloat(minSlider.value);
    let maxVal = parseFloat(maxSlider.value);

    if (minVal > maxVal) {
        if (source === 'min') minSlider.value = maxVal;
        else maxSlider.value = minVal;
    }
    
    minInput.value = minSlider.value;
    maxInput.value = maxSlider.value;
    updateSliderTrack();
}

function syncSlider(source) {
    const minSlider = document.getElementById('sim-slider-min');
    const maxSlider = document.getElementById('sim-slider-max');
    const minInput = document.getElementById('sim-rr-min');
    const maxInput = document.getElementById('sim-rr-max');

    let minVal = parseFloat(minInput.value);
    let maxVal = parseFloat(maxInput.value);

    // Enforce limits 0 to 20
    if (minVal < 0) { minVal = 0; minInput.value = 0; }
    if (maxVal > 20) { maxVal = 20; maxInput.value = 20; }

    if (minVal > maxVal) {
        if (source === 'min') minInput.value = maxVal;
        else maxInput.value = minVal;
    }

    minSlider.value = minInput.value;
    maxSlider.value = maxInput.value;
    updateSliderTrack();
}

function updateSliderTrack() {
    const minSlider = document.getElementById('sim-slider-min');
    const maxSlider = document.getElementById('sim-slider-max');
    const track = document.getElementById('slider-track');
    
    const min = parseFloat(minSlider.min);
    const max = parseFloat(minSlider.max);
    
    const percent1 = ((minSlider.value - min) / (max - min)) * 100;
    const percent2 = ((maxSlider.value - min) / (max - min)) * 100;
    
    track.style.left = percent1 + "%";
    track.style.width = (percent2 - percent1) + "%";
}

// Initial UI setup
toggleRRUI();
toggleTradesUI();
updateSliderTrack();


// --- Monte Carlo Simulation Engine ---

function runSimulation() {
    document.getElementById('sim-container').classList.remove('empty-state');
    
    // 1. Gather Inputs
    const startBal = parseFloat(document.getElementById('sim-bal').value);
    const dailyRiskPct = parseFloat(document.getElementById('sim-dr').value);
    const rrType = document.getElementById('sim-rr-type').value;
    const rrFixed = parseFloat(document.getElementById('sim-rr-fixed').value);
    const rrMin = parseFloat(document.getElementById('sim-rr-min').value);
    const rrMax = parseFloat(document.getElementById('sim-rr-max').value);
    const compoundPct = parseFloat(document.getElementById('sim-cr').value);
    const maxRiskCap = 50000;
    
    const targetToggle = document.getElementById('sim-target-toggle').checked;
    const dailyTargetPct = parseFloat(document.getElementById('sim-target').value);
    
    const growthInput = parseFloat(document.getElementById('sim-growth').value);
    const winRate = parseFloat(document.getElementById('sim-wr').value);
    
    const tradesType = document.getElementById('sim-trades-type').value;
    const tradesCount = parseInt(document.getElementById('sim-trades-count').value);

    // Validation
    if (startBal <= 0) return alert('Starting balance must be positive.');
    if (growthInput <= 0) return alert('Growth target must be positive.');

    let targetBalance = growthType === 'multiple'
        ? startBal + (startBal * growthInput)
        : growthInput;
        
    // Cap target at $1,000,000 max
    if (targetBalance > 1000000) targetBalance = 1000000;
    
    // State
    let currentBalance = startBal;
    let days = 0;
    let totalWins = 0;
    let totalTrades = 0;
    let totalRR = 0;
    
    const maxDaysLimit = 1000;
    const maxTradesLimit = 10000;
    
    const equityCurve = [startBal];
    const daysLog = [];
    
    let globalTradeIndex = 1;

    // Loop until we hit target or go broke
    while (currentBalance < targetBalance && currentBalance > 0 && days < maxDaysLimit && totalTrades < maxTradesLimit) {
        days++;
        
        const dayStartBal = currentBalance;
        const dailyRiskUsd = dayStartBal * (dailyRiskPct / 100);
        const dailyTargetUsd = dayStartBal * (dailyTargetPct / 100);
        let dailyPnL = 0;
        
        let numTrades = tradesType === 'fixed' ? tradesCount : Math.max(1, Math.floor(Math.random() * tradesCount) + 1);
        
        const tradesForDay = [];
        
        for (let i = 0; i < numTrades; i++) {
            totalTrades++;
            
            // Calculate Risk (Remaining Pool * Compound%)
            let poolRemaining = dailyRiskUsd + dailyPnL;
            
            // Loss limit hit
            if (poolRemaining <= 1) break;
            
            let risk = poolRemaining * (compoundPct / 100);
            
            // Apply Max Risk Cap
            if (risk > maxRiskCap) risk = maxRiskCap;
            if (risk > currentBalance + dailyPnL) risk = currentBalance + dailyPnL; // Can't risk more than account balance

            // Roll Win/Loss with +/- 3% variance constraint
            let currentWinProb = winRate;
            if (totalTrades > 10) {
                const currentActualWr = (totalWins / totalTrades) * 100;
                const deviation = currentActualWr - winRate;
                // If it strays more than 3%, forcefully rubber-band it back
                if (deviation > 3) currentWinProb = winRate - 25;
                else if (deviation < -3) currentWinProb = winRate + 25;
                else currentWinProb = winRate - (deviation * 1.5);
            }
            
            // Clamp probability bounds
            currentWinProb = Math.max(0, Math.min(100, currentWinProb));
            
            const isWin = (Math.random() * 100) < currentWinProb;
            let rr = 1.0;
            if (isWin) {
                if (rrType === 'fixed') rr = rrFixed;
                else {
                    // Random float between min and max rounded to 2 decimals
                    rr = (Math.random() * (rrMax - rrMin)) + rrMin;
                    rr = Math.round(rr * 100) / 100;
                }
                totalRR += rr;
                totalWins++;
            }
            
            const pnl = isWin ? (risk * rr) : -risk;
            dailyPnL += pnl;
            
            tradesForDay.push({
                index: globalTradeIndex++,
                outcome: isWin ? 'WIN' : 'LOSS',
                rr: isWin ? rr : -1,
                pnl: pnl,
                riskAtTime: risk
            });
            
            // Break if daily target hit and toggle is ON
            if (targetToggle && dailyPnL >= dailyTargetUsd) {
                break;
            }
        }
        
        currentBalance += dailyPnL;
        equityCurve.push(currentBalance);
        
        daysLog.push({
            day: days,
            startBal: dayStartBal,
            endBal: currentBalance,
            net: dailyPnL,
            trades: tradesForDay
        });
        
        // Stop if bankrupt
        if (currentBalance <= 0) {
            currentBalance = 0;
            equityCurve[equityCurve.length - 1] = 0;
            break;
        }
    }
    
    renderResults(startBal, currentBalance, targetBalance, totalWins, totalTrades, totalRR, days, equityCurve, daysLog);
}

function renderResults(startBal, currentBalance, targetBalance, totalWins, totalTrades, totalRR, days, equityCurve, daysLog) {
    // 1. Update Cards
    const actualWr = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : 0;
    const avgRr = totalWins > 0 ? (totalRR / totalWins).toFixed(2) : 0.0;
    const growthPct = (((currentBalance - startBal) / startBal) * 100).toFixed(1);
    const multiple = (currentBalance / startBal).toFixed(2);
    
    document.getElementById('res-start').innerText = `$${Math.round(startBal).toLocaleString()}`;
    
    const resFinal = document.getElementById('res-final');
    resFinal.innerText = `$${Math.round(currentBalance).toLocaleString()} (${multiple}x)`;
    resFinal.style.color = currentBalance >= startBal ? 'var(--success)' : 'var(--danger)';
    
    document.getElementById('res-wr').innerText = `${actualWr}%`;
    document.getElementById('res-rr').innerText = `${avgRr}R`;
    
    const resGrowth = document.getElementById('res-growth');
    resGrowth.innerText = `${growthPct}%`;
    resGrowth.style.color = currentBalance >= startBal ? 'var(--success)' : 'var(--danger)';
    
    document.getElementById('res-days').innerText = `${totalTrades} / ${days}`;
    
    // Hide placeholder
    const placeholder = document.getElementById('chart-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    // 2. Render Chart
    const ctx = document.getElementById('simChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: equityCurve.map((_, i) => i === 0 ? 'Start' : `Trade ${i}`),
            datasets: [{
                label: 'Equity',
                data: equityCurve,
                borderColor: currentBalance >= startBal ? '#3b82f6' : '#ef4444',
                backgroundColor: currentBalance >= startBal ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { grid: { color: 'rgba(51, 65, 85, 0.5)' }, ticks: { color: '#94a3b8' } } }
        }
    });
    
    // 3. Render Tables
    const feed = document.getElementById('history-feed');
    feed.innerHTML = '';
    
    // Render in reverse (newest day at top, or day 1 at top? Let's do Day 1 at top as it's a simulation sequence)
    daysLog.forEach(day => {
        const netColor = day.net >= 0 ? 'var(--success)' : 'var(--danger)';
        const sign = day.net >= 0 ? '+' : '';
        
        let rows = '';
        if (day.trades.length === 0) {
            rows = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Loss Limit Hit / No Trades</td></tr>`;
        } else {
            day.trades.forEach(t => {
                const trColor = t.pnl >= 0 ? 'var(--success)' : 'var(--danger)';
                const trSign = t.pnl >= 0 ? '+$' : '-$';
                const rrText = t.outcome === 'WIN' ? `${t.rr.toFixed(2)}R` : '-1.0R';
                rows += `
                <tr>
                    <td>#${t.index}</td>
                    <td>${t.outcome}</td>
                    <td>${rrText}</td>
                    <td style="color:${trColor}; font-weight: 600;">${trSign}${Math.abs(t.pnl).toFixed(2)}</td>
                </tr>`;
            });
        }
        
        const card = document.createElement('div');
        card.className = 'day-table-card';
        card.innerHTML = `
            <div class="day-header">
                <span>Day ${day.day}</span>
                <span class="day-stats">Net: <span style="color: ${netColor}">${sign}$${day.net.toFixed(2)}</span></span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Trade #</th>
                        <th>Outcome</th>
                        <th>RR</th>
                        <th>PnL</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
        feed.appendChild(card);
    });
}
