const map = L.map('map').setView([-6.2, 106.8], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const state = {
  compareMode: false,
  comparePoints: [],
  markers: [],
  history: []
};

const el = (id) => document.getElementById(id);

const tutorialSteps = [
  "1) Klik peta untuk memilih lokasi analisis.\n2) Ubah nilai input di panel kiri sesuai kondisi yang ingin diuji.",
  "3) Tekan Predict from Manual Input untuk menghitung Flood Risk Index dari input tersebut.\n4) Lihat hasilnya di card Flood Risk Result dan Selected Location.",
  "5) Aktifkan Compare Locations untuk membandingkan dua titik di peta.\n6) Pakai Scenario Analysis untuk uji perubahan rainfall, urban expansion, atau drainage."
];
let tutorialIndex = 0;

function renderTutorial() {
  const step = tutorialSteps[tutorialIndex] || tutorialSteps[0];
  el('tutorialText').innerText = step;
}

function openTutorial() {
  tutorialIndex = 0;
  renderTutorial();
  el('tutorialModal').classList.add('show');
}
function closeTutorial() {
  el('tutorialModal').classList.remove('show');
}
function nextTutorial() {
  tutorialIndex = Math.min(tutorialSteps.length - 1, tutorialIndex + 1);
  renderTutorial();
}


function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function fmt2(n) {
  return round2(n).toFixed(2);
}
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function normalize(x) {
  return clamp01(Number(x || 0) / 100);
}
function riskLabel(score) {
  if (score >= 0.6) return 'High';
  if (score >= 0.3) return 'Medium';
  return 'Low';
}
function riskColor(score) {
  if (score >= 0.6) return '#e4554d';
  if (score >= 0.3) return '#f5a524';
  return '#9acd32';
}

function calculateFRI(rain, elev, build, veg, river) {
  const R = normalize(rain);
  const E = 1 - normalize(elev);
  const B = normalize(build);
  const V = 1 - normalize(veg);
  const D = 1 - normalize(river);
  return clamp01((0.30 * R) + (0.25 * E) + (0.20 * B) + (0.15 * V) + (0.10 * D));
}

function currentInputs() {
  return {
    rain: Number(el('rain').value || 0),
    elev: Number(el('elev').value || 0),
    density: Number(el('density').value || 0),
    veg: Number(el('veg').value || 0),
    river: Number(el('river').value || 0),
    drain: Number(el('drain').value || 0),
  };
}

function updateSidebarInputs() {
  const i = currentInputs();
  el('rainVal').innerText = fmt2(normalize(i.rain));
  el('elevVal').innerText = fmt2(normalize(i.elev));
  el('densityVal').innerText = fmt2(normalize(i.density));
  el('vegVal').innerText = fmt2(normalize(i.veg));
  el('riverVal').innerText = fmt2(normalize(i.river));
  el('drainVal').innerText = fmt2(normalize(i.drain));

  el('rainNorm').innerText = `${i.rain}`;
  el('elevNorm').innerText = `${i.elev}`;
  el('densityNorm').innerText = `${i.density}`;
  el('vegNorm').innerText = `${i.veg}`;
  el('riverNorm').innerText = `${i.river}`;
  el('drainNorm').innerText = `${i.drain}`;
}

function updateResult(score) {
  const label = riskLabel(score);
  const pct = round2(score * 100);

  el('scoreGauge').innerText = fmt2(score);
  el('riskLabel').innerText = `Flood Risk: ${label}`;
  el('riskLabel').className = `risk ${label.toLowerCase()}`;
  el('riskBar').style.width = `${pct}%`;
  el('riskPct').innerText = `${fmt2(score * 100)}%`;
  el('confidenceVal').innerText = `${fmt2((0.5 + score * 0.5) * 100)}%`;
  el('timestampVal').innerText = new Date().toLocaleString();
}

function updateLocationBox({name, score, elevation, rainfall, density, vegetation, river, risk, confidence}) {
  el('locName').innerText = name ?? '—';
  el('locScore').innerText = score !== undefined ? fmt2(score) : '—';
  el('locConf').innerText = confidence !== undefined ? `${fmt2(confidence * 100)}%` : '—';
  el('locElev').innerText = elevation !== undefined ? `${round2(elevation)} m` : '—';
  el('locRain').innerText = rainfall !== undefined ? `${round2(rainfall)} mm` : '—';
  el('locBuild').innerText = density !== undefined ? `${round2(density)} %` : '—';
  el('locVeg').innerText = vegetation !== undefined ? `${round2(vegetation)} %` : '—';
  el('locRiver').innerText = river !== undefined ? `${round2(river)} m` : '—';
  el('locRisk').innerText = risk ?? '—';
}

function renderHistory() {
  const html = state.history.map(item => {
    const cls = item.risk === 'High' ? 'red' : item.risk === 'Medium' ? 'orange' : 'green';
    return `<li class="history-item"><span class="dot ${cls}"></span><span>${item.name}</span><strong>${fmt2(item.score)}</strong></li>`;
  }).join('');
  el('historyList').innerHTML = html || '<div class="subtle">No history yet. Click the map to start.</div>';
}

function addHistory(name, score) {
  state.history.unshift({ name, score: round2(score), risk: riskLabel(score) });
  state.history = state.history.slice(0, 8);
  renderHistory();
}

function showModal(title, text) {
  el('modalHead').innerText = title;
  el('modalBody').innerText = text;
  el('modal').classList.add('show');
}
function closeModal() {
  el('modal').classList.remove('show');
}
const modalCloseEl = el('modalClose');
if (modalCloseEl) modalCloseEl.addEventListener('click', closeModal);
const modalEl = el('modal');
if (modalEl) modalEl.addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

const btnTutorial = el('btnTutorial');
if (btnTutorial) btnTutorial.addEventListener('click', openTutorial);
const tutorialOk = el('tutorialOk');
if (tutorialOk) tutorialOk.addEventListener('click', closeTutorial);
const tutorialNext = el('tutorialNext');
if (tutorialNext) tutorialNext.addEventListener('click', nextTutorial);
const tutorialModalEl = el('tutorialModal');
if (tutorialModalEl) tutorialModalEl.addEventListener('click', (e) => {
  if (e.target.id === 'tutorialModal') closeTutorial();
});

let chart;
function initChart() {
  const ctx = el('chart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Rain', 'Elev', 'Build', 'Veg', 'River'],
      datasets: [{
        label: 'Normalized Input',
        data: [0.8, 0.8, 0.85, 0.15, 0.35],
        backgroundColor: ['#4d91ff','#4d91ff','#4d91ff','#4d91ff','#4d91ff']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 1 }
      }
    }
  });
}
function updateChartFromInputs() {
  if (!chart) return;
  const i = currentInputs();
  chart.data.datasets[0].data = [
    normalize(i.rain),
    normalize(i.elev),
    normalize(i.density),
    normalize(i.veg),
    normalize(i.river)
  ];
  chart.update();
}

function setCompareMode(on) {
  state.compareMode = !!on;
  el('btnCompare').textContent = on ? 'Compare Mode: ON' : 'Compare Locations';
}
el('btnCompare').addEventListener('click', () => setCompareMode(!state.compareMode));

function clearMarkers() {
  state.markers.forEach(m => map.removeLayer(m));
  state.markers = [];
  state.comparePoints = [];
}

function simulateRain() {
  const i = currentInputs();
  el('rain').value = Math.min(100, i.rain + 20);
  updateSidebarInputs();
  updateChartFromInputs();
  manualPredict(1);
}
const btnSimRain = document.getElementById('btnSimRain');
if (btnSimRain) btnSimRain.addEventListener('click', simulateRain);
const btnSimRain2 = document.getElementById('btnSimRain2');
if (btnSimRain2) btnSimRain2.addEventListener('click', simulateRain);

const btnManualPredict = document.getElementById('btnManualPredict');
if (btnManualPredict) btnManualPredict.addEventListener('click', () => manualPredict(1));

const btnResetInputs = document.getElementById('btnResetInputs');
if (btnResetInputs) btnResetInputs.addEventListener('click', () => {
  el('rain').value = 80;
  el('elev').value = 80;
  el('density').value = 85;
  el('veg').value = 15;
  el('river').value = 35;
  el('drain').value = 55;
  updateSidebarInputs();
  updateChartFromInputs();
  updateResult(0.77);
  updateLocationBox({
    name: 'Kelapa Gading',
    score: 0.77,
    elevation: 13,
    rainfall: 88.4,
    density: 85,
    vegetation: 15,
    river: 200,
    risk: 'High',
    confidence: 0.82
  });
});

function manualPredict(extraRainMultiplier = 1) {
  const i = currentInputs();
  const rain = clamp01((i.rain * extraRainMultiplier) / 100) * 100;
  const score = calculateFRI(rain, i.elev, i.density, i.veg, i.river);
  const label = riskLabel(score);
  updateSidebarInputs();
  updateChartFromInputs();
  updateResult(score);
  updateLocationBox({
    name: 'Manual Input',
    score,
    elevation: i.elev,
    rainfall: rain,
    density: i.density,
    vegetation: i.veg,
    river: i.river,
    risk: label,
    confidence: score
  });
  addHistory('Manual Input', score);
  showModal('Manual Prediction', `Status: ${label}\nFRI: ${fmt2(score)}\nRisk: ${Math.round(score*100)}%`);
}
window.manualPredict = manualPredict;

const btnUrban = document.getElementById('btnUrban');
if (btnUrban) btnUrban.addEventListener('click', () => {
  const i = currentInputs();
  el('density').value = Math.min(100, i.density + 20);
  el('veg').value = Math.max(0, i.veg - 15);
  updateSidebarInputs();
  updateChartFromInputs();
  const score = calculateFRI(i.rain, i.elev, Math.min(100, i.density + 20), Math.max(0, i.veg - 15), i.river);
  updateResult(score);
  showModal('Urban Expansion Scenario', `Building density increased and vegetation reduced.\nFRI: ${fmt2(score)}`);
});
const btnDrainage = document.getElementById('btnDrainage');
if (btnDrainage) btnDrainage.addEventListener('click', () => {
  const i = currentInputs();
  el('drain').value = Math.min(100, i.drain + 20);
  updateSidebarInputs();
  updateChartFromInputs();
  showModal('Increase Drainage Capacity', 'Drainage capacity increased.\nMitigation effect prepared for report / scenario use.');
});

const btnReport = document.getElementById('btnReport');
if (btnReport) btnReport.addEventListener('click', () => {
  showModal('Download Report (PDF)', 'PDF export is a placeholder in this ZIP.\nYou can connect it to a print-to-PDF flow next.');
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.tab;

    if (mode === 'compare') {
      setCompareMode(true);
      showModal('Location Comparison', 'Compare mode is ON.\nClick two map locations to compare their FRI values.');
    } else if (mode === 'scenario') {
      showModal('Scenario Analysis', 'Scenario Analysis is active.\nUse the left-panel buttons to simulate rainfall, urban expansion, or drainage improvements.');
    } else if (mode === 'history') {
      showModal('History', 'This section shows analyzed locations and FRI values.\nYour previous clicks are also stored in the history panel.');
    }
  });
});

const selectedCardEl = document.getElementById('selectedCard');
if (selectedCardEl) selectedCardEl.addEventListener('click', () => {
  showModal('Selected Location', 'This card updates when you click a map point or run manual input.\nIt shows score, confidence, and variable values.');
});
const historyCardEl = document.getElementById('historyCard');
if (historyCardEl) historyCardEl.addEventListener('click', () => {
  showModal('History', 'History panel is clickable.\nIt keeps the latest analyzed locations in the sidebar.');
});
const scenarioCardEl = document.getElementById('scenarioCard');
if (scenarioCardEl) scenarioCardEl.addEventListener('click', () => {
  showModal('Scenario Analysis', 'Use the buttons to test scenarios.\nThis card is clickable so the section feels interactive.');
});

['rain','elev','density','veg','river','drain'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    updateSidebarInputs();
    updateChartFromInputs();
  });
});

function generateRandomData(latlng) {
  const seed = Math.abs(Math.floor((latlng.lat * 1000) + (latlng.lng * 1000)));
  return {
    rain: (seed * 37) % 101,
    elev: (seed * 53) % 101,
    density: (seed * 71) % 101,
    veg: (seed * 29) % 101,
    river: (seed * 11) % 101,
    drain: (seed * 13) % 101,
  };
}
function pointName(latlng) {
  return `Point ${Math.abs((latlng.lat + latlng.lng).toFixed(2))}`;
}

function placeLocation(latlng, data, name) {
  const score = calculateFRI(data.rain, data.elev, data.density, data.veg, data.river);
  const label = riskLabel(score);
  const color = riskColor(score);
  const confidence = 0.55 + (score * 0.45);

  const marker = L.circle(latlng, {
    color,
    fillColor: color,
    fillOpacity: 0.18,
    radius: 520
  }).addTo(map);

  marker.bindPopup(`
    <div style="min-width:230px">
      <div style="font-weight:900;font-size:16px;margin-bottom:6px">${name}</div>
      <div><b>Score:</b> ${fmt2(score)}</div>
      <div><b>Category:</b> ${label}</div>
      <div><b>Confidence:</b> ${fmt2(confidence * 100)}%</div>
      <hr style="border:none;border-top:1px solid #e5e9f2;margin:8px 0">
      <div>Elevation: ${round2(data.elev)} m</div>
      <div>Rainfall: ${round2(data.rain)} mm</div>
      <div>Building Density: ${round2(data.density)} %</div>
      <div>Vegetation: ${round2(data.veg)} %</div>
      <div>Distance to River: ${round2(data.river)} m</div>
    </div>
  `).openPopup();

  state.markers.push(marker);
  state.comparePoints.push({ name, score, latlng, data });

  updateResult(score);
  updateLocationBox({
    name, score,
    elevation: data.elev,
    rainfall: data.rain,
    density: data.density,
    vegetation: data.veg,
    river: data.river,
    risk: label,
    confidence
  });
  addHistory(name, score);

  if (!state.compareMode && state.comparePoints.length > 2) {
    clearMarkers();
    return;
  }

  if (state.comparePoints.length === 2) {
    const a = state.comparePoints[0];
    const b = state.comparePoints[1];
    const winner = a.score > b.score ? `${a.name} is more vulnerable` :
                   b.score > a.score ? `${b.name} is more vulnerable` :
                   'Both locations are equal';
    showModal(
      'Location Comparison',
      `Location A: ${fmt2(a.score)}\nLocation B: ${fmt2(b.score)}\n\n${winner}`
    );
    state.compareMode = false;
    setCompareMode(false);
  }
}

map.on('click', (e) => {
  if (!state.compareMode) {
    clearMarkers();
  }
  const data = generateRandomData(e.latlng);
  const name = pointName(e.latlng);
  placeLocation(e.latlng, data, name);
});

// init
updateSidebarInputs();
updateChartFromInputs();
updateResult(0.77);
updateLocationBox({
  name: 'Kelapa Gading',
  score: 0.77,
  elevation: 13,
  rainfall: 88.4,
  density: 85,
  vegetation: 15,
  river: 200,
  risk: 'High',
  confidence: 0.82
});
renderHistory();
initChart();

