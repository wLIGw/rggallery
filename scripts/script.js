const PHOTOS = ["img/1.jpeg","img/2.jpeg","img/3.jpeg","img/4.jpeg","img/5.jpeg","img/6.jpeg","img/7.jpeg","img/8.jpeg","img/9.jpeg","img/10.jpeg","img/11.jpeg","img/12.jpeg","img/13.jpg","img/14.jpg","img/15.jpg","img/16.jpg","img/17.jpg","img/18.jpg","img/19.jpg","img/20.jpg","img/21.jpg","img/22.jpg","img/23.jpg","img/24.jpg","img/25.jpg","img/26.jpg","img/27.jpg","img/28.jpg","img/29.jpg" ];

const scene = document.getElementById('scene');
let W = window.innerWidth;
let H = window.innerHeight;
window.addEventListener('resize', () => { W = window.innerWidth; H = window.innerHeight; updateLogoSize(); });

const CONFIG = {
  minWidth: 130,
  maxWidth: 130,
  ratio: 1.25,
  minDuration: 8.6,
  maxDuration: 10.8,
  maxScale: 1.35,
  minSpawnDistance: 0.22,
  spread: 1.2,
  spawnMode: 'random',
  overlap: 0.11,
  spawnInterval: 400,
  minRotation: 0,
  maxRotation: 10,
  fadeIn: 0.15,
  fadeOut: 0.3,
  border: 3,
  logoEnabled: false,
  logoSize: 200,
  logoPadding: 60
};

// ── 1. Сразу грузим localStorage — до любой инициализации ──────────
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

document.documentElement.style.setProperty('--border-size', CONFIG.border + 'px');

/* ====================================================================
   ЛОГОТИП
==================================================================== */
const logoEl = document.createElement('img');
logoEl.src = 'img/logo_white.png';
logoEl.id  = 'logo';
logoEl.style.cssText = `
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100000;
  pointer-events: none;
  display: none;
  object-fit: contain;
`;
document.body.appendChild(logoEl);

function updateLogoSize() {
  logoEl.style.width  = CONFIG.logoSize + 'px';
  logoEl.style.height = 'auto';
}
updateLogoSize();

function setLogoVisible(v) {
  logoEl.style.display = v ? 'block' : 'none';
}

// Применяем состояние лого сразу после создания элемента
setLogoVisible(CONFIG.logoEnabled);

function getLogoBlockZone() {
  if (!CONFIG.logoEnabled) return null;
  const logoW = CONFIG.logoSize;
  // naturalHeight доступна только после загрузки — используем сохранённое соотношение
  // или ждём load. Для надёжности берём квадрат: hw = hh = logoSize/2 + padding.
  // Это чуть больше реального лого, зато гарантированно работает до onload.
  const logoH = (logoEl.naturalHeight && logoEl.naturalWidth)
    ? CONFIG.logoSize * (logoEl.naturalHeight / logoEl.naturalWidth)
    : CONFIG.logoSize;          // ← консервативно: квадрат до загрузки
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

function pickSpawnPointRandom() {
  const recent = photos.filter(p => (performance.now() - p.start) < 900);
  const overlapFactor = 1 - Math.min(0.95, CONFIG.overlap);
  const minDist = CONFIG.minSpawnDistance * Math.min(W, H) * overlapFactor;

  for (let attempt = 0; attempt < 30; attempt++) {
    const x = (Math.random() - 0.5) * W * CONFIG.spread;
    const y = (Math.random() - 0.5) * H * CONFIG.spread;
    const tooClose = recent.some(p => {
      const dx = p.x - x, dy = p.y - y;
      return Math.sqrt(dx*dx + dy*dy) < minDist;
    });
    if (!tooClose && !isTooCloseToLogo(x, y)) return { x, y };
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = (Math.random() - 0.5) * W * CONFIG.spread;
    const y = (Math.random() - 0.5) * H * CONFIG.spread;
    if (!isTooCloseToLogo(x, y)) return { x, y };
  }
  return { x: (Math.random()-0.5)*W*CONFIG.spread, y: (Math.random()-0.5)*H*CONFIG.spread };
}

function pickSpawnPointGrid() {
  const n    = Math.max(1, Math.round(W * H / 40000));
  const cols = Math.max(1, Math.round(Math.sqrt(n * W / H)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = W / cols, cellH = H / rows;
  const cooldown = 400 + (1 - CONFIG.overlap) * 2200;
  const now = performance.now();
  gridState = gridState.filter(c => (now - c.time) < cooldown);
  const occupied = new Set(gridState.map(c => c.col+':'+c.row));
  const free = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++)
      if (!occupied.has(c+':'+r)) free.push({col:c,row:r});

  const safeFree = free.filter(cell => {
    const cx = cell.col * cellW + cellW / 2 - W / 2;
    const cy = cell.row * cellH + cellH / 2 - H / 2;
    return !isTooCloseToLogo(cx, cy);
  });
  const pool = safeFree.length > 0 ? safeFree : (free.length > 0 ? free : [{col:0,row:0}]);
  const cell = pool[Math.floor(Math.random() * pool.length)];

  gridState.push({col:cell.col, row:cell.row, time:now});
  const jx = (Math.random()-0.5)*cellW*(0.15+CONFIG.overlap*0.9);
  const jy = (Math.random()-0.5)*cellH*(0.15+CONFIG.overlap*0.9);
  return { x: cell.col*cellW + cellW/2 + jx - W/2, y: cell.row*cellH + cellH/2 + jy - H/2 };
}

function pickSpawnPoint() {
  return CONFIG.spawnMode === 'grid' ? pickSpawnPointGrid() : pickSpawnPointRandom();
}

/* ====================================================================
   Photo
==================================================================== */
class Photo {
  constructor(initialAgeFraction) {
    this.el = document.createElement('div');
    this.el.className = 'photo';
    this.el.style.padding = CONFIG.border + 'px';
    this.el.style.cursor = 'grab';
    this.el.style.touchAction = 'none';

    const img = document.createElement('img');
    img.src = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
    img.draggable = false;
    this.el.appendChild(img);

    const lo = Math.min(CONFIG.minWidth, CONFIG.maxWidth);
    const hi = Math.max(CONFIG.minWidth, CONFIG.maxWidth);
    const width = lo + Math.random() * (hi - lo);
    this.el.style.width  = width + 'px';
    this.el.style.height = width * CONFIG.ratio + 'px';

    const pt = pickSpawnPoint();
    this.x = pt.x;
    this.y = pt.y;

    const minR = Math.min(CONFIG.minRotation, CONFIG.maxRotation);
    const maxR = Math.max(CONFIG.minRotation, CONFIG.maxRotation);
    const angle = minR + Math.random() * (maxR - minR);
    this.rotation = (Math.random() < 0.5 ? 1 : -1) * angle;

    const dlo = Math.min(CONFIG.minDuration, CONFIG.maxDuration);
    const dhi = Math.max(CONFIG.minDuration, CONFIG.maxDuration);
    this.duration = (dlo + Math.random()*(dhi-dlo)) * 1000;

    // ── seed: равномерное распределение по шкале времени ──────────
    // Каждое фото получает уникальный возраст пропорционально своему
    // индексу, чтобы они были разбросаны по всей шкале 0..1 и не
    // умирали одной волной. initialAgeFraction передаётся снаружи.
    const age = (initialAgeFraction || 0) * this.duration;
    this.start = performance.now() - age;

    this.dead = false;
    this.dragging = false;
    this.lastScale = 0.05;
    this.pointerOffsetX = 0;
    this.pointerOffsetY = 0;
    this.dragScreenX = 0;
    this.dragScreenY = 0;
    this.dragStartTime = 0;

    scene.appendChild(this.el);
    this._bindDrag();
  }

  _bindDrag() {
    this.el.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.dragging = true;
      this.dragStartTime = performance.now();
      this.el.style.cursor = 'grabbing';
      this.el.setPointerCapture(e.pointerId);
      this.el.style.zIndex = 99999;
      const rect = this.el.getBoundingClientRect();
      this.pointerOffsetX = e.clientX - (rect.left + rect.width/2);
      this.pointerOffsetY = e.clientY - (rect.top  + rect.height/2);
      this.dragScreenX = rect.left + rect.width/2;
      this.dragScreenY = rect.top  + rect.height/2;
    });
    this.el.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      this.dragScreenX = e.clientX - this.pointerOffsetX;
      this.dragScreenY = e.clientY - this.pointerOffsetY;
      this.el.style.transform =
        `translate(-50%,-50%) translate(${this.dragScreenX}px,${this.dragScreenY}px) scale(${this.lastScale}) rotate(${this.rotation}deg)`;
    });
    const release = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.style.cursor = 'grab';
      const now = performance.now();
      this.start += now - this.dragStartTime;
      const t = Math.max(0.001, Math.min(0.999, (now - this.start) / this.duration));
      const factor = 0.3 + t * 1.3;
      this.x = (this.dragScreenX - W/2) / factor;
      this.y = (this.dragScreenY - H/2) / factor;
    };
    this.el.addEventListener('pointerup', release);
    this.el.addEventListener('pointercancel', release);
  }

  update(now) {
    if (this.dragging) return;
    const t = (now - this.start) / this.duration;
    if (t >= 1) { this.dead = true; this.el.remove(); return; }

    const scale = 0.05 + t * CONFIG.maxScale;
    const fi = CONFIG.fadeIn, fo = CONFIG.fadeOut;
    let opacity = t < fi ? t/fi : t > 1-fo ? (1-t)/fo : 1;
    opacity = Math.max(0, Math.min(1, opacity));

    this.lastScale = scale;
    const x = this.x * (0.3 + t*1.3);
    const y = this.y * (0.3 + t*1.3);
    this.el.style.transform =
      `translate(-50%,-50%) translate(${W/2+x}px,${H/2+y}px) scale(${scale}) rotate(${this.rotation}deg)`;
    this.el.style.opacity = opacity.toFixed(3);
    this.el.style.zIndex  = Math.floor(scale * 100);
  }
}

/* ====================================================================
   Seed + spawn loop + animate
==================================================================== */

// ── 2. seed запускается только после загрузки лого ─────────────────
// Это гарантирует что naturalWidth/naturalHeight известны и зона лого
// считается точно. Также исключает наслоение фото в центре при старте.
function startEverything() {
  const avgDuration = (CONFIG.minDuration + CONFIG.maxDuration) / 2 * 1000;
  const N = Math.ceil(avgDuration / CONFIG.spawnInterval);
  // ── равномерное распределение: i/N даёт уникальный возраст каждому фото
  for (let i = 0; i < N; i++) photos.push(new Photo(i / N));

  // spawn loop
  (function spawnNext() {
    try { photos.push(new Photo(0)); } catch(e) { console.error(e); }
    setTimeout(spawnNext, CONFIG.spawnInterval);
  })();

  // animate loop
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

// Ждём загрузки лого если оно включено, иначе стартуем сразу
if (CONFIG.logoEnabled && !logoEl.complete) {
  logoEl.addEventListener('load', startEverything, { once: true });
  logoEl.addEventListener('error', startEverything, { once: true }); // на случай ошибки загрузки
} else {
  startEverything();
}

/* ====================================================================
   ПАНЕЛЬ НАСТРОЕК
==================================================================== */
(function initSettingsPanel() {
  const panel     = document.getElementById('settings-panel');
  const header    = document.getElementById('settings-header');
  const toggleBtn = document.getElementById('settings-toggle');

  const bindings = [
    { id: 's-minw',         key: 'minWidth',         out: 'v-minw',         fmt: v => Math.round(v) + ' px' },
    { id: 's-maxw',         key: 'maxWidth',         out: 'v-maxw',         fmt: v => Math.round(v) + ' px' },
    { id: 's-ratio',        key: 'ratio',            out: 'v-ratio',        fmt: v => v.toFixed(2) },
    { id: 's-mindur',       key: 'minDuration',      out: 'v-mindur',       fmt: v => v.toFixed(1) + ' с' },
    { id: 's-maxdur',       key: 'maxDuration',      out: 'v-maxdur',       fmt: v => v.toFixed(1) + ' с' },
    { id: 's-maxscale',     key: 'maxScale',         out: 'v-maxscale',     fmt: v => 'x' + v.toFixed(2) },
    { id: 's-interval',     key: 'spawnInterval',    out: 'v-interval',     fmt: v => Math.round(v) + ' мс' },
    { id: 's-overlap',      key: 'overlap',          out: 'v-overlap',      fmt: v => v.toFixed(2) },
    { id: 's-spawndist',    key: 'minSpawnDistance', out: 'v-spawndist',    fmt: v => v.toFixed(2) },
    { id: 's-spread',       key: 'spread',           out: 'v-spread',       fmt: v => 'x' + v.toFixed(2) },
    { id: 's-minrotation',  key: 'minRotation',      out: 'v-minrotation',  fmt: v => Math.round(v) + '°' },
    { id: 's-maxrotation',  key: 'maxRotation',      out: 'v-maxrotation',  fmt: v => Math.round(v) + '°' },
    { id: 's-fadein',       key: 'fadeIn',           out: 'v-fadein',       fmt: v => v.toFixed(2) },
    { id: 's-fadeout',      key: 'fadeOut',          out: 'v-fadeout',      fmt: v => v.toFixed(2) },
    { id: 's-border',       key: 'border',           out: 'v-border',       fmt: v => Math.round(v) + ' px' },
    { id: 's-logosize',     key: 'logoSize',         out: 'v-logosize',     fmt: v => Math.round(v) + ' px' },
    { id: 's-logopadding',  key: 'logoPadding',      out: 'v-logopadding',  fmt: v => Math.round(v) + ' px' },
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
  if (logoCheck) {
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
  const startD = (cx, cy) => { drag=true; const r=panel.getBoundingClientRect(); ox=cx-r.left; oy=cy-r.top; panel.style.left=r.left+'px'; panel.style.top=r.top+'px'; };
  const moveD  = (cx, cy) => { if(!drag) return; panel.style.left=Math.max(0,Math.min(cx-ox,innerWidth-panel.offsetWidth))+'px'; panel.style.top=Math.max(0,Math.min(cy-oy,innerHeight-panel.offsetHeight))+'px'; };
  const endD   = () => drag=false;

  header.addEventListener('mousedown', e => { startD(e.clientX,e.clientY); e.preventDefault(); });
  window.addEventListener('mousemove', e => moveD(e.clientX,e.clientY));
  window.addEventListener('mouseup', endD);
  header.addEventListener('touchstart', e => { const t=e.touches[0]; startD(t.clientX,t.clientY); }, {passive:true});
  window.addEventListener('touchmove', e => { const t=e.touches[0]; moveD(t.clientX,t.clientY); }, {passive:true});
  window.addEventListener('touchend', endD);
})();