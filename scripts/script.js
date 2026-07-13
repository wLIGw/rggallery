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

const scene = document.getElementById('scene');
let W = window.innerWidth;
let H = window.innerHeight;
window.addEventListener('resize', () => { W = window.innerWidth; H = window.innerHeight; updateLogoSize(); });

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
  logoPadding:      0,
  coverage:         50   // % экрана, занимаемый карточками (10–90)
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
logoEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100000;pointer-events:none;display:none;object-fit:contain;';
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
  return {
    hw: logoW / 2 + CONFIG.logoPadding,
    hh: logoH / 2 + CONFIG.logoPadding
  };
}

/* ====================================================================
   СПАВН
==================================================================== */
let gridState = [];
let photos    = [];

function isTooCloseToLogo(x, y) {
  if (!CONFIG.logoEnabled) return false;
  const zone = getLogoBlockZone();
  if (!zone) return false;
  for (let t = 0.6; t <= 1.0; t += 0.05) {
    const factor = 0.3 + t * 1.3;
    const dx = Math.abs(x * factor);
    const dy = Math.abs(y * factor);
    if (dx < zone.hw && dy < zone.hh) return true;
  }
  return false;
}

function pickSpawnPointRandom(existingPoints = []) {
  const now = performance.now();
  const recent = photos.filter(p => (now - p.start) < 900);
  const overlapFactor = 1 - Math.min(0.95, CONFIG.overlap);
  const minDist = CONFIG.minSpawnDistance * Math.min(W, H) * overlapFactor;

  for (let attempt = 0; attempt < 50; attempt++) {
    const x = (Math.random() - 0.5) * W * CONFIG.spread;
    const y = (Math.random() - 0.5) * H * CONFIG.spread;

    let tooClose = recent.some(p => {
      const dx = p.x - x, dy = p.y - y;
      return Math.sqrt(dx*dx + dy*dy) < minDist;
    });

    if (!tooClose && existingPoints.length > 0) {
      tooClose = existingPoints.some(pt => {
        const dx = pt.x - x, dy = pt.y - y;
        return Math.sqrt(dx*dx + dy*dy) < minDist;
      });
    }

    if (!tooClose && !isTooCloseToLogo(x, y)) return { x, y };
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const x = (Math.random() - 0.5) * W * CONFIG.spread;
    const y = (Math.random() - 0.5) * H * CONFIG.spread;
    if (!isTooCloseToLogo(x, y)) return { x, y };
  }
  return { x: (Math.random() > 0.5 ? 1 : -1) * (W * 0.4), y: (Math.random() > 0.5 ? 1 : -1) * (H * 0.4) };
}

function pickSpawnPointGrid() {
  const cardW = Math.max(CONFIG.minWidth, CONFIG.maxWidth);

  // Квадратные ячейки со стороной ~1.6×ширина карточки.
  // Это даёт минимум 4 строки на экране (нет эффекта "только верх/низ")
  const cellSide = cardW * 1.6;
  const cols = Math.max(3, Math.round(W / cellSide));
  const rows = Math.max(4, Math.round(H / cellSide)); // ← минимум 4 строки
  const cellW = W / cols;
  const cellH = H / rows;
  const totalCells = cols * rows;

  // Cooldown: исходя из coverage — чем меньше %, тем дольше ячейка "пустует"
  // При coverage=50 cooldown ≈ avg_duration * (1 - 0.5) = половина полёта
  const avgDur = (CONFIG.minDuration + CONFIG.maxDuration) / 2 * 1000;
  const cooldown = Math.max(500, avgDur * (1 - CONFIG.coverage / 100));

  const now = performance.now();
  gridState = gridState.filter(c => (now - c.time) < cooldown);
  const occupied = new Set(gridState.map(c => c.col + ':' + c.row));

  // Все свободные ячейки в случайном порядке
  const free = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (occupied.has(c + ':' + r)) continue;
      const cx = c * cellW + cellW / 2 - W / 2;
      const cy = r * cellH + cellH / 2 - H / 2;
      if (!isTooCloseToLogo(cx, cy)) free.push({ col: c, row: r, cx, cy });
    }
  }

  // Перемешиваем для истинно случайного выбора
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }

  let chosen;
  if (free.length > 0) {
    chosen = free[0];
    gridState.push({ col: chosen.col, row: chosen.row, time: now });
  } else {
    // Все заняты — берём самую старую
    if (gridState.length > 0) {
      gridState.sort((a, b) => a.time - b.time);
      const old = gridState[0];
      old.time = now;
      chosen = {
        col: old.col, row: old.row,
        cx:  old.col * cellW + cellW / 2 - W / 2,
        cy:  old.row * cellH + cellH / 2 - H / 2
      };
    } else {
      const c = Math.floor(Math.random() * cols);
      const r = Math.floor(Math.random() * rows);
      chosen = { col: c, row: r, cx: c * cellW + cellW/2 - W/2, cy: r * cellH + cellH/2 - H/2 };
      gridState.push({ col: c, row: r, time: now });
    }
  }

  // Небольшое случайное смещение внутри ячейки
  const jx = (Math.random() - 0.5) * cellW * 0.25;
  const jy = (Math.random() - 0.5) * cellH * 0.25;
  return {
    x: chosen.cx + jx,
    y: chosen.cy + jy
  };
}

function pickSpawnPoint(existingPoints = []) {
  return CONFIG.spawnMode === 'grid' ? pickSpawnPointGrid() : pickSpawnPointRandom(existingPoints);
}

/* ====================================================================
   Класс Photo
==================================================================== */
let _photoCounter = 0; // для стабильного z-index (антимерцание)

class Photo {
  constructor(initialAgeFraction, predefinedPoint = null) {
    this._id = ++_photoCounter; // уникальный ID — не меняется, нет флика

    this.el = document.createElement('div');
    this.el.className = 'photo';
    this.el.style.padding = CONFIG.border + 'px';
    this.el.style.cursor = 'grab';
    this.el.style.touchAction = 'none';

    const pt = predefinedPoint ? predefinedPoint : pickSpawnPoint();
    this.x = pt.x;
    this.y = pt.y;

    let chosenSrc = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];

    if (photos.length > 0) {
      const proximityRadius = Math.min(W, H) * 0.35;
      const nearbySrcs = photos
        .filter(p => {
          const dx = p.x - this.x;
          const dy = p.y - this.y;
          return Math.sqrt(dx * dx + dy * dy) < proximityRadius;
        })
        .map(p => p.el.querySelector('img').src);

      if (nearbySrcs.length > 0) {
        for (let attempt = 0; attempt < 15; attempt++) {
          const isMatch = nearbySrcs.some(src => src.endsWith(chosenSrc));
          if (!isMatch) break;
          chosenSrc = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
        }
      }
    }

    const img = document.createElement('img');
    img.src = chosenSrc;
    img.draggable = false;
    this.el.appendChild(img);

    const lo = Math.min(CONFIG.minWidth, CONFIG.maxWidth);
    const hi = Math.max(CONFIG.minWidth, CONFIG.maxWidth);
    const width = lo + Math.random() * (hi - lo);
    this.el.style.width  = width + 'px';
    this.el.style.height = width * CONFIG.ratio + 'px';

    const minR = Math.min(CONFIG.minRotation, CONFIG.maxRotation);
    const maxR = Math.max(CONFIG.minRotation, CONFIG.maxRotation);
    const angle = minR + Math.random() * (maxR - minR);
    this.rotation = (Math.random() < 0.5 ? 1 : -1) * angle;

    const dlo = Math.min(CONFIG.minDuration, CONFIG.maxDuration);
    const dhi = Math.max(CONFIG.minDuration, CONFIG.maxDuration);
    this.duration = (dlo + Math.random()*(dhi-dlo)) * 1000;

    const age = (initialAgeFraction || 0) * this.duration;
    this.start = performance.now() - age;

    this.dead           = false;
    this.dragging       = false;
    this.inPopup        = false;
    this.popupStartTime = 0;
    this.lastScale      = 0.05;
    this.lastOpacity    = 0;
    this.pointerOffsetX = 0;
    this.pointerOffsetY = 0;
    this.dragScreenX    = 0;
    this.dragScreenY    = 0;
    this.dragStartTime  = 0;

    scene.appendChild(this.el);
    this._bindDrag();
  }

  _bindDrag() {
    let startX = 0, startY = 0, moved = false;

    this.el.addEventListener('pointerdown', e => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      moved  = false;

      this.dragging = true;
      this.dragStartTime = performance.now();
      this.el.style.cursor = 'grabbing';
      this.el.setPointerCapture(e.pointerId);
      // При перетаскивании — выше максимального z-index летящих карточек
      // Макс. у летящих: floor(2.0 * 2000) * 100000 ≈ 400 000 000
      // Ставим 2^31-1 — абсолютный максимум CSS z-index
      this.el.style.zIndex = 2147483647;
      const rect = this.el.getBoundingClientRect();
      this.pointerOffsetX = e.clientX - (rect.left + rect.width/2);
      this.pointerOffsetY = e.clientY - (rect.top  + rect.height/2);
      this.dragScreenX = rect.left + rect.width/2;
      this.dragScreenY = rect.top  + rect.height/2;
    });

    this.el.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;
      this.dragScreenX = e.clientX - this.pointerOffsetX;
      this.dragScreenY = e.clientY - this.pointerOffsetY;
      this.el.style.transform =
        `translate(-50%,-50%) translate(${this.dragScreenX}px,${this.dragScreenY}px) scale(${this.lastScale}) rotate(${this.rotation}deg)`;
    });

    const release = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.style.cursor = 'grab';
      if (!moved) { openPopup(this); return; }
      const now = performance.now();
      this.start += now - this.dragStartTime;
      const t = Math.max(0.001, Math.min(0.999, (now - this.start) / this.duration));
      const factor = 0.3 + t * 1.3;
      this.x = (this.dragScreenX - W/2) / factor;
      this.y = (this.dragScreenY - H/2) / factor;
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
    let opacity = t < fi ? t/fi : t > 1-fo ? (1-t)/fo : 1;
    opacity = Math.max(0, Math.min(1, opacity));

    this.lastScale   = scale;
    this.lastOpacity = opacity;
    const x = this.x * (0.3 + t*1.3);
    const y = this.y * (0.3 + t*1.3);

    this.el.style.transform =
      `translate(-50%,-50%) translate(${W/2+x}px,${H/2+y}px) scale(${scale}) rotate(${this.rotation}deg)`;
    this.el.style.opacity = opacity.toFixed(3);

    // Антимерцание: масштабный бакет * большой шаг + стабильный birthId
    // Карточки одной глубины упорядочиваются по времени рождения — порядок не меняется
    this.el.style.zIndex = (Math.floor(scale * 2000) * 100000 + this._id) | 0;
  }
}

/* ====================================================================
   Запуск анимации — чистый старт, карточки появляются с нуля
==================================================================== */
function startEverything() {
  scene.innerHTML = '';
  photos    = [];
  gridState = [];

  // Рекурсивный setTimeout: строго 1 карточка за тик, читает CONFIG динамически
  (function spawnNext() {
    const cardW    = Math.max(CONFIG.minWidth, CONFIG.maxWidth);
    const cardH    = cardW * CONFIG.ratio;
    const avgScale = 0.05 + CONFIG.maxScale * 0.48;
    const visArea  = Math.max(100, (cardW * avgScale) * (cardH * avgScale));
    const maxOnScreen = Math.max(2, Math.round((W * H * (CONFIG.coverage / 100)) / visArea));

    if (photos.length < maxOnScreen) {
      try { photos.push(new Photo(0)); } catch(e) { console.error(e); }
    }
    setTimeout(spawnNext, Math.max(50, CONFIG.spawnInterval));
  })();

  (function animate() {
    const now = performance.now();
    for (let i = photos.length - 1; i >= 0; i--) {
      try { photos[i].update(now); } catch(e) {
        photos[i].dead = true;
        photos[i].el && photos[i].el.remove();
      }
      if (photos[i].dead) photos.splice(i, 1);
    }
    requestAnimationFrame(animate);
  })();
}

if (CONFIG.logoEnabled && !logoEl.complete) {
  logoEl.addEventListener('load',  startEverything, { once: true });
  logoEl.addEventListener('error', startEverything, { once: true });
} else {
  setTimeout(startEverything, 40);
}

/* ====================================================================
   ПОПАП
==================================================================== */
let popupOpen = false;

function makeContactField(label, value) {
  if (!value) return '';
  return `<div class="pc-field"><div class="pc-label">${label}</div><div class="pc-value">${value}</div></div>`;
}

function openPopup(photo) {
  if (popupOpen) return;
  popupOpen = true;

  photo.inPopup       = true;
  photo.popupStartTime = performance.now();

  const rect      = photo.el.getBoundingClientRect();
  const border    = parseInt(photo.el.style.padding) || CONFIG.border;
  const photoSrc  = photo.el.querySelector('img').src;
  const initialRotation = photo.rotation;

  const galleryImgs = [photoSrc];

  const overlay = document.createElement('div');
  overlay.id = 'popup-overlay';

  const popupScene = document.createElement('div');
  popupScene.id = 'popup-scene';
  Object.assign(popupScene.style, {
    left:   rect.left   + 'px',
    top:    rect.top    + 'px',
    width:  rect.width  + 'px',
    height: rect.height + 'px',
    transform: `rotate(${initialRotation}deg)`
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

  const maxH = Math.min(window.innerHeight * 0.82, 760);
  const imgRatio = 1 / CONFIG.ratio;

  let galleryW = 0;
  let galleryH = maxH;

  if (galleryImgs.length === 1)      galleryW = maxH * imgRatio;
  else if (galleryImgs.length === 2) galleryW = (maxH * imgRatio) * 2;
  else if (galleryImgs.length === 4) galleryW = maxH * imgRatio;

  const maxAllowedW = window.innerWidth * 0.65;
  if (galleryW > maxAllowedW) {
    galleryW = maxAllowedW;
    galleryH = (galleryImgs.length === 2) ? (galleryW / 2) / imgRatio : galleryW / imgRatio;
  }

  gallery.style.width = galleryW + 'px';

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

  const finalWidth = galleryW + 300;
  const finalL = (window.innerWidth  - finalWidth) / 2;
  const finalT = (window.innerHeight - galleryH)   / 2;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.style.background = 'rgba(0,0,0,0.85)';
    card.style.transform = 'rotateY(180deg)';
    popupScene.style.transitionProperty = 'left, top, width, height, transform';

    Object.assign(popupScene.style, {
      left:      finalL     + 'px',
      top:       finalT     + 'px',
      width:     finalWidth + 'px',
      height:    galleryH   + 'px',
      transform: 'rotate(0deg)'
    });
  }));

  let closing = false;
  function doClose() {
    if (closing) return;
    closing = true;

    const closeStartTime = performance.now();
    const elapsedSinceOpen = closeStartTime - photo.popupStartTime;
    const tempStart = photo.start + elapsedSinceOpen;
    const t = Math.max(0.001, Math.min(0.97, (closeStartTime - tempStart) / photo.duration));

    const scale = 0.05 + t * CONFIG.maxScale;
    const px = photo.x * (0.3 + t * 1.3);
    const py = photo.y * (0.3 + t * 1.3);
    const elW = parseFloat(photo.el.style.width)  * scale;
    const elH = parseFloat(photo.el.style.height) * scale;
    const returnL = W/2 + px - elW/2;
    const returnT = H/2 + py - elH/2;

    overlay.style.background = 'rgba(0,0,0,0)';
    card.style.transform = 'rotateY(0deg)';

    Object.assign(popupScene.style, {
      left:      returnL + 'px',
      top:       returnT + 'px',
      width:     elW     + 'px',
      height:    elH     + 'px',
      transform: `rotate(${initialRotation}deg)`
    });

    let closed = false;
    popupScene.addEventListener('transitionend', function onClosed(e) {
      if (closed || e.propertyName !== 'width') return;
      closed = true;
      popupScene.removeEventListener('transitionend', onClosed);

      const closeDuration = performance.now() - closeStartTime;
      photo.start += (elapsedSinceOpen + closeDuration);
      photo.update(performance.now());

      photo.el.style.opacity       = '';
      photo.el.style.pointerEvents = '';
      photo.inPopup = false;
      popupOpen     = false;

      overlay.remove();
      popupScene.remove();
    });
  }

  closeBtn.addEventListener('click', e => { e.stopPropagation(); doClose(); });
  overlay.addEventListener('click', doClose);
}

/* ====================================================================
   ПОЛНОЭКРАННЫЙ ПРОСМОТР
==================================================================== */
class FullscreenViewer {
  constructor() {
    this.images = []; this.currentIndex = 0; this.isOpen = false;
    this.scale = 1; this.translateX = 0; this.translateY = 0;
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

  resetZoom() { this.scale = 1; this.translateX = 0; this.translateY = 0; this.updateTransform(); }

  updateTransform() {
    this.img.style.transform = `translate(${this.translateX}px,${this.translateY}px) scale(${this.scale})`;
  }

  _bindEvents() {
    const o = this.overlay;
    o.querySelector('#fsv-close').addEventListener('click', () => this.close());
    o.querySelector('#fsv-prev').addEventListener('click', e => { e.stopPropagation(); this.prev(); });
    o.querySelector('#fsv-next').addEventListener('click', e => { e.stopPropagation(); this.next(); });
    o.querySelector('#fsv-wrapper').addEventListener('click', e => { if (e.target === e.currentTarget) this.close(); });

    window.addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.key === 'Escape')     this.close();
      if (e.key === 'ArrowLeft')  this.prev();
      if (e.key === 'ArrowRight') this.next();
    });

    o.addEventListener('wheel', e => {
      if (!this.isOpen) return;
      e.preventDefault();
      this.scale = e.deltaY < 0
        ? Math.min(this.scale + 0.1, 5)
        : Math.max(this.scale - 0.1, 1);
      if (this.scale === 1) { this.translateX = 0; this.translateY = 0; }
      this.updateTransform();
    }, { passive: false });

    this.img.addEventListener('dblclick', () => {
      if (this.scale > 1) this.resetZoom();
      else { this.scale = 2.5; this.updateTransform(); }
    });

    const startDrag = (cx, cy) => {
      this.isDragging = true;
      this.startX = cx - this.translateX;
      this.startY = cy - this.translateY;
    };
    const moveDrag = (cx, cy) => {
      if (!this.isDragging || this.scale <= 1) return;
      this.translateX = cx - this.startX;
      this.translateY = cy - this.startY;
      this.updateTransform();
    };
    const endDrag = () => { this.isDragging = false; };

    this.img.addEventListener('mousedown', e => startDrag(e.clientX, e.clientY));
    window.addEventListener('mousemove',  e => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup',    endDrag);

    this.img.addEventListener('touchstart', e => {
      if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY);
      else if (e.touches.length === 2) {
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
        this.scale = Math.max(1, Math.min(this.scale * (d / this.initialDist), 5));
        this.initialDist = d;
        if (this.scale === 1) { this.translateX = 0; this.translateY = 0; }
        this.updateTransform();
      }
    }, { passive: true });

    this.img.addEventListener('touchend',    endDrag);
    this.img.addEventListener('touchcancel', endDrag);
  }
}

const globalViewer = new FullscreenViewer();

/* клик по галерее в попапе — полноэкранный просмотр отключён */

/* ====================================================================
   ПАНЕЛЬ НАСТРОЕК
==================================================================== */
(function initSettingsPanel() {
  const panel     = document.getElementById('settings-panel');
  const header    = document.getElementById('settings-header');
  const toggleBtn = document.getElementById('settings-toggle');
  if (!panel || !header || !toggleBtn) return;

  const bindings = [
    { id:'s-minw',        key:'minWidth',         out:'v-minw',        fmt: v => Math.round(v) + ' px' },
    { id:'s-maxw',        key:'maxWidth',         out:'v-maxw',        fmt: v => Math.round(v) + ' px' },
    { id:'s-ratio',       key:'ratio',            out:'v-ratio',       fmt: v => v.toFixed(2) },
    { id:'s-mindur',      key:'minDuration',      out:'v-mindur',      fmt: v => v.toFixed(1) + ' с' },
    { id:'s-maxdur',      key:'maxDuration',      out:'v-maxdur',      fmt: v => v.toFixed(1) + ' с' },
    { id:'s-maxscale',    key:'maxScale',         out:'v-maxscale',    fmt: v => 'x' + v.toFixed(2) },
    { id:'s-interval',    key:'spawnInterval',    out:'v-interval',    fmt: v => Math.round(v) + ' мс' },
    { id:'s-overlap',     key:'overlap',          out:'v-overlap',     fmt: v => v.toFixed(2) },
    { id:'s-spawndist',   key:'minSpawnDistance', out:'v-spawndist',   fmt: v => v.toFixed(2) },
    { id:'s-spread',      key:'spread',           out:'v-spread',      fmt: v => 'x' + v.toFixed(2) },
    { id:'s-minrotation', key:'minRotation',      out:'v-minrotation', fmt: v => Math.round(v) + '°' },
    { id:'s-maxrotation', key:'maxRotation',      out:'v-maxrotation', fmt: v => Math.round(v) + '°' },
    { id:'s-fadein',      key:'fadeIn',           out:'v-fadein',      fmt: v => v.toFixed(2) },
    { id:'s-fadeout',     key:'fadeOut',          out:'v-fadeout',     fmt: v => v.toFixed(2) },
    { id:'s-border',      key:'border',           out:'v-border',      fmt: v => Math.round(v) + ' px' },
    { id:'s-logosize',    key:'logoSize',         out:'v-logosize',    fmt: v => Math.round(v) + ' px' },
    { id:'s-logopadding', key:'logoPadding',      out:'v-logopadding', fmt: v => Math.round(v) + ' px' },
    { id:'s-coverage',    key:'coverage',         out:'v-coverage',    fmt: v => Math.round(v) + '%'   },
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
    modeSelect.addEventListener('change', () => { CONFIG.spawnMode = modeSelect.value; gridState = []; saveConfig(); });
  }

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '—';
  });

  let drag = false, ox = 0, oy = 0;
  const startD = (cx, cy) => { drag = true; const r = panel.getBoundingClientRect(); ox = cx-r.left; oy = cy-r.top; panel.style.left = r.left+'px'; panel.style.top = r.top+'px'; };
  const moveD  = (cx, cy) => { if (!drag) return; panel.style.left = Math.max(0, Math.min(cx-ox, innerWidth-panel.offsetWidth))+'px'; panel.style.top = Math.max(0, Math.min(cy-oy, innerHeight-panel.offsetHeight))+'px'; };
  const endD   = () => { drag = false; };

  header.addEventListener('mousedown',  e => { startD(e.clientX, e.clientY); e.preventDefault(); });
  window.addEventListener('mousemove',  e => moveD(e.clientX, e.clientY));
  window.addEventListener('mouseup',    endD);
  header.addEventListener('touchstart', e => { const t = e.touches[0]; startD(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchmove',  e => { const t = e.touches[0]; moveD(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchend',   endD);
})();