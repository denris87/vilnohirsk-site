const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxRH8Fg2WThVyFqO3AoMS9cNsz_-G8jI4AkP2Pn6i4PrKnWkB3C6sBcc_6Qhnq_LiAR/exec';
const ESTATE_CSV_URL = 'https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=622618191';
const PROMOS_API_URL = 'https://vilnohirsk-promos-api-production.up.railway.app/api/promos';

// === КОНФИГУРАЦИЯ FIREBASE (для push-уведомлений) ===
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAG8UbnsZ2DphoF0H7w088vE7pNHMkJs80",
  authDomain: "smart-vilnohirsk.firebaseapp.com",
  projectId: "smart-vilnohirsk",
  storageBucket: "smart-vilnohirsk.firebasestorage.app",
  messagingSenderId: "676865197841",
  appId: "1:676865197841:web:5d53065b2bb211bf77eeb0"
};
const FIREBASE_VAPID_KEY = "BHmSY-eFLxPx60kZjEwkhEDXhYri04G6d-Pl37o-p6qQaCJT88VZImQiDPOoBTgEn9aRmZHsmw5Y5qhmsQ8y2Ls";

let currentDataSignature = {};
let allFleaMarketItems = []; let fleaRenderLimit = 20; let currentFleaSort = 'new';
let allEstateItems = []; let estateRenderLimit = 20; let currentEstateSort = 'new';
let allPromoItems = [];
let phonebookRawData = [];
let isPageVisible = true;
let phonebookSearchTimer = null;

// СУПЕРБЫСТРЫЙ КЭШ В ОПЕРАТИВНОЙ ПАМЯТИ (НЕ ТОРМОЗИТ ТЕЛЕФОН)
const memoryDataCache = {};

// Запоминаем порядок перемешанных списков, чтобы они не прыгали при автообновлении
const shuffleCache = {};

// === БЕЗОПАСНОСТЬ И УТИЛИТЫ ===
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

// Безопасная замена переносов строк после экранирования
function nl2br(str) {
    return escapeHTML(str).replace(/\n/g, '<br>');
}

// То же что и nl2br, но дозволяє теги <b>...</b> (для alert/communal/news, де адмін форматує текст)
function nl2brWithBold(str) {
    // Спочатку повністю екрануємо HTML
    let safe = escapeHTML(str);
    // Тепер повертаємо назад тільки <b> і </b> (адмін форматує текст у YAML)
    safe = safe.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
    // Переноси рядків
    return safe.replace(/\n/g, '<br>');
}

// Гнучка перевірка VIP-прапорця з таблиці: True для будь-якого непорожнього значення, окрім явних "ні"
function isVipFlag(s) {
  if (s === true) return true;
  if (!s) return false;
  const v = String(s).trim().toLowerCase();
  if (v === '' || v === 'ні' || v === 'нi' || v === 'no' || v === 'нет' || v === '0' || v === 'false' || v === '-' || v === '—') return false;
  return true;
}

// Красивые тост-уведомления вместо alert()
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:1000000; display:flex; flex-direction:column; gap:10px; align-items:center; pointer-events:none; max-width:90vw;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colors = {
        success: 'linear-gradient(135deg, #00ff9c, #00b8ff)',
        error: 'linear-gradient(135deg, #ff4d4d, #ff3366)',
        info: 'linear-gradient(135deg, #38bdf8, #2a5298)'
    };
    const textColors = { success: '#0b1d3a', error: '#fff', info: '#fff' };
    toast.style.cssText = `background:${colors[type]||colors.info}; color:${textColors[type]||'#fff'}; padding:14px 22px; border-radius:14px; font-weight:700; font-size:14px; box-shadow:0 10px 30px rgba(0,0,0,0.4); pointer-events:auto; max-width:90vw; text-align:center; line-height:1.4; transform:translateY(-20px); opacity:0; transition:all 0.3s ease; word-break:break-word;`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; });
    setTimeout(() => {
        toast.style.transform = 'translateY(-20px)'; toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, type === 'error' ? 4500 : 3000);
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

// Исправленный fallback для копирования (работает на iOS)
function fallbackCopyText(text, successCb) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "absolute";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    try { 
        document.execCommand('copy'); 
        if (successCb) successCb(); 
    } catch (err) {} 
    document.body.removeChild(textArea);
}

function copyToClipboardBtn(text, btn) {
    const showSuccess = () => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span style="color:#00ff9c">✔️ Скопійовано</span>';
        setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
    };
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(showSuccess).catch(() => fallbackCopyText(text, showSuccess));
    } else {
        fallbackCopyText(text, showSuccess);
    }
}

// Хелпер для таймаута fetch (если сервер не отвечает за N секунд — отменяем)
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
}

// Пауза
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ОБНОВЛЕННАЯ ФУНКЦИЯ КЭШИРОВАНИЯ С RETRY (для пробуждения "холодного" Railway)
async function fetchCachedText(url, key, ttlMinutes = 1) {
    const now = Date.now();
    if (memoryDataCache[key] && (now - memoryDataCache[key].time) < ttlMinutes * 60 * 1000) {
        return memoryDataCache[key].text;
    }
    
    // Расписание попыток: 0с (сразу), 2с, 4с
    const retryDelays = [0, 2000, 4000];
    let lastError = null;
    
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (retryDelays[attempt] > 0) {
            await sleep(retryDelays[attempt]);
        }
        try {
            const separator = url.includes('?') ? '&' : '?'; 
            const freshUrl = url + separator + '_nocache=' + Date.now();
            const r = await fetchWithTimeout(freshUrl, { cache: 'no-store' }, 8000); 
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const text = await r.text(); 
            memoryDataCache[key] = { time: Date.now(), text: text };
            return text;
        } catch (e) { 
            lastError = e;
            // Логируем тихо, не пугаем юзера
            console.warn(`[${key}] Спроба ${attempt + 1} не вдалася:`, e.message);
        }
    }
    
    // Все 3 попытки провалились — отдаём старый кэш если есть, иначе кидаем ошибку
    if (memoryDataCache[key]) {
        console.warn(`[${key}] Використовуємо застарілий кеш`);
        return memoryDataCache[key].text;
    }
    throw lastError || new Error('Не вдалося завантажити дані');
}

async function fetchCachedJson(url, key, ttlMinutes = 1) { 
  const text = await fetchCachedText(url, key, ttlMinutes);
  return JSON.parse(text); 
}

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
  track.innerHTML = currentGallery.map(img => `<div class="image-modal-slide" onclick="handleSlideClick(event)"><img src="${escapeHTML(img.url)}" alt="Фото" decoding="async">${img.author ? `<div style="position:absolute; bottom:60px; left:50%; transform:translateX(-50%); color:#fff; font-weight:700; font-size:12px; background:rgba(0,0,0,0.6); padding:6px 14px; border-radius:14px; z-index:100002; pointer-events:none; white-space:nowrap;">📸 Фото: ${escapeHTML(img.author)}</div>` : ''}</div>`).join('');
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
        html += `<div style="aspect-ratio:1/1; border-radius:14px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.2); cursor:pointer; border:1px solid rgba(255,255,255,0.1); position:relative; background:rgba(255,255,255,0.05);" onclick="openImageModal(currentVilnohirskPhotos, ${i}, event)"><img src="${escapeHTML(url)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="width:100%; height:100%; object-fit:cover; opacity:0; transition:opacity 0.3s ease;">${dotHtml}${author ? `<div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding:20px 8px 8px 8px; font-size:10px; font-weight:700; color:rgba(255,255,255,0.9); text-align:left; text-shadow:0 1px 2px rgba(0,0,0,0.8); pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📸 ${escapeHTML(author)}</div>` : ''}</div>`;
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

// Усиленная капча: случайные операции
function setupCaptcha(formId) {
  const form = document.getElementById(formId); if (!form) return;
  const num1 = Math.floor(Math.random() * 9) + 2;
  const num2 = Math.floor(Math.random() * 9) + 2;
  const operations = ['+', '-', '×'];
  const op = operations[Math.floor(Math.random() * operations.length)];
  let answer, expression;
  if (op === '+') { answer = num1 + num2; expression = `${num1} + ${num2}`; }
  else if (op === '-') {
    const a = Math.max(num1, num2), b = Math.min(num1, num2);
    answer = a - b; expression = `${a} - ${b}`;
  } else {
    answer = num1 * num2; expression = `${num1} × ${num2}`;
  }
  const exprSpan = form.querySelector('.captcha-expression');
  const answerInput = form.querySelector('.captcha-answer');
  const userInput = form.querySelector('.captcha-input');
  if (exprSpan) exprSpan.innerText = expression;
  if (answerInput) answerInput.value = answer;
  if (userInput) userInput.value = '';
}

function validateCaptcha(formId) {
  const form = document.getElementById(formId); if (!form) return false;
  const userInput = form.querySelector('.captcha-input'); const answerInput = form.querySelector('.captcha-answer');
  if (userInput && answerInput && userInput.value.trim() !== answerInput.value) {
      showToast('🤖 Невірна відповідь у перевірці на анти-спам! Спробуйте ще раз.', 'error');
      setupCaptcha(formId);
      return false;
  }
  return true;
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
    showToast('✅ Успішно відправлено на модерацію!', 'success');
    closeModalForm(null, modalId); form.reset(); setupCaptcha(formId);
  } catch (e) { showToast('❌ Помилка: ' + e.message, 'error'); } finally { btn.innerText = origText; btn.disabled = false; btn.style.opacity = '1'; }
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

// Закрытие модалки с защитой от разблокировки скролла когда другая модалка открыта
function closeModalForm(event, modalId) { 
    if (!event || event.target.classList.contains('close-modal-btn') || event.target.id === modalId) { 
        document.getElementById(modalId).classList.remove('active'); 
        // Разблокируем скролл только если нет других активных модалок
        const hasOtherActive = document.querySelector('.custom-modal-overlay.active') || document.querySelector('.image-modal.active');
        if (!hasOtherActive) {
            document.body.style.overflow = ''; 
        }
    } 
}

function closeAllShopDropdowns() { document.querySelectorAll('.shop-details-dropdown.open').forEach(el => { el.classList.remove('open'); if (el.parentElement) el.parentElement.classList.remove('tile-active'); }); document.querySelectorAll('.shops-tile-grid').forEach(grid => { grid.style.paddingBottom = '0px'; }); }

function closeAllJobsDrawers() {
  document.querySelectorAll('.jobs-drawer.open').forEach(d => {
    d.classList.remove('open');
    const btn = d.previousElementSibling;
    if (btn && btn.querySelector) {
      const arr = btn.querySelector('.arr');
      if (arr) arr.textContent = '▾';
    }
  });
}

document.addEventListener('click', function(e) {
  if (e.target.closest('.image-modal') || e.target.closest('.custom-modal-box')) return;
  if (!e.target.closest('.alert-group')) { const alertDrawer = document.getElementById('alert-drawer'); if (alertDrawer) { alertDrawer.classList.remove('open'); document.querySelectorAll('#alert-tabs .tab-alert').forEach(b => b.classList.remove('active')); } }
  if (!e.target.closest('.train') && !e.target.closest('.details') && !e.target.closest('.pb-category')) { document.querySelectorAll('.details.open').forEach(el => el.classList.remove('open')); document.querySelectorAll('.pb-category.open').forEach(el => el.classList.remove('open')); }
  if (!e.target.closest('.shop-tile')) { closeAllShopDropdowns(); }
  if (!e.target.closest('.schedule-group')) { const transportWidget = document.getElementById('main-list-widget'); if (transportWidget) transportWidget.classList.remove('open'); document.querySelectorAll('#schedule-tabs .tab-btn').forEach(b => b.classList.remove('active')); }
  if (!e.target.closest('.market-group')) { const marketWidget = document.getElementById('market-drawer'); if (marketWidget) marketWidget.classList.remove('open'); document.querySelectorAll('#market-tabs .tab-btn').forEach(b => b.classList.remove('active')); closeAllJobsDrawers(); }
});

function recalcDropdownHeight(imgEl) {
  const dropdown = imgEl.closest('.shop-details-dropdown'); const grid = imgEl.closest('.shops-tile-grid');
  if (dropdown && dropdown.classList.contains('open') && grid) { grid.style.paddingBottom = (dropdown.scrollHeight + 15) + 'px'; }
}

function switchAppTab(tabId, btn, group) {
  closeAllShopDropdowns();
  closeAllJobsDrawers();
  const notifs = {'alert-communal':'communal', 'alert-news':'news', 'alert-gallery':'gallery', 'alert-volunteers':'volunteers', 'alert-promos':'promos', 'alert-phoenix':'phoenix', 'blablacar':'blablacar', 'trains':'trains', 'estate-tab':'estate', 'shopping-tab':'shopping', 'flea-market-tab':'flea', 'lost-found-tab':'lost', 'jobs-tab':'jobs', 'city-guide-tab':'guide'};
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
  const slidesHtml = results.map((item, index) => {
    const t = Math.round(item.w.temperature);
    return `<div class="weather-content ${index === 0 ? 'active' : ''}" style="width: 100%;"><div class="weather-city">${escapeHTML(item.name)}</div><div class="weather-temp-row"><span class="weather-icon">${getWeatherEmoji(item.w.weathercode)}</span><span class="weather-temp">${t}°C</span></div><div class="weather-wind"><span style="font-size:14px;">🌬️</span> ${Math.round(item.w.windspeed)} м/с</div></div>`;
  }).join("");
  const dotsHtml = results.length > 1
    ? `<div class="weather-dots">${results.map((_, i) => `<div class="weather-dot ${i === 0 ? 'active' : ''}"></div>`).join('')}</div>`
    : '';
  container.innerHTML = slidesHtml + dotsHtml;
  if (window.weatherInterval) clearInterval(window.weatherInterval); let currentIndex = 0;
  window.weatherInterval = setInterval(() => {
      if (!isPageVisible) return;
      const slides = container.querySelectorAll('.weather-content'); if(slides.length < 2) return;
      const dots = container.querySelectorAll('.weather-dot');
      slides[currentIndex].classList.remove('active'); if(dots[currentIndex]) dots[currentIndex].classList.remove('active');
      currentIndex = (currentIndex + 1) % slides.length;
      slides[currentIndex].classList.add('active'); if(dots[currentIndex]) dots[currentIndex].classList.add('active');
  }, 7000);
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

const UA_MONTHS = ['СІЧНЯ','ЛЮТОГО','БЕРЕЗНЯ','КВІТНЯ','ТРАВНЯ','ЧЕРВНЯ','ЛИПНЯ','СЕРПНЯ','ВЕРЕСНЯ','ЖОВТНЯ','ЛИСТОПАДА','ГРУДНЯ'];

function updateDateTime(){
  try {
    const now = getKyivNow();
    document.getElementById("date").textContent = `${now.getDate()} ${UA_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    document.getElementById("time-hh").textContent = String(now.getHours()).padStart(2,"0");
    document.getElementById("time-mm").textContent = String(now.getMinutes()).padStart(2,"0");
    document.getElementById("time-ss").textContent = String(now.getSeconds()).padStart(2,"0");
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
        return `<div class="alert-item" style="padding:0; background:transparent; border:none; display:flex; justify-content:center; align-items:center; position:relative;"><img src="${escapeHTML(getDriveImageUrl(photoUrl))}" loading="lazy" decoding="async" style="max-width:100%; max-height:350px; object-fit:contain; border-radius:12px; box-shadow: 0 4px 15px rgba(224, 86, 253, 0.4); cursor:pointer;" alt="Афіша" onclick="openImageModal(windowEventImages, ${index}, event)">${dotHtml}</div>`; 
    } 
    else { 
        const dot = item.isNewItem ? NEW_BADGE_HTML : '';
        const textHtml = item.text ? nl2brWithBold(String(item.text)) : ''; 
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

// Стабильное перемешивание: один раз перемешиваем, потом показываем в том же порядке
function getStableShuffled(array, cacheKey) {
  if (!shuffleCache[cacheKey] || shuffleCache[cacheKey].length !== array.length) {
    // Если кэша нет или количество элементов поменялось — перемешиваем заново
    const indices = array.map((_, i) => i);
    shuffleArray(indices);
    shuffleCache[cacheKey] = indices;
  }
  // Применяем сохранённый порядок, но игнорируем те индексы, которых уже нет
  const result = [];
  shuffleCache[cacheKey].forEach(i => { if (array[i] !== undefined) result.push(array[i]); });
  // Добавляем новые элементы (если массив вырос)
  if (result.length < array.length) {
    array.forEach((item, i) => { if (!shuffleCache[cacheKey].includes(i)) result.push(item); });
    // Обновляем кэш
    shuffleCache[cacheKey] = array.map((_, i) => i);
    shuffleArray(shuffleCache[cacheKey]);
  }
  return result;
}

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
    const API_URL = atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2RlbnJpczg3L3ZpbG5vaGlyc2stZXZlbnRzL21haW4vZXZlbnRzLmpzb24=');
    const eventAlerts = await fetchCachedJson(API_URL, 'events_api', 5);
    const activeEvents = Array.isArray(eventAlerts) ? eventAlerts.filter(i => i.show !== false) : [];
    
    markNewItems(activeEvents, 'events', true);
    checkNotification('events', activeEvents);
    updateEventsTabBadge(activeEvents.length);

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

// Debounce поиска по справочнику
function filterPhonebook() { 
    const input = document.getElementById('pb-search'); 
    if (!phonebookRawData || !input) return;
    clearTimeout(phonebookSearchTimer);
    phonebookSearchTimer = setTimeout(() => {
        renderPhonebook(phonebookRawData, input.value);
    }, 200);
}

function buildDropdown(id, photosHtml, details) {
  const items = details.map(d => `<div class="shop-inner-item"><span class="detail-icon">${d.icon}</span><div style="width: 100%;"><b>${escapeHTML(d.label)}:</b><br>${d.value}</div></div>`).join('');
  return `<div class="shop-details-dropdown" id="${id}" onclick="event.stopPropagation()"><div class="shop-inner-list">${photosHtml}${items}</div></div>`;
}

function toggleShop(detailsId, tileElement) {
  const dropdown = document.getElementById(detailsId); if (!dropdown) return;
  const isOpen = dropdown.classList.contains('open'); closeAllShopDropdowns();
  if (!isOpen) { dropdown.classList.add('open'); tileElement.classList.add('tile-active'); const grid = tileElement.closest('.shops-tile-grid'); if (grid) { setTimeout(() => { grid.style.paddingBottom = (dropdown.scrollHeight + 15) + 'px'; }, 50); } }
}

function renderShops(shopsData) {
  const container = document.getElementById('shopping-list-content');
  let html = '<div style="text-align: center; margin-bottom: 12px; font-size: 11px; color:rgba(255,255,255,0.7); font-weight: 600;">Якщо бажаєте додати свій магазин, пишіть у Telegram <a href="https://t.me/vilnohirsk" target="_blank" style="color: var(--time-green); text-decoration: none; font-weight: 800;">@vilnohirsk</a></div><div class="shops-tile-grid">';
  if (!shopsData || !Array.isArray(shopsData) || shopsData.length === 0) { container.innerHTML = html + '<div class="empty-msg">Оголошень поки немає</div>'; return; }
  shopsData.forEach((shop, index) => {
    if(!shop) return;
    const safeName = shop.name != null ? String(shop.name).trim() : ""; const displayName = safeName !== "" ? safeName : "Оголошення " + (index + 1);
    const detailsId = 'shop-detail-' + index; const isVip = isVipFlag(shop.vip); const vipClass = isVip ? 'vip-tile' : ''; const vipBadge = isVip ? '<div class="vip-badge">VIP</div>' : '';
    
    let rawPhoto = Array.isArray(shop.photos) && shop.photos.length > 0 ? shop.photos[0] : (shop.photo || shop.image || '');
    let photoUrl = getDriveImageUrl(rawPhoto);
    const photoHtml = photoUrl ? `<img src="${escapeHTML(photoUrl)}" alt="Фото" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">🛍️</span>`;
    
    const titleHtml = (shop.instagram && String(shop.instagram).trim() !== "") ? `<a href="${escapeHTML(String(shop.instagram).trim())}" target="_blank" style="color:inherit; text-decoration:none;" onclick="event.stopPropagation();">${escapeHTML(displayName)} 🔗</a>` : escapeHTML(displayName);
    let phoneHtml = 'Не вказано';
    if (shop.phone && String(shop.phone).trim() !== "") { phoneHtml = String(shop.phone).split(',').map(p => `<a href="tel:${p.replace(/[^0-9+]/g, '')}" class="shop-phone-link" onclick="event.stopPropagation();">${escapeHTML(p.trim())}</a>`).join('<br>'); }
    
    const isContactless = shop.contactless === true || shop.contactless === 'true' || shop.contactless === '✅';
    let photosHtml = ''; let photosArray = Array.isArray(shop.photos) ? shop.photos : (photoUrl ? [photoUrl] : []);
    if (photosArray.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(photosArray.map(getDriveImageUrl)))}')), 0, event)"><img src="${escapeHTML(getDriveImageUrl(photosArray[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Збільшити фото</div></div>`; }
    
    const dot = shop.isNewItem ? NEW_BADGE_HTML : '';
    const dropdownHtml = buildDropdown(detailsId, photosHtml, [ {icon: '📍', label: 'Адреса', value: escapeHTML(shop.address) || "Не вказано"}, {icon: '🕒', label: 'Графік роботи', value: shop.schedule ? nl2br(String(shop.schedule)) : 'Не вказано'}, {icon: '💳', label: 'Термінал', value: isContactless ? '✅' : '❌'}, {icon: '📞', label: 'Телефон(и)', value: phoneHtml} ]);
    html += `<div class="shop-tile ${vipClass}" onclick="toggleShop('${detailsId}', this)">${vipBadge}<div class="shop-tile-photo">${photoHtml}</div><div class="shop-tile-cat">${escapeHTML(shop.category) || "Магазин"}</div><div class="shop-tile-name">${titleHtml}${dot}</div><div class="shop-tile-chevron">Деталі ▾</div>${dropdownHtml}</div>`;
  });
  container.innerHTML = html + '</div>';
}

async function loadShopsData() {
  try {
    const d = await fetchCachedJson('https://vilnohirsk-shops-production.up.railway.app/api/shops', 'shops_api', 5);
    let itemsArray = d.shops || d.items || (Array.isArray(d) ? d : []);
    const activeShops = itemsArray.filter(shop => shop && shop.name && String(shop.name).trim() !== ""); 
    markNewItems(activeShops, 'shopping', false);
    checkNotification('shopping', activeShops);
    
    if (!activeShops || activeShops.length === 0) { document.getElementById('shopping-list-content').innerHTML = '<div class="empty-msg">Оголошень поки немає</div>'; return; }
    const vipShops = activeShops.filter(shop => isVipFlag(shop.vip));
    const regularShops = activeShops.filter(shop => !isVipFlag(shop.vip));
    // Стабильное перемешивание — не прыгает при автообновлении
    renderShops([...vipShops, ...getStableShuffled(regularShops, 'shops')]);
  } catch(e) { document.getElementById('shopping-list-content').innerHTML = `<div class="empty-msg" style="color: #ff6b6b;">Помилка завантаження магазинів</div>`; }
}

function renderPromosList(items) {
  const cont = document.getElementById('promos-list-content');
  if (!items || !items.length) { cont.innerHTML = '<div class="empty-msg">Активних пропозицій немає</div>'; return; }
  let html = '<div class="shops-tile-grid">';
  items.forEach((item, i) => {
    const id = 'promo-detail-' + i; 
    let thumbUrl = item.photos && item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
    const thumb = thumbUrl ? `<img src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="object-fit: contain; width: 100%; height: 100%; opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">🔥</span>`;
    let photosHtml = '';
    if (item.photos && item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos.map(getDriveImageUrl)))}')), 0, event)"><img src="${escapeHTML(getDriveImageUrl(item.photos[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Збільшити фото</div></div>`; }
    
    let rawDesc = nl2br(String(item.description || ''));
    let extractedLink = '';
    
    let finalDesc = rawDesc.replace(/(https?:\/\/[^\s<]+)/g, function(match) {
        extractedLink = match;
        return ''; 
    }).replace(/^(<br>|\s)+/, '').replace(/(<br>|\s)+$/, '').trim(); 

    let buttonHtml = '';
    if (extractedLink) {
        buttonHtml = `<a href="${escapeHTML(extractedLink)}" target="_blank" onclick="event.stopPropagation();" style="display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; margin-top: 8px; margin-bottom: 12px; padding: 12px 10px; background: linear-gradient(135deg, #00ff9c, #00b8ff); color: #0b1d3a; font-weight: 800; font-size: 14px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 15px rgba(0, 255, 156, 0.3); text-transform: uppercase; letter-spacing: 0.5px;"><span style="font-size: 18px;">🚀</span><span>Перейти на сайт</span></a>`;
    }

    let outerDescHtml = finalDesc ? `<div style="font-size: 12px; color: rgba(255,255,255,0.95); line-height: 1.4; margin-top: 8px; margin-bottom: 8px; text-align: left;">${finalDesc}</div>` : '';

    let phoneVal = escapeHTML(item.phone || '').trim();
    let phoneBlockHtml = '';
    if (phoneVal) {
        let phoneHtml = '';
        if (/\d/.test(phoneVal)) {
            phoneHtml = `<a href="tel:${phoneVal.replace(/[^0-9+]/g, '')}" class="shop-phone-link">${phoneVal}</a>`;
        } else {
            phoneHtml = `<span style="color:#00ff9c; font-weight:700;">${phoneVal}</span>`;
        }
        phoneBlockHtml = `<div class="shop-inner-item" style="margin-bottom: 0;"><span class="detail-icon">📞</span><div style="width: 100%;"><b>Зв'язок:</b><br>${phoneHtml}</div></div>`;
    }

    let dropdownInnerHtml = photosHtml + phoneBlockHtml;
    let dropdownHtml = '';
    let chevronHtml = '';
    
    if (dropdownInnerHtml) {
        dropdownHtml = `<div class="shop-details-dropdown" id="${id}" onclick="event.stopPropagation()">
            <div class="shop-inner-list" style="padding: 10px; text-align: left;">
                ${dropdownInnerHtml}
            </div>
        </div>`;
        chevronHtml = `<div class="shop-tile-chevron" style="color: #ff9f43; background: rgba(255,159,67,0.1);">Детальніше ▾</div>`;
    }
    
    const isVip = isVipFlag(item.vip);
    const tileClass = isVip ? 'shop-tile promo-tile vip-tile' : 'shop-tile promo-tile';
    const badgeHtml = isVip ? '<div class="vip-badge" style="background: linear-gradient(135deg, #ffcc00, #ff8800); color: #000; box-shadow: 0 4px 10px rgba(255,204,0,0.4);">VIP АКЦІЯ</div>' : '<div class="vip-badge promo-badge">АКЦІЯ</div>';
    
    const dot = item.isNewItem ? NEW_BADGE_HTML : '';
    html += `<div class="${tileClass}" onclick="toggleShop('${id}', this)">${badgeHtml}<div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat" style="color: #fff; font-size: 11px;">${escapeHTML(item.shop || 'Не вказано')}</div><div class="card-row" style="margin-bottom: 6px;"><span class="card-price" style="color: var(--highlight-color); font-size: 14px; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; line-height: 1.2; display: block;">${escapeHTML(item.discount || '')}</span></div><div class="shop-tile-name" style="font-size: 14px; margin-bottom: 5px;">${escapeHTML(item.title || '')}${dot}</div><div style="font-size: 10px; color: rgba(255,255,255,0.7); font-weight: 700; margin-bottom: 5px;">⏳ Діє до: <span style="color:#ffcc00;">${escapeHTML(item.validUntil || '-')}</span></div>${outerDescHtml}${buttonHtml}${chevronHtml}${dropdownHtml}</div>`;
  });
  cont.innerHTML = html + '</div>';
}

async function loadPromosData() {
  try {
    const data = await fetchCachedJson(PROMOS_API_URL, 'promos_api', 5);
    let itemsArray = [];
    if (Array.isArray(data)) itemsArray = data; else if (data && Array.isArray(data.promos)) itemsArray = data.promos;
    const activeItems = itemsArray.filter(item => item && item.active !== false);
    
    markNewItems(activeItems, 'promos', false);
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
    const id = 'estate-detail-' + i; 
    let thumbUrl = item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
    const thumb = thumbUrl ? `<img src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">🏠</span>`;
    let photosHtml = '';
    if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos.map(getDriveImageUrl)))}')), 0, event)"><img src="${escapeHTML(getDriveImageUrl(item.photos[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
    const dealColor = item.dealType.toLowerCase() === 'оренда' ? '#00b8ff' : '#ff3366';
    let displayPrice = item.price ? String(item.price).trim() : 'Договірна';
    if (displayPrice !== 'Договірна' && !displayPrice.includes('$')) { displayPrice += ' $'; }
    
    const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Тип об\'єкта', value: `${escapeHTML(item.propertyType)} (${escapeHTML(item.dealType)})`}, {icon: '📍', label: 'Локація', value: escapeHTML(item.location || 'Вільногірськ')}, {icon: '📝', label: 'Опис та адреса', value: nl2br(item.description)}, {icon: '📞', label: 'Телефон', value: `<a href="tel:${item.phone.replace(/[^0-9+]/g, '')}" class="shop-phone-link">${escapeHTML(item.phone)}</a>`} ]);
    
    const dot = item.isNewItem ? NEW_BADGE_HTML : '';
    html += `<div class="shop-tile ${item.isVip ? 'vip-tile' : ''}" onclick="toggleShop('${id}', this)">${item.isVip ? '<div class="vip-badge">VIP</div>' : ''}<div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat" style="color: ${dealColor};">${escapeHTML(item.dealType)} • ${escapeHTML(item.propertyType)}</div><div class="card-row" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; margin-bottom: 6px;"><span class="card-price" style="white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; line-height: 1.2; flex: 1;">${escapeHTML(displayPrice)}</span><span class="card-info" style="font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; text-align: right; margin-top: 2px;">Кімнат: ${escapeHTML(item.rooms)}</span></div><div class="shop-tile-name" style="margin-bottom: 5px;">Квартира у Вільногірську${dot}</div><div class="shop-tile-chevron">Деталі ▾</div>${dropdownHtml}</div>`;
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
    // Кэшируем на 3 минуты вместо 0 — Google Sheets всё равно не отдаёт мгновенно новые данные
    const csvText = await fetchCachedText(ESTATE_CSV_URL, 'estate_csv', 3);
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: function(results) {
        const approvedItems = results.data.filter(row => { const keys = Object.keys(row); let status = row['Статус'] || row['Status'] || row['status'] || row[keys[1]]; return status && String(status).trim().toLowerCase() === 'одобрено'; }).map(row => {
          const keys = Object.keys(row); let rawPhoto = row['Фото'] || row['photos'] || row['Photos'] || row[keys[8]] || ''; let photoUrls = String(rawPhoto).split(',').map(p => p.trim()).filter(p => p);
          const v = String(row['VIP'] || row['vip'] || row[keys[9]] || '').trim().toLowerCase();
          const priceKey = keys.find(k => k && k.toLowerCase().includes('ціна')) || keys[5];
          let rawPrice = priceKey ? row[priceKey] : '';
          // Чистим невидимые символы (NBSP, zero-width space), нормализуем пробелы
          let cleanPrice = String(rawPrice || '').replace(/ /g, ' ').replace(/[​-‍﻿]/g, '').trim();
          // Fallback: если цена пустая — пытаемся выдернуть число из описания (на случай если юзер вписал цену туда)
          if (!cleanPrice) {
            const descText = String(row["Опис"] || row[keys[6]] || '');
            const priceMatch = descText.match(/(\d[\d\s.,]{2,})\s*(\$|usd|у\.?о\.?|грн|₴)/i);
            if (priceMatch) cleanPrice = priceMatch[1].replace(/[\s,]/g, '').trim();
          }
          return { dealType: row["Тип угоди"] || row[keys[2]] || 'Оренда', propertyType: row["Об'єкт"] || row["Тип об'єкта"] || row[keys[3]] || 'Квартира', rooms: row["Кімнат"] || row[keys[4]] || '-', price: cleanPrice || 'Договірна', description: row["Опис"] || row[keys[6]] || 'Без опису', phone: row["Телефон"] || row[keys[7]] || 'Не вказано', photos: photoUrls, isVip: isVipFlag(v) };
        });
        const localItems = approvedItems.reverse();
        markNewItems(localItems, 'estate', true);
        checkNotification('estate', localItems);
        const rentCount = localItems.filter(i => i.dealType && i.dealType.toLowerCase().includes('оренд')).length;
        const saleCount = localItems.filter(i => i.dealType && i.dealType.toLowerCase().includes('продаж')).length;
        updateEstateTabBadge(rentCount, saleCount, localItems.length);
        allEstateItems = localItems;
        const activeTag = document.querySelector('#estate-categories .flea-category-tag.active'); filterEstate(activeTag ? activeTag.innerText.trim() : 'Всі', activeTag);
      }
    });
  } catch (e) { document.getElementById('estate-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження</div>`; }
}

function renderFleaMarketList(items, hasMore = false) {
  const cont = document.getElementById('flea-market-list-content');
  // Исправлена опечатка "gross" → "які" и оформление правил барахолки
  const rulesHtml = `<div style="margin-bottom: 12px; background: linear-gradient(145deg, rgba(255, 77, 77, 0.05), rgba(0,0,0,0.2)); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 16px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.2);"><div onclick="const content = this.nextElementSibling; const icon = this.querySelector('.rules-icon'); if(content.style.maxHeight === '0px' || !content.style.maxHeight){ content.style.maxHeight = '400px'; content.style.padding = '0 15px 15px 15px'; icon.style.transform = 'rotate(180deg)'; } else { content.style.maxHeight = '0px'; content.style.padding = '0 15px 0 15px'; icon.style.transform = 'rotate(0deg)'; }" style="padding: 12px 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 12px; color: #ff6b6b;"><span style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 16px;">⚠️</span> Що заборонено публікувати?</span><span class="rules-icon" style="font-size: 14px; transition: transform 0.3s;">▼</span></div><div style="max-height: 0px; padding: 0 15px; overflow: hidden; transition: all 0.3s ease; font-size: 11px; color: rgba(255,255,255,0.85); line-height: 1.5;"><div style="border-top: 1px dashed rgba(255, 77, 77, 0.3); padding-top: 10px;"><ul style="margin: 5px 0 10px 0; padding-left: 20px;"><li>Будь-які <b>товари військового призначення</b> (військова форма, амуніція, бронежилети, зброя, тепловізори тощо).</li><li><b>Алкогольні напої</b> та <b>тютюнові вироби</b> (включаючи електронні сигарети, вейпи, рідини).</li><li>Продаж <b>живих тварин</b>.</li><li>Товари, продаж яких порушує <b>законодавство України</b> (ліки, наркотичні речовини, піротехніка, крадені речі, підроблені документи, спецзасоби).</li></ul><div style="color: #ff4d4d; font-weight: 800; text-align: center; margin-bottom: 5px; text-transform: uppercase;">❌ Такі оголошення будуть видалені!</div></div></div></div>`;
  
  if (!items || !items.length) { cont.innerHTML = rulesHtml + '<div class="empty-msg">Оголошень у цій категорії немає</div>'; return; }
  const sortedItems = [...items.filter(item => isVipFlag(item.vip)).reverse(), ...items.filter(item => !isVipFlag(item.vip))];
  let html = rulesHtml + '<div class="shops-tile-grid">';
  sortedItems.forEach((item, i) => {
    const id = 'flea-detail-' + i; 
    let thumbUrl = item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
    const thumb = thumbUrl ? `<img src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">📦</span>`;
    let priceText = item.price ? String(item.price).trim() : 'Ціна договірна'; if (priceText !== "Ціна договірна" && !priceText.toLowerCase().includes("грн")) priceText += " грн";
    let photosHtml = ''; if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos.map(getDriveImageUrl)))}')), 0, event)"><img src="${escapeHTML(getDriveImageUrl(item.photos[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
    const isVip = isVipFlag(item.vip);
    
    const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Категорія', value: escapeHTML(item.category)}, {icon: '📍', label: 'Локація', value: escapeHTML(item.location)}, {icon: '✨', label: 'Стан', value: escapeHTML(item.condition)}, {icon: '📝', label: 'Опис', value: nl2br(item.description)}, {icon: '📞', label: 'Контакти', value: `<a href="tel:${item.phone.replace(/[^0-9+]/g, '')}" class="shop-phone-link">${escapeHTML(item.phone)}</a>`} ]);
    
    const dot = item.isNewItem ? NEW_BADGE_HTML : '';
    html += `<div class="shop-tile ${isVip ? 'vip-tile' : ''}" onclick="toggleShop('${id}', this)">${isVip ? '<div class="vip-badge">VIP</div>' : ''}<div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat">${escapeHTML(item.category)}</div><div class="card-row" style="margin-bottom: 6px;"><span class="card-price" style="white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; line-height: 1.2; display: block;">${escapeHTML(priceText)}</span></div><div class="shop-tile-name">${escapeHTML(item.title)}${dot}</div><div class="shop-tile-chevron">Опис ▾</div>${dropdownHtml}</div>`;
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

// Стоп-фрази для барахолки: оголошення про пошук працівників/вакансії автоматично ховаємо
const FLEA_JOB_PATTERNS = [
  /шука(є|ю|ємо)[а-яії']*\s+(\S+\s+){0,4}?(робіт|працівник|персонал|кадр|команд|майстр|водія|водій|кур'?єр|вантажник|продавц|охоронц|менедж|оператор|спеціаліст|помічник|підсобн|різноробоч|швач|маляр|столяр|муляр|зварник|чобот)/i,
  /шука(є|ю|ємо)[а-яії']*\s+(\S+\s+){0,4}?на\s+роботу/i,
  /потріб(ен|на|но|ні)\s+(\S+\s+){0,3}?(робіт|працівник|персонал|майстр|водій|водія|кур'?єр|вантажник|продавц|охоронц|менедж|оператор|спеціаліст|помічник|підсобн|різноробоч|швач|маляр|столяр|муляр|зварник)/i,
  /(запрошу|пропону|візьм|приймає?м|набирає?м|наймає?м)\S*\s+(\S+\s+){0,3}?(на\s+роботу|працівник|робітник|персонал|команд|кадр)/i,
  /вакансі/i,
  /(требу|нужен|нужна|нужны|ищем|ищу)\s+(\S+\s+){0,3}?(работник|сотрудник|персонал|водител|курьер|продавц|охранник)/i,
  /робота[ -]?вахта/i,
  /з\.?\s?п\.?\s+\d/i,
  /(прийом|приём|набір|набор)\s+на\s+роботу/i
];

function isFleaJobListing(item){
  if(!item) return false;
  const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
  return FLEA_JOB_PATTERNS.some(re => re.test(text));
}

async function loadFleaMarketData() {
  try {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=111977759';
    // Кэшируем на 3 минуты — нагрузка на Google Sheets уменьшается
    const csvText = await fetchCachedText(csvUrl, 'flea_csv', 3);
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: function(results) {
        const approvedItems = results.data.filter(row => { const keys = Object.keys(row); let status = row['Статус'] || row['Status'] || row['status'] || row[keys[keys.length - 1]]; return status && String(status).trim().toLowerCase() === 'одобрено'; }).map(row => {
          const keys = Object.keys(row); let rawPhoto = row['Фото (Тип запитання: Завантаження файлу)'] || row['Фото'] || row['photos'] || row['Photos'] || row[keys[5]] || ''; let photoUrls = String(rawPhoto).split(',').map(p => p.trim()).filter(p => p);
          return { title: row['Назва товару (Коротка відповідь)'] || row['Назва товару'] || row['Title'] || row['title'] || row[keys[1]] || 'Без назви', price: row['Ціна (Коротка відповідь)'] || row['Ціна'] || row['Price'] || row['price'] || row[keys[2]] || '', description: row['Опис (Абзац)'] || row['Опис'] || row['Description'] || row[keys[3]] || 'Без опису', phone: row['Телефон (Коротка відповідь)'] || row['Телефон'] || row['Phone'] || row[keys[4]] || 'Не вказано', photos: photoUrls, category: row['Категорія товару'] || row['Категорія'] || row['Category'] || row['category'] || row[keys[6]] || 'Різне', condition: row['Стан товару'] || row['Стан'] || row['Condition'] || row['condition'] || row[keys[7]] || 'Не вказано', location: row['Місто/Область, де знаходиться товар'] || row['Місто'] || row['Location'] || row['location'] || row[keys[8]] || 'Вільногірськ', vip: row['VIP'] || row['vip'] || row['Vip'] || '' };
        });
        const localItems = approvedItems
          .filter(item => isVilnohirsk(item.location))
          .filter(item => !isFleaJobListing(item))
          .reverse();
        markNewItems(localItems, 'flea', true);
        checkNotification('flea', localItems);
        const newCount = localItems.filter(i => i.condition && i.condition.toLowerCase().includes('нов')).length;
        const usedCount = localItems.filter(i => i.condition && (i.condition.toLowerCase().includes('вжив') || i.condition.toLowerCase().includes('б/у'))).length;
        updateFleaTabBadge(newCount, usedCount, localItems.length);
        allFleaMarketItems = localItems;
        const activeTag = document.querySelector('#flea-categories .flea-category-tag.active'); filterFleaMarket(activeTag ? activeTag.innerText.trim() : 'Всі', activeTag);
      }
    });
  } catch (e) { document.getElementById('flea-market-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження</div>`; }
}

async function loadLostFoundData() {
  try {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=624471689';
    const csvText = await fetchCachedText(csvUrl, 'lost_csv', 3);
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: function(results) {
        const getValue = (row, possibleNames) => { const key = Object.keys(row).find(k => possibleNames.some(n => k.toLowerCase().includes(n))); return key ? String(row[key]).trim() : ''; };
        const approvedItems = results.data.filter(row => { let status = getValue(row, ['статус', 'status']); if (!status) { const keys = Object.keys(row); status = String(row[keys[keys.length - 1]]).trim(); } return status.toLowerCase() === 'одобрено'; }).map(row => {
          let rawPhoto = getValue(row, ['фото', 'photo', 'photos', 'світлина']); let photoUrls = rawPhoto.split(',').map(p => p.trim()).filter(p => p);
          return { title: getValue(row, ['назва', 'title', 'речі']) || 'Без назви', type: getValue(row, ['що сталося', 'type', 'тип']) || 'Знайдено', description: getValue(row, ['опис', 'обставини', 'desc']) || 'Без опису', phone: getValue(row, ['телефон', 'phone', 'контакт']) || 'Не вказано', photos: photoUrls, category: getValue(row, ['категорія', 'category']) || 'Інше', location: getValue(row, ['локація', 'місто', 'location', 'адреса']) || 'Вільногірськ' };
        });
        const localItems = approvedItems.reverse();
        markNewItems(localItems, 'lost', true);
        checkNotification('lost', localItems);
        const foundCount = localItems.filter(i => i.type && i.type.toLowerCase().includes('знайд')).length;
        const lostCount = localItems.length - foundCount;
        updateLostTabBadge(foundCount, lostCount);
        const cont = document.getElementById('lost-found-list-content');
        if (!localItems.length) { cont.innerHTML = '<div class="empty-msg">Оголошень немає</div>'; return; }
        let html = '<div class="shops-tile-grid">';
        localItems.forEach((item, i) => {
          const id = 'lost-detail-' + i; 
          let thumbUrl = item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
          const thumb = thumbUrl ? `<img src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">🔍</span>`; 
          const badgeColor = item.type.toLowerCase().includes('знайд') ? '#00ff9c' : '#ff4d4d';
          let photosHtml = ''; if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos.map(getDriveImageUrl)))}')), 0, event)"><img src="${escapeHTML(getDriveImageUrl(item.photos[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
          
          const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Категорія', value: escapeHTML(item.category)}, {icon: '📍', label: 'Локація', value: escapeHTML(item.location)}, {icon: '📝', label: 'Опис', value: nl2br(item.description)}, {icon: '📞', label: 'Контакти', value: `<a href="tel:${item.phone.replace(/[^0-9+]/g, '')}" class="shop-phone-link">${escapeHTML(item.phone)}</a>`} ]);
          
          const dot = item.isNewItem ? NEW_BADGE_HTML : '';
          html += `<div class="shop-tile" onclick="toggleShop('${id}', this)"><div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat">${escapeHTML(item.category)}</div><div class="card-row" style="margin-bottom: 6px;"><span class="card-price" style="color:${badgeColor}; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; line-height: 1.2; display: block;">${escapeHTML(item.type)}</span></div><div class="shop-tile-name">${escapeHTML(item.title)}${dot}</div><div class="shop-tile-chevron">Опис ▾</div>${dropdownHtml}</div>`;
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
        html += `<div class="${rowClass}"><div class="schedule-left"><span class="station-number">${idx + 1}.</span><span class="station-name-text">${escapeHTML(r[0])}</span></div><div class="${timeClass}">${escapeHTML(r[1])}</div></div>`;
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
      let changedTrains = [];

      d.trains.forEach((x, i) => {
        if (!x) return; const id = "train-" + i; const now = getKyivNow(); let sc = "future", dt = x.time;
        if (x.time && x.time.includes(':')) {
          const [hh, mm] = x.time.split(':').map(Number); const tt = new Date(now); tt.setHours(hh, mm, 0, 0); const diff = Math.floor((tt - now) / 60000);
          if (diff < 0) sc = "passed"; else if (diff <= 10) { sc = "soon"; dt = `≈ ${diff} хв`; }
        } else sc = "passed";
        
        const hc = x.note && x.note !== "змін немає...";
        if (hc) {
            changedTrains.push(x.number);
        }
        
        h += `<div class="train" onclick="toggleTransportDetails('${id}', this)"><div class="train-num-box${hc ? ' has-changes' : ''}">${escapeHTML(x.number)}</div><div class="route-text">${escapeHTML(x.route)}</div><div class="time-val ${sc}">${escapeHTML(dt)}</div></div><div class="details" id="${id}">${x.fullSchedule ? renderGrid(x.fullSchedule) : "Немає даних"}${hc ? `<div class="details-divider"></div><div class="details-note">${escapeHTML(x.note)}</div>` : ''}${x.altSchedule ? renderGrid(x.altSchedule, true) : ""}</div>`;
      });
      document.getElementById("list").innerHTML = h + `</div>`;
      
      // Обновляем баннер изменений без перезаписи всей разметки (фикс дубля)
      const banner = document.getElementById("trains-changes-banner");
      const list = document.getElementById("trains-changes-list");
      if (banner && list) {
          if (changedTrains.length > 0) {
              banner.style.display = 'block';
              list.innerHTML = changedTrains.map(num =>
                `<span class="train-change-tag">${escapeHTML(num)}</span>`
              ).join('');
          } else {
              banner.style.display = 'none';
              list.innerHTML = '';
          }
      }

      const changed = d.trains.filter(x => x && x.note && x.note !== "змін немає...");
      checkNotification('trains', changed);
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
        if (x.periodicityText) infoHtml += `<div class="details-divider"></div><div class="details-note" style="color: #74b9ff; background: rgba(116, 185, 255, 0.1); border-color: rgba(116, 185, 255, 0.15);"><b>Періодичність:</b><br><span style="color:inherit; font-weight:500;">${escapeHTML(x.periodicityText)}</span></div>`;
        if (hasChanges) infoHtml += `<div class="details-divider"></div><div class="details-note" style="color: var(--highlight-color); background: rgba(255, 204, 0, 0.1); border-color: rgba(255, 204, 0, 0.15);"><b>Зміни розкладу:</b><ul style="margin: 8px 0 0 0; padding-left: 20px; text-align: left; font-weight: 500;">${x.changes.map(c => `<li>${escapeHTML(c)}</li>`).join('')}</ul></div>`;
        h += `<div class="train" onclick="toggleTransportDetails('${id}', this)"><div class="train-num-box">${escapeHTML(x.number)}</div><div class="route-text">${escapeHTML(x.route)}</div><div class="time-val">${escapeHTML(x.time)}</div></div><div class="details" id="${id}">${sm.length ? renderGrid(sm, false, true) : "Немає даних"}${infoHtml}</div>`;
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
        if(b.directions) b.directions.forEach((dir, dIdx) => {
          let rh = dir.rows.map((row, rIdx) => {
            if (Array.isArray(row)) {
              return `<div class="schedule-row"><div class="schedule-left"><span class="station-name-text">${escapeHTML(row[0])}</span></div><div class="time-normal">${escapeHTML(row[1])}</div></div>`;
            }
            const label = row.label || ''; const time = row.time || '';
            const hasStops = Array.isArray(row.stops) && row.stops.length > 0;
            if (!hasStops) {
              return `<div class="schedule-row"><div class="schedule-left"><span class="station-name-text">${escapeHTML(label)}</span></div><div class="time-normal">${escapeHTML(time)}</div></div>`;
            }
            const stopsId = `bus-stops-${i}-${dIdx}-${rIdx}`;
            const stopsHtml = row.stops.map(s => `<div class="bus-stop-row"><span class="bus-stop-name">${escapeHTML(s[0])}</span><span class="bus-stop-time">${escapeHTML(s[1])}</span></div>`).join('');
            return `<div class="schedule-row bus-row-clickable" onclick="event.stopPropagation(); document.getElementById('${stopsId}').classList.toggle('open'); this.classList.toggle('expanded');"><div class="schedule-left"><span class="station-name-text">${escapeHTML(label)} <span class="bus-stops-chevron">▾</span></span></div><div class="time-normal">${escapeHTML(time)}</div></div><div class="bus-stops-list" id="${stopsId}">${stopsHtml}</div>`;
          }).join('');
          ch += `<div class="schedule-column"><div style="text-align:center; color:var(--highlight-color); font-size:11px; margin-bottom:10px; font-weight:800; text-transform:uppercase;">${escapeHTML(dir.title)}</div>${rh}</div>`;
        });
        let extraInfo = '';
        if (b.note) extraInfo += `<div class="details-divider"></div><div class="details-note">${escapeHTML(b.note)}</div>`;
        if (b.info) extraInfo += `<div class="details-divider"></div><div class="details-note" style="color: #74b9ff; background: rgba(116, 185, 255, 0.1); border-color: rgba(116, 185, 255, 0.15);">${escapeHTML(b.info)}</div>`;
        h += `<div class="train" onclick="toggleTransportDetails('${id}', this)"><div class="train-num-box" style="background:transparent; font-size:20px;">🚌</div><div class="route-text">${escapeHTML(b.route)}</div><div class="time-val future" style="font-size:11px;">Розклад ▾</div></div><div class="details" id="${id}"><div class="bus-grid">${ch}</div>${extraInfo}</div>`;
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
    showToast('✅ Ваше оголошення успішно додано!', 'success');
    closeModalForm(null, 'blabla-modal'); switchBlaBlaList(formData.type === 'driver' ? 'drivers' : 'passengers'); loadBlaBlaCarData(); 
  } catch (error) { showToast('❌ Помилка при відправці: ' + error.message, 'error'); } finally { submitBtn.innerText = originalBtnText; submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
}

function updateBlaBlaTabBadge(driversCount, passengersCount) {
  const dot = document.getElementById('dot-blablacar');
  if (!dot || !dot.parentElement) return;
  const tab = dot.parentElement;
  tab.style.position = 'relative';
  const old = tab.querySelector('.blabla-live-badge');
  if (old) old.remove();
  const total = driversCount + passengersCount;
  if (total === 0) return;
  const badge = document.createElement('span');
  badge.className = 'blabla-live-badge';
  let inner = '<span class="bb-dot"></span>';
  if (driversCount > 0 && passengersCount > 0) {
    inner += `🚘${driversCount}·🙋${passengersCount}`;
  } else if (driversCount > 0) {
    inner += `🚘 ${driversCount}`;
  } else {
    inner += `🙋 ${passengersCount}`;
  }
  badge.innerHTML = inner;
  badge.title = `Активних поїздок: ${total}`;
  tab.appendChild(badge);
}

function pluralizeUA(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function updateEventsTabBadge(total) {
  const dot = document.getElementById('dot-events');
  if (!dot || !dot.parentElement) return;
  const tab = dot.parentElement;
  tab.style.position = 'relative';
  const old = tab.querySelector('.events-live-badge');
  if (old) old.remove();
  if (typeof total === 'number') {
    try { localStorage.setItem('events_active_count', String(total)); } catch(e) {}
  }
  if (!total || total === 0) return;
  const word = pluralizeUA(total, 'афіша', 'афіші', 'афіш');
  const badge = document.createElement('span');
  badge.className = 'events-live-badge';
  badge.innerHTML = `<span class="ef-dot"></span>${total} ${word}`;
  badge.title = `Активних афіш: ${total}`;
  tab.appendChild(badge);
}

function updateEstateTabBadge(rentCount, saleCount, total) {
  const dot = document.getElementById('dot-estate');
  if (!dot || !dot.parentElement) return;
  const tab = dot.parentElement;
  tab.style.position = 'relative';
  const old = tab.querySelector('.estate-live-badge');
  if (old) old.remove();
  if (!total || total === 0) return;
  const badge = document.createElement('span');
  badge.className = 'estate-live-badge';
  let inner = '<span class="ef-dot"></span>';
  if (rentCount > 0 && saleCount > 0) inner += `🔑${rentCount}·💰${saleCount}`;
  else if (rentCount > 0 && saleCount === 0 && rentCount === total) inner += `🔑 ${rentCount}`;
  else if (saleCount > 0 && rentCount === 0 && saleCount === total) inner += `💰 ${saleCount}`;
  else inner += `🏠 ${total}`;
  badge.innerHTML = inner;
  badge.title = `Активних оголошень: ${total}`;
  tab.appendChild(badge);
}

function updateFleaTabBadge(newCount, usedCount, total) {
  const dot = document.getElementById('dot-flea');
  if (!dot || !dot.parentElement) return;
  const tab = dot.parentElement;
  tab.style.position = 'relative';
  const old = tab.querySelector('.flea-live-badge');
  if (old) old.remove();
  if (!total || total === 0) return;
  const badge = document.createElement('span');
  badge.className = 'flea-live-badge';
  let inner = '<span class="ef-dot"></span>';
  if (newCount > 0 && usedCount > 0) inner += `✨${newCount}·🔧${usedCount}`;
  else if (newCount > 0 && usedCount === 0 && newCount === total) inner += `✨ ${newCount}`;
  else if (usedCount > 0 && newCount === 0 && usedCount === total) inner += `🔧 ${usedCount}`;
  else inner += `📦 ${total}`;
  badge.innerHTML = inner;
  badge.title = `Активних оголошень: ${total}`;
  tab.appendChild(badge);
}

function updateLostTabBadge(foundCount, lostCount) {
  const dot = document.getElementById('dot-lost');
  if (!dot || !dot.parentElement) return;
  const tab = dot.parentElement;
  tab.style.position = 'relative';
  const old = tab.querySelector('.lost-live-badge');
  if (old) old.remove();
  const total = foundCount + lostCount;
  if (total === 0) return;
  const badge = document.createElement('span');
  badge.className = 'lost-live-badge';
  let inner = '<span class="lf-dot"></span>';
  if (foundCount > 0 && lostCount > 0) {
    inner += `🔍${foundCount}·❗${lostCount}`;
  } else if (foundCount > 0) {
    inner += `🔍 ${foundCount}`;
  } else {
    inner += `❗ ${lostCount}`;
  }
  badge.innerHTML = inner;
  badge.title = `Активних оголошень: ${total} (знайдено: ${foundCount}, втрачено: ${lostCount})`;
  tab.appendChild(badge);
}

function updateBlaBlaToggleCounts(driversCount, passengersCount) {
  const btnD = document.getElementById('btn-show-drivers');
  const btnP = document.getElementById('btn-show-passengers');
  const dCls = driversCount === 0 ? 'blabla-count zero' : 'blabla-count';
  const pCls = passengersCount === 0 ? 'blabla-count zero' : 'blabla-count';
  if (btnD) btnD.innerHTML = `🚘 Пропозиції водіїв <span class="${dCls}">${driversCount}</span>`;
  if (btnP) btnP.innerHTML = `🙋‍♂️ Запити пасажирів <span class="${pCls}">${passengersCount}</span>`;
}

async function loadBlaBlaCarData() {
  try {
    const d = await fetchCachedJson('https://vilnohirsk-blablacar-api-production-67d3.up.railway.app/api/rides', 'blabla_api', 2);
    markNewItems(d, 'blablacar', false);
    checkNotification('blablacar', d);

    const dr = d.filter(x => x.type === 'driver' && (isVilnohirsk(x.from) || isVilnohirsk(x.to))).reverse();
    const ps = d.filter(x => x.type === 'passenger' && (isVilnohirsk(x.from) || isVilnohirsk(x.to))).reverse();
    updateBlaBlaTabBadge(dr.length, ps.length);
    updateBlaBlaToggleCounts(dr.length, ps.length);
    
    let htmlD = dr.length ? dr.map(x => `<div class="blabla-card"><div class="blabla-route">📍 ${escapeHTML(x.from)} - ${escapeHTML(x.to)}</div><div class="blabla-date">🗓 ${escapeHTML(x.date)} | 🕒 ${escapeHTML(x.time)}</div><div style="font-size:12px; margin-bottom:5px;">👤 <b>${escapeHTML(x.name)}</b>${x.isNewItem ? NEW_BADGE_HTML : ''}</div><div class="blabla-info-row"><span>💺 Місць: <b>${escapeHTML(x.seats)}</b></span><span>💵 <b>${x.price > 0 ? escapeHTML(x.price) + ' грн' : 'Договірна'}</b></span></div>${x.comment ? `<div class="card-desc">💬 ${escapeHTML(x.comment)}</div>` : ''}<div style="text-align:right; margin-top:5px;"><a href="tel:${x.phone.replace(/[^0-9+]/g, '')}" class="blabla-phone">📞 ${escapeHTML(x.phone)}</a></div></div>`).join('') : '<div class="empty-msg">Пропозицій немає</div>';
    let htmlP = ps.length ? ps.map(x => `<div class="blabla-card"><div class="blabla-route">📍 ${escapeHTML(x.from)} - ${escapeHTML(x.to)}</div><div class="blabla-date">🗓 ${escapeHTML(x.date)} | 🕒 ${escapeHTML(x.time)}</div><div style="font-size:12px; margin-bottom:5px;">👤 <b>${escapeHTML(x.name)}</b>${x.isNewItem ? NEW_BADGE_HTML : ''}</div><div class="blabla-info-row"><span>🧍 Потрібно місць: <b>${escapeHTML(x.seats)}</b></span></div>${x.comment ? `<div class="card-desc">💬 ${escapeHTML(x.comment)}</div>` : ''}<div style="text-align:right; margin-top:5px;"><a href="tel:${x.phone.replace(/[^0-9+]/g, '')}" class="blabla-phone">📞 ${escapeHTML(x.phone)}</a></div></div>`).join('') : '<div class="empty-msg">Запитів немає</div>';
    
    document.getElementById('blabla-drivers-list').innerHTML = htmlD;
    document.getElementById('blabla-passengers-list').innerHTML = htmlP;
  } catch(e) {}
}

async function loadTickerData() {
  try {
    const data = await fetchCachedJson('https://vilnohirsk-ticker-api-production.up.railway.app/api/ticker', 'ticker_api', 2);
    const container = document.getElementById('ticker-container');
    const content = document.getElementById('ticker-content');
    
    if (data && data.messages && data.messages.length > 0) {
      content.innerHTML = data.messages.map(m => `<span class="ticker-item">${escapeHTML(m)}</span>`).join('<span class="ticker-divider">🟢</span>');
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
    }
  } catch(e) {
    document.getElementById('ticker-container').style.display = 'none';
  }
}

function renderPhoenixList(items) {
  const cont = document.getElementById('phoenix-list-content');
  if (!items || !items.length) { cont.innerHTML = '<div class="empty-msg">Актуальної інформації немає</div>'; return; }
  let html = '<div class="shops-tile-grid">';
  items.forEach((item, i) => {
    if(!item) return;
    
    let thumbUrl = item.photos && item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
    
    let photoClickAttr = '';
    if (item.photos && item.photos.length > 0) {
      photoClickAttr = `onclick="openImageModal(JSON.parse(decodeURIComponent('${encodeURIComponent(JSON.stringify(item.photos.map(getDriveImageUrl)))}')), 0, event)"`;
    }

    const thumb = thumbUrl 
      ? `<img src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="object-fit: contain !important; width: 100%; height: 100%; border-radius: 8px; cursor: pointer; opacity:0; transition:opacity 0.3s ease;" ${photoClickAttr}>` 
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:12px;font-weight:bold;color:rgba(255,255,255,0.3);background:#111;border-radius:8px;">ФОТО ВІДСУТНЄ</div>`;
    
    const dot = item.isNewItem ? NEW_BADGE_HTML : '';
    
    const callsignHtml = item.callsign 
      ? `<div style="font-size: 11px; color: #ffcc00; font-weight: 800; text-align: center; margin-bottom: 6px; text-transform: uppercase;">Позивний: «${escapeHTML(item.callsign)}»</div>` 
      : '';
    
    const photoBadge = (item.photos && item.photos.length > 1) 
      ? `<div style="position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,0.7); color:#fff; font-size:9px; padding:3px 8px; border-radius:6px; font-weight:bold; pointer-events:none; border: 1px solid rgba(255,255,255,0.2);">📸 ${item.photos.length}</div>` 
      : '';

    html += `
    <div class="shop-tile" style="background: linear-gradient(180deg, rgba(255, 77, 77, 0.05) 0%, rgba(0,0,0,0.6) 100%); border: 1px solid rgba(255, 77, 77, 0.3); box-shadow: 0 8px 20px rgba(0,0,0,0.5); justify-content: flex-start; cursor: default; padding: 10px;">
      <div style="background: linear-gradient(90deg, rgba(220, 38, 38, 0.9), rgba(153, 27, 27, 0.9)); color: #fff; text-align: center; font-weight: 800; font-size: 10px; text-transform: uppercase; padding: 4px; border-radius: 6px 6px 0 0; margin: -10px -10px 10px -10px; letter-spacing: 0.5px; box-shadow: 0 2px 5px rgba(0,0,0,0.5); text-shadow: 0 1px 2px rgba(0,0,0,0.8);">Зник безвісти</div>
      
      <div class="shop-tile-photo" style="height: 180px; padding: 0; background: #000; border: none; border-radius: 8px; margin-bottom: 10px; box-shadow: inset 0 4px 10px rgba(0,0,0,0.5); position: relative;">
        ${thumb}
        ${photoBadge}
      </div>
      
      <div style="font-size: 9px; font-weight: 800; color: #f8fafc; text-align: center; line-height: 1.4; margin-bottom: 8px; text-transform: uppercase; word-break: break-word;">
        ${escapeHTML(item.name)}${dot}
      </div>
      
      ${callsignHtml}
      
      <div style="background: rgba(255, 77, 77, 0.1); border-radius: 8px; padding: 8px 0; margin-top: auto; border: 1px solid rgba(255,77,77,0.2); display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; padding-left: 8px; padding-right: 8px;">
          <span style="font-size: 8px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 2px;">Народився:</span>
          <span style="font-size: 10px; color: #fff; font-weight: 700;">${escapeHTML(item.dob || '-')}</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding-left: 8px; padding-right: 8px;">
          <span style="font-size: 8px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 2px;">Зник:</span>
          <span style="font-size: 11px; color: #ff4d4d; font-weight: 800;">${escapeHTML(item.date_missing || '-')}</span>
        </div>
      </div>
    </div>`;
  });
  html += '</div>';
  cont.innerHTML = html;
}

async function loadPhoenixData() {
  try {
    const PHOENIX_API_URL = 'https://vilnohirsk-phoenix-api-production.up.railway.app/api/phoenix';
    const data = await fetchCachedJson(PHOENIX_API_URL, 'phoenix_api', 5);
    let itemsArray = Array.isArray(data) ? data : (data && Array.isArray(data.phoenix) ? data.phoenix : []);
    const activeItems = itemsArray.filter(item => item && item.active !== false);
    markNewItems(activeItems, 'phoenix', false);
    checkNotification('phoenix', activeItems);
    renderPhoenixList(activeItems);
  } catch(e) {
    document.getElementById('phoenix-list-content').innerHTML = `<div class="empty-msg" style="color: #ff6b6b;">Помилка завантаження даних Фенікс</div>`;
  }
}

function updateZsuTabIndicator(activeItems) {
  const tab = document.querySelector('.tab-alert.volunteers');
  if (!tab) return;
  if (!activeItems || activeItems.length === 0) {
    tab.classList.remove('has-active-collection');
    tab.style.removeProperty('--collection-progress');
    const oldBadge = tab.querySelector('.zsu-live-badge');
    if (oldBadge) oldBadge.remove();
    const oldBar = tab.querySelector('.zsu-progress-bar');
    if (oldBar) oldBar.remove();
    return;
  }
  // Збираємо прогрес кожного збору окремо (щоб показати сегменти знизу вкладки)
  const progresses = activeItems.map(item => {
    const goal = item.goal ? parseInt(String(item.goal).replace(/\D/g, ''), 10) : 0;
    const collected = item.collected ? parseInt(String(item.collected).replace(/\D/g, ''), 10) : 0;
    return goal > 0 ? Math.min(Math.round((collected / goal) * 100), 100) : 0;
  });
  const bestPercent = progresses.length ? Math.max.apply(null, progresses) : 0;

  tab.classList.add('has-active-collection');
  tab.style.setProperty('--collection-progress', bestPercent + '%');

  // Бейдж — показуємо кількість, якщо зборів більше одного
  const n = activeItems.length;
  let badge = tab.querySelector('.zsu-live-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'zsu-live-badge';
    tab.appendChild(badge);
  }
  if (n === 1) {
    badge.textContent = '🔴 ЗБІР';
  } else {
    const word = (n >= 2 && n <= 4) ? 'ЗБОРИ' : 'ЗБОРІВ';
    badge.textContent = `🔴 ${word} × ${n}`;
  }

  // Сегментована прогрес-смуга під вкладкою (один сегмент на збір)
  let bar = tab.querySelector('.zsu-progress-bar');
  if (!bar) {
    bar = document.createElement('span');
    bar.className = 'zsu-progress-bar';
    tab.appendChild(bar);
  }
  bar.innerHTML = progresses.map(p =>
    `<span class="zsu-progress-seg"><span class="zsu-progress-fill" style="width:${p}%"></span></span>`
  ).join('');
}

async function loadVolunteersData() {
  const container = document.getElementById('volunteers-list-content'); if (!container) return;
  try {
    const data = await fetchCachedJson('https://vilnohirsk-volunteers-api-production.up.railway.app/api/volunteers', 'volunteers_api', 2);
    let itemsArray = Array.isArray(data) ? data : (data && Array.isArray(data.volunteers) ? data.volunteers : []);
    const activeItems = itemsArray.filter(item => item && item.active !== false);

    markNewItems(activeItems, 'volunteers', false);
    checkNotification('volunteers', activeItems);
    updateZsuTabIndicator(activeItems);

    const emptyZsuHtml = `<div style="padding: 24px 18px; text-align: center; background: linear-gradient(145deg, rgba(56, 189, 248, 0.12), rgba(255, 204, 0, 0.08)); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.06);"><div style="font-size: 44px; margin-bottom: 8px;">💙💛</div><div style="font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 10px; line-height: 1.3;">Активних зборів зараз немає</div><div style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.5; margin-bottom: 14px;">Тут публікуються <b style="color:#ffcc00;">перевірені збори</b> від місцевих волонтерів. Скоро з'являться нові — слідкуйте!</div><div style="padding: 12px; background: rgba(0,0,0,0.25); border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; font-size: 11px; color: rgba(255,255,255,0.75); line-height: 1.5;">🤝 Ви волонтер? Маєте офіційний збір?<br>Напишіть нам у Telegram: <a href="https://t.me/vilnohirsk" target="_blank" style="color: var(--time-green); text-decoration: none; font-weight: 800; font-size: 13px;">@vilnohirsk</a><br><span style="color:rgba(255,255,255,0.5); font-size:10px;">— ми перевіримо і опублікуємо</span></div><div style="margin-top: 14px; font-size: 13px; font-weight: 800; color: #ffcc00; letter-spacing: 0.5px; text-shadow: 0 0 10px rgba(255,204,0,0.4);">Слава Україні! 🇺🇦</div></div>`;
    if (!activeItems || activeItems.length === 0) { container.innerHTML = emptyZsuHtml; return; }
    const useGrid = activeItems.length >= 2;
    let html = useGrid ? '<div class="zsu-grid">' : '';
    activeItems.forEach((item, i) => {
        const title = item.title || 'ЗБІР НА ЗСУ'; const desc = item.description ? nl2br(item.description) : 'Підтримайте наших захисників!';
        const jarUrl = item.jar_url || ''; const cardNumber = item.card_number || ''; const id = Math.random().toString(36).substr(2, 5);
        const collected = item.collected ? parseInt(item.collected.toString().replace(/\D/g, ''), 10) : 0; const goal = item.goal ? parseInt(item.goal.toString().replace(/\D/g, ''), 10) : 0;
        let progressHtml = '';
        if (goal > 0) {
            const percent = Math.min(Math.round((collected / goal) * 100), 100);
            progressHtml = `<div class="zsu-card-progress" style="width: 100%; margin-top: 15px; margin-bottom: 5px;"><div class="zsu-progress-labels" style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 6px;"><span style="color: #00ff9c;">Зібрано: ${collected.toLocaleString('uk-UA')} ₴</span><span style="color: rgba(255,255,255,0.5);">Ціль: ${goal.toLocaleString('uk-UA')} ₴</span></div><div style="width: 100%; height: 6px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);"><div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #ffcc00); border-radius: 10px; transition: width 1s ease-in-out;"></div></div></div>`;
        }
        let reqsHtml = '';
        if (jarUrl) reqsHtml += `<a class="zsu-req-jar" href="${escapeHTML(jarUrl)}" target="_blank" style="display: block; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; margin-bottom: 10px; text-decoration: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(0,0,0,0.25)'"><div class="zsu-req-jar-label" style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="font-size: 16px;">🏦</span><span style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Посилання на Банку</span></div><div class="zsu-req-jar-url" style="font-size: 13px; color: var(--time-green); font-weight: 800; word-break: break-all; line-height: 1.4;" id="jar-${id}">${escapeHTML(jarUrl)}</div></a>`;
        if (cardNumber) reqsHtml += `<div class="zsu-req-card" style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px;"><div class="zsu-req-card-label" style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="font-size: 16px;">💳</span><span style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Номер картки</span></div><div class="zsu-req-card-num" style="font-size: 18px; font-weight: 800; font-family: monospace; letter-spacing: 1px; color: #fff; margin-bottom: 12px; text-align: center;" id="card-${id}">${escapeHTML(cardNumber)}</div><button class="zsu-req-card-btn" onclick="copyToClipboardBtn('${cardNumber.replace(/\s/g, '')}', this)" style="width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; padding: 10px; font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s;">📋 Копіювати номер</button></div>`;

        const dot = item.isNewItem ? NEW_BADGE_HTML : '';
        html += `<div class="zsu-card" style="margin-bottom: 20px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); position: relative;"><div class="zsu-card-header" style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; padding-right: 15px;"><div style="width: 10px; height: 10px; border-radius: 50%; background: #ffcc00; box-shadow: 0 0 10px rgba(255, 204, 0, 0.6); margin-top: 4px; flex-shrink: 0; animation: pulseAlert 2s infinite;"></div><div class="zsu-card-title" style="font-size: 15px; font-weight: 800; color: #fff; line-height: 1.3; text-align: left;">${escapeHTML(title)}${dot}</div></div><div class="zsu-card-desc" style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.6; text-align: left; margin-bottom: 15px; word-break: break-word;">${desc}</div>${progressHtml}<div class="zsu-card-reqs" style="margin-top: 20px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;"><div class="zsu-card-reqs-title" style="font-size: 10px; font-weight: 700; color: var(--highlight-color); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; text-align: left;">Реквізити для допомоги:</div>${reqsHtml}</div></div>`;
    });
    if (useGrid) html += '</div>';
    container.innerHTML = html;
  } catch (e) { container.innerHTML = `<div style="padding: 24px 18px; text-align: center; background: linear-gradient(145deg, rgba(56, 189, 248, 0.12), rgba(255, 204, 0, 0.08)); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 18px;"><div style="font-size: 44px; margin-bottom: 8px;">💙💛</div><div style="font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 10px;">Активних зборів зараз немає</div><div style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.5; margin-bottom: 14px;">Тут публікуються перевірені збори від місцевих волонтерів. Скоро з'являться нові — слідкуйте!</div><div style="padding: 12px; background: rgba(0,0,0,0.25); border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; font-size: 11px; color: rgba(255,255,255,0.75); line-height: 1.5;">🤝 Маєте офіційний збір? Напишіть: <a href="https://t.me/vilnohirsk" target="_blank" style="color: var(--time-green); text-decoration: none; font-weight: 800;">@vilnohirsk</a></div><div style="margin-top: 14px; font-size: 13px; font-weight: 800; color: #ffcc00;">Слава Україні! 🇺🇦</div></div>`; }
}

function toggleJobsDrawer(drawerId, btn) {
  const d = document.getElementById(drawerId);
  if (!d) return;
  d.classList.toggle('open');
  const arr = btn && btn.querySelector ? btn.querySelector('.arr') : null;
  if (arr) arr.textContent = d.classList.contains('open') ? '▴' : '▾';
}

// === Стан сортування для ДЦЗ-секції ===
let dczSortMode = 'date'; // 'date' | 'salary_asc' | 'salary_desc'
let allDczJobs = [];

function parseSalaryNum(s) {
  if (!s) return 0;
  const m = String(s).replace(/\s/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function parseDczDate(s) {
  if (!s) return 0;
  // Очікуваний формат YAML: "10.05.26" або "10.05.2026", але страхуємось будь-якими розділювачами
  const m = String(s).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!m) return 0;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day).getTime();
}

function setDczSort(mode, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  dczSortMode = mode;
  const d = document.getElementById('dcz-drawer');
  if (d) d.innerHTML = renderDczDrawerContent();
}

function renderDczDrawerContent() {
  let filtered = allDczJobs.slice();
  if (dczSortMode === 'salary_asc')  filtered.sort((a, b) => parseSalaryNum(a.salary) - parseSalaryNum(b.salary));
  if (dczSortMode === 'salary_desc') filtered.sort((a, b) => parseSalaryNum(b.salary) - parseSalaryNum(a.salary));
  if (dczSortMode === 'date')        filtered.sort((a, b) => parseDczDate(b.date) - parseDczDate(a.date));

  let cards = '';
  filtered.forEach((job, i) => { cards += createJobCardHtml(job, i, 'd'); });

  const subtitle = '<div style="font-size: 10px; color: rgba(255,255,255,0.5); padding: 10px 4px 6px; line-height: 1.4;">Офіційні вакансії з державного центру зайнятості Вільногірська</div>';

  const sortBar = `<div class="flea-categories-wrapper" style="padding: 2px 4px 8px;">
    <div class="flea-category-tag${dczSortMode === 'date' ? ' active' : ''}" onclick="setDczSort('date', event)">📅 Спочатку нові</div>
    <div class="flea-category-tag${dczSortMode === 'salary_asc' ? ' active' : ''}" onclick="setDczSort('salary_asc', event)">💵 Зарплата ↑</div>
    <div class="flea-category-tag${dczSortMode === 'salary_desc' ? ' active' : ''}" onclick="setDczSort('salary_desc', event)">💵 Зарплата ↓</div>
  </div>`;

  const grid = filtered.length > 0
    ? `<div class="shops-tile-grid" style="padding-bottom:10px;">${cards}</div>`
    : '<div class="empty-msg" style="padding: 20px;">Немає вакансій</div>';

  return subtitle + sortBar + grid;
}

function createJobCardHtml(job, index, prefix) {
  const isTel = job.url && job.url.startsWith('tel:');
  let displayPhone = job.phone;
  if (displayPhone) { let cleanPhone = displayPhone.replace(/\D/g, ''); if (cleanPhone.length >= 10) displayPhone = '0' + cleanPhone.slice(-9); else if (cleanPhone.length === 9) displayPhone = '0' + cleanPhone; }
  const btnText = isTel && displayPhone ? displayPhone : (isTel ? 'Зателефонувати' : 'Відгукнутися 🔗');
  const targetAttr = isTel ? '_self' : '_blank';
  let displaySalary = job.salary; if (displaySalary && displaySalary !== '-' && /^\d+$/.test(displaySalary.trim())) { displaySalary = displaySalary.trim() + ' грн'; }

  const isVip = job.isVip || job.vip;
  const vipBadge = isVip ? '<div class="vip-badge" style="background: linear-gradient(135deg, #ffcc00, #ff8800); color: #000;">VIP</div>' : '';
  const employment = job.employment || 'Не вказано';
  const safeDesc = job.description ? nl2br(job.description) : 'Без опису';
  const id = `job-detail-${prefix}-${index}`;

  const callBtnHtml = `<a href="${escapeHTML(job.url)}" target="${targetAttr}" style="display: block; width: 100%; box-sizing: border-box; text-align: center; padding: 12px; border-radius: 10px; background: linear-gradient(135deg, #007aff, #005bb5); color: #fff; font-weight: 800; font-size: 13px; text-decoration: none; margin-top: 5px; box-shadow: 0 4px 10px rgba(0, 122, 255, 0.3);" onclick="event.stopPropagation();">${escapeHTML(btnText)}</a>`;

  const dropdownHtml = `<div class="shop-details-dropdown" id="${id}" onclick="event.stopPropagation()">
      <div class="shop-inner-list" style="display: block; padding: 12px; text-align: left;">
          <div style="font-size: 11px; font-weight: 800; color: #ffcc00; margin-bottom: 6px;">📝 Повний опис:</div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.9); line-height: 1.4; word-break: break-word; margin-bottom: 12px;">
              ${safeDesc}
          </div>
          ${callBtnHtml}
      </div>
  </div>`;

  let tileStyle = "justify-content: flex-start; text-align: left; min-width: 0; box-sizing: border-box;";
  if (isVip) {
      tileStyle += " background: linear-gradient(135deg, rgba(255, 170, 0, 0.25), rgba(50, 15, 0, 0.9)) !important; border: 1px solid rgba(255, 204, 0, 0.4) !important; box-shadow: 0 10px 30px rgba(255, 170, 0, 0.25), inset 0 1px 2px rgba(255, 255, 255, 0.15) !important;";
  }

  const dot = job.isNewItem ? NEW_BADGE_HTML : '';

  return `<div class="shop-tile" style="${tileStyle}" onclick="toggleShop('${id}', this)">
      ${vipBadge}
      <div class="shop-tile-name" style="color: var(--highlight-color); font-size: 14px; margin-bottom: 6px; margin-top: 4px;">${escapeHTML(job.title)}${dot}</div>
      <div style="font-size: 11px; color: rgba(255,255,255,0.9); margin-bottom: 4px;"><b>Роботодавець:</b> ${escapeHTML(job.company) || 'Не вказано'}</div>
      <div style="font-size: 11px; color: rgba(255,255,255,0.9); margin-bottom: 8px;"><b>Зайнятість:</b> ${escapeHTML(employment)}</div>

      <div class="card-price" style="font-size: 16px; margin-bottom: 8px; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; line-height: 1.2;">${escapeHTML(displaySalary) || '-'}</div>

      <div style="font-size: 10px; color: rgba(255,255,255,0.5); margin-bottom: 8px;">Дата: ${escapeHTML(job.date)}</div>

      <div style="margin-top: auto; display: flex; justify-content: flex-end; width: 100%;">
          <div class="shop-tile-chevron" style="background: rgba(0, 255, 156, 0.15); color: var(--time-green); padding: 5px 10px; border-radius: 8px; font-size: 11px; font-weight: 800; white-space: nowrap; display: flex; align-items: center; gap: 4px; box-shadow: none; text-transform: uppercase;">Деталі <span>▾</span></div>
      </div>
      ${dropdownHtml}
  </div>`;
}

function renderJobs(jobs) {
  const container = document.getElementById('jobs-list-content'); if (!container) return;
  if (!jobs || jobs.length === 0) { container.innerHTML = '<div class="empty-msg">Актуальних вакансій немає</div>'; return; }
  
  const stopWords = ['зсу', 'батальйон', 'бригада', 'військов', 'взвод', 'міномет', 'штурмов', 'розвідувальн', 'десантн', 'тцк', 'сил оборони', 'військкомат', 'навідник', 'кулеметник', 'гранатометник', 'зенітн', 'артилері', 'морськ', 'піхот', 'снайпер', 'сапер', 'командир відділення', 'бойов', 'дшв'];
  const safeJobs = jobs.filter(job => { const textToSearch = ((job.title || '') + ' ' + (job.company || '') + ' ' + (job.description || '')).toLowerCase(); return !stopWords.some(word => textToSearch.includes(word)); });
  
  const vipJobs = safeJobs.filter(j => j.isVip || j.vip).reverse();
  const dczJobs = safeJobs.filter(j => !j.isVip && !j.vip && j.source === 'ДЦЗ');
  const internetJobs = safeJobs.filter(j => !j.isVip && !j.vip && (j.source === 'Work.ua' || j.date === 'Work.ua'));
  const regularJobs = safeJobs.filter(j => !j.isVip && !j.vip && j.source !== 'Work.ua' && j.date !== 'Work.ua' && j.source !== 'ДЦЗ');
  
  let html = '';
  if (vipJobs.length > 0) {
      html += '<div style="font-size:11px; color:var(--highlight-color); text-transform:uppercase; font-weight:800; margin-bottom:10px; text-align:left; padding-left:5px; letter-spacing: 0.5px;">🌟 VIP Вакансії</div>';
      html += '<div class="shops-tile-grid" style="margin-bottom: 15px;">';
      vipJobs.forEach((job, i) => { html += createJobCardHtml(job, i, 'v'); });
      html += '</div>';
  }

  if (dczJobs.length > 0) {
      allDczJobs = dczJobs;
      html += `<div style="margin-bottom: 10px;">
        <button onclick="toggleJobsDrawer('dcz-drawer', this)" style="width:100%; background:rgba(56, 189, 248, 0.06); border:1px solid rgba(56, 189, 248, 0.35); padding:12px 15px; border-radius:12px; color:#38bdf8; font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition: background 0.3s; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          <span>🏛 Державний центр зайнятості (${dczJobs.length})</span>
          <span class="arr" style="font-size:16px;">▾</span>
        </button>
        <div id="dcz-drawer" class="jobs-drawer">${renderDczDrawerContent()}</div>
      </div>`;
  }

  if (internetJobs.length > 0) {
      let cards = '';
      internetJobs.forEach((job, i) => { cards += createJobCardHtml(job, i, 'i'); });
      html += `<div style="margin-bottom: 10px;">
        <button onclick="toggleJobsDrawer('workua-drawer', this)" style="width:100%; background:rgba(0, 255, 156, 0.05); border:1px solid rgba(0, 255, 156, 0.3); padding:12px 15px; border-radius:12px; color:var(--time-green); font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition: background 0.3s; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          <span>🌐 Вакансії з Work.ua (${internetJobs.length})</span>
          <span class="arr" style="font-size:16px;">▾</span>
        </button>
        <div id="workua-drawer" class="jobs-drawer">
          <div class="shops-tile-grid" style="padding-bottom:10px; padding-top:10px;">${cards}</div>
        </div>
      </div>`;
  }
  if (regularJobs.length > 0) {
      let cards = '';
      getStableShuffled(regularJobs, 'jobs').forEach((job, i) => { cards += createJobCardHtml(job, i, 'r'); });
      html += `<div style="margin-bottom: 10px;">
        <button onclick="toggleJobsDrawer('local-drawer', this)" style="width:100%; background:rgba(255, 204, 0, 0.05); border:1px solid rgba(255, 204, 0, 0.3); padding:12px 15px; border-radius:12px; color:var(--highlight-color); font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition: background 0.3s; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          <span>👥 Від місцевих підприємців (${regularJobs.length})</span>
          <span class="arr" style="font-size:16px;">▾</span>
        </button>
        <div id="local-drawer" class="jobs-drawer">
          <div style="font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 500; padding: 10px 4px 8px; line-height: 1.4;">Оголошення, які додали місцеві підприємці та роботодавці</div>
          <div class="shops-tile-grid" style="padding-bottom:10px;">${cards}</div>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

async function loadJobsData() {
  let allJobs = [];
  try { const parsedJobs = await fetchCachedJson('https://vilnohirsk-jobs-api-production.up.railway.app/api/jobs', 'jobs_api', 1); if (Array.isArray(parsedJobs)) { allJobs = allJobs.concat(parsedJobs); } } catch(e) {}
  const SHEET_GID = '1809375718'; const csvUrl = `https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
  try {
    const csvText = await fetchCachedText(csvUrl, 'jobs_csv', 3);
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: function(results) {
        const userJobs = results.data.filter(row => { const keys = Object.keys(row); let status = row['Статус'] || row['Status'] || row['status'] || row[keys[1]]; return status && String(status).trim().toLowerCase() === 'одобрено'; }).map(row => {
          const keys = Object.keys(row); const phone = row['Телефон'] || row[keys[6]] || ''; const gender = row['Стать'] || row['gender'] || row[keys[7]] || ''; const employment = row['Зайнятість'] || row['employment'] || row[keys[8]] || ''; const vipStatus = row['VIP'] || row[keys[9]] || ''; const isVip = isVipFlag(vipStatus);
          return { title: row['Посада'] || row[keys[2]] || 'Без назви', salary: row['Зарплата'] || row[keys[3]] || '-', company: row['Компанія'] || row[keys[4]] || 'Не вказано', description: row['Опис'] || row[keys[5]] || '', date: row['Дата'] ? String(row['Дата']).split(' ')[0] : 'Нещодавно', phone: phone, gender: gender, employment: employment, url: phone ? `tel:${phone.replace(/[^0-9+]/g, '')}` : '#', isVip: isVip, source: 'User' };
        });
        allJobs = allJobs.concat(userJobs); 
        markNewItems(allJobs, 'jobs', false);
        checkNotification('jobs', allJobs); 
        renderJobs(allJobs);
      }
    });
  } catch (e) { 
    markNewItems(allJobs, 'jobs', false);
    checkNotification('jobs', allJobs); 
    renderJobs(allJobs); 
  }
}

let radioStatsInterval;
async function updateRadioStats() {
  try {
    const audio = document.getElementById('radio-audio');
    if (audio.paused) return; // не делаем запрос если радио не играет
    const res = await fetch('https://myradio24.com/users/muzdance/status.json?t=' + Date.now());
    if(res.ok) {
      const data = await res.json();
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
            if(!radioStatsInterval) radioStatsInterval = setInterval(updateRadioStats, 30000); // 15с → 30с для экономии трафика
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
        const API_URL = 'https://vilnohirsk-volunteers-api-production.up.railway.app/api/volunteers'; const data = await fetchCachedJson(API_URL, 'volunteers_api', 2); 
        let itemsArray = Array.isArray(data) ? data : (data && Array.isArray(data.volunteers) ? data.volunteers : []);
        const activeItems = itemsArray.filter(item => item && item.active !== false);
        if (activeItems && activeItems.length > 0) {
            const item = activeItems[0]; const title = item.title || 'ЗБІР НА ЗСУ'; const desc = item.description ? nl2br(item.description) : ''; const jarUrl = item.jar_url || ''; const cardNumber = item.card_number || ''; const collected = item.collected ? parseInt(item.collected.toString().replace(/\D/g, ''), 10) : 0; const goal = item.goal ? parseInt(item.goal.toString().replace(/\D/g, ''), 10) : 0;
            let progressHtml = '';
            if (goal > 0) { const percent = Math.min(Math.round((collected / goal) * 100), 100); progressHtml = `<div style="width: 100%; margin-top: 15px; margin-bottom: 15px;"><div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; margin-bottom: 6px;"><span style="color: #00ff9c;">Зібрано: ${collected.toLocaleString('uk-UA')} ₴</span><span style="color: rgba(255,255,255,0.5);">Ціль: ${goal.toLocaleString('uk-UA')} ₴</span></div><div style="width: 100%; height: 8px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);"><div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #ffcc00); border-radius: 10px; transition: width 1s ease-in-out;"></div></div></div>`; }
            let btnHtml = ''; if (jarUrl) { btnHtml = `<a href="${escapeHTML(jarUrl)}" target="_blank" style="display: block; width: 100%; background: #fff; color: #000; text-align: center; padding: 14px; border-radius: 14px; font-weight: 900; text-decoration: none; font-size: 16px; margin-top: 10px; box-shadow: 0 4px 15px rgba(255,255,255,0.2);">💸 Підтримати банку</a>`; }
            const modalContent = document.getElementById('daily-zsu-content');
            modalContent.innerHTML = `<div style="text-align: center; font-size: 40px; margin-bottom: 5px;">🇺🇦</div><h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 800; text-align: center; color: #fff; line-height: 1.3;">${escapeHTML(title)}</h3><div style="font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.5; text-align: left; margin-bottom: 15px; max-height: 200px; overflow-y: auto; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">${desc}</div>${progressHtml}${btnHtml}<button onclick="closeModalForm(null, 'daily-zsu-modal')" style="width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.8); padding: 12px; border-radius: 14px; font-weight: 700; margin-top: 10px; font-size: 14px; cursor: pointer; transition: 0.2s;">Повернутися до сайту</button>`;
            document.getElementById('daily-zsu-modal').classList.add('active'); document.body.style.overflow = 'hidden'; localStorage.setItem('last_zsu_alert_date', today);
        }
    } catch (e) { console.error("Failed to load daily ZSU alert", e); }
}

async function submitBetaFeedback(event) {
  event.preventDefault(); 
  if (!validateCaptcha('custom-feedback-form')) return;
  const textEl = document.getElementById('beta-feedback-text'); 
  const contactEl = document.getElementById('beta-feedback-contact');
  let text = textEl.value.trim();
  const contact = contactEl ? contactEl.value.trim() : '';
  
  if (!text) { showToast('Будь ласка, напишіть текст відгуку.', 'error'); return; }
  
  if (contact) {
    text += `\n\n---Контакт для зв'язку---\n${contact}`;
  }

  const btn = document.getElementById('feedback-submit-btn'); const originalText = btn.innerText; btn.innerText = 'Відправка...'; btn.disabled = true;
  try {
    await fetch(APP_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ formType: 'feedback', text: text }) });
    showToast('✅ Дякуємо! Ваш відгук успішно відправлено.', 'success');
    textEl.value = ''; 
    if (contactEl) contactEl.value = '';
    closeModalForm(null, 'feedback-modal'); setupCaptcha('custom-feedback-form');
  } catch(e) { showToast('❌ Помилка: ' + e.message, 'error'); } finally { btn.innerText = originalText; btn.disabled = false; }
}

// === УМНОЕ АВТООБНОВЛЕНИЕ: разнесли по группам, чтобы не грузить всё разом ===
// Группа A (часто, важное): транспорт, алерты, акции, валюта, бегущая строка
function refreshGroupA() {
    if (!isPageVisible) return;
    loadTrainsData();
    loadAlerts();
    loadPromosData();
    loadExchangeRates();
    loadTickerData();
}

// Группа B (реже, тяжёлое): барахолка, недвижка, шопинг, вакансии, бюро находок
function refreshGroupB() {
    if (!isPageVisible) return;
    loadShopsData();
    loadFleaMarketData();
    loadEstateData();
    loadLostFoundData();
    loadJobsData();
}

// Группа C (ещё реже): волонтёры, феникс, события, потяги
function refreshGroupC() {
    if (!isPageVisible) return;
    loadVolunteersData();
    loadPhoenixData();
    loadEventsData();
    loadLongTrainsData();
    loadBlaBlaCarData();
}

// =========================================================================
// =========================================================================
// === PUSH-УВЕДОМЛЕНИЯ (Firebase Cloud Messaging) ===
// === з вибором категорій (по вкладкам сайту)            ===
// =========================================================================
// =========================================================================

let firebaseMessaging = null;
let firebaseInitialized = false;

// === ВСЕ КАТЕГОРИИ САЙТА (16 шт.) ===
// id повинен співпадати з тим що пишеш в G колонку Push_Tokens
const PUSH_CATEGORIES = [
  // ВАЖЛИВЕ
  { id: 'communal',    icon: '⚡', name: 'Комунальні новини', desc: 'Світло, вода, газ', group: 'Важливе', defaultOn: true },
  { id: 'news',        icon: '📰', name: 'Новини міста',      desc: 'Міські новини',     group: 'Важливе', defaultOn: true },
  { id: 'volunteers',  icon: '🇺🇦', name: 'Допомога ЗСУ',     desc: 'Нові збори',         group: 'Важливе', defaultOn: true },
  { id: 'phoenix',     icon: '🚒', name: 'Фенікс (зниклі)',   desc: 'Пошук людей',        group: 'Важливе', defaultOn: true },
  // ПОДІЇ
  { id: 'events',      icon: '🎉', name: 'Афіші',             desc: 'Концерти, заходи',   group: 'Події та акції', defaultOn: false },
  { id: 'gallery',     icon: '📸', name: 'Фото міста',        desc: 'Нові фото',          group: 'Події та акції', defaultOn: false },
  { id: 'promos',      icon: '🔥', name: 'Акції магазинів',   desc: 'Знижки та акції',    group: 'Події та акції', defaultOn: false },
  // ТРАНСПОРТ
  { id: 'trains',      icon: '🚆', name: 'Електрички',        desc: 'Зміни розкладу',     group: 'Транспорт', defaultOn: false },
  { id: 'buses',       icon: '🚌', name: 'Автобуси',          desc: 'Зміни розкладу',     group: 'Транспорт', defaultOn: false },
  { id: 'long_trains', icon: '🛤️', name: 'Потяги (далекі)',  desc: 'Зміни розкладу',     group: 'Транспорт', defaultOn: false },
  { id: 'blablacar',   icon: '🚗', name: 'BlaBlaCar',         desc: 'Нові попутки',       group: 'Транспорт', defaultOn: false },
  // ОГОЛОШЕННЯ
  { id: 'estate',      icon: '🏠', name: 'Нерухомість',       desc: 'Нові оголошення',    group: 'Оголошення', defaultOn: false },
  { id: 'shopping',    icon: '🛍', name: 'Шопінг',            desc: 'Нові магазини',      group: 'Оголошення', defaultOn: false },
  { id: 'flea',        icon: '📦', name: 'Барахолка',         desc: 'Нові оголошення',    group: 'Оголошення', defaultOn: false },
  { id: 'jobs',        icon: '💼', name: 'Вакансії',          desc: 'Нові вакансії',      group: 'Оголошення', defaultOn: false },
  { id: 'lost',        icon: '🔍', name: 'Знахідки',          desc: 'Бюро знахідок',      group: 'Оголошення', defaultOn: false }
];

// Категории по умолчанию (для нового подписчика)
function getDefaultCategories() {
  return PUSH_CATEGORIES.filter(c => c.defaultOn).map(c => c.id);
}

// Получить текущие выбранные категории юзера (из localStorage)
function getCurrentCategories() {
  const saved = localStorage.getItem('push_categories');
  if (!saved) return getDefaultCategories();
  try {
    const arr = JSON.parse(saved);
    return Array.isArray(arr) && arr.length > 0 ? arr : getDefaultCategories();
  } catch (e) {
    return getDefaultCategories();
  }
}

// Проверка — есть ли вообще поддержка пушей в этом браузере
function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Проверка — iOS устройство (iPhone/iPad)
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
}

// Проверка — запущен ли сайт в PWA-режиме (с домашнего экрана)
function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

// Определяем платформу для записи в таблицу
function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPad|iPhone|iPod/.test(ua)) return isPWA() ? 'iOS (PWA)' : 'iOS (Safari)';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}

// Ленивая инициализация Firebase (только когда юзер реально хочет подписаться)
async function initFirebase() {
  if (firebaseInitialized) return firebaseMessaging;
  
  if (!window.firebase) {
    throw new Error('Firebase SDK не завантажено');
  }
  
  firebase.initializeApp(FIREBASE_CONFIG);
  firebaseMessaging = firebase.messaging();
  firebaseInitialized = true;
  return firebaseMessaging;
}

// Регистрация Service Worker для Firebase (только когда нужен)
async function registerFirebaseSW() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker не підтримується');
  }
  
  // Проверяем что SW ещё не зарегистрирован
  const regs = await navigator.serviceWorker.getRegistrations();
  for (let r of regs) {
    if (r.active && r.active.scriptURL && r.active.scriptURL.includes('firebase-messaging-sw')) {
      return r;
    }
  }
  
  // Регистрируем
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  return registration;
}

// Сохраняем токен в Google Sheets через Apps Script (с категориями)
async function savePushTokenToServer(token, categories) {
  try {
    await fetch(APP_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        formType: 'push_subscribe',
        token: token,
        userAgent: navigator.userAgent,
        platform: detectPlatform(),
        categories: categories
      })
    });
    return true;
  } catch (e) {
    console.error('Помилка збереження токена:', e);
    return false;
  }
}

// Обновляем категории на сервере (для уже подписанного юзера)
async function updateCategoriesOnServer(token, categories) {
  try {
    await fetch(APP_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        formType: 'push_update_categories',
        token: token,
        categories: categories
      })
    });
    return true;
  } catch (e) {
    console.error('Помилка оновлення категорій:', e);
    return false;
  }
}

// Главная функция подписки — вызывается после выбора категорий
async function subscribeToPush(selectedCategories) {
  // 1. Проверяем поддержку браузера
  if (!isPushSupported()) {
    showToast('❌ Ваш браузер не підтримує сповіщення', 'error');
    return false;
  }
  
  // 2. iOS особый случай — нужен PWA режим
  if (isIOS() && !isPWA()) {
    showIOSInstructions();
    return false;
  }

  if (!selectedCategories || selectedCategories.length === 0) {
    showToast('❌ Оберіть хоча б одну категорію', 'error');
    return false;
  }
  
  try {
    // 3. Запрашиваем разрешение
    const permission = await Notification.requestPermission();
    
    if (permission === 'denied') {
      showToast('🚫 Ви заборонили сповіщення. Дозвольте в налаштуваннях браузера.', 'error');
      return false;
    }
    
    if (permission !== 'granted') {
      return false;
    }
    
    // 4. Регистрируем Service Worker
    const registration = await registerFirebaseSW();
    
    // 5. Инициализируем Firebase
    await initFirebase();
    
    // 6. Получаем токен
    const token = await firebaseMessaging.getToken({
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    
    if (!token) {
      showToast('❌ Не вдалося отримати токен. Спробуйте ще раз.', 'error');
      return false;
    }
    
    // 7. Отправляем токен с категориями на сервер
    const saved = await savePushTokenToServer(token, selectedCategories);
    
    if (!saved) {
      showToast('⚠️ Підписка створена, але не вдалося зберегти. Спробуйте пізніше.', 'error');
      return false;
    }
    
    // 8. Сохраняем в localStorage
    localStorage.setItem('push_subscribed', '1');
    localStorage.setItem('push_token', token);
    localStorage.setItem('push_categories', JSON.stringify(selectedCategories));
    
    showToast(`✅ Підписано на ${selectedCategories.length} категорій!`, 'success');
    updatePushButtonState();
    return true;
    
  } catch (err) {
    console.error('Помилка підписки:', err);
    showToast('❌ Помилка: ' + (err.message || 'невідома'), 'error');
    return false;
  }
}

// Сохранить новые категории для уже подписанного юзера
async function savePushPreferences(newCategories) {
  const token = localStorage.getItem('push_token');
  if (!token) {
    showToast('❌ Токен не знайдено. Підпишіться спочатку.', 'error');
    return false;
  }

  // Если юзер снял ВСЕ галочки — это отписка
  if (!newCategories || newCategories.length === 0) {
    showUnsubscribeConfirm();
    return false;
  }

  const saved = await updateCategoriesOnServer(token, newCategories);
  if (saved) {
    localStorage.setItem('push_categories', JSON.stringify(newCategories));
    showToast(`✅ Збережено ${newCategories.length} категорій`, 'success');
    updatePushButtonState();
    return true;
  } else {
    showToast('❌ Не вдалося зберегти. Спробуйте пізніше.', 'error');
    return false;
  }
}

// Отписка от пушей
async function unsubscribeFromPush() {
  try {
    if (firebaseMessaging) {
      const token = localStorage.getItem('push_token');
      if (token) {
        await firebaseMessaging.deleteToken();
      }
    }
    localStorage.removeItem('push_subscribed');
    localStorage.removeItem('push_token');
    localStorage.removeItem('push_categories');
    showToast('🔕 Ви відписалися від сповіщень', 'info');
    updatePushButtonState();
  } catch (err) {
    console.error('Помилка відписки:', err);
    // Всё равно убираем локально
    localStorage.removeItem('push_subscribed');
    localStorage.removeItem('push_token');
    localStorage.removeItem('push_categories');
    updatePushButtonState();
  }
}

// Обновляем текст кнопки в зависимости от статуса
function updatePushButtonState() {
  const btn = document.getElementById('push-subscribe-btn');
  if (!btn) return;
  
  const isSubscribed = localStorage.getItem('push_subscribed') === '1';
  const permission = ('Notification' in window) ? Notification.permission : 'default';
  
  if (isSubscribed && permission === 'granted') {
    const cats = getCurrentCategories();
    btn.innerHTML = `<div style="font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); line-height: 1.3;">🔔 Підписано: ${cats.length} категорій<br><span style="font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 500;">Натисніть щоб налаштувати</span></div>`;
    btn.style.border = '1px solid rgba(0, 255, 156, 0.5)';
    btn.style.background = 'rgba(0, 255, 156, 0.1)';
  } else if (permission === 'denied') {
    btn.innerHTML = '<div style="font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); line-height: 1.3;">🔕 Сповіщення заблоковано<br><span style="font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 500;">Дозвольте у налаштуваннях браузера</span></div>';
    btn.style.border = '1px solid rgba(255, 77, 77, 0.4)';
    btn.style.background = 'rgba(255, 77, 77, 0.05)';
  } else {
    btn.innerHTML = '<div style="font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); line-height: 1.3;">🔔 Отримувати важливі сповіщення<br><span style="font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 500;">Світло, ЗСУ, новини міста</span></div>';
    btn.style.border = '1px solid rgba(255, 204, 0, 0.4)';
    btn.style.background = 'rgba(255, 204, 0, 0.05)';
  }
}

// Обработчик клика по кнопке подписки
function handlePushButtonClick() {
  const isSubscribed = localStorage.getItem('push_subscribed') === '1';
  
  if (isSubscribed) {
    // Уже подписан — показываем модалку настроек
    showSettingsModal();
  } else {
    // Не подписан — показываем модалку выбора категорий
    // (працює на всіх пристроях; обмеження iOS Chrome покажемо вже на спробі підписки)
    showCategoriesModal('subscribe');
  }
}

// =========================================================================
// УНІВЕРСАЛЬНА МОДАЛКА З КАТЕГОРІЯМИ
// mode: 'subscribe' (для новых) або 'edit' (для уже подписанных)
// =========================================================================
function showCategoriesModal(mode) {
  const modalId = 'push-cats-modal';
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();

  const isSubscribeMode = mode === 'subscribe';
  // При первой подписке — дефолтные категории, при редактировании — текущие выбранные
  const initialCats = isSubscribeMode ? getDefaultCategories() : getCurrentCategories();

  // Группируем категории
  const groups = {};
  PUSH_CATEGORIES.forEach(cat => {
    if (!groups[cat.group]) groups[cat.group] = [];
    groups[cat.group].push(cat);
  });

  // Создаём HTML для каждой категории
  let groupsHTML = '';
  Object.keys(groups).forEach(groupName => {
    groupsHTML += `<div style="margin-bottom: 14px;">
      <div style="font-size: 11px; font-weight: 700; color: rgba(255,204,0,0.85); letter-spacing: 1px; margin-bottom: 8px; padding: 0 4px;">${escapeHTML(groupName)}</div>`;
    
    groups[groupName].forEach(cat => {
      const isChecked = initialCats.includes(cat.id);
      groupsHTML += `
        <label class="push-cat-row" data-cat-id="${escapeHTML(cat.id)}" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 5px; background: ${isChecked ? 'rgba(0,255,156,0.08)' : 'rgba(0,0,0,0.2)'}; border: 1px solid ${isChecked ? 'rgba(0,255,156,0.3)' : 'rgba(255,255,255,0.05)'}; border-radius: 10px; cursor: pointer; transition: all 0.2s ease; user-select: none;">
          <input type="checkbox" class="push-cat-cb" data-cat-id="${escapeHTML(cat.id)}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #00ff9c; cursor: pointer; flex-shrink: 0;">
          <span style="font-size: 18px; flex-shrink: 0;">${cat.icon}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13px; font-weight: 700; color: #fff; line-height: 1.2;">${escapeHTML(cat.name)}</div>
            <div style="font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 2px;">${escapeHTML(cat.desc)}</div>
          </div>
        </label>`;
    });
    groupsHTML += `</div>`;
  });

  const title = isSubscribeMode ? '🔔 Обери що тобі цікаво' : '⚙️ Налаштування сповіщень';
  const subtitle = isSubscribeMode 
    ? 'Ти отримуватимеш сповіщення лише по вибраних темах. Можна змінити будь-коли.'
    : 'Ти підписаний на сповіщення. Обери що отримувати:';
  const submitBtnText = isSubscribeMode ? '✅ Підписатись' : '💾 Зберегти зміни';

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'custom-modal-overlay active';
  modal.onclick = (e) => { if (e.target.id === modalId) { modal.remove(); document.body.style.overflow = ''; } };

  modal.innerHTML = `
    <div class="custom-modal-box" onclick="event.stopPropagation()" style="background: linear-gradient(145deg, rgba(20,30,50,0.97), rgba(10,15,30,0.99)); border: 1px solid rgba(255, 204, 0, 0.3); max-width: 420px; max-height: 90vh; display: flex; flex-direction: column; padding: 0;">
      
      <!-- Header (фиксированный) -->
      <div style="padding: 20px 22px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; position: relative;">
        <div class="close-modal-btn" onclick="document.getElementById('${modalId}').remove(); document.body.style.overflow = '';">&times;</div>
        <h3 class="form-title" style="color: #ffcc00; margin: 0 0 8px; padding-right: 30px; font-size: 18px;">${title}</h3>
        <div style="font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.4;">${subtitle}</div>
      </div>
      
      <!-- Scrollable body -->
      <div style="overflow-y: auto; padding: 14px 18px; flex: 1; -webkit-overflow-scrolling: touch;">
        ${groupsHTML}
        
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button type="button" id="cat-select-all" style="flex: 1; padding: 9px; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); border-radius: 10px; color: #38bdf8; font-size: 12px; font-weight: 700; cursor: pointer;">Обрати все</button>
          <button type="button" id="cat-clear-all" style="flex: 1; padding: 9px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 700; cursor: pointer;">Зняти все</button>
        </div>
      </div>
      
      <!-- Footer (фиксированный) -->
      <div style="padding: 14px 18px 18px; border-top: 1px solid rgba(255,255,255,0.08); flex-shrink: 0;">
        <div id="cat-counter" style="text-align: center; font-size: 11px; color: rgba(255,255,255,0.6); margin-bottom: 10px;">Обрано: <span id="cat-count">${initialCats.length}</span> з ${PUSH_CATEGORIES.length}</div>
        
        <button type="button" id="cat-submit-btn"
                style="width: 100%; padding: 14px; border: none; border-radius: 14px; background: linear-gradient(135deg, #ffcc00, #ff8800); color: #0b1d3a; font-weight: 800; font-size: 15px; cursor: pointer; box-shadow: 0 4px 15px rgba(255,204,0,0.3);">
          ${submitBtnText}
        </button>
        
        ${!isSubscribeMode ? `
          <button type="button" onclick="document.getElementById('${modalId}').remove(); document.body.style.overflow = ''; showUnsubscribeConfirm();" 
                  style="width: 100%; padding: 11px; margin-top: 8px; background: transparent; border: 1px solid rgba(255,77,77,0.3); border-radius: 14px; color: rgba(255,77,77,0.85); font-weight: 600; font-size: 12px; cursor: pointer;">
            🔕 Повністю відписатись
          </button>
        ` : `
          <button type="button" onclick="document.getElementById('${modalId}').remove(); document.body.style.overflow = '';" 
                  style="width: 100%; padding: 11px; margin-top: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; color: rgba(255,255,255,0.7); font-weight: 600; font-size: 12px; cursor: pointer;">
            Скасувати
          </button>
        `}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // === Логика чекбоксов ===
  const updateRowStyle = (row, checked) => {
    row.style.background = checked ? 'rgba(0,255,156,0.08)' : 'rgba(0,0,0,0.2)';
    row.style.borderColor = checked ? 'rgba(0,255,156,0.3)' : 'rgba(255,255,255,0.05)';
  };

  const updateCounter = () => {
    const checked = modal.querySelectorAll('.push-cat-cb:checked').length;
    const counter = modal.querySelector('#cat-count');
    if (counter) counter.textContent = checked;
  };

  // Подсветка строк при изменении галочки
  modal.querySelectorAll('.push-cat-cb').forEach(cb => {
    const row = cb.closest('.push-cat-row');
    cb.addEventListener('change', () => {
      updateRowStyle(row, cb.checked);
      updateCounter();
    });
  });

  // "Обрати все"
  modal.querySelector('#cat-select-all').addEventListener('click', () => {
    modal.querySelectorAll('.push-cat-cb').forEach(cb => {
      cb.checked = true;
      updateRowStyle(cb.closest('.push-cat-row'), true);
    });
    updateCounter();
  });

  // "Зняти все"
  modal.querySelector('#cat-clear-all').addEventListener('click', () => {
    modal.querySelectorAll('.push-cat-cb').forEach(cb => {
      cb.checked = false;
      updateRowStyle(cb.closest('.push-cat-row'), false);
    });
    updateCounter();
  });

  // Submit
  modal.querySelector('#cat-submit-btn').addEventListener('click', async () => {
    const selected = Array.from(modal.querySelectorAll('.push-cat-cb:checked'))
      .map(cb => cb.dataset.catId);
    
    if (selected.length === 0) {
      showToast('⚠️ Оберіть хоча б одну категорію', 'error');
      return;
    }

    // Блокуємо кнопку щоб не клікали 2 рази
    const btn = modal.querySelector('#cat-submit-btn');
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.innerHTML = '⏳ Обробка...';

    modal.remove();
    document.body.style.overflow = '';

    if (isSubscribeMode) {
      await subscribeToPush(selected);
    } else {
      await savePushPreferences(selected);
    }
  });
}

// Открыть настройки (для уже подписанных) — обёртка
function showSettingsModal() {
  showCategoriesModal('edit');
}

// Модалка подтверждения отписки
function showUnsubscribeConfirm() {
  const modalId = 'push-unsub-modal';
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'custom-modal-overlay active';
  modal.onclick = (e) => { if (e.target.id === modalId) { modal.remove(); document.body.style.overflow = ''; } };
  
  modal.innerHTML = `
    <div class="custom-modal-box" onclick="event.stopPropagation()" style="max-width: 360px;">
      <div class="close-modal-btn" onclick="document.getElementById('${modalId}').remove(); document.body.style.overflow = '';">&times;</div>
      <div style="text-align: center; font-size: 50px; margin-bottom: 10px;">🔕</div>
      <h3 class="form-title" style="color: #ff4d4d;">Відписатись від сповіщень?</h3>
      <div style="font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.5; margin-bottom: 20px; text-align: center;">
        Ви більше не будете отримувати жодних сповіщень. Можна підписатись знову коли захочете.
      </div>
      <button type="button" onclick="document.getElementById('${modalId}').remove(); document.body.style.overflow = ''; unsubscribeFromPush();" 
              style="width: 100%; padding: 14px; border: none; border-radius: 14px; background: linear-gradient(135deg, #ff4d4d, #ff3366); color: #fff; font-weight: 800; font-size: 14px; cursor: pointer;">
        Так, відписатись
      </button>
      <button type="button" onclick="document.getElementById('${modalId}').remove(); document.body.style.overflow = '';" 
              style="width: 100%; padding: 12px; margin-top: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; color: rgba(255,255,255,0.7); font-weight: 600; font-size: 13px; cursor: pointer;">
        Скасувати
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
}

// Инструкция для iPhone — как добавить на главный экран
function showIOSInstructions() {
  const modalId = 'push-ios-modal';
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'custom-modal-overlay active';
  modal.onclick = (e) => { if (e.target.id === modalId) { modal.remove(); document.body.style.overflow = ''; } };
  
  modal.innerHTML = `
    <div class="custom-modal-box" onclick="event.stopPropagation()" style="max-width: 400px;">
      <div class="close-modal-btn" onclick="document.getElementById('${modalId}').remove(); document.body.style.overflow = '';">&times;</div>
      
      <div style="text-align: center; font-size: 50px; margin-bottom: 5px;">🍎</div>
      <h3 class="form-title" style="color: #38bdf8; margin-bottom: 15px;">Інструкція для iPhone</h3>
      
      <div style="font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.5; margin-bottom: 18px; text-align: center;">
        Через обмеження Apple, сповіщення на iPhone працюють <b style="color:#ffcc00;">тільки якщо</b> ви додасте сайт на головний екран:
      </div>
      
      <div style="background: rgba(0,0,0,0.3); border-radius: 14px; padding: 16px; margin-bottom: 15px; border: 1px solid rgba(56,189,248,0.2);">
        <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13px; color: rgba(255,255,255,0.9); text-align: left;">
          
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: linear-gradient(135deg, #38bdf8, #2a5298); color: #fff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0;">1</div>
            <div style="line-height: 1.4;">Відкрийте сайт у браузері <b>Safari</b> (не Chrome!)</div>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: linear-gradient(135deg, #38bdf8, #2a5298); color: #fff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0;">2</div>
            <div style="line-height: 1.4;">Натисніть кнопку <b>«Поділитись»</b> внизу екрану <span style="display: inline-block; background: rgba(56,189,248,0.2); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 14px;">⬆</span></div>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: linear-gradient(135deg, #38bdf8, #2a5298); color: #fff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0;">3</div>
            <div style="line-height: 1.4;">Прокрутіть і виберіть <b>«На екран Домой»</b> (Add to Home Screen)</div>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: linear-gradient(135deg, #38bdf8, #2a5298); color: #fff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0;">4</div>
            <div style="line-height: 1.4;">Підтвердіть <b>«Додати»</b> — з'явиться іконка на екрані</div>
          </div>
          
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: linear-gradient(135deg, #00ff9c, #00b8ff); color: #0b1d3a; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0;">5</div>
            <div style="line-height: 1.4;"><b>Запустіть сайт з домашнього екрану</b> (не з Safari!) і знову натисніть «Сповіщення»</div>
          </div>
          
        </div>
      </div>
      
      <div style="font-size: 11px; color: rgba(255,255,255,0.5); line-height: 1.4; text-align: center; padding: 10px;">
        💡 Це обмеження Apple — у Android та десктопі усе працює одразу.
      </div>
      
      <button type="button" onclick="document.getElementById('${modalId}').remove(); document.body.style.overflow = '';" 
              style="width: 100%; padding: 14px; border: none; border-radius: 14px; background: linear-gradient(135deg, #38bdf8, #2a5298); color: #fff; font-weight: 800; font-size: 14px; cursor: pointer;">
        Зрозуміло 👌
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
}

// =========================================================================
// === КОНЕЦ PUSH-УВЕДОМЛЕНИЙ ===
// =========================================================================

const initApp = () => {
  updateDateTime(); setInterval(updateDateTime, 1000);
  try { const cached = parseInt(localStorage.getItem('events_active_count') || '0', 10); if (cached > 0) updateEventsTabBadge(cached); } catch(e) {}
  loadWeather(); loadAlerts(); loadExchangeRates();
  setTimeout(() => { loadTrainsData(); loadLongTrainsData(); loadBusesData(); loadEventsData(); loadTickerData(); }, 100);
  setTimeout(() => { 
      loadPromosData(); loadShopsData(); loadFleaMarketData(); loadEstateData(); loadLostFoundData(); loadBlaBlaCarData(); loadJobsData(); /* loadPhonebookData(); — тимчасово відключено (техобслуговування) */ loadGalleryData(); loadVolunteersData(); loadPhoenixData();
      setTimeout(showDailyVolunteerAlert, 1500); 
  }, 600);
  
  // Разнесённые интервалы автообновления вместо одного большого
  setInterval(refreshGroupA, 2 * 60 * 1000);  // каждые 2 минуты — важное
  setInterval(refreshGroupB, 5 * 60 * 1000);  // каждые 5 минут — основное
  setInterval(refreshGroupC, 8 * 60 * 1000);  // каждые 8 минут — редкое
  
  // Слежение за видимостью страницы — не обновляем фоновую вкладку
  document.addEventListener('visibilitychange', () => {
      isPageVisible = !document.hidden;
      // Если пользователь вернулся на вкладку после долгого отсутствия — обновляем сразу
      if (isPageVisible) {
          refreshGroupA();
      }
  });
  
  document.querySelectorAll('.form-input').forEach(input => { input.addEventListener('focus', function() { setTimeout(() => { this.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); }); });
  
  // === PUSH-УВЕДОМЛЕНИЯ: инициализация состояния кнопки ===
  setTimeout(() => {
    updatePushButtonState();
    // Если юзер уже подписан — тихо перерегистрируем SW чтобы он был активный
    if (localStorage.getItem('push_subscribed') === '1' && isPushSupported()) {
      registerFirebaseSW().catch(() => {});
    }
  }, 1000);
};

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }

// === PUSH SW регистрируется по запросу пользователя через subscribeToPush() ===
// Старый код который unregister-ил SW удалён — теперь firebase-messaging-sw.js
// активно используется для пушей. Регистрация делается лениво по клику.
