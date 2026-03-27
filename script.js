const byId = (id) => document.getElementById(id);
const qsa = (sel) => document.querySelectorAll(sel);

const state = {
  compareMode: false,
  comparePoints: [],
  history: [],
  mapMarks: [],
  tutorialStep: 0,
  loadingTimer: null
};

let mapCanvas = null;
let ctx = null;

function round2(n){ return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function fmt2(n){ return round2(n).toFixed(2); }
function clamp01(v){ return Math.max(0, Math.min(1, v)); }
function normalize(x){ return clamp01(Number(x || 0) / 100); }

function riskLabel(score){
  if (score >= 0.6) return 'High';
  if (score >= 0.3) return 'Medium';
  return 'Low';
}
function riskColor(score){
  if (score >= 0.6) return '#e4554d';
  if (score >= 0.3) return '#f5a524';
  return '#9acd32';
}
function calculateFRI(rain, elev, build, veg, river){
  const R = normalize(rain);
  const E = 1 - normalize(elev);
  const B = normalize(build);
  const V = 1 - normalize(veg);
  const D = 1 - normalize(river);
  return clamp01((0.30 * R) + (0.25 * E) + (0.20 * B) + (0.15 * V) + (0.10 * D));
}

function currentInputs(){
  return {
    rain: Number(byId('rain').value || 0),
    elev: Number(byId('elev').value || 0),
    density: Number(byId('density').value || 0),
    veg: Number(byId('veg').value || 0),
    river: Number(byId('river').value || 0),
    drain: Number(byId('drain').value || 0),
  };
}

function setInputValues(values){
  if(values.rain !== undefined) byId('rain').value = values.rain;
  if(values.elev !== undefined) byId('elev').value = values.elev;
  if(values.density !== undefined) byId('density').value = values.density;
  if(values.veg !== undefined) byId('veg').value = values.veg;
  if(values.river !== undefined) byId('river').value = values.river;
  if(values.drain !== undefined) byId('drain').value = values.drain;
  updateSidebarInputs();
  updateChartFromInputs();
}

function updateSidebarInputs(){
  const i = currentInputs();
  byId('rainVal').innerText = fmt2(normalize(i.rain));
  byId('elevVal').innerText = fmt2(normalize(i.elev));
  byId('densityVal').innerText = fmt2(normalize(i.density));
  byId('vegVal').innerText = fmt2(normalize(i.veg));
  byId('riverVal').innerText = fmt2(normalize(i.river));
  byId('drainVal').innerText = fmt2(normalize(i.drain));

  byId('rainNorm').innerText = `${i.rain}`;
  byId('elevNorm').innerText = `${i.elev}`;
  byId('densityNorm').innerText = `${i.density}`;
  byId('vegNorm').innerText = `${i.veg}`;
  byId('riverNorm').innerText = `${i.river}`;
  byId('drainNorm').innerText = `${i.drain}`;
}

function updateResult(score){
  const label = riskLabel(score);
  const pct = round2(score * 100);
  byId('scoreGauge').innerText = fmt2(score);
  byId('riskLabel').innerText = `Flood Risk: ${label}`;
  byId('riskLabel').className = `risk ${label.toLowerCase()}`;
  byId('riskBar').style.width = `${pct}%`;
  byId('riskPct').innerText = `${fmt2(score * 100)}%`;
  byId('confidenceVal').innerText = `${fmt2((0.55 + score * 0.45) * 100)}%`;
  byId('timestampVal').innerText = new Date().toLocaleString();
}

function updateLocationBox({name, score, elevation, rainfall, density, vegetation, river, risk, confidence}){
  byId('locName').innerText = name ?? '—';
  byId('locScore').innerText = score !== undefined ? fmt2(score) : '—';
  byId('locConf').innerText = confidence !== undefined ? `${fmt2(confidence * 100)}%` : '—';
  byId('locElev').innerText = elevation !== undefined ? `${round2(elevation)} m` : '—';
  byId('locRain').innerText = rainfall !== undefined ? `${round2(rainfall)} mm` : '—';
  byId('locBuild').innerText = density !== undefined ? `${round2(density)} %` : '—';
  byId('locVeg').innerText = vegetation !== undefined ? `${round2(vegetation)} %` : '—';
  byId('locRiver').innerText = river !== undefined ? `${round2(river)} m` : '—';
  byId('locRisk').innerText = risk ?? '—';
}

function renderHistory(){
  const html = state.history.map(item => {
    const cls = item.risk === 'High' ? 'red' : item.risk === 'Medium' ? 'orange' : 'green';
    return `<li class="history-item"><span class="dot ${cls}"></span><span>${item.name}</span><strong>${fmt2(item.score)}</strong></li>`;
  }).join('');
  byId('historyList').innerHTML = html || '<div class="subtle">No history yet. Click the map to start.</div>';
}

function addHistory(name, score){
  state.history.unshift({ name, score: round2(score), risk: riskLabel(score) });
  state.history = state.history.slice(0, 8);
  renderHistory();
}

function openModal(title, text, showNext = false){
  byId('modalHead').innerText = title;
  byId('modalBody').innerText = text;
  byId('modalNext').style.display = showNext ? 'inline-block' : 'none';
  byId('modal').classList.add('show');
}
function closeModal(){ byId('modal').classList.remove('show'); }

function setLoading(on){
  if (state.loadingTimer) {
    clearTimeout(state.loadingTimer);
    state.loadingTimer = null;
  }
  byId('loading').classList.toggle('show', on);
  if (on) state.loadingTimer = setTimeout(() => byId('loading').classList.remove('show'), 650);
}

function drawMapBase(){
  if (!ctx || !mapCanvas) return;
  const w = mapCanvas.width;
  const h = mapCanvas.height;
  ctx.clearRect(0,0,w,h);

  const grd = ctx.createLinearGradient(0,0,0,h);
  grd.addColorStop(0,'#cbe3f8');
  grd.addColorStop(0.55,'#d8ecff');
  grd.addColorStop(1,'#cfe3f8');
  ctx.fillStyle = grd;
  ctx.fillRect(0,0,w,h);

  // sea
  ctx.fillStyle = 'rgba(100,170,220,.28)';
  ctx.beginPath();
  ctx.moveTo(0,h*0.07);
  ctx.quadraticCurveTo(w*0.25,h*0.00,w*0.48,h*0.11);
  ctx.quadraticCurveTo(w*0.75,h*0.24,w,h*0.10);
  ctx.lineTo(w,0); ctx.lineTo(0,0); ctx.closePath();
  ctx.fill();

  // grid
  ctx.strokeStyle = 'rgba(100,120,160,.12)';
  ctx.lineWidth = 1;
  for (let x=0;x<=w;x+=80){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for (let y=0;y<=h;y+=80){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

  // roads
  ctx.strokeStyle = 'rgba(220,110,60,.65)';
  ctx.lineWidth = Math.max(2, w/280);
  ctx.beginPath(); ctx.moveTo(w*0.18,h*0.70); ctx.lineTo(w*0.33,h*0.62); ctx.lineTo(w*0.48,h*0.58); ctx.lineTo(w*0.72,h*0.55); ctx.lineTo(w*0.90,h*0.48); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w*0.22,h*0.20); ctx.lineTo(w*0.29,h*0.42); ctx.lineTo(w*0.36,h*0.55); ctx.lineTo(w*0.40,h*0.73); ctx.stroke();

  // river
  ctx.strokeStyle = 'rgba(70,150,220,.7)';
  ctx.lineWidth = Math.max(2, w/300);
  ctx.setLineDash([8,6]);
  ctx.beginPath(); ctx.moveTo(w*0.70,h*0.04); ctx.quadraticCurveTo(w*0.62,h*0.25,w*0.66,h*0.40); ctx.quadraticCurveTo(w*0.73,h*0.55,w*0.70,h*0.78);
  ctx.stroke();
  ctx.setLineDash([]);

  // green areas
  ctx.fillStyle = 'rgba(70,160,90,.18)';
  const patches = [
    [0.16,0.63,0.10,0.08],[0.34,0.59,0.12,0.10],[0.60,0.60,0.10,0.08],[0.77,0.58,0.08,0.07],[0.22,0.34,0.06,0.05]
  ];
  patches.forEach(([x,y,ww,hh]) => ctx.fillRect(w*x,h*y,w*ww,h*hh));

  ctx.fillStyle = 'rgba(40,60,90,.85)';
  ctx.font = `bold ${Math.max(16, Math.round(w/45))}px Arial`;
  ctx.fillText('Jakarta', w*0.46, h*0.46);
  ctx.fillText('Tangerang', w*0.30, h*0.48);
  ctx.fillText('Bekasi', w*0.68, h*0.52);
  ctx.fillText('Pesisir Utara', w*0.07, h*0.17);
  ctx.fillText('Sea / Bay', w*0.07, h*0.10);
}

function resizeCanvas(){
  const parent = mapCanvas.parentElement;
  const rect = parent.getBoundingClientRect();
  mapCanvas.width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  mapCanvas.height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  mapCanvas.style.width = rect.width + 'px';
  mapCanvas.style.height = rect.height + 'px';
  ctx = mapCanvas.getContext('2d');
  ctx.setTransform(window.devicePixelRatio,0,0,window.devicePixelRatio,0,0);
  drawMapBase();
  redrawMarks();
}

function drawMarker(mark){
  const rect = mapCanvas.getBoundingClientRect();
  const x = mark.x * rect.width;
  const y = mark.y * rect.height;
  const score = mark.score;
  const color = riskColor(score);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,.70)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = 'rgba(20,30,50,.85)';
  ctx.font = 'bold 13px Arial';
  ctx.fillText(`${fmt2(score)}`, x + 22, y + 5);
  ctx.restore();
}

function redrawMarks(){
  drawMapBase();
  state.mapMarks.forEach(drawMarker);
}

function openTutorial(){
  state.tutorialStep = 0;
  openModal('Tutorial Singkat',
    '1) Klik peta untuk membuat titik analisis.\\n2) Ubah input di panel kiri lalu tekan Predict from Manual Input.\\n3) Tekan Compare Locations untuk membandingkan dua titik.\\n4) Coba Scenario Analysis untuk simulasi.',
    true
  );
  byId('modalNext').innerText = 'Next';
}
function tutorialNext(){
  if (state.tutorialStep === 0) {
    state.tutorialStep = 1;
    openModal('Tutorial — Manual Input',
      'Ubah rainfall, elevation, building density, vegetation, dan distance to river.\\n\\nLalu tekan Predict from Manual Input.\\n\\nHasil akan langsung update di result card, selected location, history, dan chart.',
      true
    );
    byId('modalNext').innerText = 'Next';
    return;
  }
  if (state.tutorialStep === 1) {
    state.tutorialStep = 2;
    openModal('Tutorial — Compare & Scenario',
      'Tekan Compare Locations untuk membandingkan dua titik di peta.\\n\\nPakai tombol Scenario di sisi kiri untuk:\\n- Simulate +20% Rainfall\\n- Urban Expansion\\n- Increase Drainage',
      true
    );
    byId('modalNext').innerText = 'Selesai';
    return;
  }
  closeModal();
}
function showLoadingAnd(fn){
  setLoading(true);
  setTimeout(() => { fn(); setLoading(false); }, 280);
}

function updateChartFromInputs(){
  const i = currentInputs();
  const vals = [
    normalize(i.rain),
    normalize(i.elev),
    normalize(i.density),
    normalize(i.veg),
    normalize(i.river)
  ];
  const bars = qsa('.bar-fill');
  const labels = qsa('.bar-value');
  if (bars.length === 5) {
    bars.forEach((b, idx) => {
      b.style.width = `${Math.round(vals[idx] * 100)}%`;
      labels[idx].innerText = fmt2(vals[idx]);
    });
  }
}

function initChart(){
  const holder = byId('chartHolder');
  holder.innerHTML = `
    <div class="bar-row"><div class="bar-label">Rain</div><div class="bar-track"><div class="bar-fill"></div></div><div class="bar-value">0.00</div></div>
    <div class="bar-row"><div class="bar-label">Elev</div><div class="bar-track"><div class="bar-fill"></div></div><div class="bar-value">0.00</div></div>
    <div class="bar-row"><div class="bar-label">Build</div><div class="bar-track"><div class="bar-fill"></div></div><div class="bar-value">0.00</div></div>
    <div class="bar-row"><div class="bar-label">Veg</div><div class="bar-track"><div class="bar-fill"></div></div><div class="bar-value">0.00</div></div>
    <div class="bar-row"><div class="bar-label">River</div><div class="bar-track"><div class="bar-fill"></div></div><div class="bar-value">0.00</div></div>
  `;
}

function setActiveSection(section){
  document.querySelectorAll('.section-content').forEach(sec => sec.classList.remove('active'));
  const sec = document.getElementById(section + 'Section');
  if (sec) sec.classList.add('active');
}

function setCompareMode(on){
  state.compareMode = !!on;
  byId('btnCompare').textContent = on ? 'Compare Mode: ON' : 'Compare Locations';
  byId('compareStatus').innerText = on ? 'Compare mode: ON' : 'Ready';
  setActiveSection('compare');
}

function clearMarks(){
  state.mapMarks = [];
  state.comparePoints = [];
  redrawMarks();
}

function pointNameFromXY(x,y){
  return `Point ${Math.round(x*100)}-${Math.round(y*100)}`;
}

function placePointFromClick(clientX, clientY){
  const rect = mapCanvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  const seed = Math.abs(Math.floor((x * 10000) + (y * 10000)));
  const data = {
    rain: (seed * 37) % 101,
    elev: (seed * 53) % 101,
    density: (seed * 71) % 101,
    veg: (seed * 29) % 101,
    river: (seed * 11) % 101,
    drain: (seed * 13) % 101,
  };

  const score = calculateFRI(data.rain, data.elev, data.density, data.veg, data.river);
  const label = riskLabel(score);
  const confidence = 0.55 + (score * 0.45);
  const name = pointNameFromXY(x,y);

  if (!state.compareMode) clearMarks();

  state.mapMarks.push({x, y, score});
  redrawMarks();

  state.comparePoints.push({ name, score, data });
  updateResult(score);
  updateLocationBox({
    name,
    score,
    elevation:data.elev,
    rainfall:data.rain,
    density:data.density,
    vegetation:data.veg,
    river:data.river,
    risk:label,
    confidence
  });
  addHistory(name, score);

  if (state.compareMode && state.comparePoints.length === 2) {
    const a = state.comparePoints[0];
    const b = state.comparePoints[1];
    const winner = a.score > b.score ? `${a.name} is more vulnerable` :
                   b.score > a.score ? `${b.name} is more vulnerable` :
                   'Both locations are equal';
    openModal('Location Comparison', `Location A: ${fmt2(a.score)}\nLocation B: ${fmt2(b.score)}\n\n${winner}`);
    state.compareMode = false;
    byId('btnCompare').textContent = 'Compare Locations';
    byId('compareStatus').innerText = 'Ready';
    setActiveSection('compare');
    state.comparePoints = [];
  }
}

function manualPredict(extraRainMultiplier = 1){
  const i = currentInputs();
  const rain = clamp01((i.rain * extraRainMultiplier) / 100) * 100;
  const score = calculateFRI(rain, i.elev, i.density, i.veg, i.river);
  const label = riskLabel(score);

  updateSidebarInputs();
  updateChartFromInputs();
  updateResult(score);
  updateLocationBox({
    name:'Manual Input',
    score,
    elevation:i.elev,
    rainfall:rain,
    density:i.density,
    vegetation:i.veg,
    river:i.river,
    risk:label,
    confidence:score
  });
  addHistory('Manual Input', score);
  openModal('Manual Prediction', `Status: ${label}\nFRI: ${fmt2(score)}\nRisk: ${Math.round(score*100)}%`);
}
window.manualPredict = manualPredict;

function bindUI(){
  byId('btnTutorial').addEventListener('click', openTutorial);
  byId('modalNext').addEventListener('click', tutorialNext);
  byId('modalClose').addEventListener('click', closeModal);
  byId('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  byId('btnSimRain').addEventListener('click', () => {
    showLoadingAnd(() => {
      const i = currentInputs();
      byId('rain').value = Math.min(100, i.rain + 20);
      updateSidebarInputs();
      updateChartFromInputs();
      manualPredict(1);
    });
  });
  byId('btnSimRain2').addEventListener('click', () => byId('btnSimRain').click());
  byId('btnCompare').addEventListener('click', () => setCompareMode(!state.compareMode));
  byId('btnPredict').addEventListener('click', () => manualPredict(1));
  byId('btnReset').addEventListener('click', () => {
    setInputValues({ rain:80, elev:80, density:85, veg:15, river:35, drain:55 });
    updateResult(0.77);
    updateLocationBox({
      name:'Kelapa Gading',
      score:0.77,
      elevation:13,
      rainfall:88.4,
      density:85,
      vegetation:15,
      river:200,
      risk:'High',
      confidence:0.82
    });
    openModal('Reset Complete', 'Inputs restored to default values.\nYou can start a new analysis now.');
  });

  byId('btnUrban').addEventListener('click', () => {
    showLoadingAnd(() => {
      const i = currentInputs();
      byId('density').value = Math.min(100, i.density + 20);
      byId('veg').value = Math.max(0, i.veg - 15);
      updateSidebarInputs();
      updateChartFromInputs();
      const score = calculateFRI(i.rain, i.elev, Math.min(100, i.density + 20), Math.max(0, i.veg - 15), i.river);
      updateResult(score);
      openModal('Urban Expansion Scenario', `Building density increased and vegetation reduced.\nFRI: ${fmt2(score)}`);
    });
  });
  byId('btnDrainage').addEventListener('click', () => {
    showLoadingAnd(() => {
      const i = currentInputs();
      byId('drain').value = Math.min(100, i.drain + 20);
      updateSidebarInputs();
      updateChartFromInputs();
      openModal('Increase Drainage Capacity', `Drainage capacity increased.\nDrainage value: ${byId('drain').value}`);
    });
  });

  byId('btnReport').addEventListener('click', () => {
    const i = currentInputs();
    const score = calculateFRI(i.rain, i.elev, i.density, i.veg, i.river);
    openModal('Report Preview', `Flood Risk AI report preview\n\nRainfall: ${i.rain}\nElevation: ${i.elev}\nBuilding Density: ${i.density}\nVegetation: ${i.veg}\nDistance to River: ${i.river}\nDrainage: ${i.drain}\nFRI: ${fmt2(score)}\nCategory: ${riskLabel(score)}`);
  });

  qsa('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const section = tab.dataset.section;
      if (section === 'compare') {
        setCompareMode(true);
        openModal('Location Comparison', 'Compare mode is ON.\nClick two map locations to compare their FRI values.');
      } else if (section === 'scenario') {
        setActiveSection('scenario');
        openModal('Scenario Analysis', 'Scenario Analysis is active.\nUse the left-panel buttons to simulate rainfall, urban expansion, or drainage improvements.');
      } else if (section === 'history') {
        setActiveSection('history');
        openModal('History', 'This section shows analyzed locations and FRI values.\nYour previous clicks are also stored in the history panel.');
      }
    });
  });

  byId('selectedCard').addEventListener('click', () => openModal('Selected Location', 'This card updates when you click a map point or run manual input.\nIt shows score, confidence, and variable values.'));
  byId('historyCard').addEventListener('click', () => { setActiveSection('history'); openModal('History', 'History panel is clickable.\nIt keeps the latest analyzed locations in the sidebar.'); });
  byId('scenarioCard').addEventListener('click', () => { setActiveSection('scenario'); openModal('Scenario Analysis', 'Use the buttons to test scenarios.\nThis card is clickable so the section feels interactive.'); });

  ['rain','elev','density','veg','river','drain'].forEach(id => {
    byId(id).addEventListener('input', () => {
      updateSidebarInputs();
      updateChartFromInputs();
    });
  });
}

function initApp(){
  mapCanvas = byId('mapCanvas');
  initChart();
  updateSidebarInputs();
  updateChartFromInputs();
  updateResult(0.77);
  updateLocationBox({
    name:'Kelapa Gading',
    score:0.77,
    elevation:13,
    rainfall:88.4,
    density:85,
    vegetation:15,
    river:200,
    risk:'High',
    confidence:0.82
  });
  renderHistory();
  setActiveSection('history');
  bindUI();
  resizeCanvas();

  mapCanvas.addEventListener('click', (e) => placePointFromClick(e.clientX, e.clientY));
  window.addEventListener('resize', resizeCanvas);

  // initial instructional popup
  if (!localStorage.getItem('flood_risk_ai_tour_seen')) {
    localStorage.setItem('flood_risk_ai_tour_seen', '1');
    setTimeout(() => openModal(
      'Tutorial Singkat',
      '1) Klik peta untuk membuat titik analisis.\n2) Ubah input di panel kiri lalu tekan Predict from Manual Input.\n3) Tekan Compare Locations untuk membandingkan dua titik.\n4) Coba Scenario Analysis untuk simulasi.',
      true
    ), 200);
    byId('modalNext').innerText = 'Next';
  }
}

document.addEventListener('DOMContentLoaded', initApp);
