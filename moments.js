/* Barbra Bridals - previous occasions (photos + videos), stories viewer and footer helpers.
   Uses helpers defined in script.js: $, esc, api, imgUrl. */
(() => {
  let occasions = [], groups = [];
  const SEEN = 'bb_story_seen';
  const seenMap = () => { try { return JSON.parse(localStorage.getItem(SEEN) || '{}'); } catch { return {}; } };
  const isSeen = g => seenMap()[g.id] === g.updated;
  const markSeen = g => { try { const m = seenMap(); m[g.id] = g.updated; localStorage.setItem(SEEN, JSON.stringify(m)); } catch {} };
  const lock = on => document.body.classList.toggle('no-scroll', on);
  const timeAgo = iso => {
    const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  };
  const fmtDate = d => { if (!d) return ''; const t = new Date(d.length === 7 ? d + '-01T00:00' : d + 'T00:00'); return isNaN(t) ? '' : t.toLocaleDateString(undefined, d.length === 7 ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' }); };

  /* ================= Previous occasions ================= */
  function renderOccasions() {
    const sec = $('#occasions'), grid = $('#occ-grid');
    const has = occasions.length > 0;
    sec.hidden = !has;
    document.querySelectorAll('a[href="#occasions"]').forEach(a => { a.hidden = !has; });
    if (!has) return;
    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = occasions.map((o, i) => {
      const c = o.media[0], poster = c.kind === 'image' ? c.src : c.poster;
      const vids = o.media.filter(m => m.kind === 'video').length, pics = o.media.length - vids;
      const d = fmtDate(o.date);
      return `<button class="occ-card" data-occ="${i}" aria-label="Open ${esc(o.title)}">
        ${poster ? `<img src="${poster}" alt="" loading="lazy" decoding="async">` : `<video src="${c.src}#t=0.5" preload="metadata" muted playsinline></video>`}
        <span class="occ-shade"></span>
        <span class="occ-badges">${vids ? `<i>▶ ${vids} video${vids > 1 ? 's' : ''}</i>` : ''}${pics ? `<i>${pics} photo${pics > 1 ? 's' : ''}</i>` : ''}</span>
        <span class="occ-info"><small>${esc(o.type)}${d ? ' · ' + esc(d) : ''}</small><strong>${esc(o.title)}</strong></span></button>`;
    }).join('');
  }

  const lb = $('#lightbox'), stage = $('#lb-stage'); let cur = null, idx = 0, lbFocus = null;
  function lbShow(i) {
    const n = cur.media.length; idx = (i + n) % n;
    const m = cur.media[idx];
    stage.innerHTML = m.kind === 'video'
      ? `<video src="${m.src}" ${m.poster ? `poster="${m.poster}"` : ''} controls autoplay playsinline preload="metadata"></video>`
      : `<img src="${m.src}" alt="${esc(cur.title)}, photo ${idx + 1}">`;
    $('#lb-count').textContent = `${idx + 1} / ${n}`;
    lb.classList.toggle('single', n === 1);
    if (n > 1) { const nx = cur.media[(idx + 1) % n]; if (nx.kind === 'image') new Image().src = nx.src; }
  }
  function lbOpen(i) {
    cur = occasions[i]; if (!cur) return; lbFocus = document.activeElement;
    $('#lb-title').textContent = cur.title;
    $('#lb-meta').textContent = [cur.type, fmtDate(cur.date)].filter(Boolean).join(' · ');
    $('#lb-desc').textContent = cur.description || '';
    lb.hidden = false; lock(true); lbShow(0); $('#lb-close').focus();
  }
  function lbClose() { if (lb.hidden) return; stage.innerHTML = ''; lb.hidden = true; lock(false); lbFocus?.focus?.(); }
  $('#occ-grid').addEventListener('click', e => { const b = e.target.closest('[data-occ]'); if (b) lbOpen(Number(b.dataset.occ)); });
  $('#lb-close').onclick = lbClose; $('#lb-prev').onclick = () => lbShow(idx - 1); $('#lb-next').onclick = () => lbShow(idx + 1);
  lb.addEventListener('click', e => { if (e.target === lb || e.target === stage) lbClose(); });
  let tx = 0; stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 55 && cur.media.length > 1) lbShow(idx + (dx < 0 ? 1 : -1)); });

  /* ================= Stories ================= */
  function renderStories() {
    const bar = $('#stories-bar'); bar.hidden = !groups.length;
    $('#stories-track').innerHTML = groups.map((g, i) => {
      const c = g.slides[0], src = c.kind === 'image' ? c.src : c.poster;
      return `<button class="story ${isSeen(g) ? 'seen' : ''}" data-story="${i}" aria-label="Watch story: ${esc(g.title)}"><span class="story-ring"><span class="story-thumb">${src ? `<img src="${src}" alt="" loading="lazy">` : '<b>B</b>'}${c.kind === 'video' ? '<i class="story-play">▶</i>' : ''}</span></span><span class="story-label">${esc(g.title)}</span></button>`;
    }).join('');
  }

  const sv = $('#story-viewer'), frame = $('#sv-frame'), mediaEl = $('#sv-media');
  let gi = 0, si = 0, raf = 0, last = 0, elapsed = 0, dur = 5500, paused = false, ready = false, vid = null, sound = false, svFocus = null;

  function buildBars() {
    $('#sv-bars').innerHTML = groups[gi].slides.map((_, k) => `<span class="sv-bar"><i style="transform:scaleX(${k < si ? 1 : 0})"></i></span>`).join('');
  }
  const fill = p => { const el = $('#sv-bars').children[si]?.firstChild; if (el) el.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`; };

  function show(g, s) {
    cancelAnimationFrame(raf); gi = g; si = s; elapsed = 0; ready = false; last = 0; vid = null;
    const grp = groups[gi], sl = grp.slides[si];
    buildBars(); setPaused(false, true);
    $('#sv-sub').textContent = `${grp.title} · ${timeAgo(grp.updated || grp.created)}`;
    const cap = $('#sv-caption'); cap.textContent = sl.caption || ''; cap.hidden = !sl.caption;
    $('#sv-sound').hidden = sl.kind !== 'video';
    if (sl.kind === 'video') {
      mediaEl.innerHTML = `<video playsinline autoplay ${sound ? '' : 'muted'} preload="auto" ${sl.poster ? `poster="${sl.poster}"` : ''} src="${sl.src}"></video>`;
      vid = mediaEl.firstChild; vid.muted = !sound; syncSound();
      vid.addEventListener('loadedmetadata', () => { dur = Math.min(60000, (vid.duration || 8) * 1000); });
      vid.addEventListener('playing', () => { ready = true; });
      vid.addEventListener('ended', () => go(1));
      vid.addEventListener('error', () => { vid = null; dur = 4000; ready = true; });
      vid.play?.().catch(() => { ready = true; });
    } else {
      dur = 5500;
      mediaEl.innerHTML = `<img class="sv-img" src="${sl.src}" alt="${esc(sl.caption || grp.title)}" style="animation-duration:${dur}ms">`;
      const im = mediaEl.firstChild; im.addEventListener('load', () => { ready = true; }); im.addEventListener('error', () => { ready = true; });
      if (im.complete) ready = true;
    }
    const nx = grp.slides[si + 1]; if (nx && nx.kind === 'image') new Image().src = nx.src;
    if (si === grp.slides.length - 1) markSeen(grp);
    raf = requestAnimationFrame(tick);
  }
  function tick(ts) {
    const dt = Math.min(100, ts - (last || ts)); last = ts;
    if (!paused && ready) {
      if (vid) elapsed = vid.currentTime * 1000; else elapsed += dt;
      fill(elapsed / dur);
      if (!vid && elapsed >= dur) return go(1);
    }
    raf = requestAnimationFrame(tick);
  }
  function setPaused(p, silent) {
    paused = p; frame.classList.toggle('paused', p);
    if (!silent) { vid?.[p ? 'pause' : 'play']?.(); }
    const b = $('#sv-pause'); b.textContent = p ? '▶' : '❚❚'; b.setAttribute('aria-label', p ? 'Play' : 'Pause');
  }
  function syncSound() { const b = $('#sv-sound'); b.textContent = sound ? '🔊' : '🔇'; b.setAttribute('aria-label', sound ? 'Turn sound off' : 'Turn sound on'); }
  function go(dir) {
    const g = groups[gi];
    if (dir > 0) { if (si < g.slides.length - 1) show(gi, si + 1); else { markSeen(g); if (gi < groups.length - 1) show(gi + 1, 0); else close(); } }
    else { if (si > 0) show(gi, si - 1); else if (gi > 0) show(gi - 1, 0); else show(gi, 0); }
  }
  function open(i) { if (!groups[i]) return; svFocus = document.activeElement; sv.hidden = false; lock(true); show(i, 0); $('#sv-close').focus(); }
  function close() { if (sv.hidden) return; cancelAnimationFrame(raf); mediaEl.innerHTML = ''; vid = null; sv.hidden = true; lock(false); renderStories(); svFocus?.focus?.(); }

  $('#stories-track').addEventListener('click', e => { const b = e.target.closest('[data-story]'); if (b) open(Number(b.dataset.story)); });
  $('#sv-close').onclick = close;
  $('#sv-pause').onclick = () => setPaused(!paused);
  $('#sv-sound').onclick = () => { sound = !sound; if (vid) vid.muted = !sound; syncSound(); };
  $('#sv-aprev').onclick = () => gi > 0 ? show(gi - 1, 0) : show(gi, 0);
  $('#sv-anext').onclick = () => { markSeen(groups[gi]); gi < groups.length - 1 ? show(gi + 1, 0) : close(); };
  sv.addEventListener('click', e => { if (e.target === sv) close(); });
  // tap left/right to move, press and hold to pause
  [['#sv-prev', -1], ['#sv-next', 1]].forEach(([sel, dir]) => {
    const z = $(sel); let t, held = false; z.tabIndex = -1;
    const stop = () => { clearTimeout(t); if (held) { held = false; setPaused(false); } };
    z.addEventListener('pointerdown', () => { held = false; t = setTimeout(() => { held = true; setPaused(true); }, 200); });
    z.addEventListener('pointerup', () => { const was = held; stop(); if (!was) go(dir); });
    z.addEventListener('pointerleave', stop); z.addEventListener('pointercancel', stop);
  });
  let ty = 0; frame.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
  frame.addEventListener('touchend', e => { if (e.changedTouches[0].clientY - ty > 110) close(); });

  document.addEventListener('keydown', e => {
    if (!sv.hidden) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === ' ') { e.preventDefault(); setPaused(!paused); } }
    else if (!lb.hidden) { if (e.key === 'Escape') lbClose(); else if (e.key === 'ArrowRight') lbShow(idx + 1); else if (e.key === 'ArrowLeft') lbShow(idx - 1); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !sv.hidden) setPaused(true); });

  /* ================= Footer helpers ================= */
  document.querySelectorAll('[data-filter-link]').forEach(a => a.addEventListener('click', () => {
    const f = [...document.querySelectorAll('.filter')].find(x => x.dataset.filter === a.dataset.filterLink); f?.click();
  }));
  $('#to-top')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ================= Load ================= */
  (async () => {
    const [o, s] = await Promise.all([api('/api/occasions').catch(() => []), api('/api/stories').catch(() => [])]);
    occasions = Array.isArray(o) ? o : []; groups = (Array.isArray(s) ? s : []).filter(g => g.slides?.length);
    groups.sort((a, b) => Number(isSeen(a)) - Number(isSeen(b)));
    renderOccasions(); renderStories();
  })();
})();
