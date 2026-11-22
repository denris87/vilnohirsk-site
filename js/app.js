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

// Підпис останніх відрендерених даних по блоках: автооновлення перемальовує DOM
// лише коли дані реально змінилися — інакше кожні 2-5 хв закривались відкриті
// картки/деталі та скидались каруселі на перший слайд.
// isNewItem не входить у підпис: зняття позначки «Нове» — не привід перезбирати блок.
const lastRenderSig = {};
function dataChanged(key, data) {
    let sig = '';
    try { sig = JSON.stringify(data, (k, v) => k === 'isNewItem' ? undefined : v); } catch (e) { sig = 'x' + Date.now(); }
    if (lastRenderSig[key] === sig) return false;
    lastRenderSig[key] = sig;
    return true;
}

// Підпис ставиться ще до збірки HTML. Якщо збірка впаде з помилкою, блок
// вважатиметься «вже відрендереним» і автооновлення більше ніколи його не
// перемалює — розділ зависне зламаним до наступної зміни даних.
// Тому кожен catch завантажувача скидає свій підпис через цю функцію.
function invalidateRender(key) { delete lastRenderSig[key]; }

// Раніше половина catch-блоків мовчала: зламаний розділ виглядав просто
// порожнім, а в консолі не було ані рядка — причину не було де шукати.
function logSectionError(section, e) {
    try { console.error('[Смарт Вільногірськ] розділ «' + section + '»:', e); } catch (_) {}
}

// === БЕЗОПАСНОСТЬ И УТИЛИТЫ ===
function escapeHTML(str) {
    // Саме порівняння з null/undefined, а не «if (!str)»: інакше число 0 і false
    // перетворювались на порожній рядок (напр. «💺 Місць: » замість «💺 Місць: 0»).
    if (str === null || str === undefined || str === '') return '';
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

// Безпечне пакування даних в onclick-атрибут: encodeURIComponent не кодує апостроф,
// тому доекрануємо його вручну (інакше ' у даних розриває JS-рядок всередині атрибута)
function packForAttr(obj) {
    return encodeURIComponent(JSON.stringify(obj)).replace(/'/g, '%27');
}

// Телефон → клікабельне tel:-посилання; якщо цифр немає (напр. «Не вказано») —
// повертаємо просто текст, щоб не створювати порожній href="tel:"
function phoneLinkHtml(phone, cls, prefix) {
    const raw = String(phone == null ? '' : phone).trim();
    const clean = raw.replace(/[^0-9+]/g, '');
    const pre = prefix || '';
    if (clean.replace(/\D/g, '').length < 5) return pre + escapeHTML(raw || 'Не вказано');
    return `<a href="tel:${clean}" class="${cls || 'shop-phone-link'}">${pre}${escapeHTML(raw)}</a>`;
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

// Ключ картки для позначки «Нове». Беремо стабільні поля, а не весь об'єкт:
// інакше зміна суми збору чи статусу знову підсвічувала б стару картку.
function itemKey(item) {
    if (item == null) return '';
    if (typeof item !== 'object') return String(item).slice(0, 80);
    const pick = (names) => {
        for (const n of names) {
            if (item[n] != null && String(item[n]).trim() !== '') return String(item[n]).trim();
        }
        return '';
    };
    const main = pick(['title', 'name', 'number', 'url', 'photo', 'image', 'description']);
    const extra = pick(['date', 'date_missing', 'validUntil', 'phone', 'company', 'from']);
    const k = (main + '|' + extra).slice(0, 80);
    return k === '|' ? '' : k;
}

// Раніше «побачене» зберігалось як КІЛЬКІСТЬ карток. Через це прибрані й додані
// оголошення (довжина списку та сама) не позначались новими взагалі, а після
// скорочення списку лічильник назавжди лишався завищеним. Тепер зберігаємо самі
// ключі карток. Старий числовий формат мовчки мігрує при першому заході.
function readSeenSet(key) {
    let raw = null;
    try { raw = localStorage.getItem('seen_' + key); } catch (e) { return null; }
    if (raw === null || /^\d+$/.test(raw)) return null; // немає або старий формат
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? new Set(arr) : null;
    } catch (e) { return null; }
}
// Обмеження лише щоб не роздути localStorage на зіпсованих даних. Список
// перезаписується цілком (не накопичується), тому межа має бути свідомо вищою
// за будь-який реальний розділ: при 200 усе, що далі двохсотої картки,
// назавжди лишалося б позначеним «Нове».
const SEEN_KEYS_LIMIT = 2000;
function saveSeenSet(key, keys) {
    try { localStorage.setItem('seen_' + key, JSON.stringify((keys || []).slice(0, SEEN_KEYS_LIMIT))); } catch (e) {}
}

function markNewItems(array, key) {
    if (!array || !array.length) return array;
    const seen = readSeenSet(key);
    if (!seen) return array; // перший візит або міграція — нічого не підсвічуємо
    array.forEach(it => {
        if (!it || typeof it !== 'object') return;
        const k = itemKey(it);
        if (k && !seen.has(k)) it.isNewItem = true;
    });
    return array;
}

// Ведёт счётчик seen_<key> для пометок «Нове» на карточках.
// Красная точка на вкладках полностью убрана — здесь только бухгалтерия.
function checkNotification(key, dataArray) {
  const keys = (dataArray || []).map(itemKey).filter(Boolean);
  currentDataSignature[key] = keys;
  // Перший захід або старий числовий формат — просто запам'ятовуємо поточний стан
  if (readSeenSet(key) === null) saveSeenSet(key, keys);
}

// Людина відкрила розділ — усе, що там зараз, вважається побаченим
function clearNotification(key) {
  if (Array.isArray(currentDataSignature[key])) saveSeenSet(key, currentDataSignature[key]);
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

// Розділ не завантажився — показуємо чесне повідомлення з кнопкою повтору.
// Раніше при недоступному CDN розділ просто лишався порожнім назавжди:
// ні тексту, ні пояснення, людина дивилась на біле місце.
function showSectionFailure(containerId, loaderName, key) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="sec-fail">'
    + '<div class="sec-fail-ico">📡</div>'
    + '<div class="sec-fail-title">Не вдалося завантажити розділ</div>'
    + '<div class="sec-fail-sub">Схоже, зник інтернет або сервіс не відповідає.</div>'
    + '<button type="button" class="sec-fail-btn" onclick="retrySection(\'' + loaderName + '\', \'' + key + '\')">🔄 Спробувати ще раз</button>'
    + '</div>';
}

// Кнопка «Спробувати ще раз»: скидаємо лічильники очікування бібліотек,
// інакше вичерпаний лічильник одразу віддав би ту саму помилку.
function retrySection(loaderName, key) {
  if (key) { delete papaTries[key]; delete yamlTries[key]; }
  const fn = window[loaderName];
  if (typeof fn === 'function') { try { fn(); } catch (e) { logSectionError('повтор завантаження', e); } }
}

// Спільне очікування бібліотеки з CDN: поки вантажиться — тихо чекаємо,
// коли вичерпали спроби — віддаємо керування onGiveUp (показ помилки/ховання блока).
function libReady(store, key, isLoaded, retry, onGiveUp) {
  if (isLoaded()) { delete store[key]; return true; }
  const now = Date.now();
  const st = store[key];
  // Новий «сеанс» очікування, якщо попередній був давно (напр. автооновлення через 5 хв):
  // інакше вичерпаний лічильник назавжди заблокував би розділ, навіть коли CDN оживе.
  if (!st || now - st.last > 30000) store[key] = { n: 0, last: now };
  const s = store[key];
  s.last = now;
  if (s.n++ < 40) setTimeout(retry, 250); // ~10 секунд очікування на CDN
  else if (typeof onGiveUp === 'function') { try { onGiveUp(); } catch (e) { logSectionError('очікування бібліотеки', e); } }
  return false;
}

// PapaParse (розбір CSV) підключається з CDN.
const papaTries = {};
function papaReady(key, retry, onGiveUp) {
  return libReady(papaTries, key, () => typeof Papa !== 'undefined' && Papa && typeof Papa.parse === 'function', retry, onGiveUp);
}

// js-yaml (розбір data/*.yaml) — теж з CDN, поводимось так само.
const yamlTries = {};
function yamlReady(key, retry, onGiveUp) {
  return libReady(yamlTries, key, () => typeof jsyaml !== 'undefined' && jsyaml && typeof jsyaml.load === 'function', retry, onGiveUp);
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

let currentGallery = []; let currentGalleryIndex = 0; let windowEventImages = []; let currentVilnohirskPhotos = [];
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
    let html = '<div style="text-align: center; margin-bottom: 12px; font-size: 11px; color: rgba(255,255,255,0.7); font-weight: 600;">Маєте круті фото нашого міста? Надсилайте: <a href="https://t.me/vilnohirsk" target="_blank" rel="noopener" style="color: var(--time-green); text-decoration: none; font-weight: 800;">@vilnohirsk</a></div><div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; padding: 5px;">';
    photos.forEach((item, i) => {
        const url = typeof item === 'string' ? item : item.url; const author = typeof item === 'object' && item.author ? item.author : '';
        const dotHtml = item.isNewItem ? '<div style="position:absolute; top:8px; right:8px; width:10px; height:10px; border-radius:50%; background:#ff3366; box-shadow:0 0 10px #ff3366; animation:pulseAlert 2s infinite; z-index:10;" title="Нове"></div>' : '';
        html += `<div style="aspect-ratio:1/1; border-radius:14px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.2); cursor:pointer; border:1px solid rgba(255,255,255,0.1); position:relative; background:rgba(255,255,255,0.05);" onclick="openImageModal(currentVilnohirskPhotos, ${i}, event)"><img alt="Фото міста" src="${escapeHTML(url)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="width:100%; height:100%; object-fit:cover; opacity:0; transition:opacity 0.3s ease;">${dotHtml}${author ? `<div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding:20px 8px 8px 8px; font-size:10px; font-weight:700; color:rgba(255,255,255,0.9); text-align:left; text-shadow:0 1px 2px rgba(0,0,0,0.8); pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📸 ${escapeHTML(author)}</div>` : ''}</div>`;
    });
    container.innerHTML = html + '</div>';
}

async function loadGalleryData() {
  try { 
      const photos = await fetchCachedJson(`https://vilnohirsk-photos-production.up.railway.app/api/photos`, 'gallery_api', 5);
      markNewItems(photos, 'gallery');
      checkNotification('gallery', photos);
      if (dataChanged('render_gallery', photos)) renderGallery(photos);
  } catch(e) {
      logSectionError('фото міста', e); invalidateRender('render_gallery');
      const gc = document.getElementById('gallery-list-content');
      if (gc) gc.innerHTML = '<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження фотографій</div>';
  }
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
        // Без цього обробника промис завис би назавжди на пошкодженому/непідтримуваному файлі (напр. HEIC)
        img.onerror = () => reject(new Error('Не вдалося обробити фото. Спробуйте інший файл (JPG або PNG).'));
    }; reader.onerror = error => reject(error);
});

async function submitGenericForm(event, formId, modalId, btnId, type, maxPhotos) {
  event.preventDefault(); if (cabBlockedSubmit() || !validateCaptcha(formId)) return;
  const btn = document.getElementById(btnId); const origText = btn.innerText; btn.innerText = maxPhotos ? 'Обробка фото...' : 'Відправка...'; btn.disabled = true; btn.style.opacity = '0.7';
  try {
    const form = document.getElementById(formId); const formData = new FormData(form); const sheetData = { formType: type };
    
    for (let [key, val] of formData.entries()) { 
        if (key !== 'photos') {
            let finalVal = val;
            if (key === 'phone' && val !== '+380') finalVal = "'" + val;
            if (type === 'estate' && key === 'price' && val) finalVal = val + ' ' + estateCurrency(formData.get('dealType'));
            sheetData[key] = finalVal;
        }
    }
    
    if (maxPhotos > 0) {
      const photos = form.querySelector('input[name="photos"]').files; if (photos.length > maxPhotos) throw new Error(`Максимум ${maxPhotos} фото!`);
      let b64 = []; for (let i = 0; i < photos.length; i++) b64.push(await compressAndGetBase64(photos[i])); sheetData.photosBase64 = b64;
    }
    // Є вхід у кабінет (бета) — додаємо токен: оголошення з'явиться в «Моїх оголошеннях» зі статусом модерації
    const idToken = await cabAdsToken(); if (idToken) sheetData.idToken = idToken;
    btn.innerText = 'Збереження...';
    await fetch(APP_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(sheetData) });
    showToast(idToken ? '✅ Відправлено! Статус — у «Моїх оголошеннях»' : '✅ Успішно відправлено на модерацію!', 'success');
    closeModalForm(null, modalId); form.reset(); setupCaptcha(formId);
    if (type === 'estate') { syncEstatePrice(); orendaKick(); }
    if (idToken) cabAdsChanged();
  } catch (e) { showToast('❌ Помилка: ' + e.message, 'error'); } finally { btn.innerText = origText; btn.disabled = false; btn.style.opacity = '1'; }
}

// Нерухомість: оренда — у гривнях, продаж — у доларах (підпис поля «Ціна» міняється разом з угодою)
function estateCurrency(deal) { return /продаж/i.test(String(deal || '')) ? '$' : 'грн'; }
function syncEstatePrice() {
  const form = document.getElementById('custom-estate-form'), label = document.getElementById('estate-price-label');
  if (!form || !label) return;
  const cur = estateCurrency(form.elements.dealType && form.elements.dealType.value);
  label.textContent = `Ціна (${cur})`;
  if (form.elements.price) form.elements.price.placeholder = cur === '$' ? '15000' : '5000';
}
// Оголошення нерухомості щойно збережено — просимо скрипт одразу опублікувати його в Telegram-чаті
// @vilnohirsk_orenda (якщо його схвалила перевірка). Не вийшло — за кілька хвилин це зробить сам скрипт.
function orendaKick() {
  try {
    fetch(APP_SCRIPT_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ formType: 'orenda_sync' }) }).catch(() => {});
  } catch (e) {}
}

const UA_MONTHS_NOM = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const UA_WEEKDAYS_FULL = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
const UA_MONTHS_IN = ['у січні', 'у лютому', 'у березні', 'у квітні', 'у травні', 'у червні', 'у липні', 'у серпні', 'у вересні', 'у жовтні', 'у листопаді', 'у грудні'];
// Дата поїздки: число 1…31 і місяць січень…грудень (поточний обрано одразу). Року немає — він підставляється сам:
// місяць, що цього року вже минув, — наступний рік. Значення для сервера — у прихованому #input-date (РРРР-ММ-ДД).
function fillRideDate() {
  const dSel = document.getElementById('input-day'), mSel = document.getElementById('input-month');
  if (!dSel || !mSel) return;
  let days = '<option value="">Число</option>';
  for (let d = 1; d <= 31; d++) days += `<option value="${d}">${d}</option>`;
  dSel.innerHTML = days;
  mSel.innerHTML = '<option value="">Місяць</option>' + UA_MONTHS_NOM.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
  mSel.value = String(Number(getKyivDateISO().split('-')[1]));
  syncRideDate();
}
function syncRideDate() {
  const dSel = document.getElementById('input-day'), mSel = document.getElementById('input-month');
  const out = document.getElementById('input-date'), hint = document.getElementById('input-date-hint');
  if (!dSel || !mSel || !out) return;
  const today = getKyivDateISO(), [ty, tm, td] = today.split('-').map(Number);
  const d = Number(dSel.value), m = Number(mSel.value), pad = (n) => String(n).padStart(2, '0');
  let msg = '', bad = false;
  out.value = '';
  if (d && m) {
    const y = m > tm || (m === tm && d >= td) ? ty : m < tm ? ty + 1 : ty;
    const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > inMonth) { bad = true; msg = `Такої дати немає: ${UA_MONTHS_IN[m - 1]} ${inMonth} ${pluralUk(inMonth, 'день', 'дні', 'днів')}`; }
    else if (m === tm && d < td) { bad = true; msg = 'Ця дата вже минула'; }
    else {
      out.value = `${y}-${pad(m)}-${pad(d)}`;
      const wd = UA_WEEKDAYS_FULL[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      const tomorrow = new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);
      msg = out.value === today ? `Сьогодні, ${wd}` : out.value === tomorrow ? `Завтра, ${wd}` : wd.charAt(0).toUpperCase() + wd.slice(1);
      if (y > ty) msg += `, ${y} рік`;
    }
  }
  dSel.setCustomValidity(bad ? msg : ''); // браузер не дасть відправити форму з такою датою
  if (hint) { hint.textContent = msg; hint.classList.toggle('bad', bad); }
}
// Час кожні 30 хвилин: 00:00 … 23:30; after — лише пізніший за нього (для «до»)
function rideTimeOptions(after) {
  let html = '<option value="">--:--</option>';
  for (let h = 0; h < 24; h++) for (const mm of ['00', '30']) {
    const t = String(h).padStart(2, '0') + ':' + mm;
    if (!after || t > after) html += `<option value="${t}">${t}</option>`;
  }
  return html;
}
function fillRideTimes() {
  const from = document.getElementById('input-time-from');
  if (!from || from.tagName !== 'SELECT') return;
  from.innerHTML = rideTimeOptions();
  syncRideTimeTo();
}
// «до» — лише після «з»; обране раніше «до» лишаємо, якщо воно ще підходить
function syncRideTimeTo() {
  const from = document.getElementById('input-time-from'), to = document.getElementById('input-time-to');
  if (!from || !to || to.tagName !== 'SELECT') return;
  const keep = to.value;
  to.innerHTML = rideTimeOptions(from.value);
  if (keep && (!from.value || keep > from.value)) to.value = keep;
}

function openModalForm(formId, modalId) {
  if (modalId) {
    const form = document.getElementById(formId); if(form) form.reset(); if(formId) setupCaptcha(formId);
    // Не даємо вибрати минулу дату (поїздка BlaBlaCar, термін дії акції тощо)
    if (form) form.querySelectorAll('input[type="date"]').forEach(d => { d.min = getKyivDateISO(); });
    // Попутки: дата — число й місяць зі списків (рік підставляється сам), час — лише :00 і :30
    if (formId === 'custom-blabla-form') { fillRideDate(); fillRideTimes(); }
    if (formId === 'custom-estate-form') syncEstatePrice();
    if (form) cabFillForm(form); // ім'я й телефон з «Моїх даних» у кабінеті — у порожні поля
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

document.addEventListener('click', function(e) {
  if (e.target.closest('.image-modal') || e.target.closest('.custom-modal-box')) return;
  if (e.target.closest('.section-bar')) return; // шапка розділу, відкритого з плитки, — свої кнопки
  if (e.target.closest('#cabinet')) return; // кабінет — свої кнопки («Відкрити довідник» відкриває розділ — не закривати його тут же)
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

let cityMapInstance = null;
let cityMapTries = 0;
function initCityMap() {
  const el = document.getElementById('city-map');
  if (!el) return;
  if (typeof L === 'undefined') { // Leaflet ще не завантажився — почекаємо, але не вічно
    if (cityMapTries++ < 40) { setTimeout(initCityMap, 250); return; }
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px;color:rgba(255,255,255,0.7);font-size:13px;font-weight:600;">Не вдалося завантажити карту 😕<br>Перевірте інтернет та оновіть сторінку.</div>';
    return;
  }
  if (cityMapInstance) { setTimeout(() => cityMapInstance.invalidateSize(), 50); return; }
  const VILNOHIRSK = [48.4790, 34.0180];
  cityMapInstance = L.map(el, { center: VILNOHIRSK, zoom: 14, scrollWheelZoom: true, attributionControl: true });

  // Базовий шар «Карта» (світлі тайли CARTO Voyager) з фолбеком на стандартний OSM
  let fellBack = false;
  const mapLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });
  mapLayer.on('tileerror', function() {
    if (fellBack) return;
    fellBack = true;
    cityMapInstance.removeLayer(mapLayer);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(cityMapInstance);
  });

  // Базовий шар «Супутник» (Esri World Imagery — безкоштовно, без ключа)
  const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics'
  });

  mapLayer.addTo(cityMapInstance);

  // Компактний сегментний перемикач Карта / Супутник
  const SwitchControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function() {
      const box = L.DomUtil.create('div', 'map-basemap-switch');
      box.innerHTML = '<button type="button" class="map-bm-btn active" data-layer="map">🗺 Карта</button>'
                    + '<button type="button" class="map-bm-btn" data-layer="sat">🛰 Супутник</button>';
      L.DomEvent.disableClickPropagation(box);
      box.querySelectorAll('.map-bm-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const isSat = btn.dataset.layer === 'sat';
          if (isSat) { cityMapInstance.removeLayer(mapLayer); satLayer.addTo(cityMapInstance); }
          else { cityMapInstance.removeLayer(satLayer); mapLayer.addTo(cityMapInstance); }
          box.querySelectorAll('.map-bm-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
      return box;
    }
  });
  cityMapInstance.addControl(new SwitchControl());

  // Карта могла ініціалізуватись у прихованому контейнері — перерахуємо розмір
  setTimeout(() => cityMapInstance.invalidateSize(), 60);
  setTimeout(() => cityMapInstance.invalidateSize(), 400);
  loadMapPlaces();
}

// Шари міток за категоріями + панель фільтрів. Дані — data/places.yaml
// Структура: categories: [ { id, name, icon, color, show, places: [ { name, lat, lng, address, phone, show } ] } ]
let cityMapLayers = {};
async function loadMapPlaces() {
  // YAML-парсер підключений з defer і може ще не завантажитись — трохи зачекаємо
  if (!yamlReady('places', loadMapPlaces, () => logSectionError('карта міста', new Error('js-yaml не завантажився')))) return;
  try {
    const res = await fetch('./data/places.yaml?v=' + Date.now());
    if (!res.ok) return;
    const data = jsyaml.load(await res.text()) || {};
    const cats = Array.isArray(data.categories) ? data.categories : [];

    cityMapLayers = {};
    const visibleCats = []; // лише категорії з видимими точками — для панелі фільтрів

    cats.forEach(c => {
      // show: false у категорії — ховаємо весь блок
      if (!c || !c.id || c.show === false) return;
      // show: false у точці — ховаємо окрему мітку; пропускаємо точки без координат
      const places = (Array.isArray(c.places) ? c.places : []).filter(p =>
        p && p.show !== false && typeof p.lat === 'number' && typeof p.lng === 'number');
      if (!places.length) return; // порожню категорію не показуємо

      const layer = L.layerGroup().addTo(cityMapInstance);
      cityMapLayers[c.id] = layer;
      const color = c.color || '#38bdf8';
      const emoji = c.icon || '📍';

      places.forEach(p => {
        const icon = L.divIcon({
          className: 'map-pin',
          html: `<div class="map-pin-inner" style="background:${color};"><span>${emoji}</span></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
          popupAnchor: [0, -28]
        });
        const popup = `<div class="map-popup"><div class="map-popup-title">${escapeHTML(p.name || '')}</div>`
          + (p.address ? `<div class="map-popup-addr">📍 ${escapeHTML(p.address)}</div>` : '')
          + (p.phone ? `<div class="map-popup-addr">📞 <a href="tel:${String(p.phone).replace(/[^0-9+]/g,'')}">${escapeHTML(p.phone)}</a></div>` : '')
          + `</div>`;
        L.marker([p.lat, p.lng], { icon }).bindPopup(popup).addTo(layer);
      });

      visibleCats.push(c);
    });

    buildMapFilters(visibleCats);
  } catch (e) { logSectionError('карта міста', e); }
}

function buildMapFilters(cats) {
  const host = document.getElementById('map-filters');
  if (!host || !cats.length) return;
  // id підставляється в onclick, колір — у CSS-змінну: апостроф чи стороннє
  // значення у файлі раніше зламали б кнопку. Пропускаємо тільки безпечне.
  host.innerHTML = cats.map(c => {
    const id = String(c.id || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!id) return '';
    const color = /^#[0-9a-f]{3,8}$/i.test(String(c.color || '')) ? c.color : '#38bdf8';
    return `<button class="map-filter-btn active" data-cat="${id}" style="--fc:${color};" onclick="toggleMapCategory('${id}', this)">${escapeHTML(c.icon || '')} ${escapeHTML(c.name)}</button>`;
  }).join('');
}

function toggleMapCategory(catId, btn) {
  const layer = cityMapLayers[catId];
  if (!layer || !cityMapInstance) return;
  if (cityMapInstance.hasLayer(layer)) {
    cityMapInstance.removeLayer(layer);
    btn.classList.remove('active');
  } else {
    cityMapInstance.addLayer(layer);
    btn.classList.add('active');
  }
}

function switchAppTab(tabId, btn, group) {
  closeAllShopDropdowns();
  // Значення може бути списком: у вкладці «Новини та комунальний інформер»
  // лежать два потоки — комунальні й новини. Раніше знімався лише перший,
  // і червона позначка «Нове» на новинах не гасла ніколи.
  const notifs = {'alert-feed':['communal','news'], 'alert-events':'events', 'alert-gallery':'gallery', 'alert-volunteers':'volunteers', 'alert-promos':'promos', 'alert-phoenix':'phoenix', 'blablacar':'blablacar', 'trains':'trains', 'estate-tab':'estate', 'shopping-tab':'shopping', 'flea-market-tab':'flea', 'lost-found-tab':'lost', 'jobs-tab':'jobs', 'city-guide-tab':'guide'};
  const notifKeys = notifs[tabId];
  if (notifKeys) (Array.isArray(notifKeys) ? notifKeys : [notifKeys]).forEach(clearNotification);
  const drawers = { alert: 'alert-drawer', schedule: 'main-list-widget', market: 'market-drawer' };
  if (btn.classList.contains('active')) { btn.classList.remove('active'); const groupDrawer = document.getElementById(drawers[group]); if(groupDrawer) groupDrawer.classList.remove('open'); return; }
  document.querySelectorAll('.main-list-widget, .shopping-drawer, .alert-drawer').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.tab-btn, .tab-alert').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const drawer = document.getElementById(drawers[group]);
  if (drawer) { drawer.classList.remove('drawer-events', 'drawer-communal'); if(tabId === 'alert-events') drawer.classList.add('drawer-events'); if(tabId === 'alert-feed') drawer.classList.add('drawer-communal'); drawer.classList.add('open'); }
  btn.classList.add('active'); const targetSection = document.getElementById(tabId); if (targetSection) targetSection.classList.add('active');
  if (tabId === 'alert-volunteers') { try { loadVolunteersData({forceRefresh: true}); } catch(e) { logSectionError('збори ЗСУ', e); } }
  if (tabId === 'map-tab') { try { initCityMap(); } catch(e) { logSectionError('карта міста', e); } }
  window.dataLayer = window.dataLayer || []; window.dataLayer.push({ 'event': 'tab_view', 'tab_name': tabId, 'tab_group': group });
}

// ===== ГОЛОВНА ПЛИТКАМИ («бенто») =====
// Поки що попередній перегляд: працює лише з класом html.tiles-mode (?tiles=1 в адресі вмикає
// й запам'ятовує, ?tiles=0 вимикає — див. скрипт у <head>). Плитки відкривають ті самі розділи,
// що й старі вкладки (switchAppTab), але окремим екраном із шапкою «Назад».
const TILE_TITLES = {
  'alert-feed': 'Новини та комунальний інформер', 'alert-events': 'Афіші', 'alert-gallery': 'Фото міста',
  'alert-volunteers': 'Допомога ЗСУ', 'alert-promos': 'Акції', 'alert-phoenix': 'ФЕНІКС · розшук',
  'trains': 'Електрички', 'long-trains': 'Потяги', 'buses': 'Автобуси', 'blablacar': 'Попутники', 'map-tab': 'Карта міста',
  'city-guide-tab': 'Міський довідник', 'estate-tab': 'Нерухомість', 'shopping-tab': 'Шопінг', 'flea-market-tab': 'Барахолка',
  'jobs-tab': 'Вакансії', 'lost-found-tab': 'Знахідки', 'garbage-tab': 'Вивіз сміття'
};
let trainsDelaysKnown = false;   // поки затримки не завантажились, плитка не пише «Без затримок»
let trainsTileList = null;       // рейси для плитки «Електрички» — ті самі, що в розкладі
let trainsTileDelays = {};       // номер рейсу (лише цифри) → затримка в хвилинах
let svitloTileState = null;      // графік світла для плитки (null — вимкнено чи не завантажився)

function tileSourceTab(tabId) {
  return document.querySelector(`.tab-btn[onclick*="'${tabId}'"], .tab-alert[onclick*="'${tabId}'"]`);
}

function openTileSection(tabId, group, ev) {
  if (ev) ev.stopPropagation(); // інакше загальний обробник кліків одразу закрив би шторку: клік поза групою
  const tab = tileSourceTab(tabId);
  if (!tab) return;
  if (!tab.classList.contains('active')) switchAppTab(tabId, tab, group);
  const title = document.getElementById('section-bar-title');
  if (title) title.textContent = TILE_TITLES[tabId] || '';
  const root = document.documentElement;
  if (!root.classList.contains('section-open')) {
    root.classList.add('section-open');
    // Окремий крок в історії: системна кнопка «Назад» (і в застосунку з Google Play) закриє розділ, а не сайт
    try { history.pushState({ tileSection: tabId }, ''); } catch (e) {}
  }
  const drawer = document.querySelector('.alert-drawer.open, .main-list-widget.open, .shopping-drawer.open');
  if (drawer) drawer.scrollTop = 0;
}

function closeTileSection(fromHistory) {
  const root = document.documentElement;
  if (!root.classList.contains('section-open')) return;
  // Кнопка «Назад» на екрані — це крок назад в історії; закриє вже обробник popstate
  if (!fromHistory && history.state && history.state.tileSection) { history.back(); return; }
  root.classList.remove('section-open', 'cabinet-open');
  document.querySelectorAll('.main-list-widget, .shopping-drawer, .alert-drawer').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.tab-btn, .tab-alert').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
}
window.addEventListener('popstate', (e) => {
  // У кабінеті «Назад» повертає з підекрана («Сповіщення», «Мої оголошення») на головний екран кабінету
  const st = e.state || {};
  const root = document.documentElement;
  if (root.classList.contains('cabinet-open') && st.tileSection === 'cabinet') { cabShowView(st.sub || 'home', true); return; }
  // Розділ відкрили з кабінету (напр. «Відкрити довідник» з «Обраного») — «Назад» повертає в кабінет, на той самий екран
  if (st.tileSection === 'cabinet' && root.classList.contains('section-open')) {
    closeTileSection(true); root.classList.add('section-open', 'cabinet-open'); cabShowView(st.sub || 'home', true); return;
  }
  closeTileSection(true);
});

function tileAction(action, ev) {
  if (ev) ev.stopPropagation();
  if (action === 'svitlo') {
    if (svitloTileState) openSvitloModal(); else showToast('Графік відключень зараз не публікується', 'info');
  } else if (action === 'admins') openModalForm('custom-feedback-form', 'feedback-modal');
  else if (action === 'donate') openModalForm(null, 'donate-modal');
}

// Плитка «Світло»: стан і черги з відключеннями — з того самого svitlo.yaml.
// На телефоні — стан своєї черги, «через …» і мініграфік доби; на широкому екрані праворуч ще й усі черги.
function renderSvitloTile(state) {
  svitloTileState = state || null;
  cabMineRefresh(); // відкритий кабінет: «Мій день» — за тим самим станом
  const st = document.getElementById('th-svitlo-status'), chips = document.getElementById('th-svitlo-chips');
  if (!st || !chips) return;
  const put = (id, html) => { const el = document.getElementById(id); if (el && el.dataset.v !== html) { el.dataset.v = html; el.innerHTML = html; } };
  const tile = document.getElementById('th-svitlo'), badges = document.getElementById('th-svitlo-badges');
  const unseen = state ? svitloUnseen(state, getSvitloSeen()) : null;
  if (tile) tile.classList.toggle('th-svitlo-new', !!unseen);
  if (badges) {
    const b = !unseen ? '' : unseen.kind === 'new' ? tileBadge('Новий<span class="th-pill-more"> графік</span>', 'Вийшов новий графік відключень', 'th-pill-word') : tileBadge('Оновлено', 'Графік відключень оновили', 'th-pill-word');
    if (badges.dataset.v !== b) { badges.dataset.v = b; badges.innerHTML = b; }
  }
  if (!state) { st.textContent = 'Графік відключень'; st.className = 'th-st'; chips.innerHTML = ''; put('th-svitlo-sub', ''); put('th-svitlo-compact', ''); put('th-svitlo-side', ''); return; }
  // Живий стан — за сьогоднішнім графіком, навіть коли вже вийшов завтрашній
  const live = svitloTodayData() || state, nextDay = svitloNextData();
  const off = svitloDayOffset(live.updated), now = (off == null || off === 0) ? svitloNowMin() : null;
  const nst = nextDay ? svitloNextState(nextDay) : null;
  const tmr = nextDay ? svitloNextText(nst) : '';
  // Обрана своя черга — її стан і найближчі відключення
  const my = svitloMyQueue(live);
  const qs = my ? svitloQueueState(my.slots, off) : null;
  put('th-svitlo-side', svitloTileSide(live, my, now, off, tmr));
  if (qs && qs.kind !== 'stale') {
    const t = svitloStateText(qs, live.updated);
    st.textContent = t.short;
    st.className = 'th-st' + (t.cls === 'off' ? ' th-bad' : (t.cls === 'on' || t.cls === 'ok') ? ' th-ok' : '');
    put('th-svitlo-sub', qs.kind === 'off' || qs.kind === 'on' ? `ще ${svitloDur(qs.left)}` : escapeHTML(tmr));
    const subEl = document.getElementById('th-svitlo-sub'); if (subEl) subEl.classList.remove('th-wide-only');
    put('th-svitlo-compact', qs.kind === 'unknown' ? '' : svitloMiniBar(qs.merged, now));
    const next = qs.merged.filter(r => qs.now == null || r[0] > qs.now).slice(0, 2);
    const tmrChip = !next.length && nst && nst.kind === 'ahead' ? `<span>завтра з ${svitloClock(nst.first)}</span>` : ''; // сьогодні вже все — показати завтрашнє
    chips.innerHTML = `<span class="th-chip-q">Черга ${escapeHTML(my.queue)}</span>` + next.map(r => `<span>${svitloClock(r[0])}–${svitloClock(r[1])}</span>`).join('') + tmrChip;
    return;
  }
  // Без обраної черги: на телефоні — шкала доби кожної черги (зелене — є світло); «оновлено о …» — лише на широкому
  const qrows = (off != null && off < 0) || live.noOutages ? [] : (live.providers || []).flatMap(p => (Array.isArray(p.queues) ? p.queues : []).filter(q => q && q.queue != null).map(q => {
    const s = svitloQueueState((Array.isArray(q.slots) ? q.slots : []).filter(Boolean), off);
    return `<span class="th-qc"><b style="color:${svitloColor(p)}">${escapeHTML(String(q.queue))}</b>${s.kind === 'unknown' ? '<span class="th-q-na">час — у вікні</span>' : svitloMiniBar(s.merged, now)}</span>`;
  })).slice(0, 4);
  put('th-svitlo-compact', qrows.join(''));
  put('th-svitlo-sub', live.revised ? `оновлено о ${escapeHTML(svitloRevShort(live.revised, live.updated))}` : '');
  const subEl = document.getElementById('th-svitlo-sub'); if (subEl) subEl.classList.toggle('th-wide-only', qrows.length > 0);
  const m = String(live.updated || '').match(/(\d{1,2})\.(\d{1,2})/);
  // Дата — окремим елементом: на зовсім вузьких телефонах вона ховається, щоб стан не переносився на другий рядок
  const day = m ? `<span class="th-st-day"> · ${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}</span>` : '';
  if (live.noOutages) { st.innerHTML = 'Відключень немає' + day; st.className = 'th-st th-ok'; chips.innerHTML = ''; return; }
  st.innerHTML = 'Є відключення' + day; st.className = 'th-st';
  if (qrows.length) { chips.innerHTML = ''; return; } // черги вже видно шкалами
  const queues = [];
  (live.providers || []).forEach(p => (Array.isArray(p.queues) ? p.queues : []).forEach(q => {
    if (q && q.queue != null && Array.isArray(q.slots) && q.slots.filter(Boolean).length) queues.push(String(q.queue));
  }));
  chips.innerHTML = queues.map(q => `<span>${escapeHTML(q)}</span>`).join('');
}
// Права половина широкої плитки: кожна черга зі шкалою доби (зелене — є світло) і станом зараз
function svitloTileSide(d, my, now, off, tmr) {
  if (off != null && off < 0) return `<span class="th-side-h">Графік на ${svitloDdMm(d.updated)}</span><span class="th-side-f">⏳ Новий графік ще не опублікували</span>`;
  const head = off === 0 || off == null ? 'Черги сьогодні' : off === 1 ? 'Черги на завтра' : `Черги на ${svitloDdMm(d.updated)}`;
  const rows = [];
  d.providers.forEach(p => (Array.isArray(p.queues) ? p.queues : []).forEach(q => {
    if (!q || q.queue == null) return;
    const s = svitloQueueState((Array.isArray(q.slots) ? q.slots : []).filter(Boolean), off);
    let txt = '', cls = '';
    if (s.kind === 'off') { txt = `немає до ${svitloClock(s.until)}`; cls = 'off'; }
    else if (s.kind === 'on') { txt = `є до ${svitloClock(s.next)}`; cls = 'on'; }
    else if (s.kind === 'done') { txt = 'є до 24:00'; cls = 'on'; }
    else if (s.kind === 'clear') { txt = 'без відключень'; cls = 'on'; }
    else if (s.kind === 'ahead') txt = `з ${svitloClock(s.first)}`;
    else txt = 'є відключення';
    const bar = s.kind === 'unknown' ? '<span class="th-q-na">час — у вікні</span>' : svitloMiniBar(s.merged, now);
    const mine = !!my && my.id === svitloQueueId(p, q);
    rows.push(`<span class="th-q${mine ? ' th-q-mine' : ''}"><b style="color:${svitloColor(p)}">${escapeHTML(String(q.queue))}</b>${bar}<span class="th-q-st ${cls}">${txt}</span></span>`);
  }));
  const foot = tmr ? `🗓️ ${tmr}` : d.revised ? `🔄 Оновлено о ${svitloRevShort(d.revised, d.updated)}` : '';
  return `<span class="th-side-h">${head}</span>${rows.slice(0, 5).join('')}${foot ? `<span class="th-side-f">${escapeHTML(foot)}</span>` : ''}`;
}

// Значки на плитках — однакові: «пігулка» в кольорі плитки з числом або коротким словом, без миготіння.
// Дані — з бейджів старих вкладок (їх і далі оновлюють ті самі функції), а вигляд свій:
// на малій плитці лише загальне число (з типами значок налазив би на іконку), на широкій — ще й іконки типів
function tileBadge(inner, label, cls) {
  return `<span class="th-pill${cls ? ' ' + cls : ''}" role="img" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">${inner}</span>`;
}
function tileBadgesHtml(tabId, tile) {
  const tab = tileSourceTab(tabId);
  if (!tab) return '';
  const wide = !!tile && tile.matches('.th-w2, .th-w3, .th-w4, .th-big');
  let html = '';
  tab.querySelectorAll(':scope > [class$="-live-badge"], :scope > .map-new-badge').forEach(b => {
    if (tabId === 'trains' && b.classList.contains('delays-live-badge')) return; // затримки — рядком на самій плитці
    if (b.classList.contains('map-new-badge')) { html += tileBadge('NEW', 'Новий розділ', 'th-pill-word'); return; }
    // Половинки бейджа: іконка типу й число («ЗБІР» без числа — один збір)
    const segs = Array.from(b.querySelectorAll('.tab-seg')).map(seg => {
      const m = seg.textContent.match(/\d+/), ico = seg.querySelector('svg');
      return { ico: ico ? ico.outerHTML : '', n: m ? +m[0] : 1 };
    });
    const total = segs.reduce((sum, x) => sum + x.n, 0);
    if (!total) return;
    const label = b.title || String(total);
    if (tabId === 'trains') html += tileBadge(`${total} ${pluralUk(total, 'зміна', 'зміни', 'змін')}`, label, 'th-pill-word');
    else if (tabId === 'alert-volunteers') html += tileBadge(`${total} ${pluralUk(total, 'збір', 'збори', 'зборів')}`, label, 'th-pill-word');
    else if (wide) html += tileBadge(segs.map(x => `<span class="th-pill-seg">${x.ico}${x.n}</span>`).join('<span class="th-pill-div"></span>'), label);
    else html += tileBadge(String(total), label);
  });
  if (tabId === 'alert-phoenix') {
    const m = ((document.getElementById('phoenix-tab-count') || {}).textContent || '').match(/\d+/);
    if (m) html += tileBadge(m[0], `Оголошень про розшук: ${m[0]}`);
  }
  return html;
}

function syncTileHome() {
  document.querySelectorAll('#tile-home .th-tile[data-tab]').forEach(tile => {
    const box = tile.querySelector('.th-badges');
    if (!box) return;
    const html = tileBadgesHtml(tile.dataset.tab, tile);
    if (box.dataset.v !== html) { box.dataset.v = html; box.innerHTML = html; }
  });
  const st = document.getElementById('th-trains-status');
  if (st) {
    const b = (tileSourceTab('trains') || document).querySelector('.delays-live-badge b');
    const n = b ? parseInt(b.textContent, 10) || 0 : 0;
    const txt = n ? `${n} ${pluralUk(n, 'затримка', 'затримки', 'затримок')}` : (trainsDelaysKnown ? 'Без затримок' : '');
    if (st.textContent !== txt) st.textContent = txt;
    st.className = 'th-st ' + (n ? 'th-bad' : 'th-ok');
  }
  // Шторку закрили не з плитки (напр. повторним викликом) — прибираємо й екран розділу
  if (document.documentElement.classList.contains('section-open') && !document.documentElement.classList.contains('cabinet-open') && !document.querySelector('.alert-drawer.open, .main-list-widget.open, .shopping-drawer.open')) {
    closeTileSection(true);
  }
}

// Плитка «Електрички»: найближчі відправлення з Вільногірська — на телефоні 2, на широкому екрані 4
// Службова частина назви станції: «П'ятихатки-Пас.», «П'ятихатки-Стик.», «Дніпро-Головний», «Кам'янське-Пасажирська».
// Назви, де після дефіса — інше місто («Запоріжжя-Кам’янське»), лишаються як є
const TRAIN_STATION_SUFFIX = /\s*-\s*(?:пас(?:ажирськ\S*)?|гол(?:овн\S*)?|стик(?:ов\S*)?|сорт(?:увальн\S*)?|вузл(?:ов\S*)?|товарн\S*)\.?$/i;
function trainsTileUpcoming() {
  const rows = trainsTileRows();
  if (!rows) return null;
  const n = getKyivNow(), nowMin = n.getHours() * 60 + n.getMinutes();
  return { next: rows.filter(r => r.t + r.delay >= nowMin), first: rows[0] || null, nowMin: nowMin };
}
// Рейси на сьогодні (за часом): час, куди, номер (лише цифри), затримка — для плитки й «Моїх електричок» у кабінеті
function trainsTileRows() {
  if (!Array.isArray(trainsTileList)) return null;
  const rows = [];
  trainsTileList.forEach(x => {
    const m = String((x && x.time) || '').match(/^\s*(\d{1,2}):(\d{2})/);
    if (!m) return;
    // Напрямок — кінцева станція: сервер пише маршрут як «перша → остання» («Дніпро-Головний → П'ятихатки-Пас.»);
    // як стрілки немає — остання зупинка з розкладу. На плитці лише місто, без «-Пас.», «-Стик.», «-Головний»
    const route = String(x.route || '').trim(), parts = route.split(/\s+-\s+|\s*(?:→|->|—|–)\s*/).filter(Boolean);
    const stops = Array.isArray(x.fullSchedule) ? x.fullSchedule : [], last = stops[stops.length - 1];
    const end = parts.length > 1 ? parts[parts.length - 1] : (Array.isArray(last) && last[0] ? String(last[0]).trim() : '');
    const num = String(x.number || '').replace(/new/ig, '').replace(/\D/g, '');
    rows.push({ t: +m[1] * 60 + +m[2], time: `${m[1].padStart(2, '0')}:${m[2]}`, to: end ? (end.replace(TRAIN_STATION_SUFFIX, '').trim() || end) : route, num: num, delay: trainsTileDelays[num] || 0 });
  });
  return rows.sort((a, b) => a.t - b.t);
}
function renderTrainsTile() {
  cabMineRefresh(); // відкритий кабінет: «Мої електрички» й «Мій день» (розклад, затримки, відлік хвилин)
  const compact = document.getElementById('th-trains-compact'), side = document.getElementById('th-trains-side');
  if (!compact || !side) return;
  const put = (el, html) => { if (el.dataset.v !== html) { el.dataset.v = html; el.innerHTML = html; } };
  const u = trainsTileUpcoming();
  if (!u || !u.first) { put(compact, ''); put(side, ''); return; }
  // Запізнення: до години — «+15 хв»; довше — «+1 год 39 хв» (на вузькій плитці — «+1:39»), як і в розділі, а не «+99 хв»
  const late = (min, short) => min < 60 ? `+${min} хв` : short ? `+${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}` : `+${svitloDur(min)}`;
  // short — вузька плитка: відлік лише коли до рейсу менше години (інакше не влазить назва напрямку)
  const row = (r, short) => {
    const left = r.t + r.delay - u.nowMin;
    const tail = r.delay ? `<span class="th-tr-del" title="Запізнення ${svitloDur(r.delay)}">${late(r.delay, short)}</span>`
      : left <= 0 ? '<span class="th-tr-in th-tr-now">зараз</span>'
      : left < 60 ? `<span class="th-tr-in">${left} хв</span>`
      : short ? '' : `<span class="th-tr-in">${svitloDur(left)}</span>`;
    return `<span class="th-tr"><b>${r.time}</b><span class="th-tr-to">${short ? '' : '→ '}${escapeHTML(r.to)}</span>${tail}</span>`;
  };
  if (!u.next.length) {
    const none = `<span class="th-tr-none">Сьогодні рейсів більше немає · завтра о ${u.first.time}</span>`;
    put(compact, none); put(side, `<span class="th-side-h">З Вільногірська</span>${none}`);
    return;
  }
  put(compact, u.next.slice(0, 2).map(r => row(r, true)).join(''));
  put(side, `<span class="th-side-h">Найближчі з Вільногірська</span>${u.next.slice(0, 4).map(r => row(r, false)).join('')}`);
}

function initTileHome() {
  if (!document.getElementById('tile-home')) return;
  let timer = null;
  const kick = () => { if (!timer) timer = setTimeout(() => { timer = null; syncTileHome(); }, 60); };
  if (window.MutationObserver) {
    ['alert-tabs', 'schedule-tabs', 'market-tabs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) new MutationObserver(kick).observe(el, { childList: true, subtree: true, characterData: true });
    });
    ['alert-drawer', 'main-list-widget', 'market-drawer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) new MutationObserver(kick).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }
  syncTileHome();
  initCabinet();
}

// === МІЙ КАБІНЕТ — для всіх: вхід, «Мої оголошення», «Мій день», «Сповіщення», «Обране», «Мої дані» ===
// Вхід через Firebase Authentication (той самий проєкт, що й сповіщення): Google або e-mail з паролем.
// Сповіщення й особисте працюють і без входу.
const FIREBASE_AUTH_SDK = 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth-compat.js';
let cabAuth = null, cabUser = null, cabKnown = false;
let cabState = 'idle'; // idle | loading | ready | error
let cabMode = 'in';     // in — вхід, up — реєстрація
let cabEmailOpen = false; // форма входу через e-mail розгорнута (за замовчуванням — лише кнопка, щоб «Мій день» було видно одразу)
let cabConfirmDelete = false;
const CAB_G_LOGO = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const CAB_USER_ICO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

function ensureAuth() {
  if (cabState === 'loading' || cabState === 'ready') return;
  if (!window.firebase || typeof firebase.initializeApp !== 'function') { cabState = 'error'; renderAccount(); return; }
  cabState = 'loading'; renderAccount();
  const start = () => {
    try {
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      cabAuth = firebase.auth();
      cabAuth.languageCode = 'uk'; // листи (підтвердження, відновлення пароля) і вікно Google — українською
      cabState = 'ready';
      cabAuth.onAuthStateChanged(u => { cabUser = u; cabKnown = true; cabConfirmDelete = false; if (!u) { cabMode = 'in'; cabEmailOpen = false; } cabAuthMark(!!u); cabAds = cabAdsBlank(); cabResetAdmin(u); renderAccount(); if (u) { cabLoadAds(); cabHello(document.documentElement.classList.contains('cabinet-open')); } });
    } catch (e) { cabState = 'error'; logSectionError('кабінет', e); renderAccount(); }
  };
  if (typeof firebase.auth === 'function') { start(); return; }
  const s = document.createElement('script');
  s.src = FIREBASE_AUTH_SDK; s.async = true;
  s.onload = start;
  s.onerror = () => { cabState = 'error'; renderAccount(); };
  document.head.appendChild(s);
}

// Хтось входив на цьому пристрої — тоді бібліотеку входу підтягуємо одразу (аватар у шапці, токен у формах);
// іншим вона вантажиться, лише коли відкривають кабінет
function cabAuthMark(on) { try { if (on) localStorage.setItem('cab_auth', '1'); else localStorage.removeItem('cab_auth'); } catch (e) {} }
function cabAuthUsed() {
  try { return localStorage.getItem('cab_auth') === '1' || !!localStorage.getItem('cab_hello') || localStorage.getItem('tiles_mode') === '1'; } catch (e) { return false; }
}
function cabName(u) { return (u && (u.displayName || (u.email || '').split('@')[0])) || 'Ви'; }
function cabAvatar(u, size) {
  if (u && u.photoURL && /^https:\/\//.test(u.photoURL)) return `<img class="cab-ava-img" src="${escapeHTML(u.photoURL)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer">`;
  return `<span class="cab-ava-txt" style="width:${size}px;height:${size}px">${escapeHTML(cabName(u).trim().charAt(0).toUpperCase() || '?')}</span>`;
}

// Кнопка в шапці плиткової головної + вміст кабінету, якщо він відкритий
function renderAccount() {
  const btn = document.getElementById('th-account');
  if (btn) {
    // Кнопка в шапці — завжди «Мій кабінет» (люди не здогадувались, що за іменем ховається кабінет); другим рядком — ім'я або «Увійти»
    const first = cabUser ? cabName(cabUser).split(' ')[0] : '';
    const html = (cabUser ? cabAvatar(cabUser, 34) : `<span class="th-acc-ico">${CAB_USER_ICO}</span>`)
      + `<span class="th-acc-txt"><span class="th-acc-t">Мій кабінет</span><span class="th-acc-s">${cabUser ? escapeHTML(first) : 'Увійти'}</span></span>`;
    if (btn.dataset.v !== html) { btn.dataset.v = html; btn.innerHTML = html; }
    btn.setAttribute('aria-label', cabUser ? `Мій кабінет — ${first}` : 'Мій кабінет — увійти');
  }
  if (document.documentElement.classList.contains('cabinet-open')) renderCabinet();
}

function renderCabinet() {
  const body = document.getElementById('cabinet-body');
  if (!body) return;
  // Головний екран кабінету: вгорі вхід чи профіль, далі плитки («Сповіщення», «Мої оголошення»), унизу вихід.
  // Підекран (#cab-sub) — уміст плитки, що її відкрили; «Назад» повертає на головний екран кабінету.
  if (!document.getElementById('cab-home')) body.innerHTML = '<div id="cab-home" class="cab-part"><div id="cab-top" class="cab-part"></div><div id="cab-day" class="cab-part"></div><div id="cab-tiles" class="th-grid cab-tiles"></div><div id="cab-bottom" class="cab-part"></div></div><div id="cab-sub" class="cab-part" hidden></div>';
  let top = '', bottom = '';
  if (cabState === 'error') {
    top = `<div class="cab-card cab-center"><b>Не вдалося завантажити вхід</b><p>Перевірте з'єднання з інтернетом і спробуйте ще раз.</p><button type="button" class="cab-btn" data-act="retry">Спробувати ще раз</button></div>`;
  } else if (cabState !== 'ready' || !cabKnown) {
    top = `<div class="cab-card cab-center"><p>Завантаження…</p></div>`;
  } else if (!cabUser) {
    const up = cabMode === 'up';
    top = `
      <div class="cab-hero"><span class="cab-hero-ico">${CAB_USER_ICO}</span><h2>Мій кабінет</h2>
        <p>Увійдіть, щоб подавати оголошення й керувати ними: бачити, що на модерації, і видаляти свої. Сповіщення, «Мій день» і «Обране» працюють і без входу.</p></div>
      <button type="button" class="cab-google" data-act="google">${CAB_G_LOGO}<span>Увійти через Google</span></button>
      ${!cabEmailOpen && !up ? `<button type="button" class="cab-btn cab-btn-ghost cab-wide" data-act="email-open">Увійти через e-mail</button>
      <p class="cab-fine">Входячи, ви погоджуєтеся з <a href="/privacy.html" target="_blank" rel="noopener">політикою конфіденційності</a>.</p>` : `
      <div class="cab-or"><span>або через e-mail</span></div>
      <div class="cab-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${!up}" class="${up ? '' : 'on'}" data-act="mode-in">Вхід</button>
        <button type="button" role="tab" aria-selected="${up}" class="${up ? 'on' : ''}" data-act="mode-up">Реєстрація</button>
      </div>
      <form class="cab-form" id="cab-form" novalidate>
        ${up ? `<label class="cab-field"><span>Ваше ім'я</span><input type="text" id="cab-name" autocomplete="name" maxlength="40" required placeholder="Як до вас звертатися"></label>` : ''}
        <label class="cab-field"><span>E-mail</span><input type="email" id="cab-email" autocomplete="email" inputmode="email" required placeholder="name@gmail.com"></label>
        <label class="cab-field"><span>Пароль</span><input type="password" id="cab-pass" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required placeholder="${up ? 'Щонайменше 6 символів' : 'Ваш пароль'}"></label>
        <button type="submit" class="cab-submit">${up ? 'Зареєструватися' : 'Увійти'}</button>
        ${up ? '' : '<button type="button" class="cab-link" data-act="forgot">Забули пароль?</button>'}
        <div class="cab-msg" id="cab-msg" role="status" aria-live="polite"></div>
      </form>
      <p class="cab-fine">Входячи, ви погоджуєтеся з <a href="/privacy.html" target="_blank" rel="noopener">політикою конфіденційності</a>.</p>`}`;
  } else {
    const u = cabUser;
    const isPassword = (u.providerData || []).some(p => p && p.providerId === 'password');
    const verify = isPassword && !u.emailVerified
      ? `<div class="cab-note"><b>Підтвердьте e-mail</b><span>Ми надіслали лист на ${escapeHTML(u.email || '')}. Відкрийте посилання з листа, потім натисніть «Я підтвердив».</span>
           <div class="cab-row"><button type="button" class="cab-btn cab-btn-sm" data-act="reload">Я підтвердив</button><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="resend">Надіслати ще раз</button></div></div>` : '';
    const del = cabConfirmDelete
      ? `<div class="cab-confirm"><b>Видалити акаунт?</b><span>Акаунт і вхід буде видалено назавжди.</span>
           <div class="cab-row"><button type="button" class="cab-btn cab-btn-sm cab-btn-danger" data-act="delete-yes">Так, видалити</button><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="delete-no">Скасувати</button></div></div>`
      : `<button type="button" class="cab-link cab-link-danger" data-act="delete">Видалити акаунт</button>`;
    top = `
      <div class="cab-profile">${cabAvatar(u, 52)}<div class="cab-profile-txt"><b>${escapeHTML(cabName(u))}</b><span>${escapeHTML(u.email || '')}</span></div></div>
      ${verify}${cabBanned ? CAB_BANNED_NOTE : ''}`;
    bottom = `
      <div class="cab-msg" id="cab-msg" role="status" aria-live="polite"></div>
      <button type="button" class="cab-btn cab-btn-ghost cab-wide" data-act="signout">Вийти</button>
      ${del}`;
  }
  // Плитки кабінету: «Сповіщення», «Обране», «Мої дані» (працюють і без входу) і, після входу, «Мої оголошення»
  const subOn = cabPushSubscribed(), perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const nOn = subOn ? getCurrentCategories().length : 0;
  const pushSt = subOn ? `Увімкнено · ${nOn} ${pluralUk(nOn, 'тема', 'теми', 'тем')}` : perm === 'denied' ? 'Заблоковано в браузері' : 'Вимкнено';
  const tiles = `<button type="button" class="th-tile ${cabUser ? 'th-w2' : 'th-w4'}${subOn ? ' th-on' : ''}" data-act="view-push" style="--c:#FFCC00;--rgb:255,204,0">${CAB_BELL_ICO}<span class="th-txt"><span class="th-l">Сповіщення</span><span class="th-d">${pushSt}</span></span></button>`
    + (cabUser ? `<button type="button" class="th-tile th-w2" data-act="view-ads" style="--c:#00FF9C;--rgb:0,255,156">${CAB_ADS_ICO}<span class="th-txt"><span class="th-l">Мої оголошення</span><span class="th-d">${cabAdsTileText()}</span></span></button>` : '')
    + cabMineTilesHtml()
    + (cabUser && cabIsAdmin ? `<button type="button" class="th-tile th-w4" data-act="view-stats" style="--c:#7cc4ff;--rgb:124,196,255">${CAB_STATS_ICO}<span class="th-txt"><span class="th-l">Статистика</span><span class="th-d">${cabStatsTileText()}</span></span></button>` : '');
  const t = document.getElementById('cab-top'), b = document.getElementById('cab-bottom'), tl = document.getElementById('cab-tiles'), dy = document.getElementById('cab-day');
  if (t.dataset.v !== top) { t.dataset.v = top; t.innerHTML = top; }
  const day = cabView === 'home' ? cabMyDayHtml() : (dy.dataset.v || '');
  if (dy.dataset.v !== day) { dy.dataset.v = day; dy.innerHTML = day; }
  if (tl.dataset.v !== tiles) { tl.dataset.v = tiles; tl.innerHTML = tiles; }
  if (b.dataset.v !== bottom) { b.dataset.v = bottom; b.innerHTML = bottom; }
  // Який екран показати
  const home = document.getElementById('cab-home'), sub = document.getElementById('cab-sub'), title = document.getElementById('section-bar-title');
  home.hidden = cabView !== 'home'; sub.hidden = cabView === 'home';
  if (title) title.textContent = CAB_VIEW_TITLES[cabView] || 'Мій кабінет';
  // Інший підекран — починаємо з чистого (кожен малює свій вміст)
  if (sub.dataset.view !== cabView) { sub.dataset.view = cabView; sub.dataset.v = ''; sub.innerHTML = ''; }
  if (CAB_MINE_VIEWS.includes(cabView)) cabRenderMine(sub);
  else if (cabView === 'push') {
    if (!document.getElementById('cab-push')) { sub.innerHTML = '<div id="cab-push" class="cab-push"></div>'; sub.dataset.v = ''; }
    renderCabPush();
  } else if (cabView === 'ads') {
    const a = cabAdsHtml();
    if (sub.dataset.v !== a) { sub.dataset.v = a; sub.innerHTML = a; }
  } else if (cabView === 'stats') {
    const a = cabStatsHtml();
    if (sub.dataset.v !== a) { sub.dataset.v = a; sub.innerHTML = a; const q = document.getElementById('cab-stats-q'); if (q) q.value = cabStatsQuery; cabStatsFilter(); }
  } else if (sub.innerHTML) { sub.innerHTML = ''; sub.dataset.v = ''; }
}
const CAB_BELL_ICO = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>';
const CAB_ADS_ICO = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z"/></svg>';
let cabView = 'home'; // home — головний екран кабінету; push — сповіщення; ads — мої оголошення; stats — статистика (адмін);
                      // myhome, mytrains, fav, me — особисте («Мій дім», «Мої електрички», «Обране», «Мої дані»)
const CAB_VIEW_TITLES = { push: 'Сповіщення', ads: 'Мої оголошення', stats: 'Статистика', myhome: 'Мій дім', mytrains: 'Мої електрички', fav: 'Обране', me: 'Мої дані' };
const CAB_MINE_VIEWS = ['myhome', 'mytrains', 'fav', 'me'];
// Плитки «Обране» й «Мої дані» на головному екрані кабінету
function cabMineTilesHtml() {
  const favN = myFavs().length, p = myProfile();
  return `<button type="button" class="th-tile th-w2" data-act="view-fav" style="--c:#FFD54A;--rgb:255,213,74">${CAB_ICO_STAR}<span class="th-txt"><span class="th-l">Обране</span><span class="th-d">${favN ? `${favN} ${pluralUk(favN, 'номер', 'номери', 'номерів')}` : 'Номери з довідника'}</span></span></button>`
    + `<button type="button" class="th-tile th-w2" data-act="view-me" style="--c:#A18CD1;--rgb:161,140,209">${CAB_ICO_CARD}<span class="th-txt"><span class="th-l">Мої дані</span><span class="th-d">${p.phone ? escapeHTML(myPhoneFmt(p.phone)) : 'Підставляти у форми'}</span></span></button>`;
}
function cabShowView(v, fromHistory) {
  cabView = v === 'myhome' && !CAB_BIN_ON ? 'home' : (v || 'home'); // «Мій дім» тимчасово вимкнено
  if (cabView === 'push') { cabPushDraft = null; cabPushConfirmOff = false; }
  if (cabView === 'ads' && !fromHistory) { cabAds.confirm = ''; cabLoadAds(); }
  if (cabView === 'stats' && (!fromHistory || !cabStats)) { cabStatsConfirm = ''; cabLoadStats(); }
  if (!fromHistory && cabView !== 'home') { try { history.pushState({ tileSection: 'cabinet', sub: cabView }, ''); } catch (e) {} }
  renderCabinet();
  const c = document.getElementById('cabinet'); if (c) c.scrollTop = 0;
}

// === Особисте в кабінеті: «Мій день», «Мій дім», «Мої електрички», «Обране», «Мої дані» ===
// Працює й без входу, як «Сповіщення»: усе лежить лише в цьому браузері (localStorage) і нікуди не надсилається —
// адреса, рейси, номери, телефон. Телефон потрапить на сервер, тільки коли людина сама подасть оголошення.
const MY_HOME_KEY = 'my_home', MY_TRAINS_KEY = 'my_trains', MY_FAV_KEY = 'my_contacts', MY_PROFILE_KEY = 'my_profile';
const MY_FAV_MAX = 60;
// Сміттєвоз у «Моєму дні» й екран «Мій дім» тимчасово вимкнено: графік вивозу ще доробляють.
// Збережена адреса лишається на пристрої — увімкнути назад: true
const CAB_BIN_ON = false;
function myGet(key, def) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? def : v; } catch (e) { return def; } }
function mySet(key, val) { try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
function myHome() { const h = myGet(MY_HOME_KEY, null); return h && typeof h.address === 'string' && h.address ? h : null; }
function myTrains() { const a = myGet(MY_TRAINS_KEY, []); return Array.isArray(a) ? a.map(String).filter(Boolean) : []; }
function myFavs() { const a = myGet(MY_FAV_KEY, []); return Array.isArray(a) ? a.filter(f => f && f.k && f.t && Array.isArray(f.p)) : []; }
function myProfile() { const p = myGet(MY_PROFILE_KEY, null); return p && typeof p === 'object' ? { name: String(p.name || ''), phone: /^\+380\d{9}$/.test(p.phone || '') ? p.phone : '' } : { name: '', phone: '' }; }
function myPhoneFmt(p) { const d = String(p || '').replace(/\D/g, ''); return d.length === 12 ? `+${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : String(p || ''); }

const CAB_SVG = (d, size) => `<svg viewBox="0 0 24 24" width="${size || 22}" height="${size || 22}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
const CAB_ICO_LIGHT = CAB_SVG('M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z');
const CAB_ICO_BIN = CAB_SVG('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z');
const CAB_ICO_TRAIN = CAB_SVG('M12 2c-4.42 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z');
const CAB_ICO_STAR = CAB_SVG('M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z', 28);
const CAB_ICO_CARD = CAB_SVG('M3 5v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2zm12 4c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zm-9 8c0-2 4-3.1 6-3.1s6 1.1 6 3.1v1H6v-1z', 28);
const CAB_ICO_PHONE = CAB_SVG('M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z', 16);
const CAB_DAY_COLORS = { light: ['#FFB547', '255,181,71'], bin: ['#FFCC00', '255,204,0'], train: ['#38BDF8', '56,189,248'] };

// Кабінет відкрито — оновити «Мій день» і особисті екрани (дані підвантажились, минула хвилина)
function cabMineRefresh() {
  if (!document.documentElement.classList.contains('cabinet-open')) return;
  if (cabView === 'home' || cabView === 'myhome' || cabView === 'mytrains' || cabView === 'fav' || cabView === 'push') renderCabinet();
}

// Рядок «Мого дня»: що (label), стан (value), подробиці (sub); тап — налаштувати чи подивитись докладно
function cabDayRow(act, kind, ico, label, value, sub, cls) {
  const c = CAB_DAY_COLORS[kind];
  return `<button type="button" class="cab-day-row" data-act="${act}" style="--c:${c[0]};--rgb:${c[1]}"><span class="cab-day-ico">${ico}</span>`
    + `<span class="cab-day-txt"><span class="cab-day-l">${label}</span><span class="cab-day-v${cls ? ' cab-day-' + cls : ''}">${value}</span>${sub ? `<span class="cab-day-s">${sub}</span>` : ''}</span>`
    + '<span class="cab-day-go" aria-hidden="true">›</span></button>';
}
function cabMyDayHtml() {
  let date = '';
  try { date = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Kyiv' }).format(new Date()); } catch (e) {}
  return `<section class="cab-day" aria-labelledby="cab-day-h"><div class="cab-day-head"><h2 id="cab-day-h">Мій день</h2>${date ? `<span>${escapeHTML(date)}</span>` : ''}</div>`
    + cabDayLight() + (CAB_BIN_ON ? cabDayBin() : '') + cabDayTrain() + '</section>';
}

// Світло: стан своєї черги — так само, як на плитці «Світло»
function cabDayLight() {
  const row = (v, s, cls, label) => cabDayRow('day-light', 'light', CAB_ICO_LIGHT, label || 'Світло', v, s, cls);
  const state = svitloTileState;
  if (!state) return row('Графік зараз не публікується', '', 'mut');
  if (!getSvitloChoice()) return row('Оберіть свою чергу', 'Покажемо, коли світло є і коли вимкнуть', 'cta');
  const live = svitloTodayData() || state, my = svitloMyQueue(live);
  if (!my) return row('Вашої черги немає в цьому графіку', 'Торкніться, щоб обрати іншу', 'cta');
  const qs = svitloQueueState(my.slots, svitloDayOffset(live.updated)), t = svitloStateText(qs, live.updated);
  const next = svitloNextData(), tmr = next ? svitloNextText(svitloNextState(next)) : '';
  const sub = qs.kind === 'off' ? `Увімкнуть ${t.left}` : qs.kind === 'on' ? `Вимкнуть ${t.left}` : (tmr && (qs.kind === 'done' || qs.kind === 'clear')) ? tmr : t.when;
  const cls = t.cls === 'off' ? 'bad' : (t.cls === 'on' || t.cls === 'ok') ? 'ok' : '';
  return row(escapeHTML(t.short), escapeHTML(sub), cls, `Світло · черга ${escapeHTML(my.queue)}`);
}

// Сміття: зупинка біля дому — шукаємо її в поточному графіку щоразу заново (за адресою, бажано в тому ж маршруті)
function myHomeStop() {
  const h = myHome(); if (!h) return null;
  let any = null;
  for (const r of allGarbageRoutes) for (const st of r.stops) {
    if (st.address !== h.address) continue;
    if (r.name === h.route) return { route: r, stop: st };
    if (!any) any = { route: r, stop: st };
  }
  return any;
}
// Коли машина біля дому: у неділю — недільний час (якщо є), в інші дні — будній
function myBinWhen(stop) {
  const n = getKyivNow(), dow = n.getDay();
  const today = dow === 0 && stop.sunday ? stop.sunday : stop.time;
  const tomorrow = dow === 6 && stop.sunday ? stop.sunday : stop.time;
  const m = smMinutes(today);
  if (m == null) return { kind: 'none', tomorrow: tomorrow };
  const left = m - (n.getHours() * 60 + n.getMinutes());
  if (left > 0) return { kind: 'soon', time: today, left: left, tomorrow: tomorrow };
  if (left >= -10) return { kind: 'now', time: today, tomorrow: tomorrow };
  return { kind: 'gone', time: today, tomorrow: tomorrow };
}
function myAddrShort(a) { return String(a || '').replace(/^(вул\.?|вулиця)\s*/i, ''); }
function cabDayBin() {
  const row = (v, s, cls, label) => cabDayRow('day-bin', 'bin', CAB_ICO_BIN, label || 'Сміттєвоз', v, s, cls);
  const h = myHome();
  if (garbageState === 'off') return row('Графік вивозу зараз не публікується', '', 'mut');
  if (!h) return row('Вкажіть свою адресу', 'Покажемо, коли машина біля вашого будинку', 'cta');
  if (garbageState !== 'ready') return row(garbageState === 'error' ? 'Графік не завантажився' : 'Графік завантажується…', '', 'mut', `Сміттєвоз · ${escapeHTML(myAddrShort(h.address))}`);
  const found = myHomeStop();
  if (!found) return row('Адреси вже немає в графіку', 'Торкніться, щоб обрати ще раз', 'cta', `Сміттєвоз · ${escapeHTML(myAddrShort(h.address))}`);
  const w = myBinWhen(found.stop), label = `Сміттєвоз · ${escapeHTML(myAddrShort(found.stop.address))}`;
  if (w.kind === 'none') return row('Час ще уточнюється', '', 'mut', label);
  if (w.kind === 'soon') return row(`Сьогодні о ${escapeHTML(w.time)}`, `Через ${svitloDur(w.left)}`, '', label);
  if (w.kind === 'now') return row('Зараз біля будинку', `За графіком о ${escapeHTML(w.time)}`, 'ok', label);
  return row(w.tomorrow ? `Завтра о ${escapeHTML(w.tomorrow)}` : 'Сьогодні вже проїхав', `Сьогодні вже проїхав о ${escapeHTML(w.time)}`, 'mut2', label);
}

// Електрички: найближчий зі своїх рейсів і його затримка
function cabDayTrain() {
  const row = (v, s, cls, label) => cabDayRow('day-trains', 'train', CAB_ICO_TRAIN, label || 'Електрички', v, s, cls);
  const pins = myTrains(), rows = trainsTileRows();
  if (!pins.length) return row('Оберіть свої рейси', 'Покажемо найближчий і чи він запізнюється', 'cta');
  if (!rows) return row('Розклад завантажується…', '', 'mut');
  const mine = rows.filter(r => pins.includes(r.num));
  if (!mine.length) return row('Сьогодні ваші рейси не курсують', 'Торкніться, щоб змінити вибір', 'mut');
  const n = getKyivNow(), nowMin = n.getHours() * 60 + n.getMinutes();
  const next = mine.find(r => r.t + r.delay >= nowMin);
  if (!next) return row('На сьогодні ваші рейси вже пішли', escapeHTML('Ваші: ' + mine.map(r => r.time).join(', ')), 'mut2');
  const left = next.t + next.delay - nowMin, label = `Електричка № ${escapeHTML(next.num)}`;
  const value = `${next.time} → ${escapeHTML(next.to)}`;
  if (next.delay) return row(value, `<span class="cab-day-late">Запізнюється на ${svitloDur(next.delay)}</span> · ≈ ${svitloClock(next.t + next.delay)}`, '', label);
  const when = left <= 0 ? 'Відправляється зараз' : `Через ${svitloDur(left)}`;
  return row(value, when + (trainsDelaysKnown ? ' · без затримки' : ''), '', label);
}

// === Підекрани ===
let cabHomeQ = '';
function cabMineSkeleton(v) {
  if (v === 'myhome') return '<div id="cab-home-now" class="cab-part"></div>'
    + `<div class="cab-card cab-find"><label class="cab-field"><span id="cab-home-ql">Ваша адреса</span><input type="search" id="cab-home-q" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="Вулиця й номер будинку" value="${escapeHTML(cabHomeQ)}"></label><div id="cab-home-res" class="cab-find-res" aria-live="polite"></div></div>`
    + '<p class="cab-fine">Адреса зберігається лише на цьому пристрої. Графік вивозу поки тестовий — його уточнюють.</p>';
  if (v === 'me') {
    const p = myProfile(), acc = cabUser ? cabName(cabUser).split(' ')[0] : '';
    return '<div class="cab-card cab-me"><p class="cab-push-sub">Ім\'я й телефон самі підставлятимуться у форми оголошень і попуток — не треба щоразу вводити.</p>'
      + '<form class="cab-form" id="cab-me-form" novalidate>'
      + `<label class="cab-field"><span>Ім'я</span><input type="text" id="cab-me-name" autocomplete="given-name" maxlength="30" placeholder="${escapeHTML(acc || 'Як підписувати поїздки')}" value="${escapeHTML(p.name)}"></label>`
      + `<label class="cab-field"><span>Телефон</span><input type="tel" id="cab-me-phone" autocomplete="tel" inputmode="tel" maxlength="13" placeholder="+380971234567" value="${escapeHTML(p.phone || '+380')}"></label>`
      + '<button type="submit" class="cab-submit">Зберегти</button>'
      + `<button type="button" class="cab-link cab-link-danger" data-act="me-clear"${p.name || p.phone ? '' : ' hidden'}>Стерти мої дані</button>`
      + '<div class="cab-msg" id="cab-me-msg" role="status" aria-live="polite"></div></form></div>'
      + '<p class="cab-fine">Зберігається лише на цьому пристрої. На сервер телефон потрапить, тільки коли ви самі подасте оголошення.</p>';
  }
  return `<div id="cab-mine-${v}" class="cab-part"></div>`;
}
function cabRenderMine(sub) {
  const v = cabView;
  if (!sub.firstChild) sub.innerHTML = cabMineSkeleton(v); // renderCabinet щойно очистив підекран — новий екран
  const put = (id, html) => { const el = document.getElementById(id); if (el && el.dataset.v !== html) { el.dataset.v = html; el.innerHTML = html; } };
  if (v === 'myhome') { put('cab-home-now', cabMyHomeNowHtml()); cabHomeResults(); const l = document.getElementById('cab-home-ql'); if (l) l.textContent = myHome() ? 'Інша адреса' : 'Ваша адреса'; }
  else if (v === 'mytrains') put('cab-mine-mytrains', cabMyTrainsHtml());
  else if (v === 'fav') put('cab-mine-fav', cabFavHtml());
}

// «Мій дім»: обрана зупинка — великим часом сьогодні, нижче будні/неділя й маршрут
function cabMyHomeNowHtml() {
  const h = myHome();
  if (!h) return '';
  const head = (addr, route) => `<div class="cab-home-h"><span class="cab-day-ico">${CAB_ICO_BIN}</span><div class="cab-home-addr"><b>${escapeHTML(addr)}</b>${route ? `<span>${escapeHTML(route)}</span>` : ''}</div></div>`;
  const clear = '<button type="button" class="cab-link cab-link-danger" data-act="home-clear">Прибрати адресу</button>';
  if (garbageState !== 'ready') return `<div class="cab-card cab-home" style="--c:#FFCC00;--rgb:255,204,0">${head(h.address, h.route)}<p class="cab-empty">${garbageState === 'off' ? 'Графік вивозу зараз не публікується.' : garbageState === 'error' ? 'Графік не завантажився — спробуйте згодом.' : 'Графік завантажується…'}</p>${clear}</div>`;
  const f = myHomeStop();
  if (!f) return `<div class="cab-card cab-home" style="--c:#FFCC00;--rgb:255,204,0">${head(h.address, '')}<p class="cab-empty">Цієї адреси вже немає в графіку — знайдіть її ще раз нижче.</p>${clear}</div>`;
  const w = myBinWhen(f.stop);
  const big = w.kind === 'none' ? '—' : w.kind === 'gone' ? (w.tomorrow || '—') : w.time;
  const cap = w.kind === 'none' ? 'Час ще уточнюється' : w.kind === 'soon' ? `сьогодні · через ${svitloDur(w.left)}` : w.kind === 'now' ? 'сьогодні · машина вже має бути біля будинку' : `завтра · сьогодні вже проїхав о ${w.time}`;
  const sun = f.stop.sunday || f.stop.time;
  const week = !f.stop.time ? [`Нд: ${f.stop.sunday || '—'}`] : sun === f.stop.time ? [`Щодня о ${f.stop.time}`] : [`Пн–сб: ${f.stop.time}`, `Нд: ${sun}`];
  return `<div class="cab-card cab-home" style="--c:#FFCC00;--rgb:255,204,0">${head(f.stop.address, f.route.name)}`
    + `<div class="cab-home-big"><b>${escapeHTML(big)}</b><span>${escapeHTML(cap)}</span></div>`
    + `<div class="cab-home-week">${week.map(x => `<span>${escapeHTML(x)}</span>`).join('')}</div>${clear}</div>`;
}
// Пошук адреси — той самий, що в розділі «Вивіз сміття»: точний номер будинку, а як нема — схожі (16 → 16а)
function cabHomeResults() {
  const box = document.getElementById('cab-home-res'); if (!box) return;
  const q = smParseQuery(cabHomeQ), searching = q.street.length > 0 || !!q.house;
  let html = '';
  if (garbageState === 'off') html = '<p class="cab-empty">Графік вивозу зараз не публікується.</p>';
  else if (garbageState !== 'ready') html = `<p class="cab-empty">${garbageState === 'error' ? 'Графік не завантажився — спробуйте згодом.' : 'Графік завантажується…'}</p>`;
  else if (!searching) html = '<p class="cab-empty">Почніть вводити назву вулиці, напр. «Садова 30».</p>';
  else {
    const pick = (loose) => { const out = []; allGarbageRoutes.forEach((r, ri) => r.stops.forEach((st, si) => { if (smStopMatches(st, q, loose)) out.push({ r: r, st: st, ri: ri, si: si }); })); return out; };
    let found = pick(false); if (!found.length && q.house) found = pick(true);
    const mine = myHome();
    html = found.length
      ? found.slice(0, 12).map(x => {
          const on = mine && mine.address === x.st.address && mine.route === x.r.name;
          const t = [x.st.time ? 'пн–сб ' + x.st.time : '', x.st.sunday ? 'нд ' + x.st.sunday : ''].filter(Boolean).join(' · ') || 'час уточнюється';
          return `<button type="button" class="cab-find-opt${on ? ' on' : ''}" data-act="home-pick" data-i="${x.ri}:${x.si}" aria-pressed="${on ? 'true' : 'false'}"><b>${escapeHTML(x.st.address)}</b><span>${escapeHTML(x.r.name)} · ${escapeHTML(t)}</span></button>`;
        }).join('') + (found.length > 12 ? `<p class="cab-empty">І ще ${found.length - 12} — уточніть номер будинку.</p>` : '')
      : '<p class="cab-empty">Такої адреси в графіку поки немає. Спробуйте лише назву вулиці.</p>';
  }
  if (box.dataset.v !== html) { box.dataset.v = html; box.innerHTML = html; }
}

// «Мої електрички»: рейси з Вільногірська на сьогодні — зірочкою позначити свої
function cabMyTrainsHtml() {
  const rows = trainsTileRows(), pins = myTrains();
  if (!rows) return '<div class="cab-card cab-center"><p>Розклад завантажується…</p></div>';
  if (!rows.length) return '<div class="cab-card cab-center"><p>Сьогодні рейсів у розкладі немає.</p></div>';
  const n = getKyivNow(), nowMin = n.getHours() * 60 + n.getMinutes();
  const list = rows.map(r => {
    const on = pins.includes(r.num), left = r.t + r.delay - nowMin, past = left < 0;
    const st = r.delay ? `<span class="cab-tr-st cab-tr-late">+${svitloDur(r.delay)}</span>` : past ? '<span class="cab-tr-st">пішла</span>' : left < 60 ? `<span class="cab-tr-st">${left <= 0 ? 'зараз' : `через ${left} хв`}</span>` : '<span class="cab-tr-st"></span>';
    return `<button type="button" class="cab-tr${on ? ' on' : ''}${past ? ' past' : ''}" data-act="tr-pin" data-num="${escapeHTML(r.num)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${escapeHTML(`${r.time}, до ${r.to}, № ${r.num}`)}${on ? ' — ваш рейс' : ''}">`
      + `<span class="cab-tr-star" aria-hidden="true">${on ? '★' : '☆'}</span><b>${r.time}</b><span class="cab-tr-to">${escapeHTML(r.to)}</span><span class="cab-tr-num">№ ${escapeHTML(r.num)}</span>${st}</button>`;
  }).join('');
  const n2 = rows.filter(r => pins.includes(r.num)).length;
  return `<p class="cab-push-sub">Позначте зірочкою рейси, якими їздите. У «Моєму дні» буде найближчий із них — і затримка, якщо електричка запізнюється.</p>`
    + `<div class="cab-tr-head"><span>Сьогодні з Вільногірська</span><span>${n2 ? `Ваших: ${n2}` : ''}</span></div>`
    + `<div class="cab-tr-list">${list}</div><p class="cab-fine">Вибір зберігається на цьому пристрої.</p>`;
}

// «Обране»: номери з «Міського довідника». Номери беремо свіжі з довідника (якщо запис ще є), інакше — збережені
function myFavKey(cat, title) { return foldForSearch(cat) + '|' + foldForSearch(title); }
function myFavResolve(f) {
  if (!Array.isArray(phonebookRawData)) return f;
  for (const cat of phonebookRawData) {
    if (!cat || !Array.isArray(cat.items)) continue;
    for (const it of cat.items) {
      const t = it ? String(it.title || it.name || '') : '';
      if (t && myFavKey(cat.name || cat.category || 'Різне', t) === f.k) {
        const ph = pbPhones(it);
        return ph.length ? Object.assign({}, f, { p: ph.map(String) }) : f;
      }
    }
  }
  return f;
}
function cabFavHtml() {
  const list = myFavs();
  const guide = !!document.getElementById('city-guide-list-content');
  if (!list.length) return '<div class="cab-card cab-center cab-fav-empty"><span class="cab-fav-empty-ico" aria-hidden="true">☆</span><b>Тут будуть ваші номери</b>'
    + '<p>Натисніть ☆ біля номера в «Міському довіднику» — і він з’явиться тут, щоб дзвонити в один дотик.</p>'
    + (guide ? '<button type="button" class="cab-btn" data-act="fav-guide">Відкрити довідник</button>' : '') + '</div>';
  return '<div class="cab-fav-list">' + list.map(f0 => {
    const f = myFavResolve(f0);
    const phones = f.p.map(p => { const clean = String(p).replace(/[^0-9+]/g, ''); return clean ? `<a class="cab-fav-call" href="tel:${escapeHTML(clean)}">${CAB_ICO_PHONE}<span>${escapeHTML(p)}</span></a>` : ''; }).join('');
    return `<div class="cab-fav"><div class="cab-fav-top"><div class="cab-fav-txt"><b>${escapeHTML(f.t)}</b>${f.c ? `<span>${escapeHTML(f.c)}</span>` : ''}</div>`
      + `<button type="button" class="cab-fav-del" data-act="fav-del" data-k="${escapeHTML(f.k)}" aria-label="${escapeHTML('Прибрати з обраного: ' + f.t)}" title="Прибрати з обраного">★</button></div>`
      + `<div class="cab-fav-phones">${phones || '<span class="cab-empty">Номера немає</span>'}</div></div>`;
  }).join('') + '</div>'
    + (guide ? '<button type="button" class="cab-btn cab-btn-ghost cab-wide" data-act="fav-guide">Додати з довідника</button>' : '')
    + '<p class="cab-fine">Список зберігається на цьому пристрої.</p>';
}

// Зірочка «В обране» в «Міському довіднику»
let pbFavIndex = {};
function pbToggleFav(btn) {
  const it = pbFavIndex[btn.dataset.k]; if (!it) return;
  const list = myFavs(), i = list.findIndex(f => f.k === it.k);
  if (i >= 0) list.splice(i, 1);
  else {
    if (list.length >= MY_FAV_MAX) { showToast(`В «Обраному» вже ${MY_FAV_MAX} номерів — приберіть зайві в кабінеті`, 'error'); return; }
    list.unshift({ k: it.k, t: it.t, p: it.p, c: it.c });
  }
  mySet(MY_FAV_KEY, list);
  const on = i < 0;
  btn.classList.toggle('on', on); btn.textContent = on ? '★' : '☆';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', (on ? 'Прибрати з обраного: ' : 'Додати в обране: ') + it.t);
  showToast(on ? '⭐ Додано в «Обране» — воно в кабінеті' : 'Прибрано з «Обраного»', on ? 'success' : 'info');
}

// «Мої дані»: підставити ім'я й телефон у щойно відкриту форму (лише в порожні поля)
function cabFillForm(form) {
  if (!form) return;
  const p = myProfile(), name = p.name || (cabUser ? cabName(cabUser).split(' ')[0] : '');
  if (p.phone) form.querySelectorAll('input[type="tel"][name="phone"], #input-phone').forEach(i => { if (!i.value || i.value === '+380') i.value = p.phone; });
  const n = form.querySelector('#input-name');
  if (n && name && !n.value) n.value = name.slice(0, 30);
  const sc = form.querySelector('#beta-feedback-contact');
  if (sc && !sc.value) { let last = ''; try { last = localStorage.getItem('support_contact') || ''; } catch (e) {} sc.value = last || p.phone || ''; }
}
function cabMeSave(form) {
  const name = form.querySelector('#cab-me-name').value.trim().replace(/\s+/g, ' ').slice(0, 30);
  let phone = form.querySelector('#cab-me-phone').value.trim();
  const msg = (t, k) => { const m = document.getElementById('cab-me-msg'); if (m) { m.textContent = t; m.className = 'cab-msg' + (k ? ' cab-msg-' + k : ''); } };
  if (phone === '+380' || phone === '') phone = '';
  else if (!/^\+380\d{9}$/.test(phone)) { msg('Телефон — у форматі +380 і ще 9 цифр, напр. +380971234567.', 'err'); return; }
  mySet(MY_PROFILE_KEY, name || phone ? { name: name, phone: phone } : null);
  const del = form.querySelector('[data-act="me-clear"]'); if (del) del.hidden = !(name || phone);
  msg(name || phone ? 'Збережено. Тепер ці дані самі підставлятимуться у форми.' : 'Дані стерто.', 'ok');
  renderCabinet();
}

// Дії особистих екранів (працюють і без входу)
function cabMineAction(act, btn) {
  if (act === 'day-light') { if (svitloTileState) openSvitloModal(); else showToast('Графік відключень зараз не публікується', 'info'); return; }
  if (act === 'day-bin') { if (CAB_BIN_ON) { cabHomeQ = ''; cabShowView('myhome'); } return; }
  if (act === 'day-trains') { cabShowView('mytrains'); return; }
  if (act === 'home-pick') {
    const [ri, si] = String(btn.dataset.i || '').split(':').map(Number);
    const r = allGarbageRoutes[ri], st = r && r.stops[si];
    if (!st) return;
    mySet(MY_HOME_KEY, { address: st.address, route: r.name });
    cabHomeQ = ''; const q = document.getElementById('cab-home-q'); if (q) q.value = '';
    showToast('🏠 Адресу збережено', 'success');
    renderCabinet();
    const c = document.getElementById('cabinet'); if (c) c.scrollTop = 0;
    return;
  }
  if (act === 'home-clear') { mySet(MY_HOME_KEY, null); showToast('Адресу прибрано', 'info'); renderCabinet(); return; }
  if (act === 'tr-pin') {
    const num = btn.dataset.num, pins = myTrains(), i = pins.indexOf(num);
    if (i >= 0) pins.splice(i, 1); else pins.push(num);
    mySet(MY_TRAINS_KEY, pins.length ? pins : null);
    renderCabinet();
    return;
  }
  if (act === 'fav-del') { mySet(MY_FAV_KEY, myFavs().filter(f => f.k !== btn.dataset.k)); showToast('Прибрано з «Обраного»', 'info'); renderCabinet(); return; }
  if (act === 'fav-guide') { cabGoSection('city-guide-tab', 'market'); return; }
  if (act === 'me-clear') {
    mySet(MY_PROFILE_KEY, null);
    const n = document.getElementById('cab-me-name'), p = document.getElementById('cab-me-phone');
    if (n) n.value = ''; if (p) p.value = '+380'; btn.hidden = true;
    const m = document.getElementById('cab-me-msg'); if (m) { m.textContent = 'Дані стерто.'; m.className = 'cab-msg cab-msg-ok'; }
    renderCabinet();
  }
}

// З кабінету — у розділ сайту окремим кроком історії: «Назад» поверне в кабінет, на той самий екран
function cabGoSection(tabId, group) {
  const root = document.documentElement;
  root.classList.remove('cabinet-open');
  openTileSection(tabId, group);
  try { history.pushState({ tileSection: tabId, fromCabinet: cabView }, ''); } catch (e) {}
}

// === Сповіщення в кабінеті: усі ті самі теми й дії, що й у вікні «Важливі сповіщення» старого дизайну ===
// Працюють і без входу: підписка, як і раніше, прив'язана до цього пристрою (браузера).
let cabPushDraft = null;        // теми, які людина зараз обирає (до збереження)
let cabPushConfirmOff = false;  // підтвердження «Вимкнути всі сповіщення»
function cabPushSubscribed() { return localStorage.getItem('push_subscribed') === '1' && ('Notification' in window) && Notification.permission === 'granted'; }
function cabPushSaved() { return (cabPushSubscribed() ? getCurrentCategories() : getDefaultCategories()).slice(); }
function cabPushDirty() { return (cabPushDraft || []).slice().sort().join(',') !== cabPushSaved().sort().join(','); }

function renderCabPush() {
  const box = document.getElementById('cab-push');
  if (!box) return;
  if (!cabPushDraft) cabPushDraft = cabPushSaved();
  const sub = cabPushSubscribed();
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const ios = isIOS() && !isPWA();
  const n = sub ? getCurrentCategories().length : 0, k = cabPushDraft.length;
  const stat = sub ? ['ok', `Увімкнено · ${n} ${pluralUk(n, 'тема', 'теми', 'тем')}`] : perm === 'denied' ? ['bad', 'Заблоковано'] : ['off', 'Вимкнено'];
  let note = '';
  if (ios) note = `<div class="cab-note"><b>На iPhone — з головного екрана</b><span>Через обмеження Apple сповіщення на iPhone працюють, лише коли сайт додано на головний екран і відкрито з іконки.</span><div class="cab-row"><button type="button" class="cab-btn cab-btn-sm" data-act="push-ios">Як додати на головний екран</button></div></div>`;
  else if (!isPushSupported()) note = `<div class="cab-note"><b>Цей браузер не підтримує сповіщення</b><span>Відкрийте сайт у Chrome на Android або встановіть його як застосунок.</span></div>`;
  else if (perm === 'denied') note = `<div class="cab-note"><b>Сповіщення заборонено для сайту</b><span>Дозвольте їх у налаштуваннях браузера: значок 🔒 біля адреси → «Сповіщення» → «Дозволити». Потім поверніться сюди.</span></div>`;
  const groups = {};
  PUSH_CATEGORIES.forEach(c => { (groups[c.group] = groups[c.group] || []).push(c); });
  const grid = Object.keys(groups).map(g => `<div class="cab-pgroup"><div class="cab-pgroup-head">${escapeHTML(g)}</div><div class="cab-pgrid">${groups[g].map(c => `<label class="cab-ptile" title="${escapeHTML(c.desc)}"><input type="checkbox" data-cat="${escapeHTML(c.id)}"${cabPushDraft.includes(c.id) ? ' checked' : ''}><span class="cab-ptile-ico" aria-hidden="true">${c.icon}</span><span class="cab-ptile-name">${escapeHTML(c.name)}</span><span class="cab-ptile-check" aria-hidden="true">✓</span></label>`).join('')}</div></div>`).join('');
  const canOn = isPushSupported() && perm !== 'denied';
  let bar = '';
  if (!sub) bar = ios ? `<button type="button" class="cab-submit" data-act="push-ios">Увімкнути сповіщення</button>`
    : `<button type="button" class="cab-submit" data-act="push-on"${canOn && k ? '' : ' disabled'}>Увімкнути сповіщення · ${k} ${pluralUk(k, 'тема', 'теми', 'тем')}</button>`;
  else if (cabPushDirty()) bar = `<button type="button" class="cab-submit" data-act="push-save">Зберегти зміни</button>`;
  const off = !sub ? '' : cabPushConfirmOff
    ? `<div class="cab-confirm"><b>Вимкнути всі сповіщення?</b><span>Ви більше не отримуватимете жодних сповіщень. Увімкнути знову можна будь-коли.</span><div class="cab-row"><button type="button" class="cab-btn cab-btn-sm cab-btn-danger" data-act="push-off-yes">Так, вимкнути</button><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="push-off-no">Скасувати</button></div></div>`
    : `<button type="button" class="cab-link cab-link-danger" data-act="push-off">Вимкнути всі сповіщення</button>`;
  // «Графік світла»: лише про свою чергу — підказати обрати її (або показати, яку обрано)
  let queue = '';
  if (cabPushDraft.includes('svitlo')) {
    const my = currentSvitloData ? svitloMyQueue(currentSvitloData) : null, id = getSvitloChoice();
    const q = my ? my.queue : id ? id.split('|').pop() : '';
    queue = q
      ? `<div class="cab-pqueue"><span>💡 Про світло — лише для <b>черги ${escapeHTML(q)}</b></span><button type="button" class="cab-link" data-act="push-queue">Змінити</button></div>`
      : `<div class="cab-note cab-pqueue-note"><b>💡 Оберіть свою чергу світла</b><span>Тоді сповіщення про графік приходитимуть лише про вашу чергу, а не про всі одразу.</span><div class="cab-row"><button type="button" class="cab-btn cab-btn-sm" data-act="push-queue">Обрати чергу</button></div></div>`;
  }
  const html = `
    <div class="cab-pstatus"><span class="cab-pstat cab-pstat-${stat[0]}">${stat[1]}</span><span class="cab-pcount">Обрано ${k} з ${PUSH_CATEGORIES.length}</span></div>
    <p class="cab-push-sub">Торкніться плитки, щоб увімкнути чи вимкнути тему.</p>
    ${note}${queue}
    ${grid}
    <div class="cab-prow"><button type="button" class="cab-btn cab-btn-sm" data-act="push-all">Обрати все</button><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="push-none">Зняти все</button></div>
    ${off}
    <div class="cab-pbar"${bar ? '' : ' hidden'}>${bar}</div>`;
  if (box.dataset.v !== html) { box.dataset.v = html; box.innerHTML = html; }
}
// Плитку теми торкнули — оновлюємо вибір і перемальовуємо (лічильник, кнопка внизу)
function cabPushToggle(input) {
  const id = input.dataset.cat;
  cabPushDraft = (cabPushDraft || []).filter(x => x !== id);
  if (input.checked) cabPushDraft.push(id);
  renderCabPush();
}
async function cabPushAction(act, btn) {
  if (act === 'push-all') { cabPushDraft = PUSH_CATEGORIES.map(c => c.id); renderCabPush(); return; }
  if (act === 'push-none') { cabPushDraft = []; renderCabPush(); return; }
  if (act === 'push-ios') { showIOSInstructions(); return; }
  if (act === 'push-queue') { if (svitloTileState) openSvitloModal(); else showToast('Графік відключень зараз не публікується', 'info'); return; }
  if (act === 'push-off') { cabPushConfirmOff = true; renderCabPush(); return; }
  if (act === 'push-off-no') { cabPushConfirmOff = false; renderCabPush(); return; }
  const done = () => { cabPushDraft = null; cabPushConfirmOff = false; renderCabPush(); };
  if (act === 'push-off-yes') return cabBusy(btn, async () => { await unsubscribeFromPush(); done(); });
  if (!cabPushDraft || !cabPushDraft.length) {
    if (act === 'push-save') { cabPushConfirmOff = true; renderCabPush(); return; } // зняли всі теми — це вимкнення
    showToast('⚠️ Оберіть хоча б одну тему', 'error'); return;
  }
  if (act === 'push-on') return cabBusy(btn, async () => { await subscribeToPush(cabPushDraft.slice()); done(); });
  if (act === 'push-save') return cabBusy(btn, async () => { await savePushPreferences(cabPushDraft.slice()); done(); });
}
// === «Мої оголошення» в кабінеті ===
// Поїздки з «Попутників» приймає наш сервер на Railway — він пам'ятає, хто подав поїздку з кабінету.
// Барахолка, Нерухомість, Знахідки, Вакансії (і Акції) йдуть через Apps Script у таблицю, а хто що подав
// з кабінету, скрипт записує в окрему приватну таблицю (Cabinet.gs) — звідти й список нижче.
const BLABLA_API = 'https://vilnohirsk-blablacar-api-production-67d3.up.railway.app';
const CAB_AD_KINDS = {
  flea:   { name: 'Барахолка',   ico: '🛍️', btn: 'Барахолка',   form: ['custom-flea-form', 'flea-modal'],     cache: 'flea_csv',   reload: () => loadFleaMarketData() },
  estate: { name: 'Нерухомість', ico: '🏠', btn: 'Нерухомість', form: ['custom-estate-form', 'estate-modal'], cache: 'estate_csv', reload: () => loadEstateData() },
  lost:   { name: 'Знахідки',    ico: '🔍', btn: 'Знахідки',    form: ['custom-lost-form', 'lost-modal'],     cache: 'lost_csv',   reload: () => loadLostFoundData() },
  job:    { name: 'Вакансії',    ico: '💼', btn: 'Вакансія',    form: ['custom-job-form', 'job-modal'],       cache: 'jobs_csv',   reload: () => loadJobsData() },
  promo:  { name: 'Акції',       ico: '🔥', btn: '',            form: null,                                   cache: 'promos_api', reload: () => loadPromosData() }
};
// Як показати статус оголошення з таблиці: [клас, напис, пояснення]
const CAB_AD_ST = {
  published:  ['cab-ad-st-on',   'Опубліковано', ''],
  moderation: ['cab-ad-st-wait', 'На модерації', "Оголошення перевіряє адміністратор. Після перевірки воно з'явиться в розділі."],
  pending:    ['cab-ad-st-wait', 'Обробляється', 'Зберігаємо фото й перевіряємо текст. Оновіть сторінку за хвилину.'],
  rejected:   ['cab-ad-st-bad',  'Відхилено',    'Не пройшло перевірку. Виправте текст і подайте знову.'],
  removed:    ['cab-ad-st-off',  'Знято',        'Оголошення прибрано з розділу.'],
  blocked:    ['cab-ad-st-bad',  'Заблоковано',  'Оголошення заблоковано адміністратором.'],
  other:      ['cab-ad-st-off',  '',             '']
};
function cabAdsBlank() { return { state: 'idle', rides: [], adsState: 'idle', ads: [], confirm: '' }; }
let cabAds = cabAdsBlank(); // state — поїздки, adsState — оголошення: idle | loading | ready | error | noserver | auth
let cabAdsSeq = 0;

// quiet — тихе оновлення: список лишається на місці, поки вантажимо новий
async function cabLoadAds(quiet) {
  if (!cabUser) { cabAds = cabAdsBlank(); return; }
  const seq = ++cabAdsSeq;
  if (!quiet || cabAds.state !== 'ready') cabAds.state = 'loading';
  if (!quiet || cabAds.adsState !== 'ready') cabAds.adsState = 'loading';
  renderCabinet();
  let token = '';
  try { token = await cabUser.getIdToken(); } catch (e) {}
  const [rides, ads] = await Promise.all([cabFetchRides(token), cabFetchSheetAds(token)]);
  if (seq !== cabAdsSeq || !cabUser) return; // поки вантажили, людина вийшла або почалось нове завантаження
  if (typeof ads.banned === 'boolean') { cabBanned = ads.banned; cabSaveFlags(); }
  delete ads.banned;
  if (!(quiet && rides.state === 'error' && cabAds.state === 'ready')) Object.assign(cabAds, rides);
  if (!(quiet && ads.adsState === 'error' && cabAds.adsState === 'ready')) Object.assign(cabAds, ads);
  renderCabinet();
}
async function cabFetchRides(token) {
  try {
    const r = await fetchWithTimeout(BLABLA_API + '/api/my-rides', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }, 15000);
    if (r.status === 404) return { state: 'noserver' }; // сервер попуток ще не оновлено
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return { state: 'ready', rides: Array.isArray(d) ? d : [] };
  } catch (e) { logSectionError('мої поїздки', e); return { state: 'error' }; }
}
async function cabFetchSheetAds(token) {
  try {
    const d = await cabScript({ formType: 'cabinet_my_ads', idToken: token });
    if (d.status === 'ok' && Array.isArray(d.ads)) return { adsState: 'ready', ads: d.ads, banned: d.banned };
    if (d.status === 'auth') return { adsState: 'auth' };
    throw new Error(d.message || 'status ' + d.status);
  } catch (e) { logSectionError('мої оголошення', e); return { adsState: 'error' }; }
}
// Запит до Apps Script, відповідь якого треба прочитати. text/plain — щоб браузер не слав окремий CORS-запит наперед
async function cabScript(payload) {
  const r = await fetchWithTimeout(APP_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), cache: 'no-store' }, 30000);
  const text = await r.text();
  try { return JSON.parse(text); } catch (e) { throw new Error('Apps Script відповів не JSON — скрипт ще не оновлено?'); }
}
// Токен входу для форм оголошень — коли людина увійшла в кабінет
async function cabAdsToken() {
  if (!cabUser) return '';
  try { return await cabUser.getIdToken(); } catch (e) { return ''; }
}
function cabAdsChanged() { if (cabUser) cabLoadAds(true); } // подали оголошення — оновити «Мої оголошення» і лічильник на плитці

function cabRideActive(x) { return String(x.date || '') >= getKyivDateISO(); }
function cabSheetAdActive(a) { return a.state === 'published' || a.state === 'moderation' || a.state === 'pending'; }
function cabAdsTileText() {
  if (cabAds.state !== 'ready' && cabAds.adsState !== 'ready') return 'Ваші поїздки й оголошення';
  const n = (cabAds.state === 'ready' ? cabAds.rides.filter(cabRideActive).length : 0)
    + (cabAds.adsState === 'ready' ? cabAds.ads.filter(cabSheetAdActive).length : 0);
  return n ? `${n} ${pluralUk(n, 'активне оголошення', 'активні оголошення', 'активних оголошень')}` : 'Активних поки немає';
}
function cabAdsHtml() { return (cabBanned ? CAB_BANNED_NOTE : '') + cabRidesCardHtml() + cabSheetAdsCardHtml(); }

function cabRidesCardHtml() {
  const newBtns = `<div class="cab-row cab-ads-new"><button type="button" class="cab-btn" data-act="ride-new-driver">🚗 Я водій — запропоную</button><button type="button" class="cab-btn" data-act="ride-new-passenger">🧍 Я пасажир — шукаю</button></div>`;
  let list;
  if (cabAds.state === 'loading' || cabAds.state === 'idle') list = `<p class="cab-empty">Завантаження…</p>`;
  else if (cabAds.state === 'noserver') list = `<p class="cab-empty">Сервер попуток ще не оновлено. Щойно його оновлять, тут з'являться поїздки, які ви подасте з кабінету.</p>`;
  else if (cabAds.state === 'error') list = `<p class="cab-empty">Не вдалося завантажити поїздки. Перевірте інтернет.</p><button type="button" class="cab-btn cab-btn-sm" data-act="ads-reload">Спробувати ще раз</button>`;
  else if (!cabAds.rides.length) list = `<p class="cab-empty">Поки немає жодної поїздки. Подайте її кнопкою нижче — і вона з'явиться тут. Поїздки, подані без входу в кабінет, сюди не потрапляють.</p>`;
  else list = cabAds.rides.map(x => {
    const id = String(x._id || ''), active = cabRideActive(x), drv = x.type !== 'passenger';
    const d = String(x.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const meta = [d ? `${d[3]}.${d[2]}` : escapeHTML(String(x.date || '')), x.time ? escapeHTML(String(x.time)) : '', x.seats ? `${escapeHTML(String(x.seats))} ${drv ? 'місц.' : 'потр. місц.'}` : '', drv ? (x.price > 0 ? `${escapeHTML(String(x.price))} грн` : 'ціна договірна') : ''].filter(Boolean).join(' · ');
    const act = cabAds.confirm === id
      ? `<div class="cab-confirm"><b>Видалити поїздку?</b><span>Її більше не буде видно в «Попутниках».</span><div class="cab-row"><button type="button" class="cab-btn cab-btn-sm cab-btn-danger" data-act="ride-del-yes" data-id="${escapeHTML(id)}">Так, видалити</button><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="ride-del-no">Скасувати</button></div></div>`
      : `<div class="cab-ad-actions"><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="ride-del" data-id="${escapeHTML(id)}">Видалити</button></div>`;
    return `<div class="cab-ad${active ? '' : ' cab-ad-past'}">
      <div class="cab-ad-top"><span class="cab-ad-kind">${drv ? '🚗 Пропозиція водія' : '🧍 Запит пасажира'}</span><span class="cab-ad-st ${active ? 'cab-ad-st-on' : 'cab-ad-st-off'}">${active ? 'Опубліковано' : 'Минула'}</span></div>
      <b class="cab-ad-title">${escapeHTML(String(x.from || ''))} → ${escapeHTML(String(x.to || ''))}</b>
      <span class="cab-ad-meta">${meta}</span>
      ${x.comment ? `<span class="cab-ad-note">💬 ${escapeHTML(String(x.comment))}</span>` : ''}
      ${act}
    </div>`;
  }).join('');
  return `
    <div class="cab-card cab-ads">
      <div class="cab-card-head">🚗 Попутники</div>
      ${list}
      ${cabBanned ? '' : newBtns}
    </div>`;
}

function cabSheetAdsCardHtml() {
  const st = cabAds.adsState;
  let list;
  if (st === 'loading' || st === 'idle') list = `<p class="cab-empty">Завантаження…</p>`;
  else if (st === 'auth') list = `<p class="cab-empty">Не вдалося підтвердити вхід. Вийдіть з кабінету й увійдіть знову.</p>`;
  else if (st === 'error') list = `<p class="cab-empty">Не вдалося завантажити оголошення. Перевірте інтернет.</p><button type="button" class="cab-btn cab-btn-sm" data-act="ads-reload">Спробувати ще раз</button>`;
  else if (!cabAds.ads.length) list = `<p class="cab-empty">Поки немає жодного. Подайте оголошення кнопкою нижче — тут буде видно, чи пройшло воно модерацію. Оголошення, подані без входу в кабінет, сюди не потрапляють.</p>`;
  else list = cabAds.ads.map(cabSheetAdHtml).join('');
  const btns = Object.keys(CAB_AD_KINDS).filter(k => CAB_AD_KINDS[k].form)
    .map(k => `<button type="button" class="cab-btn" data-act="ad-new" data-kind="${k}">${CAB_AD_KINDS[k].ico} ${CAB_AD_KINDS[k].btn}</button>`).join('');
  return `
    <div class="cab-card cab-ads">
      <div class="cab-card-head">📦 Оголошення</div>
      ${list}
      ${cabBanned ? '' : `<span class="cab-ads-new-l">Подати нове:</span>
      <div class="cab-row cab-ads-new cab-ads-new4">${btns}</div>`}
    </div>`;
}
function cabAdPrice(a) {
  const p = String(a.price || '').trim();
  if (!p || p === '-') return '';
  return (a.kind === 'flea' || a.kind === 'job') && /^\d[\d\s.,]*$/.test(p) ? p + ' грн' : p;
}
function cabSheetAdHtml(a) {
  const k = CAB_AD_KINDS[a.kind] || { name: 'Оголошення', ico: '📦' };
  const st = CAB_AD_ST[a.state] || CAB_AD_ST.other;
  const id = String(a.id || ''), removed = a.state === 'removed';
  const kind = a.kind === 'lost' && a.sub ? (a.sub === 'Втрачено' ? '❗ Втрачено' : '🔍 Знайдено') : `${k.ico} ${k.name}`;
  const pill = st[1] || String(a.statusText || '').slice(0, 24) || 'Невідомо';
  const d = a.date ? new Date(a.date) : null;
  const when = d && !isNaN(d) ? 'Подано ' + d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Kyiv' }) : '';
  const meta = [when, cabAdPrice(a), a.kind === 'job' || a.kind === 'promo' ? String(a.sub || '') : ''].filter(Boolean).map(escapeHTML).join(' · ');
  const photo = a.photo ? `<img class="cab-ad-ph" src="${escapeHTML(getDriveImageUrl(a.photo))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const act = cabAds.confirm === id
    ? `<div class="cab-confirm"><b>Видалити оголошення?</b><span>${a.state === 'published' ? `Його більше не буде видно в розділі «${escapeHTML(k.name)}».` : 'Воно зникне з цього списку.'}</span><div class="cab-row"><button type="button" class="cab-btn cab-btn-sm cab-btn-danger" data-act="ad-del-yes" data-id="${escapeHTML(id)}">Так, видалити</button><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="ad-del-no">Скасувати</button></div></div>`
    : `<div class="cab-ad-actions"><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="${removed ? 'ad-del-yes' : 'ad-del'}" data-id="${escapeHTML(id)}">${removed ? 'Прибрати зі списку' : 'Видалити'}</button></div>`;
  return `<div class="cab-ad${removed || a.state === 'rejected' ? ' cab-ad-past' : ''}">
      <div class="cab-ad-top"><span class="cab-ad-kind">${kind}</span><span class="cab-ad-st ${st[0]}">${escapeHTML(pill)}</span></div>
      <div class="cab-ad-main">${photo}<div class="cab-ad-txt"><b class="cab-ad-title">${escapeHTML(String(a.title || '').trim() || 'Без назви')}</b>${meta ? `<span class="cab-ad-meta">${meta}</span>` : ''}</div></div>
      ${st[2] ? `<span class="cab-ad-note">${st[2]}</span>` : ''}
      ${act}
    </div>`;
}

async function cabAdsAction(act, btn) {
  if (act === 'ads-reload') return cabLoadAds();
  if (act === 'ride-new-driver' || act === 'ride-new-passenger') {
    openModalForm('custom-blabla-form', 'blabla-modal');
    document.getElementById('input-type').value = act === 'ride-new-driver' ? 'driver' : 'passenger';
    const nm = document.getElementById('input-name'); if (nm && !nm.value && cabUser) nm.value = cabName(cabUser).slice(0, 30);
    return;
  }
  if (act === 'ad-new') { const k = CAB_AD_KINDS[btn.dataset.kind]; if (k && k.form) openModalForm(k.form[0], k.form[1]); return; }
  if (act === 'ride-del' || act === 'ad-del') { cabAds.confirm = btn.dataset.id; renderCabinet(); return; }
  if (act === 'ride-del-no' || act === 'ad-del-no') { cabAds.confirm = ''; renderCabinet(); return; }
  if (act === 'ride-del-yes') return cabBusy(btn, async () => {
    const id = btn.dataset.id;
    try {
      const token = await cabUser.getIdToken();
      const r = await fetchWithTimeout(BLABLA_API + '/api/rides/' + encodeURIComponent(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }, 15000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
    } catch (e) { showToast('❌ Не вдалося видалити поїздку. Спробуйте ще раз.', 'error'); return; }
    cabAds.rides = cabAds.rides.filter(x => String(x._id) !== id); cabAds.confirm = '';
    renderCabinet();
    delete memoryDataCache['blabla_api']; loadBlaBlaCarData(); // список у «Попутниках» — одразу без неї
    showToast('Поїздку видалено', 'info');
  });
  if (act === 'ad-del-yes') return cabBusy(btn, async () => {
    const id = btn.dataset.id, ad = cabAds.ads.find(a => String(a.id) === id);
    try {
      const d = await cabScript({ formType: 'cabinet_delete_ad', idToken: await cabUser.getIdToken(), id });
      if (d.status !== 'ok' && d.status !== 'notfound') throw new Error(d.message || 'status ' + d.status);
    } catch (e) { logSectionError('видалення оголошення', e); showToast('❌ Не вдалося видалити оголошення. Спробуйте ще раз.', 'error'); return; }
    cabAds.ads = cabAds.ads.filter(a => String(a.id) !== id); cabAds.confirm = '';
    renderCabinet();
    const k = ad && CAB_AD_KINDS[ad.kind];
    if (k && ad.state === 'published') { delete memoryDataCache[k.cache]; try { k.reload(); } catch (e) {} } // розділ — одразу без нього
    showToast(ad && ad.state === 'removed' ? 'Прибрано зі списку' : 'Оголошення видалено', 'info');
  });
}

// === Статистика й блокування (лише для адміністратора) ===
// Хто адміністратор, вирішує Apps Script: підтверджений e-mail зі списку у Властивостях скрипта (CABINET_ADMINS).
// Сайт лише показує плитку тим, кому скрипт відповів admin: true; самі дані скрипт віддає тільки адміну.
let cabIsAdmin = false, cabBanned = false;
let cabStats = null;      // { state: loading | ready | error | forbidden | noadmin | auth, users, phones, sheet }
let cabStatsConfirm = ''; // uid, для якого показано «Заблокувати?»
let cabStatsQuery = '';   // пошук у списку користувачів
const CAB_DAY = 864e5;
const CAB_STATS_ICO = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>';
const CAB_BANNED_NOTE = '<div class="cab-confirm cab-banned"><b>🚫 Акаунт заблоковано</b><span>Адміністратор заблокував цей акаунт: подавати з нього оголошення й поїздки не можна. Якщо це помилка — напишіть нам у Telegram <a href="https://t.me/vilnohirsk" target="_blank" rel="noopener">@vilnohirsk</a>.</span></div>';

function cabHelloState() { try { return JSON.parse(localStorage.getItem('cab_hello') || '{}') || {}; } catch (e) { return {}; } }
function cabSaveFlags() {
  if (!cabUser) return;
  const st = cabHelloState();
  if (st.uid !== cabUser.uid) return;
  st.admin = cabIsAdmin; st.banned = cabBanned;
  try { localStorage.setItem('cab_hello', JSON.stringify(st)); } catch (e) {}
}
// Новий вхід або вихід: прапорці «адмін» і «заблоковано» — з останньої відповіді скрипта для цього акаунта
function cabResetAdmin(u) {
  const st = cabHelloState();
  cabIsAdmin = !!(u && st.uid === u.uid && st.admin);
  cabBanned = !!(u && st.uid === u.uid && st.banned);
  cabStats = null; cabStatsConfirm = ''; cabStatsQuery = '';
}
// Відмітка візиту для статистики: не частіше ніж раз на 3 години з цього пристрою.
// force — людина сама відкрила кабінет: перепитуємо одразу (не частіше ніж раз на хвилину), щоб
// новий адмін чи щойно заблокований побачили свій стан без 3-годинного очікування.
let cabHelloAt = 0;
async function cabHello(force) {
  const u = cabUser; if (!u) return;
  const st = cabHelloState();
  if (force ? Date.now() - cabHelloAt < 60 * 1000 : (st.uid === u.uid && Date.now() - (st.t || 0) < 3 * 3600 * 1000)) return;
  cabHelloAt = Date.now();
  try {
    const d = await cabScript({ formType: 'cabinet_hello', idToken: await u.getIdToken() });
    if (d.status !== 'ok' || cabUser !== u) return;
    cabIsAdmin = !!d.admin; cabBanned = !!d.banned;
    try { localStorage.setItem('cab_hello', JSON.stringify({ uid: u.uid, t: Date.now(), admin: cabIsAdmin, banned: cabBanned })); } catch (e) {}
    renderAccount();
  } catch (e) { logSectionError('кабінет: відмітка візиту', e); }
}
// Перед видаленням акаунта: стерти e-mail та ім'я із записів статистики
async function cabBye() {
  try { await cabScript({ formType: 'cabinet_bye', idToken: await cabUser.getIdToken() }); } catch (e) { logSectionError('кабінет: видалення з таблиці', e); }
  try { localStorage.removeItem('cab_hello'); } catch (e) {}
}
// Заблокованому не даємо подати оголошення (сервер його все одно не прийме)
function cabBlockedSubmit() {
  if (!(cabUser && cabBanned)) return false;
  showToast('🚫 Ваш акаунт заблоковано: подавати оголошення не можна', 'error');
  return true;
}

async function cabLoadStats() {
  const u = cabUser; if (!u) return;
  if (!cabStats || cabStats.state !== 'ready') cabStats = { state: 'loading' };
  renderCabinet();
  let next;
  try {
    const d = await cabScript({ formType: 'cabinet_admin_stats', idToken: await u.getIdToken() });
    next = d.status === 'ok'
      ? { state: 'ready', users: Array.isArray(d.users) ? d.users : [], phones: Number(d.phones) || 0, sheet: String(d.sheet || '') }
      : { state: ['forbidden', 'noadmin', 'auth'].indexOf(d.status) >= 0 ? d.status : 'error' };
  } catch (e) { logSectionError('статистика', e); next = { state: 'error' }; }
  if (cabUser !== u) return;
  if (next.state === 'forbidden' || next.state === 'noadmin') { cabIsAdmin = false; cabSaveFlags(); }
  cabStats = next;
  renderCabinet();
}

const cabDayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' });
function cabKyivDay(ms) { const p = {}; cabDayFmt.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day}`; }
function cabDdMm(ms, year) { const d = cabKyivDay(ms).split('-'); return year ? `${d[2]}.${d[1]}.${d[0]}` : `${d[2]}.${d[1]}`; }
function cabAgo(ms) {
  const d = cabKyivDay(ms);
  return d === cabKyivDay(Date.now()) ? 'сьогодні' : d === cabKyivDay(Date.now() - CAB_DAY) ? 'вчора' : cabDdMm(ms, true);
}
function cabStatsLive() { return cabStats && cabStats.state === 'ready' ? cabStats.users.filter(u => !u.deleted) : []; }
function cabStatsNew(users, days) { const from = Date.now() - days * CAB_DAY; return users.filter(u => !u.early && u.created >= from).length; }
function cabStatsTileText() {
  if (!cabStats || cabStats.state !== 'ready') return 'Хто зареєструвався · блокування';
  const live = cabStatsLive();
  return `${live.length} ${pluralUk(live.length, 'користувач', 'користувачі', 'користувачів')} · +${cabStatsNew(live, 7)} за тиждень`;
}

function cabStatsHtml() {
  const s = cabStats || { state: 'loading' };
  if (s.state === 'loading') return '<div class="cab-card"><p class="cab-empty">Завантаження…</p></div>';
  if (s.state === 'noadmin') return '<div class="cab-card"><p class="cab-empty">Адміністратора ще не призначено: додайте свій e-mail у Властивості скрипта Apps Script, ключ CABINET_ADMINS.</p></div>';
  if (s.state === 'forbidden') return '<div class="cab-card"><p class="cab-empty">Статистика доступна лише адміністратору.</p></div>';
  if (s.state === 'auth') return '<div class="cab-card"><p class="cab-empty">Не вдалося підтвердити вхід. Вийдіть з кабінету й увійдіть знову.</p></div>';
  if (s.state !== 'ready') return '<div class="cab-card"><p class="cab-empty">Не вдалося завантажити статистику. Перевірте інтернет.</p><button type="button" class="cab-btn cab-btn-sm" data-act="stats-reload">Спробувати ще раз</button></div>';
  const now = Date.now(), users = s.users.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  const live = users.filter(u => !u.deleted), deleted = users.length - live.length;
  const active = live.filter(u => u.last >= now - 7 * CAB_DAY).length, banned = live.filter(u => u.banned).length;
  const google = live.filter(u => u.provider === 'Google').length, mail = live.filter(u => u.provider === 'E-mail').length;
  const tile = (num, label, sub, cls) => `<div class="cab-stat${cls ? ' ' + cls : ''}"><b>${num}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `
    <div class="cab-stats-grid">
      ${tile(live.length, pluralUk(live.length, 'користувач', 'користувачі', 'користувачів'), `Google ${google} · E-mail ${mail}`)}
      ${tile('+' + cabStatsNew(live, 7), 'нових за 7 днів', `за 30 днів +${cabStatsNew(live, 30)}`)}
      ${tile(active, 'заходили за 7 днів', '')}
      ${tile(banned, 'заблоковано', `телефонів у чорному списку: ${s.phones}`, banned ? 'cab-stat-bad' : '')}
    </div>
    ${deleted ? `<p class="cab-fine">Ще ${deleted} ${pluralUk(deleted, 'людина видалила', 'людини видалили', 'людей видалили')} свій акаунт.</p>` : ''}
    ${cabStatsChart(live)}
    <div class="cab-card cab-users">
      <div class="cab-card-head">👥 Хто зареєструвався</div>
      <input type="search" id="cab-stats-q" class="cab-search" placeholder="Пошук: ім'я або e-mail" autocomplete="off" aria-label="Пошук користувача">
      ${users.map(cabStatsUserHtml).join('')}
      <p class="cab-empty" id="cab-stats-none" hidden>Нікого не знайдено.</p>
    </div>
    <div class="cab-row cab-stats-tools">
      <button type="button" class="cab-btn cab-btn-ghost" data-act="stats-reload">Оновити</button>
      ${/^https:\/\/docs\.google\.com\//.test(s.sheet) ? `<a class="cab-btn cab-btn-ghost" href="${escapeHTML(s.sheet)}" target="_blank" rel="noopener">Відкрити таблицю</a>` : ''}
    </div>`;
}

// Реєстрації по днях за 30 днів (за київським часом) — тих, хто й досі з нами, як і цифри вгорі.
// Один ряд: без легенди, назва — у заголовку картки.
function cabStatsChart(users) {
  const days = [];
  for (let i = 29; i >= 0; i--) { const ms = Date.now() - i * CAB_DAY; days.push({ key: cabKyivDay(ms), ms, n: 0 }); }
  const idx = {}; days.forEach((d, i) => { idx[d.key] = i; });
  users.forEach(u => { if (u.created && !u.early) { const i = idx[cabKyivDay(u.created)]; if (i !== undefined) days[i].n++; } });
  const max = Math.max(1, ...days.map(d => d.n)), total = days.reduce((s, d) => s + d.n, 0);
  const W = 300, H = 118, L = 16, R = 2, T = 8, B = 18, ch = H - T - B, slot = (W - L - R) / days.length, bw = slot - 2, base = T + ch;
  const f = (v) => v.toFixed(1);
  const bars = days.map((d, i) => {
    const x = L + i * slot + 1, label = `${cabDdMm(d.ms)}: ${d.n} ${pluralUk(d.n, 'реєстрація', 'реєстрації', 'реєстрацій')}`;
    let mark = '';
    if (d.n) {
      const h = Math.max(3, d.n / max * ch), y = base - h, r = Math.min(3, bw / 2, h);
      mark = `<path class="cab-chart-bar" d="M${f(x)} ${base}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}H${f(x + bw - r)}Q${f(x + bw)} ${f(y)} ${f(x + bw)} ${f(y + r)}V${base}Z"/>`;
    }
    return `<g class="cab-chart-day" data-act="stats-day" data-label="${escapeHTML(label)}" tabindex="0" role="img" aria-label="${escapeHTML(label)}"><rect class="cab-chart-hit" x="${f(L + i * slot)}" y="${T}" width="${f(slot)}" height="${ch + B}"/>${mark}</g>`;
  }).join('');
  return `
    <div class="cab-card">
      <div class="cab-card-head">📈 Реєстрації за 30 днів</div>
      <p class="cab-chart-cap" id="cab-chart-cap" aria-live="polite">Усього за 30 днів: ${total}. Торкніться стовпчика, щоб побачити день.</p>
      <svg class="cab-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Реєстрації по днях за 30 днів">
        <line class="cab-chart-grid" x1="${L}" x2="${W - R}" y1="${T}" y2="${T}"/>
        <line class="cab-chart-axis" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>
        <text class="cab-chart-t" x="${L - 4}" y="${T + 3}" text-anchor="end">${max}</text>
        <text class="cab-chart-t" x="${L - 4}" y="${base + 3}" text-anchor="end">0</text>
        <text class="cab-chart-t" x="${L}" y="${H - 4}">${cabDdMm(days[0].ms)}</text>
        <text class="cab-chart-t" x="${W - R}" y="${H - 4}" text-anchor="end">сьогодні</text>
        ${bars}
      </svg>
    </div>`;
}
function cabStatsDay(g) {
  const cap = document.getElementById('cab-chart-cap');
  if (cap) cap.textContent = g.dataset.label || '';
  document.querySelectorAll('#cab-sub .cab-chart-day.on').forEach(x => x.classList.remove('on'));
  g.classList.add('on');
}

function cabStatsUserHtml(u) {
  const me = !!(cabUser && u.uid === cabUser.uid);
  const name = u.name || (u.email ? u.email.split('@')[0] : (u.deleted ? 'Акаунт видалено' : 'Без імені'));
  const badge = u.deleted ? '<span class="cab-ad-st cab-ad-st-off">Видалено</span>'
    : u.banned ? '<span class="cab-ad-st cab-ad-st-bad">Заблоковано</span>'
    : (me || u.admin) ? `<span class="cab-ad-st cab-ad-st-on">${me ? 'Це ви' : 'Адмін'}</span>`
    : u.provider ? `<span class="cab-ad-st cab-ad-st-off">${escapeHTML(u.provider)}</span>` : '';
  const meta = (u.early
    ? [u.created ? 'Перше оголошення ' + cabDdMm(u.created, true) : '']
    : [u.created ? 'Зареєстровано ' + cabDdMm(u.created, true) : '', u.last ? 'останній візит ' + cabAgo(u.last) : '', u.days > 1 ? `днів з візитами: ${u.days}` : ''])
    .concat([`оголошень: ${u.ads || 0}`]).filter(Boolean).join(' · ');
  const note = u.deleted ? `Акаунт видалено ${cabDdMm(u.deleted, true)}.`
    : u.banned ? (u.signinOff
      ? `Заблоковано ${cabDdMm(u.banned, true)}: вхід закрито, оголошення сховано, нові з її телефонів не приймаються.`
      : `Заблоковано ${cabDdMm(u.banned, true)}: оголошення сховано, нові з акаунта й телефонів не приймаються. Вхід ще відкритий — закрийте його у Firebase Console.`)
    : u.early ? 'Оголошення подано до запуску статистики; візитів відтоді не було.' : '';
  let act = '';
  if (!u.deleted && !me && !u.admin) {
    act = cabStatsConfirm === u.uid
      ? `<div class="cab-confirm"><b>Заблокувати цей акаунт?</b><span>Вхід на сайт для цієї людини закриється, її оголошення й поїздки зникнуть, а нові з її телефонів не прийматимуться. Розблокувати можна будь-коли.</span><div class="cab-row"><button type="button" class="cab-btn cab-btn-sm cab-btn-danger" data-act="stats-ban-yes" data-uid="${escapeHTML(u.uid)}">Так, заблокувати</button><button type="button" class="cab-btn cab-btn-sm cab-btn-ghost" data-act="stats-ban-no">Скасувати</button></div></div>`
      : `<div class="cab-ad-actions">${u.banned
        ? `<button type="button" class="cab-btn cab-btn-sm" data-act="stats-unban" data-uid="${escapeHTML(u.uid)}">Розблокувати</button>`
        : `<button type="button" class="cab-btn cab-btn-sm cab-btn-ghost cab-btn-warn" data-act="stats-ban" data-uid="${escapeHTML(u.uid)}">🚫 Заблокувати</button>`}</div>`;
  }
  return `<div class="cab-user${u.deleted ? ' cab-ad-past' : ''}" data-q="${escapeHTML((u.name + ' ' + u.email).toLowerCase())}">
      <div class="cab-user-top"><span class="cab-ava-txt cab-user-ava">${escapeHTML((name.trim().charAt(0) || '?').toUpperCase())}</span><div class="cab-user-id"><b>${escapeHTML(name)}</b>${u.email ? `<span>${escapeHTML(u.email)}</span>` : ''}</div>${badge}</div>
      <span class="cab-ad-meta">${escapeHTML(meta)}</span>
      ${note ? `<span class="cab-ad-note">${escapeHTML(note)}</span>` : ''}
      ${act}
    </div>`;
}
function cabStatsFilter() {
  const q = cabStatsQuery.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('#cab-sub .cab-user').forEach(el => { const hit = !q || (el.dataset.q || '').indexOf(q) >= 0; el.hidden = !hit; if (hit) shown++; });
  const none = document.getElementById('cab-stats-none'); if (none) none.hidden = shown > 0;
}
async function cabStatsAction(act, btn) {
  if (act === 'stats-reload') return cabLoadStats();
  if (act === 'stats-day') { cabStatsDay(btn); return; }
  if (act === 'stats-ban') { cabStatsConfirm = btn.dataset.uid; renderCabinet(); return; }
  if (act === 'stats-ban-no') { cabStatsConfirm = ''; renderCabinet(); return; }
  if (act === 'stats-ban-yes' || act === 'stats-unban') return cabBusy(btn, async () => {
    const ban = act === 'stats-ban-yes';
    let d = null;
    try {
      d = await cabScript({ formType: 'cabinet_admin_ban', idToken: await cabUser.getIdToken(), uid: btn.dataset.uid, ban });
      if (d.status !== 'ok') throw new Error(d.message || d.status);
    } catch (e) {
      logSectionError('блокування', e);
      showToast('❌ ' + (d && d.message ? d.message : 'Не вдалося. Спробуйте ще раз.'), 'error');
      return;
    }
    cabStatsConfirm = '';
    const closed = d.signin === 'off' || d.signin === 'gone'; // gone — акаунта у Firebase уже немає
    if (!ban) showToast(`Розблоковано${d.signin === 'on' ? ': вхід відкрито,' : '.'} повернуто оголошень: ${d.ads || 0}.`, 'info');
    else if (closed) showToast(`🚫 Заблоковано: вхід закрито, сховано оголошень: ${d.ads || 0}. Поїздки зникнуть за 2 хв.`, 'info');
    else showToast(`🚫 Заблоковано, сховано оголошень: ${d.ads || 0}. Вхід закрити не вдалося — зробіть це у Firebase Console.`, 'error');
    ['flea', 'estate', 'lost', 'job'].forEach(k => { const c = CAB_AD_KINDS[k]; delete memoryDataCache[c.cache]; try { c.reload(); } catch (e) {} });
    await cabLoadStats();
  });
}

function cabMsg(text, kind) {
  const m = document.getElementById('cab-msg');
  if (m) { m.textContent = text || ''; m.className = 'cab-msg' + (kind ? ' cab-msg-' + kind : ''); }
}
function cabError(e) {
  const code = (e && e.code) || '';
  const map = {
    'auth/invalid-email': 'Невірний формат e-mail.',
    'auth/missing-email': 'Вкажіть e-mail.',
    'auth/missing-password': 'Вкажіть пароль.',
    'auth/invalid-credential': 'Невірний e-mail або пароль.',
    'auth/invalid-login-credentials': 'Невірний e-mail або пароль.',
    'auth/wrong-password': 'Невірний e-mail або пароль.',
    'auth/user-not-found': 'Невірний e-mail або пароль.',
    'auth/email-already-in-use': 'Акаунт із таким e-mail уже є. Увійдіть або відновіть пароль.',
    'auth/weak-password': 'Пароль має бути щонайменше 6 символів.',
    'auth/too-many-requests': 'Забагато спроб. Спробуйте трохи пізніше.',
    'auth/network-request-failed': "Немає з'єднання з інтернетом.",
    'auth/popup-blocked': 'Браузер заблокував вікно входу Google. Дозвольте спливаючі вікна або увійдіть через e-mail.',
    'auth/unauthorized-domain': 'Вхід з цієї адреси ще не дозволено в налаштуваннях Firebase.',
    'auth/operation-not-allowed': 'Цей спосіб входу вимкнено.',
    'auth/user-disabled': 'Цей акаунт заблоковано. Напишіть нам у Telegram @vilnohirsk.',
    'auth/account-exists-with-different-credential': 'Цей e-mail уже зареєстровано іншим способом. Увійдіть через e-mail або Google — як реєструвались.',
    'auth/requires-recent-login': 'З міркувань безпеки увійдіть ще раз і повторіть.'
  };
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  return map[code] || ('Не вдалося. ' + (code ? '(' + code + ')' : 'Спробуйте ще раз.'));
}
async function cabBusy(btn, fn) {
  if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
  try { await fn(); } catch (e) { const t = cabError(e); if (t) cabMsg(t, 'err'); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); } }
}

async function cabAction(act, btn) {
  if (act === 'retry') { cabState = 'idle'; ensureAuth(); return; }
  if (act === 'view-push' || act === 'view-ads' || act === 'view-stats' || act === 'view-fav' || act === 'view-me') { cabShowView(act.slice(5)); return; }
  if (/^(day|home|tr|fav|me)-/.test(act)) return cabMineAction(act, btn); // особисте — і без входу
  if (act.indexOf('stats-') === 0) return cabStatsAction(act, btn);
  if (act.indexOf('ride-') === 0 || act.indexOf('ad-') === 0 || act === 'ads-reload') return cabAdsAction(act, btn);
  if (act.indexOf('push-') === 0) return cabPushAction(act, btn); // сповіщення — і без входу
  if (!cabAuth) return;
  if (act === 'mode-in' || act === 'mode-up') { cabMode = act === 'mode-up' ? 'up' : 'in'; renderCabinet(); return; }
  if (act === 'email-open') { cabEmailOpen = true; renderCabinet(); const e = document.getElementById('cab-email'); if (e) e.focus(); return; }
  if (act === 'google') return cabBusy(btn, async () => {
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    await cabAuth.signInWithPopup(p);
    showToast('✅ Ви увійшли', 'success');
  });
  if (act === 'forgot') return cabBusy(btn, async () => {
    const email = ((document.getElementById('cab-email') || {}).value || '').trim();
    if (!email) { cabMsg('Впишіть e-mail у поле вище — надішлемо лист для відновлення пароля.', 'err'); return; }
    await cabAuth.sendPasswordResetEmail(email);
    cabMsg(`Якщо акаунт з ${email} існує, ми надіслали на нього лист для відновлення пароля. Перевірте й «Спам».`, 'ok');
  });
  if (act === 'signout') return cabBusy(btn, async () => { await cabAuth.signOut(); showToast('Ви вийшли з кабінету', 'info'); });
  if (act === 'resend') return cabBusy(btn, async () => { await cabUser.sendEmailVerification(); cabMsg('Лист надіслано ще раз. Перевірте й «Спам».', 'ok'); });
  if (act === 'reload') return cabBusy(btn, async () => {
    await cabUser.reload(); cabUser = cabAuth.currentUser; renderCabinet();
    if (cabUser && !cabUser.emailVerified) cabMsg('Ще не підтверджено. Відкрийте посилання з листа.', 'err');
  });
  if (act === 'delete') { cabConfirmDelete = true; renderCabinet(); return; }
  if (act === 'delete-no') { cabConfirmDelete = false; renderCabinet(); return; }
  if (act === 'delete-yes') return cabBusy(btn, async () => {
    try { await cabBye(); await cabUser.delete(); showToast('Акаунт видалено', 'info'); }
    catch (e) {
      if (e && e.code === 'auth/requires-recent-login') { await cabAuth.signOut(); showToast('З міркувань безпеки увійдіть ще раз і повторіть видалення', 'error'); return; }
      throw e;
    }
  });
}

async function cabSubmit(form) {
  const up = cabMode === 'up';
  const email = form.querySelector('#cab-email').value.trim(), pass = form.querySelector('#cab-pass').value;
  const nameEl = form.querySelector('#cab-name'), name = nameEl ? nameEl.value.trim() : '';
  if (up && !name) { cabMsg("Вкажіть ім'я.", 'err'); return; }
  if (!email) { cabMsg('Вкажіть e-mail.', 'err'); return; }
  if (pass.length < 6) { cabMsg('Пароль має бути щонайменше 6 символів.', 'err'); return; }
  const btn = form.querySelector('.cab-submit');
  await cabBusy(btn, async () => {
    if (up) {
      const cred = await cabAuth.createUserWithEmailAndPassword(email, pass);
      try { await cred.user.updateProfile({ displayName: name }); } catch (e) {}
      try { await cred.user.sendEmailVerification(); } catch (e) {}
      cabUser = cabAuth.currentUser; renderAccount();
      showToast('✅ Акаунт створено. Підтвердьте e-mail з листа', 'success');
    } else {
      await cabAuth.signInWithEmailAndPassword(email, pass);
      showToast('✅ Ви увійшли', 'success');
    }
  });
}

function openCabinet(ev, focus) {
  if (ev) ev.stopPropagation();
  const root = document.documentElement;
  if (!root.classList.contains('tiles-mode')) return;
  root.classList.add('cabinet-open');
  cabView = focus === 'push' ? 'push' : 'home';
  if (!root.classList.contains('section-open')) {
    root.classList.add('section-open');
    try { history.pushState(cabView === 'home' ? { tileSection: 'cabinet' } : { tileSection: 'cabinet', sub: cabView }, ''); } catch (e) {}
  }
  cabPushDraft = null; cabPushConfirmOff = false; // свіжий стан підписки при кожному відкритті
  const c = document.getElementById('cabinet'); if (c) c.scrollTop = 0;
  ensureAuth(); // бібліотека входу — щойно відкрили кабінет (тим, хто вже входив, — ще під час завантаження сторінки)
  if (cabUser) cabHello(true); // свіжий стан: адмін / заблоковано
  if (cabUser && cabIsAdmin && (!cabStats || cabStats.state === 'error')) cabLoadStats(); // цифри на плитці «Статистика»
  renderCabinet();
}

function initCabinet() {
  if (!document.documentElement.classList.contains('tiles-mode')) return;
  const body = document.getElementById('cabinet-body');
  if (body) {
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) cabAction(b.dataset.act, b); });
    body.addEventListener('submit', (e) => { e.preventDefault(); if (e.target.id === 'cab-me-form') cabMeSave(e.target); else cabSubmit(e.target); });
    body.addEventListener('change', (e) => { if (e.target.matches('input[data-cat]')) cabPushToggle(e.target); });
    let homeTimer = null;
    body.addEventListener('input', (e) => {
      if (e.target.id === 'cab-stats-q') { cabStatsQuery = e.target.value; cabStatsFilter(); }
      else if (e.target.id === 'cab-home-q') { cabHomeQ = e.target.value; clearTimeout(homeTimer); homeTimer = setTimeout(cabHomeResults, 150); }
      else if (e.target.id === 'cab-me-phone') formatUAPhone(e.target);
    });
    const day = (e) => { const g = e.target.closest && e.target.closest('.cab-chart-day'); if (g) cabStatsDay(g); };
    body.addEventListener('pointerover', day); body.addEventListener('focusin', day);
  }
  renderAccount();
  // Хто вже входив на цьому пристрої — підтягуємо вхід трохи згодом, щоб не гальмувати першу появу головної;
  // аватар з'явиться, щойно Firebase згадає людину. Решті бібліотека входу вантажиться, лише коли відкривають кабінет
  if (cabAuthUsed()) setTimeout(ensureAuth, 800);
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
function getKyivDateISO(){ const n = getKyivNow(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
function getWeatherEmoji(code){ if(code === 0) return "☀️"; if(code <= 2) return "⛅"; if(code <= 3) return "☁️"; if(code <= 48) return "🌫️"; if(code <= 67) return "🌧️"; if(code <= 77) return "🌨️"; if(code <= 99) return "⛈️"; return "🌡️"; }

async function loadWeather(){
  const coords = [{name: 'Вільногірськ', lat: 48.48, lon: 34.02}, {name: 'Дніпро', lat: 48.45, lon: 34.98}]; let results = [];
  for(let c of coords){
    try {
      const d = await fetchCachedJson(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FKyiv`, 'weather_'+c.name, 30);
      if (d && d.current) { results.push({ name: c.name, w: { temperature: d.current.temperature_2m, weathercode: d.current.weather_code, windspeed: d.current.wind_speed_10m } }); }
      else if (d && d.current_weather) { results.push({name: c.name, w: d.current_weather}); }
    } catch(e) { logSectionError('погода', e); invalidateRender('render_weather'); }
  }
  const container = document.getElementById("weather-container");
  if (!container) return;
  if (!dataChanged('render_weather', results)) return; // погода та сама — не перезапускаємо слайдер
  // Гасимо старий слайдер до будь-якого виходу: інакше при збої погоди
  // таймер лишався крутитись по вже видалених слайдах
  if (window.weatherInterval) { clearInterval(window.weatherInterval); window.weatherInterval = null; }
  if(results.length === 0) { container.innerHTML = '<div class="empty-msg" style="font-size:11px;">Дані погоди тимчасово недоступні ☁️</div>'; return; }
  const slidesHtml = results.map((item, index) => {
    const t = Math.round(item.w.temperature);
    return `<div class="weather-content ${index === 0 ? 'active' : ''}" style="width: 100%;"><div class="weather-city">${escapeHTML(item.name)}</div><div class="weather-temp-row"><span class="weather-icon">${getWeatherEmoji(item.w.weathercode)}</span><span class="weather-temp">${t}°C</span></div><div class="weather-wind"><span style="font-size:14px;">🌬️</span> ${Math.round(item.w.windspeed)} м/с</div></div>`;
  }).join("");
  const dotsHtml = results.length > 1
    ? `<div class="weather-dots">${results.map((_, i) => `<div class="weather-dot ${i === 0 ? 'active' : ''}"></div>`).join('')}</div>`
    : '';
  container.innerHTML = slidesHtml + dotsHtml;
  let currentIndex = 0;
  window.weatherInterval = setInterval(() => {
      if (!isPageVisible) return;
      const slides = container.querySelectorAll('.weather-content'); if(slides.length < 2) return;
      const dots = container.querySelectorAll('.weather-dot');
      slides[currentIndex].classList.remove('active'); if(dots[currentIndex]) dots[currentIndex].classList.remove('active');
      currentIndex = (currentIndex + 1) % slides.length;
      slides[currentIndex].classList.add('active'); if(dots[currentIndex]) dots[currentIndex].classList.add('active');
  }, 7000);
}

// Ціни на пальне АЗС «Укрнафта» — ручні дані з data/fuel.yaml
let currentFuelData = null; // збережені дані для збільшеного перегляду

// Дата біля цін. Бот пише у fuel.yaml день, на який мінфін опублікував ціни, а
// публікує той їх лише в будні десь о 13:30, тож зранку у файлі ще вчорашня дата
// (у вихідні — п'ятнична чи суботня). Ціни при цьому найсвіжіші, які взагалі є,
// тому з 00:00 за Києвом показуємо сьогоднішню дату — якщо ціни у файлі не старші
// за останній будній день. Бот відстав (ціни старші) чи auto: false (ціни ведуться
// вручну) — показуємо дату з файлу як є.
function fuelShownDate(data) {
  const raw = data.updated != null ? String(data.updated).trim() : '';
  const auto = String(data.auto == null ? '' : data.auto).trim().toLowerCase();
  if (['false', 'no', 'off', '0', 'ні', 'нi', 'нет', 'вимк', 'вимкнено'].includes(auto)) return raw;
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return raw;
  const fileDay = new Date(+m[3], +m[2] - 1, +m[1]);
  if (fileDay.getDate() !== +m[1] || fileDay.getMonth() !== +m[2] - 1) return raw; // 31.02 і подібне
  const now = getKyivNow();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastWorkday = new Date(today); // до цього дня мінфін уже мав опублікувати ціни
  do { lastWorkday.setDate(lastWorkday.getDate() - 1); } while (lastWorkday.getDay() === 0 || lastWorkday.getDay() === 6);
  if (fileDay >= today || fileDay < lastWorkday) return raw;
  return `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
}
async function loadFuelData() {
  const host = document.getElementById('fuel-widget');
  if (!host) return;
  const divider = document.getElementById('fuel-divider');
  const hideFuel = () => { host.style.display = 'none'; if (divider) divider.style.display = 'none'; };
  if (!yamlReady('fuel', loadFuelData, hideFuel)) return; // немає парсера — ховаємо блок цін
  try {
    const res = await fetch('./data/fuel.yaml?v=' + Date.now());
    if (!res.ok) { hideFuel(); return; }
    const data = jsyaml.load(await res.text()) || {};
    const fuels = Array.isArray(data.fuels) ? data.fuels : [];
    if (data.show === false || fuels.length === 0) { hideFuel(); return; }

    const items = fuels.map(f => {
      if (!f) return '';
      const color = /^#[0-9a-f]{3,8}$/i.test(String(f.color || '')) ? f.color : '#00ff9c';
      const name = escapeHTML(String(f.name || ''));
      // Ціну ділимо на гривні та копійки (копійки — маленьким верхнім індексом)
      const raw = f.price != null ? String(f.price) : '—';
      let priceHtml;
      const pm = raw.match(/^(\d+)[.,](\d{1,2})$/);
      // Прихована дзеркальна копія копійок зліва центрує ціле число рівно під назвою
      // (копійки лишаються у потоці й не виходять за межі клітинки на вузьких екранах)
      if (pm) priceHtml = `<sup class="fuel-kop-ghost">${pm[2]}</sup>${pm[1]}<sup>${pm[2]}</sup>`; else priceHtml = escapeHTML(raw);
      // Назва пального — у кольорі, ціна — біла
      return `<div class="fuel-item"><span class="fuel-name" style="color:${color};">${name}</span><span class="fuel-price">${priceHtml}</span></div>`;
    }).join('');

    const shownDate = fuelShownDate(data);
    const updated = shownDate ? `<span class="fuel-updated">${escapeHTML(shownDate)}</span>` : '';
    // Зберігаємо дані для збільшеного перегляду (для людей зі слабким зором)
    currentFuelData = { fuels: fuels, updated: shownDate };
    // innerHTML лише при реальній зміні: інакше кожні 2 хв даремно перезбирали DOM і рвали виділення тексту
    if (dataChanged('render_fuel', currentFuelData)) {
      host.innerHTML = `<div class="fuel-head"><span class="fuel-title">⛽ Укрнафта <span style="font-weight:600;color:rgba(255,255,255,0.5);">грн/л</span></span>${updated}</div><div class="fuel-grid">${items}</div><div class="fuel-tap-hint">🔍 Збільшити</div>`;
    }
    host.style.display = 'block';
    host.style.cursor = 'pointer';
    host.onclick = openFuelModal;
    host.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFuelModal(); } };
    host.setAttribute('role', 'button');
    host.setAttribute('tabindex', '0');
    host.setAttribute('aria-label', 'Збільшити ціни на пальне для кращої видимості');
    if (divider) divider.style.display = 'block';
  } catch (e) { logSectionError('ціни на пальне', e); invalidateRender('render_fuel'); hideFuel(); }
}

// === ЗБІЛЬШЕНИЙ ПЕРЕГЛЯД ЦІН НА ПАЛЬНЕ (для людей зі слабким зором) ===
function buildBigFuelPrice(raw) {
  const s = raw != null ? String(raw) : '—';
  const m = s.match(/^(\d+)[.,](\d{1,2})$/);
  if (m) return `<span style="font-size:38px;font-weight:900;">${escapeHTML(m[1])}</span><span style="font-size:25px;font-weight:800;">,${escapeHTML(m[2])}</span> <span style="font-size:20px;font-weight:700;color:rgba(255,255,255,0.55);">₴</span>`;
  return `<span style="font-size:34px;font-weight:900;">${escapeHTML(s)}</span>`;
}

function openFuelModal() {
  if (!currentFuelData || !Array.isArray(currentFuelData.fuels)) return;
  const fuels = currentFuelData.fuels.filter(f => f && f.name != null && String(f.name).trim() !== '');
  if (!fuels.length) return;
  const modalId = 'fuel-zoom-modal';
  const old = document.getElementById(modalId);
  if (old) old.remove();

  const rows = fuels.map(f => {
    const color = /^#[0-9a-f]{3,8}$/i.test(String(f.color || '')) ? f.color : '#00ff9c';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border-radius:16px;background:rgba(0,0,0,0.28);border:1px solid ${color}55;margin-bottom:12px;box-shadow:0 4px 12px rgba(0,0,0,0.25);">`
      + `<span style="font-size:32px;font-weight:900;color:${color};line-height:1;letter-spacing:0.5px;">${escapeHTML(String(f.name))}</span>`
      + `<span style="color:#fff;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;">${buildBigFuelPrice(f.price)}</span>`
      + `</div>`;
  }).join('');

  const upd = currentFuelData.updated ? `<div style="text-align:center;font-size:13px;color:rgba(255,255,255,0.55);font-weight:600;margin-bottom:16px;">на ${escapeHTML(String(currentFuelData.updated))}</div>` : '';

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'custom-modal-overlay active';
  modal.onclick = (e) => { if (e.target.id === modalId) closeFuelModal(); };
  modal.innerHTML = `
    <div class="custom-modal-box" onclick="event.stopPropagation()" style="max-width:430px;">
      <div class="close-modal-btn" onclick="closeFuelModal()" style="width:42px;height:42px;font-size:28px;">&times;</div>
      <h3 class="form-title" style="color:#ffcc00;margin-bottom:4px;font-size:19px;padding-right:30px;">⛽ Ціни на пальне</h3>
      <div style="text-align:center;font-size:14px;color:rgba(255,255,255,0.7);font-weight:700;margin-bottom:16px;">«Укрнафта» · грн/л</div>
      ${upd}
      <div>${rows}</div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
}

function closeFuelModal() {
  const m = document.getElementById('fuel-zoom-modal');
  if (m) m.remove();
  if (!document.querySelector('.custom-modal-overlay.active') && !document.querySelector('.image-modal.active')) {
    document.body.style.overflow = '';
  }
}

// === ГРАФІК ВІДКЛЮЧЕНЬ СВІТЛА — дані з data/svitlo.yaml ===
let currentSvitloData = null;
// Коли вийшов графік на завтра, сьогоднішній лишається до кінця доби: GitHub (робота svitlo-today)
// зберігає попередній графік у data/svitlo-prev.yaml, а сайт показує обидва дні. Опівночі
// завтрашній стає сьогоднішнім, а вчорашній зникає сам.
let svitloPrevData = null;
let svitloModalDay = null; // вкладка у вікні, коли днів два: 'today' | 'next'
function svitloParse(data) {
  if (!data || data.show === false) return null;
  const providers = (Array.isArray(data.providers) ? data.providers : []).filter(p => p && p.name != null);
  if (!providers.length) return null;
  // «Чистий» день: у жодній черзі жодного постачальника немає відключень.
  const noOutages = !providers.some(p => Array.isArray(p.queues) && p.queues.some(q => q && Array.isArray(q.slots) && q.slots.filter(Boolean).length > 0));
  return { providers: providers, updated: data.updated || '', revised: data.revised || '', noOutages: noOutages };
}
// Графік на сьогодні: сам svitlo.yaml або, якщо там уже завтрашній, — збережений сьогоднішній
function svitloTodayData() {
  const d = currentSvitloData, p = svitloPrevData;
  if (!d) return null;
  const off = svitloDayOffset(d.updated);
  if (off === 0) return d;
  if (off === 1 && p && svitloDayOffset(p.updated) === 0) return p;
  return null;
}
// Завтрашній графік — коли сьогоднішній береться зі збереженого (тобто днів два)
function svitloNextData() { const t = svitloTodayData(); return t && t !== currentSvitloData ? currentSvitloData : null; }
// Стан черги на завтра (для рядка «Завтра з 10:00»)
function svitloNextState(next) {
  const nm = next ? svitloMyQueue(next) : null;
  return nm ? svitloQueueState(nm.slots, svitloDayOffset(next.updated)) : null;
}
function svitloNextText(nst) {
  if (!nst) return 'Є графік на завтра';
  return nst.kind === 'ahead' ? `Завтра з ${svitloClock(nst.first)}` : nst.kind === 'clear' ? 'Завтра без відключень' : 'Є графік на завтра';
}
// Коротко про сьогодні — для смуги, поки світиться «Новий графік на завтра»
function svitloTodayShort(st, dateStr) {
  if (st.kind === 'clear') return 'Сьогодні відключень немає';
  const s = svitloStateText(st, dateStr).short;
  return 'Сьогодні: ' + s.charAt(0).toLowerCase() + s.slice(1);
}
function svitloColor(p) { return /^#[0-9a-f]{3,8}$/i.test(String((p && p.color) || '')) ? p.color : '#ffcc00'; }
// Посилання на офіційний документ постачальника (для кнопки «Знайти свою чергу»).
// Спершу — поле url з svitlo.yaml, інакше — за назвою (ЦЕК / ДТЕК).
function svitloDocUrl(p) {
  if (p && typeof p.url === 'string' && /^https?:\/\//i.test(p.url)) return p.url;
  const n = String((p && p.name) || '').toUpperCase();
  if (n.includes('ЦЕК')) return 'https://cek.dp.ua/images/cherga/Vilnogirsk.pdf';
  if (n.includes('ДТЕК')) return 'https://www.dtek-dnem.com.ua/ua/shutdowns';
  return '';
}
// Зсув дати графіка (updated, ДД.ММ.РРРР) від поточної доби за Києвом:
// 0 — сьогодні, 1 — завтра, від'ємне — графік на минулий день, null — дати немає.
function svitloDayOffset(dateStr) {
  const m = String(dateStr || '').match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (isNaN(d.getTime())) return null;
  const today = getKyivNow(); today.setHours(0, 0, 0, 0); // доба — за Києвом, як і весь сайт
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
// «Сьогодні» / «Завтра» / '' — залежно від дати графіка щодо поточної доби.
function svitloDayWord(dateStr) {
  const off = svitloDayOffset(dateStr);
  return off === 0 ? 'Сьогодні' : off === 1 ? 'Завтра' : '';
}
// «ДД.ММ» з дати графіка
function svitloDdMm(dateStr) {
  const m = String(dateStr || '').match(/(\d{1,2})\.(\d{1,2})/);
  return m ? m[1].padStart(2, '0') + '.' + m[2].padStart(2, '0') : '';
}
// Заголовок «чистого» дня: «✅ Сьогодні/Завтра відключень немає» або «✅ Відключень немає».
function svitloOkTitle(dateStr) {
  const w = svitloDayWord(dateStr);
  return w ? `✅ ${w} відключень немає` : '✅ Відключень немає';
}

// «Оновлено о …» на згорнутій плашці: якщо дата в revised та сама, що й у графіку
// (updated), лишаємо тільки час — щоб рядок не переносився у вузькій колонці.
// Повністю (з датою) — у вікні графіка.
function svitloRevShort(revised, updated) {
  const r = String(revised || '').trim();
  const m = r.match(/^(\d{1,2}:\d{2})\s+(\d{1,2}\.\d{1,2}\.\d{4})$/);
  return (m && m[2] === String(updated || '').trim()) ? m[1] : r;
}

// === «Розумний» графік: своя черга ===
// Людина обирає свою чергу серед тих, що є в svitlo.yaml (тобто лише черги Вільногірська),
// і сайт сам рахує за київським часом, чи є зараз світло, до котрої години і скільки лишилось.
// Вибір пам'ятає браузер (localStorage) — нікуди не надсилається.
const SVITLO_QUEUE_KEY = 'svitlo_queue';
function svitloQueueId(p, q) { return String(p.name) + '|' + String(q.queue); }
function getSvitloChoice() { try { return localStorage.getItem(SVITLO_QUEUE_KEY) || ''; } catch (e) { return ''; } }
function setSvitloChoice(id) { try { if (id) localStorage.setItem(SVITLO_QUEUE_KEY, id); else localStorage.removeItem(SVITLO_QUEUE_KEY); } catch (e) {} pushQueueSync(); }

// Обрана черга, якщо вона є в поточному графіку: { id, queue, slots }
function svitloMyQueue(data) {
  const id = getSvitloChoice();
  if (!id || !data || !Array.isArray(data.providers)) return null;
  for (const p of data.providers) {
    for (const q of (Array.isArray(p.queues) ? p.queues : [])) {
      if (q && q.queue != null && svitloQueueId(p, q) === id) {
        return { id: id, queue: String(q.queue), slots: (Array.isArray(q.slots) ? q.slots : []).filter(Boolean) };
      }
    }
  }
  return null;
}

// «08:00-11:00» → [480, 660] (хвилини доби). Між часами може бути будь-що: «-», «–», « до ».
// «…-24:00» і перехід через північ («22:00-02:00») — до кінця доби.
function svitloSlotRange(s) {
  const m = String(s).match(/(\d{1,2})[:.](\d{2})\D+?(\d{1,2})[:.](\d{2})/);
  if (!m || +m[2] > 59 || +m[4] > 59) return null;
  const a = +m[1] * 60 + +m[2];
  let b = +m[3] * 60 + +m[4];
  if (a >= 1440 || b > 1440) return null;
  if (b <= a) b = 1440;
  return [a, b];
}
function svitloClock(min) { return min >= 1440 ? '24:00' : String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function svitloDur(min) {
  min = Math.max(1, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} год ${m} хв` : `${h} год`) : `${m} хв`;
}
function svitloNowMin() { const n = getKyivNow(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; }

// Стан черги зараз:
//   off   — світла немає до until;   on — світло є, вимкнуть о next;   done — сьогодні відключень більше не буде;
//   clear — відключень немає;   ahead — графік на завтра (first — перше відключення);
//   stale — графік на минулий день;   unknown — час записано так, що його не розібрати (показуємо як є).
function svitloQueueState(slots, dayOffset) {
  const iv = slots.map(svitloSlotRange).filter(Boolean).sort((x, y) => x[0] - y[0]);
  const merged = []; // суміжні й накладені інтервали — одне відключення
  iv.forEach(r => { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([r[0], r[1]]); });
  const total = merged.reduce((s, r) => s + r[1] - r[0], 0);
  const base = { merged: merged, total: total, dayOffset: dayOffset };
  if (dayOffset != null && dayOffset < 0) return Object.assign({ kind: 'stale' }, base);
  if (slots.length && !iv.length) return Object.assign({ kind: 'unknown' }, base);
  if (dayOffset != null && dayOffset > 0) return Object.assign(merged.length ? { kind: 'ahead', first: merged[0][0] } : { kind: 'clear' }, base);
  if (!merged.length) return Object.assign({ kind: 'clear' }, base);
  const now = svitloNowMin();
  for (const r of merged) {
    if (now >= r[0] && now < r[1]) return Object.assign({ kind: 'off', until: r[1], left: r[1] - now, now: now }, base);
    if (now < r[0]) return Object.assign({ kind: 'on', next: r[0], left: r[0] - now, now: now }, base);
  }
  return Object.assign({ kind: 'done', now: now }, base);
}

// Тексти стану: title; when + left (коли й через скільки) — у вікні двома рядками, на смузі — sub одним;
// short — на плитці; cls — колір
function svitloStateText(st, dateStr) {
  const ddmm = svitloDdMm(dateStr);
  const later = st.dayOffset === 1 ? 'завтра' : `на ${ddmm}`;
  let t;
  switch (st.kind) {
    case 'off': t = { cls: 'off', ico: '🕯️', title: 'Світла немає', when: `Увімкнуть о ${svitloClock(st.until)}`, left: `через ${svitloDur(st.left)}`, short: `Світла немає до ${svitloClock(st.until)}` }; break;
    case 'on': t = { cls: 'on', ico: '💡', title: 'Світло є', when: `Вимкнуть о ${svitloClock(st.next)}`, left: `через ${svitloDur(st.left)}`, short: `Світло є до ${svitloClock(st.next)}` }; break;
    case 'done': t = { cls: 'on', ico: '💡', title: 'Світло є', when: 'Сьогодні відключень більше немає', short: 'Світло є до кінця дня' }; break;
    case 'clear': {
      const w = st.dayOffset > 0 ? (st.dayOffset === 1 ? 'Завтра' : `На ${ddmm}`) : 'Сьогодні';
      t = { cls: 'ok', ico: '✅', title: 'Відключень немає', when: `${w} світло має бути цілий день`, short: `${w} без відключень` }; break;
    }
    case 'ahead': t = { cls: 'next', ico: '🗓️', title: st.dayOffset === 1 ? 'Графік на завтра' : `Графік на ${ddmm}`, when: `Перше відключення ${later} о ${svitloClock(st.first)}`, short: `${later === 'завтра' ? 'Завтра' : 'На ' + ddmm} з ${svitloClock(st.first)}` }; break;
    case 'unknown': t = { cls: 'next', ico: '💡', title: 'Є відключення', when: 'Час — у списку нижче', short: 'Є відключення' }; break;
    default: t = { cls: 'stale', ico: '⏳', title: `Графік на ${ddmm}`, when: 'Новий графік ще не опублікували', short: `Графік на ${ddmm}` };
  }
  t.left = t.left || '';
  t.sub = t.left ? `${t.when} · ${t.left}` : t.when;
  return t;
}

// Графік відключень — смуга на всю ширину під датою й погодою: показується завжди,
// коли у svitlo.yaml show: true — і з відключеннями, і без них (тоді смуга зелена:
// «✅ Відключень немає»).
// Якщо людина обрала свою чергу — смуга пише стан саме її черги з відліком часу.
// === Оновлений графік має бути помітним ===
// Браузер пам'ятає, який графік людина вже переглядала (відкривала вікно). Якщо графік змінили
// (інший час у чергах) або вийшов графік на нову дату — смуга й плитка світяться
// «Графік змінено о …» / «Новий графік на …», доки людина не відкриє вікно. У вікні — що саме змінилось.
const SVITLO_SEEN_KEY = 'svitlo_seen';
let svitloModalBase = null; // що людина бачила до відкриття вікна (для позначок «змінено»)
function svitloSnapshot(d) {
  const slots = {};
  d.providers.forEach(p => (Array.isArray(p.queues) ? p.queues : []).forEach(q => {
    if (q && q.queue != null) slots[svitloQueueId(p, q)] = (Array.isArray(q.slots) ? q.slots : []).filter(Boolean).map(String).join(', ');
  }));
  return { updated: String(d.updated || ''), slots: slots };
}
function svitloSnapSig(snap) { return snap.updated + '#' + JSON.stringify(snap.slots); }
function getSvitloSeen() { try { const v = JSON.parse(localStorage.getItem(SVITLO_SEEN_KEY) || 'null'); return v && typeof v.slots === 'object' ? v : null; } catch (e) { return null; } }
// opened — людина справді відкривала вікно з цим графіком (а не просто зайшла на сайт уперше)
function setSvitloSeen(snap, opened) { try { localStorage.setItem(SVITLO_SEEN_KEY, JSON.stringify(Object.assign({}, snap, { opened: !!opened }))); } catch (e) {} }
// Чого людина ще не бачила: null — нічого; { kind: 'changed' | 'new', changed: { id: як було }, unknown? }
// Графік із позначкою revised («змінено о …») підсвічується й тоді, коли людина його ще не відкривала —
// навіть якщо зайшла вперше вже після зміни (тоді невідомо, що саме змінилось: unknown).
function svitloUnseen(d, base) {
  if (!d) return null;
  const revisedNotOpened = !!d.revised && !(base && base.opened);
  if (!base) return revisedNotOpened ? { kind: 'changed', changed: {}, unknown: true } : null;
  const cur = svitloSnapshot(d);
  if (svitloSnapSig(base) === svitloSnapSig(cur)) return revisedNotOpened ? { kind: 'changed', changed: {}, unknown: true } : null;
  if (base.updated !== cur.updated) return { kind: 'new', changed: {} };
  const changed = {};
  Object.keys(cur.slots).forEach(id => { if (base.slots[id] !== cur.slots[id]) changed[id] = base.slots[id] === undefined ? null : base.slots[id]; });
  return { kind: 'changed', changed: changed };
}
function svitloUnseenTitle(d, u) {
  if (u.kind === 'new') return `🆕 Новий графік на ${svitloDdMm(d.updated)}`;
  const t = d.revised ? svitloRevShort(d.revised, d.updated) : '';
  return '🔄 Графік змінено' + (t ? ` о ${escapeHTML(t)}` : '');
}

// Спливаюче повідомлення вгорі — один раз на кожну зміну графіка (далі лишається підсвічена смуга)
function svitloUpdateToast() {
  const d = currentSvitloData, u = svitloUnseen(d, getSvitloSeen());
  if (!u) return;
  const key = svitloSnapSig(svitloSnapshot(d)) + '|' + (d.revised || '');
  try { if (localStorage.getItem('svitlo_toast') === key) return; localStorage.setItem('svitlo_toast', key); } catch (e) { return; }
  const t = d.revised ? svitloRevShort(d.revised, d.updated) : '';
  showToast(u.kind === 'new' ? `🆕 Вийшов новий графік світла на ${svitloDdMm(d.updated)}` : `🔄 Графік світла змінено${t ? ' о ' + t : ''}`, 'info');
}

async function loadSvitloData() {
  const host = document.getElementById('svitlo-widget');
  if (!host) return;
  // Графік вимкнено (show: false) чи не завантажився — смугу просто ховаємо
  const hide = () => { currentSvitloData = null; svitloPrevData = null; host.style.display = 'none'; renderSvitloTile(null); };
  if (!yamlReady('svitlo', loadSvitloData, hide)) return; // немає парсера — смуги не буде
  try {
    // Разом зі свіжим графіком — збережений сьогоднішній (знадобиться, якщо свіжий уже на завтра)
    const [res, prevText] = await Promise.all([
      fetch('./data/svitlo.yaml?v=' + Date.now()),
      fetch('./data/svitlo-prev.yaml?v=' + Date.now()).then(r => (r.ok ? r.text() : '')).catch(() => '')
    ]);
    if (!res.ok) { hide(); return; }
    const parsed = svitloParse(jsyaml.load(await res.text()) || {});
    if (!parsed) { hide(); return; }
    currentSvitloData = parsed;
    try { svitloPrevData = prevText ? svitloParse(jsyaml.load(prevText)) : null; } catch (e) { svitloPrevData = null; }
    if (!getSvitloSeen()) setSvitloSeen(svitloSnapshot(currentSvitloData), false); // перший візит: звідси рахуємо зміни
    renderSvitloAll();
    svitloUpdateToast();
    host.style.display = 'block';
    host.style.cursor = 'pointer';
    host.onclick = openSvitloModal;
    host.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSvitloModal(); } };
    host.setAttribute('role', 'button');
    host.setAttribute('tabindex', '0');
    host.setAttribute('aria-label', 'Графік відключень світла — натисніть, щоб побачити час');
  } catch (e) { logSectionError('відключення світла', e); invalidateRender('render_svitlo'); hide(); }
}

// Смуга, плитка й відкрите вікно — з тих самих даних. Викликається після завантаження
// графіка, при виборі черги і щопівхвилини (svitloTick), щоб відлік «через …» був живим.
function renderSvitloAll(resetModal) {
  if (!currentSvitloData) return;
  if (document.getElementById('svitlo-modal')) renderSvitloModal(resetModal); // вікно відкрите — графік переглянуто
  renderSvitloStrip();
  renderSvitloTile(currentSvitloData);
}
function svitloTick() { if (!document.hidden) renderSvitloAll(); }

function renderSvitloStrip() {
  const host = document.getElementById('svitlo-widget'), main = currentSvitloData;
  if (!host || !main) return;
  // Живий стан — за сьогоднішнім графіком (навіть коли вже вийшов завтрашній); «новий/змінений» — за свіжим
  const d = svitloTodayData() || main, next = svitloNextData();
  // Є відключення — «💡 Відключення світла», немає — зелена «✅ Сьогодні/Завтра відключень немає»
  // Згорнута плашка: назва + дата (+ «Оновлено о…», якщо графік змінювали протягом дня). Повний графік — у вікні по тапу.
  const dateLine = d.updated ? `<span class="svitlo-date">на ${escapeHTML(String(d.updated))}</span>` : '';
  const revLine = d.revised ? `<span class="svitlo-rev">🔄 Оновлено о ${escapeHTML(svitloRevShort(d.revised, d.updated))}</span>` : '';
  // Вийшов графік на завтра — третій рядок про завтра замість «Оновлено о…»
  const extraLine = next ? `<span class="svitlo-rev">🗓️ ${svitloNextText(svitloNextState(next))}</span>` : revLine;
  const my = svitloMyQueue(d), myMain = svitloMyQueue(main);
  const st = my ? svitloQueueState(my.slots, svitloDayOffset(d.updated)) : null;
  const unseen = svitloUnseen(main, getSvitloSeen());
  host.classList.toggle('svitlo-strip-new', !!unseen);
  let html;
  if (unseen) {
    let sub = 'Натисніть, щоб переглянути';
    if (myMain && unseen.kind === 'changed') sub = unseen.unknown ? `Перевірте час черги ${escapeHTML(myMain.queue)}` : myMain.id in unseen.changed ? `Ваша черга ${escapeHTML(myMain.queue)} змінилась` : `Черга ${escapeHTML(myMain.queue)} без змін`;
    else if (next && st && st.kind !== 'stale') sub = svitloTodayShort(st, d.updated);
    html = `<div class="svitlo-box svitlo-box-upd"><span class="svitlo-name">${svitloUnseenTitle(main, unseen)}</span><span class="svitlo-when">${sub}</span></div>`;
  } else if (st && st.kind !== 'stale') {
    const t = svitloStateText(st, d.updated);
    html = `<div class="svitlo-box svitlo-box-${t.cls}"><span class="svitlo-name">${t.ico} Черга ${escapeHTML(my.queue)} · ${t.title}</span><span class="svitlo-when">${t.sub}</span>${extraLine}</div>`;
  } else if (d.noOutages) {
    html = `<div class="svitlo-box svitlo-box-ok"><span class="svitlo-name">${svitloOkTitle(d.updated)}</span>${dateLine}${extraLine}</div>`;
  } else {
    html = `<div class="svitlo-box"><span class="svitlo-name">💡 Відключення світла</span>${dateLine}${extraLine}</div>`;
  }
  // innerHTML лише коли текст справді змінився (відлік «через …» міняється раз на хвилину)
  if (dataChanged('render_svitlo', html)) host.innerHTML = html;
}

function openSvitloModal() {
  if (!currentSvitloData || !Array.isArray(currentSvitloData.providers)) return;
  const modalId = 'svitlo-modal';
  const old = document.getElementById(modalId); if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'custom-modal-overlay active';
  modal.onclick = (e) => { if (e.target.id === modalId) closeSvitloModal(); };
  modal.innerHTML = `
    <div class="custom-modal-box" onclick="event.stopPropagation()" style="max-width:430px;">
      <div class="close-modal-btn" onclick="closeSvitloModal()" style="width:42px;height:42px;font-size:28px;">&times;</div>
      <h3 class="form-title" style="color:#ffcc00;margin-bottom:4px;font-size:19px;padding-right:40px;">💡 Графік відключень</h3>
      <div id="sv-body"></div>
    </div>`;
  // Вибір черги: повторний тап по обраній — скасувати вибір
  const body = modal.querySelector('#sv-body');
  body.addEventListener('click', (e) => {
    const tab = e.target.closest('.sv2-tab[data-day]');
    if (tab) { svitloModalDay = tab.dataset.day; renderSvitloModal(); return; } // «Сьогодні» / «Завтра»
    const b = e.target.closest('.sv-q');
    if (b) { setSvitloChoice(getSvitloChoice() === b.dataset.id ? '' : b.dataset.id); renderSvitloAll(true); return; }
    // Рядок черги в «Усіх чергах» — показати саме цю чергу (без посилань усередині)
    const row = e.target.closest('.sv2-oq[data-id]');
    if (row && !e.target.closest('a')) { setSvitloChoice(row.dataset.id); renderSvitloAll(true); modal.scrollTop = 0; }
  });
  body.addEventListener('keydown', (e) => {
    const row = e.target.closest && e.target.closest('.sv2-oq[data-id]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
  });
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  svitloModalBase = getSvitloSeen();
  svitloModalDay = null; // яку добу показати — вирішить renderSvitloModal
  renderSvitloAll(true); // вікно позначить графік переглянутим — смуга й плитка вже без підсвітки
}

// Вміст вікна. reset — заново вирішити, чи розгорнуто «Усі черги» (розгорнуто, поки черга не обрана);
// інакше (щопівхвилинне оновлення) лишаємо так, як людина розгорнула чи згорнула.
function renderSvitloModal(reset) {
  const body = document.getElementById('sv-body'), main = currentSvitloData;
  if (!body || !main) return;
  // Два дні (сьогоднішній збережений + свіжий на завтра) — вкладки. Спершу відкриваємо «Завтра»,
  // якщо людина ще не бачила цей новий графік, інакше «Сьогодні».
  const today = svitloTodayData(), next = svitloNextData();
  if (!next) svitloModalDay = null;
  else if (!svitloModalDay) svitloModalDay = svitloUnseen(main, svitloModalBase) ? 'next' : 'today';
  const d = next && svitloModalDay === 'today' ? today : main;
  const my = svitloMyQueue(d);
  const allEl = body.querySelector('.sv-all');
  const allOpen = (!reset && allEl) ? allEl.open : !my;
  setSvitloSeen(svitloSnapshot(main), true); // людина дивиться свіжий графік
  const tabs = next ? svitloDayTabsLive(today, next, svitloModalDay) : '';
  const html = svitloModalHtml(d, my, allOpen, d === main ? svitloUnseen(main, svitloModalBase) : null, tabs);
  if (body.dataset.v !== html) { body.dataset.v = html; body.innerHTML = html; }
}
// Вкладки «Сьогодні / Завтра», коли є обидва графіки: обидві натискаються
function svitloDayTabsLive(todayD, nextD, day) {
  const tab = (key, label, d) => {
    const m = String(d.updated || '').match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/), on = key === day;
    return `<button type="button" class="sv2-tab${on ? ' sv2-tab-on' : ''}" data-day="${key}" aria-pressed="${on}"><b>${label}</b><span>${m ? svitloDayName(new Date(+m[3], +m[2] - 1, +m[1])) : ''}</span></button>`;
  };
  return `<div class="sv2-tabs sv2-tabs-live">${tab('today', 'Сьогодні', todayD)}${tab('next', 'Завтра', nextD)}</div>`;
}

// === Добовий графік черги: «є світло» / «немає світла» на всі 24 години ===
// Періоди доби: від 00:00 до 24:00 чергуються «є світло» й «немає світла»
function svitloPeriods(merged) {
  const out = []; let cur = 0;
  merged.forEach(r => { if (r[0] > cur) out.push({ a: cur, b: r[0], on: true }); out.push({ a: r[0], b: r[1], on: false }); cur = r[1]; });
  if (cur < 1440) out.push({ a: cur, b: 1440, on: true });
  return out;
}
function svitloTotal(min) { return min > 0 ? svitloDur(min) : '0 год'; }
const SV_ICO_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"/></svg>';
const SV_ICO_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M3.27 3L2 4.27l5 5V13h3v9l3.58-6.14L17.73 20 19 18.73 3.27 3zM17 10h-4l4-8H7v2.18l8.46 8.46L17 10z"/></svg>';
const SV_ICO_CLOCK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>';
const SV_ICO_LIST = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>';
const SV_WD = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
function svitloDayName(dt) { return `${SV_WD[dt.getDay()]}. ${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`; }

// Вкладки «Сьогодні / Завтра»: активна — та доба, на яку опубліковано графік, інша приглушена
function svitloDayTabs(dateStr, off) {
  const today = getKyivNow(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime()); tomorrow.setDate(tomorrow.getDate() + 1);
  const tab = (label, dt, on) => `<div class="sv2-tab${on ? ' sv2-tab-on' : ''}"${on ? '' : ' aria-disabled="true"'}><b>${label}</b><span>${dt ? svitloDayName(dt) : ''}</span></div>`;
  if (off === 0 || off === 1) return `<div class="sv2-tabs">${tab('Сьогодні', today, off === 0)}${tab('Завтра', tomorrow, off === 1)}</div>`;
  const m = String(dateStr || '').match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/);
  const dt = m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  return `<div class="sv2-tabs">${tab(off != null && off < 0 ? 'Останній графік' : 'Графік', dt, true)}</div>`;
}

// Шкала доби: зелене — є світло, сіре — немає; «Зараз» над шкалою; підписи на кожній зміні
function svitloTimelineHtml(periods, now) {
  const pc = (min) => (min / 14.4).toFixed(3) + '%';
  const segs = periods.map(p => `<span class="sv2-seg ${p.on ? 'sv2-on' : 'sv2-off'}" style="left:${pc(p.a)};width:${pc(p.b - p.a)}"></span>`).join('');
  // Підписи: 00:00, кожна зміна, 24:00. Близькі — у другий рядок, щоб не налазили один на одного
  const marks = [0].concat(periods.map(p => p.b));
  const last = [-100, -100];
  let twoRows = false;
  const labels = marks.map((m, i) => {
    const x = m / 14.4, end = i === marks.length - 1;
    const cx = i === 0 ? 6 : end ? 94 : x; // крайні підписи притиснуті до країв — їхній «центр» ближче до середини
    let row = cx - last[0] >= 14 ? 0 : (cx - last[1] >= 14 ? 1 : -1);
    if (row < 0) { if (!end) return ''; row = 0; } // 24:00 показуємо завжди
    last[row] = cx; if (row) twoRows = true;
    const edge = i === 0 ? ' sv2-lb-l' : end ? ' sv2-lb-r' : '';
    return `<span class="sv2-lb${edge}${row ? ' sv2-lb-2' : ''}" style="left:${x.toFixed(3)}%">${svitloClock(m)}</span>`;
  }).join('');
  let nowHtml = '';
  if (now != null) {
    const x = now / 14.4, al = x < 15 ? 'l' : x > 85 ? 'r' : 'c';
    nowHtml = `<span class="sv2-now sv2-now-${al}" style="left:${x.toFixed(3)}%"><span class="sv2-now-pill">Зараз ${svitloClock(Math.floor(now))}</span></span>`;
  }
  const aria = 'Немає світла: ' + (periods.filter(p => !p.on).map(p => svitloClock(p.a) + '–' + svitloClock(p.b)).join(', ') || 'відключень немає');
  return `
    <div class="sv2-card">
      <div class="sv2-card-head"><span class="sv2-title">${SV_ICO_CLOCK}Добовий графік (24 години)</span><span class="sv2-legend"><i class="sv2-on"></i>Є світло<i class="sv2-off"></i>Немає світла</span></div>
      <div class="sv2-track${now != null ? ' sv2-track-now' : ''}" role="img" aria-label="${escapeHTML(aria)}">${nowHtml}<div class="sv2-bar">${segs}</div><div class="sv2-labels${twoRows ? ' sv2-labels-2' : ''}" aria-hidden="true">${labels}</div></div>
    </div>`;
}

// Міні-шкала для «Усіх черг»
function svitloMiniBar(merged, now) {
  const pc = (min) => (min / 14.4).toFixed(3) + '%';
  const segs = svitloPeriods(merged).map(p => `<span class="sv2-seg ${p.on ? 'sv2-on' : 'sv2-off'}" style="left:${pc(p.a)};width:${pc(p.b - p.a)}"></span>`).join('');
  return `<div class="sv2-mini" aria-hidden="true">${segs}${now != null ? `<span class="sv2-mini-now" style="left:${pc(now)}"></span>` : ''}</div>`;
}

function svitloModalHtml(d, my, allOpen, diff, dayTabs) {
  const chg = (diff && diff.changed) || {};
  const upd = d.updated ? `<div class="sv-meta">на ${escapeHTML(String(d.updated))}</div>` : '';
  const rev = d.revised && !(diff && diff.kind === 'changed') ? `<div class="sv-rev">🔄 Оновлено о ${escapeHTML(String(d.revised))}</div>` : '';
  // Банер про зміни з часу, коли людина дивилась графік востаннє
  let banner = '';
  if (diff) {
    let sub = 'Подивіться час своєї черги';
    if (diff.kind === 'changed') {
      const names = Object.keys(chg).map(id => id.split('|').slice(1).join('|'));
      sub = my && my.id in chg ? `Змінилась ваша черга ${escapeHTML(my.queue)}` : names.length ? 'Змінились черги: ' + names.map(escapeHTML).join(', ') : sub;
      if (my && !(my.id in chg) && names.length) sub += ` · ваша ${escapeHTML(my.queue)} без змін`;
    }
    banner = `<div class="sv-upd"><b>${svitloUnseenTitle(d, diff)}</b><span>${sub}</span></div>`;
  }

  // Вибір черги — лише черги з графіка (наші, Вільногірськ), згруповані за постачальником
  const pick = d.providers.map(p => {
    const color = svitloColor(p);
    const qs = (Array.isArray(p.queues) ? p.queues : []).filter(q => q && q.queue != null);
    if (!qs.length) return '';
    const btns = qs.map(q => {
      const id = svitloQueueId(p, q), on = !!my && my.id === id;
      const ch = id in chg;
      return `<button type="button" class="sv-q${on ? ' sv-q-on' : ''}${ch ? ' sv-q-chg' : ''}" data-id="${escapeHTML(id)}" aria-pressed="${on}" style="--pc:${color}"${ch ? ' title="Змінено"' : ''}>${escapeHTML(String(q.queue))}</button>`;
    }).join('');
    return `<div class="sv-pick-row"><span class="sv-prov" style="color:${color};border-color:${color}8c;background:${color}29;">${escapeHTML(String(p.name))}</span>${btns}</div>`;
  }).join('');
  const hint = my ? '' : `<div class="sv-hint">Сайт запам'ятає чергу й показуватиме, коли у вас вимкнуть і увімкнуть світло. Не знаєте своєї? Знайдіть адресу в документі постачальника в «Усіх чергах» нижче.</div>`;
  const pickBlock = `<div class="sv-pick"><div class="sv-pick-head">${my ? 'Ваша черга' : 'Оберіть свою чергу'}</div>${pick}${hint}</div>`;

  // Обрана черга: вкладки доби, шкала 24 години, скільки є / немає світла, усі періоди доби
  const off = svitloDayOffset(d.updated);
  const isToday = off == null || off === 0;
  let mine = '';
  if (my) {
    const st = svitloQueueState(my.slots, off);
    const changedMine = my.id in chg;
    const was = typeof chg[my.id] === 'string' ? `<div class="sv-was">Було: <s>${chg[my.id] ? escapeHTML(chg[my.id]).replace(/-/g, '–') : 'без відключень'}</s></div>` : '';
    const stale = off != null && off < 0 ? `<div class="sv2-note">⏳ Новий графік ще не опублікували — показано останній, на ${svitloDdMm(d.updated)}</div>` : '';
    const dayWord = isToday ? 'на сьогодні' : off === 1 ? 'на завтра' : `на ${svitloDdMm(d.updated)}`;
    if (st.kind === 'unknown') {
      // Час записано так, що його не розібрати, — показуємо як є
      mine = `${dayTabs ? '' : svitloDayTabs(d.updated, off)}${stale}<div class="sv2-list-head">${SV_ICO_LIST}Відключення ${dayWord}${changedMine ? ' <span class="sv-chg">змінено</span>' : ''}</div><ul class="sv2-list">${my.slots.map(s => `<li class="sv2-p sv2-p-off"><span class="sv2-p-ico">${SV_ICO_OFF}</span><div class="sv2-p-main"><b>${escapeHTML(String(s))}</b><span>Немає світла</span></div></li>`).join('')}</ul>${was}`;
    } else {
      const now = isToday ? svitloNowMin() : null;
      const periods = svitloPeriods(st.merged);
      const rows = periods.map(p => {
        const past = now != null && p.b <= now, cur = now != null && now >= p.a && now < p.b;
        const side = cur
          ? `<span class="sv2-p-pill">Зараз</span><span class="sv2-p-left">${p.b >= 1440 ? (p.on ? 'до кінця доби' : 'до 24:00') : (p.on ? 'вимкнуть' : 'увімкнуть') + ' через ' + svitloDur(p.b - now)}</span>`
          : `<span class="sv2-p-dur">${svitloDur(p.b - p.a)}</span>`;
        return `<li class="sv2-p ${p.on ? 'sv2-p-on' : 'sv2-p-off'}${past ? ' sv2-p-past' : ''}${cur ? ' sv2-p-now' : ''}"><span class="sv2-p-ico">${p.on ? SV_ICO_ON : SV_ICO_OFF}</span><div class="sv2-p-main"><b>${svitloClock(p.a)} – ${svitloClock(p.b)}</b><span>${p.on ? 'Є світло' : 'Немає світла'}</span></div><div class="sv2-p-side">${side}</div></li>`;
      }).join('');
      mine = `
      ${dayTabs ? '' : svitloDayTabs(d.updated, off)}${stale}
      ${svitloTimelineHtml(periods, now)}
      <div class="sv2-sum">
        <div class="sv2-sumc sv2-sumc-on"><div class="sv2-sumc-top"><span class="sv2-ico">${SV_ICO_ON}</span><span>Є світло</span></div><b>${svitloTotal(1440 - st.total)}</b></div>
        <div class="sv2-sumc sv2-sumc-off"><div class="sv2-sumc-top"><span class="sv2-ico">${SV_ICO_OFF}</span><span>Немає світла</span></div><b>${svitloTotal(st.total)}</b></div>
      </div>
      <div class="sv2-list-head">${SV_ICO_LIST}Періоди ${dayWord}${changedMine ? ' <span class="sv-chg">змінено</span>' : ''}</div>
      <ul class="sv2-list">${rows}</ul>
      ${was}`;
    }
  }

  // Усі черги — як і раніше: час по кожній черзі й посилання «Знайти свою чергу»
  const sections = d.providers.map(p => {
    const color = svitloColor(p);
    const queues = Array.isArray(p.queues) ? p.queues : [];
    const qrows = queues.map(q => {
      if (!q) return '';
      const slots = (Array.isArray(q.slots) ? q.slots : []).filter(Boolean);
      const times = slots.length
        ? slots.map(s => `<span class="svitlo-ot">${escapeHTML(String(s)).replace(/-/g, '–')}</span>`).join('')
        : `<span class="svitlo-ot-none">без відключень</span>`;
      const id = q.queue != null ? svitloQueueId(p, q) : '';
      const ch = id && id in chg, mineRow = !!my && my.id === id;
      // Кожна черга — з міні-шкалою доби; тап по рядку — показати цю чергу вгорі
      const qs = svitloQueueState(slots, off);
      const mini = qs.kind === 'unknown' ? '' : svitloMiniBar(qs.merged, isToday ? svitloNowMin() : null);
      return `<div class="svitlo-oq sv2-oq${mineRow ? ' sv2-oq-mine' : ''}"${id ? ` data-id="${escapeHTML(id)}" role="button" tabindex="0" aria-label="Показати чергу ${escapeHTML(String(q.queue))}"` : ''}><div class="sv2-oq-top"><span class="svitlo-oq-label">${escapeHTML(String(q.queue != null ? q.queue : ''))} черга${ch ? '<span class="sv-chg">змінено</span>' : ''}</span><span class="svitlo-oq-times">${times}</span></div>${mini}</div>`;
    }).join('');
    const url = svitloDocUrl(p);
    const find = url ? `<a class="svitlo-find" href="${escapeHTML(url)}" target="_blank" rel="noopener" style="color:${color};background:${color}1a;border:1px solid ${color}55;">🔎 Знайти свою чергу <span class="svitlo-find-go">↗</span></a>` : '';
    return `<div class="svitlo-op"><div class="svitlo-op-head"><span class="svitlo-op-name" style="color:${color};border:1px solid ${color}8c;background:${color}29;">${escapeHTML(String(p.name))}</span>${find}</div>${qrows}</div>`;
  }).join('');
  const okBanner = d.noOutages ? `<div class="svitlo-okbanner"><span class="svitlo-okbanner-title">${svitloOkTitle(d.updated)}</span><span class="svitlo-okbanner-sub">світло має бути цілий день</span></div>` : '';
  const all = `<details class="sv-all"${allOpen ? ' open' : ''}><summary>Усі черги Вільногірська</summary>${okBanner}<div>${sections}</div></details>`;

  return `${dayTabs || ''}${upd}${rev}${banner}${pickBlock}${mine}${all}`;
}

function closeSvitloModal() {
  const m = document.getElementById('svitlo-modal');
  if (m) m.remove();
  svitloModalBase = null;
  if (!document.querySelector('.custom-modal-overlay.active') && !document.querySelector('.image-modal.active')) {
    document.body.style.overflow = '';
  }
}

// Затримку в data/delays.yaml можна писати і хвилинами, і годинами з хвилинами —
// щоб не переводити «година двадцять» у 80 в умі. Приймаємо:
//   delay: 45             — хвилини (як було раніше)
//   delay: "1:15"         — години й хвилини, так само як показано на сайті
//   hours: 1 + delay: 15  — окремими полями
//   delay: "1 год 15 хв"  — словами
// ЦІЛЕ число без лапок завжди читаємо як хвилини. Число з крапкою (1.15) —
// як години.хвилини: хвилин із дробом не буває, а от «1.15» людина напише за
// зразком того, що бачить на сайті. Для рівних годин потрібні лапки: "2:00",
// бо YAML перетворив би 2.00 на звичайну двійку й вийшло б дві хвилини.
function parseDelayMinutes(d) {
  const src = (d && typeof d === 'object') ? d : { delay: d };
  const num = (v) => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.').trim());
    return isFinite(n) && n > 0 ? n : 0;
  };
  const fromHM = (h, m) => Number(h) * 60 + Number(m);
  let total = Math.round(num(src.hours) * 60) + Math.round(num(src.minutes));
  const raw = src.delay;
  if (raw != null && String(raw).trim() !== '') {
    if (typeof raw === 'number') {
      const n = num(raw);
      total += Number.isInteger(n) ? n : fromHM(Math.floor(n), n.toFixed(2).split('.')[1]);
    } else {
      const s = String(raw).trim().toLowerCase();
      const hm = s.match(/^(\d{1,2})\s*[:.,]\s*(\d{1,2})$/); // «1:15», «1.15», «1,15»
      const hw = s.match(/(\d+)\s*(?:год|г)/);              // «1 год», «1г»
      const mw = s.match(/(\d+)\s*(?:хв|мин)/);             // «15 хв»
      if (hm) total += fromHM(hm[1], hm[2]);
      else if (hw || mw) total += (hw ? Number(hw[1]) * 60 : 0) + (mw ? Number(mw[1]) : 0);
      else total += Math.round(num(s));
    }
  }
  return total > 0 ? total : 0;
}

// Затримка для показу: до години — просто хвилини, від години — «1.15» (годин.хвилин),
// бо «+83 хв» доводиться переводити в голові вже читачеві.
function formatDelay(min) {
  const m = Math.max(0, Math.round(min || 0));
  if (m < 60) return { value: String(m), unit: 'хв' };
  const rest = m % 60;
  return { value: Math.floor(m / 60) + '.' + (rest < 10 ? '0' + rest : String(rest)), unit: 'год' };
}

// Бейдж затримок на вкладці «Електрички» — аналогічний бейджу «зміни розкладу»,
// але в кольорах затримок: видно з головного екрана, що електрички запізнюються.
function updateTrainsDelayBadge(delays) {
  trainsDelaysKnown = true;
  const tab = document.querySelector('.tab-btn[onclick*="\'trains\'"]');
  if (!tab) return;
  tab.style.position = 'relative';
  const maxMin = (delays && delays.length)
    ? Math.max.apply(null, delays.map(parseDelayMinutes))
    : 0;
  // На бейджі — КІЛЬКІСТЬ затриманих електричок (як на бейджі змін у розкладі).
  // Хвилини у кожного рейсу свої, тому вони лишаються в самому банері, а не на вкладці.
  const count = (delays && delays.length) ? delays.length : 0;
  const wanted = count ? count + '|' + maxMin : ''; // maxMin — щоб оновився і підпис при наведенні
  const max = formatDelay(maxMin);
  setTabBadge(tab, 'delays-live-badge',
    wanted ? '<span class="dl-dot"></span>' + tabSeg('clock', count) : '',
    count === 1
      ? `Затримується 1 електричка (~${max.value} ${max.unit})`
      : `Затримується електричок: ${count} (до +${max.value} ${max.unit})`);
}

// Затримки, які застосунок «Адмінка ВО» сам знаходить у каналі Укрзалізниці
// або які опублікували з нього: кожна тримається годину від останнього
// оновлення, потім сервер прибирає її сам. Сервер не відповів — null.
// Без cache: 'no-store' — сервер дозволяє браузеру хвилину не перепитувати,
// щоб часті перемикання вкладок не множили запити.
const SERVER_DELAYS_URL = 'https://dopysy-scheduler.dopysy-scheduler.workers.dev/public/delays';
async function loadServerDelays() {
  try {
    const res = await fetchWithTimeout(SERVER_DELAYS_URL, {}, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    return data && Array.isArray(data.delays) ? data : null;
  } catch (e) { return null; }
}

// Затримки електричок — з сервера застосунку (автоматично) і ручні з
// data/delays.yaml (яскравий банер угорі вкладки «Електрички»). Незалежний від API розкладу.
async function loadDelaysData() {
  const host = document.getElementById('trains-delays-banner');
  if (!host) return;
  // Разом із очищенням HTML скидаємо підпис: інакше наступне завантаження з
  // тими самими даними виходило раніше відмальовки й на місці банера
  // лишалась порожня рамка (перевірено: довжина HTML 0 при display:block).
  const hide = () => { host.style.display = 'none'; host.innerHTML = ''; invalidateRender('render_delays'); updateTrainsDelayBadge([]); trainsTileDelays = {}; renderTrainsTile(); };
  if (!yamlReady('delays', loadDelaysData, hide)) return; // немає парсера — банер затримок ховаємо
  try {
    const [res, server] = await Promise.all([
      fetch('./data/delays.yaml?v=' + Date.now()).catch(() => null),
      loadServerDelays()
    ]);
    // Лишаємо тільки валідні затримки: увімкнена (show !== false), є номер і додатній час.
    // show: false у рядку ховає саме цю затримку, не видаляючи її з файлу.
    const valid = d => d && d.show !== false && d.number != null && String(d.number).trim() !== '' && parseDelayMinutes(d) > 0;
    const auto = server ? server.delays.filter(valid) : [];
    if (!(res && res.ok) && auto.length === 0) { hide(); return; }
    let data = {};
    if (res && res.ok) {
      // Помилка у ручному файлі не ховає автоматичні затримки.
      try { const parsed = jsyaml.load(await res.text()); if (parsed && typeof parsed === 'object') data = parsed; }
      catch (e) { logSectionError('затримки електричок (data/delays.yaml)', e); if (auto.length === 0) { hide(); return; } }
    }
    if (data.show === false) { hide(); return; } // весь блок затримок вимкнено вручну — і автоматичні теж
    const list = Array.isArray(data.delays) ? data.delays : [];
    // Автоматичні — згори; ручна про той самий рейс поступається свіжішій із сервера.
    const autoNumbers = new Set(auto.map(d => String(d.number).trim()));
    const delays = auto.concat(list.filter(d => valid(d) && !autoNumbers.has(String(d.number).trim())));
    // Час публікації — свій у кожної затримки: автоматичні беруть власне updated
    // (якщо сервер його віддає) або загальне серверне, ручні — updated із файлу.
    // Раніше серверний час підставлявся замість файлового для всього списку.
    const serverUpdated = auto.length ? server.updated : null;
    const stampOf = d => String((d.updated != null && d.updated !== '') ? d.updated
      : (autoNumbers.has(String(d.number).trim()) ? serverUpdated : data.updated) || '').trim();
    updateTrainsDelayBadge(delays); // бейдж на вкладці: є затримки — видно одразу, немає — знімаємо
    trainsTileDelays = {};
    delays.forEach(d => { const k = String(d.number).replace(/\D/g, ''); if (k) trainsTileDelays[k] = parseDelayMinutes(d); });
    renderTrainsTile();

    if (delays.length === 0) {
      // Затримок немає — показуємо спокійний зелений статус замість порожнечі
      if (dataChanged('render_delays', 'ok')) {
        host.className = 'trains-status-ok';
        host.innerHTML = `<span class="ok-ico">🚆</span><span class="ok-txt"><span class="ok-title">Усі електрички — за розкладом</span><span class="ok-sub">Затримок зараз немає, гарної дороги!</span></span>`;
      }
      host.style.display = 'flex'; // .trains-status-ok — flex; block тут ламав вирівнювання іконки
      return;
    }

    // Банер затримок — перезбираємо лише коли список змінився
    if (!dataChanged('render_delays', delays.map(d => ({ d: d, at: stampOf(d) })))) { host.style.display = 'block'; return; }
    host.className = 'trains-delays-banner';
    const rows = delays.map(d => {
      const dl = formatDelay(parseDelayMinutes(d));
      // Два рядки: «№ + маршрут» і «станція + затримка».
      // Так маршрут отримує майже всю ширину картки й не переноситься на новий рядок.
      const routeTxt = d.route ? escapeHTML(String(d.route).trim()) : '';
      const route = routeTxt ? `<div class="delay-route" title="${routeTxt}">${routeTxt}</div>` : '';
      // Станція не вказана — не ховаємо плашку, а пишемо, що рейс іде з початкової.
      // Порожній рядок і самі пробіли вважаємо «не вказано».
      const stationTxt = String(d.station == null ? '' : d.station).trim();
      const station = stationTxt
        ? `<div class="delay-station">🚉 <span class="delay-station-lbl">прямує зі ст.</span> <b>${escapeHTML(stationTxt)}</b></div>`
        : `<div class="delay-station">🚉 <span class="delay-station-lbl">прямує з</span> <b>початкової станції</b></div>`;
      // Прогноз прибуття до Вільногірська — той самий, що в дописі в Telegram
      // («Прогноз прибуття: 20:51»); сервер його віддає, у ручному файлі —
      // необов'язкове поле forecast. Немає — плашку не показуємо.
      const forecastTxt = String(d.forecast == null ? '' : d.forecast).trim();
      const forecast = forecastTxt
        ? `<div class="delay-station">🏁 <span class="delay-station-lbl">прогноз прибуття:</span> <b>${escapeHTML(forecastTxt)}</b></div>`
        : '';
      const note = (d.note && String(d.note).trim()) ? `<div class="delay-note">⚠️ ${escapeHTML(String(d.note))}</div>` : '';
      // Під станцією — коли затримку опубліковали: від цього часу й рахувати,
      // де зараз електричка. Немає часу — рядок не показуємо.
      const at = stampOf(d);
      const stamp = at ? `<div class="delay-stamp">🕐 оновлено ${escapeHTML(at)}</div>` : '';
      return `<div class="delay-row"><div class="delay-top"><div class="delay-num">№${escapeHTML(String(d.number))}</div>${route}</div><div class="delay-bottom"><div class="delay-where">${station}${forecast}${stamp}</div><div class="delay-min"><b>+${dl.value}</b><span>${dl.unit}</span></div></div>${note}</div>`;
    }).join('');

    host.innerHTML = `<div class="trains-delays-head"><span class="trains-delays-title"><span class="delay-live-dot"></span>⏱️ Затримки електричок</span></div>${rows}`;
    host.style.display = 'block';
  } catch (e) { logSectionError('затримки електричок', e); invalidateRender('render_delays'); hide(); }
}

async function loadExchangeRates() {
  try {
    const pb = await fetchCachedJson('https://api.privatbank.ua/p24api/pubinfo?exchange&json&coursid=5', 'pb_rates', 30);
    if (Array.isArray(pb)) {
        const usd = pb.find(c => c.ccy === 'USD'); const eur = pb.find(c => c.ccy === 'EUR');
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
  } catch(e3) { logSectionError('курс валют', e3); }
}

const UA_MONTHS = ['СІЧНЯ','ЛЮТОГО','БЕРЕЗНЯ','КВІТНЯ','ТРАВНЯ','ЧЕРВНЯ','ЛИПНЯ','СЕРПНЯ','ВЕРЕСНЯ','ЖОВТНЯ','ЛИСТОПАДА','ГРУДНЯ'];

function updateDateTime(){
  try {
    const now = getKyivNow();
    document.getElementById("date").textContent = `${now.getDate()} ${UA_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    document.getElementById("time-hh").textContent = String(now.getHours()).padStart(2,"0");
    document.getElementById("time-mm").textContent = String(now.getMinutes()).padStart(2,"0");
    document.getElementById("time-ss").textContent = String(now.getSeconds()).padStart(2,"0");
    const days=document.querySelectorAll(".day"); days.forEach(d=>d.classList.remove("active")); let i=now.getDay(); i=i===0?6:i-1; if(days[i]) days[i].classList.add("active");
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
        let kindBadge = '';
        if (item._kind === 'communal') kindBadge = '<span class="alert-kind-badge communal" title="Комунальне">🔧</span>';
        else if (item._kind === 'news') kindBadge = '<span class="alert-kind-badge news" title="Новина">📰</span>';
        const titleColor = item._kind === 'news' ? '#00ff9c' : (item._kind === 'communal' ? '#ffcc00' : typeColor);
        const titlePad = kindBadge ? 'padding-right:30px;' : '';
        return `<div class="alert-item">${kindBadge}${item.title ? `<div class="alert-card-title" style="color: ${titleColor}; ${titlePad}">${escapeHTML(item.title)}${dot}</div>` : ''}<div class="alert-card-text">${textHtml}</div></div>`;
    }
  }).join("");
  if (items.length === 1) return `<div class="carousel-wrapper"><div class="carousel-container">${slidesHtml}</div></div>`;
  const dotsHtml = items.map((_, i) => `<div class="carousel-dot ${i === 0 ? 'active' : ''}" style="background: ${i === 0 ? typeColor : 'rgba(255,255,255,0.3)'};"></div>`).join("");
  return `<div class="carousel-wrapper"><div class="carousel-container" id="carousel-${typeId}" onscroll="updateCarouselDots('carousel-${typeId}', 'dots-${typeId}', '${typeColor}')">${slidesHtml}</div><div class="carousel-dots" id="dots-${typeId}">${dotsHtml}</div></div>`;
}

function updateCarouselDots(containerId, dotsId, activeColor) {
  const container = document.getElementById(containerId); const dotsContainer = document.getElementById(dotsId); if (!container || !dotsContainer) return;
  const dots = dotsContainer.children;
  // Крок прокрутки = ширина слайда + gap між слайдами; без gap точка з'їжджала від ~12 слайдів
  const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
  let index = Math.round(container.scrollLeft / (container.clientWidth + gap));
  if (index >= dots.length) index = dots.length - 1;
  if (index < 0) index = 0;
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
  // Применяем сохранённый порядок (кэш выше уже пересоздан, если размер поменялся)
  const result = [];
  shuffleCache[cacheKey].forEach(i => { if (array[i] !== undefined) result.push(array[i]); });
  return result;
}

function isVilnohirsk(str) { if (!str) return false; const lower = String(str).toLowerCase(); return lower.includes('вільногірськ') || lower.includes('вильногорск') || lower.includes('вільно') || lower.includes('вильно') || lower.includes('vilnohirsk'); }

async function loadAlerts() {
  try {
    const d = await fetchCachedJson('https://vilnohirsk-alerts-production.up.railway.app/api/alert', 'alerts_api', 5);
    const communalAlerts = (d && Array.isArray(d.communal)) ? d.communal.filter(i => i && i.show) : [];
    const newsAlerts = (d && Array.isArray(d.news)) ? d.news.filter(i => i && i.show) : [];

    markNewItems(communalAlerts, 'communal');
    markNewItems(newsAlerts, 'news');

    // Об'єднана стрічка: спочатку комунальні, потім новини; кожному проставляємо тип для іконки-мітки
    communalAlerts.forEach(i => i._kind = 'communal');
    newsAlerts.forEach(i => i._kind = 'news');
    const feedAlerts = [...communalAlerts, ...newsAlerts];

    checkNotification('communal', communalAlerts);
    checkNotification('news', newsAlerts);
    updateCommunalTabBadge(feedAlerts.length);

    if (dataChanged('render_feed', feedAlerts)) {
      document.getElementById("alert-feed-content").innerHTML = buildCarouselHtml(feedAlerts, '#ffcc00', 'feed');
    }
  } catch(e) { logSectionError('новини', e); invalidateRender('render_feed'); const fc = document.getElementById("alert-feed-content"); if (fc) fc.innerHTML = `<div class="empty-msg">Помилка завантаження</div>`; }
}

async function loadEventsData() {
  try {
    const API_URL = atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2RlbnJpczg3L3ZpbG5vaGlyc2stZXZlbnRzL21haW4vZXZlbnRzLmpzb24=');
    const eventAlerts = await fetchCachedJson(API_URL, 'events_api', 5);
    const activeEvents = Array.isArray(eventAlerts) ? eventAlerts.filter(i => i && i.show !== false) : [];
    // Афіша без фото не рендерить слайд — працюємо лише з тими, де є зображення,
    // інакше індекси модалки та точки каруселі з'їжджають відносно слайдів
    const eventsWithPhotos = activeEvents.filter(ev => ev && (ev.photo || ev.image || ev.url));

    markNewItems(eventsWithPhotos, 'events');
    checkNotification('events', eventsWithPhotos);
    updateEventsTabBadge(eventsWithPhotos.length);

    windowEventImages = eventsWithPhotos.map(ev => getDriveImageUrl(ev.photo || ev.image || ev.url));
    if (dataChanged('render_events', eventsWithPhotos)) {
      document.getElementById("alert-events-content").innerHTML = buildCarouselHtml(eventsWithPhotos, '#FF3366', 'events', true);
    }
  } catch(e) { logSectionError('афіші', e); invalidateRender('render_events'); document.getElementById("alert-events-content").innerHTML = `<div class="empty-msg" style="margin-bottom:15px;">Афіш поки немає</div>`; }
}

async function loadPhonebookData() {
  const container = document.getElementById('city-guide-list-content');
  if (!container) return; // розділ тимчасово вимкнено — блока може не бути в розмітці
  try {
    const data = await fetchCachedJson('https://vilnohirsk-phonebook-production.up.railway.app/api/phonebook', 'phonebook_api', 30);
    const categoriesData = data.categories || data; if (!categoriesData || !Array.isArray(categoriesData)) throw new Error('Invalid format');
    phonebookRawData = categoriesData; 
    checkNotification('guide', phonebookRawData);
    renderPhonebook(phonebookRawData);
  } catch (e) { logSectionError('довідник', e); container.innerHTML = '<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження довідника</div>'; }
}

// Українські закінчення при числі: 1 номер, 2 номери, 5 номерів.
// Окремо винесено 11-14 — вони завжди "багато" (11 номерів, а не 11 номер).
function pluralUk(n, one, few, many) {
  const abs = Math.abs(Math.round(n) || 0), d = abs % 10, h = abs % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

// ── Стан номера ──────────────────────────────────────────────────────────────
// База довідника тримає в кожного запису поле verified: true — передзвонили
// й підтвердили, false — номер є, але ніхто не перевіряв. Третього стану нема.
// Пізніше апі почне віддавати ще й готовий об'єкт status із підписами; тоді
// беремо підпис звідти, а поки малюємо своїми. Якщо полів нема взагалі
// (стара відповідь апі) — позначки й фільтр просто не показуємо.
let phonebookFilter = 'all';   // all | verified | unverified

function pbHasMark(item) {
  if (!item) return false;
  if (item.status && typeof item.status.verified === 'boolean') return true;
  return item.verified === true || item.verified === false;
}
function pbIsVerified(item) {
  if (!item) return false;
  if (item.status && typeof item.status.verified === 'boolean') return item.status.verified;
  return item.verified === true;
}
function pbMarkHtml(item) {
  if (!pbHasMark(item)) return '';
  const ok = pbIsVerified(item);
  const st = item.status || {};
  const label = st.label || (ok ? 'Перевірено' : 'Не перевірено');
  const hint = st.hint || (ok ? 'Ми передзвонили: людина справді цим займається'
                              : 'Номер ще ніхто не підтверджував');
  const icon = ok ? '\u2713' : '\u25cb';
  return `<span class="pb-mark ${ok ? 'pb-mark-ok' : 'pb-mark-no'}" title="${escapeHTML(hint)}">`
       + `<i aria-hidden="true">${icon}</i>${escapeHTML(label)}</span>`;
}

// Перемикач фільтра. event.stopPropagation() у кнопці НЕ прикраса: перемальовка
// списку виносить натиснуту кнопку з документа, і глобальний обробник кліку,
// перевіряючи closest('.market-group') уже у від'єднаного вузла, отримав би
// null і згорнув усю шухляду розділу.
function pbSetFilter(value) {
  phonebookFilter = value;
  const input = document.getElementById('pb-search');
  renderPhonebook(phonebookRawData, input ? input.value : '');
}

function renderPhonebook(categories, searchQuery = '') {
  const container = document.getElementById('city-guide-list-content'); if (!container) return;
  let html = ''; let hasResults = false; const query = searchQuery.toLowerCase().trim();
  if (!Array.isArray(categories)) return;
  // Лічильники рахуємо тут-таки, з тих самих даних, які малюємо. Тому додали
  // чи прибрали номер у базі — цифра поїде за ним сама, руками правити нічого.
  let allPhones = 0, allItems = 0, allCats = 0, foundPhones = 0, foundItems = 0;
  let marked = 0, allOk = 0;
  // Зірочка «В обране» (кабінет)
  const favKeys = new Set(myFavs().map(f => f.k));
  pbFavIndex = {};
  categories.forEach((cat) => {
     if (!cat || !cat.items || !Array.isArray(cat.items)) return;
     let itemsHtml = ''; let categoryHasMatch = false; let catItems = 0;
     const catName = cat.name || cat.category || 'Різне';
     cat.items.forEach(item => {
        if (!item) return; const safeTitle = (item.title || item.name || '').toString(); const titleMatch = safeTitle.toLowerCase().includes(query);
        const phonesArray = pbPhones(item);
        catItems++; allItems++; allPhones += phonesArray.length;
        const hasMark = pbHasMark(item), isOk = pbIsVerified(item);
        if (hasMark) { marked++; if (isOk) allOk++; }
        const phoneMatch = phonesArray.some(p => p.toString().includes(query));
        const passFilter = phonebookFilter === 'all' || (phonebookFilter === 'verified') === isOk;
        if (passFilter && (query === '' || titleMatch || phoneMatch)) {
            categoryHasMatch = true; hasResults = true; foundItems++; foundPhones += phonesArray.length;
            let phonesHtml = phonesArray.map(p => { let clean = p.toString().replace(/[^0-9+]/g, ''); return `<a href="tel:${clean}" class="pb-phone-btn" onclick="event.stopPropagation();">${escapeHTML(p)}</a>`; }).join('');
            let markHtml = pbMarkHtml(item);
            if (safeTitle) {
              const k = myFavKey(catName, safeTitle), on = favKeys.has(k);
              pbFavIndex[k] = { k: k, t: safeTitle, p: phonesArray.map(String), c: String(catName) };
              markHtml = `<div class="pb-tile-tags">${markHtml}<button type="button" class="pb-fav${on ? ' on' : ''}" data-k="${escapeHTML(k)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${escapeHTML((on ? 'Прибрати з обраного: ' : 'Додати в обране: ') + safeTitle)}" onclick="event.stopPropagation(); pbToggleFav(this)">${on ? '★' : '☆'}</button></div>`;
            }
            itemsHtml += `<div class="pb-tile${isOk ? ' pb-tile-ok' : ''}"><div class="pb-tile-main"><div class="pb-tile-title">${escapeHTML(safeTitle)}</div>${markHtml}</div><div class="pb-tile-phones">${phonesHtml}</div></div>`;
        }
     });
     if (catItems) allCats++;
     if (categoryHasMatch) { const safeCatName = catName; const safeCatIcon = cat.icon || '📌'; html += `<div class="pb-category-section"><div class="pb-category-header"><span>${escapeHTML(safeCatIcon)}</span> ${escapeHTML(safeCatName)}</div><div class="pb-grid">${itemsHtml}</div></div>`; }
  });
  // Рядок підсумку над списком: без пошуку — скільки всього в базі,
  // під час пошуку — скільки збіглось. Обидва числа з одного проходу вище.
  const big = (v) => `<b class="pb-stats-num">${v}</b>`;
  const plain = query === '' && phonebookFilter === 'all';
  const statsHtml = plain
    ? `<div class="pb-stats"><span class="pb-stats-main"><span class="pb-stats-ico" aria-hidden="true">\u{1F4C7}</span>${big(allPhones)} ${pluralUk(allPhones, 'номер', 'номери', 'номерів')}</span><span class="pb-stats-sub">${allItems} ${pluralUk(allItems, 'запис', 'записи', 'записів')}</span><span class="pb-stats-sub">${allCats} ${pluralUk(allCats, 'категорія', 'категорії', 'категорій')}</span></div>`
    : `<div class="pb-stats"><span class="pb-stats-main"><span class="pb-stats-ico" aria-hidden="true">\u{1F50D}</span>Знайдено ${big(foundItems)} ${pluralUk(foundItems, 'запис', 'записи', 'записів')}</span><span class="pb-stats-sub">${foundPhones} ${pluralUk(foundPhones, 'номер', 'номери', 'номерів')}</span></div>`;

  // Фільтр за станом показуємо, лише коли база взагалі несе позначки: на старій
  // відповіді апі (без verified) розділ має лишитись точно таким, як був.
  // Запис без поля вважаємо неперевіреним — це те саме, що «ніхто не підтверджував».
  const chip = (value, text) => `<button type="button" class="pb-chip${phonebookFilter === value ? ' pb-chip-on' : ''}" aria-pressed="${phonebookFilter === value}" onclick="event.stopPropagation(); pbSetFilter('${value}')">${text}</button>`;
  const chipsHtml = marked
    ? `<div class="pb-chips">${chip('all', 'Усі \u00b7 ' + allItems)}${chip('verified', '\u2713 Перевірені \u00b7 ' + allOk)}${chip('unverified', 'Не перевірені \u00b7 ' + (allItems - allOk))}</div>`
      + `<div class="pb-mark-note"><b>\u2713 Перевірено</b> означає, що ми передзвонили і людина справді цим займається.</div>`
    : '';

  const emptyHtml = query !== ''
    ? '<div class="empty-msg" style="font-size: 14px;">За вашим запитом нічого не знайдено \u{1F614}</div>'
    : '<div class="empty-msg" style="font-size: 14px;">У цьому фільтрі поки порожньо</div>';
  // Чіпи малюємо навіть на порожньому результаті: інакше з фільтра, який нічого
  // не знайшов, не буде як вийти — кнопки «Усі» просто не лишиться на екрані.
  container.innerHTML = (hasResults ? statsHtml : '') + chipsHtml + (hasResults ? html : emptyHtml);
}

// Номери запису довідника: масив, рядок через кому чи одне поле phone
function pbPhones(item) {
  if (!item) return [];
  if (Array.isArray(item.phones)) return item.phones;
  if (typeof item.phones === 'string') return item.phones.split(',').map(p => p.trim()).filter(Boolean);
  return item.phone ? [item.phone] : [];
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

// =========================================================================
// === ВИВІЗ СМІТТЯ: графік сміттєвоза з data/smittya.yaml ===
// =========================================================================
// show: false у файлі ховає вкладку цілком. Час у будні — поле time,
// у неділю — sunday; якщо sunday нема, у неділю діє той самий час.
let allGarbageRoutes = [];
let garbageUpdated = '';
let garbageState = 'loading'; // loading | ready | off (show: false) | error — для «Мого дня» в кабінеті
let garbageSearchTimer = null;

// Пошукова нормалізація поверх спільної foldForSearch: ще й латинські a/b/v
// одразу після цифри стають кириличними а/б/в — «55a» з англійської
// розкладки має знайти «55а».
function smFold(value) {
  return foldForSearch(value)
    .replace(/(\d)([abv])/g, (m, d, c) => d + ({ a: 'а', b: 'б', v: 'в' })[c]);
}
const SM_STREET_PREFIX = /^(вул\.?|вулиця|б\.?|бульвар|бул\.?)\s*/;

// "вул. Центральна 53, 55, 55а" → { street: "центральна", houses: ["53","55","55а"] }
// Зупинка без номерів («вул. Степова») означає всю вулицю.
function smParseAddress(address) {
  const clean = smFold(address).replace(SM_STREET_PREFIX, '');
  const m = clean.match(/^(.*?)\s+(\d.*)$/);
  if (!m) return { street: clean.trim(), houses: [] };
  return { street: m[1].trim(), houses: m[2].split(',').map(h => h.trim()).filter(Boolean) };
}

// Запит «Центральна 55» ділимо на вулицю й номер будинку. Номер звіряємо
// ЦІЛИМ, а не підрядком: інакше «Центральна 5» знаходило б і 55, і 57, і
// людина бачила б чужий час. Якщо точних збігів нема зовсім — пробуємо той
// самий номер із дробом чи літерою («Молодіжна 16» → 16/1, 16а), але не інший
// будинок: «Садова 3» не повинна знаходити 30/21 — це чужий дім і чужий час.
function smParseQuery(raw) {
  const tokens = smFold(raw).replace(/([a-zа-я])(\d)/g, '$1 $2').replace(/,/g, ' ')
    .split(/\s+/).filter(t => t && !/^(вул\.?|вулиця|б\.?|бульвар|бул\.?)$/.test(t));
  return {
    street: tokens.filter(t => !/^\d/.test(t)),
    house: tokens.find(t => /^\d/.test(t)) || null,
  };
}
function smStopMatches(stop, q, loose) {
  const a = smParseAddress(stop.address);
  if (q.street.length && !q.street.every(t => a.street.includes(t))) return false;
  if (!q.house) return q.street.length > 0;
  if (!a.houses.length) return q.street.length > 0; // уся вулиця — лише коли вулицю назвали
  return a.houses.some(h => h === q.house
    || (loose && h.startsWith(q.house) && !/\d/.test(h.charAt(q.house.length))));
}

function smMinutes(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function smSpan(times) {
  const ok = times.filter(t => smMinutes(t) != null).sort((a, b) => smMinutes(a) - smMinutes(b));
  return ok.length ? (ok.length > 1 && ok[0] !== ok[ok.length - 1] ? ok[0] + '–' + ok[ok.length - 1] : ok[0]) : '';
}

function renderGarbage(query) {
  const box = document.getElementById('garbage-list-content'); if (!box) return;
  const isSunday = getKyivNow().getDay() === 0;
  const q = smParseQuery(query || '');
  const searching = q.street.length > 0 || !!q.house;

  // Точний пошук, а якщо порожньо — за початком номера
  let loose = false;
  const pick = (lz) => allGarbageRoutes.map(r => ({ route: r, stops: r.stops.filter(st => smStopMatches(st, q, lz)) }))
                                       .filter(x => x.stops.length);
  let groups = searching ? pick(false) : allGarbageRoutes.map(r => ({ route: r, stops: r.stops }));
  if (searching && !groups.length && q.house) { groups = pick(true); loose = groups.length > 0; }

  const found = groups.reduce((n, g) => n + g.stops.length, 0);
  // У неділю великим стоїть недільний час — кажемо про це прямо, щоб
  // ніхто не сплутав його з буднім.
  const sundayNote = isSunday ? '<div class="sm-sunday">Сьогодні неділя — великим показано недільний час</div>' : '';
  let html = (garbageUpdated ? `<div class="sm-updated">Графік станом на ${escapeHTML(garbageUpdated)}</div>` : '') + sundayNote;
  if (searching) {
    html += found
      ? `<div class="sm-found">Знайдено ${found} ${pluralUk(found, 'зупинку', 'зупинки', 'зупинок')}${loose ? ' <span>(точного номера нема — показуємо схожі)</span>' : ''}</div>`
      : `<div class="empty-msg" style="font-size: 13px; line-height: 1.5;">Такої адреси в графіку поки нема \u{1F614}<br><span style="font-size: 11px; opacity: 0.7;">Спробуйте лише назву вулиці. Графік ще доповнюється — якщо вашого будинку нема, напишіть нам.</span></div>`;
  }

  groups.forEach(({ route, stops }) => {
    const all = route.stops;
    const weekSpan = smSpan(all.map(s => s.time));
    const sunSpan = smSpan(all.map(s => s.sunday));
    // Шапка поводиться так само, як рядки зупинок: великим — час, що діє
    // сьогодні, дрібним — інший. Інакше в неділю вони суперечили б одне одному.
    const sunNow = isSunday && !!sunSpan;
    const bigSpan = sunNow ? sunSpan : weekSpan;
    const smallSpan = sunNow ? 'пн–сб ' + weekSpan : (sunSpan ? 'нд ' + sunSpan : '');
    const spanHtml = !weekSpan
      ? '<span class="sm-span sm-span-none">час уточнюється</span>'
      : `<span class="sm-span">${escapeHTML(bigSpan)}${smallSpan ? `<small>${escapeHTML(smallSpan)}</small>` : ''}</span>`;

    const rows = stops.map(st => {
      const main = isSunday && st.sunday ? st.sunday : st.time;
      const second = isSunday && st.sunday ? (st.time ? 'пн–сб ' + st.time : '') : (st.sunday ? 'нд ' + st.sunday : '');
      const timeHtml = main
        ? `<b>${escapeHTML(main)}</b>${second ? `<small>${escapeHTML(second)}</small>` : ''}`
        : '<b class="sm-notime">—</b>';
      return `<div class="sm-stop"><div class="sm-time">${timeHtml}</div><div class="sm-addr">${escapeHTML(st.address)}</div></div>`;
    }).join('');

    html += `<div class="sm-route"><div class="sm-route-head"><span class="sm-route-name">${escapeHTML(route.name)}</span>${spanHtml}</div>`
          + `<div class="sm-stops">${rows}</div></div>`;
  });

  if (!searching && !groups.length) html += '<div class="empty-msg">Графік поки порожній</div>';
  box.innerHTML = html;
}

function filterGarbage() {
  const input = document.getElementById('sm-search'); if (!input) return;
  clearTimeout(garbageSearchTimer);
  garbageSearchTimer = setTimeout(() => renderGarbage(input.value), 200);
}

async function loadGarbageData() {
  const box = document.getElementById('garbage-list-content'); if (!box) return;
  if (!yamlReady('smittya', loadGarbageData, () => showSectionFailure('garbage-list-content', 'loadGarbageData', 'smittya'))) return;
  try {
    const res = await fetch('./data/smittya.yaml?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = jsyaml.load(await res.text()) || {};

    // show: false — ховаємо саму вкладку. Через style, а не атрибут hidden:
    // так вкладку не «воскресить» чиєсь правило display у стилях.
    const tabBtn = document.querySelector('#market-tabs .tab-btn[onclick*="garbage-tab"]');
    if (tabBtn) tabBtn.style.display = data.show === false ? 'none' : '';
    if (data.show === false) { garbageState = 'off'; cabMineRefresh(); return; }

    const routes = (Array.isArray(data.routes) ? data.routes : [])
      .filter(r => r && Array.isArray(r.stops))
      .map(r => ({
        name: String(r.name || 'Маршрут'),
        stops: r.stops.filter(st => st && String(st.address || '').trim() !== '').map(st => ({
          address: String(st.address).trim(),
          time: st.time != null ? String(st.time).trim() : '',
          sunday: st.sunday != null ? String(st.sunday).trim() : '',
        })),
      }))
      .filter(r => r.stops.length);
    allGarbageRoutes = routes;
    garbageUpdated = data.updated ? String(data.updated) : '';
    garbageState = 'ready'; cabMineRefresh();
    if (dataChanged('render_garbage', { routes, updated: garbageUpdated })) {
      const input = document.getElementById('sm-search');
      renderGarbage(input ? input.value : '');
    }
  } catch (e) {
    logSectionError('вивіз сміття', e); invalidateRender('render_garbage');
    if (!allGarbageRoutes.length) { garbageState = 'error'; cabMineRefresh(); }
    box.innerHTML = '<div class="empty-msg" style="color: #ff6b6b;">Не вдалося завантажити графік</div>';
  }
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
  let html = '<div style="text-align: center; margin-bottom: 12px; font-size: 11px; color:rgba(255,255,255,0.7); font-weight: 600;">Якщо бажаєте додати свій магазин, пишіть у Telegram <a href="https://t.me/vilnohirsk" target="_blank" rel="noopener" style="color: var(--time-green); text-decoration: none; font-weight: 800;">@vilnohirsk</a></div><div class="shops-tile-grid">';
  if (!shopsData || !Array.isArray(shopsData) || shopsData.length === 0) { container.innerHTML = html + '<div class="empty-msg">Оголошень поки немає</div>'; return; }
  shopsData.forEach((shop, index) => {
    if(!shop) return;
    const safeName = shop.name != null ? String(shop.name).trim() : ""; const displayName = safeName !== "" ? safeName : "Оголошення " + (index + 1);
    const detailsId = 'shop-detail-' + index; const isVip = isVipFlag(shop.vip); const vipClass = isVip ? 'vip-tile' : ''; const vipBadge = isVip ? '<div class="vip-badge">VIP</div>' : '';
    
    let rawPhoto = Array.isArray(shop.photos) && shop.photos.length > 0 ? shop.photos[0] : (shop.photo || shop.image || '');
    let photoUrl = getDriveImageUrl(rawPhoto);
    const photoHtml = photoUrl ? `<img src="${escapeHTML(photoUrl)}" alt="Фото" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">🛍️</span>`;
    
    const titleHtml = (shop.instagram && String(shop.instagram).trim() !== "") ? `<a href="${escapeHTML(String(shop.instagram).trim())}" target="_blank" rel="noopener" style="color:inherit; text-decoration:none;" onclick="event.stopPropagation();">${escapeHTML(displayName)} 🔗</a>` : escapeHTML(displayName);
    let phoneHtml = 'Не вказано';
    if (shop.phone && String(shop.phone).trim() !== "") { phoneHtml = String(shop.phone).split(',').map(p => `<a href="tel:${p.replace(/[^0-9+]/g, '')}" class="shop-phone-link" onclick="event.stopPropagation();">${escapeHTML(p.trim())}</a>`).join('<br>'); }
    
    const isContactless = shop.contactless === true || shop.contactless === 'true' || shop.contactless === '✅';
    let photosHtml = ''; let photosArray = Array.isArray(shop.photos) ? shop.photos : (photoUrl ? [photoUrl] : []);
    if (photosArray.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${packForAttr(photosArray.map(getDriveImageUrl))}')), 0, event)"><img alt="Фото магазину" src="${escapeHTML(getDriveImageUrl(photosArray[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Збільшити фото</div></div>`; }
    
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
    markNewItems(activeShops, 'shopping');
    checkNotification('shopping', activeShops);
    
    if (!activeShops || activeShops.length === 0) { document.getElementById('shopping-list-content').innerHTML = '<div class="empty-msg">Оголошень поки немає</div>'; return; }
    const vipShops = activeShops.filter(shop => isVipFlag(shop.vip));
    const regularShops = activeShops.filter(shop => !isVipFlag(shop.vip));
    // Стабильное перемешивание — не прыгает при автообновлении
    const finalShops = [...vipShops, ...getStableShuffled(regularShops, 'shops')];
    if (dataChanged('render_shops', finalShops)) renderShops(finalShops);
  } catch(e) { logSectionError('магазини', e); invalidateRender('render_shops'); document.getElementById('shopping-list-content').innerHTML = `<div class="empty-msg" style="color: #ff6b6b;">Помилка завантаження магазинів</div>`; }
}

function renderPromosList(items) {
  const cont = document.getElementById('promos-list-content');
  if (!items || !items.length) { cont.innerHTML = '<div class="empty-msg">Активних пропозицій немає</div>'; return; }
  let html = '<div class="shops-tile-grid">';
  items.forEach((item, i) => {
    const id = 'promo-detail-' + i; 
    let thumbUrl = item.photos && item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
    const thumb = thumbUrl ? `<img alt="Фото акції" src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="object-fit: contain; width: 100%; height: 100%; opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">🔥</span>`;
    let photosHtml = '';
    if (item.photos && item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${packForAttr(item.photos.map(getDriveImageUrl))}')), 0, event)"><img alt="Фото акції" src="${escapeHTML(getDriveImageUrl(item.photos[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Збільшити фото</div></div>`; }
    
    // Посилання виймаємо з сирого тексту ДО екранування: інакше & в URL
    // перетворювався на &amp; і адреса з параметрами ламалась подвійним екрануванням
    let extractedLink = '';
    const rawText = String(item.description || '').replace(/(https?:\/\/[^\s<]+)/g, function(match) {
        if (!extractedLink) extractedLink = match; // у кнопку йде ПЕРШЕ посилання з опису
        return '';
    });
    let finalDesc = nl2br(rawText).replace(/^(<br>|\s)+/, '').replace(/(<br>|\s)+$/, '').trim();

    let buttonHtml = '';
    if (extractedLink) {
        buttonHtml = `<a href="${escapeHTML(extractedLink)}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; margin-top: 8px; margin-bottom: 12px; padding: 12px 10px; background: linear-gradient(135deg, #00ff9c, #00b8ff); color: #0b1d3a; font-weight: 800; font-size: 14px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 15px rgba(0, 255, 156, 0.3); text-transform: uppercase; letter-spacing: 0.5px;"><span style="font-size: 18px;">🚀</span><span>Перейти на сайт</span></a>`;
    }

    let descBlockHtml = finalDesc ? `<div class="shop-inner-item" style="margin-bottom: 10px;"><span class="detail-icon">📋</span><div style="width: 100%; font-size: 12px; color: rgba(255,255,255,0.95); line-height: 1.5; text-align: left;">${finalDesc}</div></div>` : '';

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

    let dropdownInnerHtml = descBlockHtml + photosHtml + phoneBlockHtml + buttonHtml;
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
    html += `<div class="${tileClass}" onclick="toggleShop('${id}', this)">${badgeHtml}<div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat" style="color: #fff; font-size: 11px;">${escapeHTML(item.shop || 'Не вказано')}</div><div class="card-row" style="margin-bottom: 6px;"><span class="card-price" style="color: var(--highlight-color); font-size: 14px; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; line-height: 1.2; display: block;">${escapeHTML(item.discount || '')}</span></div><div class="shop-tile-name" style="font-size: 14px; margin-bottom: 5px;">${escapeHTML(item.title || '')}${dot}</div><div style="font-size: 10px; color: rgba(255,255,255,0.7); font-weight: 700; margin-bottom: 5px;">⏳ Діє: <span style="color:#ffcc00;">${escapeHTML(item.validUntil || '-')}</span></div>${chevronHtml}${dropdownHtml}</div>`;
  });
  cont.innerHTML = html + '</div>';
}

async function loadPromosData() {
  try {
    const data = await fetchCachedJson(PROMOS_API_URL, 'promos_api', 5);
    let itemsArray = [];
    if (Array.isArray(data)) itemsArray = data; else if (data && Array.isArray(data.promos)) itemsArray = data.promos;
    const activeItems = itemsArray.filter(item => item && item.active !== false);
    
    markNewItems(activeItems, 'promos');
    checkNotification('promos', activeItems);
    updatePromosTabBadge(activeItems.length);

    allPromoItems = [...activeItems.filter(item => item.vip).reverse(), ...activeItems.filter(item => !item.vip).reverse()];
    if (dataChanged('render_promos', allPromoItems)) renderPromosList(allPromoItems);
  } catch (e) { logSectionError('акції', e); invalidateRender('render_promos'); document.getElementById('promos-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d; line-height: 1.4;">Помилка зв'язку з сервером акцій</div>`; }
}

function renderEstateList(items, hasMore = false) {
  const cont = document.getElementById('estate-list-content');
  if (!items || !items.length) { cont.innerHTML = '<div class="empty-msg">Оголошень у цій категорії немає</div>'; return; }
  const sortedItems = [...items.filter(item => item.isVip).reverse(), ...items.filter(item => !item.isVip)];
  let html = '<div class="shops-tile-grid">';
  sortedItems.forEach((item, i) => {
    const id = 'estate-detail-' + i; 
    let thumbUrl = item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
    const thumb = thumbUrl ? `<img alt="Фото об’єкта нерухомості" src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">🏠</span>`;
    let photosHtml = '';
    if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${packForAttr(item.photos.map(getDriveImageUrl))}')), 0, event)"><img alt="Фото об’єкта нерухомості" src="${escapeHTML(getDriveImageUrl(item.photos[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
    const dealColor = item.dealType.toLowerCase() === 'оренда' ? '#00b8ff' : '#ff3366';
    let displayPrice = item.price ? String(item.price).trim() : 'Договірна';
    // Валюта вже в ціні («4000 грн», «15000 $»); у найстаріших оголошень її немає — тоді долари, як і було
    if (displayPrice !== 'Договірна' && !/\$|грн|₴/i.test(displayPrice)) { displayPrice += ' $'; }
    displayPrice = displayPrice.replace(/^(\d{4,})(?=\s*(?:\$|грн))/, (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'));
    
    const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Тип об\'єкта', value: `${escapeHTML(item.propertyType)} (${escapeHTML(item.dealType)})`}, {icon: '📍', label: 'Локація', value: escapeHTML(item.location || 'Вільногірськ')}, {icon: '📝', label: 'Опис та адреса', value: nl2br(item.description)}, {icon: '📞', label: 'Телефон', value: phoneLinkHtml(item.phone)} ]);
    
    const dot = item.isNewItem ? NEW_BADGE_HTML : '';
    html += `<div class="shop-tile ${item.isVip ? 'vip-tile' : ''}" onclick="toggleShop('${id}', this)">${item.isVip ? '<div class="vip-badge">VIP</div>' : ''}<div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat" style="color: ${dealColor};">${escapeHTML(item.dealType)} • ${escapeHTML(item.propertyType)}</div><div class="card-row" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; margin-bottom: 6px;"><span class="card-price" style="white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; line-height: 1.2; flex: 1;">${escapeHTML(displayPrice)}</span><span class="card-info" style="font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; text-align: right; margin-top: 2px;">Кімнат: ${escapeHTML(item.rooms)}</span></div><div class="shop-tile-name" style="margin-bottom: 5px;">${escapeHTML(item.propertyType)} у Вільногірську${dot}</div><div class="shop-tile-chevron">Деталі ▾</div>${dropdownHtml}</div>`;
  });
  html += '</div>';
  if (hasMore) { html += `<button class="load-more-btn" onclick="estateRenderLimit+=20; const tagE=document.querySelector('#estate-categories .flea-category-tag.active'); filterEstate(tagE?tagE.innerText:'Всі',tagE);">Показати ще ▾</button>`; }
  cont.innerHTML = html;
}

function filterEstate(category, element) {
  document.querySelectorAll('#estate-categories .flea-category-tag').forEach(tag => { tag.classList.remove('active'); }); if(element) { element.classList.add('active'); }
  let filtered = allEstateItems.filter(item => category === 'Всі' || (item.dealType && item.dealType.includes(category)));
  if (currentEstateSort === 'cheap') filtered.sort((a,b) => (parseInt(String(a.price||"").replace(/\D/g,""))||0) - (parseInt(String(b.price||"").replace(/\D/g,""))||0));
  else if (currentEstateSort === 'expensive') filtered.sort((a,b) => (parseInt(String(b.price||"").replace(/\D/g,""))||0) - (parseInt(String(a.price||"").replace(/\D/g,""))||0));
  renderEstateList(filtered.slice(0, estateRenderLimit), filtered.length > estateRenderLimit);
}

// Обробник селекта сортування нерухомості (виклик з index.html).
// Раніше inline-код писав window.currentEstateSort, але глобальні let-змінні
// не є властивостями window — сортування взагалі не працювало.
function setEstateSort(v) {
  currentEstateSort = v; estateRenderLimit = 20;
  const t = document.querySelector('#estate-categories .flea-category-tag.active');
  filterEstate(t ? t.innerText.trim() : 'Всі', t);
}

async function loadEstateData() {
  if (!papaReady('estate', loadEstateData, () => showSectionFailure('estate-list-content', 'loadEstateData', 'estate'))) return;
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
          let cleanPrice = String(rawPrice || '').replace(/\u00a0/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, '').trim();
          // Fallback: если цена пустая — пытаемся выдернуть число из описания (на случай если юзер вписал цену туда)
          if (!cleanPrice) {
            const descText = String(row["Опис"] || row[keys[6]] || '');
            const priceMatch = descText.match(/(\d[\d\s.,]{2,})\s*(\$|usd|у\.?о\.?|грн|₴)/i);
            if (priceMatch) cleanPrice = priceMatch[1].replace(/[\s,]/g, '').trim();
          }
          return { dealType: row["Тип угоди"] || row[keys[2]] || 'Оренда', propertyType: row["Об'єкт"] || row["Тип об'єкта"] || row[keys[3]] || 'Квартира', rooms: row["Кімнат"] || row[keys[4]] || '-', price: cleanPrice || 'Договірна', description: row["Опис"] || row[keys[6]] || 'Без опису', phone: row["Телефон"] || row[keys[7]] || 'Не вказано', photos: photoUrls, isVip: isVipFlag(v) };
        });
        const localItems = approvedItems.reverse();
        markNewItems(localItems, 'estate');
        checkNotification('estate', localItems);
        const rentCount = localItems.filter(i => i.dealType && i.dealType.toLowerCase().includes('оренд')).length;
        const saleCount = localItems.filter(i => i.dealType && i.dealType.toLowerCase().includes('продаж')).length;
        updateEstateTabBadge(rentCount, saleCount, localItems.length);
        allEstateItems = localItems;
        if (dataChanged('render_estate', localItems)) {
          const activeTag = document.querySelector('#estate-categories .flea-category-tag.active'); filterEstate(activeTag ? activeTag.innerText.trim() : 'Всі', activeTag);
        }
      }
    });
  } catch (e) { logSectionError('нерухомість', e); invalidateRender('render_estate'); document.getElementById('estate-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження</div>`; }
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
    const thumb = thumbUrl ? `<img alt="Фото товару" src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">📦</span>`;
    let priceText = item.price ? String(item.price).trim() : 'Ціна договірна'; if (priceText !== "Ціна договірна" && !priceText.toLowerCase().includes("грн")) priceText += " грн";
    let photosHtml = ''; if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${packForAttr(item.photos.map(getDriveImageUrl))}')), 0, event)"><img alt="Фото товару" src="${escapeHTML(getDriveImageUrl(item.photos[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
    const isVip = isVipFlag(item.vip);
    
    const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Категорія', value: escapeHTML(item.category)}, {icon: '📍', label: 'Локація', value: escapeHTML(item.location)}, {icon: '✨', label: 'Стан', value: escapeHTML(item.condition)}, {icon: '📝', label: 'Опис', value: nl2br(item.description)}, {icon: '📞', label: 'Контакти', value: phoneLinkHtml(item.phone)} ]);
    
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
  if (currentFleaSort === 'cheap') filtered.sort((a,b) => (parseInt(String(a.price||"").replace(/\D/g,""))||0) - (parseInt(String(b.price||"").replace(/\D/g,""))||0));
  else if (currentFleaSort === 'expensive') filtered.sort((a,b) => (parseInt(String(b.price||"").replace(/\D/g,""))||0) - (parseInt(String(a.price||"").replace(/\D/g,""))||0));
  renderFleaMarketList(filtered.slice(0, fleaRenderLimit), filtered.length > fleaRenderLimit);
}

// Обробник селекта сортування барахолки (виклик з index.html) — див. setEstateSort.
function setFleaSort(v) {
  currentFleaSort = v; fleaRenderLimit = 20;
  const t = document.querySelector('#flea-categories .flea-category-tag.active');
  filterFleaMarket(t ? t.innerText.trim() : 'Всі', t);
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
  if (!papaReady('flea', loadFleaMarketData, () => showSectionFailure('flea-market-list-content', 'loadFleaMarketData', 'flea'))) return;
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
        markNewItems(localItems, 'flea');
        checkNotification('flea', localItems);
        const newCount = localItems.filter(i => i.condition && i.condition.toLowerCase().includes('нов')).length;
        const usedCount = localItems.filter(i => i.condition && (i.condition.toLowerCase().includes('вжив') || i.condition.toLowerCase().includes('б/у'))).length;
        updateFleaTabBadge(newCount, usedCount, localItems.length);
        allFleaMarketItems = localItems;
        if (dataChanged('render_flea', localItems)) {
          const activeTag = document.querySelector('#flea-categories .flea-category-tag.active'); filterFleaMarket(activeTag ? activeTag.innerText.trim() : 'Всі', activeTag);
        }
      }
    });
  } catch (e) { logSectionError('барахолка', e); invalidateRender('render_flea'); document.getElementById('flea-market-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження</div>`; }
}

async function loadLostFoundData() {
  if (!papaReady('lost', loadLostFoundData, () => showSectionFailure('lost-found-list-content', 'loadLostFoundData', 'lost'))) return;
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
        markNewItems(localItems, 'lost');
        checkNotification('lost', localItems);
        const foundCount = localItems.filter(i => i.type && i.type.toLowerCase().includes('знайд')).length;
        const lostCount = localItems.length - foundCount;
        updateLostTabBadge(foundCount, lostCount);
        if (!dataChanged('render_lost', localItems)) return; // без змін — не закриваємо відкриті картки
        const cont = document.getElementById('lost-found-list-content');
        if (!localItems.length) { cont.innerHTML = '<div class="empty-msg">Оголошень немає</div>'; return; }
        let html = '<div class="shops-tile-grid">';
        localItems.forEach((item, i) => {
          const id = 'lost-detail-' + i; 
          let thumbUrl = item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
          const thumb = thumbUrl ? `<img alt="Фото загубленої речі" src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;">` : `<span style="font-size:28px;">🔍</span>`; 
          const badgeColor = item.type.toLowerCase().includes('знайд') ? '#00ff9c' : '#ff4d4d';
          let photosHtml = ''; if (item.photos.length > 0) { photosHtml = `<div class="gallery-preview" onclick="openImageModal(JSON.parse(decodeURIComponent('${packForAttr(item.photos.map(getDriveImageUrl))}')), 0, event)"><img alt="Фото загубленої речі" src="${escapeHTML(getDriveImageUrl(item.photos[0]))}" loading="lazy" decoding="async" onload="if(recalcDropdownHeight) recalcDropdownHeight(this); this.style.opacity='1'" style="opacity:0; transition:opacity 0.3s ease;"><div class="gallery-text">🔍 Галерея (${item.photos.length} фото)</div></div>`; }
          
          const dropdownHtml = buildDropdown(id, photosHtml, [ {icon: '📌', label: 'Категорія', value: escapeHTML(item.category)}, {icon: '📍', label: 'Локація', value: escapeHTML(item.location)}, {icon: '📝', label: 'Опис', value: nl2br(item.description)}, {icon: '📞', label: 'Контакти', value: phoneLinkHtml(item.phone)} ]);
          
          const dot = item.isNewItem ? NEW_BADGE_HTML : '';
          html += `<div class="shop-tile" onclick="toggleShop('${id}', this)"><div class="shop-tile-photo">${thumb}</div><div class="shop-tile-cat">${escapeHTML(item.category)}</div><div class="card-row" style="margin-bottom: 6px;"><span class="card-price" style="color:${badgeColor}; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; line-height: 1.2; display: block;">${escapeHTML(item.type)}</span></div><div class="shop-tile-name">${escapeHTML(item.title)}${dot}</div><div class="shop-tile-chevron">Опис ▾</div>${dropdownHtml}</div>`;
        });
        cont.innerHTML = html + '</div>';
      }
    });
  } catch (e) { logSectionError('загублені речі', e); invalidateRender('render_lost'); document.getElementById('lost-found-list-content').innerHTML = `<div class="empty-msg" style="color:#ff4d4d;">Помилка завантаження</div>`; }
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
        const r = data[idx]; const past = isPast(r[1]); const isVil = (r[0] || "").toLowerCase().includes('вільногірськ'); const rowClass = (isVil ? 'schedule-row row-highlight' : 'schedule-row') + (r[2] ? ' stop-diff' : '');
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

// Зміна розкладу електрички з певної дати — необов'язкові поля поїзда в schedule.yaml
// (репозиторій vilnohirsk-trains), сервер передає їх як є:
//   until: "20.10.2026" — останній день курсування: червона плашка «⛔ КУРСУЄ до 20 жовтня 2026 включно»,
//                         а з наступного дня рейс сам зникає зі списку;
//   from:  "21.10.2026" — перший день нового розкладу: до цієї дати зелена плашка «🆕 НОВИЙ з 21 жовтня 2026»
//                         і час не підсвічується (рейс ще не курсує), з цього дня рейс звичайний.
//   badge: "новий розклад" — зелена плашка «🆕 НОВИЙ РОЗКЛАД», поки поле є у файлі (до дати from
//                         у ній ще й «з 21 жовтня 2026»). Плашка «КУРСУЄ до …» важливіша й показується замість неї.
// Дату можна писати й як «2026-10-20» чи «20 жовтня 2026». Якщо дату не вдалося розібрати,
// плашка покаже текст як є, а рейс зі списку не зникне.
const UA_MONTHS_GENITIVE = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

function parseScheduleDate(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  let r, y, m, d;
  if ((r = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})/))) { d = +r[1]; m = UA_MONTHS_GENITIVE.indexOf(r[2]) + 1; y = +r[3]; }
  if (!y || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  return { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, text: `${d} ${UA_MONTHS_GENITIVE[m - 1]} ${y}` };
}

function trainScheduleWindow(x, today) {
  const raw = (v) => (v == null ? '' : String(v).trim());
  const untilRaw = raw(x.until), fromRaw = raw(x.from);
  const until = untilRaw ? parseScheduleDate(untilRaw) : null;
  const from = fromRaw ? parseScheduleDate(fromRaw) : null;
  // Новий розклад ще не діє. «new» у номері без дати from — як було в червні: час без підсвітки
  const pending = fromRaw ? !(from && today >= from.iso) : /new/i.test(raw(x.number));
  return {
    gone: !!(until && today > until.iso),
    pending: pending,
    fromText: fromRaw && pending ? (from ? from.text : fromRaw) : '',
    // until — останній день, коли рейс ще курсує, тому пишемо «включно»
    untilText: untilRaw ? (until ? until.text + ' включно' : untilRaw) : ''
  };
}

async function loadTrainsData(){
  try {
    const d = await fetchCachedJson("https://vilnohirsk-trains-production.up.railway.app/api/trains", 'trains_api', 10);
    if(d&&d.trains) {
      let h = `<div class="table-head"><div>№</div><div>Маршрут</div><div>Відпр.</div></div><div id="trains-content">`;
      let changedTrains = [];
      const changed = [];

      // Двійник з новим розкладом записаний у файлі з «new» у номері («6018 new») — на сайті номер без нього
      const cleanNum = (num) => String(num || '').replace(/new/ig, '').replace(/[\s\-_]+$/,'').trim();
      const today = getKyivDateISO();

      // Клас статусу (future/soon/passed) і відображуваний час для рядка
      const statusFor = (timeStr) => {
        let sc = 'future', dt = timeStr || '—';
        if (timeStr && String(timeStr).includes(':')) {
          const now = getKyivNow(); const [hh, mm] = timeStr.split(':').map(Number);
          const tt = new Date(now); tt.setHours(hh, mm, 0, 0);
          const diff = Math.floor((tt - now) / 60000);
          if (diff < 0) sc = 'passed'; else if (diff <= 10) { sc = 'soon'; dt = `≈ ${diff} хв`; }
        } else sc = 'passed';
        return { sc, dt };
      };

      d.trains.forEach((x, i) => {
        if (!x) return; const id = "train-" + i;
        const win = trainScheduleWindow(x, today);
        if (win.gone) return; // останній день курсування минув — рейсу вже немає
        const hc = x.note && String(x.note).trim() && String(x.note).trim() !== "змін немає...";
        const number = cleanNum(x.number);
        if (hc) { changed.push(x); changedTrains.push(number); }

        const badgeText = x.badge != null ? String(x.badge).trim() : '';
        let badgeHtml = '', rowClass = '', numClass = hc ? ' has-changes' : '';
        if (win.fromText || (badgeText && !win.untilText)) {
          // Зелена плашка: текст із badge (без нього — «НОВИЙ»), а до дати from — ще й «з …»
          const since = win.fromText ? ` <span class="train-new-date">з ${escapeHTML(win.fromText)}</span>` : '';
          badgeHtml = `<div class="train-new-tag">🆕 ${escapeHTML(badgeText || 'НОВИЙ')}${since}</div>`;
          rowClass = ' train-new'; numClass = '';
        } else if (win.untilText) {
          badgeHtml = `<div class="train-end-tag">⛔ КУРСУЄ <span class="train-end-date">до ${escapeHTML(win.untilText)}</span></div>`;
          rowClass = ' train-ending'; numClass = ' has-changes';
        }

        const st = statusFor(x.time);
        // Поки новий розклад не діє, час зупинок і відправлення не підсвічуємо — все нейтральним
        const timeSc = win.pending ? '' : st.sc;
        const routeCell = `<div class="route-cell"><div class="route-text">${escapeHTML(x.route)}</div>${badgeHtml}</div>`;
        const details = `${x.fullSchedule ? renderGrid(x.fullSchedule, false, win.pending) : "Немає даних"}${hc ? `<div class="details-divider"></div><div class="details-note">${escapeHTML(x.note)}</div>` : ''}${x.altSchedule ? renderGrid(x.altSchedule, true) : ""}`;

        h += `<div class="train${rowClass}" onclick="toggleTransportDetails('${id}', this)"><div class="train-num-box${numClass}">${escapeHTML(number)}</div>${routeCell}<div class="time-val ${timeSc}">${escapeHTML(win.pending ? (x.time || '—') : st.dt)}</div></div><div class="details" id="${id}">${details}</div>`;
      });
      // Список перемальовується щоразу (час і статуси мають оновлюватись),
      // але відкриті деталі рейсів відновлюємо — інакше вони закривались кожні 2 хв
      const openDetails = Array.from(document.querySelectorAll('#list .details.open')).map(el => el.id);
      document.getElementById("list").innerHTML = h + `</div>`;
      openDetails.forEach(oid => { const el = document.getElementById(oid); if (el) el.classList.add('open'); });
      
      // Обновляем баннер изменений без перезаписи всей разметки (фикс дубля)
      const banner = document.getElementById("trains-changes-banner");
      const list = document.getElementById("trains-changes-list");
      const emptyBox = document.getElementById("trains-changes-empty");
      if (banner && list) {
          if (changedTrains.length > 0) {
              banner.style.display = 'block';
              if (emptyBox) emptyBox.style.display = 'none';
              list.innerHTML = [...new Set(changedTrains)].map(num =>
                `<span class="train-change-tag">${escapeHTML(num)}</span>`
              ).join('');
          } else {
              banner.style.display = 'none';
              list.innerHTML = '';
              // Змін немає — показуємо спокійний зелений статус
              if (emptyBox) emptyBox.style.display = 'flex';
          }
      }

      checkNotification('trains', changed);
      updateTrainsTabBadge(new Set(changedTrains).size);
      // Плитка «Електрички»: лише ті, що курсують сьогодні (без нового розкладу, що ще не діє)
      trainsTileList = d.trains.filter(x => { if (!x) return false; const w = trainScheduleWindow(x, today); return !w.gone && !w.pending; });
      renderTrainsTile();
    }
  } catch(e){ logSectionError('електрички', e); document.getElementById("list").innerHTML='<div class="empty-msg">Помилка завантаження</div>'; } 
}
 
// Рейси, які підсвічуються зеленим у розділі «Потяги» — так само, як робили
// для нового розкладу електричок. Порівнюємо лише цифри номера, тож літери
// чи пробіли в даних не заважають.
//
// Ключ — номер поїзда. Значення:
//   { label: 'до 15 серпня', until: '2026-08-15' }
//     label — що написати на зеленій плашці «КУРСУЄ …»
//     until — останній день підсвітки у форматі РРРР-ММ-ДД (включно).
//             Наступного дня підсвітка й плашка зникнуть САМІ.
//     Якщо until не вказати — підсвітка висітиме, доки її не приберуть руками.
//     Якщо label порожній — буде просто зелений рядок без плашки.
//
// ЩОБ ЗМІНИТИ: правте рядки нижче — додайте номер, приберіть або оновіть дати.
// Старий запис одним рядком ('119': 'до 15 серпня') теж працює: буде підсвітка
// з плашкою, але без автоматичного зникнення — дату треба знімати вручну.
const HIGHLIGHTED_TRAINS = {
  '119': { label: 'до 15 серпня', until: '2026-08-15' },   // Дніпро → Хелм
  '87': { label: 'до 15 серпня', until: '2026-08-15' }     // Дніпро → Ковель
};

// Запис підсвітки для поїзда. Номер об'єднаного поїзда приходить як «79/119»,
// і раніше всі цифри зліплювались у «79119» — підсвітка для 119 (він у списку
// вище) мовчки не спрацювала б. Тепер шукаємо кожен номер окремо.
function findTrainHighlight(number) {
  const parts = String(number || '').split('/').map(n => n.replace(/\D/g, '')).filter(Boolean);
  const hit = parts.find(n => Object.prototype.hasOwnProperty.call(HIGHLIGHTED_TRAINS, n));
  return hit ? HIGHLIGHTED_TRAINS[hit] : undefined;
}

// Об'єднані поїзди (однаковий час відправлення з Вільногірська): кольори блоків у шторці
const LT_VARIANT_COLORS = ['#74b9ff', '#00ff9c', '#ffcc00', '#ff7eb6'];

// Блок «Періодичність» і «Зміни розкладу» для одного поїзда
function longTrainInfoHtml(x) {
  let html = "";
  if (x.periodicityText) html += `<div class="details-divider"></div><div class="details-note" style="color: #74b9ff; background: rgba(116, 185, 255, 0.1); border-color: rgba(116, 185, 255, 0.15);"><b>Періодичність:</b><br><span style="color:inherit; font-weight:500;">${escapeHTML(x.periodicityText)}</span></div>`;
  if (Array.isArray(x.changes) && x.changes.length) html += `<div class="details-divider"></div><div class="details-note" style="color: var(--highlight-color); background: rgba(255, 204, 0, 0.1); border-color: rgba(255, 204, 0, 0.15);"><b>Зміни розкладу:</b><ul style="margin: 8px 0 0 0; padding-left: 20px; text-align: left; font-weight: 500;">${x.changes.map(c => `<li>${escapeHTML(c)}</li>`).join('')}</ul></div>`;
  return html;
}

// Поїзд №79 прямує через Київ — додаємо позначку до маршруту
function longTrainRouteHtml(x) {
  const nums = String(x.number || '').split('/').map(n => parseInt(n.replace(/\D/g, ''), 10));
  return nums.includes(79) ? `${escapeHTML(x.route)} <span style="font-size:0.85em; color:rgba(255,255,255,0.6); font-weight:600;">(через Київ)</span>` : escapeHTML(x.route);
}

// Шторка об'єднаного поїзда: кожен поїзд окремим блоком свого кольору,
// станції/час, яких немає в інших поїздів групи, виділено кольором поїзда
function renderTrainVariants(variants) {
  const key = s => `${s.station}|${s.time}`;
  const sets = variants.map(v => new Set((v.stops || []).map(key)));
  const legend = `<div class="lt-variants-legend">Багатогрупний пасажирський поїзд: вагони різних напрямків курсують разом, маршрут кожної групи — нижче.</div>`;
  return legend + variants.map((v, i) => {
    const color = LT_VARIANT_COLORS[i % LT_VARIANT_COLORS.length];
    const rows = (v.stops || []).map(s => [s.station, s.time, sets.some((set, j) => j !== i && !set.has(key(s)))]);
    return `<div class="lt-variant" style="--v-color:${color}"><div class="lt-variant-head"><span class="lt-variant-num">№${escapeHTML(v.number)}</span><span class="lt-variant-route">${longTrainRouteHtml(v)}</span></div>${rows.length ? renderGrid(rows, false, true) : "Немає даних"}${longTrainInfoHtml(v)}</div>`;
  }).join('');
}

// Порядок закріплених поїздів на початку списку: 38 Київ → Запоріжжя, далі 79/119 Дніпро → Львів / Хелм
const LONG_TRAINS_PINNED = ['38', '79'];

async function loadLongTrainsData() {
  try {
    const d = await fetchCachedJson("https://grateful-enthusiasm-production-c1cc.up.railway.app/schedule", 'long_trains_api', 30);
    if(d&&d.trains) {
      let h = `<div class="table-head"><div>№</div><div>Маршрут</div><div>Відпр.</div></div>`;
      // Сортуємо поїзди за часом відправлення (00:01, 04:04, ...)
      const toMin = (t) => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 99999; };
      // Поїзди з LONG_TRAINS_PINNED показуються першими у вказаному порядку, решта — за часом
      const pinIdx = (x) => { const nums = String(x.number || '').split('/'); const i = LONG_TRAINS_PINNED.findIndex(n => nums.includes(n)); return i < 0 ? Infinity : i; };
      const sortedTrains = Array.isArray(d.trains) ? d.trains.filter(Boolean).slice().sort((a, b) => (pinIdx(a) - pinIdx(b)) || (toMin(a.time) - toMin(b.time))) : [];
      if (!dataChanged('render_longtrains', sortedTrains)) return; // без змін — не закриваємо відкриті деталі
      sortedTrains.forEach((x,i) => {
        if(!x) return; const id = "lt-" + i; const sm = x.stops ? x.stops.map(s => [s.station, s.time]) : [];
        // Об'єднаний поїзд (кілька поїздів з однаковим часом) — у шторці кожен окремо
        const isMulti = Array.isArray(x.variants) && x.variants.length > 1;
        const routeText = longTrainRouteHtml(x);
        // Зелена підсвітка рейсу (клас train-new забарвлює і рамку, і номер)
        const rawHighlight = findTrainHighlight(x.number);
        // Приймаємо і новий запис обʼєктом, і старий одним рядком
        const highlight = (typeof rawHighlight === 'string') ? { label: rawHighlight } : rawHighlight;
        const isHighlightActive = !!highlight && (!highlight.until || getKyivDateISO() <= highlight.until);
        const rowClass = isHighlightActive ? ' train-new' : '';
        // Після дати until підсвітка та плашка автоматично зникають
        const untilTxt = isHighlightActive ? String(highlight.label || '').trim() : '';
        const untilTag = untilTxt ? `<div class="train-new-tag">🚆 КУРСУЄ <span class="train-new-date">${escapeHTML(untilTxt)}</span></div>` : '';
        const routeCell = `<div class="route-cell"><div class="route-text${isMulti ? ' multi' : ''}">${routeText}</div>${untilTag}</div>`;
        const numHtml = String(x.number || '').split('/').map(escapeHTML).join('/<wbr>');
        const detailsHtml = isMulti ? renderTrainVariants(x.variants) : `${sm.length ? renderGrid(sm, false, true) : "Немає даних"}${longTrainInfoHtml(x)}`;
        h += `<div class="train${rowClass}" onclick="toggleTransportDetails('${id}', this)"><div class="train-num-box${isMulti ? ' multi' : ''}">${numHtml}</div>${routeCell}<div class="time-val">${escapeHTML(x.time)}</div></div><div class="details" id="${id}">${detailsHtml}</div>`;
      });
      document.getElementById("long-trains-list").innerHTML = h;
    }
  }catch(e){ logSectionError('потяги', e); invalidateRender('render_longtrains'); document.getElementById("long-trains-list").innerHTML='<div class="empty-msg">Помилка завантаження</div>'; }
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
      // Перемальовуємо лише коли розклад справді змінився, інакше автооновлення
      // щоразу згортало б відкриті деталі маршруту
      if (dataChanged('render_buses', d.buses)) document.getElementById("buses-list").innerHTML = h;
    }
  }catch(e){ logSectionError('автобуси', e); invalidateRender('render_buses'); document.getElementById("buses-list").innerHTML='<div class="empty-msg">Помилка завантаження</div>'; } 
}

function switchBlaBlaList(type) {
  document.querySelectorAll('.blabla-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('blabla-drivers-list').style.display = 'none'; document.getElementById('blabla-passengers-list').style.display = 'none';
  if (type === 'drivers') { document.getElementById('btn-show-drivers').classList.add('active'); document.getElementById('blabla-drivers-list').style.display = 'block'; } 
  else { document.getElementById('btn-show-passengers').classList.add('active'); document.getElementById('blabla-passengers-list').style.display = 'block'; }
  window.dataLayer = window.dataLayer || []; window.dataLayer.push({'event': 'tab_view', 'tab_name': 'blablacar_' + type, 'tab_group': 'blablacar_sub'});
}

async function submitBlaBlaForm(event) {
  event.preventDefault(); if (cabBlockedSubmit() || !validateCaptcha('custom-blabla-form')) return;
  const submitBtn = document.getElementById('form-submit-btn'); const originalBtnText = submitBtn.innerText; submitBtn.innerText = 'Відправка...'; submitBtn.disabled = true; submitBtn.style.opacity = '0.7';
  const formData = { type: document.getElementById('input-type').value, name: document.getElementById('input-name').value, from: document.getElementById('input-from').value, to: document.getElementById('input-to').value, date: document.getElementById('input-date').value, time: document.getElementById('input-time-to').value ? `${document.getElementById('input-time-from').value} - ${document.getElementById('input-time-to').value}` : document.getElementById('input-time-from').value, seats: parseInt(document.getElementById('input-seats').value, 10), price: document.getElementById('input-price').value ? parseInt(document.getElementById('input-price').value, 10) : 0, phone: document.getElementById('input-phone').value, comment: document.getElementById('input-comment').value };
  try {
    const headers = { 'Content-Type': 'application/json' };
    // Є вхід у кабінет (бета) — додаємо токен: сервер запам'ятає, чия поїздка, і вона з'явиться в «Моїх оголошеннях»
    const idToken = await cabAdsToken(); if (idToken) headers.Authorization = 'Bearer ' + idToken;
    const response = await fetch(BLABLA_API + '/api/rides', { method: 'POST', headers: headers, body: JSON.stringify(formData) });
    if (!response.ok) { let why = ''; try { why = (await response.json()).error || ''; } catch (e) {} throw new Error(why || 'Помилка сервера при збереженні'); }
    showToast('✅ Ваше оголошення успішно додано!', 'success');
    closeModalForm(null, 'blabla-modal'); switchBlaBlaList(formData.type === 'driver' ? 'drivers' : 'passengers'); loadBlaBlaCarData(); 
    if (idToken) cabAdsChanged(); // подали з кабінету — оновити «Мої оголошення»
  } catch (error) { showToast('❌ Помилка при відправці: ' + error.message, 'error'); } finally { submitBtn.innerText = originalBtnText; submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
}

// Компактні монохромні SVG-іконки типів для бейджів вкладок (успадковують колір тексту)
const TAB_ICONS = {
  car: '<path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>',
  person: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  key: '<path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>',
  sell: '<path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>',
  star: '<path d="M12 2l2.6 6.6L22 9.2l-5.5 4.4L18.2 21 12 16.9 5.8 21l1.7-7.4L2 9.2l7.4-.6z"/>',
  wrench: '<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>',
  search: '<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>',
  warn: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
  home: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
  box: '<path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z"/>',
  event: '<path d="M20 12c0-1.1.9-2 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v4c1.1 0 2 .9 2 2s-.9 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2zm-4.42 4.8L12 14.5l-3.58 2.3 1.08-4.12-3.29-2.69 4.24-.25L12 5.8l1.54 3.95 4.24.25-3.29 2.69 1.09 4.11z"/>',
  volunteer: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
  train: '<path d="M12 2c-4.42 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>',
  briefcase: '<path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>',
  clock: '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>',
  bolt: '<path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"/>',
  tag: '<path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>'
};
function tabIco(name) {
  return TAB_ICONS[name] ? `<svg class="tab-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${TAB_ICONS[name]}</svg>` : '';
}
// Сегментований бейдж: одна половинка з іконкою-типом і лічильником
function tabSeg(icon, count) {
  return `<span class="tab-seg">${tabIco(icon)}<b>${count}</b></span>`;
}
// Дві половинки з вертикальним розділювачем; якщо активний лише один тип — показуємо одну
function buildTwoTypeBadge(a, b) {
  if (a.count > 0 && b.count > 0) return tabSeg(a.icon, a.count) + '<span class="tab-seg-div"></span>' + tabSeg(b.icon, b.count);
  if (a.count > 0) return tabSeg(a.icon, a.count);
  if (b.count > 0) return tabSeg(b.icon, b.count);
  return '';
}

// Бейдж на вкладці. Якщо вміст той самий — не чіпаємо DOM: інакше кожне
// автооновлення видаляло й створювало елемент заново, і анімація пульсу
// щоразу починалась спочатку (у бейджа затримок це вже було полагоджено).
function setTabBadge(tab, cls, html, title) {
  if (!tab) return;
  tab.style.position = 'relative';
  const old = tab.querySelector('.' + cls);
  const wanted = html || '';
  if (old && old.dataset.v === wanted) { if (title) old.title = title; return; }
  if (old) old.remove();
  if (!wanted) return;
  const badge = document.createElement('span');
  badge.className = cls;
  badge.dataset.v = wanted;
  badge.innerHTML = wanted;
  if (title) badge.title = title;
  tab.appendChild(badge);
}

function updateBlaBlaTabBadge(driversCount, passengersCount) {
  const tab = document.querySelector('.tab-btn[onclick*="\'blablacar\'"]');
  const total = driversCount + passengersCount;
  const html = total === 0 ? '' : '<span class="bb-dot"></span>' + buildTwoTypeBadge({icon:'car', count:driversCount}, {icon:'person', count:passengersCount});
  setTabBadge(tab, 'blabla-live-badge', html, `Активних поїздок: ${total} (водії: ${driversCount}, пасажири: ${passengersCount})`);
}

function updateCommunalTabBadge(total) {
  setTabBadge(document.querySelector('.tab-alert.communal'), 'communal-live-badge',
    total ? tabSeg('bolt', total) : '', `Активних комунальних повідомлень: ${total}`);
}

function updatePromosTabBadge(total) {
  setTabBadge(document.querySelector('.tab-alert.promos'), 'promos-live-badge',
    total ? tabSeg('tag', total) : '', `Активних акцій: ${total}`);
}

function updateEventsTabBadge(total) {
  if (typeof total === 'number') {
    try { localStorage.setItem('events_active_count', String(total)); } catch(e) {}
  }
  setTabBadge(document.querySelector('.tab-alert.events'), 'events-live-badge',
    total ? tabSeg('event', total) : '', `Активних афіш: ${total}`);
}

function updateTrainsTabBadge(total) {
  setTabBadge(document.querySelector('.tab-btn[onclick*="\'trains\'"]'), 'trains-live-badge',
    total ? '<span class="tr-dot"></span>' + tabSeg('train', total) : '',
    `Електричок зі змінами в розкладі: ${total}`);
}

function updateJobsTabBadge(total) {
  setTabBadge(document.querySelector('.tab-btn[onclick*="\'jobs-tab\'"]'), 'jobs-live-badge',
    total ? '<span class="jb-dot"></span>' + tabSeg('briefcase', total) : '',
    `Активних вакансій: ${total}`);
}

function updateEstateTabBadge(rentCount, saleCount, total) {
  let inner = '';
  if (total) {
    inner = '<span class="ef-dot"></span>';
    inner += ((rentCount > 0 || saleCount > 0) && rentCount + saleCount === total)
      ? buildTwoTypeBadge({icon:'key', count:rentCount}, {icon:'sell', count:saleCount})
      : tabSeg('home', total);
  }
  setTabBadge(document.querySelector('.tab-btn[onclick*="\'estate-tab\'"]'), 'estate-live-badge', inner,
    `Активних оголошень: ${total} (оренда: ${rentCount}, продаж: ${saleCount})`);
}

function updateFleaTabBadge(newCount, usedCount, total) {
  let inner = '';
  if (total) {
    inner = '<span class="ef-dot"></span>';
    inner += ((newCount > 0 || usedCount > 0) && newCount + usedCount === total)
      ? buildTwoTypeBadge({icon:'star', count:newCount}, {icon:'wrench', count:usedCount})
      : tabSeg('box', total);
  }
  setTabBadge(document.querySelector('.tab-btn[onclick*="\'flea-market-tab\'"]'), 'flea-live-badge', inner,
    `Активних оголошень: ${total} (нові: ${newCount}, вживані: ${usedCount})`);
}

function updateLostTabBadge(foundCount, lostCount) {
  const total = foundCount + lostCount;
  const html = total === 0 ? '' : '<span class="lf-dot"></span>' + buildTwoTypeBadge({icon:'search', count:foundCount}, {icon:'warn', count:lostCount});
  setTabBadge(document.querySelector('.tab-btn[onclick*="\'lost-found-tab\'"]'), 'lost-live-badge', html,
    `Активних оголошень: ${total} (знайдено: ${foundCount}, втрачено: ${lostCount})`);
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
    const raw = await fetchCachedJson(BLABLA_API + '/api/rides', 'blabla_api', 2);
    const d = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rides) ? raw.rides : []);
    markNewItems(d, 'blablacar');
    checkNotification('blablacar', d);

    const dr = d.filter(x => x && x.type === 'driver' && (isVilnohirsk(x.from) || isVilnohirsk(x.to))).reverse();
    const ps = d.filter(x => x && x.type === 'passenger' && (isVilnohirsk(x.from) || isVilnohirsk(x.to))).reverse();
    updateBlaBlaTabBadge(dr.length, ps.length);
    updateBlaBlaToggleCounts(dr.length, ps.length);

    if (!dataChanged('render_blabla', d)) return; // дані ті самі — списки не чіпаємо
    let htmlD = dr.length ? dr.map(x => `<div class="blabla-card"><div class="blabla-route">📍 ${escapeHTML(x.from)} - ${escapeHTML(x.to)}</div><div class="blabla-date">🗓 ${escapeHTML(x.date)} | 🕒 ${escapeHTML(x.time)}</div><div style="font-size:12px; margin-bottom:5px;">👤 <b>${escapeHTML(x.name)}</b>${x.isNewItem ? NEW_BADGE_HTML : ''}</div><div class="blabla-info-row"><span>💺 Місць: <b>${escapeHTML(x.seats)}</b></span><span>💵 <b>${x.price > 0 ? escapeHTML(x.price) + ' грн' : 'Договірна'}</b></span></div>${x.comment ? `<div class="card-desc">💬 ${escapeHTML(x.comment)}</div>` : ''}<div style="text-align:right; margin-top:5px;">${phoneLinkHtml(x.phone, 'blabla-phone', '📞 ')}</div></div>`).join('') : '<div class="empty-msg">Пропозицій немає</div>';
    let htmlP = ps.length ? ps.map(x => `<div class="blabla-card"><div class="blabla-route">📍 ${escapeHTML(x.from)} - ${escapeHTML(x.to)}</div><div class="blabla-date">🗓 ${escapeHTML(x.date)} | 🕒 ${escapeHTML(x.time)}</div><div style="font-size:12px; margin-bottom:5px;">👤 <b>${escapeHTML(x.name)}</b>${x.isNewItem ? NEW_BADGE_HTML : ''}</div><div class="blabla-info-row"><span>🧍 Потрібно місць: <b>${escapeHTML(x.seats)}</b></span></div>${x.comment ? `<div class="card-desc">💬 ${escapeHTML(x.comment)}</div>` : ''}<div style="text-align:right; margin-top:5px;">${phoneLinkHtml(x.phone, 'blabla-phone', '📞 ')}</div></div>`).join('') : '<div class="empty-msg">Запитів немає</div>';
    
    document.getElementById('blabla-drivers-list').innerHTML = htmlD;
    document.getElementById('blabla-passengers-list').innerHTML = htmlP;
  } catch(e) {
    logSectionError('попутники', e); invalidateRender('render_blabla');
    // Раніше тут не було жодного повідомлення — розділ просто лишався порожнім
    const errHtml = '<div class="empty-msg" style="color:#ff6b6b;">Помилка завантаження попутників</div>';
    const dl = document.getElementById('blabla-drivers-list'); if (dl) dl.innerHTML = errHtml;
    const pl = document.getElementById('blabla-passengers-list'); if (pl) pl.innerHTML = errHtml;
    updateBlaBlaTabBadge(0, 0); updateBlaBlaToggleCounts(0, 0);
  }
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
    logSectionError('рядок новин', e);
    const tc = document.getElementById('ticker-container');
    if (tc) tc.style.display = 'none';
  }
}

// Дві подачі одного й того ж шаблону картки. Розшук лишається червоним,
// як був, полон робимо синім: людина не зникла, місцеперебування відоме.
const PHOENIX_VIEWS = {
  missing: {
    groupTitle: 'Зниклі безвісти',
    groupSub: '',
    ribbon: 'Зник безвісти',
    ribbonBg: 'linear-gradient(90deg, rgba(220, 38, 38, 0.9), rgba(153, 27, 27, 0.9))',
    tileTint: 'rgba(255, 77, 77, 0.05)',
    tileBorder: 'rgba(255, 77, 77, 0.3)',
    infoBg: 'rgba(255, 77, 77, 0.1)',
    infoBorder: 'rgba(255,77,77,0.2)',
    accent: '#ff4d4d',
    dateLabel: 'Зник:'
  },
  captive: {
    groupTitle: 'У полоні',
    groupSub: 'їх знайшли, чекаємо на повернення додому',
    ribbon: 'У полоні',
    ribbonBg: 'linear-gradient(90deg, rgba(37, 99, 235, 0.9), rgba(23, 55, 128, 0.9))',
    tileTint: 'rgba(96, 165, 250, 0.06)',
    tileBorder: 'rgba(96, 165, 250, 0.35)',
    infoBg: 'rgba(96, 165, 250, 0.1)',
    infoBorder: 'rgba(96,165,250,0.25)',
    accent: '#60a5fa',
    dateLabel: 'У полоні з:'
  }
};

// Усе живе в одній вкладці ФЕНІКС. Полонені йдуть окремою групою попереду:
// їх небагато, а новина про те, що людину знайшли, не має губитись серед
// карток розшуку. Заголовки груп показуємо лише коли є обидві — інакше
// розділ виглядає рівно так, як виглядав до появи полону.
// Пошук по розділу ФЕНІКС. Людей уже кілька десятків, гортати весь список,
// щоб знайти одне прізвище, довго.
let allPhoenixItems = [];   // повний список, щоб фільтрувати без перезавантаження
let phoenixQuery = '';
let phoenixSearchTimer = null;

// Пошук має прощати дрібниці: різні апострофи, і/ї/й/и, е/є, г/ґ, латинську i.
// Прізвище часто набирають на слух і легко влучають не в ту літеру.
function foldForSearch(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[\u02bc'\u2019`\u00b4]/g, '')
    .replace(/[іїийы]/g, 'и')
    .replace(/i/g, 'и')
    .replace(/[еєэё]/g, 'е')
    .replace(/ґ/g, 'г')
    .replace(/\s+/g, ' ')
    .trim();
}

// Основний пошук — саме за прізвищем: воно стоїть першим у полі name, тож
// звіряємо ПОЧАТОК рядка. Інакше запит «Іванов» витягував би ще й усіх
// Івановичів по батькові. Позивний перевіряємо так само з початку.
// Заразом працює уточнення на кшталт «абаза є» — прізвище плюс початок імені.
function phoenixStartsWith(item, folded) {
  if (!item) return false;
  const name = foldForSearch(item.name);
  if (name.indexOf(folded) === 0) return true;
  const callsign = foldForSearch(item.callsign);
  return !!callsign && callsign.indexOf(folded) === 0;
}

// Запасний, ширший пошук: збіг будь-де в імені чи позивному. Вмикається лише
// коли за прізвищем не знайшлось нічого — щоб людина не впиралась у порожній
// екран, якщо пам'ятає лише ім'я або по батькові.
function phoenixMatches(item, folded) {
  if (!folded) return true;
  if (!item) return false;
  const hay = foldForSearch(item.name) + ' ' + foldForSearch(item.callsign);
  return hay.indexOf(folded) !== -1;
}

function filterPhoenix() {
  const input = document.getElementById('phoenix-search');
  if (!input) return;
  clearTimeout(phoenixSearchTimer);
  phoenixSearchTimer = setTimeout(() => {
    phoenixQuery = input.value;
    const clearBtn = document.getElementById('phoenix-search-clear');
    if (clearBtn) clearBtn.style.display = input.value ? 'flex' : 'none';
    renderPhoenixList(allPhoenixItems);
  }, 150);
}

function clearPhoenixSearch() {
  const input = document.getElementById('phoenix-search');
  if (input) { input.value = ''; input.focus(); }
  phoenixQuery = '';
  const clearBtn = document.getElementById('phoenix-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  renderPhoenixList(allPhoenixItems);
}

function renderPhoenixList(items) {
  const cont = document.getElementById('phoenix-list-content');
  if (!cont) return;
  const box = document.getElementById('phoenix-search-box');
  // Поле пошуку показуємо лише коли є що шукати
  if (box) box.style.display = (items && items.length) ? 'flex' : 'none';
  if (!items || !items.length) { cont.innerHTML = '<div class="empty-msg">Актуальної інформації немає</div>'; return; }

  const folded = foldForSearch(phoenixQuery);
  let found = items, wide = false;
  if (folded) {
    found = items.filter(it => phoenixStartsWith(it, folded));
    if (!found.length) { found = items.filter(it => phoenixMatches(it, folded)); wide = found.length > 0; }
  }
  if (!found.length) {
    cont.innerHTML = `<div class="phoenix-nores">`
      + `<div class="phoenix-nores-ico">🔎</div>`
      + `<div class="phoenix-nores-title">Нікого не знайдено</div>`
      + `<div class="phoenix-nores-sub">За запитом «${escapeHTML(String(phoenixQuery).trim())}» збігів немає. Спробуйте ввести лише початок прізвища.</div>`
      + `<button type="button" class="phoenix-nores-btn" onclick="clearPhoenixSearch()">Показати всіх</button>`
      + `</div>`;
    return;
  }

  const captives = found.filter(isPhoenixCaptive);
  const missing = found.filter(item => !isPhoenixCaptive(item));
  const withHeads = captives.length > 0 && missing.length > 0;
  // Під час пошуку показуємо, скільки знайшли, щоб не рахувати картки очима
  const counter = folded
    ? `<div class="phoenix-found">Знайдено: <b>${found.length}</b> з ${items.length}${wide ? ' <span class="phoenix-found-note">(за прізвищем збігів немає — шукали в імені)</span>' : ''}</div>`
    : '';
  cont.innerHTML = counter
                 + phoenixGroupHtml(captives, PHOENIX_VIEWS.captive, captives.length > 0)
                 + phoenixGroupHtml(missing, PHOENIX_VIEWS.missing, withHeads);
}

function phoenixGroupHtml(items, view, withHead) {
  if (!items || !items.length) return '';
  let html = '';
  if (withHead) {
    const sub = view.groupSub
      ? `<div style="font-size: 9px; font-weight: 700; text-transform: none; letter-spacing: 0; color: rgba(255,255,255,0.85); margin-top: 3px;">${escapeHTML(view.groupSub)}</div>`
      : '';
    html += `<div style="text-align: center; margin: 4px 0 10px; padding: 7px 12px; border-radius: 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; background: ${view.ribbonBg}; box-shadow: 0 4px 12px rgba(0,0,0,0.35); text-shadow: 0 1px 2px rgba(0,0,0,0.8);">${escapeHTML(view.groupTitle)} · ${items.length}${sub}</div>`;
  }
  html += '<div class="shops-tile-grid">';
  items.forEach((item, i) => {
    if(!item) return;
    
    let thumbUrl = item.photos && item.photos.length > 0 ? getDriveImageUrl(item.photos[0]) : '';
    
    let photoClickAttr = '';
    if (item.photos && item.photos.length > 0) {
      photoClickAttr = `onclick="openImageModal(JSON.parse(decodeURIComponent('${packForAttr(item.photos.map(getDriveImageUrl))}')), 0, event)"`;
    }

    const thumb = thumbUrl 
      ? `<img alt="Фото" src="${escapeHTML(thumbUrl)}" loading="lazy" decoding="async" onload="this.style.opacity='1'" style="object-fit: contain !important; width: 100%; height: 100%; border-radius: 8px; cursor: pointer; opacity:0; transition:opacity 0.3s ease;" ${photoClickAttr}>` 
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:12px;font-weight:bold;color:rgba(255,255,255,0.3);background:#111;border-radius:8px;">ФОТО ВІДСУТНЄ</div>`;
    
    const dot = item.isNewItem ? NEW_BADGE_HTML : '';
    
    const callsignHtml = item.callsign 
      ? `<div style="font-size: 11px; color: #ffcc00; font-weight: 800; text-align: center; margin-bottom: 6px; text-transform: uppercase;">Позивний: «${escapeHTML(item.callsign)}»</div>` 
      : '';
    
    // У полоні дата зникнення сама по собі ні про що не каже, а в файлі там
    // зазвичай стоїть текст «у полоні». Якщо цифр немає — пишемо статус,
    // якщо дата відома — «У полоні з».
    let dateValue = String(item.date_missing == null ? '' : item.date_missing).trim();
    let dateLabel = view.dateLabel;
    if (view === PHOENIX_VIEWS.captive && !/\d/.test(dateValue)) { dateLabel = 'Статус:'; dateValue = 'У полоні'; }
    if (!dateValue) dateValue = '-';

    const photoBadge = (item.photos && item.photos.length > 1) 
      ? `<div style="position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,0.7); color:#fff; font-size:9px; padding:3px 8px; border-radius:6px; font-weight:bold; pointer-events:none; border: 1px solid rgba(255,255,255,0.2);">📸 ${item.photos.length}</div>` 
      : '';

    html += `
    <div class="shop-tile" style="background: linear-gradient(180deg, ${view.tileTint} 0%, rgba(0,0,0,0.6) 100%); border: 1px solid ${view.tileBorder}; box-shadow: 0 8px 20px rgba(0,0,0,0.5); justify-content: flex-start; cursor: default; padding: 10px;">
      <div style="background: ${view.ribbonBg}; color: #fff; text-align: center; font-weight: 800; font-size: 10px; text-transform: uppercase; padding: 4px; border-radius: 6px 6px 0 0; margin: -10px -10px 10px -10px; letter-spacing: 0.5px; box-shadow: 0 2px 5px rgba(0,0,0,0.5); text-shadow: 0 1px 2px rgba(0,0,0,0.8);">${view.ribbon}</div>
      
      <div class="shop-tile-photo" style="height: 180px; padding: 0; background: #000; border: none; border-radius: 8px; margin-bottom: 10px; box-shadow: inset 0 4px 10px rgba(0,0,0,0.5); position: relative;">
        ${thumb}
        ${photoBadge}
      </div>
      
      <div style="font-size: 9px; font-weight: 800; color: #f8fafc; text-align: center; line-height: 1.4; margin-bottom: 8px; text-transform: uppercase; word-break: break-word;">
        ${escapeHTML(item.name)}${dot}
      </div>
      
      ${callsignHtml}
      
      <div style="background: ${view.infoBg}; border-radius: 8px; padding: 8px 0; margin-top: auto; border: 1px solid ${view.infoBorder}; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; padding-left: 8px; padding-right: 8px;">
          <span style="font-size: 8px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 2px;">Народився:</span>
          <span style="font-size: 10px; color: #fff; font-weight: 700;">${escapeHTML(item.dob || '-')}</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding-left: 8px; padding-right: 8px;">
          <span style="font-size: 8px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 2px;">${escapeHTML(dateLabel)}</span>
          <span style="font-size: 11px; color: ${view.accent}; font-weight: 800;">${escapeHTML(dateValue)}</span>
        </div>
      </div>
    </div>`;
  });
  html += '</div>';
  return html;
}

// Список розшуку впорядковуємо за прізвищем. Просте порівняння рядків тут не
// годиться: в Юнікоді І, Ї, Є та Ґ стоять ПЕРЕД А, тому «Іванов» опинявся б
// вище за «Абазу». Тому беремо українське мовне впорядкування, а якщо його
// раптом немає (дуже старий браузер), лишаємо порядок такий, як у файлі.
const phoenixCollator = (function () {
  try { return new Intl.Collator('uk'); } catch (e) { return null; }
})();
function comparePhoenixByName(a, b) {
  // Ім'я записане як «Прізвище Ім'я По батькові», тож порівняння всього рядка
  // сортує спершу за прізвищем, а однофамільців — за іменем. Подвійні пробіли
  // всередині трапляються, тому зводимо їх до одного.
  const norm = (x) => String((x && x.name) || '').replace(/\s+/g, ' ').trim();
  const an = norm(a), bn = norm(b);
  if (phoenixCollator) return phoenixCollator.compare(an, bn);
  return an < bn ? -1 : (an > bn ? 1 : 0);
}

// Людина у полоні — це не «зник безвісти»: місцеперебування відоме. У файлі це
// вже позначається текстом «у полоні» замість дати в date_missing, тож окремих
// правок даних не треба. Про запас розуміємо і явне поле status.
function isPhoenixCaptive(item) {
  const s = (String((item && item.status) || '') + ' ' + String((item && item.date_missing) || '')).toLowerCase();
  return s.indexOf('полон') !== -1 || s.indexOf('плен') !== -1;
}

// Скільки людей у списку — одразу в назві вкладки, щоб число було видно
// ще до того, як людина відкриє розділ. Порожнє значення нічого не дописує,
// тож при збої завантаження напис лишається таким, як був.
function updateTabCount(elId, n) {
  const el = document.getElementById(elId);
  if (!el) return;
  // Нерозривні пробіли: звичайний на початку рядка вставки браузер стискає,
  // і виходило «РОЗШУК· 37». Заодно число не відірветься від слова при переносі.
  const txt = n > 0 ? ' · ' + n : '';
  if (el.textContent !== txt) el.textContent = txt;
}

// Розшук ФЕНІКС — дані з data/phoenix.yaml.
// Раніше список приходив з окремого сервісу на Railway, який лише пересилав
// той самий перелік у JSON. 04.08 він почав падати: 8 запитів поспіль — 8
// відповідей HTTP 500 за 0.2 секунди, і розділ показував помилку завантаження.
// Тепер файл лежить поруч із сайтом: поки працює сайт, працює й розділ.
// Фотографії як лежали в GitHub, так і лишились — у файлі ті самі посилання.
async function loadPhoenixData() {
  const cont = document.getElementById('phoenix-list-content');
  if (!cont) return;
  if (!yamlReady('phoenix', loadPhoenixData, () => showSectionFailure('phoenix-list-content', 'loadPhoenixData', 'phoenix'))) return;
  try {
    const res = await fetch('./data/phoenix.yaml?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = jsyaml.load(await res.text()) || {};
    const list = Array.isArray(data.phoenix) ? data.phoenix : [];
    // active: false ховає окрему картку, не видаляючи її з файлу
    const activeItems = list
      .filter(item => item && item.active !== false && String(item.name || '').trim() !== '')
      .sort(comparePhoenixByName); // за абеткою, щоб людину було легко знайти в списку
    // На вкладці пишемо саме кількість тих, кого шукають: полонених знайшли,
    // тож у число розшуку вони не входять, хоч і показуються в тому ж розділі.
    allPhoenixItems = activeItems; // щоб пошук фільтрував без повторного завантаження
    updateTabCount('phoenix-tab-count', activeItems.filter(item => !isPhoenixCaptive(item)).length);
    markNewItems(activeItems, 'phoenix');
    checkNotification('phoenix', activeItems);
    if (dataChanged('render_phoenix', activeItems)) renderPhoenixList(activeItems);
  } catch(e) {
    logSectionError('ФЕНІКС', e); invalidateRender('render_phoenix');
    cont.innerHTML = `<div class="empty-msg" style="color: #ff6b6b;">Помилка завантаження даних Фенікс</div>`;
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
    badge.innerHTML = `<span class="tab-seg">${tabIco('volunteer')}<b>ЗБІР</b></span>`;
    badge.title = 'Активний збір';
  } else {
    const word = (n >= 2 && n <= 4) ? 'ЗБОРИ' : 'ЗБОРІВ';
    badge.innerHTML = `<span class="tab-seg">${tabIco('volunteer')}<b>${word} ×${n}</b></span>`;
    badge.title = `Активних зборів: ${n}`;
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

// Збірка карток зборів (використовується і для живих даних, і для збережених локально)
function buildZsuCardsHtml(items) {
    const useGrid = items.length >= 2;
    let html = useGrid ? '<div class="zsu-grid">' : '';
    items.forEach((item, i) => {
        const title = item.title || 'ЗБІР НА ЗСУ'; const desc = item.description ? nl2br(item.description) : 'Підтримайте наших захисників!';
        // Посилання на банку — лише http(s), щоб у href не потрапило щось небезпечне
        const jarUrl = /^https?:\/\//i.test(String(item.jar_url || '').trim()) ? String(item.jar_url).trim() : '';
        const cardNumber = item.card_number || ''; const id = Math.random().toString(36).substr(2, 5);
        const collected = item.collected ? parseInt(item.collected.toString().replace(/\D/g, ''), 10) : 0; const goal = item.goal ? parseInt(item.goal.toString().replace(/\D/g, ''), 10) : 0;
        let progressHtml = '';
        if (goal > 0) {
            const percent = Math.min(Math.round((collected / goal) * 100), 100);
            progressHtml = `<div class="zsu-card-progress" style="width: 100%; margin-top: 15px; margin-bottom: 5px;"><div class="zsu-progress-labels" style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 6px;"><span style="color: #00ff9c;">Зібрано: ${collected.toLocaleString('uk-UA')} ₴</span><span style="color: rgba(255,255,255,0.5);">Ціль: ${goal.toLocaleString('uk-UA')} ₴</span></div><div style="width: 100%; height: 6px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);"><div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #ffcc00); border-radius: 10px; transition: width 1s ease-in-out;"></div></div></div>`;
        }
        let reqsHtml = '';
        if (jarUrl) reqsHtml += `<a class="zsu-req-jar" href="${escapeHTML(jarUrl)}" target="_blank" rel="noopener" style="display: block; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; margin-bottom: 10px; text-decoration: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(0,0,0,0.25)'"><div class="zsu-req-jar-label" style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="font-size: 16px;">🏦</span><span style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Посилання на Банку</span></div><div class="zsu-req-jar-url" style="font-size: 13px; color: var(--time-green); font-weight: 800; word-break: break-all; line-height: 1.4;" id="jar-${id}">${escapeHTML(jarUrl)}</div></a>`;
        if (cardNumber) reqsHtml += `<div class="zsu-req-card" style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px;"><div class="zsu-req-card-label" style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><span style="font-size: 16px;">💳</span><span style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Номер картки</span></div><div class="zsu-req-card-num" style="font-size: ${String(cardNumber).length > 19 ? '13px' : '18px'}; font-weight: 800; font-family: monospace; letter-spacing: 1px; color: #fff; margin-bottom: 12px; text-align: center; word-break: break-all; overflow-wrap: anywhere;" id="card-${id}">${escapeHTML(cardNumber)}</div><button class="zsu-req-card-btn" onclick="copyToClipboardBtn('${String(cardNumber).replace(/[^A-Za-z0-9]/g, '')}', this)" style="width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; padding: 10px; font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s;">📋 Копіювати номер</button></div>`;

        const dot = item.isNewItem ? NEW_BADGE_HTML : '';
        html += `<div class="zsu-card" style="margin-bottom: 20px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); position: relative;"><div class="zsu-card-header" style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; padding-right: 15px;"><div style="width: 10px; height: 10px; border-radius: 50%; background: #ffcc00; box-shadow: 0 0 10px rgba(255, 204, 0, 0.6); margin-top: 4px; flex-shrink: 0; animation: pulseAlert 2s infinite;"></div><div class="zsu-card-title" style="font-size: 15px; font-weight: 800; color: #fff; line-height: 1.3; text-align: left;">${escapeHTML(title)}${dot}</div></div><div class="zsu-card-desc" style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.6; text-align: left; margin-bottom: 15px; word-break: break-word;">${desc}</div>${progressHtml}<div class="zsu-card-reqs" style="margin-top: 20px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;"><div class="zsu-card-reqs-title" style="font-size: 10px; font-weight: 700; color: var(--highlight-color); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; text-align: left;">Реквізити для допомоги:</div>${reqsHtml}</div></div>`;
    });
    if (useGrid) html += '</div>';
    return html;
}

// Збори на ЗСУ — дані з data/zsu.yaml (формат той самий, що був у сервері зборів).
// Раніше дані йшли через окремий сервіс на Railway, який читав цей же yaml і був
// зайвою ланкою: 25.07 він почав віддавати HTTP 500 і розділ лишився порожнім.
// Тепер файл лежить поруч із сайтом — поки працює сайт, працює й розділ.
async function loadVolunteersData(opts) {
  const container = document.getElementById('volunteers-list-content'); if (!container) return;
  const forceRefresh = opts && opts.forceRefresh;
  if (!yamlReady('zsu', () => loadVolunteersData(opts), () => showSectionFailure('volunteers-list-content', 'loadVolunteersData', 'zsu'))) return;
  const emptyZsuHtml = `<div style="padding: 24px 18px; text-align: center; background: linear-gradient(145deg, rgba(56, 189, 248, 0.12), rgba(255, 204, 0, 0.08)); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.06);"><div style="font-size: 44px; margin-bottom: 8px;">💙💛</div><div style="font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 14px; line-height: 1.3;">Активних зборів зараз немає</div><div style="padding: 12px; background: rgba(0,0,0,0.25); border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; font-size: 11px; color: rgba(255,255,255,0.75); line-height: 1.5;">🤝 Ви волонтер? Маєте офіційний збір?<br>Напишіть нам у Telegram: <a href="https://t.me/vilnohirsk" target="_blank" rel="noopener" style="color: var(--time-green); text-decoration: none; font-weight: 800; font-size: 13px;">@vilnohirsk</a></div><div style="margin-top: 14px; font-size: 13px; font-weight: 800; color: #ffcc00; letter-spacing: 0.5px; text-shadow: 0 0 10px rgba(255,204,0,0.4);">Слава Україні! 🇺🇦</div></div>`;
  try {
    const res = await fetch('./data/zsu.yaml?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = jsyaml.load(await res.text()) || {};
    const list = Array.isArray(data.volunteers) ? data.volunteers : [];
    // active: false ховає окремий збір, не видаляючи його з файлу
    const activeItems = list.filter(item => item && item.active !== false && String(item.title || '').trim() !== '');

    markNewItems(activeItems, 'volunteers');
    checkNotification('volunteers', activeItems);
    updateZsuTabIndicator(activeItems);

    // Без змін — не перезбираємо відкриту секцію
    if (!dataChanged('render_zsu', activeItems) && !forceRefresh) return;

    container.innerHTML = activeItems.length ? buildZsuCardsHtml(activeItems) : emptyZsuHtml;
  } catch (e) {
    logSectionError('збори ЗСУ', e); invalidateRender('render_zsu');
    container.innerHTML = `<div style="padding: 24px 18px; text-align: center; background: linear-gradient(145deg, rgba(255, 77, 77, 0.12), rgba(255, 204, 0, 0.08)); border: 1px solid rgba(255, 77, 77, 0.35); border-radius: 18px;"><div style="font-size: 44px; margin-bottom: 8px;">⚠️</div><div style="font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 10px;">Не вдалося завантажити збори</div><div style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.5; margin-bottom: 14px;">Перевірте інтернет і спробуйте ще раз:</div><button onclick="loadVolunteersData({forceRefresh:true})" style="width:100%; padding: 12px; margin-bottom: 14px; background: linear-gradient(135deg, #38bdf8, #2a5298); color: #fff; border: none; border-radius: 12px; font-weight: 800; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(56,189,248,0.3);">🔄 Спробувати ще раз</button><div style="padding: 12px; background: rgba(0,0,0,0.25); border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; font-size: 11px; color: rgba(255,255,255,0.75); line-height: 1.5;">🤝 Маєте офіційний збір? Напишіть: <a href="https://t.me/vilnohirsk" target="_blank" rel="noopener" style="color: var(--time-green); text-decoration: none; font-weight: 800;">@vilnohirsk</a></div><div style="margin-top: 14px; font-size: 13px; font-weight: 800; color: #ffcc00;">Слава Україні! 🇺🇦</div></div>`;
  }
}

// === Стан сортування для ДЦЗ-секції ===
let dczSortMode = 'date'; // 'date' (спочатку нові) | 'date_asc' (спочатку старі) | 'salary_asc' | 'salary_desc'
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
  const d = document.getElementById('dcz-list');
  if (d) d.innerHTML = renderDczListContent();
}

function renderDczListContent() {
  let filtered = allDczJobs.slice();
  if (dczSortMode === 'salary_asc')  filtered.sort((a, b) => parseSalaryNum(a.salary) - parseSalaryNum(b.salary));
  if (dczSortMode === 'salary_desc') filtered.sort((a, b) => parseSalaryNum(b.salary) - parseSalaryNum(a.salary));
  // Вакансії без розпізнаної дати parseDczDate віддає як 0. При сортуванні
  // від нових вони й так опиняються в кінці, а от від старих 0 виштовхнув би
  // їх на самий верх, ніби вони найдавніші. Тому тримаємо їх у кінці завжди.
  if (dczSortMode === 'date')        filtered.sort((a, b) => parseDczDate(b.date) - parseDczDate(a.date));
  if (dczSortMode === 'date_asc')    filtered.sort((a, b) => {
    const da = parseDczDate(a.date), db = parseDczDate(b.date);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });

  let cards = '';
  filtered.forEach((job, i) => { cards += createJobCardHtml(job, i, 'd'); });

  const subtitle = '<div style="font-size: 10px; color: rgba(255,255,255,0.5); padding: 10px 4px 6px; line-height: 1.4;">Офіційні вакансії з державного центру зайнятості Вільногірська</div>';

  const sortBar = `<div class="flea-categories-wrapper" style="padding: 2px 4px 8px;">
    <div class="flea-category-tag${dczSortMode === 'date' ? ' active' : ''}" onclick="setDczSort('date', event)">📅 Спочатку нові</div>
    <div class="flea-category-tag${dczSortMode === 'date_asc' ? ' active' : ''}" onclick="setDczSort('date_asc', event)">📅 Спочатку старі</div>
    <div class="flea-category-tag${dczSortMode === 'salary_asc' ? ' active' : ''}" onclick="setDczSort('salary_asc', event)">💵 Зарплата ↑</div>
    <div class="flea-category-tag${dczSortMode === 'salary_desc' ? ' active' : ''}" onclick="setDczSort('salary_desc', event)">💵 Зарплата ↓</div>
  </div>`;

  const grid = filtered.length > 0
    ? `<div class="shops-tile-grid" style="padding-bottom:10px;">${cards}</div>`
    : '<div class="empty-msg" style="padding: 20px;">Немає вакансій</div>';

  return subtitle + sortBar + grid;
}

// === Джерело вакансії ===
// Раніше ці дві перевірки жили всередині renderJobs і потрібні були тільки
// щоб розкласти вакансії по групах. Тепер підпис стоїть на кожній картці —
// групи більше не згортаються, і поки прокручуєш сорок вакансій поспіль,
// заголовок групи давно поїхав угору.
function isWorkUaJob(j) {
  const s = (((j && j.source) || '') + ' ' + ((j && j.date) || '')).toLowerCase().replace(/[\s._-]/g, '');
  return s.includes('workua');
}
// Джерело ДЦЗ визначаємо терпимо: зайвий пробіл чи інший регістр раніше
// мовчки перекидав державні вакансії у «Від місцевих підприємців».
function isDczJob(j) {
  return String((j && j.source) || '').toLowerCase().replace(/[\s._-]/g, '').includes('дцз');
}
const JOB_SOURCES = {
  dcz:    { icon: '\u{1F3DB}\uFE0F', badge: 'Центр зайнятості',      head: 'Державний центр зайнятості' },
  workua: { icon: '\u{1F310}',        badge: 'Work.ua',               head: 'Вакансії з Work.ua' },
  local:  { icon: '\u{1F465}',        badge: 'Від місцевих',          head: 'Від місцевих підприємців' },
};
function jobSourceKey(job) {
  if (isDczJob(job)) return 'dcz';
  if (isWorkUaJob(job)) return 'workua';
  return 'local';
}
function jobSourceBadgeHtml(job) {
  const key = jobSourceKey(job), src = JOB_SOURCES[key];
  return `<div class="job-src job-src-${key}"><span aria-hidden="true">${src.icon}</span>${escapeHTML(src.badge)}</div>`;
}
function jobsGroupHeadHtml(key, count) {
  const src = JOB_SOURCES[key];
  return `<div class="jobs-head jobs-head-${key}"><span class="jobs-head-name">`
       + `<span aria-hidden="true">${src.icon}</span>${escapeHTML(src.head)}</span>`
       + `<span class="jobs-head-count">${count}</span></div>`;
}

function createJobCardHtml(job, index, prefix) {
  // У href пускаємо лише http(s)/tel — інше замінюємо на «пустишку»
  const rawJobUrl = String(job.url || '');
  const jobUrl = /^(https?:\/\/|tel:)/i.test(rawJobUrl) ? rawJobUrl : '#';
  const isTel = jobUrl.startsWith('tel:');
  let displayPhone = job.phone ? String(job.phone) : '';
  if (displayPhone) { let cleanPhone = displayPhone.replace(/\D/g, ''); if (cleanPhone.length >= 10) displayPhone = '0' + cleanPhone.slice(-9); else if (cleanPhone.length === 9) displayPhone = '0' + cleanPhone; }
  const btnText = isTel && displayPhone ? displayPhone : (isTel ? 'Зателефонувати' : 'Відгукнутися 🔗');
  const targetAttr = isTel ? '_self' : '_blank';
  let displaySalary = job.salary != null ? String(job.salary) : ''; if (displaySalary && displaySalary !== '-' && /^\d+$/.test(displaySalary.trim())) { displaySalary = displaySalary.trim() + ' грн'; }

  const isVip = job.isVip || job.vip;
  const vipBadge = isVip ? '<div class="vip-badge" style="background: linear-gradient(135deg, #ffcc00, #ff8800); color: #000;">VIP</div>' : '';
  const employment = job.employment || 'Не вказано';
  const safeDesc = job.description ? nl2br(job.description) : 'Без опису';
  const id = `job-detail-${prefix}-${index}`;

  const callBtnHtml = `<a href="${escapeHTML(jobUrl)}" target="${targetAttr}" style="display: block; width: 100%; box-sizing: border-box; text-align: center; padding: 12px; border-radius: 10px; background: linear-gradient(135deg, #007aff, #005bb5); color: #fff; font-weight: 800; font-size: 13px; text-decoration: none; margin-top: 5px; box-shadow: 0 4px 10px rgba(0, 122, 255, 0.3);" onclick="event.stopPropagation();">${escapeHTML(btnText)}</a>`;

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
      ${jobSourceBadgeHtml(job)}
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

// Вакансії військового призначення на сайті не показуємо.
// Фільтр винесено з renderJobs, щоб бейдж на вкладці рахував рівно те,
// що людина побачить: раніше він рахував список ДО фільтра й завищував число.
const JOB_STOP_WORDS = ['зсу', 'батальйон', 'бригада', 'військов', 'взвод', 'міномет', 'штурмов', 'розвідувальн', 'десантн', 'тцк', 'сил оборони', 'військкомат', 'навідник', 'кулеметник', 'гранатометник', 'зенітн', 'артилері', 'морськ', 'піхот', 'снайпер', 'сапер', 'командир відділення', 'бойов', 'дшв'];
function filterSafeJobs(jobs) {
  if (!Array.isArray(jobs)) return [];
  return jobs.filter(job => {
    if (!job) return false;
    const text = ((job.title || '') + ' ' + (job.company || '') + ' ' + (job.description || '')).toLowerCase();
    return !JOB_STOP_WORDS.some(word => text.includes(word));
  });
}

function renderJobs(jobs) {
  const container = document.getElementById('jobs-list-content'); if (!container) return;
  if (!jobs || jobs.length === 0) { container.innerHTML = '<div class="empty-msg">Актуальних вакансій немає</div>'; return; }

  const safeJobs = filterSafeJobs(jobs); // ідемпотентно: список уже відфільтрований
  if (!safeJobs.length) { container.innerHTML = '<div class="empty-msg">Актуальних вакансій немає</div>'; return; }
  
  // Розкладка по групах: визначення джерела тепер спільне з підписом на картці
  const vipJobs = safeJobs.filter(j => j.isVip || j.vip).reverse();
  const plain = safeJobs.filter(j => !j.isVip && !j.vip);
  const dczJobs = plain.filter(j => jobSourceKey(j) === 'dcz');
  const internetJobs = plain.filter(j => jobSourceKey(j) === 'workua');
  const regularJobs = plain.filter(j => jobSourceKey(j) === 'local');
  
  let html = '';
  if (vipJobs.length > 0) {
      html += '<div style="font-size:11px; color:var(--highlight-color); text-transform:uppercase; font-weight:800; margin-bottom:10px; text-align:left; padding-left:5px; letter-spacing: 0.5px;">🌟 VIP Вакансії</div>';
      html += '<div class="shops-tile-grid" style="margin-bottom: 15px;">';
      vipJobs.forEach((job, i) => { html += createJobCardHtml(job, i, 'v'); });
      html += '</div>';
  }

  if (dczJobs.length > 0) {
      allDczJobs = dczJobs;
      html += `<div class="jobs-group">
        ${jobsGroupHeadHtml('dcz', dczJobs.length)}
        <div id="dcz-list">${renderDczListContent()}</div>
      </div>`;
  }

  if (internetJobs.length > 0) {
      let cards = '';
      internetJobs.forEach((job, i) => { cards += createJobCardHtml(job, i, 'i'); });
      html += `<div class="jobs-group">
        ${jobsGroupHeadHtml('workua', internetJobs.length)}
        <div class="shops-tile-grid" style="padding-bottom:10px; padding-top:10px;">${cards}</div>
      </div>`;
  }
  if (regularJobs.length > 0) {
      let cards = '';
      getStableShuffled(regularJobs, 'jobs').forEach((job, i) => { cards += createJobCardHtml(job, i, 'r'); });
      html += `<div class="jobs-group">
        ${jobsGroupHeadHtml('local', regularJobs.length)}
        <div class="jobs-note">Оголошення, які додали місцеві підприємці та роботодавці</div>
        <div class="shops-tile-grid" style="padding-bottom:10px;">${cards}</div>
      </div>`;
  }
  container.innerHTML = html;
}

// Бейдж, позначки «Нове» і сам список — усе від одного відфільтрованого набору
function publishJobs(allJobs) {
  const visible = filterSafeJobs(allJobs);
  markNewItems(visible, 'jobs');
  checkNotification('jobs', visible);
  updateJobsTabBadge(visible.length);
  if (dataChanged('render_jobs', visible)) renderJobs(visible);
}

async function loadJobsData() {
  if (!papaReady('jobs', loadJobsData, () => showSectionFailure('jobs-list-content', 'loadJobsData', 'jobs'))) return;
  let allJobs = [];
  try { const parsedJobs = await fetchCachedJson('https://vilnohirsk-jobs-api-production.up.railway.app/api/jobs', 'jobs_api', 1); if (Array.isArray(parsedJobs)) { allJobs = allJobs.concat(parsedJobs); } } catch(e) { logSectionError('вакансії (сервер)', e); }
  const SHEET_GID = '1809375718'; const csvUrl = `https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
  try {
    const csvText = await fetchCachedText(csvUrl, 'jobs_csv', 3);
    Papa.parse(csvText, {
      // Аркуш вакансій вивантажується БЕЗ рядка заголовків: перший рядок — уже дані.
      // З header:true PapaParse «з'їдав» першу вакансію як заголовки, а коли в
      // таблиці лишалась одна — розділ «Від місцевих підприємців» ставав порожнім.
      header: false, skipEmptyLines: true,
      complete: function(results) {
        // Позиційні колонки аркуша: [0] дата, [1] статус, [2] посада, [3] зарплата,
        // [4] компанія, [5] опис, [6] телефон, [7] стать, [8] зайнятість, [9] VIP
        const cell = (r, i) => String(r && r[i] != null ? r[i] : '').trim();
        const userJobs = results.data
          .filter(r => Array.isArray(r) && cell(r, 1).toLowerCase() === 'одобрено')
          .map(r => {
            const phone = cell(r, 6);
            return { title: cell(r, 2) || 'Без назви', salary: cell(r, 3) || '-', company: cell(r, 4) || 'Не вказано', description: cell(r, 5), date: cell(r, 0) ? cell(r, 0).split(' ')[0] : 'Нещодавно', phone: phone, gender: cell(r, 7), employment: cell(r, 8), url: phone ? `tel:${phone.replace(/[^0-9+]/g, '')}` : '#', isVip: isVipFlag(cell(r, 9)), source: 'User' };
          });
        allJobs = allJobs.concat(userJobs);
        publishJobs(allJobs);
      }
    });
  } catch (e) {
    logSectionError('вакансії (таблиця)', e);
    // Якщо мовчать обидва джерела — це збій зв'язку, а не «вакансій немає».
    // Писати «Актуальних вакансій немає» у такому разі означало б збрехати.
    if (!allJobs.length) { invalidateRender('render_jobs'); showSectionFailure('jobs-list-content', 'loadJobsData', 'jobs'); return; }
    publishJobs(allJobs);
  }
}

async function showDailyVolunteerAlert() {
    // Доба рахується за Києвом, як і весь інший час на сайті
    const today = getKyivNow().toDateString(); const lastSeen = localStorage.getItem('last_zsu_alert_date'); if (lastSeen === today) return;
    try {
        if (typeof jsyaml === 'undefined') return; // парсер ще вантажиться — покажемо наступного разу
        const res = await fetch('./data/zsu.yaml?v=' + Date.now());
        if (!res.ok) return;
        const data = jsyaml.load(await res.text()) || {};
        const itemsArray = Array.isArray(data.volunteers) ? data.volunteers : [];
        const activeItems = itemsArray.filter(item => item && item.active !== false && String(item.title || '').trim() !== '');
        if (activeItems && activeItems.length > 0) {
            const cardsHtml = activeItems.map((item, idx) => {
                const title = item.title || 'ЗБІР НА ЗСУ';
                const desc = item.description ? nl2br(item.description) : '';
                const jarUrl = /^https?:\/\//i.test(String(item.jar_url || '').trim()) ? String(item.jar_url).trim() : '';
                const collected = item.collected ? parseInt(item.collected.toString().replace(/\D/g, ''), 10) : 0;
                const goal = item.goal ? parseInt(item.goal.toString().replace(/\D/g, ''), 10) : 0;
                let progressHtml = '';
                if (goal > 0) {
                    const percent = Math.min(Math.round((collected / goal) * 100), 100);
                    progressHtml = `<div style="width: 100%; margin-top: 10px; margin-bottom: 10px;"><div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 5px;"><span style="color: #00ff9c;">Зібрано: ${collected.toLocaleString('uk-UA')} ₴</span><span style="color: rgba(255,255,255,0.5);">Ціль: ${goal.toLocaleString('uk-UA')} ₴</span></div><div style="width: 100%; height: 7px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);"><div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #ffcc00); border-radius: 10px; transition: width 1s ease-in-out;"></div></div></div>`;
                }
                let btnHtml = '';
                if (jarUrl) { btnHtml = `<a href="${escapeHTML(jarUrl)}" target="_blank" rel="noopener" style="display: block; width: 100%; box-sizing: border-box; background: #fff; color: #000; text-align: center; padding: 12px; border-radius: 12px; font-weight: 900; text-decoration: none; font-size: 15px; margin-top: 8px; box-shadow: 0 4px 15px rgba(255,255,255,0.2);">💸 Підтримати банку</a>`; }
                const descHtml = desc ? `<div style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.5; text-align: left; margin-top: 8px; max-height: 120px; overflow-y: auto; padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">${desc}</div>` : '';
                return `<div style="margin-bottom: 14px; padding: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;"><div style="display:flex; align-items:flex-start; gap:8px;"><span style="flex:0 0 auto; min-width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#38bdf8,#2a5298); color:#fff; font-size:11px; font-weight:900; border-radius:8px; margin-top:2px;">${idx + 1}</span><h3 style="margin: 0; font-size: 15px; font-weight: 800; text-align: left; color: #fff; line-height: 1.3; flex:1;">${escapeHTML(title)}</h3></div>${descHtml}${progressHtml}${btnHtml}</div>`;
            }).join('');

            const n = activeItems.length;
            const headerWord = n === 1 ? 'АКТИВНИЙ ЗБІР' : (n >= 2 && n <= 4 ? `АКТИВНІ ЗБОРИ · ${n}` : `АКТИВНИХ ЗБОРІВ · ${n}`);
            const modalContent = document.getElementById('daily-zsu-content');
            modalContent.innerHTML = `<div style="text-align: center; font-size: 38px; margin-bottom: 4px;">🇺🇦</div><div style="text-align:center; font-size: 13px; font-weight: 900; letter-spacing: 0.5px; color: #ffcc00; text-transform: uppercase; margin-bottom: 14px;">${headerWord}</div><div style="max-height: 60vh; overflow-y: auto; padding-right: 2px;">${cardsHtml}</div><button onclick="closeModalForm(null, 'daily-zsu-modal')" style="width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.8); padding: 12px; border-radius: 14px; font-weight: 700; margin-top: 6px; font-size: 14px; cursor: pointer; transition: 0.2s;">Повернутися до сайту</button>`;
            document.getElementById('daily-zsu-modal').classList.add('active'); document.body.style.overflow = 'hidden'; localStorage.setItem('last_zsu_alert_date', today);
        }
    } catch (e) { console.error("Failed to load daily ZSU alert", e); }
}

// === ТЕХПІДТРИМКА: звернення → Apps Script (Support.gs) → адміністраторам у Telegram (@Vilnogirsk_bot) ===
// Контакт обов'язковий: Telegram-нік або телефон — так само перевіряє й сервер.
const SUPPORT_TOPIC_LABEL = { bug: '🐞 Помилка', question: '❓ Питання', idea: '💡 Ідея', place: '🏪 Додати заклад', ads: '📢 Реклама', other: '💬 Інше' };
const SUPPORT_HINT = 'Сюди ми вам і відповімо';
// «@nick», «t.me/nick», «nick» → «@nick»; «097…», «+380…», «380…» → «+380…»; інше — null
function supportContactParse(raw) {
  const s = String(raw == null ? '' : raw).trim().slice(0, 64).replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, '@');
  if (/^\+?[\d\s()\-]+$/.test(s)) {
    let d = s.replace(/\D/g, '');
    if (d.length === 10 && d.charAt(0) === '0') d = '38' + d;
    if (d.length === 9) d = '380' + d;
    return /^380\d{9}$/.test(d) || (d.length >= 10 && d.length <= 15 && d.indexOf('380') !== 0) ? '+' + d : null;
  }
  const nick = s.replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(nick) ? '@' + nick : null;
}
// «iPhone · Safari · застосунок» — щоб адміністратор розумів, де шукати помилку
function supportDevice() {
  const ua = navigator.userAgent || '';
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'інший пристрій';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'браузер';
  return os + ' · ' + br + (typeof isPWA === 'function' && isPWA() ? ' · застосунок' : '');
}
function supportFieldError(el, msg) {
  el.classList.add('sup-bad'); el.focus();
  const hint = document.getElementById('sup-contact-hint');
  if (el.id === 'beta-feedback-contact' && hint) { hint.textContent = msg; hint.classList.add('sup-hint-bad'); }
  else showToast(msg, 'error');
}
document.addEventListener('input', (e) => {
  const id = e.target && e.target.id;
  if (id !== 'beta-feedback-contact' && id !== 'beta-feedback-text') return;
  e.target.classList.remove('sup-bad');
  const hint = document.getElementById('sup-contact-hint');
  if (id === 'beta-feedback-contact' && hint && hint.classList.contains('sup-hint-bad')) { hint.textContent = SUPPORT_HINT; hint.classList.remove('sup-hint-bad'); }
});
async function submitSupport(event) {
  event.preventDefault();
  const form = event.target;
  const textEl = document.getElementById('beta-feedback-text'), contactEl = document.getElementById('beta-feedback-contact');
  const text = textEl.value.trim(), contact = supportContactParse(contactEl.value);
  if (text.length < 3) { supportFieldError(textEl, 'Напишіть кілька слів — що сталося чи що хочете запропонувати'); return; }
  if (!contact) { supportFieldError(contactEl, 'Вкажіть Telegram-нік (напр. @ivan) або номер телефону (напр. +380971234567)'); return; }
  if (!validateCaptcha('custom-feedback-form')) return;
  const topicEl = form.querySelector('input[name="topic"]:checked'), topic = topicEl ? topicEl.value : 'other';
  const btn = document.getElementById('feedback-submit-btn'), label = btn.textContent;
  btn.textContent = 'Надсилаємо…'; btn.disabled = true;
  try {
    const payload = { formType: 'support', text: text, contact: contact, topic: topic, device: supportDevice() };
    const tok = await cabAdsToken(); if (tok) payload.idToken = tok;
    let d = null;
    try { d = await cabScript(payload); } catch (e) { d = null; }
    if (d && d.status === 'limit') { showToast('⏳ Забагато повідомлень поспіль — спробуйте за 10 хвилин', 'error'); return; }
    if (d && d.status === 'error') { showToast('❌ ' + (d.message || 'Не вдалося надіслати'), 'error'); return; }
    if (!d || d.status !== 'ok') {
      // Apps Script ще без техпідтримки — запасний шлях: у таблицю «Відгуки», як раніше, щоб повідомлення не загубилось
      await fetch(APP_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ formType: 'feedback', text: `[${SUPPORT_TOPIC_LABEL[topic] || SUPPORT_TOPIC_LABEL.other}] ${text}\n\n---Контакт для зв'язку---\n${contact}` }) });
    }
    try { localStorage.setItem('support_contact', contact); } catch (e) {}
    showToast('✅ Надіслано! Відповімо вам у Telegram або за телефоном', 'success');
    textEl.value = ''; form.querySelectorAll('input[name="topic"]').forEach(i => { i.checked = false; });
    closeModalForm(null, 'feedback-modal'); setupCaptcha('custom-feedback-form');
  } catch (e) {
    showToast('❌ Не вдалося надіслати — перевірте інтернет і спробуйте ще раз', 'error');
  } finally { btn.textContent = label; btn.disabled = false; }
}

// Ховаємо мигаючу стрілку-підказку «❯», коли вкладки догорнуті до кінця
// або горизонтальна прокрутка взагалі не потрібна (десктоп)
function setupScrollHints() {
  [['schedule-tabs', 'hint-schedule'], ['market-tabs', 'hint-market']].forEach(([navId, hintId]) => {
    const nav = document.getElementById(navId); const hint = document.getElementById(hintId);
    if (!nav || !hint) return;
    const update = () => hint.classList.toggle('hidden', nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 5);
    nav.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });
}

// === УМНОЕ АВТООБНОВЛЕНИЕ: разнесли по группам, чтобы не грузить всё разом ===
// Группа A (часто, важное): транспорт, алерты, акции, валюта, бегущая строка,
// погода и цены на топливо (раньше они грузились один раз и висели устаревшими)
function refreshGroupA() {
    if (!isPageVisible) return;
    loadTrainsData();
    loadDelaysData();
    loadSvitloData();
    loadAlerts();
    loadPromosData();
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
    loadGarbageData();
    loadEventsData();
    loadLongTrainsData();
    loadBlaBlaCarData();
    // Раніше ці два розділи вантажились лише при старті й лишались
    // застарілими до перезавантаження сторінки
    loadBusesData();
    loadGalleryData();
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
  { id: 'communal',    icon: '⚡', name: 'Комунальні новини', desc: 'Вода, газ, тепло',   group: 'Важливе', defaultOn: true },
  { id: 'svitlo',      icon: '💡', name: 'Графік світла',     desc: 'Новий графік і зміни', group: 'Важливе', defaultOn: true },
  { id: 'smittya',     icon: '🗑️', name: 'Вивіз сміття',      desc: 'Зміни графіка',      group: 'Важливе', defaultOn: true },
  { id: 'news',        icon: '📰', name: 'Новини міста',      desc: 'Міські новини',     group: 'Важливе', defaultOn: true },
  { id: 'volunteers',  icon: '🇺🇦', name: 'Допомога ЗСУ',     desc: 'Нові збори',         group: 'Важливе', defaultOn: true },
  { id: 'phoenix',     icon: '🚒', name: 'Фенікс (зниклі)',   desc: 'Пошук людей',        group: 'Важливе', defaultOn: true },
  // ПОДІЇ
  { id: 'events',      icon: '🎉', name: 'Афіші',             desc: 'Концерти, заходи',   group: 'Події та акції', defaultOn: false },
  { id: 'gallery',     icon: '📸', name: 'Фото міста',        desc: 'Нові фото',          group: 'Події та акції', defaultOn: false },
  { id: 'promos',      icon: '🔥', name: 'Акції магазинів',   desc: 'Знижки та акції',    group: 'Події та акції', defaultOn: false },
  // ТРАНСПОРТ
  { id: 'trains',      icon: '🚆', name: 'Електрички',        desc: 'Зміни розкладу',     group: 'Транспорт', defaultOn: false },
  { id: 'train_delays', icon: '⏱️', name: 'Затримки електричок', desc: 'Коли електричка запізнюється', group: 'Транспорт', defaultOn: false },
  { id: 'buses',       icon: '🚌', name: 'Автобуси',          desc: 'Зміни розкладу',     group: 'Транспорт', defaultOn: false },
  { id: 'long_trains', icon: '🛤️', name: 'Потяги (далекі)',  desc: 'Зміни розкладу',     group: 'Транспорт', defaultOn: false },
  { id: 'blablacar',   icon: '🚗', name: 'Попутки',           desc: 'Нові поїздки',       group: 'Транспорт', defaultOn: false },
  { id: 'fuel',        icon: '⛽', name: 'Ціни на пальне',    desc: 'Коли змінюються ціни', group: 'Транспорт', defaultOn: false },
  // ОГОЛОШЕННЯ
  { id: 'estate',      icon: '🏠', name: 'Нерухомість',       desc: 'Нові оголошення',    group: 'Оголошення', defaultOn: false },
  { id: 'shopping',    icon: '🛍', name: 'Шопінг',            desc: 'Нові магазини',      group: 'Оголошення', defaultOn: false },
  { id: 'flea',        icon: '📦', name: 'Барахолка',         desc: 'Нові оголошення',    group: 'Оголошення', defaultOn: false },
  { id: 'jobs',        icon: '💼', name: 'Вакансії',          desc: 'Нові вакансії',      group: 'Оголошення', defaultOn: false },
  { id: 'lost',        icon: '🔍', name: 'Знахідки',          desc: 'Бюро знахідок',      group: 'Оголошення', defaultOn: false }
];

// Нові теми для тих, хто підписався раніше. «Графік світла» й «Вивіз сміття» раніше входили в
// «Комунальні новини» — хто їх обрав, отримує й нові теми (вимкнути можна в «Сповіщеннях»).
// Решта нових тем — лише за бажанням. Робиться один раз на пристрої.
const PUSH_TOPICS_VERSION = '2';
async function migratePushTopics() {
  try {
    if (localStorage.getItem('push_topics_v') === PUSH_TOPICS_VERSION) return;
    const token = localStorage.getItem('push_token');
    if (localStorage.getItem('push_subscribed') !== '1' || !token) { localStorage.setItem('push_topics_v', PUSH_TOPICS_VERSION); return; }
    const cats = getCurrentCategories();
    const add = cats.includes('communal') ? ['svitlo', 'smittya'].filter(c => !cats.includes(c)) : [];
    if (add.length) {
      const next = cats.concat(add);
      if (!(await updateCategoriesOnServer(token, next))) return; // немає зв'язку — спробуємо наступного разу
      localStorage.setItem('push_categories', JSON.stringify(next));
      updatePushButtonState();
    }
    localStorage.setItem('push_topics_v', PUSH_TOPICS_VERSION);
  } catch (e) {}
}

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

  // Прапорець ставимо ДО messaging(): у браузері без Push API той кидає виняток,
  // і при старому порядку застосунок Firebase уже був створений, а прапорець ні —
  // наступний виклик падав з «Firebase App named '[DEFAULT]' already exists».
  if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  firebaseInitialized = true;
  try { firebaseMessaging = firebase.messaging(); } catch (e) { firebaseMessaging = null; logSectionError('сповіщення', e); }
  return firebaseMessaging;
}

// Регистрация Service Worker (единый /sw.js: PWA + Firebase push).
// Повторная регистрация идемпотентна. Старые регистрации firebase-messaging-sw.js
// живут на том же scope '/', поэтому браузер сам обновит их на /sw.js,
// а push-подписка при этом сохраняется (она привязана к scope, не к файлу).
async function registerFirebaseSW() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker не підтримується');
  }
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return registration;
}

// Обрана черга світла — і на сервер (колонка H у Push_Tokens): сповіщення про графік приходять лише про неї.
// Надсилаємо, коли чергу змінили, і про всяк випадок раз на тиждень (запит no-cors — відповіді не видно)
const PUSH_QUEUE_KEY = 'push_queue_sent';
let pushQueueTimer = null;
function pushQueueMark() { try { localStorage.setItem(PUSH_QUEUE_KEY, JSON.stringify({ q: getSvitloChoice(), t: Date.now() })); } catch (e) {} }
function pushQueueSync() {
  clearTimeout(pushQueueTimer);
  pushQueueTimer = setTimeout(async () => {
    const token = localStorage.getItem('push_token');
    if (localStorage.getItem('push_subscribed') !== '1' || !token) return;
    let last = null; try { last = JSON.parse(localStorage.getItem(PUSH_QUEUE_KEY) || 'null'); } catch (e) {}
    if (last && last.q === getSvitloChoice() && Date.now() - (last.t || 0) < 7 * 864e5) return;
    if (await updateCategoriesOnServer(token, getCurrentCategories())) pushQueueMark();
  }, 1500); // кілька тапів по чергах поспіль — один запит
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
        categories: categories,
        svitloQueue: getSvitloChoice() // '' — черга не обрана: про світло приходить загальне сповіщення
      })
    });
    pushQueueMark();
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
        categories: categories,
        svitloQueue: getSvitloChoice()
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
    if (!firebaseMessaging) {
      showToast('❌ Ваш браузер не підтримує сповіщення', 'error');
      return false;
    }
    
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
    localStorage.setItem('push_topics_v', PUSH_TOPICS_VERSION); // теми вже нові
    
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
// Просимо сервер прибрати токен зі списку розсилки (щоб у таблиці не копились мертві)
async function notifyServerUnsubscribe(token) {
  try {
    await fetch(APP_SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ formType: 'push_unsubscribe', token: token })
    });
  } catch (e) { logSectionError('сповіщення', e); }
}

async function unsubscribeFromPush() {
  const token = localStorage.getItem('push_token');
  // Firebase піднімається ліниво, лише під час підписки. Після перезавантаження
  // сторінки messaging знову null — і стара відписка нічого не робила: токен
  // лишався живим, людина бачила «відписано», а сповіщення далі приходили.
  if (token) {
    try {
      await initFirebase();
      if (firebaseMessaging) await firebaseMessaging.deleteToken();
    } catch (err) { logSectionError('сповіщення', err); }
    await notifyServerUnsubscribe(token);
  }
  try {
    localStorage.removeItem('push_subscribed');
    localStorage.removeItem('push_token');
    localStorage.removeItem('push_categories');
  } catch (e) {}
  showToast('🔕 Ви відписалися від сповіщень', 'info');
  updatePushButtonState();
}

// Обновляем текст кнопки в зависимости от статуса
function updatePushButtonState() {
  const btn = document.getElementById('push-subscribe-btn');
  if (!btn) return;

  const bellIco = '<div class="connect-btn-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg></div>';

  const isSubscribed = localStorage.getItem('push_subscribed') === '1';
  const permission = ('Notification' in window) ? Notification.permission : 'default';

  if (isSubscribed && permission === 'granted') {
    const cats = getCurrentCategories();
    btn.innerHTML = `${bellIco}<div class="connect-btn-txt"><span class="connect-btn-title">Підписано: ${cats.length} категорій</span><span class="connect-btn-sub">Натисніть щоб налаштувати</span></div>`;
    btn.style.borderColor = 'rgba(0, 255, 156, 0.5)';
    btn.style.background = 'rgba(0, 255, 156, 0.1)';
  } else if (permission === 'denied') {
    btn.innerHTML = `${bellIco}<div class="connect-btn-txt"><span class="connect-btn-title">Сповіщення заблоковано</span><span class="connect-btn-sub">Дозвольте у налаштуваннях браузера</span></div>`;
    btn.style.borderColor = 'rgba(255, 77, 77, 0.4)';
    btn.style.background = 'rgba(255, 77, 77, 0.05)';
  } else {
    btn.innerHTML = `${bellIco}<div class="connect-btn-txt"><span class="connect-btn-title">Важливі сповіщення</span><span class="connect-btn-sub">Світло, ЗСУ, новини міста</span></div>`;
    btn.style.borderColor = 'rgba(255, 204, 0, 0.4)';
    btn.style.background = 'rgba(255, 204, 0, 0.06)';
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
  initTileHome();
  // Стара головна (дата й час, погода, курси валют, ціни на пальне) у новому дизайні схована — їх не вантажимо
  loadAlerts(); loadDelaysData(); loadSvitloData();
  setTimeout(() => { loadTrainsData(); loadLongTrainsData(); loadBusesData(); loadEventsData(); loadTickerData(); }, 100);
  setTimeout(() => { 
      loadPromosData(); loadShopsData(); loadFleaMarketData(); loadEstateData(); loadLostFoundData(); loadBlaBlaCarData(); loadJobsData(); loadPhonebookData(); loadGarbageData(); loadGalleryData(); loadVolunteersData(); loadPhoenixData();
      setTimeout(showDailyVolunteerAlert, 1500); 
  }, 600);
  
  // Разнесённые интервалы автообновления вместо одного большого
  setInterval(refreshGroupA, 2 * 60 * 1000);  // каждые 2 минуты — важное
  setInterval(refreshGroupB, 5 * 60 * 1000);  // каждые 5 минут — основное
  setInterval(refreshGroupC, 8 * 60 * 1000);  // каждые 8 минут — редкое
  setInterval(svitloTick, 30 * 1000);          // світло своєї черги: «через …» без нового завантаження
  setInterval(() => { if (!document.hidden) renderTrainsTile(); }, 30 * 1000); // плитка «Електрички»: «через … хв»
  
  // Слежение за видимостью страницы — не обновляем фоновую вкладку
  document.addEventListener('visibilitychange', () => {
      isPageVisible = !document.hidden;
      // Если пользователь вернулся на вкладку после долгого отсутствия — обновляем сразу
      if (isPageVisible) {
          svitloTick(); // відлік на смузі світла — одразу, ще до нового завантаження графіка
          refreshGroupA();
      }
  });
  
  document.querySelectorAll('.form-input').forEach(input => { input.addEventListener('focus', function() { setTimeout(() => { this.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300); }); });

  setupScrollHints();

  // === PUSH-УВЕДОМЛЕНИЯ: инициализация состояния кнопки ===
  setTimeout(() => {
    updatePushButtonState();
    migratePushTopics();
    pushQueueSync(); // черга світла — на сервер (уже підписаним; далі — раз на тиждень і при зміні черги)
    // Регистрируем единый Service Worker для всех: даёт PWA активный SW
    // и мигрирует старые регистрации firebase-messaging-sw.js на /sw.js
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, 1000);
};

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }

// === Service Worker: единый /sw.js (PWA-заглушка + Firebase push). ===
// Регистрируется для всех при старте; firebase-messaging-sw.js оставлен
// тонкой обёрткой (importScripts('/sw.js')) для старых регистраций.


// =========================================================================
// === ДОСТУПНІСТЬ ===
// Більшість клікабельних елементів сайту — це <div> і <span> з onclick.
// Мишею й пальцем вони працюють, але скрінрідер не знає, що це кнопка,
// а з клавіатури до них узагалі не дістатись. Проставляємо роль і фокус
// автоматично: і для розмітки з index.html, і для карток, які будує JS.
// Вигляд не змінюється — обведення фокуса браузер малює лише тим,
// хто ходить сайтом з клавіатури.
// =========================================================================
const A11Y_NATIVE = { BUTTON: 1, A: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1 };
function markClickableElements(root) {
  let nodes;
  try { nodes = (root || document).querySelectorAll('[onclick]:not([data-a11y])'); } catch (e) { return; }
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    el.setAttribute('data-a11y', '1'); // щоб не проходити той самий елемент двічі
    if (A11Y_NATIVE[el.tagName]) continue; // у кнопок і посилань усе це вже є
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  }
}

// Enter і Пробіл на такому елементі = звичайний клік
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const el = document.activeElement;
  if (!el || el.getAttribute('role') !== 'button' || A11Y_NATIVE[el.tagName]) return;
  e.preventDefault();
  el.click();
});

// Картки розділів з'являються вже після завантаження, тому стежимо за DOM.
// Обхід відкладаємо на 400 мс, щоб не бігати по дереву на кожну дрібну зміну.
let a11yTimer = null;
function scheduleA11ySweep() {
  if (a11yTimer) return;
  a11yTimer = setTimeout(function () { a11yTimer = null; markClickableElements(); }, 400);
}
if (typeof MutationObserver !== 'undefined') {
  // Годинник щосекунди замінює текстовий вузол — це теж зміна списку дітей.
  // Реагуємо лише коли додано справжній елемент, інакше обхід крутився щосекунди даремно.
  new MutationObserver(function (muts) {
    for (let i = 0; i < muts.length; i++) {
      const added = muts[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        if (added[j].nodeType === 1) { scheduleA11ySweep(); return; }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
markClickableElements();
