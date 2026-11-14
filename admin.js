/* Barbra Bridals admin - talks to Netlify Functions (/api/*), data lives in Netlify Blobs. */
const TOKEN_KEY = 'bb_admin_token';
const $ = (s, r = document) => r.querySelector(s);
const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const imgUrl = id => `/api/images/${encodeURIComponent(id)}`;
const money = p => p === '' || p == null ? 'Price on request' : 'UGX ' + Number(p).toLocaleString();
const STATUSES = ['New', 'Contacted', 'Confirmed', 'Closed'];
const AVAIL = ['Available', 'Reserved', 'Unavailable'];
let data = { products: [], reviews: [], requests: [], occasions: [], stories: [] };
let photos = []; // image ids for the outfit being edited

/* ---------- helpers ---------- */
const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const res = await fetch(path, { method, headers: { Authorization: 'Bearer ' + token(), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  if (res.status === 401 && path !== '/api/auth') { logout(true); throw new Error('Session expired. Please sign in again.'); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Something went wrong.');
  return out;
}
function showLogin(show) { $('#login').hidden = !show; $('#app').hidden = show; }
function logout(expired) { sessionStorage.removeItem(TOKEN_KEY); showLogin(true); if (expired) { $('#login-error').textContent = 'Your session ended. Please sign in again.'; } }

/* ---------- sign in ---------- */
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('#login-btn'); btn.disabled = true; btn.textContent = 'Signing in…'; $('#login-error').textContent = '';
  try {
    const r = await api('/api/auth', { method: 'POST', body: { password: e.target.password.value } });
    sessionStorage.setItem(TOKEN_KEY, r.token); e.target.reset(); await start();
  } catch (err) { $('#login-error').textContent = err.message; }
  btn.disabled = false; btn.textContent = 'Sign in';
});
$('#logout').addEventListener('click', () => logout());

async function start() {
  showLogin(false);
  try {
    const [products, reviews, requests, occasions, stories] = await Promise.all([api('/api/products'), api('/api/reviews'), api('/api/bookings'), api('/api/occasions'), api('/api/stories?all=1')]);
    data = { products, reviews, requests, occasions, stories }; renderAll();
  } catch (err) { toast(err.message, true); }
}

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
  $('.tab.active').classList.remove('active'); $('.admin-panel.active').classList.remove('active');
  b.classList.add('active'); $('#' + b.dataset.tab).classList.add('active');
}));

/* ---------- stats ---------- */
function renderStats() {
  const p = data.products, n = data.requests.filter(r => r.status === 'New').length;
  $('#stats').innerHTML = [
    ['Outfits', p.length], ['Available', p.filter(x => x.availability === 'Available').length],
    ['Reserved', p.filter(x => x.availability === 'Reserved').length], ['New requests', n], ['Occasions', data.occasions.length], ['Live stories', data.stories.filter(s => !s.expires || new Date(s.expires) > new Date()).length]
  ].map(([k, v]) => `<div class="stat"><strong>${v}</strong><span>${k}</span></div>`).join('');
  const pill = $('#new-count'); pill.hidden = !n; pill.textContent = n;
}

/* ---------- photos: resized in the browser, uploaded to Netlify Blobs ---------- */
function resize(file, max = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); c.toBlob(b => b ? resolve(b) : reject(new Error('Could not process the photo.')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a valid image.')); };
    img.src = url;
  });
}
function renderPhotos(busy = 0) {
  $('#photo-grid').innerHTML = photos.map((id, i) => `<div class="photo"><img src="${imgUrl(id)}" alt="Photo ${i + 1}">${i === 0 ? '<span class="cover">Cover</span>' : `<button type="button" class="photo-btn left" data-cover="${i}" title="Make cover">★</button>`}<button type="button" class="photo-btn" data-remove="${i}" title="Remove photo">✕</button></div>`).join('') + '<div class="photo uploading"><span>Uploading…</span></div>'.repeat(busy);
}
$('#photo-input').addEventListener('change', async e => {
  const files = [...e.target.files].slice(0, 6 - photos.length); e.target.value = '';
  if (!files.length) return toast('You can add up to 6 photos.', true);
  let busy = files.length; renderPhotos(busy);
  for (const f of files) {
    try { const blob = await resize(f); const r = await api('/api/images', { method: 'POST', body: blob, raw: true, headers: { 'Content-Type': 'image/jpeg' } }); photos.push(r.id); }
    catch (err) { toast(err.message, true); }
    busy--; renderPhotos(busy);
  }
});
$('#photo-grid').addEventListener('click', e => {
  const rm = e.target.dataset.remove, cv = e.target.dataset.cover;
  if (rm != null) { photos.splice(Number(rm), 1); renderPhotos(); }
  if (cv != null) { const [x] = photos.splice(Number(cv), 1); photos.unshift(x); renderPhotos(); }
});

/* ---------- outfits ---------- */
const pform = $('#product-form');
function clearForm() { pform.reset(); pform.elements.id.value = ''; photos = []; renderPhotos(); $('#form-title').textContent = 'Add an outfit'; $('#save-product').textContent = 'Save outfit'; }
$('#reset-product').onclick = clearForm;

function renderProducts() {
  const q = $('#admin-search').value.trim().toLowerCase(), el = $('#admin-products');
  const items = data.products.filter(p => !q || `${p.name} ${p.category}`.toLowerCase().includes(q));
  el.innerHTML = items.length ? items.map(p => `<div class="admin-item">${p.images?.[0] ? `<img src="${imgUrl(p.images[0])}" alt="">` : '<div class="detail-icon">✧</div>'}
    <div class="admin-item-info"><strong>${esc(p.name)}${p.featured ? ' <span class="pill gold">Featured</span>' : ''}</strong><small>${esc(p.category)} · ${money(p.price)}${p.images?.length ? ' · ' + p.images.length + ' photo' + (p.images.length > 1 ? 's' : '') : ''}</small></div>
    <div class="admin-item-actions"><select class="small-select" data-avail="${esc(p.id)}" aria-label="Availability">${AVAIL.map(a => `<option ${a === p.availability ? 'selected' : ''}>${a}</option>`).join('')}</select><button class="small-btn" data-feature="${esc(p.id)}">${p.featured ? 'Unfeature' : 'Feature'}</button><button class="small-btn" data-edit="${esc(p.id)}">Edit</button><button class="small-btn delete" data-delete="${esc(p.id)}">Delete</button></div></div>`).join('')
    : `<div class="no-items">${data.products.length ? 'No outfits match your search.' : 'No outfits added yet. Use the form above to add your first outfit.'}</div>`;
}
$('#admin-search').addEventListener('input', renderProducts);

pform.addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('#save-product'); btn.disabled = true;
  const v = Object.fromEntries(new FormData(pform)); const id = v.id; delete v.id;
  const body = { ...v, featured: pform.elements.featured.checked, images: photos };
  try {
    const saved = await api(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', body });
    data.products = id ? data.products.map(p => p.id === id ? saved : p) : [saved, ...data.products];
    clearForm(); renderAll(); toast(id ? 'Outfit updated.' : 'Outfit saved.');
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
});

$('#admin-products').addEventListener('click', async e => {
  const t = e.target, edit = t.dataset.edit, del = t.dataset.delete, feat = t.dataset.feature;
  try {
    if (edit) {
      const p = data.products.find(x => x.id === edit); if (!p) return;
      ['name', 'category', 'price', 'availability', 'sizes', 'description'].forEach(k => { pform.elements[k].value = p[k] ?? ''; });
      pform.elements.id.value = p.id; pform.elements.featured.checked = !!p.featured; photos = [...(p.images || [])]; renderPhotos();
      $('#form-title').textContent = 'Edit outfit'; $('#save-product').textContent = 'Save changes'; pform.scrollIntoView({ behavior: 'smooth' });
    }
    if (feat) { const p = data.products.find(x => x.id === feat); const u = await api(`/api/products/${feat}`, { method: 'PATCH', body: { featured: !p.featured } }); data.products = data.products.map(x => x.id === feat ? u : x); renderAll(); toast(u.featured ? 'Marked as featured.' : 'Removed from featured.'); }
    if (del && confirm('Delete this outfit and its photos? This cannot be undone.')) {
      const p = data.products.find(x => x.id === del);
      await api(`/api/products/${del}`, { method: 'DELETE' });
      await Promise.allSettled((p?.images || []).map(i => api(`/api/images/${encodeURIComponent(i)}`, { method: 'DELETE' })));
      data.products = data.products.filter(x => x.id !== del); renderAll(); toast('Outfit deleted.');
    }
  } catch (err) { toast(err.message, true); }
});
$('#admin-products').addEventListener('change', async e => {
  const id = e.target.dataset.avail; if (!id) return;
  try { const u = await api(`/api/products/${id}`, { method: 'PATCH', body: { availability: e.target.value } }); data.products = data.products.map(x => x.id === id ? u : x); renderAll(); toast('Availability updated.'); }
  catch (err) { toast(err.message, true); renderProducts(); }
});

/* ---------- testimonials ---------- */
function renderReviews() {
  $('#admin-reviews').innerHTML = data.reviews.length ? data.reviews.map(r => `<div class="admin-item"><div class="admin-item-info"><strong>${esc(r.name)} · ${'★'.repeat(Number(r.rating))}</strong><small>${esc(r.text)}</small></div><div class="admin-item-actions"><button class="small-btn delete" data-review-delete="${esc(r.id)}">Delete</button></div></div>`).join('') : '<div class="no-items">No testimonials published yet.</div>';
}
$('#review-form').addEventListener('submit', async e => {
  e.preventDefault();
  try { const r = await api('/api/reviews', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); data.reviews.unshift(r); e.target.reset(); renderReviews(); toast('Testimonial published.'); } catch (err) { toast(err.message, true); }
});
$('#admin-reviews').addEventListener('click', async e => {
  const id = e.target.dataset.reviewDelete; if (!id || !confirm('Delete this testimonial?')) return;
  try { await api(`/api/reviews/${id}`, { method: 'DELETE' }); data.reviews = data.reviews.filter(r => r.id !== id); renderReviews(); toast('Testimonial deleted.'); } catch (err) { toast(err.message, true); }
});

/* ---------- booking requests ---------- */
const phoneDigits = p => { let d = String(p).replace(/\D/g, ''); if (d.startsWith('0')) d = '256' + d.slice(1); return d; };
function renderRequests() {
  $('#admin-requests').innerHTML = data.requests.length ? data.requests.map(r => `<div class="admin-item request ${r.status === 'New' ? 'is-new' : ''}">
    <div class="admin-item-info"><strong>${esc(r.name)} · ${esc(r.category || 'No category')}</strong>
    <small>${esc(r.phone)} · Event: ${esc(r.date || 'Not specified')} · ${new Date(r.created).toLocaleString()}${r.outfit ? '<br>Outfit: ' + esc(r.outfit) : ''}<br>${esc(r.details || 'No extra details')}</small></div>
    <div class="admin-item-actions"><select class="small-select" data-status="${esc(r.id)}" aria-label="Status">${STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select><a class="small-btn" href="https://wa.me/${phoneDigits(r.phone)}" target="_blank" rel="noopener">WhatsApp</a><a class="small-btn" href="tel:${esc(r.phone)}">Call</a><button class="small-btn delete" data-req-delete="${esc(r.id)}">Delete</button></div></div>`).join('') : '<div class="no-items">No booking requests yet.</div>';
}
$('#admin-requests').addEventListener('change', async e => {
  const id = e.target.dataset.status; if (!id) return;
  try { const u = await api(`/api/bookings/${id}`, { method: 'PATCH', body: { status: e.target.value } }); data.requests = data.requests.map(r => r.id === id ? u : r); renderAll(); } catch (err) { toast(err.message, true); }
});
$('#admin-requests').addEventListener('click', async e => {
  const id = e.target.dataset.reqDelete; if (!id || !confirm('Delete this booking request?')) return;
  try { await api(`/api/bookings/${id}`, { method: 'DELETE' }); data.requests = data.requests.filter(r => r.id !== id); renderAll(); toast('Request deleted.'); } catch (err) { toast(err.message, true); }
});
$('#export-csv').addEventListener('click', () => {
  if (!data.requests.length) return toast('There are no requests to export.', true);
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Received', 'Name', 'Phone', 'Category', 'Outfit', 'Event date', 'Status', 'Details'], ...data.requests.map(r => [r.created, r.name, r.phone, r.category, r.outfit, r.date, r.status, r.details])];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(cell).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'barbra-bridals-bookings.csv'; a.click(); URL.revokeObjectURL(a.href);
});


/* ================= Media (photos, GIFs, videos) for occasions and stories ================= */
const MAX_VIDEO = 60 * 1024 * 1024, VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const idOf = src => String(src || '').split('/').pop();
function deleteMediaItem(m) {
  const jobs = [];
  if (m.src?.startsWith('/api/media/')) jobs.push(api(`/api/media/${idOf(m.src)}`, { method: 'DELETE' }));
  else if (m.src?.startsWith('/api/images/')) jobs.push(api(`/api/images/${idOf(m.src)}`, { method: 'DELETE' }));
  if (m.poster) jobs.push(api(`/api/images/${idOf(m.poster)}`, { method: 'DELETE' }));
  return Promise.allSettled(jobs);
}
function videoPoster(file) {
  return new Promise(resolve => {
    const v = document.createElement('video'), url = URL.createObjectURL(file);
    const done = r => { URL.revokeObjectURL(url); resolve(r); };
    v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
    v.onloadeddata = () => { v.currentTime = Math.min(0.6, (v.duration || 1) / 2); };
    v.onseeked = () => {
      try {
        const s = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); c.toBlob(b => done(b), 'image/jpeg', 0.8);
      } catch { done(null); }
    };
    v.onerror = () => done(null); setTimeout(() => done(null), 8000);
  });
}
async function uploadImageBlob(blob, type) { return api('/api/images', { method: 'POST', body: blob, raw: true, headers: { 'Content-Type': type } }); }
async function uploadMedia(file, onProgress) {
  if (file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name)) {
    const type = VIDEO_TYPES.includes(file.type) ? file.type : (/\.webm$/i.test(file.name) ? 'video/webm' : /\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4');
    if (file.size > MAX_VIDEO) throw new Error(`${file.name} is over 60 MB. Trim it or lower its quality first.`);
    let poster = ''; const pb = await videoPoster(file);
    if (pb) { try { poster = (await uploadImageBlob(pb, 'image/jpeg')).url; } catch {} }
    const init = await api('/api/media', { method: 'POST', body: { contentType: type, size: file.size } });
    try {
      for (let i = 0; i < init.chunks; i++) {
        const part = file.slice(i * init.chunkSize, Math.min(file.size, (i + 1) * init.chunkSize));
        let tries = 0;
        for (;;) { try { await api(`/api/media/${init.id}?i=${i}`, { method: 'PUT', body: part, raw: true, headers: { 'Content-Type': 'application/octet-stream' } }); break; } catch (e) { if (++tries >= 3) throw e; } }
        onProgress(Math.round(((i + 1) / init.chunks) * 100));
      }
    } catch (e) { await deleteMediaItem({ src: init.url, poster }); throw e; }
    return { kind: 'video', src: init.url, poster };
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not a photo or video.`);
  if (file.type === 'image/gif') { if (file.size > 3 * 1024 * 1024) throw new Error('GIFs must be under 3 MB. Upload it as a short MP4 video instead.'); return { kind: 'image', src: (await uploadImageBlob(file, 'image/gif')).url, poster: '' }; }
  const r = await uploadImageBlob(await resize(file, 1600, 0.84), 'image/jpeg');
  onProgress(100); return { kind: 'image', src: r.url, poster: '' };
}

/* A reusable list of uploaded media with remove / reorder / optional captions. */
function mediaList(gridEl, inputEl, { captions = false, max = 20 } = {}) {
  let items = [], original = [], fresh = [], pending = [];
  const thumb = m => m.kind === 'video' ? (m.poster ? `<img src="${m.poster}" alt="">` : '<video src="' + m.src + '#t=0.5" muted preload="metadata"></video>') : `<img src="${m.src}" alt="">`;
  function render() {
    gridEl.innerHTML = items.map((m, i) => `<div class="tile"><div class="tile-media">${thumb(m)}${m.kind === 'video' ? '<span class="vbadge">▶ Video</span>' : ''}${i === 0 && !captions ? '<span class="cover">Cover</span>' : ''}
      <button type="button" class="photo-btn" data-rm="${i}" title="Remove">✕</button>${i > 0 ? `<button type="button" class="photo-btn left" data-left="${i}" title="Move earlier">‹</button>` : ''}</div>
      ${captions ? `<input class="tile-caption" data-cap="${i}" maxlength="140" placeholder="Caption (optional)" value="${esc(m.caption || '')}">` : ''}</div>`).join('')
      + pending.map(p => `<div class="tile"><div class="tile-media uploading"><span>${esc(p.name.slice(0, 14))}<br>${p.pct}%</span></div></div>`).join('');
  }
  gridEl.addEventListener('click', e => {
    const rm = e.target.dataset.rm, lf = e.target.dataset.left;
    if (rm != null) { items.splice(Number(rm), 1); render(); }
    if (lf != null) { const i = Number(lf); [items[i - 1], items[i]] = [items[i], items[i - 1]]; render(); }
  });
  gridEl.addEventListener('input', e => { if (e.target.dataset.cap != null) items[Number(e.target.dataset.cap)].caption = e.target.value; });
  inputEl.addEventListener('change', async () => {
    const files = [...inputEl.files].slice(0, Math.max(0, max - items.length - pending.length)); inputEl.value = '';
    if (!files.length) return toast(`You can add up to ${max} items.`, true);
    for (const f of files) {
      const p = { name: f.name, pct: 0 }; pending.push(p); render();
      try { const m = await uploadMedia(f, pct => { p.pct = pct; render(); }); if (captions) m.caption = ''; items.push(m); fresh.push(m); }
      catch (err) { toast(err.message, true); }
      pending = pending.filter(x => x !== p); render();
    }
  });
  return {
    get items() { return items; }, get busy() { return pending.length > 0; },
    set(arr) { items = arr.map(m => ({ ...m })); original = arr.map(m => ({ ...m })); fresh = []; pending = []; render(); },
    async afterSave() { const keep = new Set(items.map(m => m.src)); await Promise.allSettled(original.filter(m => !keep.has(m.src)).map(deleteMediaItem)); this.set([]); },
    async discard() { const keep = new Set(original.map(m => m.src)); await Promise.allSettled(fresh.filter(m => !keep.has(m.src)).map(deleteMediaItem)); this.set([]); }
  };
}

/* ---------- occasions ---------- */
const occForm = $('#occ-form'), occMedia = mediaList($('#occ-media'), $('#occ-input'), { max: 40 });
function occReset() { occForm.reset(); occForm.elements.id.value = ''; $('#occ-form-title').textContent = 'Add a previous occasion'; $('#occ-save').textContent = 'Save occasion'; }
$('#occ-reset').onclick = async () => { await occMedia.discard(); occReset(); };
function renderOccasions() {
  const el = $('#admin-occasions');
  el.innerHTML = data.occasions.length ? data.occasions.map(o => { const c = o.media[0], v = o.media.filter(m => m.kind === 'video').length;
    return `<div class="admin-item">${(c.kind === 'image' ? `<img src="${c.src}" alt="">` : c.poster ? `<img src="${c.poster}" alt="">` : '<div class="detail-icon">▶</div>')}
    <div class="admin-item-info"><strong>${esc(o.title)}</strong><small>${esc(o.type)}${o.date ? ' · ' + esc(o.date) : ''} · ${o.media.length - v} photo(s)${v ? ', ' + v + ' video(s)' : ''}</small></div>
    <div class="admin-item-actions"><button class="small-btn" data-occ-edit="${esc(o.id)}">Edit</button><button class="small-btn delete" data-occ-del="${esc(o.id)}">Delete</button></div></div>`; }).join('')
    : '<div class="no-items">No occasions yet. Add your first one with the form above.</div>';
}
occForm.addEventListener('submit', async e => {
  e.preventDefault(); if (occMedia.busy) return toast('Please wait for uploads to finish.', true);
  const btn = $('#occ-save'); btn.disabled = true;
  const v = Object.fromEntries(new FormData(occForm)), id = v.id; delete v.id;
  try {
    const saved = await api(id ? `/api/occasions/${id}` : '/api/occasions', { method: id ? 'PUT' : 'POST', body: { ...v, media: occMedia.items } });
    data.occasions = id ? data.occasions.map(o => o.id === id ? saved : o) : [saved, ...data.occasions];
    await occMedia.afterSave(); occReset(); renderAll(); toast(id ? 'Occasion updated.' : 'Occasion published.');
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
});
$('#admin-occasions').addEventListener('click', async e => {
  const ed = e.target.dataset.occEdit, del = e.target.dataset.occDel;
  if (ed) { const o = data.occasions.find(x => x.id === ed); if (!o) return; ['title', 'type', 'date', 'description'].forEach(k => { occForm.elements[k].value = o[k] || ''; }); occForm.elements.id.value = o.id; occMedia.set(o.media); $('#occ-form-title').textContent = 'Edit occasion'; $('#occ-save').textContent = 'Save changes'; occForm.scrollIntoView({ behavior: 'smooth' }); }
  if (del && confirm('Delete this occasion and all its photos and videos? This cannot be undone.')) {
    try { const o = data.occasions.find(x => x.id === del); await api(`/api/occasions/${del}`, { method: 'DELETE' }); await Promise.allSettled((o?.media || []).map(deleteMediaItem)); data.occasions = data.occasions.filter(x => x.id !== del); renderAll(); toast('Occasion deleted.'); } catch (err) { toast(err.message, true); }
  }
});

/* ---------- stories ---------- */
const storyForm = $('#story-form'), storyMedia = mediaList($('#story-media'), $('#story-input'), { captions: true, max: 15 });
function storyReset() { storyForm.reset(); storyForm.elements.id.value = ''; $('#story-form-title').textContent = 'Add a story'; $('#story-save').textContent = 'Publish story'; }
$('#story-reset').onclick = async () => { await storyMedia.discard(); storyReset(); };
function expiryText(s) { if (!s.expires) return 'No expiry'; const ms = new Date(s.expires) - Date.now(); if (ms <= 0) return 'Expired (hidden from website)'; const h = Math.round(ms / 3600e3); return h < 48 ? `Visible for ${h}h more` : `Visible for ${Math.round(h / 24)} days more`; }
function renderStories() {
  const el = $('#admin-stories');
  el.innerHTML = data.stories.length ? data.stories.map(s => { const c = s.slides[0], expired = s.expires && new Date(s.expires) <= new Date();
    return `<div class="admin-item ${expired ? 'is-expired' : ''}">${(c.kind === 'image' ? `<img src="${c.src}" alt="">` : c.poster ? `<img src="${c.poster}" alt="">` : '<div class="detail-icon">▶</div>')}
    <div class="admin-item-info"><strong>${esc(s.title)} ${expired ? '<span class="pill">Expired</span>' : ''}</strong><small>${s.slides.length} slide(s) · ${esc(expiryText(s))}</small></div>
    <div class="admin-item-actions"><button class="small-btn" data-story-edit="${esc(s.id)}">${expired ? 'Edit / republish' : 'Edit'}</button><button class="small-btn delete" data-story-del="${esc(s.id)}">Delete</button></div></div>`; }).join('')
    : '<div class="no-items">No stories yet. Add one with the form above.</div>';
}
storyForm.addEventListener('submit', async e => {
  e.preventDefault(); if (storyMedia.busy) return toast('Please wait for uploads to finish.', true);
  const btn = $('#story-save'); btn.disabled = true;
  const v = Object.fromEntries(new FormData(storyForm)), id = v.id; delete v.id;
  try {
    const saved = await api(id ? `/api/stories/${id}` : '/api/stories', { method: id ? 'PUT' : 'POST', body: { ...v, slides: storyMedia.items } });
    data.stories = id ? data.stories.map(s => s.id === id ? saved : s) : [saved, ...data.stories];
    await storyMedia.afterSave(); storyReset(); renderAll(); toast(id ? 'Story updated.' : 'Story published.');
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
});
$('#admin-stories').addEventListener('click', async e => {
  const ed = e.target.dataset.storyEdit, del = e.target.dataset.storyDel;
  if (ed) { const s = data.stories.find(x => x.id === ed); if (!s) return; storyForm.elements.title.value = s.title; storyForm.elements.keep.value = s.expires ? '24h' : 'never'; storyForm.elements.id.value = s.id; storyMedia.set(s.slides); $('#story-form-title').textContent = 'Edit story'; $('#story-save').textContent = 'Save & republish'; storyForm.scrollIntoView({ behavior: 'smooth' }); }
  if (del && confirm('Delete this story and its media?')) {
    try { const s = data.stories.find(x => x.id === del); await api(`/api/stories/${del}`, { method: 'DELETE' }); await Promise.allSettled((s?.slides || []).map(deleteMediaItem)); data.stories = data.stories.filter(x => x.id !== del); renderAll(); toast('Story deleted.'); } catch (err) { toast(err.message, true); }
  }
});

function renderAll() { renderStats(); renderProducts(); renderReviews(); renderRequests(); renderOccasions(); renderStories(); }

/* ---------- boot: reuse the session if the token is still valid ---------- */
(async () => {
  if (token()) { try { const r = await api('/api/auth'); if (r.ok) return start(); } catch {} sessionStorage.removeItem(TOKEN_KEY); }
  showLogin(true);
})();
