(function(){
  const f = atob('aHR0cHM6Ly9naXRodWIuY29tL2RlbnJpczg3L3ZpbG5vaGlyc2stc2l0ZS9ibG9iL21haW4vYXBwbGUtdG91Y2gtaWNvbi5wbmc/cmF3PXRydWU=');
  const l1 = document.createElement('link'); l1.rel = 'icon'; l1.type = 'image/png'; l1.href = f;
  const l2 = document.createElement('link'); l2.rel = 'apple-touch-icon'; l2.href = f;
  document.head.appendChild(l1); document.head.appendChild(l2);
})();

const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyDwYQpUFVN9rvS-auA4mlqEO5ffKE8e5mWwPMiXhlbDbD94S07MleIBsVMXjzKMnUd/exec';
const ESTATE_CSV_URL = 'https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=622618191';
const PROMOS_API_URL = 'https://vilnohirsk-promos-api-production.up.railway.app/api/promos';

var currentDataSignature = {};
var allFleaMarketItems = []; var fleaRenderLimit = 20; var currentFleaSort = 'new';
var allEstateItems = []; var estateRenderLimit = 20; var currentEstateSort = 'new';
var allPromoItems = [];

// === ОБНОВЛЕННАЯ ЛОГИКА КРАСНЫХ ТОЧЕК ===
function checkNotification(key, dataArray) {
  if (!dataArray || dataArray.length === 0) return;
  const signature = String(dataArray.length); currentDataSignature[key] = signature;
  const seenSignature = localStorage.getItem('seen_' + key); const dot = document.getElementById('dot-' + key);
  if (!seenSignature) { localStorage.setItem('seen_' + key, signature); } else if (signature !== seenSignature && dot) { dot.style.display = 'block'; }
}

function clearNotification(key) {
  const dot = document.getElementById('dot-' + key); if (dot) dot.style.display = 'none';
  if (currentDataSignature[key]) { localStorage.setItem('seen_' + key, currentDataSignature[key]); }
}

function fallbackCopyText(text, successCb) {
    const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.left = "-999999px";
    document.body.appendChild(textArea); textArea.focus(); textArea.select();
    try { document.execCommand('copy'); if(successCb) successCb(); } catch (err) {} document.body.removeChild(textArea);
}

function copyToClipboardBtn(text, btn) {
    fallbackCopyText(text, () => { const originalHtml = btn.innerHTML; btn.innerHTML = '<span style="color:#00ff9c">✔️</span>'; setTimeout(() => { btn.innerHTML = originalHtml; }, 2000); });
}

async function fetchCachedText(url, key, ttlMinutes = 1) {
    const cacheKey = 'cache_' + key;
    const timeKey = 'cache_time_' + key;
    const cached = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem(timeKey);
    const now = Date.now();

    if (cached && cachedTime && (now - parseInt(cachedTime)) < ttlMinutes * 60 * 1000) {
        return cached;
    }

    try {
        const separator = url.includes('?') ? '&' : '?'; 
        const freshUrl = url + separator + '_nocache=' + now;
        const r = await fetch(freshUrl, { cache: 'no-store' }); 
        if (!r.ok) throw new Error('HTTP Error');
        const text = await r.text(); 
        
        localStorage.setItem(cacheKey, text); 
        localStorage.setItem(timeKey, now.toString());
        return text;
    } catch (e) { 
        if (cached) return cached; 
        throw e; 
    }
}

async function fetchCachedJson(url, key, ttlMinutes = 1) { return JSON.parse(await fetchCachedText(url, key, ttlMinutes)); }

function formatUAPhone(input) {
    let d = input.value.replace(/\D/g, '');
    if (d === '38' || d === '3' || d === '') { input.value = '+380'; return; }
    if (d.startsWith('0') && !d.startsWith('380')) d = '38' + d; else if (!d.startsWith('380')) d = '380' + d;
    let body = d.substring(3); if (body.startsWith('0')) body = body.substring(1); if (body.startsWith('380')) body = body.substring(3);
    input.value = '+380' + body.substring(0, 9);
}

let currentGallery = []; let currentGalleryIndex = 0; let windowEventImages = [];
let touchStartX = 0; let touchStartY = 0; let touchEndX = 0; 
let currentZoom = 1; let minZoom = 1; let maxZoom = 4;
let panX = 0; let panY = 0; let startPanX = 0; let startPanY = 0;
let startDistance = 0; let startZoom = 1; let isPinching = false; let lastTap = 0;

function openImageModal(images, index, event) {
  if (event) event.stopPropagation(); let normalizedImages = [];
  if (typeof images === 'string') { normalizedImages = [{url: images}]; } else { normalizedImages = images.map(img => typeof img === 'string' ? {url: img} : img); }
  currentGallery = normalizedImages; currentGalleryIndex = index || 0;
  const track = document.getElementById('modal-image-track'); 
  track.innerHTML = currentGallery.map(img => `<div class="image-modal-slide" onclick="handleSlideClick(event)"><img src="${img.url}" alt="Фото">${img.author ? `<div style="position:absolute; bottom:60px; left:50%; transform:translateX(-50%); color:#fff; font-weight:700; font-size:12px; background:rgba(0,0,0,0.6); padding:6px 14px; border-radius:14px; z-index:100002; pointer-events:none; white-space:nowrap;">📸 Фото: ${img.author}</div>` : ''}</div>`).join('');
  track.style.transition = 'none'; updateModalImage(); document.getElementById('image-modal').classList.add('active');
  document.body.style.overflow = 'hidden'; setTimeout(() => { track.style.transition = 'transform 0.3s cubic-bezier(0.25,1,0.5,1)'; }, 50);
}

function updateModalImage() {
    currentZoom = 1; panX = 0; panY = 0;
    document.querySelectorAll('.image-modal-slide img').forEach(img => { img.style.transform = ''; img.style.transition = 'transform 0.3s ease'; });
    const track = document.getElementById('modal-image-track'); if (track) track.style.transform = `translate3d(-${currentGalleryIndex * 100}%, 0, 0)`;
    const counter = document.getElementById('modal-image-counter');
    if (currentGallery.length > 1) { counter.style.display = 'block'; counter.innerText = `${currentGalleryIndex + 1} з ${currentGallery.length}`; } else { counter.style.display = 'none'; }
}

function handleSlideClick(e) { 
  e.stopPropagation(); const currentTime = new Date().getTime(); const tapLength = currentTime - lastTap;
  if (tapLength < 300 && tapLength > 0) {
      if (currentZoom > 1) { currentZoom = 1; panX = 0; panY = 0; } else { currentZoom = 2.5; }
      const activeImg = document.querySelector('.image-modal-track .image-modal-slide:nth-child(' + (currentGalleryIndex + 1) + ') img');
      if (activeImg) { activeImg.style.transition = 'transform 0.3s ease'; activeImg.style.transform = currentZoom === 1 ? '' : `translate3d(0, 0, 0) scale(${currentZoom})`; }
      lastTap = 0; return;
  }
  lastTap = currentTime; if (currentGallery.length <= 1 || currentZoom > 1) return; 
  if (e.clientX > window.innerWidth / 2) nextModalImage(); else prevModalImage(); 
}

function prevModalImage() { if (currentGallery.length <= 1 || currentGalleryIndex === 0) return; currentGalleryIndex--; updateModalImage(); }
function nextModalImage() { if (currentGallery.length <= 1 || currentGalleryIndex === currentGallery.length - 1) return; currentGalleryIndex++; updateModalImage(); }
function getDistance(t1, t2) { return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY); }

function handleTouchStart(e) { 
  if (e.touches.length === 2) {
      isPinching = true; startDistance = getDistance(e.touches[0], e.touches[1]); startZoom = currentZoom;
      const activeImg = document.querySelector('.image-modal-track .image-modal-slide:nth-child(' + (currentGalleryIndex + 1) + ') img'); if (activeImg) activeImg.style.transition = 'none';
  } else if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; startPanX = panX; startPanY = panY;
      if (currentZoom === 1) { const track = document.getElementById('modal-image-track'); if(track) track.style.transition = 'none'; } 
      else { const activeImg = document.querySelector('.image-modal-track .image-modal-slide:nth-child(' + (currentGalleryIndex + 1) + ') img'); if (activeImg) activeImg.style.transition = 'none'; }
  }
}

function handleTouchMove(e) { 
  const activeImg = document.querySelector('.image-modal-track .image-modal-slide:nth-child(' + (currentGalleryIndex + 1) + ') img');
  if (e.touches.length === 2) {
      e.preventDefault(); currentZoom = Math.min(Math.max(startZoom * (getDistance(e.touches[0], e.touches[1]) / startDistance), minZoom), maxZoom);
      if (activeImg) activeImg.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`;
  } else if (e.touches.length === 1) {
      if (isPinching) return; const diffX = e.touches[0].clientX - touchStartX; const diffY = e.touches[0].clientY - touchStartY;
      if (currentZoom > 1) {
          e.preventDefault(); panX = startPanX + diffX; panY = startPanY + diffY;
          if (activeImg) activeImg.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`;
      } else {
          if (currentGallery.length <= 1) return; const track = document.getElementById('modal-image-track'); if(track) track.style.transform = `translate3d(calc(-${currentGalleryIndex * 100}% + ${diffX}px), 0, 0)`;
      }
  }
}

function handleTouchEnd(e) {
  if (e.touches.length === 0) isPinching = false;
  const activeImg = document.querySelector('.image-modal-track .image-modal-slide:nth-child(' + (currentGalleryIndex + 1) + ') img');
  if (activeImg) activeImg.style.transition = 'transform 0.3s ease';
  if (currentZoom <= 1) {
      currentZoom = 1; panX = 0; panY = 0; if (activeImg) activeImg.style.transform = '';
      if (e.changedTouches.length > 0 && !isPinching) {
          touchEndX = e.changedTouches[0].clientX; const track = document.getElementById('modal-image-track'); if(track) track.style.transition = 'transform 0.3s cubic-bezier(0.25,1,0.5,1)';
          if (currentGallery.length > 1) { if (touchEndX < touchStartX - 50) { nextModalImage(); } else if (touchEndX > touchStartX + 50) { prevModalImage(); } else { updateModalImage(); } }
      }
  }
}

function closeImageModal(event) { 
    if (event && event.target.id !== 'image-modal' && !event.target.classList.contains('image-modal-close') && !event.target.classList.contains('image-modal-slider') && !event.target.classList.contains('image-modal-slide')) { return; } 
    document.getElementById('image-modal').classList.remove('active'); document.body.style.overflow = ''; 
}

var currentVilnohirskPhotos = []; 
function renderGallery(photos) {
    const container = document.getElementById('gallery-list-content'); if (!container) return;
    if (!photos || photos.length === 0) { container.innerHTML = '<div class="empty-msg">Фотографій поки немає</div>'; return; }
    currentVilnohirskPhotos = photos; 
    let html = '<div style="text-align: center; margin-bottom: 12px; font-size: 11px; color: rgba(255,255,255,0.7); font-weight: 600;">Маєте круті фото нашого міста? Надсилайте: <a href="https://t.me/vilnohirsk" target="_blank" style="color: var(--time-green); text-decoration: none; font-weight: 800;">@vilnohirsk</a></div><div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; padding: 5px;">';
    photos.forEach((item, i) => {
        const url = typeof item === 'string' ? item : item.url; const author = typeof item === 'object' && item.author ? item.author : '';
        html += `<div style="aspect-ratio:1/1; border-radius:14px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.2); cursor:pointer; border:1px solid rgba(255,255,255,0.1); position:relative;" onclick="openImageModal(currentVilnohirskPhotos, ${i}, event)"><img src="${url}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">${author ? `<div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding:20px 8px 8px 8px; font-size:10px; font-weight:700; color:rgba(255,255,255,0.9); text-align:left; text-shadow:0 1px 2px rgba(0,0,0,0.8); pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📸 ${author}</div>` : ''}</div>`;
    });
    container.innerHTML = html + '</div>';
}

async function loadGalleryData() {
  try { renderGallery(await fetchCachedJson(`https://vilnohirsk-photos-production.up.railway.app/api/photos`, 'gallery_api', 5)); } 
  catch(e) { document.getElementById('gallery-list-content').innerHTML = '<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження фотографій</div>'; }
}

function setupCaptcha(formId) {
  const form = document.getElementById(formId); if (!form) return;
  const num1 = Math.floor(Math.random() * 10) + 1; const num2 = Math.floor(Math.random() * 10) + 1;
  const exprSpan = form.querySelector('.captcha-expression'); const answerInput = form.querySelector('.captcha-answer'); const userInput = form.querySelector('.captcha-input');
  if (exprSpan) exprSpan.innerText = `${num1} + ${num2}`; if (answerInput) answerInput.value = num1 + num2; if (userInput) userInput.value = '';
}

function validateCaptcha(formId) {
  const form = document.getElementById(formId); if (!form) return false;
  const userInput = form.querySelector('.captcha-input'); const answerInput = form.querySelector('.captcha-answer');
  if (userInput && answerInput && userInput.value.trim() !== answerInput.value) {
      alert('🤖 Невірна відповідь у перевірці на анти-спам! Спробуйте ще раз.'); setupCaptcha(formId); return false;
  } return true;
}

const compressAndGetBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image(); img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas'); const MAX_WIDTH = 1000; const MAX_HEIGHT = 1000;
            let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
            else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]); 
        };
    }; reader.onerror = error => reject(error);
});

async function submitGenericForm(event, formId, modalId, btnId, type, maxPhotos) {
  event.preventDefault(); if (!validateCaptcha(formId)) return;
  const btn = document.getElementById(btnId); const origText = btn.innerText; btn.innerText = maxPhotos ? 'Обробка фото...' : 'Відправка...'; btn.disabled = true; btn.style.opacity = '0.7';
  try {
    const form = document.getElementById(formId); const formData = new FormData(form); const sheetData = { formType: type };
    
    // Формуємо дані
    for (let [key, val] of formData.entries()) { 
        if (key !== 'photos') {
            let finalVal = val;
            // Додаємо апостроф до телефону для Google Таблиць
            if (key === 'phone' && val !== '+380') finalVal = "'" + val;
            // Умное добавление $ только к недвижимости
            if (type === 'estate' && key === 'price' && val) finalVal = val + ' $';
            
            sheetData[key] = finalVal;
        }
    }
    
    if (maxPhotos > 0) {
      const photos = form.querySelector('input[name="photos"]').files; if (photos.length > maxPhotos) throw new Error(`Максимум ${maxPhotos} фото!`);
      let b64 = []; for (let i = 0; i < photos.length; i++) b64.push(await compressAndGetBase64(photos[i])); sheetData.photosBase64 = b64;
    }
    btn.innerText = 'Збереження...';
    await fetch(APP_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(sheetData) });
    alert('✅ Успішно відправлено на модерацію!'); closeModalForm(null, modalId); form.reset(); setupCaptcha(formId);
  } catch (e) { alert('❌ Помилка: ' + e.message); } finally { btn.innerText = origText; btn.disabled = false; btn.style.opacity = '1'; }
}

function openModalForm(formId, modalId) { const form = document.getElementById(formId); if(form) form.reset(); setupCaptcha(formId); document.getElementById(modalId).classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeModalForm(event, modalId) { if (!event || event.target.classList.contains('close-modal-btn') || event.target.id === modalId) { document.getElementById(modalId).classList.remove('active'); document.body.style.overflow = ''; } }
function closeAllShopDropdowns() { document.querySelectorAll('.shop-details-dropdown.open').forEach(el => { el.classList.remove('open'); if (el.parentElement) el.parentElement.classList.remove('tile-active'); }); document.querySelectorAll('.shops-tile-grid').forEach(grid => { grid.style.paddingBottom = '0px'; }); }

document.addEventListener('click', function(e) {
  if (e.target.closest('.image-modal') || e.target.closest('.custom-modal-box')) return;
  if (!e.target.closest('.alert-group')) { const alertDrawer = document.getElementById('alert-drawer'); if (alertDrawer) { alertDrawer.classList.remove('open'); document.querySelectorAll('#alert-tabs .tab-alert').forEach(b => b.classList.remove('active')); } }
  if (!e.target.closest('.train') && !e.target.closest('.details') && !e.target.closest('.pb-category')) { document.querySelectorAll('.details.open').forEach(el => el.classList.remove('open')); document.querySelectorAll('.pb-category.open').forEach(el => el.classList.remove('open')); }
  if (!e.target.closest('.shop-tile')) { closeAllShopDropdowns(); }
  if (!e.target.closest('.schedule-group')) { const transportWidget = document.getElementById('main-list-widget'); if (transportWidget) transportWidget.classList.remove('open'); document.querySelectorAll('#schedule-tabs .tab-btn').forEach(b => b.classList.remove('active')); }
  if (!e.target.closest('.market-group')) { const marketWidget = document.getElementById('market-drawer'); if (marketWidget) marketWidget.classList.remove('open'); document.querySelectorAll('#market-tabs .tab-btn').forEach(b => b.classList.remove('active')); }
});

function recalcDropdownHeight(imgEl) {
  const dropdown = imgEl.closest('.shop-details-dropdown'); const grid = imgEl.closest('.shops-tile-grid');
  if (dropdown && dropdown.classList.contains('open') && grid) { grid.style.paddingBottom = (dropdown.scrollHeight + 15) + 'px'; }
}

function switchAppTab(tabId, btn, group) {
  closeAllShopDropdowns();
  const notifs = {'alert-communal':'communal', 'alert-news':'news', 'alert-events':'events', 'alert-promos':'promos', 'blablacar':'blablacar', 'trains':'trains', 'estate-tab':'estate', 'shopping-tab':'shopping', 'flea-market-tab':'flea', 'lost-found-tab':'lost', 'jobs-tab':'jobs'};
  if (notifs[tabId]) clearNotification(notifs[tabId]);
  const drawers = { alert: 'alert-drawer', schedule: 'main-list-widget', market: 'market-drawer' };
  if (btn.classList.contains('active')) { btn.classList.remove('active'); const groupDrawer = document.getElementById(drawers[group]); if(groupDrawer) groupDrawer.classList.remove('open'); return; }
  document.querySelectorAll('.main-list-widget, .shopping-drawer, .alert-drawer').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.tab-btn, .tab-alert').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const drawer = document.getElementById(drawers[group]);
  if (drawer) { drawer.classList.remove('drawer-events', 'drawer-communal'); if(tabId === 'alert-events') drawer.classList.add('drawer-events'); if(tabId === 'alert-communal') drawer.classList.add('drawer-communal'); drawer.classList.add('open'); }
  btn.classList.add('active'); const targetSection = document.getElementById(tabId); if (targetSection) targetSection.classList.add('active'); 
  window.dataLayer = window.dataLayer || []; window.dataLayer.push({ 'event': 'tab_view', 'tab_name': tabId, 'tab_group': group });
  if (typeof window.checkAllScrolls === 'function') { setTimeout(window.checkAllScrolls, 50); setTimeout(window.checkAllScrolls, 350); }
}

// === ДРАГ-СВАЙП (ГОРТАННЯ МИШКОЮ НА ПК) ===
let isMouseDragging = false;
let startMouseX, startScrollLeft, activeSliderEl, originalSnap;
let hasDragged = false;

document.addEventListener('mousedown', (e) => {
  const slider = e.target.closest('.jobs-carousel, .tabs-nav, .flea-categories-wrapper, .carousel-container');
  if (!slider) return;
  isMouseDragging = true;
  hasDragged = false;
  activeSliderEl = slider;
  startMouseX = e.pageX - slider.offsetLeft;
  startScrollLeft = slider.scrollLeft;
  
  activeSliderEl.style.cursor = 'grabbing';
  originalSnap = getComputedStyle(activeSliderEl).scrollSnapType;
  activeSliderEl.style.scrollSnapType = 'none'; 
});

document.addEventListener('mousemove', (e) => {
  if (!isMouseDragging || !activeSliderEl) return;
  const x = e.pageX - activeSliderEl.offsetLeft;
  const walk = (x - startMouseX) * 1.5;
  if (Math.abs(walk) > 5) {
      hasDragged = true;
      e.preventDefault(); // Запобігаємо виділенню тексту при перетягуванні
  }
  activeSliderEl.scrollLeft = startScrollLeft - walk;
});

const stopDragging = () => {
  isMouseDragging = false;
  if (activeSliderEl) {
      activeSliderEl.style.cursor = '';
      activeSliderEl.style.scrollSnapType = originalSnap || '';
      activeSliderEl = null;
  }
};

document.addEventListener('mouseup', stopDragging);
document.addEventListener('mouseleave', stopDragging);

// Блокуємо клік, якщо користувач тягнув мишкою (щоб не відкривались посилання)
document.addEventListener('click', (e) => {
  if (hasDragged) {
    e.preventDefault();
    e.stopPropagation();
    hasDragged = false;
  }
}, true);

// === СКРОЛЛ КОЛІЩАТКОМ МИШКИ ДЛЯ КАРУСЕЛЕЙ НА ПК ===
document.addEventListener('wheel', (e) => {
  const hScrollEl = e.target.closest('.jobs-carousel, .tabs-nav, .flea-categories-wrapper, .carousel-container');
  if (hScrollEl) {
    // Якщо курсор над текстом, що має власний вертикальний скролл - не блокуємо
    const vScrollEl = e.target.closest('.job-scroll-desc, .alert-item');
    if (vScrollEl && vScrollEl.scrollHeight > vScrollEl.clientHeight) {
        // Даємо змогу скролити текст вакансії/афіші вниз
        return;
    }
    if (e.deltaY !== 0) {
        e.preventDefault();
        hScrollEl.scrollLeft += e.deltaY;
    }
  }
}, { passive: false });

function getKyivNow(){ return new Date(new Date().toLocaleString("en-US",{timeZone:"Europe/Kyiv"})); }
function getWeatherEmoji(code){ if(code === 0) return "☀️"; if(code <= 2) return "⛅"; if(code <= 3) return "☁️"; if(code <= 48) return "🌫️"; if(code <= 67) return "🌧️"; if(code <= 77) return "🌨️"; if(code <= 99) return "⛈️"; return "🌡️"; }

async function loadWeather(){
  const coords = [{name: 'Вільногірськ', lat: 48.48, lon: 34.02}, {name: 'Дніпро', lat: 48.45, lon: 34.98}]; let results = [];
  for(let c of coords){ 
    try { 
      const d = await fetchCachedJson(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FKyiv`, 'weather_'+c.name, 30);
      if (d && d.current) { results.push({ name: c.name, w: { temperature: d.current.temperature_2m, weathercode: d.current.weather_code, windspeed: d.current.wind_speed_10m } }); } 
      else if (d && d.current_weather) { results.push({name: c.name, w: d.current_weather}); }
    } catch(e) {} 
  }
  const container = document.getElementById("weather-container"); 
  if(results.length === 0) { container.innerHTML = '<div class="empty-msg" style="font-size:11px;">Дані погоди тимчасово недоступні ☁️</div>'; return; }
  container.innerHTML = results.map((item, index) => `<div class="weather-content ${index === 0 ? 'active' : ''}" style="width: 100%;"><div class="weather-city">${item.name}</div><div class="weather-temp-row"><span class="weather-icon">${getWeatherEmoji(item.w.weathercode)}</span><span class="weather-temp">${Math.round(item.w.temperature)}°C</span></div><div class="weather-wind"><span style="font-size:14px;">🌬️</span> ${Math.round(item.w.windspeed)} м/с</div></div>`).join("");
  if (window.weatherInterval) clearInterval(window.weatherInterval); let currentIndex = 0;
  window.weatherInterval = setInterval(() => { const slides = container.querySelectorAll('.weather-content'); if(slides.length < 2) return; slides[currentIndex].classList.remove('active'); currentIndex = (currentIndex + 1) % slides.length; slides[currentIndex].classList.add('active'); }, 7000); 
}

async function loadExchangeRates() {
  try {
    const pbRes = await fetch('https://api.privatbank.ua/p24api/pubinfo?exchange&json&coursid=5');
    if (pbRes.ok) {
        const pb = await pbRes.json(); const usd = pb.find(c => c.ccy === 'USD'); const eur = pb.find(c => c.ccy === 'EUR');
        if (usd && eur) { document.getElementById('usd-buy').textContent = Number(usd.buy).toFixed(2); document.getElementById('usd-sell').textContent = Number(usd.sale).toFixed(2); document.getElementById('eur-buy').textContent = Number(eur.buy).toFixed(2); document.getElementById('eur-sell').textContent = Number(eur.sale).toFixed(2); return; }
    }
  } catch (e) {}
  try {
      const dataMono = await fetchCachedJson('https://api.monobank.ua/bank/currency', 'mono_rates', 60);
      if (Array.isArray(dataMono)) {
          const usd = dataMono.find(c => c.currencyCodeA === 840 && c.currencyCodeB === 980); const eur = dataMono.find(c => c.currencyCodeA === 978 && c.currencyCodeB === 980);
          if (usd && eur) { document.getElementById('usd-buy').textContent = Number(usd.rateBuy).toFixed(2); document.getElementById('usd-sell').textContent = Number(usd.rateSell).toFixed(2); document.getElementById('eur-buy').textContent = Number(eur.rateBuy).toFixed(2); document.getElementById('eur-sell').textContent = Number(eur.rateSell).toFixed(2); return; }
      }
  } catch(e2) {}
  try {
      const dataNbu = await fetchCachedJson('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json', 'nbu_rates', 60);
      if (Array.isArray(dataNbu)) {
          const usd = dataNbu.find(c => c.cc === 'USD'); const eur = dataNbu.find(c => c.cc === 'EUR');
          if (usd && eur) { document.getElementById('usd-buy').textContent = Number(usd.rate).toFixed(2); document.getElementById('usd-sell').textContent = Number(usd.rate).toFixed(2); document.getElementById('eur-buy').textContent = Number(eur.rate).toFixed(2); document.getElementById('eur-sell').textContent = Number(eur.rate).toFixed(2); }
      }
  } catch(e3) {}
}

function updateDateTime(){
  try {
    const now = getKyivNow(); document.getElementById("date").textContent=`${String(now.getDate()).padStart(2,"0")}.${String(now.getMonth()+1).padStart(2,"0")}.${now.getFullYear()}`;
    document.getElementById("time").textContent=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
    const days=document.querySelectorAll(".day"); days.forEach(d=>d.classList.remove("active")); let i=now.getDay(); i=i===0?6:i-1; days[i].classList.add("active");
  } catch(e) {}
}

function buildCarouselHtml(items, typeColor, typeId, isEvent = false) {
  if (!items || items.length === 0) { if (isEvent) return `<div class="alert-empty" style="margin-bottom:15px;">Афіш поки немає</div>`; return `<div class="alert-empty">Актуальних повідомлень немає</div>`; }
  const slidesHtml = items.map((item, index) => {
    if(!item) return '';
    if (isEvent) { const photoUrl = item.photo || item.image || item.url; if(!photoUrl) return ''; return `<div class="alert-item" style="padding:0; background:transparent; border:none; display:flex; justify-content:center; align-items:center;"><img src="${photoUrl}" style="max-width:100%; max-height:350px; object-fit:contain; border-radius:12px; box-shadow: 0 4px 15px rgba(224, 86, 253, 0.4); cursor:pointer;" alt="Афіша" onclick="openImageModal(windowEventImages, ${index}, event)"></div>`; } 
    else { const textHtml = item.text ? String(item.text).replace(/\n/g, '<br>') : ''; return `<div class="alert-item">${item.title ? `<div class="alert-card-title" style="color: ${typeColor};">${item.title}</div>` : ''}<div class="alert-card-text">${textHtml}</div></div>`; }
  }).join("");
  if (items.length === 1) return `<div class="carousel-wrapper"><div class="carousel-container">${slidesHtml}</div></div>`;
  const dotsHtml = items.map((_, i) => `<div class="carousel-dot ${i === 0 ? 'active' : ''}" style="background: ${i === 0 ? typeColor : 'rgba(255,255,255,0.3)'};"></div>`).join("");
  return `<div class="carousel-wrapper"><div class="carousel-container" id="carousel-${typeId}" onscroll="updateCarouselDots('carousel-${typeId}', 'dots-${typeId}', '${typeColor}')">${slidesHtml}</div><div class="carousel-dots" id="dots-${typeId}">${dotsHtml}</div></div>`;
}

function updateCarouselDots(containerId, dotsId, activeColor) {
  const container = document.getElementById(containerId); const dotsContainer = document.getElementById(dotsId); if (!container || !dotsContainer) return;
  const dots = dotsContainer.children; const index = Math.round(container.scrollLeft / container.clientWidth);
  for (let i = 0; i < dots.length; i++) { if (i === index) { dots[i].classList.add('active'); if(activeColor) dots[i].style.background = activeColor; } else { dots[i].classList.remove('active'); dots[i].style.background = 'rgba(255,255,255,0.3)'; } }
}

function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
function isVilnohirsk(str) { if (!str) return false; const lower = String(str).toLowerCase(); return lower.includes('вільногірськ') || lower.includes('вильногорск') || lower.includes('вільно') || lower.includes('вильно') || lower.includes('vilnohirsk'); }

async function loadAlerts() {
  try {
    const d = await fetchCachedJson('https://vilnohirsk-alerts-production.up.railway.app/api/alert', 'alerts_api', 5);
    const communalAlerts = (d && Array.isArray(d.communal)) ? d.communal.filter(i => i && i.show) : []; const newsAlerts = (d && Array.isArray(d.news)) ? d.news.filter(i => i && i.show) : [];
    checkNotification('communal', communalAlerts); checkNotification('news', newsAlerts);
    document.getElementById("alert-communal-content").innerHTML = buildCarouselHtml(communalAlerts, '#ffcc00', 'communal'); document.getElementById("alert-news-content").innerHTML = buildCarouselHtml(newsAlerts, '#00ff9c', 'news');
  } catch(e) { document.getElementById("alert-communal-content").innerHTML = `<div class="empty-msg">Помилка завантаження</div>`; document.getElementById("alert-news-content").innerHTML = `<div class="empty-msg">Помилка завантаження</div>`; }
}

async function loadEventsData() {
  try {
    const API_URL = `${atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2RlbnJpczg3L3ZpbG5vaGlyc2stZXZlbnRzL21haW4vZXZlbnRzLmpzb24=')}?t=${new Date().getTime()}`;
    const eventAlerts = await fetchCachedJson(API_URL, 'events_api', 5);
    const activeEvents = Array.isArray(eventAlerts) ? eventAlerts.filter(i => i.show !== false) : [];
    checkNotification('events', activeEvents);
    windowEventImages = activeEvents.map(ev => ev.photo || ev.image || ev.url).filter(Boolean);
    document.getElementById("alert-events-content").innerHTML = buildCarouselHtml(activeEvents, '#FF3366', 'events', true);
  } catch(e) { document.getElementById("alert-events-content").innerHTML = `<div class="empty-msg" style="margin-bottom:15px;">Афіш поки немає</div>`; }
}

var phonebookRawData = [];
async function loadPhonebookData() {
  const container = document.getElementById('city-guide-list-content');
  try {
    const data = await fetchCachedJson('https://vilnohirsk-phonebook-production.up.railway.app/api/phonebook', 'phonebook_api', 30);
    const categoriesData = data.categories || data; if (!categoriesData || !Array.isArray(categoriesData)) throw new Error('Invalid format');
    phonebookRawData = categoriesData; renderPhonebook(phonebookRawData);
  } catch (e) { container.innerHTML = '<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження довідника</div>'; }
}

function renderPhonebook(categories, searchQuery = '') {
  const container = document.getElementById('city-guide-list-content'); let html = ''; let hasResults = false; const query = searchQuery.toLowerCase().trim();
  if (!Array.isArray(categories)) return;
  categories.forEach((cat) => {
     if (!cat || !cat.items || !Array.isArray(cat.items)) return;
     let itemsHtml = ''; let categoryHasMatch = false;
     cat.items.forEach(item => {
        if (!item) return; const safeTitle = (item.title || item.name || '').toString(); const titleMatch = safeTitle.toLowerCase().includes(query);
        let phonesArray = []; if (Array.isArray(item.phones)) { phonesArray = item.phones; } else if (typeof item.phones === 'string') { phonesArray = item.phones.split(',').map(p => p.trim()).filter(Boolean); } else if (item.phone) { phonesArray = [item.phone]; }
        const phoneMatch = phonesArray.some(p => p.toString().includes(query));
        if (query === '' || titleMatch || phoneMatch) {
            categoryHasMatch = true; hasResults = true;
            let phonesHtml = phonesArray.map(p => { let clean = p.toString().replace(/[^0-9+]/g, ''); return `<a href="tel:${clean}" class="pb-phone-btn" onclick="event.stopPropagation();">${p}</a>`; }).join('');
            itemsHtml += `<div class="pb-tile"><div class="pb-tile-title">${safeTitle}</div><div class="pb-tile-phones">${phonesHtml}</div></div>`;
        }
     });
     if (categoryHasMatch) { const safeCatName = cat.name || cat.category || 'Різне'; const safeCatIcon = cat.icon || '📌'; html += `<div class="pb-category-section"><div class="pb-category-header"><span>${safeCatIcon}</span> ${safeCatName}</div><div class="pb-grid">${itemsHtml}</div></div>`; }
  });
  if (!hasResults) { container.innerHTML = '<div class="empty-msg" style="font-size: 14px;">За вашим запитом нічого не знайдено 😔</div>'; } else { container.innerHTML = html; }
}

function filterPhonebook() { const input = document.getElementById('pb-search'); if (phonebookRawData && input) { renderPhonebook(phonebookRawData, input.value); } }

function buildDropdown(id, photosHtml, details) {
  const items = details.map(d => `<div class="shop-inner-item"><span class="detail-icon">${d.icon}</span><div><b>${d.label}:</b><br>${d.value}</div></div>`).join('');
  return `<div class="shop-details-dropdown" id="${id}" onclick="event.stopPropagation()"><div class="shop-inner-list">${photosHtml}${items}</div></div>`;
}

function toggleShop(detailsId, tileElement) {
  const dropdown = document.getElementById(detailsId); if (!dropdown) return;
  const isOpen = dropdown.classList.contains('open'); closeAllShopDropdowns();
  if (!isOpen) { dropdown.classList.add('open'); tileElement.classList.add('tile-active'); const grid = tileElement.closest('.shops-tile-grid'); if (grid) { setTimeout(() => { grid.style.paddingBottom = (dropdown.scrollHeight + 15) + 'px'; }, 50); } }
}

function renderShops(shopsData) {
  const container = document.getElementById('shopping-list-content');
  if (!shopsData || !Array.isArray(shopsData) || shopsData.length === 0) { container.innerHTML = '<div class="empty-msg">Оголошень поки немає</div>'; return; }
  let html = '<div style="text-align: center; margin-bottom: 12px; font-size: 11px; color:rgba(255,255,255,0.7); font-weight: 600;">Если тоже хотите тут появиться, пишите нам в тг <a href="https://t.me/vilnohirsk" target="_blank" style="color: var(--time-green); text-decoration: none; font-weight: 800;">@vilnohirsk</a></div><div class="shops-tile-grid">';
  shopsData.forEach((shop, index) => {
    if(!shop) return;
    const safeName = shop.name != null ? String(shop.name).trim() : ""; const displayName = safeName !== "" ? safeName : "Оголошення " + (index + 1);
    const detailsId = 'shop-detail-' + index; const isVip = shop.vip === true || shop.vip === 'true'; const vipClass = isVip ? 'vip-tile' : ''; const vipBadge = isVip ? '<div class="vip-badge">VIP</div>' : '';
    let rawPhoto = Array.isArray(shop.photos) && shop.photos.length > 0 ? shop.photos[0] : (shop.photo || shop.image || '');
    let photoUrl = String(rawPhoto).trim();
    if (photoUrl) {
        let fileId = '';
        if (photoUrl.includes('id=')) fileId = photoUrl.split('id=')[1].split('&')[0];
        else if (photoUrl.includes('file/d/')) { let match = photoUrl.match(/\/d\/(.*?)\//); if (match && match[1]) fileId = match[1]; }
        if (fileId) photoUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    }
    const photoHtml = photoUrl ? `<img src="${photoUrl}" alt="${displayName}">` : `<span style="font-size:28px;">🛍️</span>`;
    const titleHtml = (shop.instagram && String(shop.instagram).trim() !== "") ? `<a href="${String(shop.instagram).trim()}" target="_blank" style="color:inherit; text-decoration:none;" onclick="event.stopPropagation();">${displayName} 🔗</a>` : displayName;
    let phoneHtml = 'Не вказано';
    if (shop.phone && String(shop.phone).trim() !== "") { phoneHtml = String(shop.phone).split(',').map(p => `<a href="tel:${p.replace(/[^0-9+]/g, '')}" class="shop-phone-link" onclick="event.stopPropagation();">${p.trim()}</a>`).join('<br>'); }
    const isContactless = shop.contactless === true || shop.contactless === 'true' || shop.contactless === '✅';
    let photosHtml = ''; let photosArray = Array.isArray(shop.photos) ? shop.photos : (photoUrl ? [photoUrl] : []);
    if (photosArray.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(photosArray))}')), 0, event)"><img src="${photosArray[0]}" onload="if(recalcDropdownHeight) recalcDropdownHeight(this)"><div class="gallery-text">🔍 Збільшити фото</div></div>`; }
    const dropdownHtml = buildDropdown(detailsId, photosHtml, [ {icon: '📍', label: 'Адреса', value: shop.address || "Не вказано"}, {icon: '🕒', label: 'Графік роботи', value: shop.schedule ? String(shop.schedule).replace(/\n/g, '<br>') : 'Не вказано'}, {icon: '💳', label: 'Термінал', value: isContactless ? '✅' : '❌'}, {icon: '📞', label: 'Телефон(и)', value: phoneHtml} ]);
    html += `<div class="shop-tile ${vipClass}" onclick="toggleShop('${detailsId}', this)">${vipBadge}<div class="shop-tile-photo">${photoHtml}</div><div class="shop-tile-cat">${shop.category || "Магазин"}</div><div class="shop-tile-name">${titleHtml}</div><div class="shop-tile-chevron">Деталі ▾</div>${dropdownHtml}</div>`;
  });
  container.innerHTML = html + '</div>';
}

async function loadShopsData() {
  try {
    const d = await fetchCachedJson('https://vilnohirsk-shops-production.up.railway.app/api/shops', 'shops_api', 5);
    let itemsArray = d.shops || d.items || (Array.isArray(d) ? d : []);
    checkNotification('shopping', itemsArray);
    if (!itemsArray || itemsArray.length === 0) { document.getElementById('shopping-list-content').innerHTML = '<div class="empty-msg">Оголошень поки немає</div>'; return; }
    const activeShops = itemsArray.filter(shop => shop && shop.name && String(shop.name).trim() !== ""); const vipShops = activeShops.filter(shop => shop.vip === true || shop.vip === 'true'); const regularShops = activeShops.filter(shop => shop.vip !== true && shop.vip !== 'true');
    renderShops([...vipShops, ...shuffleArray([...regularShops])]);
  } catch(e) { document.getElementById('shopping-list-content').innerHTML = `<div class="empty-msg" style="color: #ff6b6b;">Помилка завантаження магазинів</div>`; }
}

function renderPromosList(items) {
  const cont = document.getElementById('promos-list-content');
  if (!items || !items.length) { cont.innerHTML = '<div class="empty-msg">Активних пропозицій немає</div>'; return; }
  let html = '<div class="shops-tile-grid">';
  items.forEach((item, i) => {
    const id = 'promo-detail-' + i; 
    const thumb = item.photos && item.photos.length > 0 ? `<img src="${item.photos[0]}">` : `<span style="font-size:28px;">🔥</span>`;
    let photosHtml = '';
    if (item.photos && item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos))}')), 0, event)"><img src="${item.photos[0]}" onload="if(recalcDropdownHeight) recalcDropdownHeight(this)"><div class="gallery-text">🔍 Збільшити фото</div></div>`; }
    const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📝', label: 'Умови акції', value: String(item.description || '').replace(/\n/g, '<br>')}, {icon: '📞', label: 'Телефон', value: `<a href="tel:${String(item.phone || '').replace(/[^0-9+]/g, '')}" class="shop-phone-link">${item.phone || ''}</a>`} ]);
    const isVip = item.vip === true || item.vip === 'true';
    const tileClass = isVip ? 'shop-tile promo-tile vip-tile' : 'shop-tile promo-tile';
    const badgeHtml = isVip ? '<div class="vip-badge" style="background: linear-gradient(135deg, #ffcc00, #ff8800); color: #000; box-shadow: 0 4px 10px rgba(255,204,0,0.4);">VIP АКЦІЯ</div>' : '<div class="vip-badge promo-badge">АКЦІЯ</div>';
    html += `<div class="${tileClass}" onclick="toggleShop('${id}', this)">${badgeHtml}<div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat" style="color: #fff;">Магазин: ${item.shop || 'Не вказано'}</div><div class="card-row"><span class="card-price" style="color: var(--highlight-color); font-size: 14px;">${item.discount || ''}</span></div><div class="shop-tile-name" style="font-size: 14px; margin-bottom: 5px;">${item.title || ''}</div><div style="font-size: 10px; color: rgba(255,255,255,0.7); font-weight: 700; margin-bottom: 5px;">⏳ Діє до: <span style="color:#ffcc00;">${item.validUntil || '-'}</span></div><div class="shop-tile-chevron" style="color: #ff9f43; background: rgba(255,159,67,0.1);">Детальніше ▾</div>${dropdownHtml}</div>`;
  });
  cont.innerHTML = html + '</div>';
}

async function loadPromosData() {
  try {
    const response = await fetch(PROMOS_API_URL + '?_t=' + Date.now());
    if (!response.ok) throw new Error(`Код помилки: ${response.status}`);
    const data = await response.json(); let itemsArray = [];
    if (Array.isArray(data)) itemsArray = data; else if (data && Array.isArray(data.promos)) itemsArray = data.promos;
    const activeItems = itemsArray.filter(item => item && item.active !== false);
    checkNotification('promos', activeItems);
    allPromoItems = [...activeItems.filter(item => item.vip).reverse(), ...activeItems.filter(item => !item.vip).reverse()];
    renderPromosList(allPromoItems);
  } catch (e) { document.getElementById('promos-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d; line-height: 1.4;">Помилка зв'язку з сервером акцій</div>`; }
}

function renderEstateList(items, hasMore = false) {
  const cont = document.getElementById('estate-list-content');
  if (!items || !items.length) { cont.innerHTML = '<div class="empty-msg">Оголошень у цій категорії немає</div>'; return; }
  const sortedItems = [...items.filter(item => item.isVip).reverse(), ...items.filter(item => !item.isVip)];
  let html = '<div class="shops-tile-grid">';
  sortedItems.forEach((item, i) => {
    const id = 'estate-detail-' + i; const thumb = item.photos.length > 0 ? `<img src="${item.photos[0]}">` : `<span style="font-size:28px;">🏠</span>`;
    let photosHtml = '';
    if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos))}')), 0, event)"><img src="${item.photos[0]}" onload="if(recalcDropdownHeight) recalcDropdownHeight(this)"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
    const dealColor = item.dealType.toLowerCase() === 'оренда' ? '#00b8ff' : '#ff3366';
    let displayPrice = item.price ? String(item.price).trim() : 'Договірна';
    if (displayPrice !== 'Договірна' && !displayPrice.includes('$')) { displayPrice += ' $'; }
    const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Тип об\'єкта', value: `${item.propertyType} (${item.dealType})`}, {icon: '📝', label: 'Опис та адреса', value: item.description.replace(/\n/g, '<br>')}, {icon: '📞', label: 'Телефон', value: `<a href="tel:${item.phone.replace(/[^0-9+]/g, '')}" class="shop-phone-link">${item.phone}</a>`} ]);
    html += `<div class="shop-tile ${item.isVip ? 'vip-tile' : ''}" onclick="toggleShop('${id}', this)">${item.isVip ? '<div class="vip-badge">VIP</div>' : ''}<div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat" style="color: ${dealColor};">${item.dealType} • ${item.propertyType}</div><div class="card-row"><span class="card-price">${displayPrice}</span><span class="card-info">Кімнат: ${item.rooms}</span></div><div class="shop-tile-chevron">Деталі ▾</div>${dropdownHtml}</div>`;
  });
  html += '</div>';
  if (hasMore) { html += `<button class="load-more-btn" onclick="estateRenderLimit+=20; const tagE=document.querySelector('#estate-categories .flea-category-tag.active'); filterEstate(tagE?tagE.innerText:'Всі',tagE);">Показати ще ▾</button>`; }
  cont.innerHTML = html;
}

function filterEstate(category, element) {
  document.querySelectorAll('#estate-categories .flea-category-tag').forEach(tag => { tag.classList.remove('active'); }); if(element) { element.classList.add('active'); }
  let filtered = allEstateItems.filter(item => category === 'Всі' || (item.dealType && item.dealType.includes(category)));
  if (currentEstateSort === 'cheap') filtered.sort((a,b) => (parseInt(a.price.replace(/\D/g,''))||0) - (parseInt(b.price.replace(/\D/g,''))||0));
  else if (currentEstateSort === 'expensive') filtered.sort((a,b) => (parseInt(b.price.replace(/\D/g,''))||0) - (parseInt(a.price.replace(/\D/g,''))||0));
  renderEstateList(filtered.slice(0, estateRenderLimit), filtered.length > estateRenderLimit);
}

async function loadEstateData() {
  try {
    const csvText = await fetchCachedText(ESTATE_CSV_URL, 'estate_csv', 0);
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: function(results) {
        const approvedItems = results.data.filter(row => { const keys = Object.keys(row); let status = row['Статус'] || row['Status'] || row['status'] || row[keys[1]]; return status && String(status).trim().toLowerCase() === 'одобрено'; }).map(row => {
          const keys = Object.keys(row); let rawPhoto = row['Фото'] || row['photos'] || row['Photos'] || row[keys[8]] || ''; let photoUrls = String(rawPhoto).split(',').map(p => p.trim()).filter(p => p);
          let processedPhotos = photoUrls.map(url => { let fileId = ''; if (url.includes('id=')) fileId = url.split('id=')[1].split('&')[0]; else if (url.includes('file/d/')) { let match = url.match(/\/d\/(.*?)\//); if (match && match[1]) fileId = match[1]; } return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` : url; });
          const v = String(row['VIP'] || row['vip'] || row[keys[9]] || '').trim().toLowerCase();
          return { dealType: row["Тип угоди"] || row[keys[2]] || 'Оренда', propertyType: row["Об'єкт"] || row["Тип об'єкта"] || row[keys[3]] || 'Квартира', rooms: row["Кімнат"] || row[keys[4]] || '-', price: row["Ціна"] || row[keys[5]] || 'Договірна', description: row["Опис"] || row[keys[6]] || 'Без опису', phone: row["Телефон"] || row[keys[7]] || 'Не вказано', photos: processedPhotos, isVip: (v === 'так' || v === '+' || v === 'true') };
        });
        checkNotification('estate', approvedItems);
        allEstateItems = approvedItems.reverse();
        const activeTag = document.querySelector('#estate-categories .flea-category-tag.active'); filterEstate(activeTag ? activeTag.innerText.trim() : 'Всі', activeTag);
      }
    });
  } catch (e) { document.getElementById('estate-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження</div>`; }
}

function renderFleaMarketList(items, hasMore = false) {
  const cont = document.getElementById('flea-market-list-content');
  const rulesHtml = `<div style="margin-bottom: 12px; background: linear-gradient(145deg, rgba(255, 77, 77, 0.05), rgba(0,0,0,0.2)); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 16px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.2);"><div onclick="const content = this.nextElementSibling; const icon = this.querySelector('.rules-icon'); if(content.style.maxHeight === '0px' || !content.style.maxHeight){ content.style.maxHeight = '400px'; content.style.padding = '0 15px 15px 15px'; icon.style.transform = 'rotate(180deg)'; } else { content.style.maxHeight = '0px'; content.style.padding = '0 15px 0 15px'; icon.style.transform = 'rotate(0deg)'; }" style="padding: 12px 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 12px; color: #ff6b6b;"><span style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 16px;">⚠️</span> Що заборонено публікувати?</span><span class="rules-icon" style="font-size: 14px; transition: transform 0.3s;">▼</span></div><div style="max-height: 0px; padding: 0 15px; overflow: hidden; transition: all 0.3s ease; font-size: 11px; color: rgba(255,255,255,0.85); line-height: 1.5;"><div style="border-top: 1px dashed rgba(255, 77, 77, 0.3); padding-top: 10px;"><ul style="margin: 5px 0 10px 0; padding-left: 20px;"><li>Будь-які <b>товари військового призначення</b> (військова форма, амуніція, бронежилети, зброя, тепловізори тощо).</li><li><b>Алкогольні напої</b> та <b>тютюнові вироби</b> (включаючи електронні сигарети, вейпи, рідини).</li><li>Продаж <b>живих тварин</b>.</li><li>Товари, продаж яких порушує <b>законодавство України</b> (ліки, наркотичні речовини, піротехніка, крадені речі, підроблені документи, спецзасоби).</li></ul><div style="color: #ff4d4d; font-weight: 800; text-align: center; margin-bottom: 5px; text-transform: uppercase;">❌ Такі оголошення будуть видалені!</div></div></div></div>`;
  if (!items || !items.length) { cont.innerHTML = rulesHtml + '<div class="empty-msg">Оголошень у цій категорії немає</div>'; return; }
  const sortedItems = [...items.filter(item => { const v = String(item.vip || '').trim().toLowerCase(); return v === 'так' || v === '+' || v === 'true'; }).reverse(), ...items.filter(item => { const v = String(item.vip || '').trim().toLowerCase(); return !(v === 'так' || v === '+' || v === 'true'); })];
  let html = rulesHtml + '<div class="shops-tile-grid">';
  sortedItems.forEach((item, i) => {
    const id = 'flea-detail-' + i; const thumb = item.photos.length > 0 ? `<img src="${item.photos[0]}">` : `<span style="font-size:28px;">📦</span>`;
    let priceText = item.price ? String(item.price).trim() : 'Ціна договірна'; if (priceText !== "Ціна договірна" && !priceText.toLowerCase().includes("грн")) priceText += " грн";
    let photosHtml = ''; if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos))}')), 0, event)"><img src="${item.photos[0]}" onload="if(recalcDropdownHeight) recalcDropdownHeight(this)"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
    const v = String(item.vip || '').trim().toLowerCase(); const isVip = v === 'так' || v === '+' || v === 'true';
    const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Категорія', value: item.category}, {icon: '✨', label: 'Стан', value: item.condition}, {icon: '📝', label: 'Опис', value: item.description.replace(/\n/g, '<br>')}, {icon: '📞', label: 'Контакти', value: `<a href="tel:${item.phone.replace(/[^0-9+]/g, '')}" class="shop-phone-link">${item.phone}</a>`} ]);
    html += `<div class="shop-tile ${isVip ? 'vip-tile' : ''}" onclick="toggleShop('${id}', this)">${isVip ? '<div class="vip-badge">VIP</div>' : ''}<div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat">${item.category}</div><div class="card-row"><span class="card-price">${priceText}</span><span class="card-info">📍 ${item.location}</span></div><div class="shop-tile-name">${item.title}</div><div class="shop-tile-chevron">Опис ▾</div>${dropdownHtml}</div>`;
  });
  html += '</div>';
  if (hasMore) { html += `<button class="load-more-btn" onclick="fleaRenderLimit+=20; const tagF=document.querySelector('#flea-categories .flea-category-tag.active'); filterFleaMarket(tagF?tagF.innerText:'Всі',tagF);">Показати ще ▾</button>`; }
  cont.innerHTML = html;
}

function filterFleaMarket(category, element) {
  document.querySelectorAll('#flea-categories .flea-category-tag').forEach(tag => { tag.classList.remove('active'); }); if(element) { element.classList.add('active'); }
  let filtered = allFleaMarketItems.filter(item => category === 'Всі' || (item.category && item.category.includes(category)));
  if (currentFleaSort === 'cheap') filtered.sort((a,b) => (parseInt(a.price.replace(/\D/g,''))||0) - (parseInt(b.price.replace(/\D/g,''))||0));
  else if (currentFleaSort === 'expensive') filtered.sort((a,b) => (parseInt(b.price.replace(/\D/g,''))||0) - (parseInt(a.price.replace(/\D/g,''))||0));
  renderFleaMarketList(filtered.slice(0, fleaRenderLimit), filtered.length > fleaRenderLimit);
}

async function loadFleaMarketData() {
  try {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=111977759';
    const csvText = await fetchCachedText(csvUrl, 'flea_csv', 0);
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: function(results) {
        const approvedItems = results.data.filter(row => { const keys = Object.keys(row); let status = row['Статус'] || row['Status'] || row['status'] || row[keys[keys.length - 1]]; return status && String(status).trim().toLowerCase() === 'одобрено'; }).map(row => {
          const keys = Object.keys(row); let rawPhoto = row['Фото (Тип запитання: Завантаження файлу)'] || row['Фото'] || row['photos'] || row['Photos'] || row[keys[5]] || ''; let photoUrls = String(rawPhoto).split(',').map(p => p.trim()).filter(p => p);
          let processedPhotos = photoUrls.map(url => { let fileId = ''; if (url.includes('id=')) fileId = url.split('id=')[1].split('&')[0]; else if (url.includes('file/d/')) { let match = url.match(/\/d\/(.*?)\//); if (match && match[1]) fileId = match[1]; } return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` : url; });
          return { title: row['Назва товару (Коротка відповідь)'] || row['Назва товару'] || row['Title'] || row['title'] || row[keys[1]] || 'Без назви', price: row['Ціна (Коротка відповідь)'] || row['Ціна'] || row['Price'] || row['price'] || row[keys[2]] || '', description: row['Опис (Абзац)'] || row['Опис'] || row['Description'] || row[keys[3]] || 'Без опису', phone: row['Телефон (Коротка відповідь)'] || row['Телефон'] || row['Phone'] || row[keys[4]] || 'Не вказано', photos: processedPhotos, category: row['Категорія товару'] || row['Категорія'] || row['Category'] || row['category'] || row[keys[6]] || 'Різне', condition: row['Стан товару'] || row['Стан'] || row['Condition'] || row['condition'] || row[keys[7]] || 'Не вказано', location: row['Місто/Область, де знаходиться товар'] || row['Місто'] || row['Location'] || row['location'] || row[keys[8]] || 'Вільногірськ', vip: row['VIP'] || row['vip'] || row['Vip'] || '' };
        });
        const localItems = approvedItems.filter(item => isVilnohirsk(item.location)).reverse(); 
        checkNotification('flea', localItems);
        allFleaMarketItems = localItems;
        const activeTag = document.querySelector('#flea-categories .flea-category-tag.active'); filterFleaMarket(activeTag ? activeTag.innerText.trim() : 'Всі', activeTag);
      }
    });
  } catch (e) { document.getElementById('flea-market-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження</div>`; }
}

async function loadLostFoundData() {
  try {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=624471689';
    const csvText = await fetchCachedText(csvUrl, 'lost_csv', 0);
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: function(results) {
        const getValue = (row, possibleNames) => { const key = Object.keys(row).find(k => possibleNames.some(n => k.toLowerCase().includes(n))); return key ? String(row[key]).trim() : ''; };
        const approvedItems = results.data.filter(row => { let status = getValue(row, ['статус', 'status']); if (!status) { const keys = Object.keys(row); status = String(row[keys[keys.length - 1]]).trim(); } return status.toLowerCase() === 'одобрено'; }).map(row => {
          let rawPhoto = getValue(row, ['фото', 'photo', 'photos', 'світлина']); let photoUrls = rawPhoto.split(',').map(p => p.trim()).filter(p => p);
          let processedPhotos = photoUrls.map(url => { let fileId = ''; if (url.includes('id=')) fileId = url.split('id=')[1].split('&')[0]; else if (url.includes('file/d/')) { let match = url.match(/\/d\/(.*?)\//); if (match && match[1]) fileId = match[1]; } return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` : url; });
          return { title: getValue(row, ['назва', 'title', 'речі']) || 'Без назви', type: getValue(row, ['що сталося', 'type', 'тип']) || 'Знайдено', description: getValue(row, ['опис', 'обставини', 'desc']) || 'Без опису', phone: getValue(row, ['телефон', 'phone', 'контакт']) || 'Не вказано', photos: processedPhotos, category: getValue(row, ['категорія', 'category']) || 'Інше', location: getValue(row, ['локація', 'місто', 'location', 'адреса']) || 'Вільногірськ' };
        });
        const localItems = approvedItems; checkNotification('lost', localItems);
        const cont = document.getElementById('lost-found-list-content'); 
        if (!localItems.length) { cont.innerHTML = '<div class="empty-msg">Оголошень немає</div>'; return; }
        let html = '<div class="shops-tile-grid">';
        localItems.reverse().forEach((item, i) => {
          const id = 'lost-detail-' + i; const thumb = item.photos.length > 0 ? `<img src="${item.photos[0]}">` : `<span style="font-size:28px;">🔍</span>`; const badgeColor = item.type.toLowerCase().includes('знайд') ? '#00ff9c' : '#ff4d4d';
          let photosHtml = ''; if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos))}')), 0, event)"><img src="${item.photos[0]}" onload="if(recalcDropdownHeight) recalcDropdownHeight(this)"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
          const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Категорія', value: item.category}, {icon: '📝', label: 'Опис', value: item.description.replace(/\n/g, '<br>')}, {icon: '📞', label: 'Контакти', value: `<a href="tel:${item.phone.replace(/[^0-9+]/g, '')}" class="shop-phone-link">${item.phone}</a>`} ]);
          html += `<div class="shop-tile" onclick="toggleShop('${id}', this)"><div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat">${item.category}</div><div class="card-row"><span class="card-price" style="color:${badgeColor}; max-width:45%;">${item.type}</span><span class="card-info">📍 ${item.location}</span></div><div class="shop-tile-name">${item.title}</div><div class="shop-tile-chevron">Опис ▾</div>${dropdownHtml}</div>`;
        });
        cont.innerHTML = html + '</div>';
      }
    });
  } catch (e) { document.getElementById('lost-found-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження</div>`; }
}

function isPast(timeStr) {
  if (!timeStr || !timeStr.includes(":")) return false; const now = getKyivNow(); const [h, m] = timeStr.split(":").map(Number); const t = new Date(now); t.setHours(h, m, 0, 0); return t < now;
}

function renderGrid(data, isChanges = false, alwaysWhite = false) {
  if (!data || data.length === 0) return ""; const total = data.length; const perCol = Math.ceil(total / 3); let html = '<div class="schedule-grid">';
  for(let c = 0; c < 3; c++) {
    html += '<div class="schedule-column">';
    for(let j = 0; j < perCol; j++) {
      const idx = c * perCol + j;
      if (idx < total) {
        const r = data[idx]; const past = isPast(r[1]); const isVil = (r[0] || "").toLowerCase().includes('вільногірськ'); const rowClass = isVil ? 'schedule-row row-highlight' : 'schedule-row';
        let timeClass = (alwaysWhite || isChanges) ? 'time-normal' : (past ? 'time-passed' : 'time-green');
        html += `<div class="${rowClass}"><div class="schedule-left"><span class="station-number">${idx + 1}.</span><span class="station-name-text">${r[0]}</span></div><div class="${timeClass}">${r[1]}</div></div>`;
      }
    }
    html += '</div>';
  }
  return html + '</div>';
}

function toggleTransportDetails(id, el) {
    const target = document.getElementById(id); if (!target) return;
    const isOpening = !target.classList.contains('open'); document.querySelectorAll('.schedule-group .details.open').forEach(detail => detail.classList.remove('open'));
    if (isOpening) { target.classList.add('open'); setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 350); }
}

async function loadTrainsData(){ 
  try {
    const d = await fetchCachedJson("https://vilnohirsk-trains-production.up.railway.app/api/trains", 'trains_api', 10);
    if(d&&d.trains) {
      let h = `<div class="table-head"><div>№</div><div>Маршрут</div><div>Відпр.</div></div><div id="trains-content">`;
      d.trains.forEach((x, i) => {
        if (!x) return; const id = "train-" + i; const now = getKyivNow(); let sc = "future", dt = x.time;
        if (x.time && x.time.includes(':')) {
          const [hh, mm] = x.time.split(':').map(Number); const tt = new Date(now); tt.setHours(hh, mm, 0, 0); const diff = Math.floor((tt - now) / 60000);
          if (diff < 0) sc = "passed"; else if (diff <= 10) { sc = "soon"; dt = `≈ ${diff} хв`; }
        } else sc = "passed";
        const hc = x.note && x.note !== "змін немає...";
        h += `<div class="train" onclick="toggleTransportDetails('${id}', this)"><div class="train-num-box">${x.number}${hc ? '<span class="train-alert-dot"></span>' : ''}</div><div class="route-text">${x.route}</div><div class="time-val ${sc}">${dt}</div></div><div class="details" id="${id}">${x.fullSchedule ? renderGrid(x.fullSchedule) : "Немає даних"}${hc ? `<div class="details-divider"></div><div class="details-note">${x.note}</div>` : ''}${x.altSchedule ? renderGrid(x.altSchedule, true) : ""}</div>`;
      });
      document.getElementById("list").innerHTML = h + `</div>`;
      const changed = d.trains.filter(x => x && x.note && x.note !== "змін немає...");
      if (changed.length > 0) checkNotification('trains', changed); else { const dot = document.getElementById('dot-trains'); if (dot) dot.style.display = 'none'; }
    }
  } catch(e){ document.getElementById("list").innerHTML='<div class="empty-msg">Помилка завантаження</div>'; } 
}
 
async function loadLongTrainsData() { 
  try {
    const d = await fetchCachedJson("https://grateful-enthusiasm-production-c1cc.up.railway.app/schedule", 'long_trains_api', 30);
    if(d&&d.trains) {
      let h = `<div class="table-head"><div>№</div><div>Маршрут</div><div>Відпр.</div></div>`;
      d.trains.forEach((x,i) => {
        if(!x) return; const id = "lt-" + i; const sm = x.stops ? x.stops.map(s => [s.station, s.time]) : []; const hasChanges = x.changes && Array.isArray(x.changes) && x.changes.length > 0;
        let infoHtml = "";
        if (x.periodicityText) infoHtml += `<div class="details-divider"></div><div class="details-note" style="color: #74b9ff; background: rgba(116, 185, 255, 0.1); border-color: rgba(116, 185, 255, 0.15);"><b>Періодичність:</b><br><span style="color:inherit; font-weight:500;">${x.periodicityText}</span></div>`;
        if (hasChanges) infoHtml += `<div class="details-divider"></div><div class="details-note" style="color: var(--highlight-color); background: rgba(255, 204, 0, 0.1); border-color: rgba(255, 204, 0, 0.15);"><b>Зміни розкладу:</b><ul style="margin: 8px 0 0 0; padding-left: 20px; text-align: left; font-weight: 500;">${x.changes.map(c => `<li>${c}</li>`).join('')}</ul></div>`;
        h += `<div class="train" onclick="toggleTransportDetails('${id}', this)"><div class="train-num-box">${x.number}</div><div class="route-text">${x.route}</div><div class="time-val">${x.time}</div></div><div class="details" id="${id}">${sm.length ? renderGrid(sm, false, true) : "Немає даних"}${infoHtml}</div>`;
      });
      document.getElementById("long-trains-list").innerHTML = h;
    }
  }catch(e){ document.getElementById("long-trains-list").innerHTML='<div class="empty-msg">Помилка завантаження</div>'; } 
}

async function loadBusesData(){ 
  try {
    const d = await fetchCachedJson("https://vilnohirskbuses-production.up.railway.app/api/buses", 'buses_api', 30);
    if(d&&d.buses) {
      let h = `<div class="table-head"><div>Тип</div><div>Маршрут</div><div>Статус</div></div>`;
      d.buses.forEach((b,i) => {
        if(!b) return; const id = "bus-" + i; let ch = '';
        if(b.directions) b.directions.forEach(dir => {
          let rh = dir.rows.map(row => `<div class="schedule-row"><div class="schedule-left"><span class="station-name-text">${row[0]}</span></div><div class="time-normal">${row[1]}</div></div>`).join('');
          ch += `<div class="schedule-column"><div style="text-align:center; color:var(--highlight-color); font-size:11px; margin-bottom:10px; font-weight:800; text-transform:uppercase;">${dir.title}</div>${rh}</div>`;
        });
        let extraInfo = '';
        if (b.note) extraInfo += `<div class="details-divider"></div><div class="details-note">${b.note}</div>`;
        if (b.info) extraInfo += `<div class="details-divider"></div><div class="details-note" style="color: #74b9ff; background: rgba(116, 185, 255, 0.1); border-color: rgba(116, 185, 255, 0.15);">${b.info}</div>`;
        h += `<div class="train" onclick="toggleTransportDetails('${id}', this)"><div class="train-num-box" style="background:transparent; font-size:20px;">🚌</div><div class="route-text">${b.route}</div><div class="time-val future" style="font-size:11px;">Розклад ▾</div></div><div class="details" id="${id}"><div class="bus-grid">${ch}</div>${extraInfo}</div>`;
      });
      document.getElementById("buses-list").innerHTML = h;
    }
  }catch(e){ document.getElementById("buses-list").innerHTML='<div class="empty-msg">Помилка завантаження</div>'; } 
}

function switchBlaBlaList(type) {
  document.querySelectorAll('.blabla-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('blabla-drivers-list').style.display = 'none'; document.getElementById('blabla-passengers-list').style.display = 'none';
  if (type === 'drivers') { document.getElementById('btn-show-drivers').classList.add('active'); document.getElementById('blabla-drivers-list').style.display = 'block'; } 
  else { document.getElementById('btn-show-passengers').classList.add('active'); document.getElementById('blabla-passengers-list').style.display = 'block'; }
  window.dataLayer = window.dataLayer || []; window.dataLayer.push({'event': 'tab_view', 'tab_name': 'blablacar_' + type, 'tab_group': 'blablacar_sub'});
}

async function submitBlaBlaForm(event) {
  event.preventDefault(); if (!validateCaptcha('custom-blabla-form')) return;
  const submitBtn = document.getElementById('form-submit-btn'); const originalBtnText = submitBtn.innerText; submitBtn.innerText = 'Відправка...'; submitBtn.disabled = true; submitBtn.style.opacity = '0.7';
  const formData = { type: document.getElementById('input-type').value, name: document.getElementById('input-name').value, from: document.getElementById('input-from').value, to: document.getElementById('input-to').value, date: document.getElementById('input-date').value, time: document.getElementById('input-time-to').value ? `${document.getElementById('input-time-from').value} - ${document.getElementById('input-time-to').value}` : document.getElementById('input-time-from').value, seats: parseInt(document.getElementById('input-seats').value, 10), price: document.getElementById('input-price').value ? parseInt(document.getElementById('input-price').value, 10) : 0, phone: document.getElementById('input-phone').value, comment: document.getElementById('input-comment').value };
  try {
    const API_URL = 'https://vilnohirsk-blablacar-api-production-67d3.up.railway.app/api/rides'; 
    const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
    if (!response.ok) throw new Error('Помилка сервера при збереженні');
    alert('✅ Ваше оголошення успішно додано!'); closeModalForm(null, 'blabla-modal'); switchBlaBlaList(formData.type === 'driver' ? 'drivers' : 'passengers'); loadBlaBlaCarData(); 
  } catch (error) { alert('❌ Помилка при відправці: ' + error.message); } finally { submitBtn.innerText = originalBtnText; submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
}

async function loadBlaBlaCarData() {
  try {
    const d = await fetchCachedJson('https://vilnohirsk-blablacar-api-production-67d3.up.railway.app/api/rides', 'blabla_api', 0);
    checkNotification('blablacar', d);
    const dr = d.filter(x => x.type === 'driver' && (isVilnohirsk(x.from) || isVilnohirsk(x.to)));
    const ps = d.filter(x => x.type === 'passenger' && (isVilnohirsk(x.from) || isVilnohirsk(x.to)));
    document.getElementById('blabla-drivers-list').innerHTML = dr.length ? dr.map(x => `<div class="blabla-card"><div class="blabla-route">📍 ${x.from} - ${x.to}</div><div class="blabla-date">🗓 ${x.date} | 🕒 ${x.time}</div><div style="font-size:12px; margin-bottom:5px;">👤 <b>${x.name}</b></div><div class="blabla-info-row"><span>💺 Місць: <b>${x.seats}</b></span><span>💵 <b>${x.price > 0 ? x.price + ' грн' : 'Договірна'}</b></span></div>${x.comment ? `<div class="card-desc">💬 ${x.comment}</div>` : ''}<div style="text-align:right; margin-top:5px;"><a href="tel:${x.phone}" class="blabla-phone">📞 ${x.phone}</a></div></div>`).join('') : '<div class="empty-msg">Пропозицій немає</div>';
    document.getElementById('blabla-passengers-list').innerHTML = ps.length ? ps.map(x => `<div class="blabla-card"><div class="blabla-route">📍 ${x.from} - ${x.to}</div><div class="blabla-date">🗓 ${x.date} | 🕒 ${x.time}</div><div style="font-size:12px; margin-bottom:5px;">👤 <b>${x.name}</b></div><div class="blabla-info-row"><span>🧍 Потрібно місць: <b>${x.seats}</b></span></div>${x.comment ? `<div class="card-desc">💬 ${x.comment}</div>` : ''}<div style="text-align:right; margin-top:5px;"><a href="tel:${x.phone}" class="blabla-phone">📞 ${x.phone}</a></div></div>`).join('') : '<div class="empty-msg">Запитів немає</div>';
  } catch(e) {}
}

async function loadTickerData() {
  try {
    const data = await fetchCachedJson('https://vilnohirsk-ticker-api-production.up.railway.app/api/ticker', 'ticker_api', 2);
    const container = document.getElementById('ticker-container');
    const content = document.getElementById('ticker-content');
    
    if (data && data.messages && data.messages.length > 0) {
      content.innerHTML = data.messages.map(m => `<span class="ticker-item">${m}</span>`).join('<span class="ticker-divider">🟢</span>');
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
    }
  } catch(e) {
    document.getElementById('ticker-container').style.display = 'none';
  }
}

async function loadVolunteersData() {
  const container = document.getElementById('volunteers-list-content'); if (!container) return;
  try {
    const data = await fetchCachedJson('https://vilnohirsk-volunteers-api-production.up.railway.app/api/volunteers', 'volunteers_api', 0);
    let itemsArray = Array.isArray(data) ? data : (data && Array.isArray(data.volunteers) ? data.volunteers : []);
    const activeItems = itemsArray.filter(item => item && item.active !== false);
    if (!activeItems || activeItems.length === 0) { container.innerHTML = '<div class="empty-msg">Тимчасово немає активних зборів. Слава Україні! 🇺🇦</div>'; return; }
    let html = '';
    activeItems.forEach((item, i) => {
        const title = item.title || 'ЗБІР НА ЗСУ'; const desc = item.description ? item.description.replace(/\n/g, '<br>') : 'Підтримайте наших захисників!';
        const jarUrl = item.jar_url || ''; const cardNumber = item.card_number || ''; const id = Math.random().toString(36).substr(2, 5);
        const collected = item.collected ? parseInt(item.collected.toString().replace(/\D/g, ''), 10) : 0; const goal = item.goal ? parseInt(item.goal.toString().replace(/\D/g, ''), 10) : 0;
        let progressHtml = '';
        if (goal > 0) {
            const percent = Math.min(Math.round((collected / goal) * 100), 100);
            progressHtml = `<div style="width: 100%; margin-top: 15px; margin-bottom: 5px;"><div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 6px;"><span style="color: #00ff9c;">Зібрано: ${collected.toLocaleString('uk-UA')} ₴</span><span style="color: rgba(255,255,255,0.5);">Ціль: ${goal.toLocaleString('uk-UA')} ₴</span></div><div style="width: 100%; height: 6px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);"><div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #ffcc00); border-radius: 10px; transition: width 1s ease-in-out;"></div></div></div>`;
        }
        let reqsHtml = '';
        if (jarUrl) reqsHtml += `<a href="${jarUrl}" target="_blank" style="display: block; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; margin-bottom: 10px; text-decoration: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(0,0,0,0.25)'"><div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="font-size: 16px;">🏦</span><span style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Посилання на Банку</span></div><div style="font-size: 13px; color: var(--time-green); font-weight: 800; word-break: break-all; line-height: 1.4;" id="jar-${id}">${jarUrl}</div></a>`;
        if (cardNumber) reqsHtml += `<div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px;"><div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="font-size: 16px;">💳</span><span style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Номер картки</span></div><div style="font-size: 18px; font-weight: 800; font-family: monospace; letter-spacing: 1px; color: #fff; margin-bottom: 12px; text-align: center;" id="card-${id}">${cardNumber}</div><button onclick="copyToClipboardBtn('${cardNumber.replace(/\s/g, '')}', this)" style="width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; padding: 10px; font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s;">📋 Копіювати номер</button></div>`;
        html += `<div style="margin-bottom: 20px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); position: relative;"><div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; padding-right: 15px;"><div style="width: 10px; height: 10px; border-radius: 50%; background: #ffcc00; box-shadow: 0 0 10px rgba(255, 204, 0, 0.6); margin-top: 4px; flex-shrink: 0; animation: pulseAlert 2s infinite;"></div><div style="font-size: 15px; font-weight: 800; color: #fff; line-height: 1.3; text-align: left;">${title}</div></div><div style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.6; text-align: left; margin-bottom: 15px; word-break: break-word;">${desc}</div>${progressHtml}<div style="margin-top: 20px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;"><div style="font-size: 10px; font-weight: 700; color: var(--highlight-color); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; text-align: left;">Реквізити для допомоги:</div>${reqsHtml}</div></div>`;
    });
    container.innerHTML = html;
  } catch (e) { container.innerHTML = '<div class="empty-msg">Тимчасово немає активних зборів. Слава Україні! 🇺🇦</div>'; }
}

window.checkAllScrolls = function() {
  document.querySelectorAll('.job-scroll-desc').forEach(scrollEl => {
    const indicator = scrollEl.parentElement.querySelector('.scroll-indicator');
    if (!indicator) return;
    const needsScroll = scrollEl.scrollHeight > scrollEl.clientHeight + 5;
    if (needsScroll) {
      if (indicator.style.display !== 'flex') indicator.style.display = 'flex';
      const isAtBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 10;
      const targetOpacity = isAtBottom ? '0' : '1';
      if (indicator.style.opacity !== targetOpacity) indicator.style.opacity = targetOpacity;
    } else {
      if (indicator.style.display !== 'none') indicator.style.display = 'none';
    }
  });

  document.querySelectorAll('.jobs-carousel').forEach(carousel => {
    const hint = carousel.parentElement.querySelector('.scroll-hint');
    if (!hint) return;
    const needsScroll = carousel.scrollWidth > carousel.clientWidth + 5;
    if (needsScroll) {
      if (hint.style.display !== 'flex') hint.style.display = 'flex';
      const isAtEnd = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 10;
      if (isAtEnd) {
        hint.classList.add('hidden');
      } else {
        hint.classList.remove('hidden');
      }
    } else {
      if (hint.style.display !== 'none') hint.style.display = 'none';
    }
  });
};

function renderJobs(jobs) {
  const container = document.getElementById('jobs-list-content'); if (!container) return;
  if (!jobs || jobs.length === 0) { container.innerHTML = '<div class="empty-msg">Актуальних вакансій немає</div>'; return; }
  let html = '';
  const stopWords = ['зсу', 'батальйон', 'бригада', 'військов', 'взвод', 'міномет', 'штурмов', 'розвідувальн', 'десантн', 'тцк', 'сил оборони', 'військкомат', 'навідник', 'кулеметник', 'гранатометник', 'зенітн', 'артилері', 'морськ', 'піхот', 'снайпер', 'сапер', 'командир відділення', 'бойов', 'дшв'];
  const safeJobs = jobs.filter(job => { const textToSearch = ((job.title || '') + ' ' + (job.company || '') + ' ' + (job.description || '')).toLowerCase(); return !stopWords.some(word => textToSearch.includes(word)); });
  const vipJobs = safeJobs.filter(j => j.isVip || j.vip).reverse();
  const internetJobs = safeJobs.filter(j => !j.isVip && !j.vip && (j.source === 'Work.ua' || j.date === 'Work.ua'));
  const regularJobs = safeJobs.filter(j => !j.isVip && !j.vip && j.source !== 'Work.ua' && j.date !== 'Work.ua');
  
  function createJobCardHtml(job, extraClass = '') {
    const isTel = job.url && job.url.startsWith('tel:');
    let displayPhone = job.phone;
    if (displayPhone) { let cleanPhone = displayPhone.replace(/\D/g, ''); if (cleanPhone.length >= 10) displayPhone = '0' + cleanPhone.slice(-9); else if (cleanPhone.length === 9) displayPhone = '0' + cleanPhone; }
    const btnText = isTel && displayPhone ? displayPhone : (isTel ? 'Зателефонувати' : 'Відгукнутися 🔗');
    const targetAttr = isTel ? '_self' : '_blank'; 
    let displaySalary = job.salary; if (displaySalary && displaySalary !== '-' && /^\d+$/.test(displaySalary.trim())) { displaySalary = displaySalary.trim() + ' грн'; }
    const isVip = job.isVip || job.vip; const vipBadge = isVip ? '<div class="vip-badge" style="top:-8px; right:-8px; font-size: 12px; padding: 4px 10px;">VIP</div>' : ''; const vipClass = isVip ? 'vip-job-card' : 'regular-job-card';
    const employment = job.employment || 'Повна / Не вказано'; const safeDesc = job.description ? String(job.description).replace(/\n/g, '<br>') : '';
    
    return `<div class="blabla-card ${vipClass} ${extraClass}" style="height: 380px; position: relative; text-align: left; ${!isVip ? 'background:linear-gradient(145deg, rgba(255,255,255,0.05), rgba(0,0,0,0.2)); border:1px solid rgba(255,255,255,0.05);' : ''} border-radius: 16px; padding: 0; display: flex; flex-direction: column; min-width: 0; overflow: visible; box-sizing: border-box; margin-bottom: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
        ${vipBadge}
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding: 15px; padding-right: 15px; flex-shrink: 0;">
          <div style="font-size: 15px; font-weight: 800; color: ${isVip ? '#ffcc00' : '#74b9ff'}; min-width: 0; word-break: break-word; line-height: 1.3;">${job.title}</div>
          <div style="width: 36px; height: 36px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: 10px; font-size: 16px; border: 1px solid rgba(255,255,255,0.05);">💼</div>
        </div>
        <div style="padding: 15px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0;">
          <div style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.8; flex: 1; min-width: 150px;">
            <div><b>Роботодавець:</b> ${job.company}</div>
            <div><b>Зайнятість:</b> ${employment}</div>
          </div>
          <div style="font-size: 18px; font-weight: 900; color: #00ff9c; white-space: nowrap; text-align: right; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${displaySalary}</div>
        </div>
        ${safeDesc ? `<div style="position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; margin-bottom: 5px; border-radius: 0 0 16px 16px;"><div class="card-desc job-scroll-desc" style="padding: 0 15px 15px 15px; flex: 1; overflow-y: auto; overscroll-behavior: contain; position: relative; z-index: 1;">📝 ${safeDesc}</div><div class="scroll-indicator"><span>❯</span></div></div>` : '<div style="flex: 1;"></div>'}
        <div style="background: rgba(0,0,0,0.3); border-radius: 0 0 16px 16px; padding: 12px 15px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; min-width: 0; gap: 10px; margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); flex-shrink: 0;">
           <div style="font-size: 11px; color: rgba(255,255,255,0.6); font-weight: 600; margin-right: auto;">Дата: ${job.date}</div>
           <div style="font-size: 12px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #00b8ff, #0055ff); padding: 8px 14px; border-radius: 12px; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 184, 255, 0.4); text-transform: uppercase; letter-spacing: 0.5px; text-align: center; flex-shrink: 1; word-wrap: break-word;" onclick="window.open('${job.url}', '${targetAttr}'); event.stopPropagation();">${btnText}</div>
        </div>
      </div>`;
  }
  
  if (vipJobs.length > 0) { 
      html += '<div style="font-size:11px; color:var(--highlight-color); text-transform:uppercase; font-weight:800; margin-bottom:10px; text-align:left; padding-left:5px; letter-spacing: 0.5px;">🌟 VIP Вакансії</div><div style="position: relative;"><div class="jobs-carousel">'; 
      vipJobs.forEach(job => { html += createJobCardHtml(job, 'jobs-carousel-card'); }); 
      html += '</div><div class="scroll-hint" style="border-radius: 0 16px 16px 0; right: -5px; top: 12px; bottom: 15px; width: 40px;"><span>❯</span></div></div>'; 
  }
  if (vipJobs.length > 0 && (internetJobs.length > 0 || regularJobs.length > 0)) { html += '<div class="section-divider"></div>'; }
  if (internetJobs.length > 0) {
      html += `<div style="margin-bottom: 10px;"><button onclick="const d = document.getElementById('workua-drawer'); d.classList.toggle('open'); this.querySelector('.arr').textContent = d.classList.contains('open') ? '▴' : '▾'; setTimeout(window.checkAllScrolls, 350);" style="width:100%; background:rgba(0, 255, 156, 0.05); border:1px solid rgba(0, 255, 156, 0.3); padding:12px 15px; border-radius:12px; color:var(--time-green); font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition: background 0.3s; box-shadow: 0 4px 10px rgba(0,0,0,0.1);"><span>🌐 Показати вакансії з Work.ua (${internetJobs.length})</span><span class="arr" style="font-size:16px;">▾</span></button><div id="workua-drawer" class="workua-drawer"><div style="position: relative;"><div class="jobs-carousel">`;
      internetJobs.forEach(job => { html += createJobCardHtml(job, 'jobs-carousel-card'); }); html += `</div><div class="scroll-hint" style="border-radius: 0 16px 16px 0; right: -5px; top: 12px; bottom: 15px; width: 40px;"><span>❯</span></div></div></div></div>`;
  }
  if (internetJobs.length > 0 && regularJobs.length > 0) { html += '<div class="section-divider"></div>'; }
  if (regularJobs.length > 0) {
      html += '<div style="font-size:11px; color:var(--highlight-color); text-transform:uppercase; font-weight:800; margin-bottom:10px; text-align:left; padding-left:5px; letter-spacing: 0.5px;">👥 Від місцевих жителів</div><div style="position: relative;"><div class="jobs-carousel">';
      shuffleArray(regularJobs).forEach(job => { html += createJobCardHtml(job, 'jobs-carousel-card'); }); html += '</div><div class="scroll-hint" style="border-radius: 0 16px 16px 0; right: -5px; top: 12px; bottom: 15px; width: 40px;"><span>❯</span></div></div>';
  }
  container.innerHTML = html;

  document.querySelectorAll('.job-scroll-desc, .jobs-carousel').forEach(el => {
    el.addEventListener('scroll', window.checkAllScrolls, { passive: true });
  });

  requestAnimationFrame(window.checkAllScrolls);
  setTimeout(window.checkAllScrolls, 100);
  setTimeout(window.checkAllScrolls, 500);
  setTimeout(window.checkAllScrolls, 1500);
}

async function loadJobsData() {
  let allJobs = [];
  try { const parsedJobs = await fetchCachedJson('https://vilnohirsk-jobs-api-production.up.railway.app/api/jobs', 'jobs_api', 60); if (Array.isArray(parsedJobs)) { allJobs = allJobs.concat(parsedJobs); } } catch(e) {}
  const SHEET_GID = '1809375718'; const csvUrl = `https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
  try {
    const csvText = await fetchCachedText(csvUrl, 'jobs_csv', 0);
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: function(results) {
        const userJobs = results.data.filter(row => { const keys = Object.keys(row); let status = row['Статус'] || row['Status'] || row['status'] || row[keys[1]]; return status && String(status).trim().toLowerCase() === 'одобрено'; }).map(row => {
          const keys = Object.keys(row); const phone = row['Телефон'] || row[keys[6]] || ''; const gender = row['Стать'] || row['gender'] || row[keys[7]] || ''; const employment = row['Зайнятість'] || row['employment'] || row[keys[8]] || ''; const vipStatus = row['VIP'] || row[keys[9]] || ''; const isVip = vipStatus.trim().toLowerCase() === 'так' || vipStatus.trim() === '+';
          return { title: row['Посада'] || row[keys[2]] || 'Без назви', salary: row['Зарплата'] || row[keys[3]] || '-', company: row['Компанія'] || row[keys[4]] || 'Не вказано', description: row['Опис'] || row[keys[5]] || '', date: row['Дата'] ? String(row['Дата']).split(' ')[0] : 'Нещодавно', phone: phone, gender: gender, employment: employment, url: phone ? `tel:${phone.replace(/[^0-9+]/g, '')}` : '#', isVip: isVip, source: 'User' };
        });
        allJobs = allJobs.concat(userJobs); checkNotification('jobs', allJobs); renderJobs(allJobs);
      }
    });
  } catch (e) { checkNotification('jobs', allJobs); renderJobs(allJobs); }
}

let radioStatsInterval;
async function updateRadioStats() {
  try {
    const res = await fetch('https://myradio24.com/users/muzdance/status.json?t=' + Date.now());
    if(res.ok) {
      const data = await res.json();
      const audio = document.getElementById('radio-audio');
      if (!audio.paused && data.listeners !== undefined) {
         document.getElementById('radio-track-name').innerHTML = `muzdance.com.ua <span style="color: var(--time-green); margin-left: 4px;">🎧 ${data.listeners}</span>`;
      }
    }
  } catch(e) {}
}

function toggleRadio() {
    const audio = document.getElementById('radio-audio'); const icon = document.getElementById('radio-icon'); const status = document.getElementById('radio-status'); const eq = document.getElementById('equalizer');
    if (audio.paused) {
        status.innerText = 'ЗАВАНТАЖЕННЯ...'; status.style.color = '#38bdf8'; eq.classList.add('playing');
        audio.src = "https://myradio24.org/muzdance?t=" + new Date().getTime(); audio.load();
        const playPromise = audio.play();
        if (playPromise !== undefined) { 
          playPromise.then(() => { 
            icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#0b1d3a"><path d="M5 3l14 9-14 9V3z"/></svg>'; 
            status.innerText = 'PLAY'; status.style.color = '#00ff9c'; icon.style.transform = 'none'; 
            updateRadioStats();
            if(!radioStatsInterval) radioStatsInterval = setInterval(updateRadioStats, 15000);
          }).catch(error => { status.innerText = 'ПОМИЛКА'; status.style.color = '#ff4d4d'; eq.classList.remove('playing'); }); 
        }
    } else {
        audio.pause(); audio.src = ""; icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#0b1d3a"><path d="M5 3l14 9-14 9V3z"/></svg>'; status.innerText = 'PAUSED'; status.style.color = 'rgba(255,255,255,0.5)'; eq.classList.remove('playing'); icon.style.transform = 'translateX(1px)';
        document.getElementById('radio-track-name').innerText = 'muzdance.com.ua';
        if(radioStatsInterval) { clearInterval(radioStatsInterval); radioStatsInterval = null; }
    }
}

async function showDailyVolunteerAlert() {
    const today = new Date().toDateString(); const lastSeen = localStorage.getItem('last_zsu_alert_date'); if (lastSeen === today) return;
    try {
        const API_URL = 'https://vilnohirsk-volunteers-api-production.up.railway.app/api/volunteers'; const data = await fetchCachedJson(API_URL, 'volunteers_api', 0); 
        let itemsArray = Array.isArray(data) ? data : (data && Array.isArray(data.volunteers) ? data.volunteers : []);
        const activeItems = itemsArray.filter(item => item && item.active !== false);
        if (activeItems && activeItems.length > 0) {
            const item = activeItems[0]; const title = item.title || 'ЗБІР НА ЗСУ'; const desc = item.description ? String(item.description).replace(/\n/g, '<br>') : ''; const jarUrl = item.jar_url || ''; const cardNumber = item.card_number || ''; const collected = item.collected ? parseInt(item.collected.toString().replace(/\D/g, ''), 10) : 0; const goal = item.goal ? parseInt(item.goal.toString().replace(/\D/g, ''), 10) : 0;
            let progressHtml = '';
            if (goal > 0) { const percent = Math.min(Math.round((collected / goal) * 100), 100); progressHtml = `<div style="width: 100%; margin-top: 15px; margin-bottom: 15px;"><div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; margin-bottom: 6px;"><span style="color: #00ff9c;">Зібрано: ${collected.toLocaleString('uk-UA')} ₴</span><span style="color: rgba(255,255,255,0.5);">Ціль: ${goal.toLocaleString('uk-UA')} ₴</span></div><div style="width: 100%; height: 8px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);"><div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #ffcc00); border-radius: 10px; transition: width 1s ease-in-out;"></div></div></div>`; }
            let btnHtml = ''; if (jarUrl) { btnHtml = `<a href="${jarUrl}" target="_blank" style="display: block; width: 100%; background: #fff; color: #000; text-align: center; padding: 14px; border-radius: 14px; font-weight: 900; text-decoration: none; font-size: 16px; margin-top: 10px; box-shadow: 0 4px 15px rgba(255,255,255,0.2);">💸 Підтримати банку</a>`; }
            const modalContent = document.getElementById('daily-zsu-content');
            modalContent.innerHTML = `<div style="text-align: center; font-size: 40px; margin-bottom: 5px;">🇺🇦</div><h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 800; text-align: center; color: #fff; line-height: 1.3;">${title}</h3><div style="font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.5; text-align: left; margin-bottom: 15px; max-height: 200px; overflow-y: auto; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">${desc}</div>${progressHtml}${btnHtml}<button onclick="closeModalForm(null, 'daily-zsu-modal')" style="width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.8); padding: 12px; border-radius: 14px; font-weight: 700; margin-top: 10px; font-size: 14px; cursor: pointer; transition: 0.2s;">Повернутися до сайту</button>`;
            document.getElementById('daily-zsu-modal').classList.add('active'); document.body.style.overflow = 'hidden'; localStorage.setItem('last_zsu_alert_date', today);
        }
    } catch (e) { console.error("Failed to load daily ZSU alert", e); }
}

async function submitBetaFeedback(event) {
  event.preventDefault(); const textEl = document.getElementById('beta-feedback-text'); const text = textEl.value.trim();
  if (!text) { alert('Будь ласка, напишіть текст відгуку.'); return; }
  const btn = event.target; const originalText = btn.innerText; btn.innerText = 'Відправка...'; btn.disabled = true;
  try {
    await fetch(APP_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ formType: 'feedback', text: text }) });
    alert('✅ Дякуємо! Ваш відгук успішно відправлено.'); textEl.value = ''; closeModalForm(null, 'feedback-modal');
  } catch(e) { alert('❌ Помилка: ' + e.message); } finally { btn.innerText = originalText; btn.disabled = false; }
}

const initApp = () => {
  updateRadioStats();
  updateDateTime(); setInterval(updateDateTime, 1000); loadWeather(); loadAlerts(); loadExchangeRates();
  setTimeout(() => { loadTrainsData(); loadLongTrainsData(); loadBusesData(); loadEventsData(); loadTickerData(); }, 100);
  setTimeout(() => { loadPromosData(); loadShopsData(); loadFleaMarketData(); loadEstateData(); loadLostFoundData(); loadBlaBlaCarData(); loadJobsData(); loadPhonebookData(); loadGalleryData(); loadVolunteersData(); setTimeout(showDailyVolunteerAlert, 1500); }, 600);
  setInterval(() => { loadTrainsData(); loadLongTrainsData(); loadAlerts(); loadEventsData(); loadPromosData(); loadShopsData(); loadFleaMarketData(); loadEstateData(); loadLostFoundData(); loadBlaBlaCarData(); loadJobsData(); loadVolunteersData(); loadExchangeRates(); loadTickerData(); }, 60000);
  document.querySelectorAll('.form-input').forEach(input => { input.addEventListener('focus', function() { setTimeout(() => { this.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); }); });
};

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }

// Реєстрація Service Worker для роботи офлайн
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('Service Worker зареєстровано успішно:', registration.scope);
      })
      .catch(error => {
        console.log('Помилка реєстрації Service Worker:', error);
      });
  });
}