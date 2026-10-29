const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const W = canvas.width;
const H = canvas.height;

const STORE = "emoji-drawing";
const COLORS = [
  "#222222", "#ffffff", "#ff5a5f", "#ff9f1c", "#ffd23f", "#3bb273",
  "#2ec4b6", "#3a86ff", "#8338ec", "#ff70a6", "#a0522d", "#9e9e9e",
];

let tool = "pen";
let color = "#222222";
let size = 12;
let drawing = false;
let last = null;
const undoStack = [];
let redoStack = [];

// ---------- 저장 / 불러오기 ----------
function persist() {
  try { localStorage.setItem(STORE, canvas.toDataURL()); } catch {}
}

function restore() {
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch {}
  if (!saved) return;
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0);
  img.src = saved;
}

// ---------- 되돌리기 ----------
function pushUndo() {
  undoStack.push(ctx.getImageData(0, 0, W, H));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(ctx.getImageData(0, 0, W, H));
  ctx.putImageData(undoStack.pop(), 0, 0);
  persist();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(ctx.getImageData(0, 0, W, H));
  ctx.putImageData(redoStack.pop(), 0, 0);
  persist();
}

// ---------- 그리기 ----------
function pos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (W / r.width),
    y: (e.clientY - r.top) * (H / r.height),
  };
}

function setBrush() {
  ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function dot(p) {
  setBrush();
  ctx.beginPath();
  ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

function line(a, b) {
  setBrush();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

// 비슷한 색(테두리의 부드러운 부분 포함)까지 한 번에 채운다
function floodFill(sx, sy) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const start = (sy * W + sx) * 4;
  const target = [d[start], d[start + 1], d[start + 2], d[start + 3]];
  const fill = hexToRgb(color);

  const near = (i, c) =>
    Math.abs(d[i] - c[0]) <= 40 && Math.abs(d[i + 1] - c[1]) <= 40 &&
    Math.abs(d[i + 2] - c[2]) <= 40 && Math.abs(d[i + 3] - c[3]) <= 40;
  if (near(start, fill)) return;

  const seen = new Uint8Array(W * H);
  const stack = [sy * W + sx];
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!near(i, target)) continue;
    d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = 255;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  ctx.putImageData(img, 0, 0);
}

canvas.addEventListener("pointerdown", (e) => {
  const p = pos(e);
  pushUndo();
  if (tool === "fill") {
    floodFill(Math.floor(p.x), Math.floor(p.y));
    persist();
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  drawing = true;
  last = p;
  dot(p);
});

canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = pos(e);
  line(last, p);
  last = p;
});

function endStroke() {
  if (!drawing) return;
  drawing = false;
  persist();
}
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);

// ---------- 도구 패널 ----------
const toolButtons = document.querySelectorAll("#tools button");
function selectTool(name) {
  tool = name;
  toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.tool === name));
}
toolButtons.forEach((b) => b.addEventListener("click", () => selectTool(b.dataset.tool)));

const palette = document.getElementById("palette");
const colorInput = document.getElementById("color");

function selectColor(c) {
  color = c;
  colorInput.value = c;
  palette.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.color === c));
  if (tool === "eraser") selectTool("pen");
}

for (const c of COLORS) {
  const b = document.createElement("button");
  b.style.background = c;
  b.dataset.color = c;
  b.title = c;
  b.addEventListener("click", () => selectColor(c));
  palette.appendChild(b);
}
colorInput.addEventListener("input", () => selectColor(colorInput.value));

const sizeInput = document.getElementById("size");
const sizeLabel = document.getElementById("size-label");
sizeInput.addEventListener("input", () => {
  size = Number(sizeInput.value);
  sizeLabel.textContent = size;
});

document.getElementById("undo").addEventListener("click", undo);
document.getElementById("redo").addEventListener("click", redo);
document.getElementById("clear").addEventListener("click", () => {
  if (!confirm("지금 그림을 지우고 새로 그릴까요? (되돌리기로 복구할 수 있어요)")) return;
  pushUndo();
  ctx.clearRect(0, 0, W, H);
  persist();
});

document.getElementById("save").addEventListener("click", () => {
  let out = canvas;
  if (!document.getElementById("transparent").checked) {
    out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const o = out.getContext("2d");
    o.fillStyle = "#ffffff";
    o.fillRect(0, 0, W, H);
    o.drawImage(canvas, 0, 0);
  }
  out.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "emoticon.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
});

document.addEventListener("keydown", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
});

selectColor(color);
restore();
