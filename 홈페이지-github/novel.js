const STORE = "novel-data";

const el = {
  select: document.getElementById("novel-select"),
  title: document.getElementById("novel-title"),
  chapters: document.getElementById("chapter-list"),
  chapterTitle: document.getElementById("chapter-title"),
  body: document.getElementById("body"),
  count: document.getElementById("count"),
  saved: document.getElementById("saved"),
};

function newNovel() {
  return { title: "제목 없는 소설", chapters: [{ title: "1장", body: "" }], current: 0 };
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE));
    if (d && d.novels && d.novels.length) return d;
  } catch {}
  return { novels: [newNovel()], current: 0 };
}

let data = load();
let saveTimer;

function save() {
  clearTimeout(saveTimer);
  el.saved.textContent = "저장 중...";
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(data));
      el.saved.textContent = "자동 저장됨";
    } catch {
      el.saved.textContent = "저장 실패 — TXT로 내보내 두세요";
    }
  }, 400);
}

const novel = () => data.novels[data.current];
const chapter = () => novel().chapters[novel().current];

// ---------- 화면 그리기 ----------
function renderNovelSelect() {
  el.select.innerHTML = "";
  data.novels.forEach((n, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = n.title || "제목 없음";
    el.select.appendChild(opt);
  });
  el.select.value = data.current;
}

function renderChapters() {
  el.chapters.innerHTML = "";
  novel().chapters.forEach((c, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.classList.toggle("active", i === novel().current);

    const name = document.createElement("span");
    name.textContent = c.title || `${i + 1}장`;
    const len = document.createElement("small");
    len.textContent = `${c.body.length.toLocaleString()}자`;

    btn.append(name, len);
    btn.addEventListener("click", () => {
      novel().current = i;
      render();
      save();
    });
    li.appendChild(btn);
    el.chapters.appendChild(li);
  });
}

function updateCount() {
  const body = chapter().body;
  const noSpace = body.replace(/\s/g, "").length;
  const total = novel().chapters.reduce((sum, c) => sum + c.body.length, 0);
  el.count.textContent =
    `이 장 ${body.length.toLocaleString()}자 (공백 제외 ${noSpace.toLocaleString()}자) · 작품 전체 ${total.toLocaleString()}자`;
}

function render() {
  renderNovelSelect();
  renderChapters();
  el.title.value = novel().title;
  el.chapterTitle.value = chapter().title;
  el.body.value = chapter().body;
  updateCount();
}

// ---------- 입력 ----------
el.title.addEventListener("input", () => {
  novel().title = el.title.value;
  el.select.options[data.current].textContent = el.title.value || "제목 없음";
  save();
});

el.chapterTitle.addEventListener("input", () => {
  chapter().title = el.chapterTitle.value;
  renderChapters();
  save();
});

el.body.addEventListener("input", () => {
  chapter().body = el.body.value;
  updateCount();
  renderChapters();
  save();
});

el.select.addEventListener("change", () => {
  data.current = Number(el.select.value);
  render();
  save();
});

// ---------- 버튼 ----------
document.getElementById("new-novel").addEventListener("click", () => {
  data.novels.push(newNovel());
  data.current = data.novels.length - 1;
  render();
  save();
  el.title.select();
});

document.getElementById("delete-novel").addEventListener("click", () => {
  if (!confirm(`"${novel().title}" 작품을 삭제할까요? 되돌릴 수 없어요.`)) return;
  data.novels.splice(data.current, 1);
  if (!data.novels.length) data.novels.push(newNovel());
  data.current = Math.min(data.current, data.novels.length - 1);
  render();
  save();
});

document.getElementById("add-chapter").addEventListener("click", () => {
  const n = novel();
  n.chapters.push({ title: `${n.chapters.length + 1}장`, body: "" });
  n.current = n.chapters.length - 1;
  render();
  save();
  el.body.focus();
});

document.getElementById("delete-chapter").addEventListener("click", () => {
  const n = novel();
  if (n.chapters.length === 1) {
    alert("마지막 남은 장은 지울 수 없어요.");
    return;
  }
  if (!confirm(`"${chapter().title}"을(를) 삭제할까요? 되돌릴 수 없어요.`)) return;
  n.chapters.splice(n.current, 1);
  n.current = Math.min(n.current, n.chapters.length - 1);
  render();
  save();
});

document.getElementById("export").addEventListener("click", () => {
  const n = novel();
  const text = [n.title, ...n.chapters.map((c) => `${c.title}\n\n${c.body}`)].join("\n\n\n");
  const blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(n.title || "소설").replace(/[\\/:*?"<>|]/g, "_")}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

render();
