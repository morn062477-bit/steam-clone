/* Steam 상점 클론 - 화면 로직. index.html에서 분리했다. */

// ===============================================================
// 유틸
// ===============================================================
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => '₩ ' + Number(n).toLocaleString('ko-KR');
const bg = (url) => (url ? `background-image:url('${esc(url)}')` : '');

function ymd(iso) {
  if (!iso) return '출시일 미정';
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 리뷰 요약. 긍정 비율에 따라 색을 바꾼다. */
function reviewHtml(g) {
  if (!g.reviewDesc) return '<div class="reviews"><span>평가 없음</span></div>';
  const cls = (g.reviewPercent ?? 0) >= 70 ? 'reviews positive' : 'reviews';
  const cnt = g.reviewTotal ? ` <span>(평가 ${g.reviewTotal.toLocaleString('ko-KR')}개)</span>` : '';
  return `<div class="${cls}">${esc(g.reviewDesc)}${cnt}</div>`;
}

/** 가격 바. 할인 여부/무료/출시예정을 모두 여기서 처리한다. */
function priceBar(g, cls = 'pricebar') {
  if (g.isFree) return `<div class="${cls}"><span class="pb-body"><span class="now">무료 플레이</span></span></div>`;
  if (g.priceKrw <= 0) return `<div class="${cls}"><span class="pb-body"><span class="now">${g.comingSoon ? '출시 예정' : '가격 미정'}</span></span></div>`;
  if (g.discountPercent > 0) {
    return `<div class="${cls}">
      <span class="disc">-${g.discountPercent}%</span>
      <span class="pb-body"><span class="was">${won(g.priceKrw)}</span><span class="now">${won(g.finalKrw)}</span></span>
    </div>`;
  }
  return `<div class="${cls}"><span class="pb-body"><span class="now">${won(g.priceKrw)}</span></span></div>`;
}

function priceText(g) {
  if (g.isFree) return '무료 플레이';
  if (g.priceKrw <= 0) return g.comingSoon ? '출시 예정' : '가격 미정';
  if (g.discountPercent > 0) return `-${g.discountPercent}%  ${won(g.finalKrw)}`;
  return won(g.priceKrw);
}

const TAGLINE_CLASS = { '일일 특가': 'day', '주중 특가': 'week', '시즌 세일': 'season', '특별 할인': 'season' };

// ===============================================================
// 렌더
// ===============================================================
function renderHero(g) {
  if (!g) return;
  const shot = g.screenshots[0]?.url || g.headerImage;
  $('#hero').innerHTML = `
    <div class="hero-bg" style="${bg(shot)}"></div>
    <div class="wrap hero-inner">
      <div class="hero-cap" style="${bg(g.capsuleImage || g.headerImage)}"></div>
      <div class="hero-txt">
        ${g.discountPercent > 0 ? `<span class="hero-kicker">${esc(g.discountLabel || '할인')} · -${g.discountPercent}%</span>` : '<span class="hero-kicker">지금 인기</span>'}
        <h1>${esc(g.name)}</h1>
        <div class="hero-meta">
          <span>${esc(g.developer)}</span>
          <span>·</span>
          <span>${ymd(g.releaseDate)}</span>
          ${g.reviewDesc ? `<span>·</span><span style="color:var(--blue)">${esc(g.reviewDesc)}</span>` : ''}
        </div>
        <div class="hero-buy">
          <a class="hero-cta" href="#" data-slug="${esc(g.slug)}">상점 페이지 보기</a>
          <span class="price-tag">${priceText(g)}</span>
        </div>
      </div>
    </div>`;
  $('#hero .hero-cta').addEventListener('click', (e) => { e.preventDefault(); openGame(g.slug); });
}

function featSlide(g) {
  const art = g.screenshots[0]?.url || g.headerImage;
  const thumbs = (g.screenshots.slice(1, 5).length ? g.screenshots.slice(1, 5) : g.screenshots.slice(0, 4))
    .map((s) => `<div class="thumb" style="${bg(s.thumb || s.url)}"></div>`).join('');
  return `<div class="car-slide">
    <div class="feat" data-slug="${esc(g.slug)}">
      <div class="feat-art" style="${bg(art)}">
        ${g.discountPercent > 0 ? `<span class="badge-live"><i></i>${esc(g.discountLabel)}</span>` : ''}
      </div>
      <div class="feat-info">
        <h3>${esc(g.name)}</h3>
        ${reviewHtml(g)}
        <div class="thumbs">${thumbs}</div>
        <div class="feat-tags">${g.tags.slice(0, 5).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>
        <div class="feat-meta">
          <div class="rank">📈<div><b>${g.discountPercent > 0 ? '할인 중' : '최고 인기 게임'}</b><small>Steam 평가 ${(g.reviewTotal || 0).toLocaleString('ko-KR')}개</small></div></div>
          <span class="price-tag">${priceText(g)}</span>
        </div>
      </div>
    </div>
  </div>`;
}

function dealCard(g, size) {
  const art = size === 'big' ? (g.capsuleImage || g.headerImage) : g.headerImage;
  const cls = TAGLINE_CLASS[g.discountLabel] || 'season';
  return `<div class="deal-${size}" data-slug="${esc(g.slug)}">
    <span class="tagline ${cls}">${esc(g.discountLabel || '할인')}</span>
    <div class="art" style="${bg(art)}"></div>
    <div class="card-name">${esc(g.name)}</div>
    ${priceBar(g)}
  </div>`;
}

function dealSlide(chunk) {
  const [b1, b2, s1, s2] = chunk;
  return `<div class="car-slide"><div class="deals">
    ${b1 ? dealCard(b1, 'big') : ''}
    ${b2 ? dealCard(b2, 'big') : ''}
    <div class="deal-col">
      ${s1 ? dealCard(s1, 'sm') : ''}
      ${s2 ? dealCard(s2, 'sm') : ''}
    </div>
  </div></div>`;
}

function spotBlock(s) {
  return `<div class="spot">
    <div class="sec-head"><div><h2 class="sec-title">${esc(s.tag)} 게임</h2><div class="sec-sub">집중 조명 태그</div></div></div>
    <div class="spot-body">
      ${s.games.map((g) => `
        <div class="spot-card" data-slug="${esc(g.slug)}">
          <div class="art" style="${bg(g.headerImage)}"></div>
          <div class="card-name">${esc(g.name)}</div>
          ${priceBar(g)}
        </div>`).join('')}
    </div>
    <div class="spot-foot"><button class="more-btn">더 보기</button></div>
  </div>`;
}

function relRow(g) {
  return `<div class="rel-row" data-slug="${esc(g.slug)}">
    <div class="rel-cap" style="${bg(g.headerImage)}"></div>
    <div class="rel-meta">
      <h5>${esc(g.name)}</h5>
      <div class="tags">${esc(g.tags.slice(0, 4).join(', ')) || '태그 없음'}</div>
      <div class="date">출시: ${ymd(g.releaseDate)}</div>
    </div>
    ${priceBar(g, 'rel-price')}
  </div>`;
}

function relSide(g) {
  if (!g) return '';
  const shots = g.screenshots.slice(0, 3).map((s) => `<div class="side-shot" style="${bg(s.thumb || s.url)}"></div>`).join('');
  return `<h4>${esc(g.name)}</h4>
    <div class="lang">Steam 사용자 평가</div>
    <div class="score">${esc(g.reviewDesc || '평가 없음')}${g.reviewTotal ? ` (${g.reviewTotal.toLocaleString('ko-KR')})` : ''}</div>
    <div class="tag-pills">${g.tags.slice(0, 6).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>
    ${shots}`;
}

function catSlide(items) {
  return `<div class="car-slide"><div class="cats">
    ${items.map((c) => `
      <div class="cat" data-tag="${esc(c.name)}">
        <div class="veil" style="${bg(c.image)}"></div>
        <b>${esc(c.name)}</b>
        <small>${c.count}종</small>
      </div>`).join('')}
  </div></div>`;
}

function cheapSlide(items) {
  return `<div class="car-slide"><div class="cheap">
    ${items.map((g) => `
      <div class="cheap-card" data-slug="${esc(g.slug)}">
        <div class="art" style="${bg(g.capsuleImage || g.headerImage)}"></div>
        <div class="card-name">${esc(g.name)}</div>
        ${priceBar(g)}
      </div>`).join('')}
  </div></div>`;
}

const chunk = (arr, n) => arr.reduce((a, _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);

// ===============================================================
// 화면 조립
// ===============================================================
let HOME = null;

function render(data) {
  HOME = data;
  const dealSlides = chunk(data.deals, 4).filter((c) => c.length >= 2);
  const catSlides = chunk(data.categories, 5);
  const cheapSlides = chunk(data.cheap, 5);

  $('#app').innerHTML = `
  <!-- 특집 및 추천 -->
  <section class="section"><div class="wrap">
    <div class="sec-head">
      <h2 class="sec-title">특집 및 추천 게임</h2>
      <a class="giftcard" href="#"><span class="gc-icon"></span>기프트 카드 보내기</a>
    </div>
    <div class="carousel" id="featCar">
      <button class="arrow prev" aria-label="이전">‹</button>
      <button class="arrow next" aria-label="다음">›</button>
      <div class="car-view"><div class="car-track">${data.featured.map(featSlide).join('')}</div></div>
      <div class="dots"></div>
    </div>
    <div class="promo">
      <div class="left">
        <span class="kicker">STEAM</span>
        <h4>여름 세일<br>진행 중</h4>
        <p>현재 ${data.stats.discounts}종 할인 중 · 전체 ${data.stats.games}종</p>
      </div>
      <div class="right"><div class="box">할인 종료<br>${ymd(data.deals[0]?.discountEndsAt)}</div></div>
    </div>
  </div></section>

  <!-- 할인 및 이벤트 -->
  <section class="section"><div class="wrap">
    <div class="sec-head">
      <h2 class="sec-title">할인 및 이벤트</h2>
      <button class="more-btn">더 보기</button>
    </div>
    <div class="carousel" id="dealCar">
      <button class="arrow prev" aria-label="이전">‹</button>
      <button class="arrow next" aria-label="다음">›</button>
      <div class="car-view"><div class="car-track">${dealSlides.map(dealSlide).join('')}</div></div>
      <div class="dots"></div>
    </div>
    <div class="queue">
      <div class="q-left">
        <h4>맞춤 대기열 둘러보기</h4>
        <p>로그인하여 인기 게임, 신규 출시 게임, 추천 게임 보기</p>
        <a class="btn-blue" href="#login" data-view="login">로그인</a>
      </div>
      <div class="q-right">
        ${data.featured.slice(0, 4).map((g) => `<div style="${bg(g.headerImage)}"></div>`).join('')}
      </div>
    </div>
  </div></section>

  <!-- 태그 스포트라이트 -->
  <section class="section"><div class="wrap spotlights">
    ${data.spotlights.map(spotBlock).join('')}
  </div></section>

  <!-- 신규 출시 -->
  <section class="section"><div class="wrap">
    <div class="tabs" id="relTabs">
      ${data.tabs.map((t, i) => `<button class="tab${i === 0 ? ' on' : ''}" data-i="${i}">${esc(t.label)}</button>`).join('')}
    </div>
    <div class="releases">
      <div class="rel-list">
        <div id="relRows"></div>
        <div class="rel-foot">
          더 보기:
          <button class="more-btn">인기 신규 출시 게임</button>
          <span>또는</span>
          <button class="more-btn">신규 출시 게임 전체</button>
        </div>
      </div>
      <aside class="rel-side" id="relSide"></aside>
    </div>
  </div></section>

  <!-- 카테고리 -->
  <section class="section"><div class="wrap">
    <div class="sec-head"><h2 class="sec-title">카테고리별 검색</h2></div>
    <div class="carousel" id="catCar">
      <button class="arrow prev" aria-label="이전">‹</button>
      <button class="arrow next" aria-label="다음">›</button>
      <div class="car-view"><div class="car-track">${catSlides.map(catSlide).join('')}</div></div>
      <div class="dots"></div>
    </div>
  </div></section>

  <!-- 1만원 미만 -->
  <section class="section"><div class="wrap">
    <div class="sec-head">
      <h2 class="sec-title">₩ 10,000 미만</h2>
      <div class="headbtns">더 보기: <button class="more-btn">₩ 10,000 미만</button><button class="more-btn">₩ 5,000 미만</button></div>
    </div>
    <div class="carousel" id="cheapCar">
      <button class="arrow prev" aria-label="이전">‹</button>
      <button class="arrow next" aria-label="다음">›</button>
      <div class="car-view"><div class="car-track">${cheapSlides.map(cheapSlide).join('')}</div></div>
      <div class="dots"></div>
    </div>
  </div></section>`;

  renderHero(data.hero);
  showTab(0);

  initCarousel('featCar', 7000);
  initCarousel('dealCar', 9000);
  initCarousel('catCar', 0);
  initCarousel('cheapCar', 0);

  // 탭
  document.querySelectorAll('#relTabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#relTabs .tab').forEach((t) => t.classList.remove('on'));
      tab.classList.add('on');
      showTab(Number(tab.dataset.i));
    });
  });

  fillNavMenus(data);

  // 카드 클릭 -> 상세
  document.addEventListener('click', onCardClick);
}

// ===============================================================
// 상단 드롭다운
//
// 실제 Steam 은 hover 로 열지만, 여기서는 클릭으로 연다.
// 열려 있는 메뉴는 하나뿐이고 바깥 클릭/Esc/화면 전환에서 닫힌다.
// ===============================================================
function closeNav() {
  document.querySelectorAll('.navitem.open').forEach((n) => n.classList.remove('open'));
}

/** 드롭다운 카운트에 쓸 게임 목록 */
const allGames = (d) => [...d.featured, ...d.deals, ...d.cheap, ...d.tabs.flatMap((t) => t.games)];

document.querySelectorAll('.navitem > .item').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const item = btn.parentElement;
    const wasOpen = item.classList.contains('open');
    closeNav();
    if (!wasOpen) item.classList.add('open');
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.navitem')) closeNav();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

/** 드롭다운 안의 링크를 누르면 해당 섹션으로 보내고 메뉴를 닫는다. */
document.querySelectorAll('.navdrop').forEach((drop) => {
  drop.addEventListener('click', (e) => {
    const tabLink = e.target.closest('[data-tab]');
    if (tabLink) {
      e.preventDefault();
      closeNav();
      goTab(tabLink.dataset.tab);
      return;
    }
    const tagLink = e.target.closest('[data-tag]');
    if (tagLink) {
      e.preventDefault();
      closeNav();
      $('#q').value = '';
      runSearchByTag(tagLink.dataset.tag);
      return;
    }
    // 게임 카드는 onCardClick 이 모달을 열어 준다. 메뉴만 닫는다.
    if (e.target.closest('a, [data-slug]')) closeNav();
  });
});

/** 신규 출시 섹션의 탭으로 이동 (신규 출시 / 출시 예정 / 최고 인기 / 특별 할인) */
function goTab(key) {
  if (!HOME) return;
  const i = HOME.tabs.findIndex((t) => t.key === key);
  if (i < 0) return;
  showView('store');
  document.querySelectorAll('#relTabs .tab').forEach((t) => t.classList.remove('on'));
  document.querySelector(`#relTabs .tab[data-i="${i}"]`)?.classList.add('on');
  showTab(i);
  $('#relTabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#navCatExpand').addEventListener('click', () => {
  const box = $('#navCatGenres');
  const open = box.classList.toggle('open');
  $('#navCatExpand').textContent = open ? '접기 ⌃' : '펼치기 ⌄';
});

/** 드롭다운 중 DB 값이 들어가는 부분을 채운다. */
function fillNavMenus(data) {
  // 카테고리: 앞 6개는 이미지 타일, 나머지는 알약 + 전체 장르 목록
  $('#navCatTiles').innerHTML = data.categories.slice(0, 6).map((c) => `
    <div class="cat" data-tag="${esc(c.name)}">
      <div class="veil" style="${bg(c.image)}"></div>
      <b>${esc(c.name)}</b>
    </div>`).join('');

  $('#navCatPills').innerHTML =
    data.categories.slice(6).map((c) => `<a href="#" data-tag="${esc(c.name)}">${esc(c.name)}</a>`).join('') +
    '<a href="#" class="nd-allpills">모든 태그 보기 ›</a>';

  // 전체 장르 및 테마: 화면에 나온 게임들의 태그를 모아 많이 쓰인 순으로
  const count = new Map();
  for (const g of allGames(data)) {
    for (const t of g.tags || []) count.set(t, (count.get(t) || 0) + 1);
  }
  const genres = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  $('#navCatGenres').innerHTML = genres.map((n) =>
    `<a href="#" data-tag="${esc(n)}">${esc(n)}</a>`).join('');

  // 추천 제품: 최고 인기 3종
  const topGames = data.tabs.find((t) => t.key === 'top')?.games ?? [];
  $('#navTopGames').innerHTML = topGames.slice(0, 3).map((g) => `
    <div class="nd-top-row" data-slug="${esc(g.slug)}">
      <div class="nd-top-cap" style="${bg(g.headerImage)}"></div>
      <div><div class="nm">${esc(g.name)}</div><div class="pr">${priceText(g)}</div></div>
    </div>`).join('');

  // 검색: 배너 2장
  const b1 = topGames[0];
  const b2 = data.deals[0] || topGames[1];
  $('#navSearchBanners').innerHTML = [
    b1 ? `<div class="nd-banner" data-slug="${esc(b1.slug)}" style="${bg(b1.headerImage)}"><span class="nd-chip">최고 인기 게임</span></div>` : '',
    b2 ? `<div class="nd-banner" data-slug="${esc(b2.slug)}" style="${bg(b2.headerImage)}"><span class="nd-chip">할인 및 이벤트</span></div>` : '',
  ].join('');
}

function showTab(i) {
  const games = HOME.tabs[i].games;
  $('#relRows').innerHTML = games.length ? games.map(relRow).join('') : '<div class="loading">해당하는 게임이 없습니다.</div>';
  $('#relSide').innerHTML = relSide(games[0]);
  document.querySelectorAll('#relRows .rel-row').forEach((row, n) => {
    row.addEventListener('mouseenter', () => { $('#relSide').innerHTML = relSide(games[n]); });
  });
}

function onCardClick(e) {
  const el = e.target.closest('[data-slug]');
  if (el) { openGame(el.dataset.slug); return; }
  const cat = e.target.closest('[data-tag]');
  if (cat) { $('#q').value = ''; runSearchByTag(cat.dataset.tag); }
}

// ===============================================================
// 상세 모달
// ===============================================================
async function openGame(slug) {
  const back = $('#modalBack');
  back.classList.add('on');
  document.body.style.overflow = 'hidden';
  $('#modal').innerHTML = '<div class="loading">불러오는 중…</div>';

  const res = await fetch('/api/game/' + encodeURIComponent(slug));
  if (!res.ok) { $('#modal').innerHTML = '<div class="err">게임을 찾을 수 없습니다.</div>'; return; }
  const g = await res.json();

  const shots = g.screenshots;
  const req = g.reqWindows?.minimum ? String(g.reqWindows.minimum) : null;
  const plat = [g.platforms.windows && 'Windows', g.platforms.mac && 'macOS', g.platforms.linux && 'Linux'].filter(Boolean).join(', ');

  $('#modal').innerHTML = `
    <button class="modal-x" aria-label="닫기">×</button>
    <div class="m-head">
      <h2>${esc(g.name)}</h2>
      <div class="sub">${esc(g.developer)} · ${ymd(g.releaseDate)}${g.steamAppId ? ` · appid ${g.steamAppId}` : ''}${g.metacritic ? ` · 메타크리틱 ${g.metacritic}` : ''}</div>
    </div>
    <div class="m-body">
      <div class="m-left">
        <div class="m-shot" id="mShot" style="${bg(shots[0]?.url || g.headerImage)}"></div>
        <div class="m-strip">
          ${shots.map((s, i) => `<div data-i="${i}" class="${i === 0 ? 'on' : ''}" style="${bg(s.thumb || s.url)}"></div>`).join('')}
        </div>
        <h3 class="m-sec">게임 정보</h3>
        <div class="m-about">${esc(g.description || g.shortDesc)}</div>
        ${g.reviews.length ? `
          <h3 class="m-sec">사용자 평가 (${g.reviewCountLocal})</h3>
          ${g.reviews.map((r) => `
            <div class="m-review">
              <div class="who"><b>${esc(r.nickname)}</b> · <span class="${r.isRecommended ? 'rec' : 'norec'}">${r.isRecommended ? '추천' : '비추천'}</span> · ${r.playtimeHours}시간 플레이 · 도움됨 ${r.helpfulCount}</div>
              <p>${esc(r.content)}</p>
            </div>`).join('')}` : ''}
        ${req ? `<h3 class="m-sec">최소 시스템 요구 사항</h3><div class="m-req">${esc(req)}</div>` : ''}
      </div>
      <div class="m-right">
        <div class="m-cap" style="${bg(g.headerImage)}"></div>
        <div class="m-desc">${esc(g.shortDesc)}</div>
        <div class="m-rows">
          <div><b>평가</b> ${esc(g.reviewDesc || '평가 없음')}${g.reviewPercent != null ? ` (${g.reviewPercent}%)` : ''}</div>
          <div><b>출시일</b> ${ymd(g.releaseDate)}</div>
          <div><b>개발자</b> ${esc(g.developer)}</div>
          <div><b>배급사</b> ${esc(g.publisher)}</div>
          <div><b>플랫폼</b> ${esc(plat || '-')}</div>
          <div><b>이용 등급</b> ${g.requiredAge ? g.requiredAge + '세 이상' : '전체 이용가'}</div>
          ${g.dlcCount ? `<div><b>DLC</b> ${g.dlcCount}종</div>` : ''}
        </div>
        <div class="m-buy">
          ${g.discountPercent > 0
            ? `<span class="disc">-${g.discountPercent}%</span><span><span class="was">${won(g.priceKrw)}</span> <span class="now">${won(g.finalKrw)}</span></span>`
            : `<span class="now">${priceText(g)}</span>`}
          <button class="btn-green">카트에 추가</button>
        </div>
        <div class="tag-pills">${g.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>
      </div>
    </div>`;

  $('#modal .modal-x').addEventListener('click', closeModal);
  document.querySelectorAll('#modal .m-strip div').forEach((d) => {
    d.addEventListener('click', () => {
      document.querySelectorAll('#modal .m-strip div').forEach((x) => x.classList.remove('on'));
      d.classList.add('on');
      $('#mShot').style.backgroundImage = `url('${shots[Number(d.dataset.i)].url}')`;
    });
  });
  back.scrollTop = 0;
}

function closeModal() {
  $('#modalBack').classList.remove('on');
  document.body.style.overflow = '';
}
$('#modalBack').addEventListener('click', (e) => { if (e.target.id === 'modalBack') closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#verifyBack').classList.contains('on')) closeVerify();
  else closeModal();
});

// ===============================================================
// 검색
// ===============================================================
let searchTimer = null;

/** 드롭다운 한 줄. 할인 중이면 할인율/정가/판매가를 나눠 보여준다. */
function sresRow(g) {
  const price = g.discountPercent > 0
    ? `<span class="disc">-${g.discountPercent}%</span>
       <span class="was">${won(g.priceKrw)}</span>
       <span class="now">${won(g.finalKrw)}</span>`
    : `<span class="now">${priceText(g)}</span>`;
  return `<div class="sres-row" data-slug="${esc(g.slug)}">
    <div class="cap" style="${bg(g.headerImage)}"></div>
    <div class="info">
      <div class="nm">${esc(g.name)}</div>
      <div class="pr">${price}</div>
    </div>
  </div>`;
}

function openResults(html) {
  const box = $('#sresults');
  box.innerHTML = html;
  box.classList.add('on');
  $('.searchbox').classList.add('open');
  box.querySelectorAll('.sres-row').forEach((r) => {
    r.addEventListener('click', () => { closeResults(); openGame(r.dataset.slug); });
  });
}

function closeResults() {
  $('#sresults').classList.remove('on');
  $('.searchbox').classList.remove('open');
}

function renderResults(rows) {
  if (!rows.length) { openResults('<div class="sres-empty">검색 결과가 없습니다.</div>'); return; }
  openResults(rows.map(sresRow).join('') + '<div class="sres-adv" role="button" tabindex="0">고급 검색</div>');
}

/** 검색어가 없을 때 뜨는 인기 검색어. 할인 중인 게임을 앞세운다. */
function renderPopular() {
  if (!HOME) return;
  const seen = new Set(), rows = [];
  for (const g of [...HOME.deals, ...(HOME.tabs.find((t) => t.key === 'top')?.games ?? [])]) {
    if (!g || seen.has(g.slug)) continue;
    seen.add(g.slug);
    rows.push(g);
    if (rows.length === 4) break;
  }
  if (!rows.length) return;
  openResults(
    '<div class="sres-head">인기 검색어</div>' +
    rows.map(sresRow).join('') +
    '<div class="sres-adv" role="button" tabindex="0">고급 검색</div>',
  );
}

async function runSearch(q) {
  if (!q.trim()) { renderPopular(); return; }
  const rows = await (await fetch('/api/search?q=' + encodeURIComponent(q))).json();
  renderResults(rows);
}

/** 카테고리 카드 클릭 시, 해당 장르 게임을 모아 결과창에 띄운다. */
function runSearchByTag(tag) {
  const seen = new Set(), rows = [];
  const pools = [...HOME.tabs.flatMap((t) => t.games), ...HOME.deals, ...HOME.featured, ...HOME.cheap, HOME.hero];
  for (const g of pools) {
    if (!g || seen.has(g.slug) || !g.tags.includes(tag)) continue;
    seen.add(g.slug);
    rows.push(g);
  }
  $('#q').value = tag;
  renderResults(rows.slice(0, 12));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#q').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const v = e.target.value;
  searchTimer = setTimeout(() => runSearch(v), 220);
});

// 검색창에 마우스를 올리거나 포커스가 가면 인기 검색어를 띄운다.
// 마우스가 빠져도 포커스가 남아 있거나 검색어를 친 상태면 그대로 둔다.
const searchBox = $('.searchbox');
searchBox.addEventListener('mouseenter', () => {
  if (!$('#q').value.trim()) renderPopular();
});
searchBox.addEventListener('mouseleave', () => {
  if (document.activeElement !== $('#q') && !$('#q').value.trim()) closeResults();
});
$('#q').addEventListener('focus', () => {
  if (!$('#q').value.trim()) renderPopular();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.searchbox')) closeResults();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeResults(); });

// ===============================================================
// 캐러셀
// ===============================================================
function initCarousel(id, autoMs) {
  const root = document.getElementById(id);
  if (!root) return;
  const track = root.querySelector('.car-track');
  const slides = [...root.querySelectorAll('.car-slide')];
  const dotsBox = root.querySelector('.dots');
  let i = 0, timer = null;
  if (!slides.length) return;

  slides.forEach((_, n) => {
    const d = document.createElement('span');
    d.className = 'dot' + (n === 0 ? ' on' : '');
    d.addEventListener('click', () => go(n));
    dotsBox.appendChild(d);
  });
  const dots = [...dotsBox.children];

  function go(n) {
    i = (n + slides.length) % slides.length;
    track.style.transform = `translateX(${-i * 100}%)`;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    restart();
  }
  function restart() {
    if (!autoMs) return;
    clearInterval(timer);
    timer = setInterval(() => go(i + 1), autoMs);
  }

  root.querySelector('.prev').addEventListener('click', () => go(i - 1));
  root.querySelector('.next').addEventListener('click', () => go(i + 1));
  root.addEventListener('mouseenter', () => clearInterval(timer));
  root.addEventListener('mouseleave', restart);
  restart();
}

// ===============================================================
// 화면 전환 (상점 <-> 로그인)
// ===============================================================
const VIEWS = { store: 1, login: 1, signup: 1, create: 1, done: 1 };
const HASH = { login: '#login', signup: '#signup', create: '#create', done: '#verified' };
const VIEW_OF_HASH = Object.fromEntries(Object.entries(HASH).map(([v, h]) => [h, v]));

function viewFromHash() {
  return VIEW_OF_HASH[location.hash] || 'store';
}

function showView(name) {
  const view = VIEWS[name] ? name : 'store';
  $('#hero').style.display = view === 'store' ? '' : 'none';
  $('#app').style.display = view === 'store' ? '' : 'none';
  $('#loginView').classList.toggle('on', view === 'login');
  $('#signupView').classList.toggle('on', view === 'signup');
  $('#createView').classList.toggle('on', view === 'create');
  $('#doneView').classList.toggle('on', view === 'done');
  if (view !== 'signup') closeVerify();

  document.querySelectorAll('#mainnav a').forEach((a) =>
    a.classList.toggle('on', a.dataset.view === 'store' && view === 'store'));
  $('#topLogin').style.visibility = view === 'login' ? 'hidden' : '';

  closeModal();
  closeNav();
  closeResults();

  const want = HASH[view] || location.pathname;
  if (location.hash !== (HASH[view] || '')) history.replaceState(null, '', want);

  window.scrollTo({ top: 0 });
  if (view === 'login') $('#account').focus();
  if (view === 'signup') $('#suEmail').focus();
  if (view === 'create') $('#crName').focus();
}

/** 배경 타일에 쓸 이미지 풀. DB가 아직이면 빈 배열. */
function tilePool() {
  if (!HOME) return [];
  return [...HOME.featured, ...HOME.deals, ...HOME.cheap, ...HOME.tabs.flatMap((t) => t.games)]
    .map((g) => g.headerImage).filter(Boolean);
}

function fillTiles(sel, count) {
  const pool = tilePool();
  $(sel).innerHTML = Array.from({ length: count }, (_, i) =>
    `<span style="${pool.length ? bg(pool[i % pool.length]) : ''}"></span>`).join('');
}

function fillLoginBg() { fillTiles('#loginBg', 40); }
function fillSignupBg() { fillTiles('#signupBg', 24); }
function fillCreateBg() { fillTiles('#createBg', 24); }
function fillDoneBg() { fillTiles('#doneBg', 24); }

// data-view 를 단 요소는 어디에 있든(렌더로 새로 생긴 것 포함) 화면을 바꾼다.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-view]');
  if (!el) return;
  e.preventDefault();
  showView(el.dataset.view);
});

// 주소창에서 직접 #login / #signup 을 치거나 뒤로가기를 눌러도 따라간다.
window.addEventListener('hashchange', () => showView(viewFromHash()));

// ===============================================================
// 세션
//
// 진짜 세션 쿠키/토큰은 아직 없다. 로그인 결과를 localStorage 에 들고 있다가
// 헤더 표시에만 쓴다. 서버는 매 요청마다 이 값을 신뢰하지 않는다.
// ===============================================================
const SESSION_KEY = 'steam-clone:user';

function currentUser() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function setUser(user) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
  paintUser();
}

function paintUser() {
  const u = currentUser();
  $('#topLogin').hidden = !!u;
  $('#topUser').hidden = !u;
  if (u) $('#topUserName').textContent = u.nickname;
}

$('#topLogout').addEventListener('click', (e) => {
  e.preventDefault();
  setUser(null);
  showView('store');
});

/** JSON 을 POST 하고 { ok, status, data } 로 돌려준다. */
async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ===============================================================
// 로그인 폼 (POST /api/login)
// ===============================================================
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#loginMsg');
  const btn = $('#loginForm .btn-login');
  const account = $('#account').value.trim();
  const password = $('#password').value;

  if (!account || !password) {
    msg.className = 'login-msg';
    msg.textContent = '계정 이름과 비밀번호를 모두 입력하세요.';
    return;
  }

  btn.disabled = true;
  msg.className = 'login-msg';
  msg.textContent = '확인 중…';
  try {
    const { ok, data } = await postJson('/api/login', { account, password });
    if (!ok) { msg.textContent = data.error || '로그인에 실패했습니다.'; return; }

    setUser(data);
    msg.className = 'login-msg ok';
    msg.textContent = `${data.nickname} 님, 로그인되었습니다.`;
    $('#password').value = '';
    setTimeout(() => showView('store'), 700);
  } catch {
    msg.textContent = '서버에 연결하지 못했습니다.';
  } finally {
    btn.disabled = false;
  }
});

// ===============================================================
// 계정 만들기 폼 (POST /api/signup)
//
// 이메일은 가입 화면에서 인증한 값을 그대로 쓴다. 인증을 건너뛰고
// #create 로 바로 들어온 경우엔 가입 화면으로 되돌린다.
// ===============================================================
let pendingEmail = '';

function openCreate(email) {
  pendingEmail = email;
  $('#createForm').reset();
  $('#createMsg').textContent = '';
  $('#createMsg').className = 'create-msg';
  $('#crNameHint').textContent = `영문/숫자/-/_ 3자 이상 · ${email} 로 만듭니다`;
  $('#crNameHint').className = 'cr-hint';
  $('#crPwHint').textContent = '8자 이상';
  $('#crPwHint').className = 'cr-hint';
  $('#crSubmit').disabled = false;
  showView('create');
}

$('#createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#createMsg');
  const name = $('#crName').value.trim();
  const pw = $('#crPw').value;
  const pw2 = $('#crPw2').value;
  msg.className = 'create-msg';

  if (!pendingEmail) {
    msg.textContent = '이메일 인증부터 다시 진행해 주세요.';
    setTimeout(() => showView('signup'), 900);
    return;
  }
  if (name.length < 3 || !/^[A-Za-z0-9_-]+$/.test(name)) {
    msg.textContent = '계정 이름은 영문/숫자/-/_ 로 3자 이상이어야 합니다.';
    return;
  }
  if (pw.length < 8) { msg.textContent = '비밀번호는 8자 이상이어야 합니다.'; return; }
  if (pw !== pw2) { msg.textContent = '두 비밀번호가 서로 다릅니다.'; return; }

  $('#crSubmit').disabled = true;
  msg.textContent = '저장 중…';
  try {
    const { ok, data } = await postJson('/api/signup', { email: pendingEmail, account: name, password: pw });
    if (!ok) {
      msg.textContent = data.error || '계정을 만들지 못했습니다.';
      $('#crSubmit').disabled = false;
      return;
    }

    // 저장 성공. 완료 화면으로 넘기고 로그인 칸에 계정 이름을 미리 채워 둔다.
    pendingEmail = '';
    $('#doneTitle').textContent = '계정 생성 완료';
    $('#doneMsg').textContent = `${data.nickname} 계정이 만들어졌습니다. 이제 로그인할 수 있습니다.`;
    $('#account').value = data.nickname;
    $('#password').value = '';
    $('#loginMsg').textContent = '';
    showView('done');
  } catch {
    msg.textContent = '서버에 연결하지 못했습니다.';
    $('#crSubmit').disabled = false;
  }
});

// ---------- 이메일 인증 모달 ----------
let verifyTimer = null;
let verifyEmail = '';

function openVerify(email) {
  verifyEmail = email;
  $('#vEmail').textContent = email;
  $('#vEmail2').textContent = email;
  $('#vStatus').textContent = '인증 대기 중...';
  $('#vStatus').className = 'v-status';
  $('#vHelp').classList.remove('on');
  $('#vToggle').textContent = '펼치기 ⌄';
  $('#verifyBack').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeVerify() {
  clearTimeout(verifyTimer);
  $('#verifyBack').classList.remove('on');
  document.body.style.overflow = '';
}

$('#vToggle').addEventListener('click', () => {
  const help = $('#vHelp');
  help.classList.toggle('on');
  $('#vToggle').textContent = help.classList.contains('on') ? '접기 ⌃' : '펼치기 ⌄';
});

$('#vChange').addEventListener('click', () => closeVerify());

/** 백엔드 생기면  #vConfirm 자리에 폴링 넣으면 됨 */
// const poll = setInterval(async () => {
//   const r = await fetch('/api/signup/status?email=' + encodeURIComponent(email));
//   const { verified } = await r.json();
//   if (verified) { clearInterval(poll); /* 완료 처리 */ }
// }, 3000);

/** 데모용 인증. 실제로는 메일 링크 클릭이 이 자리를 대신한다. */
$('#vConfirm').addEventListener('click', () => {
  $('#vStatus').textContent = '인증 완료';
  $('#vStatus').className = 'v-status done';
  const email = verifyEmail;
  verifyTimer = setTimeout(() => {
    closeVerify();
    openCreate(email); // 인증 다음 단계: 계정 이름/비밀번호 입력
  }, 900);
});

$('#verifyBack').addEventListener('click', (e) => {
  if (e.target.id === 'verifyBack') closeVerify();
});

// ---------- 가입 폼 ----------
const suCaptcha = $('#suCaptcha');
suCaptcha.addEventListener('click', () => {
  suCaptcha.classList.toggle('on');
  suCaptcha.setAttribute('aria-checked', suCaptcha.classList.contains('on'));
});
suCaptcha.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); suCaptcha.click(); }
});

$('#signupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = $('#signupMsg');
  const a = $('#suEmail').value.trim();
  const b = $('#suEmail2').value.trim();
  msg.className = 'signup-msg';
  msg.textContent = '';

  if (!a || !b) { msg.textContent = '이메일 주소를 두 칸 모두 입력하세요.'; return; }
  if (a !== b) { msg.textContent = '두 이메일 주소가 서로 다릅니다.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) { msg.textContent = '이메일 형식이 올바르지 않습니다.'; return; }
  if (!suCaptcha.classList.contains('on')) { msg.textContent = '사람인지 확인해 주세요.'; return; }
  if (!$('#suAgree').checked) { msg.textContent = '약관에 동의해야 계속할 수 있습니다.'; return; }

  openVerify(a);
});

// ===============================================================
// 부팅
// ===============================================================
const fillAllBg = () => { fillLoginBg(); fillSignupBg(); fillCreateBg(); fillDoneBg(); };

paintUser();
fillAllBg();
showView(viewFromHash());

fetch('/api/home')
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then((data) => { render(data); fillAllBg(); })
  .catch((err) => {
    $('#app').innerHTML = `<div class="err">DB에서 데이터를 불러오지 못했습니다.<br>${esc(err.message)}<br><br>서버 콘솔을 확인하세요.</div>`;
  });
