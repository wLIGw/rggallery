const PHOTOS = [
  "img/1.jpeg","img/2.jpeg","img/3.jpeg","img/4.jpeg","img/5.jpeg","img/6.jpeg",
  "img/7.jpeg","img/8.jpeg","img/9.jpeg","img/10.jpeg","img/11.jpeg","img/12.jpeg",
  "img/13.jpg","img/14.jpg","img/15.jpg","img/16.jpg","img/17.jpg","img/18.jpg",
  "img/19.jpg","img/20.jpg","img/21.jpg","img/22.jpg","img/23.jpg","img/24.jpg",
  "img/25.jpg","img/26.jpg","img/27.jpg","img/28.jpg","img/29.jpg"
];

/* ====================================================================
   КОНТАКТНЫЕ ДАННЫЕ
==================================================================== */
const CONTACT_INFO = {
  name:      'Ваше Имя',
  title:     'Фотограф / Художник',
  email:     'hello@example.com',
  phone:     '+7 (999) 000-00-00',
  instagram: '@yourinstagram',
  website:   'www.yoursite.com',
  extra:     ''
};

/* ====================================================================
   ОПТИМИЗАЦИЯ: единый CSS для производительности (GPU-слои)
==================================================================== */
(function injectPerfCSS() {
  const s = document.createElement('style');
  s.textContent = `
    #scene { contain: layout style; }
    .photo { contain: layout style paint; position: absolute; top: 0; left: 0;
             will-change: transform, opacity; box-sizing: border-box;
             background: #f2f1ec; box-shadow: 0 10px 35px rgba(0,0,0,0.55);
             border-radius: 1px; backface-visibility: hidden;
             -webkit-backface-visibility: hidden; }
    .photo img { display: block; width: 100%; height: 100%; object-fit: cover;
                 -webkit-user-drag: none; user-select: none; pointer-events: none; }
  `;
  document.head.appendChild(s);
})();

const scene = document.getElementById('scene');
let W = window.innerWidth;
let H = window.innerHeight;
window.addEventListener('resize', () => {
  W = window.innerWidth;
  H = window.innerHeight;
  updateLogoSize();
});

/* ====================================================================
   КОНФИГ — дефолты из скриншотов
==================================================================== */
const CONFIG = {
  minWidth:         200,
  maxWidth:         200,
  ratio:            1.40,
  minDuration:      9.0,
  maxDuration:      18.1,
  maxScale:         2.00,
  minSpawnDistance: 0.10,
  spread:           0.90,
  spawnMode:        'grid',
  overlap:          0.13,
  spawnInterval:    400,
  minRotation:      0,
  maxRotation:      0,
  fadeIn:           0.05,
  fadeOut:          0.15,
  border:           0,
  logoEnabled:      false,
  logoSize:         310,
  logoPadding:      0
};

(function loadSavedConfig() {
  try {
    const saved = localStorage.getItem('photoflow_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(k => { if (k in CONFIG) CONFIG[k] = parsed[k]; });
    }
  } catch(e) {}
})();

function saveConfig() {
  try { localStorage.setItem('photoflow_config', JSON.stringify(CONFIG)); } catch(e) {}
}

/* ====================================================================
   ЛОГОТИП
==================================================================== */
const logoEl = document.createElement('img');
logoEl.src = 'img/logo_white.png';
logoEl.id  = 'logo';
logoEl.style.cssText = [
  'position:fixed','top:50%','left:50%',
  'transform:translate(-50%,-50%)',
  'z-index:100000','pointer-events:none',
  'display:none','object-fit:contain'
].join(';');
document.body.appendChild(logoEl);

function updateLogoSize() {
  logoEl.style.width  = CONFIG.logoSize + 'px';
  logoEl.style.height = 'auto';
}
updateLogoSize();

function setLogoVisible(v) { logoEl.style.display = v ? 'block' : 'none'; }
setLogoVisible(CONFIG.logoEnabled);

function getLogoBlockZone() {
  if (!CONFIG.logoEnabled) return null;
  const logoW = CONFIG.logoSize;
  const logoH = (logoEl.naturalHeight && logoEl.naturalWidth)
    ? CONFIG.logoSize * (logoEl.naturalHeight / logoEl.naturalWidth)
    : CONFIG.logoSize;
  return { hw: logoW / 2 + CONFIG.logoPadding, hh: logoH / 2 + CONFIG.logoPadding };
}

/* ====================================================================
   СПАВН-ТОЧКИ
==================================================================== */
let gridState = [];
let photos    = [];

function isTooCloseToLogo(x, y) {
  if (!CONFIG.logoEnabled) return false;
  const zone = getLogoBlockZone();
  if (!zone) return false;
  // проверяем несколько точек на траектории
  for (let t = 0.5; t <= 1.0; t += 0.1) {
    const f = 0.3 + t * 1.3;
    if (Math.abs(x * f) < zone.hw && Math.abs(y * f) < zone.hh) return true;
  }
  return false;
}

function pickSpawnPointRandom() {
  const now = performance.now();
  const cutoff = now - 1500;
  // только недавно появившиеся для проверки расстояния
  const recent = [];
  for (let i = 0; i < photos.length; i++) {
    if (photos[i].start > cutoff) recent.push(photos[i]);
  }

  const overlapFactor = 1 - Math.min(0.95, CONFIG.overlap);
  const minDist = CONFIG.minSpawnDistance * Math.min(W, H) * overlapFactor;
  const minDist2 = minDist * minDist;

  for (let attempt = 0; attempt < 40; attempt++) {
    const x = (Math.random() - 0.5) * W * CONFIG.spread;
    const y = (Math.random() - 0.5) * H * CONFIG.spread;
    if (isTooCloseToLogo(x, y)) continue;

    let ok = true;
    for (let j = 0; j < recent.length; j++) {
      const dx = recent[j].x - x, dy = recent[j].y - y;
      if (dx * dx + dy * dy < minDist2) { ok = false; break; }
    }
    if (ok) return { x, y };
  }

  // Запасной — просто любая точка без лого
  for (let attempt = 0; attempt < 15; attempt++) {
    const x = (Math.random() - 0.5) * W * CONFIG.spread;
    const y = (Math.random() - 0.5) * H * CONFIG.spread;
    if (!isTooCloseToLogo(x, y)) return { x, y };
  }
  return {
    x: (Math.random() - 0.5) * W * CONFIG.spread,
    y: (Math.random() - 0.5) * H * CONFIG.spread
  };
}

function pickSpawnPointGrid() {
  // Сетка, адаптированная под размер карточек
  const cellW0 = Math.max(CONFIG.minWidth, CONFIG.maxWidth) * 1.4;
  const cellH0 = cellW0 * CONFIG.ratio;
  const cols = Math.max(2, Math.round(W / cellW0));
  const rows = Math.max(2, Math.round(H / cellH0));
  const cellW = W / cols;
  const cellH = H / rows;

  const cooldown = Math.max(500, (CONFIG.spawnInterval * cols * rows) * 0.8);
  const now = performance.now();
  gridState = gridState.filter(c => now - c.time < cooldown);
  const occupied = new Set(gridState.map(c => `${c.col}:${c.row}`));

  const free = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (occupied.has(`${c}:${r}`)) continue;
      const cx = c * cellW + cellW / 2 - W / 2;
      const cy = r * cellH + cellH / 2 - H / 2;
      if (!isTooCloseToLogo(cx, cy)) free.push({ col: c, row: r, cx, cy });
    }
  }

  let chosen;
  if (free.length > 0) {
    chosen = free[Math.floor(Math.random() * free.length)];
    gridState.push({ col: chosen.col, row: chosen.row, time: now });
  } else {
    // Все ячейки заняты — берём самую старую
    if (gridState.length > 0) {
      gridState.sort((a, b) => a.time - b.time);
      const old = gridState.shift();
      const cx = old.col * cellW + cellW / 2 - W / 2;
      const cy = old.row * cellH + cellH / 2 - H / 2;
      gridState.push({ col: old.col, row: old.row, time: now });
      chosen = { col: old.col, row: old.row, cx, cy };
    } else {
      return pickSpawnPointRandom();
    }
  }

  const jitter = CONFIG.overlap * 0.5;
  return {
    x: chosen.cx + (Math.random() - 0.5) * cellW * jitter,
    y: chosen.cy + (Math.random() - 0.5) * cellH * jitter
  };
}

function pickSpawnPoint() {
  return CONFIG.spawnMode === 'grid' ? pickSpawnPointGrid() : pickSpawnPointRandom();
}

/* ====================================================================
   Класс Photo — стабильный z-index, нет мерцания
==================================================================== */
let _photoCounter = 0;

class Photo {
  constructor() {
    this._id = ++_photoCounter; // уникальный стабильный ID

    this.el = document.createElement('div');
    this.el.className = 'photo';
    this.el.style.padding  = CONFIG.border + 'px';
    this.el.style.cursor   = 'grab';
    this.el.style.width    = '0';    // временно, обновим ниже
    this.el.style.height   = '0';

    const img = document.createElement('img');
    img.src = this._pickPhoto();
    this.el.appendChild(img);

    const lo = Math.min(CONFIG.minWidth, CONFIG.maxWidth);
    const hi = Math.max(CONFIG.minWidth, CONFIG.maxWidth);
    const width = lo + Math.random() * (hi - lo);
    this.el.style.width  = width + 'px';
    this.el.style.height = (width * CONFIG.ratio) + 'px';

    const pt = pickSpawnPoint();
    this.x = pt.x;
    this.y = pt.y;

    const minR = Math.min(CONFIG.minRotation, CONFIG.maxRotation);
    const maxR = Math.max(CONFIG.minRotation, CONFIG.maxRotation);
    const angle = minR + Math.random() * (maxR - minR);
    this.rotation = (Math.random() < 0.5 ? 1 : -1) * angle;

    const dlo = Math.min(CONFIG.minDuration, CONFIG.maxDuration);
    const dhi = Math.max(CONFIG.minDuration, CONFIG.maxDuration);
    this.duration = (dlo + Math.random() * (dhi - dlo)) * 1000;

    this.start = performance.now();
    this.dead  = false;

    this.dragging      = false;
    this.inPopup       = false;
    this.popupStartTime = 0;
    this.lastScale     = 0.05;
    this.lastOpacity   = 0;
    this.pointerOffsetX = 0;
    this.pointerOffsetY = 0;
    this.dragScreenX   = 0;
    this.dragScreenY   = 0;
    this.dragStartTime = 0;

    scene.appendChild(this.el);
    this._bindDrag();
  }

  _pickPhoto() {
    // Избегаем одинаковых фото рядом (приближённо)
    const proximityR2 = (Math.min(W, H) * 0.35) ** 2;
    const nearbySrcs  = new Set();
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const dx = p.x - this.x, dy = p.y - this.y;
      if (dx * dx + dy * dy < proximityR2) {
        const img = p.el.querySelector('img');
        if (img) nearbySrcs.add(img.getAttribute('src'));
      }
    }

    let src = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
    if (nearbySrcs.size < PHOTOS.length) {
      for (let i = 0; i < 10; i++) {
        const c = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
        if (!nearbySrcs.has(c)) { src = c; break; }
      }
    }
    return src;
  }

  _bindDrag() {
    let startX = 0, startY = 0, hasMoved = false;

    this.el.addEventListener('pointerdown', e => {
      e.preventDefault();
      startX = e.clientX; startY = e.clientY; hasMoved = false;
      this.dragging = true;
      this.dragStartTime = performance.now();
      this.el.style.cursor = 'grabbing';
      this.el.setPointerCapture(e.pointerId);
      this.el.style.zIndex = 9999999;
      const rect = this.el.getBoundingClientRect();
      this.pointerOffsetX = e.clientX - (rect.left + rect.width  / 2);
      this.pointerOffsetY = e.clientY - (rect.top  + rect.height / 2);
      this.dragScreenX = rect.left + rect.width  / 2;
      this.dragScreenY = rect.top  + rect.height / 2;
    });

    this.el.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      if (!hasMoved && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) hasMoved = true;
      this.dragScreenX = e.clientX - this.pointerOffsetX;
      this.dragScreenY = e.clientY - this.pointerOffsetY;
      this.el.style.transform =
        `translate(-50%,-50%) translate3d(${this.dragScreenX}px,${this.dragScreenY}px,0) scale(${this.lastScale}) rotate(${this.rotation}deg)`;
    });

    const release = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.style.cursor = 'grab';
      if (!hasMoved) { openPopup(this); return; }
      const now = performance.now();
      this.start += now - this.dragStartTime;
      const t = Math.max(0.001, Math.min(0.999, (now - this.start) / this.duration));
      const factor = 0.3 + t * 1.3;
      this.x = (this.dragScreenX - W / 2) / factor;
      this.y = (this.dragScreenY - H / 2) / factor;
    };

    this.el.addEventListener('pointerup',     release);
    this.el.addEventListener('pointercancel', release);
  }

  update(now) {
    if (this.dragging || this.inPopup) return;

    const t = (now - this.start) / this.duration;
    if (t >= 1) { this.dead = true; this.el.remove(); return; }

    const scale = 0.05 + t * CONFIG.maxScale;
    const fi = CONFIG.fadeIn, fo = CONFIG.fadeOut;
    let opacity = t < fi ? t / fi : t > 1 - fo ? (1 - t) / fo : 1;
    if (opacity < 0) opacity = 0; else if (opacity > 1) opacity = 1;

    this.lastScale   = scale;
    this.lastOpacity = opacity;

    const x = this.x * (0.3 + t * 1.3);
    const y = this.y * (0.3 + t * 1.3);

    this.el.style.transform =
      `translate(-50%,-50%) translate3d(${W/2+x}px,${H/2+y}px,0) scale(${scale}) rotate(${this.rotation}deg)`;
    this.el.style.opacity = opacity.toFixed(3);

    // ── АНТИМЕРЦАНИЕ: z-index = (масштабный бакет * большой шаг) + стабильный ID ──
    // Карточки одной глубины упорядочиваются по времени рождения (стабильно, без флика)
    this.el.style.zIndex = (Math.floor(scale * 2000) * 100000 + this._id) | 0;
  }
}

/* ====================================================================
   ДВИЖОК АНИМАЦИИ
   - Чистый старт: никаких предзагруженных карточек
   - Первая карточка появляется спустя один интервал
   - Спавн через rAF-loop (не setInterval) → динамически читает CONFIG
   - Запускается ровно один раз
==================================================================== */
let _engineStarted = false;
let _nextSpawnAt   = 0;

function startEverything() {
  if (_engineStarted) return;
  _engineStarted = true;

  scene.innerHTML = '';
  photos     = [];
  gridState  = [];
  _nextSpawnAt = performance.now() + CONFIG.spawnInterval;

  (function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();

    // Спавн
    if (now >= _nextSpawnAt) {
      try { photos.push(new Photo()); } catch(e) { console.error('spawn:', e); }
      _nextSpawnAt = now + Math.max(16, CONFIG.spawnInterval);
    }

    // Обновление
    for (let i = photos.length - 1; i >= 0; i--) {
      const p = photos[i];
      try { p.update(now); } catch(e) {
        p.dead = true;
        try { p.el.remove(); } catch(e2) {}
      }
      if (p.dead) photos.splice(i, 1);
    }
  })();
}

if (CONFIG.logoEnabled && !logoEl.complete) {
  logoEl.addEventListener('load',  startEverything, { once: true });
  logoEl.addEventListener('error', startEverything, { once: true });
} else {
  startEverything();
}

/* ====================================================================
   ПОПАП
==================================================================== */
let popupOpen = false;

function _injectPopupStyles() {
  if (document.getElementById('popup-styles')) return;
  const s = document.createElement('style');
  s.id = 'popup-styles';
  s.textContent = `
    #popup-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0);
      z-index: 100001;
      transition: background .5s ease;
      cursor: default;
    }
    #popup-scene {
      position: fixed; z-index: 100002;
      perspective: 1400px; -webkit-perspective: 1400px;
      transition:
        left   .58s cubic-bezier(.4,0,.2,1),
        top    .58s cubic-bezier(.4,0,.2,1),
        width  .58s cubic-bezier(.4,0,.2,1),
        height .58s cubic-bezier(.4,0,.2,1),
        transform .4s cubic-bezier(.4,0,.2,1);
    }
    #popup-card {
      width: 100%; height: 100%;
      transform-style: preserve-3d;
      -webkit-transform-style: preserve-3d;
      transition: transform .72s cubic-bezier(.4,0,.2,1);
      position: relative;
    }
    .popup-face {
      position: absolute; inset: 0;
      backface-visibility: hidden; -webkit-backface-visibility: hidden;
    }
    .popup-front {
      background: #f2f1ec;
      box-shadow: 0 20px 60px rgba(0,0,0,.7);
      border-radius: 2px; box-sizing: border-box; overflow: hidden;
    }
    .popup-front img { width:100%; height:100%; object-fit:cover; display:block; }
    .popup-back {
      transform: rotateY(180deg); -webkit-transform: rotateY(180deg);
      background: #0e0e10; border-radius: 10px;
      box-shadow: 0 40px 100px rgba(0,0,0,.95);
      display: flex; overflow: hidden; border-radius: 0.3px;
    }
    /* Галерея */
  
    .popup-gallery.g1 { grid-template-columns:1fr; grid-template-rows:1fr; }
    .popup-gallery.g2 { grid-template-columns:1fr 1fr; grid-template-rows:1fr; }
    .popup-gallery.g3 { grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
    .popup-gallery.g3 .img-wrapper:first-child { grid-row: 1 / -1; }
    .popup-gallery.g4 { grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
    .img-wrapper { overflow: hidden; min-width:0; min-height:0; cursor:zoom-in; border-radius:3px; }
    .img-wrapper img {
      width:100%; height:100%; object-fit:cover; display:block;
      transition: transform .3s ease;
    }
    .img-wrapper:hover img { transform: scale(1.04); }
    /* Контакты */
    .popup-contact {
      width: 280px; flex-shrink: 0;
      padding: 50px 36px;
      display: flex; flex-direction: column; justify-content: center;
      border-left: 1px solid rgba(255,255,255,.06);
      box-sizing: border-box; overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      color: #fff;
    }
    .pc-name  { font-size:22px; font-weight:700; margin-bottom:5px; letter-spacing:-.2px; }
    .pc-title { font-size:10px; color:#555; letter-spacing:2px; text-transform:uppercase; margin-bottom:36px; }
    .pc-field { margin-bottom:20px; }
    .pc-label { font-size:8.5px; color:#3a3a3a; letter-spacing:1.8px; text-transform:uppercase; margin-bottom:5px; }
    .pc-value { font-size:13px; color:#bbb; }
    .pc-extra { margin-top:24px; font-size:12px; color:#444; line-height:1.7; }
    /* Кнопка закрытия */
    #popup-close-btn {
      position:absolute; top:16px; right:16px;
      width:32px; height:32px; border-radius:50%;
      background:rgba(255,255,255,.07);
      border:1px solid rgba(255,255,255,.13);
      color:#fff; font-size:14px; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      z-index:10; transition:background .2s, transform .2s;
    }
    #popup-close-btn:hover { background:rgba(255,255,255,.18); transform:scale(1.1); }
    /* Fullscreen viewer */
    #fsv-overlay {
      position:fixed; inset:0; z-index:200000;
      background:rgba(0,0,0,.95);
      display:none; align-items:center; justify-content:center;
    }
    #fsv-overlay.active { display:flex; }
    #fsv-wrapper {
      position:relative; width:100%; height:100%;
      display:flex; align-items:center; justify-content:center;
      overflow:hidden;
    }
    #fsv-img {
      max-width:90vw; max-height:90vh;
      object-fit:contain; user-select:none;
      cursor:default;
      transition:transform .1s ease;
    }
    .fsv-btn {
      position:fixed; z-index:200001;
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.15);
      color:#fff; font-size:22px; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      transition:background .2s;
    }
    .fsv-btn:hover { background:rgba(255,255,255,.18); }
    #fsv-close {
      top:16px; right:16px; width:36px; height:36px; border-radius:50%;
    }
    #fsv-prev { left:16px; top:50%; transform:translateY(-50%); width:44px; height:44px; border-radius:50%; }
    #fsv-next { right:16px; top:50%; transform:translateY(-50%); width:44px; height:44px; border-radius:50%; }
    #fsv-counter {
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      color:rgba(255,255,255,.5); font-size:13px;
      font-family:-apple-system,sans-serif;
      z-index:200001;
    }
  `;
  document.head.appendChild(s);
}

function makeContactField(label, value) {
  if (!value) return '';
  return `<div class="pc-field"><div class="pc-label">${label}</div><div class="pc-value">${value}</div></div>`;
}

function openPopup(photo) {
  if (popupOpen) return;
  popupOpen = true;
  _injectPopupStyles();

  photo.inPopup       = true;
  photo.popupStartTime = performance.now();

  const rect      = photo.el.getBoundingClientRect();
  const border    = parseInt(photo.el.style.padding) || CONFIG.border;
  const photoSrc  = photo.el.querySelector('img').src;
  const initialRot = photo.rotation;

  const counts = [1, 2, 4];
  const galleryCount = counts[Math.floor(Math.random() * counts.length)];
  const pool = [...PHOTOS].filter(p => !photoSrc.endsWith(p));
  const galleryImgs = [photoSrc];
  for (let i = 1; i < galleryCount && pool.length; i++) {
    galleryImgs.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }

  const overlay = document.createElement('div');
  overlay.id = 'popup-overlay';

  const popupScene = document.createElement('div');
  popupScene.id = 'popup-scene';
  Object.assign(popupScene.style, {
    left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', height: rect.height + 'px',
    transform: `rotate(${initialRot}deg)`
  });

  const card = document.createElement('div');
  card.id = 'popup-card';

  const front = document.createElement('div');
  front.className = 'popup-face popup-front';
  front.style.padding = border + 'px';
  const frontImg = document.createElement('img');
  frontImg.src = photoSrc;
  front.appendChild(frontImg);

  const back = document.createElement('div');
  back.className = 'popup-face popup-back';

  const gallery = document.createElement('div');
  gallery.className = `popup-gallery g${galleryImgs.length}`;
  galleryImgs.forEach(src => {
    const wrapper = document.createElement('div');
    wrapper.className = 'img-wrapper';
    const img = document.createElement('img');
    img.src = src;
    wrapper.appendChild(img);
    gallery.appendChild(wrapper);
  });

  // Вычисляем размеры галереи под соотношение сторон фото
  const imgRatio = 1 / CONFIG.ratio; // ширина / высота одного фото
  let galleryH = Math.min(window.innerHeight * 0.82, 760);
  let galleryW = 0;
  if      (galleryImgs.length === 1) galleryW = galleryH * imgRatio;
  else if (galleryImgs.length === 2) galleryW = galleryH * imgRatio * 2;
  else if (galleryImgs.length === 3) galleryW = galleryH * imgRatio * 1.5;
  else                               galleryW = galleryH * imgRatio;      // 4 фото (2×2)

  const maxGW = window.innerWidth * 0.65;
  if (galleryW > maxGW) {
    galleryW = maxGW;
    if      (galleryImgs.length === 2) galleryH = (galleryW / 2) / imgRatio;
    else if (galleryImgs.length === 3) galleryH = (galleryW / 1.5) / imgRatio;
    else                               galleryH = galleryW / imgRatio;
  }

  gallery.style.width     = galleryW + 'px';
  gallery.style.height    = galleryH + 'px';
  gallery.style.flexShrink = '0';

  const contact = document.createElement('div');
  contact.className = 'popup-contact';
  contact.innerHTML = `
    <div class="pc-name">${CONTACT_INFO.name}</div>
    <div class="pc-title">${CONTACT_INFO.title}</div>
    ${makeContactField('Email',     CONTACT_INFO.email)}
    ${makeContactField('Телефон',   CONTACT_INFO.phone)}
    ${makeContactField('Instagram', CONTACT_INFO.instagram)}
    ${makeContactField('Сайт',      CONTACT_INFO.website)}
    ${CONTACT_INFO.extra ? `<div class="pc-extra">${CONTACT_INFO.extra}</div>` : ''}
  `;

  const closeBtn = document.createElement('button');
  closeBtn.id = 'popup-close-btn';
  closeBtn.innerHTML = '✕';

  back.appendChild(gallery);
  back.appendChild(contact);
  back.appendChild(closeBtn);
  card.appendChild(front);
  card.appendChild(back);
  popupScene.appendChild(card);

  photo.el.style.opacity = '0';
  photo.el.style.pointerEvents = 'none';

  document.body.appendChild(overlay);
  document.body.appendChild(popupScene);

  const contactW = 300;
  const targetW  = galleryW + contactW;
  const targetH  = galleryH;
  const targetL  = (window.innerWidth  - targetW) / 2;
  const targetT  = (window.innerHeight - targetH) / 2;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.style.background = 'rgba(0,0,0,0.85)';
    card.style.transform = 'rotateY(180deg)';
    Object.assign(popupScene.style, {
      left: targetL + 'px', top: targetT + 'px',
      width: targetW + 'px', height: targetH + 'px',
      transform: 'rotate(0deg)'
    });
  }));

  let closing = false;
  function doClose() {
    if (closing) return;
    closing = true;

    const closeStart = performance.now();
    const elapsed = closeStart - photo.popupStartTime;
    const tempStart = photo.start + elapsed;
    const t = Math.max(0.001, Math.min(0.97, (closeStart - tempStart) / photo.duration));
    const scale = 0.05 + t * CONFIG.maxScale;
    const px = photo.x * (0.3 + t * 1.3);
    const py = photo.y * (0.3 + t * 1.3);
    const elW = parseFloat(photo.el.style.width)  * scale;
    const elH = parseFloat(photo.el.style.height) * scale;
    const retL = W / 2 + px - elW / 2;
    const retT = H / 2 + py - elH / 2;

    overlay.style.background = 'rgba(0,0,0,0)';
    card.style.transform = 'rotateY(0deg)';
    Object.assign(popupScene.style, {
      left: retL + 'px', top: retT + 'px',
      width: elW + 'px', height: elH + 'px',
      transform: `rotate(${initialRot}deg)`
    });

    let done = false;
    popupScene.addEventListener('transitionend', function onDone(e) {
      if (done || e.propertyName !== 'width') return;
      done = true;
      popupScene.removeEventListener('transitionend', onDone);

      photo.start += elapsed + (performance.now() - closeStart);
      photo.update(performance.now());
      photo.el.style.opacity = '';
      photo.el.style.pointerEvents = '';
      photo.inPopup = false;
      popupOpen = false;
      overlay.remove();
      popupScene.remove();
    });
  }

  closeBtn.addEventListener('click', e => { e.stopPropagation(); doClose(); });
  overlay.addEventListener('click', doClose);
}

document.body.addEventListener('click', e => {
  const wrapper = e.target.closest('.popup-gallery .img-wrapper');
  if (!wrapper) return;
  const clickedImg = wrapper.querySelector('img');
  if (!clickedImg) return;
  const galleryEl = wrapper.closest('.popup-gallery');
  const imgs = galleryEl
    ? Array.from(galleryEl.querySelectorAll('img')).map(i => i.src)
    : [clickedImg.src];
  const idx = imgs.indexOf(clickedImg.src);
  globalViewer.open(imgs, idx >= 0 ? idx : 0);
});

/* ====================================================================
   ПОЛНОЭКРАННЫЙ ПРОСМОТР
==================================================================== */
class FullscreenViewer {
  constructor() {
    this.images = []; this.currentIndex = 0; this.isOpen = false;
    this.scale = 1; this.tx = 0; this.ty = 0;
    this.isDragging = false; this.startX = 0; this.startY = 0;
    this.initialDist = 0;
    this._createDOM(); this._bindEvents();
  }

  _createDOM() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'fsv-overlay';
    this.overlay.innerHTML = `
      <div id="fsv-wrapper"><img id="fsv-img" src="" alt="" draggable="false"></div>
      <button id="fsv-close" class="fsv-btn">✕</button>
      <button id="fsv-prev"  class="fsv-btn">‹</button>
      <button id="fsv-next"  class="fsv-btn">›</button>
      <div id="fsv-counter"></div>
    `;
    document.body.appendChild(this.overlay);
    this.img     = this.overlay.querySelector('#fsv-img');
    this.counter = this.overlay.querySelector('#fsv-counter');
  }

  open(images, startIndex) {
    this.images = images; this.currentIndex = startIndex; this.isOpen = true;
    this.overlay.classList.add('active');
    this.resetZoom(); this.loadImage();
    const show = images.length > 1;
    this.overlay.querySelector('#fsv-prev').style.display = show ? 'flex' : 'none';
    this.overlay.querySelector('#fsv-next').style.display = show ? 'flex' : 'none';
  }

  close()  { this.isOpen = false; this.overlay.classList.remove('active'); }
  prev()   { this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length; this.loadImage(); }
  next()   { this.currentIndex = (this.currentIndex + 1) % this.images.length; this.loadImage(); }

  loadImage() {
    if (!this.images[this.currentIndex]) return;
    this.img.src = this.images[this.currentIndex];
    this.counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
    this.resetZoom();
  }

  resetZoom() { this.scale = 1; this.tx = 0; this.ty = 0; this._applyTransform(); }

  _applyTransform() {
    this.img.style.transform = `translate(${this.tx}px,${this.ty}px) scale(${this.scale})`;
  }

  _bindEvents() {
    const o = this.overlay;
    o.querySelector('#fsv-close').addEventListener('click', () => this.close());
    o.querySelector('#fsv-prev').addEventListener('click', e => { e.stopPropagation(); this.prev(); });
    o.querySelector('#fsv-next').addEventListener('click', e => { e.stopPropagation(); this.next(); });
    o.querySelector('#fsv-wrapper').addEventListener('click', e => { if (e.target === e.currentTarget) this.close(); });

    window.addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.key === 'Escape')      this.close();
      if (e.key === 'ArrowLeft')   this.prev();
      if (e.key === 'ArrowRight')  this.next();
    });

    o.addEventListener('wheel', e => {
      if (!this.isOpen) return;
      e.preventDefault();
      const d = e.deltaY < 0 ? 0.12 : -0.12;
      this.scale = Math.max(1, Math.min(5, this.scale + d));
      if (this.scale === 1) { this.tx = 0; this.ty = 0; }
      this._applyTransform();
    }, { passive: false });

    this.img.addEventListener('dblclick', () => {
      if (this.scale > 1) this.resetZoom();
      else { this.scale = 2.5; this._applyTransform(); }
    });

    const startDrag = (cx, cy) => {
      this.isDragging = true;
      this.startX = cx - this.tx; this.startY = cy - this.ty;
    };
    const moveDrag = (cx, cy) => {
      if (!this.isDragging || this.scale <= 1) return;
      this.tx = cx - this.startX; this.ty = cy - this.startY;
      this._applyTransform();
    };
    const endDrag = () => { this.isDragging = false; };

    this.img.addEventListener('mousedown', e => startDrag(e.clientX, e.clientY));
    window.addEventListener('mousemove',  e => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup',    endDrag);

    this.img.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        this.initialDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    this.img.addEventListener('touchmove', e => {
      if (e.touches.length === 1) {
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        this.scale = Math.max(1, Math.min(5, this.scale * (d / this.initialDist)));
        this.initialDist = d;
        if (this.scale === 1) { this.tx = 0; this.ty = 0; }
        this._applyTransform();
      }
    }, { passive: true });

    this.img.addEventListener('touchend',   endDrag);
    this.img.addEventListener('touchcancel',endDrag);
  }
}

const globalViewer = new FullscreenViewer();

/* ====================================================================
   ПАНЕЛЬ НАСТРОЕК
==================================================================== */
(function initSettingsPanel() {
  const panel     = document.getElementById('settings-panel');
  const header    = document.getElementById('settings-header');
  const toggleBtn = document.getElementById('settings-toggle');
  if (!panel || !header || !toggleBtn) return;

  const bindings = [
    { id:'s-minw',        key:'minWidth',         out:'v-minw',        fmt: v => Math.round(v)    + ' px' },
    { id:'s-maxw',        key:'maxWidth',         out:'v-maxw',        fmt: v => Math.round(v)    + ' px' },
    { id:'s-ratio',       key:'ratio',            out:'v-ratio',       fmt: v => v.toFixed(2)              },
    { id:'s-mindur',      key:'minDuration',      out:'v-mindur',      fmt: v => v.toFixed(1)     + ' с'  },
    { id:'s-maxdur',      key:'maxDuration',      out:'v-maxdur',      fmt: v => v.toFixed(1)     + ' с'  },
    { id:'s-maxscale',    key:'maxScale',         out:'v-maxscale',    fmt: v => 'x' + v.toFixed(2)       },
    { id:'s-interval',    key:'spawnInterval',    out:'v-interval',    fmt: v => Math.round(v)    + ' мс' },
    { id:'s-overlap',     key:'overlap',          out:'v-overlap',     fmt: v => v.toFixed(2)              },
    { id:'s-spawndist',   key:'minSpawnDistance', out:'v-spawndist',   fmt: v => v.toFixed(2)              },
    { id:'s-spread',      key:'spread',           out:'v-spread',      fmt: v => 'x' + v.toFixed(2)       },
    { id:'s-minrotation', key:'minRotation',      out:'v-minrotation', fmt: v => Math.round(v)    + '°'   },
    { id:'s-maxrotation', key:'maxRotation',      out:'v-maxrotation', fmt: v => Math.round(v)    + '°'   },
    { id:'s-fadein',      key:'fadeIn',           out:'v-fadein',      fmt: v => v.toFixed(2)              },
    { id:'s-fadeout',     key:'fadeOut',          out:'v-fadeout',     fmt: v => v.toFixed(2)              },
    { id:'s-border',      key:'border',           out:'v-border',      fmt: v => Math.round(v)    + ' px' },
    { id:'s-logosize',    key:'logoSize',         out:'v-logosize',    fmt: v => Math.round(v)    + ' px' },
    { id:'s-logopadding', key:'logoPadding',      out:'v-logopadding', fmt: v => Math.round(v)    + ' px' },
  ];

  bindings.forEach(b => {
    const input = document.getElementById(b.id);
    const out   = document.getElementById(b.out);
    if (!input || !out) return;
    input.value = CONFIG[b.key];
    out.textContent = b.fmt(CONFIG[b.key]);
    input.addEventListener('input', () => {
      CONFIG[b.key] = parseFloat(input.value);
      out.textContent = b.fmt(CONFIG[b.key]);
      if (b.key === 'logoSize') updateLogoSize();
      saveConfig();
    });
  });

  const logoCheck   = document.getElementById('s-logo');
  const logoOptions = document.getElementById('logo-options');
  if (logoCheck && logoOptions) {
    logoCheck.checked = CONFIG.logoEnabled;
    logoOptions.style.display = CONFIG.logoEnabled ? 'block' : 'none';
    logoCheck.addEventListener('change', () => {
      CONFIG.logoEnabled = logoCheck.checked;
      setLogoVisible(CONFIG.logoEnabled);
      logoOptions.style.display = CONFIG.logoEnabled ? 'block' : 'none';
      saveConfig();
    });
  }

  const modeSelect = document.getElementById('s-spawnmode');
  if (modeSelect) {
    modeSelect.value = CONFIG.spawnMode;
    modeSelect.addEventListener('change', () => {
      CONFIG.spawnMode = modeSelect.value;
      gridState = [];
      saveConfig();
    });
  }

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '—';
  });

  let drag = false, ox = 0, oy = 0;
  const startD = (cx, cy) => {
    drag = true;
    const r = panel.getBoundingClientRect();
    ox = cx - r.left; oy = cy - r.top;
    panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
  };
  const moveD = (cx, cy) => {
    if (!drag) return;
    panel.style.left = Math.max(0, Math.min(cx - ox, innerWidth  - panel.offsetWidth))  + 'px';
    panel.style.top  = Math.max(0, Math.min(cy - oy, innerHeight - panel.offsetHeight)) + 'px';
  };
  const endD = () => { drag = false; };

  header.addEventListener('mousedown',  e => { startD(e.clientX, e.clientY); e.preventDefault(); });
  window.addEventListener('mousemove',  e => moveD(e.clientX, e.clientY));
  window.addEventListener('mouseup',    endD);
  header.addEventListener('touchstart', e => { const t = e.touches[0]; startD(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchmove',  e => { const t = e.touches[0]; moveD(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchend',   endD);
})();