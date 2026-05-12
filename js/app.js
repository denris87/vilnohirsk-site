(function(){
  const f = atob('aHR0cHM6Ly9naXRodWIuY29tL2RlbnJpczg3L3ZpbG5vaGlyc2stc2l0ZS9ibG9iL21haW4vYXBwbGUtdG91Y2gtaWNvbi5wbmc/cmF3PXRydWU=');
  const l1 = document.createElement('link'); l1.rel = 'icon'; l1.type = 'image/png'; l1.href = f;
  const l2 = document.createElement('link'); l2.rel = 'apple-touch-icon'; l2.href = f;
  document.head.appendChild(l1); document.head.appendChild(l2);
})();

const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyDwYQpUFVN9rvS-auA4mlqEO5ffKE8e5mWwPMiXhlbDbD94S07MleIBsVMXjzKMnUd/exec';
const ESTATE_CSV_URL = 'https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=622618191';
const PROMOS_API_URL = 'https://vilnohirsk-promos-api-production.up.railway.app/api/promos';

let currentDataSignature = {};
let allFleaMarketItems = []; let fleaRenderLimit = 20; let currentFleaSort = 'new';
let allEstateItems = []; let estateRenderLimit = 20; let currentEstateSort = 'new';
let allPromoItems = [];
let phonebookRawData = [];

// === БЕЗОПАСНОСТЬ И УТИЛИТЫ ===
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

function getDriveImageUrl(rawUrl) {
    let photoUrl = String(rawUrl).trim();
    if (!photoUrl) return '';
    let fileId = '';
    if (photoUrl.includes('id=')) fileId = photoUrl.split('id=')[1].split('&')[0];
    else if (photoUrl.includes('file/d/')) { let match = photoUrl.match(/\/d\/(.*?)\//); if (match && match[1]) fileId = match[1]; }
    return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` : photoUrl;
}

// === ЛОГИКА НОВЫХ ЭЛЕМЕНТОВ И КРАСНЫХ ТОЧЕК ===
const NEW_BADGE_HTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ff3366; box-shadow:0 0 8px #ff3366; animation:pulseAlert 2s infinite; margin-left:6px; vertical-align:middle;" title="Нове"></span>';

function markNewItems(array, key, newestFirst = true) {
    if (!array || !array.length) return array;
    const seenStr = localStorage.getItem('seen_' + key);
    if (seenStr) {
        const seenCount = parseInt(seenStr, 10);
        if (array.length > seenCount) {
            const diff = array.length - seenCount;
            if (newestFirst) {
                for (let i = 0; i < diff && i < array.length; i++) array[i].isNewItem = true;
            } else {
                for (let i = array.length - 1; i >= Math.max(0, array.length - diff); i--) array[i].isNewItem = true;
            }
        }
    }
    return array;
}

function checkNotification(key, dataArray) {
  const currentLength = (dataArray && dataArray.length) ? dataArray.length : 0;
  currentDataSignature[key] = String(currentLength);
  const dot = document.getElementById('dot-' + key);
  const seenSignature = localStorage.getItem('seen_' + key);
  
  if (!seenSignature) { 
    localStorage.setItem('seen_' + key, String(currentLength)); 
  } else {
    const seenCount = parseInt(seenSignature, 10);
    if (currentLength > seenCount && dot) { 
      dot.style.display = 'block'; 
    }
  }
}

function clearNotification(key) {
  const dot = document.getElementById('dot-' + key); 
  if (dot) dot.style.display = 'none';
  if (currentDataSignature[key] !== undefined) { 
    localStorage.setItem('seen_' + key, currentDataSignature[key]); 
  }
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
  track.innerHTML = currentGallery.map(img => `<div class="image-modal-slide" onclick="handleSlideClick(event)"><img src="${img.url}" alt="Фото">${img.author ? `<div style="position:absolute; bottom:60px; left:50%; transform:translateX(-50%); color:#fff; font-weight:700; font-size:12px; background:rgba(0,0,0,0.6); padding:6px 14px; border-radius:14px; z-index:100002; pointer-events:none; white-space:nowrap;">📸 Фото: ${escapeHTML(img.author)}</div>` : ''}</div>`).join('');
  track.style.transition = 'none'; updateModalImage(); 
  
  const modalObj = document.getElementById('image-modal');
  modalObj.style.zIndex = '9999999';
  modalObj.classList.add('active');
  
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
      if (activeImg) { activeImg.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`; }
  } else if (e.touches.length === 1) {
      if (isPinching) return; const diffX = e.touches[0].clientX - touchStartX; const diffY = e.touches[0].clientY - touchStartY;
      if (currentZoom > 1) {
          e.preventDefault(); panX = startPanX + diffX; panY = startPanY + diffY;
          if (activeImg) { activeImg.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom})`; }
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
    const modalObj = document.getElementById('image-modal');
    modalObj.classList.remove('active'); 
    
    if (!document.querySelector('.custom-modal-overlay.active')) {
        document.body.style.overflow = ''; 
    }
}

function renderGallery(photos) {
    const container = document.getElementById('gallery-list-content'); if (!container) return;
    if (!photos || photos.length === 0) { container.innerHTML = '<div class="empty-msg">Фотографій поки немає</div>'; return; }
    currentVilnohirskPhotos = photos; 
    let html = '<div style="text-align: center; margin-bottom: 12px; font-size: 11px; color: rgba(255,255,255,0.7); font-weight: 600;">Маєте круті фото нашого міста? Надсилайте: <a href="https://t.me/vilnohirsk" target="_blank" style="color: var(--time-green); text-decoration: none; font-weight: 800;">@vilnohirsk</a></div><div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; padding: 5px;">';
    photos.forEach((item, i) => {
        const url = typeof item === 'string' ? item : item.url; const author = typeof item === 'object' && item.author ? item.author : '';
        const dotHtml = item.isNewItem ? '<div style="position:absolute; top:8px; right:8px; width:10px; height:10px; border-radius:50%; background:#ff3366; box-shadow:0 0 10px #ff3366; animation:pulseAlert 2s infinite; z-index:10;" title="Нове"></div>' : '';
        html += `<div style="aspect-ratio:1/1; border-radius:14px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.2); cursor:pointer; border:1px solid rgba(255,255,255,0.1); position:relative;" onclick="openImageModal(currentVilnohirskPhotos, ${i}, event)"><img src="${url}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">${dotHtml}${author ? `<div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding:20px 8px 8px 8px; font-size:10px; font-weight:700; color:rgba(255,255,255,0.9); text-align:left; text-shadow:0 1px 2px rgba(0,0,0,0.8); pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📸 ${escapeHTML(author)}</div>` : ''}</div>`;
    });
    container.innerHTML = html + '</div>';
}

async function loadGalleryData() {
  try { 
      const photos = await fetchCachedJson(`https://vilnohirsk-photos-production.up.railway.app/api/photos`, 'gallery_api', 5);
      markNewItems(photos, 'gallery', false);
      checkNotification('gallery', photos);
      renderGallery(photos); 
  } catch(e) { document.getElementById('gallery-list-content').innerHTML = '<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження фотографій</div>'; }
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
    
    for (let [key, val] of formData.entries()) { 
        if (key !== 'photos') {
            let finalVal = val;
            if (key === 'phone' && val !== '+380') finalVal = "'" + val;
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

function openModalForm(formId, modalId) { 
  if (modalId) {
    const form = document.getElementById(formId); if(form) form.reset(); if(formId) setupCaptcha(formId);
    document.getElementById(modalId).classList.add('active'); 
  } else {
    document.getElementById(formId).classList.add('active');
  }
  document.body.style.overflow = 'hidden'; 
}

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
  const notifs = {'alert-communal':'communal', 'alert-news':'news', 'alert-events':'events', 'alert-gallery':'gallery', 'alert-volunteers':'volunteers', 'alert-promos':'promos', 'alert-phoenix':'phoenix', 'blablacar':'blablacar', 'trains':'trains', 'estate-tab':'estate', 'shopping-tab':'shopping', 'flea-market-tab':'flea', 'lost-found-tab':'lost', 'jobs-tab':'jobs', 'city-guide-tab':'guide'};
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
}

// === ДРАГ-СВАЙП (ГОРТАННЯ МИШКОЮ НА ПК) ===
let isMouseDragging = false;
let startMouseX, startScrollLeft, activeSliderEl, originalSnap;
let hasDragged = false;

document.addEventListener('mousedown', (e) => {
  const slider = e.target.closest('.tabs-nav, .flea-categories-wrapper, .carousel-container');
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
      e.preventDefault(); 
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

document.addEventListener('click', (e) => {
  if (hasDragged) { e.preventDefault(); e.stopPropagation(); hasDragged = false; }
}, true);

document.addEventListener('wheel', (e) => {
  const hScrollEl = e.target.closest('.tabs-nav, .flea-categories-wrapper, .carousel-container');
  if (hScrollEl) {
    const vScrollEl = e.target.closest('.alert-item');
    if (vScrollEl && vScrollEl.scrollHeight > vScrollEl.clientHeight) { return; }
    if (e.deltaY !== 0) { e.preventDefault(); hScrollEl.scrollLeft += e.deltaY; }
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
    if (isEvent) { 
        const photoUrl = item.photo || item.image || item.url; if(!photoUrl) return ''; 
        const dotHtml = item.isNewItem ? '<div style="position:absolute; top:10px; right:10px; width:12px; height:12px; border-radius:50%; background:#ff3366; box-shadow:0 0 10px #ff3366; animation:pulseAlert 2s infinite; z-index:10;" title="Нове"></div>' : '';
        return `<div class="alert-item" style="padding:0; background:transparent; border:none; display:flex; justify-content:center; align-items:center; position:relative;"><img src="${getDriveImageUrl(photoUrl)}" style="max-width:100%; max-height:350px; object-fit:contain; border-radius:12px; box-shadow: 0 4px 15px rgba(224, 86, 253, 0.4); cursor:pointer;" alt="Афіша" onclick="openImageModal(windowEventImages, ${index}, event)">${dotHtml}</div>`; 
    } 
    else { 
        const dot = item.isNewItem ? NEW_BADGE_HTML : '';
        const textHtml = item.text ? String(item.text).replace(/\n/g, '<br>') : ''; 
        return `<div class="alert-item">${item.title ? `<div class="alert-card-title" style="color: ${typeColor};">${escapeHTML(item.title)}${dot}</div>` : ''}<div class="alert-card-text">${textHtml}</div></div>`; 
    }
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
    const communalAlerts = (d && Array.isArray(d.communal)) ? d.communal.filter(i => i && i.show) : []; 
    const newsAlerts = (d && Array.isArray(d.news)) ? d.news.filter(i => i && i.show) : [];
    
    markNewItems(communalAlerts, 'communal', true);
    markNewItems(newsAlerts, 'news', true);
    
    checkNotification('communal', communalAlerts); 
    checkNotification('news', newsAlerts);
    
    document.getElementById("alert-communal-content").innerHTML = buildCarouselHtml(communalAlerts, '#ffcc00', 'communal'); 
    document.getElementById("alert-news-content").innerHTML = buildCarouselHtml(newsAlerts, '#00ff9c', 'news');
  } catch(e) { document.getElementById("alert-communal-content").innerHTML = `<div class="empty-msg">Помилка завантаження</div>`; document.getElementById("alert-news-content").innerHTML = `<div class="empty-msg">Помилка завантаження</div>`; }
}

async function loadEventsData() {
  try {
    const API_URL = `${atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2RlbnJpczg3L3ZpbG5vaGlyc2stZXZlbnRzL21haW4vZXZlbnRzLmpzb24=')}?t=${new Date().getTime()}`;
    const eventAlerts = await fetchCachedJson(API_URL, 'events_api', 5);
    const activeEvents = Array.isArray(eventAlerts) ? eventAlerts.filter(i => i.show !== false) : [];
    
    markNewItems(activeEvents, 'events', true);
    checkNotification('events', activeEvents);
    
    windowEventImages = activeEvents.map(ev => getDriveImageUrl(ev.photo || ev.image || ev.url)).filter(Boolean);
    document.getElementById("alert-events-content").innerHTML = buildCarouselHtml(activeEvents, '#FF3366', 'events', true);
  } catch(e) { document.getElementById("alert-events-content").innerHTML = `<div class="empty-msg" style="margin-bottom:15px;">Афіш поки немає</div>`; }
}

async function loadPhonebookData() {
  const container = document.getElementById('city-guide-list-content');
  try {
    const data = await fetchCachedJson('https://vilnohirsk-phonebook-production.up.railway.app/api/phonebook', 'phonebook_api', 30);
    const categoriesData = data.categories || data; if (!categoriesData || !Array.isArray(categoriesData)) throw new Error('Invalid format');
    phonebookRawData = categoriesData; 
    checkNotification('guide', phonebookRawData);
    renderPhonebook(phonebookRawData);
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
            let phonesHtml = phonesArray.map(p => { let clean = p.toString().replace(/[^0-9+]/g, ''); return `<a href="tel:${clean}" class="pb-phone-btn" onclick="event.stopPropagation();">${escapeHTML(p)}</a>`; }).join('');
            itemsHtml += `<div class="pb-tile"><div class="pb-tile-title">${escapeHTML(safeTitle)}</div><div class="pb-tile-phones">${phonesHtml}</div></div>`;
        }
     });
     if (categoryHasMatch) { const safeCatName = cat.name || cat.category || 'Різне'; const safeCatIcon = cat.icon || '📌'; html += `<div class="pb-category-section"><div class="pb-category-header"><span>${escapeHTML(safeCatIcon)}</span> ${escapeHTML(safeCatName)}</div><div class="pb-grid">${itemsHtml}</div></div>`; }
  });
  if (!hasResults) { container.innerHTML = '<div class="empty-msg" style="font-size: 14px;">За вашим запитом нічого не знайдено 😔</div>'; } else { container.innerHTML = html; }
}

function filterPhonebook() { const input = document.getElementById('pb-search'); if (phonebookRawData && input) { renderPhonebook(phonebookRawData, input.value); } }

function buildDropdown(id, photosHtml, details) {
  const items = details.map(d => `<div class="shop-inner-item"><span class="detail-icon">${d.icon}</span><div style="width: 100%;"><b>${d.label}:</b><br>${d.value}</div></div>`).join('');
  return `<div class="shop-details-dropdown" id="${id}" onclick="event.stopPropagation()"><div class="shop-inner-list">${photosHtml}${items}</div></div>`;
}

function toggleShop(detailsId, tileElement) {
  const dropdown = document.getElementById(detailsId); if (!dropdown) return;
  const isOpen = dropdown.classList.contains('open'); closeAllShopDropdowns();
  if (!isOpen) { dropdown.classList.add('open'); tileElement.classList.add('tile-active'); const grid = tileElement.closest('.shops-tile-grid'); if (grid) { setTimeout(() => { grid.style.paddingBottom =
