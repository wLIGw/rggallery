const PHOTOS = [
  "../img/1.jpeg","../img/2.jpeg","../img/3.jpeg","../img/4.jpeg","../img/5.jpeg","../img/6.jpeg",
  "../img/7.jpeg","../img/8.jpeg","../img/9.jpeg","../img/10.jpeg","../img/11.jpeg","../img/12.jpeg"
];

const scene = document.getElementById('scene');
let W = window.innerWidth;
let H = window.innerHeight;

const CONFIG = {
  orientation: 'vertical',   
  lines: 8,                  
  size: 160,                 
  ratio: 1.25,               
  gapLines: 20,              
  gapPhotos: 20,             
  speed: 80,                 
  rotation: 6,               
  border: 4,                 
  gridTilt: 0,               
  logoEnabled: false,
  logoSize: 180,
  logoMaskEnabled: false,    // Скрывать ли фото под логотипом
  logoMaskRadius: 40,        // Отступ скрытия вокруг логотипа
  lineDirections: []         
};

const stableRotations = [];
function getStableRotation(index) {
  if (stableRotations[index] === undefined) {
    stableRotations[index] = (Math.random() * 2 - 1) * CONFIG.rotation;
  }
  return stableRotations[index];
}

// Загрузка конфига
(function loadSavedConfig() {
  try {
    const saved = localStorage.getItem('photoflow_marquee_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(k => { if (k in CONFIG) CONFIG[k] = parsed[k]; });
    }
  } catch(e) {}
  sanitizeDirections();
})();

function sanitizeDirections() {
  const isHoriz = CONFIG.orientation === 'horizontal';
  while (CONFIG.lineDirections.length < CONFIG.lines) {
    if (isHoriz) {
      CONFIG.lineDirections.push(CONFIG.lineDirections.length % 2 === 0 ? 'right' : 'left');
    } else {
      CONFIG.lineDirections.push(CONFIG.lineDirections.length % 2 === 0 ? 'down' : 'up');
    }
  }
  CONFIG.lineDirections = CONFIG.lineDirections.slice(0, CONFIG.lines).map((dir, idx) => {
    if (isHoriz && (dir === 'up' || dir === 'down')) return idx % 2 === 0 ? 'right' : 'left';
    if (!isHoriz && (dir === 'left' || dir === 'right')) return idx % 2 === 0 ? 'down' : 'up';
    return dir;
  });
}

function saveConfig() {
  try { localStorage.setItem('photoflow_marquee_config', JSON.stringify(CONFIG)); } catch(e) {}
}

/* ====================================================================
   ЛОГОТИП
==================================================================== */
const logoEl = document.createElement('img');
logoEl.src = '../img/logo_white.png';
logoEl.id  = 'logo';
document.body.appendChild(logoEl);

function updateLogo() {
  logoEl.style.display = CONFIG.logoEnabled ? 'block' : 'none';
  logoEl.style.width  = CONFIG.logoSize + 'px';
}
updateLogo();

/* ====================================================================
   ДВИЖОК СЕТКИ ЛЕНТ
==================================================================== */
let linesData = [];
let allPhotoElements = []; // Храним ссылки на карточки для проверки коллизий
let lastTime = performance.now();

function createMarquee() {
  scene.innerHTML = '';
  linesData = [];
  allPhotoElements = [];
  sanitizeDirections();

  const isHoriz = CONFIG.orientation === 'horizontal';
  const photoW = CONFIG.size;
  const photoH = CONFIG.size * CONFIG.ratio;
  
  const stepSize = (isHoriz ? photoW : photoH) + CONFIG.gapPhotos;
  const isTilted = CONFIG.gridTilt !== 0;
  
  const diagonal = Math.sqrt(W * W + H * H);
  const boundW = isTilted ? diagonal * 1.3 : W;
  const boundH = isTilted ? diagonal * 1.3 : H;
  
  const screenLimit = isHoriz ? boundW : boundH;
  const itemsInGroup = Math.ceil(screenLimit / stepSize) + 4;
  const groupLength = itemsInGroup * stepSize;

  const gridContainer = document.createElement('div');
  gridContainer.className = 'grid-container';
  
  if (isTilted) {
    gridContainer.style.width = `${boundW}px`;
    gridContainer.style.height = `${boundH}px`;
    gridContainer.style.transform = `translate(-50%, -50%) rotate(${CONFIG.gridTilt}deg)`;
  } else {
    gridContainer.style.width = '100vw';
    gridContainer.style.height = '100vh';
    gridContainer.style.transform = 'none';
    gridContainer.style.top = '0';
    gridContainer.style.left = '0';
  }
  scene.appendChild(gridContainer);

  const lineThickness = isHoriz ? photoH : photoW;
  const containerSize = isHoriz ? gridContainer.offsetHeight : gridContainer.offsetWidth;

  for (let l = 0; l < CONFIG.lines; l++) {
    const lineEl = document.createElement('div');
    lineEl.className = 'flow-line';
    
    let crossOffset = 0;
    if (CONFIG.lines > 1) {
      crossOffset = (l * (containerSize - lineThickness)) / (CONFIG.lines - 1);
    } else {
      crossOffset = (containerSize - lineThickness) / 2;
    }

    if (isHoriz) {
      lineEl.style.top = `${crossOffset}px`;
      lineEl.style.left = '0px';
      lineEl.style.width = '100%';
      lineEl.style.height = `${photoH}px`;
    } else {
      lineEl.style.left = `${crossOffset}px`;
      lineEl.style.top = '0px';
      lineEl.style.height = '100%';
      lineEl.style.width = `${photoW}px`;
    }

    const trackEl = document.createElement('div');
    trackEl.className = 'flow-track ' + (isHoriz ? 'horiz-track' : 'vert-track');

    function createGroup() {
      const groupEl = document.createElement('div');
      groupEl.className = 'flow-group ' + (isHoriz ? 'horiz-group' : 'vert-group');
      groupEl.style.gap = `${CONFIG.gapPhotos}px`;
      
      if (isHoriz) groupEl.style.paddingRight = `${CONFIG.gapPhotos}px`;
      else groupEl.style.paddingBottom = `${CONFIG.gapPhotos}px`;

      for (let i = 0; i < itemsInGroup; i++) {
        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo-marquee';
        photoDiv.style.width = `${photoW}px`;
        photoDiv.style.height = `${photoH}px`;
        
        photoDiv.style.boxShadow = `0 10px 30px rgba(0,0,0,0.5), inset 0 0 0 ${CONFIG.border}px #f2f1ec`;
        photoDiv.style.padding = `${CONFIG.border}px`;

        const rot = getStableRotation(i + l * 3);
        photoDiv.style.transform = `rotate(${rot}deg) translateZ(0)`;

        const img = document.createElement('img');
        img.src = PHOTOS[i % PHOTOS.length];
        
        photoDiv.appendChild(img);
        groupEl.appendChild(photoDiv);

        // Сохраняем карточку для обработки маски
        allPhotoElements.push(photoDiv);
      }
      return groupEl;
    }

    trackEl.appendChild(createGroup());
    trackEl.appendChild(createGroup());
    lineEl.appendChild(trackEl);
    gridContainer.appendChild(lineEl);

    const dirStr = CONFIG.lineDirections[l];
    const moveSign = (dirStr === 'down' || dirStr === 'right') ? -1 : 1;

    linesData.push({
      track: trackEl,
      direction: moveSign,
      shift: Math.random() * groupLength,
      maxResetLength: groupLength
    });
  }
}

function updateLogoMask() {
  // Если скрытие выключено или выключен сам логотип — показываем все фото
  if (!CONFIG.logoEnabled || !CONFIG.logoMaskEnabled) {
    allPhotoElements.forEach(el => el.style.opacity = '1');
    return;
  }

  // Центр экрана (координаты логотипа)
  const centerX = W / 2;
  const centerY = H / 2;
  
  // Радиус мертвой зоны: половина размера логотипа + кастомный отступ
  const deadRadius = (CONFIG.logoSize / 2) + CONFIG.logoMaskRadius;

  allPhotoElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    // Находим центр текущей карточки на экране
    const photoX = rect.left + rect.width / 2;
    const photoY = rect.top + rect.height / 2;

    // Считаем расстояние от центра экрана до центра фото по Пифагору
    const dx = photoX - centerX;
    const dy = photoY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Если фото входит в радиус, плавно его гасим через CSS opacity
    if (distance < deadRadius) {
      el.style.opacity = '0';
    } else {
      el.style.opacity = '1';
    }
  });
}

function animate() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const isHoriz = CONFIG.orientation === 'horizontal';

  linesData.forEach(line => {
    line.shift += CONFIG.speed * dt * line.direction;

    if (line.shift >= line.maxResetLength) {
      line.shift -= line.maxResetLength;
    } else if (line.shift <= 0) {
      line.shift += line.maxResetLength;
    }

    if (isHoriz) {
      line.track.style.transform = `translateX(${-line.shift.toFixed(1)}px) translateZ(0)`;
    } else {
      line.track.style.transform = `translateY(${-line.shift.toFixed(1)}px) translateZ(0)`;
    }
  });

  // Проверяем положение картинок относительно логотипа на каждом кадре
  updateLogoMask();

  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
  W = window.innerWidth;
  H = window.innerHeight;
  createMarquee();
});

/* ====================================================================
   ИНТЕРФЕЙС НАСТРОЕК
==================================================================== */
function rebuildDirectionButtons() {
  const container = document.getElementById('direction-lines-container');
  if (!container) return;
  container.innerHTML = '';

  sanitizeDirections();
  const isHoriz = CONFIG.orientation === 'horizontal';

  for (let i = 0; i < CONFIG.lines; i++) {
    const btn = document.createElement('button');
    btn.className = 'dir-toggle-btn';
    
    let currentDir = CONFIG.lineDirections[i];
    let label = '';
    
    if (isHoriz) {
      label = currentDir === 'right' ? 'Вправо →' : 'Влево ←';
    } else {
      label = currentDir === 'down' ? 'Вниз ↓' : 'Вверх ↑';
    }
    
    btn.textContent = `Ряд ${i + 1}: ${label}`;

    btn.addEventListener('click', () => {
      if (isHoriz) {
        CONFIG.lineDirections[i] = CONFIG.lineDirections[i] === 'right' ? 'left' : 'right';
      } else {
        CONFIG.lineDirections[i] = CONFIG.lineDirections[i] === 'down' ? 'up' : 'down';
      }
      rebuildDirectionButtons();
      createMarquee();
      saveConfig();
    });
    container.appendChild(btn);
  }
}

(function initSettingsPanel() {
  const panel     = document.getElementById('settings-panel');
  const header    = document.getElementById('settings-header');
  const toggleBtn = document.getElementById('settings-toggle');

  const bindings = [
    { id: 's-lines',       key: 'lines',      out: 'v-lines',       fmt: v => Math.round(v) },
    { id: 's-size',        key: 'size',       out: 'v-size',        fmt: v => Math.round(v) + ' px' },
    { id: 's-ratio',       key: 'ratio',      out: 'v-ratio',       fmt: v => v.toFixed(2) },
    { id: 's-gap-lines',   key: 'gapLines',   out: 'v-gap-lines',   fmt: v => Math.round(v) + ' px' },
    { id: 's-gap-photos',  key: 'gapPhotos',  out: 'v-gap-photos',  fmt: v => Math.round(v) + ' px' },
    { id: 's-speed',       key: 'speed',      out: 'v-speed',       fmt: v => Math.round(v) + ' px/с' },
    { id: 's-rotation',    key: 'rotation',   out: 'v-rotation',    fmt: v => Math.round(v) + '°' },
    { id: 's-border',      key: 'border',     out: 'v-border',      fmt: v => Math.round(v) + ' px' },
    { id: 's-logosize',    key: 'logoSize',   out: 'v-logosize',    fmt: v => Math.round(v) + ' px' },
    { id: 's-logomaskradius', key: 'logoMaskRadius', out: 'v-logomaskradius', fmt: v => Math.round(v) + ' px' }
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
      
      if (b.key === 'rotation') stableRotations.length = 0;

      if (b.key === 'logoSize') {
        updateLogo();
      } else if (b.key !== 'logoMaskRadius') {
        if (b.key === 'lines') rebuildDirectionButtons();
        createMarquee(); 
      }
      saveConfig();
    });
  });

  const orientationSelect = document.getElementById('s-orientation');
  if (orientationSelect) {
    orientationSelect.value = CONFIG.orientation;
    orientationSelect.addEventListener('change', () => {
      CONFIG.orientation = orientationSelect.value;
      rebuildDirectionButtons();
      createMarquee();
      saveConfig();
    });
  }

  const tiltSelect = document.getElementById('s-tilt');
  if (tiltSelect) {
    tiltSelect.value = CONFIG.gridTilt;
    tiltSelect.addEventListener('change', () => {
      CONFIG.gridTilt = parseInt(tiltSelect.value);
      createMarquee();
      saveConfig();
    });
  }

  // Контроллеры логотипа и маски
  const logoCheck = document.getElementById('s-logo');
  const logoOptions = document.getElementById('logo-options');
  const maskCheck = document.getElementById('s-logomask');
  const maskOptions = document.getElementById('mask-options');

  function toggleSubOptions() {
    logoOptions.style.display = CONFIG.logoEnabled ? 'block' : 'none';
    if (maskOptions) {
      maskOptions.style.display = (CONFIG.logoEnabled && CONFIG.logoMaskEnabled) ? 'block' : 'none';
    }
  }

  if (logoCheck) {
    logoCheck.checked = CONFIG.logoEnabled;
    logoCheck.addEventListener('change', () => {
      CONFIG.logoEnabled = logoCheck.checked;
      updateLogo();
      toggleSubOptions();
      saveConfig();
    });
  }

  if (maskCheck) {
    maskCheck.checked = CONFIG.logoMaskEnabled;
    maskCheck.addEventListener('change', () => {
      CONFIG.logoMaskEnabled = maskCheck.checked;
      toggleSubOptions();
      saveConfig();
    });
  }

  toggleSubOptions();

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '—';
  });

  let drag = false, ox = 0, oy = 0;
  const startD = (cx, cy) => { drag = true; const r = panel.getBoundingClientRect(); ox = cx - r.left; oy = cy - r.top; };
  const moveD  = (cx, cy) => { if (!drag) return; panel.style.left = Math.max(0, Math.min(cx - ox, window.innerWidth - panel.offsetWidth)) + 'px'; panel.style.top = Math.max(0, Math.min(cy - oy, window.innerHeight - panel.offsetHeight)) + 'px'; };
  const endD   = () => drag = false;

  header.addEventListener('mousedown', e => { startD(e.clientX, e.clientY); e.preventDefault(); });
  window.addEventListener('mousemove', e => moveD(e.clientX, e.clientY));
  window.addEventListener('mouseup', endD);
  header.addEventListener('touchstart', e => { const t = e.touches[0]; startD(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchmove', e => { const t = e.touches[0]; moveD(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchend', endD);

  rebuildDirectionButtons();
})();

createMarquee();
requestAnimationFrame(animate);