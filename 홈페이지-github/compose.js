const STORE = "compose-data";

// 다장조 두 옥타브 (높은 음이 위)
const SCALE = [84, 83, 81, 79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60];
const NAMES = { 0: "도", 2: "레", 4: "미", 5: "파", 7: "솔", 9: "라", 11: "시" };
const ROWS = [
  ...SCALE.map((m) => ({ key: "n" + m, label: `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`, midi: m })),
  { key: "hihat", label: "하이햇", drum: true },
  { key: "snare", label: "스네어", drum: true },
  { key: "kick", label: "킥", drum: true },
];
const ROW_MAP = Object.fromEntries(ROWS.map((r) => [r.key, r]));

const seq = document.getElementById("seq");
const playBtn = document.getElementById("play");
const bpmInput = document.getElementById("bpm");
const bpmLabel = document.getElementById("bpm-label");
const waveSelect = document.getElementById("wave");
const stepsSelect = document.getElementById("steps");

// ---------- 저장 / 불러오기 ----------
function emptyGrid(steps) {
  const g = {};
  for (const r of ROWS) g[r.key] = Array(steps).fill(false);
  return g;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.grid) {
      for (const r of ROWS) if (!s.grid[r.key]) s.grid[r.key] = Array(s.steps).fill(false);
      return s;
    }
  } catch {}
  return { bpm: 100, wave: "triangle", steps: 16, grid: emptyGrid(16) };
}

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
}

let state = load();

// ---------- 소리 ----------
let actx = null;
const noiseCache = new WeakMap();

function ensureAudio() {
  if (!actx) actx = new AudioContext();
  if (actx.state === "suspended") actx.resume();
}

function noiseBuffer(ctx) {
  if (!noiseCache.has(ctx)) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return noiseCache.get(ctx);
}

function playNote(ctx, dest, midi, time, dur) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = state.wave;
  osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  const peak = state.wave === "square" || state.wave === "sawtooth" ? 0.1 : 0.2;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

function playDrum(ctx, dest, type, time) {
  const gain = ctx.createGain();
  gain.connect(dest);

  if (type === "kick") {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 0.35);
    return;
  }

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = type === "snare" ? 1500 : 7000;
  const [peak, decay] = type === "snare" ? [0.4, 0.18] : [0.2, 0.05];
  gain.gain.setValueAtTime(peak, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  src.connect(filter).connect(gain);
  src.start(time);
  src.stop(time + decay + 0.05);
}

function playRow(ctx, dest, key, time, dur) {
  const r = ROW_MAP[key];
  if (r.drum) playDrum(ctx, dest, key, time);
  else playNote(ctx, dest, r.midi, time, dur);
}

const stepDur = () => 60 / state.bpm / 4; // 16분음표 한 칸

function scheduleStep(ctx, dest, step, time) {
  for (const r of ROWS) {
    if (state.grid[r.key][step]) playRow(ctx, dest, r.key, time, stepDur() * 0.9);
  }
}

// ---------- 악보 칸 ----------
let cellsByStep = [];
let lastHighlight = -1;

function renderGrid() {
  seq.style.gridTemplateColumns = `56px repeat(${state.steps}, 28px)`;
  seq.innerHTML = "";
  cellsByStep = Array.from({ length: state.steps }, () => []);
  lastHighlight = -1;

  ROWS.forEach((r, ri) => {
    const sep = r.drum && !ROWS[ri - 1].drum;
    const label = document.createElement("div");
    label.className = "label" + (sep ? " sep" : "");
    label.textContent = r.label;
    seq.appendChild(label);

    for (let s = 0; s < state.steps; s++) {
      const c = document.createElement("button");
      c.className = "cell";
      if (s % 4 === 0) c.classList.add("beat");
      if (r.drum) c.classList.add("drum");
      if (sep) c.classList.add("sep");
      if (state.grid[r.key][s]) c.classList.add("on");
      c.dataset.row = r.key;
      c.dataset.step = s;
      c.title = `${r.label} · ${s + 1}번째 칸`;
      seq.appendChild(c);
      cellsByStep[s].push(c);
    }
  });
}

function setCell(c, value) {
  state.grid[c.dataset.row][Number(c.dataset.step)] = value;
  c.classList.toggle("on", value);
  if (value) {
    ensureAudio();
    playRow(actx, actx.destination, c.dataset.row, actx.currentTime, 0.25);
  }
  save();
}

// 마우스는 끌어서 칠하기, 터치는 한 칸씩
let paintValue = null;
seq.addEventListener("pointerdown", (e) => {
  const c = e.target.closest(".cell");
  if (!c) return;
  e.preventDefault();
  const value = !state.grid[c.dataset.row][Number(c.dataset.step)];
  setCell(c, value);
  if (e.pointerType === "mouse") paintValue = value;
});
seq.addEventListener("pointerover", (e) => {
  if (paintValue === null) return;
  const c = e.target.closest(".cell");
  if (c && state.grid[c.dataset.row][Number(c.dataset.step)] !== paintValue) setCell(c, paintValue);
});
window.addEventListener("pointerup", () => { paintValue = null; });

function highlight(step) {
  if (lastHighlight >= 0 && cellsByStep[lastHighlight]) {
    cellsByStep[lastHighlight].forEach((c) => c.classList.remove("now"));
  }
  lastHighlight = step;
  if (step >= 0 && cellsByStep[step]) cellsByStep[step].forEach((c) => c.classList.add("now"));
}

// ---------- 재생 ----------
let playing = false;
let timer = null;
let rafId = null;
let nextTime = 0;
let step = 0;
let queue = [];

function tick() {
  while (nextTime < actx.currentTime + 0.1) {
    scheduleStep(actx, actx.destination, step, nextTime);
    queue.push({ step, time: nextTime });
    nextTime += stepDur();
    step = (step + 1) % state.steps;
  }
}

function draw() {
  let current = null;
  while (queue.length && queue[0].time <= actx.currentTime) current = queue.shift().step;
  if (current !== null) highlight(current);
  rafId = requestAnimationFrame(draw);
}

function start() {
  ensureAudio();
  playing = true;
  step = 0;
  queue = [];
  nextTime = actx.currentTime + 0.05;
  tick();
  timer = setInterval(tick, 25);
  rafId = requestAnimationFrame(draw);
  playBtn.textContent = "■ 정지";
}

function stop() {
  playing = false;
  clearInterval(timer);
  cancelAnimationFrame(rafId);
  highlight(-1);
  playBtn.textContent = "▶ 재생";
}

playBtn.addEventListener("click", () => (playing ? stop() : start()));

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) return;
  e.preventDefault();
  playing ? stop() : start();
});

// ---------- 설정 ----------
function syncControls() {
  bpmInput.value = state.bpm;
  bpmLabel.textContent = `${state.bpm} BPM`;
  waveSelect.value = state.wave;
  stepsSelect.value = state.steps;
}

bpmInput.addEventListener("input", () => {
  state.bpm = Number(bpmInput.value);
  bpmLabel.textContent = `${state.bpm} BPM`;
  save();
});

waveSelect.addEventListener("change", () => {
  state.wave = waveSelect.value;
  save();
});

stepsSelect.addEventListener("change", () => {
  const n = Number(stepsSelect.value);
  for (const r of ROWS) {
    const old = state.grid[r.key];
    state.grid[r.key] = Array.from({ length: n }, (_, i) => !!old[i]);
  }
  state.steps = n;
  renderGrid();
  save();
});

const hasNotes = () => ROWS.some((r) => state.grid[r.key].some(Boolean));

document.getElementById("clear").addEventListener("click", () => {
  if (!confirm("만든 곡을 모두 지울까요?")) return;
  state.grid = emptyGrid(state.steps);
  renderGrid();
  save();
});

document.getElementById("example").addEventListener("click", () => {
  if (hasNotes() && !confirm("지금 곡이 예시로 바뀝니다. 계속할까요?")) return;
  state.steps = 16;
  state.bpm = 100;
  state.grid = emptyGrid(16);
  const melody = [60, 64, 67, 72, 65, 69, 72, 77, 67, 71, 74, 79, 72, null, 67, null];
  melody.forEach((m, i) => { if (m) state.grid["n" + m][i] = true; });
  [0, 4, 8, 12].forEach((i) => { state.grid.kick[i] = true; });
  [4, 12].forEach((i) => { state.grid.snare[i] = true; });
  for (let i = 0; i < 16; i += 2) state.grid.hihat[i] = true;
  syncControls();
  renderGrid();
  save();
});

// ---------- WAV 저장 ----------
function encodeWav(buffer) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const view = new DataView(new ArrayBuffer(44 + data.length * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

  str(0, "RIFF");
  view.setUint32(4, 36 + data.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);      // PCM
  view.setUint16(22, 1, true);      // 모노
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

document.getElementById("export").addEventListener("click", async () => {
  if (!hasNotes()) {
    alert("먼저 음을 넣어 주세요.");
    return;
  }
  const sr = 44100;
  const length = Math.ceil((state.steps * stepDur() + 1) * sr);
  const off = new OfflineAudioContext(1, length, sr);
  for (let s = 0; s < state.steps; s++) scheduleStep(off, off.destination, s, s * stepDur());
  const rendered = await off.startRendering();

  const a = document.createElement("a");
  a.href = URL.createObjectURL(encodeWav(rendered));
  a.download = "my-song.wav";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

syncControls();
renderGrid();
