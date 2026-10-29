const form = document.getElementById("search-form");
const queryInput = document.getElementById("query");
const gallery = document.getElementById("gallery");
const statusEl = document.getElementById("status");
const moreBtn = document.getElementById("more");

const PER_PAGE = 30;
let currentQuery = "";
let page = 1;

async function search(query, nextPage) {
  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: query,
    lang: "ko",
    image_type: "photo",
    safesearch: "true",
    per_page: PER_PAGE,
    page: nextPage,
  });

  statusEl.textContent = "불러오는 중...";
  moreBtn.hidden = true;

  try {
    const res = await fetch(`https://pixabay.com/api/?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (nextPage === 1) gallery.innerHTML = "";

    for (const hit of data.hits) {
      const link = document.createElement("a");
      link.href = hit.pageURL;
      link.target = "_blank";
      link.rel = "noopener";

      const img = document.createElement("img");
      img.src = hit.webformatURL;
      img.alt = hit.tags;
      img.loading = "lazy";

      link.appendChild(img);
      gallery.appendChild(link);
    }

    const shown = gallery.children.length;
    statusEl.textContent = data.totalHits
      ? `"${query}" 검색 결과 ${data.totalHits.toLocaleString()}개`
      : `"${query}"에 대한 결과가 없습니다.`;
    moreBtn.hidden = shown >= data.totalHits;
  } catch (err) {
    statusEl.textContent = "이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    console.error(err);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  currentQuery = queryInput.value.trim();
  if (!currentQuery) return;
  page = 1;
  search(currentQuery, page);
});

moreBtn.addEventListener("click", () => {
  page += 1;
  search(currentQuery, page);
});

// config.js가 없으면 (예: 깃허브에 키를 올리지 않은 경우) 안내만 보여준다
if (typeof PIXABAY_API_KEY === "undefined" || !PIXABAY_API_KEY) {
  statusEl.textContent = "픽사베이 API 키가 없어요. config.example.js를 config.js로 복사하고 키를 넣어 주세요.";
  form.querySelector("button").disabled = true;
  throw new Error("PIXABAY_API_KEY 없음");
}

// 첫 화면
queryInput.value = "자연";
currentQuery = "자연";
search(currentQuery, page);
