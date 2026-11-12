/* Barbara Bridals - public site. Catalogue, testimonials and bookings come from Netlify Functions (/api/*). */
const WA_NUMBER = '256772526919';
const CACHE_KEY = 'bb_catalog_cache_v3';
const state = { products: [], reviews: [], filter: 'All', q: '', sort: 'featured', onlyAvailable: false };

const $ = (s, r = document) => r.querySelector(s);
const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const waLink = text => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
const imgUrl = id => `/api/images/${encodeURIComponent(id)}`;
const money = p => p === '' || p == null ? 'Price on request' : `UGX ${Number(p).toLocaleString()}`;
const statusClass = s => String(s || 'Available').toLowerCase();

/* ---------- Data loading (cached copy paints instantly, fresh data replaces it) ---------- */
async function api(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(path + ' ' + res.status);
  return res.json();
}
function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } }
function writeCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ products: state.products, reviews: state.reviews })); } catch {} }

async function load() {
  const cached = readCache();
  if (cached) { state.products = cached.products || []; state.reviews = cached.reviews || []; renderAll(); }
  try {
    const [products, reviews] = await Promise.all([api('/api/products'), api('/api/reviews')]);
    state.products = products; state.reviews = reviews;
    writeCache(); renderAll();
  } catch {
    if (!cached) {
      $('#product-grid').setAttribute('aria-busy', 'false');
      $('#product-grid').innerHTML = '<div class="empty-state">We could not load the collection right now. Please refresh, or WhatsApp us to ask about available outfits.</div>';
    }
  }
}

/* ---------- Catalogue ---------- */
function visibleProducts() {
  const q = state.q.trim().toLowerCase();
  let items = state.products.filter(p =>
    (state.filter === 'All' || p.category === state.filter) &&
    (!state.onlyAvailable || p.availability === 'Available') &&
    (!q || `${p.name} ${p.category} ${p.description || ''} ${p.sizes || ''}`.toLowerCase().includes(q)));
  const price = p => (p.price === '' || p.price == null ? Infinity : Number(p.price));
  const sorters = {
    featured: (a, b) => Number(!!b.featured) - Number(!!a.featured) || String(b.created).localeCompare(String(a.created)),
    newest: (a, b) => String(b.created).localeCompare(String(a.created)),
    low: (a, b) => price(a) - price(b),
    high: (a, b) => (price(b) === Infinity ? -1 : price(b)) - (price(a) === Infinity ? -1 : price(a))
  };
  return items.sort(sorters[state.sort]);
}

function renderProducts() {
  const grid = $('#product-grid'); if (!grid) return;
  grid.setAttribute('aria-busy', 'false');
  const items = visibleProducts();
  $('#result-count').textContent = state.products.length ? `${items.length} ${items.length === 1 ? 'outfit' : 'outfits'}` : '';
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">${state.products.length ? 'No outfits match your search. Try another category or clear the filters.' : 'Our collection is being updated. WhatsApp us to ask about current availability.'}</div>`;
    return;
  }
  grid.innerHTML = items.map(p => {
    const cover = p.images && p.images[0];
    return `<article class="product-card ${p.availability === 'Unavailable' ? 'is-unavailable' : ''}">
      <button class="product-image" data-open="${esc(p.id)}" aria-label="View ${esc(p.name)}">
        ${cover ? `<img src="${imgUrl(cover)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : '<span>Photo coming soon</span>'}
        ${p.featured ? '<span class="ribbon">Featured</span>' : ''}
        ${p.images && p.images.length > 1 ? `<span class="photo-count">${p.images.length} photos</span>` : ''}
      </button>
      <div class="product-info"><h3>${esc(p.name)}</h3><small>${esc(p.category)}${p.sizes ? ' · ' + esc(p.sizes) : ''}</small>
        <p>${esc(p.description || 'Contact us for more details.')}</p>
        <div class="product-meta"><span class="price">${money(p.price)}</span><span class="status ${statusClass(p.availability)}">${esc(p.availability)}</span></div>
        <a class="product-contact" href="${waLink('Hello Barbara Bridals, I am interested in ' + p.name + '. Please share more details and availability.')}" target="_blank" rel="noopener">Enquire on WhatsApp</a>
      </div></article>`;
  }).join('');
}

function renderReviews() {
  const el = $('#testimonial-grid'); if (!el || !state.reviews.length) return;
  el.innerHTML = state.reviews.map(r => `<article class="testimonial"><span aria-label="${Number(r.rating)} out of 5 stars">${'★'.repeat(Number(r.rating))}${'☆'.repeat(5 - Number(r.rating))}</span><p>“${esc(r.text)}”</p><small>${esc(r.name)}</small></article>`).join('');
}
function renderAll() { renderProducts(); renderReviews(); }

/* ---------- Filters ---------- */
document.querySelectorAll('.filter').forEach(b => b.addEventListener('click', () => {
  $('.filter.active')?.classList.remove('active'); b.classList.add('active');
  state.filter = b.dataset.filter; renderProducts();
}));
let searchTimer;
$('#search')?.addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = e.target.value; renderProducts(); }, 120); });
$('#sort')?.addEventListener('change', e => { state.sort = e.target.value; renderProducts(); });
$('#only-available')?.addEventListener('change', e => { state.onlyAvailable = e.target.checked; renderProducts(); });

/* ---------- Outfit quick view ---------- */
const modal = $('#modal'); let lastFocus = null;
function openModal(id) {
  const p = state.products.find(x => x.id === id); if (!p) return;
  lastFocus = document.activeElement;
  const imgs = p.images || [];
  const setMain = i => { $('#modal-main').innerHTML = imgs.length ? `<img src="${imgUrl(imgs[i])}" alt="${esc(p.name)}, photo ${i + 1}">` : '<span>Photo coming soon</span>'; document.querySelectorAll('#modal-thumbs button').forEach((b, n) => b.classList.toggle('on', n === i)); };
  $('#modal-thumbs').innerHTML = imgs.length > 1 ? imgs.map((x, i) => `<button data-i="${i}" aria-label="Show photo ${i + 1}"><img src="${imgUrl(x)}" alt="" loading="lazy"></button>`).join('') : '';
  $('#modal-thumbs').onclick = e => { const b = e.target.closest('button'); if (b) setMain(Number(b.dataset.i)); };
  setMain(0);
  $('#modal-info').innerHTML = `<small class="modal-cat">${esc(p.category)}</small><h3 id="modal-title">${esc(p.name)}</h3>
    <div class="product-meta"><span class="price">${money(p.price)}</span><span class="status ${statusClass(p.availability)}">${esc(p.availability)}</span></div>
    ${p.sizes ? `<p class="modal-line"><b>Sizes:</b> ${esc(p.sizes)}</p>` : ''}
    <p class="modal-desc">${esc(p.description || 'Contact us for more details about this outfit.')}</p>
    <div class="modal-actions"><a class="button button-gold" href="${waLink('Hello Barbara Bridals, I am interested in ' + p.name + '. Please share more details and availability.')}" target="_blank" rel="noopener">Enquire on WhatsApp</a><button class="button button-light" id="modal-book" type="button">Request a booking</button></div>`;
  $('#modal-book').onclick = () => { closeModal(); const f = $('#booking-form'); f.elements.outfit.value = p.name; if ([...f.elements.category.options].some(o => o.value === p.category)) f.elements.category.value = p.category; $('#booking').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => f.elements.name.focus({ preventScroll: true }), 600); };
  modal.hidden = false; document.body.classList.add('no-scroll'); $('.modal-close').focus();
}
function closeModal() { modal.hidden = true; document.body.classList.remove('no-scroll'); lastFocus?.focus?.(); }
$('#product-grid')?.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openModal(b.dataset.open); });
modal?.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (modal && !modal.hidden) closeModal(); closeWa(); } });

/* ---------- Booking form: saved to the dashboard, then sent on WhatsApp ---------- */
const form = $('#booking-form'), statusEl = $('#booking-status');
const dateInput = form?.elements.date; if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];
form?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  if (!d.name.trim() || d.phone.replace(/\D/g, '').length < 9 || !d.category) { statusEl.className = 'wide form-status error'; statusEl.textContent = 'Please enter your name, a valid phone number and choose a collection.'; return; }
  const btn = $('#booking-submit'); btn.disabled = true; btn.textContent = 'Sending…';
  const text = `Hello Barbara Bridals, I would like to request a booking.\nName: ${d.name}\nPhone: ${d.phone}\nCategory: ${d.category}${d.outfit ? '\nOutfit: ' + d.outfit : ''}\nEvent date: ${d.date || 'Not specified'}\nDetails: ${d.details || 'None'}`;
  let saved = true;
  try {
    const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
  } catch (err) { saved = false; }
  statusEl.className = 'wide form-status ok';
  statusEl.innerHTML = `<strong>${saved ? 'Request received.' : 'Almost done.'}</strong> ${saved ? 'Tap below to send the same details on WhatsApp so we can reply faster.' : 'We could not save your request online, but you can still send it directly on WhatsApp.'}<a class="button button-whatsapp" href="${waLink(text)}" target="_blank" rel="noopener">Send on WhatsApp</a>`;
  btn.disabled = false; btn.textContent = 'Send booking request';
  if (saved) form.reset();
});

/* ---------- WhatsApp chat widget ---------- */
const waCard = $('#wa-card'), waFab = $('#wa-fab'), waTip = $('#wa-tip'), waBadge = $('#wa-badge');
function openWa() { waCard.hidden = false; waFab.setAttribute('aria-expanded', 'true'); waBadge.hidden = true; waTip.classList.remove('show'); const t = $('#wa-time'); if (t) t.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); try { sessionStorage.setItem('bb_wa_seen', '1'); } catch {} }
function closeWa() { if (!waCard || waCard.hidden) return; waCard.hidden = true; waFab.setAttribute('aria-expanded', 'false'); }
waFab?.addEventListener('click', () => (waCard.hidden ? openWa() : closeWa()));
$('#wa-close')?.addEventListener('click', closeWa);
$('#wa-quick')?.addEventListener('click', e => { const b = e.target.closest('button[data-msg]'); if (!b) return; $('#wa-start').href = waLink(b.dataset.msg); document.querySelectorAll('#wa-quick button').forEach(x => x.classList.toggle('on', x === b)); });
document.addEventListener('click', e => { if (waCard && !waCard.hidden && !e.target.closest('#wa-widget')) closeWa(); });
(function nudge() { let seen = false; try { seen = sessionStorage.getItem('bb_wa_seen') === '1'; } catch {} if (seen) { waBadge.hidden = true; return; } setTimeout(() => { if (waCard.hidden) { waTip.classList.add('show'); setTimeout(() => waTip.classList.remove('show'), 7000); } }, 5000); })();

/* ---------- Mobile nav + footer year ---------- */
const toggle = $('.menu-toggle'), nav = $('.nav');
if (toggle) {
  toggle.addEventListener('click', () => { const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? '✕' : '☰'; });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = '☰'; }));
}
$('#year').textContent = new Date().getFullYear();
load();
