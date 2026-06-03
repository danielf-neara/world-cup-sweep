/* ============================================================
   World Cup '26 Sweep
   Vanilla JS. Data lives in data.json, synced to GitHub via PAT.
   ============================================================ */

const CFG_KEY = 'wcs_config';
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- default seed (used if data.json can't be fetched) ----
const SEED = {
  meta: { title: "World Cup '26 Sweep", subtitle: "Last team standing takes the pot", lastUpdated: null },
  teams: [],
  boys: [],
  draw: { completed: false, order: [], allocations: {} },
  champion: null
};

let DATA = null;     // current sweep state
let CFG  = null;     // github config
let skipDraw = false;

// ============================================================
//  Config (GitHub sync)
// ============================================================
function loadCfg() {
  try { CFG = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }
  catch { CFG = {}; }
  CFG.owner  = CFG.owner  || '';
  CFG.repo   = CFG.repo   || '';
  CFG.branch = CFG.branch || 'main';
  CFG.path   = CFG.path   || 'data.json';
  CFG.token  = CFG.token  || '';
}
function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); }
const canEdit = () => !!(CFG && CFG.token && CFG.owner && CFG.repo);

// base64 that survives emoji / unicode
const b64encode = str => btoa(unescape(encodeURIComponent(str)));
const b64decode = b64 => decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));

// ============================================================
//  Load / save data
// ============================================================
async function loadData() {
  // Prefer GitHub (latest, authoritative) when we have a token; else the
  // committed file served alongside the page (what friends see).
  if (canEdit()) {
    try {
      const r = await fetch(ghContentsUrl(), { headers: ghHeaders(), cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        DATA = normalise(JSON.parse(b64decode(j.content)));
        DATA.__sha = j.sha;
        return;
      }
    } catch (e) { console.warn('GitHub load failed, falling back to local file', e); }
  }
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { DATA = normalise(await r.json()); return; }
  } catch (e) { console.warn('local data.json load failed', e); }
  DATA = normalise(structuredClone(SEED));
}

function normalise(d) {
  d = d || {};
  d.meta  = Object.assign({}, SEED.meta, d.meta);
  d.teams = Array.isArray(d.teams) ? d.teams : [];
  d.teams.forEach(t => { if (t.status !== 'out') t.status = 'alive'; });
  d.boys  = Array.isArray(d.boys) ? d.boys : [];
  d.draw  = Object.assign({ completed: false, order: [], allocations: {} }, d.draw);
  if (d.champion === undefined) d.champion = null;
  return d;
}

function ghContentsUrl() {
  return `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${encodeURIComponent(CFG.path).replace(/%2F/g, '/')}?ref=${CFG.branch}`;
}
function ghPutUrl() {
  return `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${encodeURIComponent(CFG.path).replace(/%2F/g, '/')}`;
}
function ghHeaders() {
  return { Authorization: `Bearer ${CFG.token}`, Accept: 'application/vnd.github+json' };
}

async function pushData(silent) {
  if (!canEdit()) { if (!silent) toast('Add a GitHub token in Settings first', true); return false; }
  DATA.meta.lastUpdated = new Date().toISOString();
  const payload = JSON.parse(JSON.stringify(DATA));
  delete payload.__sha;
  const body = {
    message: `Update sweep — ${new Date().toLocaleString('en-AU')}`,
    content: b64encode(JSON.stringify(payload, null, 2)),
    branch: CFG.branch
  };
  if (DATA.__sha) body.sha = DATA.__sha;
  try {
    const r = await fetch(ghPutUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
    if (!r.ok) {
      // sha conflict -> refetch sha and retry once
      if (r.status === 409 || r.status === 422) {
        const g = await fetch(ghContentsUrl(), { headers: ghHeaders(), cache: 'no-store' });
        if (g.ok) { DATA.__sha = (await g.json()).sha; return pushData(silent); }
      }
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || r.status);
    }
    DATA.__sha = (await r.json()).content.sha;
    if (!silent) toast('Saved to GitHub ✓');
    return true;
  } catch (e) {
    console.error(e);
    if (!silent) toast('GitHub save failed: ' + e.message, true);
    return false;
  }
}

// save locally-effective + push if possible
async function commit(msgSilent) { renderAll(); await pushData(msgSilent); }

// ============================================================
//  Helpers
// ============================================================
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const teamById = id => DATA.teams.find(t => t.id === id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

function splitText(nBoys) {
  const T = DATA.teams.length;
  if (nBoys <= 0) return '';
  const base = Math.floor(T / nBoys), rem = T % nBoys;
  if (rem === 0) return `${nBoys} boys → <b>${base} teams each</b> (${T} total)`;
  return `${nBoys} boys → <b>${rem} get ${base + 1}</b>, <b>${nBoys - rem} get ${base}</b> (${T} total)`;
}

// ============================================================
//  Boys setup UI
// ============================================================
function renderBoysSetup() {
  const list = $('#boysList');
  list.innerHTML = '';
  const boys = DATA.boys.length ? DATA.boys : [''];
  boys.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'boy-row';
    row.innerHTML = `
      <span class="num">${i + 1}</span>
      <input type="text" value="${esc(name)}" placeholder="Name…" data-i="${i}" />
      <button class="x" data-i="${i}" title="Remove">✕</button>`;
    list.appendChild(row);
  });
  $$('#boysList input').forEach(inp => {
    inp.addEventListener('input', e => { DATA.boys[+e.target.dataset.i] = e.target.value; updateSplitChip(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { addBoy(); } });
  });
  $$('#boysList .x').forEach(btn => btn.addEventListener('click', e => {
    DATA.boys.splice(+e.target.dataset.i, 1);
    renderBoysSetup();
  }));
  // sync DATA.boys length with what's shown
  if (!DATA.boys.length) DATA.boys = [''];
  updateSplitChip();
}
function addBoy() { DATA.boys.push(''); renderBoysSetup(); $$('#boysList input').slice(-1)[0]?.focus(); }
function cleanBoys() { return DATA.boys.map(b => b.trim()).filter(Boolean); }
function updateSplitChip() {
  const n = cleanBoys().length;
  $('#splitChip').innerHTML = n ? splitText(n) : 'Add some names to see the split';
  const dupes = new Set();
  const seen = new Set();
  cleanBoys().forEach(b => { const k = b.toLowerCase(); if (seen.has(k)) dupes.add(b); seen.add(k); });
  const note = $('#setupNote');
  if (dupes.size) note.innerHTML = `⚠ Duplicate name(s): ${[...dupes].join(', ')} — make them unique.`;
  else note.innerHTML = '';
  $('#runDraw').disabled = n < 2 || dupes.size > 0;
}

// ============================================================
//  THE DRAW (animated)
// ============================================================
async function runDraw() {
  const boys = cleanBoys();
  if (boys.length < 2) return;
  DATA.boys = boys;
  skipDraw = false;

  const stage = $('#stage');
  stage.classList.add('show');
  const phase = $('#stagePhase'), onClock = $('#stageOnClock'), bodyEl = $('#stageBody');

  // ---- phase 1: shuffle the order ----
  const order = shuffle(boys);
  phase.textContent = 'Shuffling the draw order';
  onClock.innerHTML = '';
  bodyEl.innerHTML = `<div class="order-reveal" id="orderReveal"></div>`;
  const orWrap = $('#orderReveal');

  if (!skipDraw) {
    // teaser: flick through random orders
    for (let s = 0; s < 14 && !skipDraw; s++) {
      const r = shuffle(boys);
      orWrap.innerHTML = r.map((b, i) => `<div class="oi in" style="animation:none; opacity:1; transform:none;"><span class="pos">${i + 1}</span>${esc(b)}</div>`).join('');
      await sleep(70 + s * 14);
    }
  }
  // settle to final order with stagger
  orWrap.innerHTML = order.map((b, i) =>
    `<div class="oi" style="animation-delay:${i * 90}ms"><span class="pos">${i + 1}</span>${esc(b)}</div>`).join('');
  $$('#orderReveal .oi').forEach(el => el.classList.add('in'));
  await sleep(skipDraw ? 0 : order.length * 90 + 700);

  // ---- phase 2: allocate teams (draft style) ----
  const T = DATA.teams.length, n = order.length;
  const base = Math.floor(T / n), rem = T % n;
  const quota = {};
  order.forEach((b, i) => { quota[b] = base + (i < rem ? 1 : 0); });

  const alloc = {}; order.forEach(b => alloc[b] = []);
  const pool = shuffle(DATA.teams.map(t => t.id));

  bodyEl.innerHTML = `
    <div class="slot" id="slot">
      <div class="flag" id="slotFlag">⚽</div>
      <div class="tname" id="slotName">&nbsp;</div>
    </div>`;
  const slot = $('#slot'), slotFlag = $('#slotFlag'), slotName = $('#slotName');
  const setSlot = t => { slotFlag.textContent = t.flag; slotName.textContent = t.name; };

  let pIdx = 0;
  const maxRounds = base + (rem ? 1 : 0);
  for (let round = 0; round < maxRounds; round++) {
    for (let b = 0; b < n; b++) {
      const boy = order[b];
      if (alloc[boy].length >= quota[boy]) continue;
      const picked = teamById(pool[pIdx++]);
      alloc[boy].push(picked.id);

      phase.textContent = `Pick ${pIdx} of ${T}`;
      onClock.innerHTML = `On the clock: <em>${esc(boy)}</em>`;

      if (!skipDraw) {
        slot.classList.remove('locked');
        const spins = 16;
        for (let s = 0; s < spins && !skipDraw; s++) {
          setSlot(DATA.teams[Math.floor(Math.random() * T)]);
          await sleep(38 + s * 9);
        }
        setSlot(picked);
        slot.classList.add('locked');
        await sleep(620);
      }
    }
  }

  // ---- commit ----
  DATA.draw = { completed: true, order, allocations: alloc };
  DATA.champion = null;
  DATA.teams.forEach(t => t.status = 'alive');

  phase.textContent = '';
  onClock.innerHTML = `That's the draw! <em>Good luck boys</em> ⚽`;
  if (!skipDraw) { fireConfetti(); await sleep(1400); }

  stage.classList.remove('show');
  switchView('draw');
  renderAll();
  toast('Draw complete — saving…');
  await pushData(true);
  toast(canEdit() ? 'Draw saved to GitHub ✓' : 'Draw done (local only — add a token to share)');
}

// ============================================================
//  Results board + standings
// ============================================================
function aliveTeams(ids) { return ids.filter(id => teamById(id)?.status === 'alive'); }
function championOwner() {
  if (!DATA.champion) return null;
  return Object.keys(DATA.draw.allocations).find(b => DATA.draw.allocations[b].includes(DATA.champion)) || null;
}

function boyCardHTML(boy, pos, opts = {}) {
  const ids = DATA.draw.allocations[boy] || [];
  const alive = aliveTeams(ids).length;
  const isWinner = championOwner() === boy;
  const teamsHTML = ids.map(id => {
    const t = teamById(id); if (!t) return '';
    const isChamp = DATA.champion === id;
    const cls = isChamp ? 'champ' : (t.status === 'out' ? 'out' : '');
    return `<div class="team-pill ${cls}">
      <span class="fl">${t.flag}</span>
      <span class="name">${esc(t.name)}</span>
      ${isChamp ? '👑' : ''}
      <span class="grp">${t.group}</span></div>`;
  }).join('');
  return `<div class="boy-card ${isWinner ? 'winner' : ''} ${alive === 0 && DATA.champion ? 'out' : ''}">
    <div class="bc-head">
      <span class="bc-name">${esc(boy)}</span>
      ${isWinner ? '<span class="crown">👑</span>'
        : `<span class="alive-badge ${alive === 0 ? 'zero' : ''}">${alive} alive</span>`}
    </div>
    ${pos != null ? '' : ''}
    ${teamsHTML}
  </div>`;
}

function renderBoard() {
  const wrap = $('#board');
  wrap.innerHTML = DATA.draw.order.map(b => boyCardHTML(b)).join('');
  $('#boardSub').textContent = `${DATA.draw.order.length} boys · ${DATA.teams.length} teams · whoever owns the champion wins`;
  renderWinnerBanner('#winnerBannerSlot');
}

function renderStandings() {
  const wrap = $('#standingsBoard');
  if (!DATA.draw.completed) {
    wrap.innerHTML = `<div class="empty">No draw yet. Head to <b>The Draw</b> tab to deal out the teams.</div>`;
    $('#standingsWinnerSlot').innerHTML = '';
    return;
  }
  const ranked = DATA.draw.order.slice().sort((a, b) =>
    aliveTeams(DATA.draw.allocations[b]).length - aliveTeams(DATA.draw.allocations[a]).length
  );
  wrap.innerHTML = ranked.map(b => boyCardHTML(b)).join('');
  renderWinnerBanner('#standingsWinnerSlot');
}

function renderWinnerBanner(sel) {
  const slot = $(sel);
  const owner = championOwner();
  if (!owner) { slot.innerHTML = ''; return; }
  const champ = teamById(DATA.champion);
  slot.innerHTML = `<div class="winner-banner">
    <span class="wb-trophy">🏆</span>
    <div>
      <div class="wb-label">Champions · Sweep Winner</div>
      <div class="wb-name">${esc(owner)}</div>
      <div class="wb-sub">won the pot with ${champ ? champ.flag + ' ' + esc(champ.name) : 'the champions'}</div>
    </div>
  </div>`;
}

// ============================================================
//  Teams admin
// ============================================================
function renderTeamsAdmin() {
  const wrap = $('#teamsAdmin');
  const editable = canEdit();
  $('#teamsHint').innerHTML = editable
    ? 'Tap ✕ to knock a team out, ↺ to revive it, 👑 to crown the champion. Changes save to GitHub.'
    : '🔒 Read-only. Add a GitHub token in <b>Settings</b> to record results.';

  const groups = [...new Set(DATA.teams.map(t => t.group))].sort();
  wrap.innerHTML = groups.map(g => {
    const teams = DATA.teams.filter(t => t.group === g);
    return `<div class="group-block">
      <h3>Group ${g}</h3>
      <div class="team-grid">
        ${teams.map(t => teamAdminHTML(t, editable)).join('')}
      </div></div>`;
  }).join('');

  if (editable) {
    $$('#teamsAdmin .mini').forEach(btn => btn.addEventListener('click', onTeamAction));
  }
}
function teamAdminHTML(t, editable) {
  const owner = ownerOf(t.id);
  const isChamp = DATA.champion === t.id;
  return `<div class="team-admin ${t.status === 'out' ? 'out' : ''}">
    <span class="fl">${t.flag}</span>
    <span class="nm">${esc(t.name)}</span>
    ${owner ? `<span class="owner">${esc(owner)}</span>` : ''}
    <span class="acts">
      <button class="mini ${t.status === 'out' ? '' : 'on-out'}" data-act="toggle" data-id="${t.id}" title="${t.status === 'out' ? 'Revive' : 'Knock out'}">${t.status === 'out' ? '↺' : '✕'}</button>
      <button class="mini ${isChamp ? 'on-champ' : ''}" data-act="champ" data-id="${t.id}" title="Crown champion">👑</button>
    </span>
  </div>`;
}
function ownerOf(teamId) {
  if (!DATA.draw.completed) return null;
  return Object.keys(DATA.draw.allocations).find(b => DATA.draw.allocations[b].includes(teamId)) || null;
}
async function onTeamAction(e) {
  const id = e.currentTarget.dataset.id, act = e.currentTarget.dataset.act;
  const t = teamById(id);
  if (act === 'toggle') {
    t.status = t.status === 'out' ? 'alive' : 'out';
    if (t.status === 'out' && DATA.champion === id) DATA.champion = null;
  } else if (act === 'champ') {
    if (DATA.champion === id) { DATA.champion = null; }
    else { DATA.champion = id; t.status = 'alive'; fireConfetti(); }
  }
  renderAll();
  await pushData(true);
  toast(canEdit() ? 'Saved ✓' : 'Updated locally');
}

// ============================================================
//  View routing
// ============================================================
function switchView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
}
function renderDrawTab() {
  const done = DATA.draw.completed && DATA.draw.order.length;
  $('#drawSetup').style.display   = done ? 'none' : 'block';
  $('#drawResults').style.display = done ? 'block' : 'none';
  if (done) renderBoard(); else renderBoysSetup();
}

function renderAll() {
  $('#subtitle').textContent = DATA.meta.subtitle || '';
  renderDrawTab();
  renderStandings();
  renderTeamsAdmin();
  renderSyncStatus();
}
function renderSyncStatus() {
  const dot = $('#syncDot'), label = $('#syncLabel');
  dot.className = 'dot';
  if (canEdit()) { dot.classList.add('edit'); label.textContent = 'Admin · synced'; }
  else if (CFG.owner && CFG.repo) { dot.classList.add('live'); label.textContent = 'Live · view only'; }
  else { label.textContent = 'Local only'; }
}

// ============================================================
//  Confetti (lightweight)
// ============================================================
function fireConfetti() {
  const colors = ['#c6ff3d', '#ff2e74', '#2fe3d6', '#ffce3a', '#ffffff'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    const dur = 1.8 + Math.random() * 1.6;
    c.style.transition = `transform ${dur}s linear, top ${dur}s linear, opacity ${dur}s`;
    document.body.appendChild(c);
    requestAnimationFrame(() => {
      c.style.top = (90 + Math.random() * 10) + 'vh';
      c.style.transform = `translateX(${(Math.random() - 0.5) * 240}px) rotate(${Math.random() * 720}deg)`;
      c.style.opacity = '0';
    });
    setTimeout(() => c.remove(), dur * 1000 + 200);
  }
}

// ============================================================
//  Toast
// ============================================================
let toastT;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 3200);
}

// ============================================================
//  Settings wiring
// ============================================================
function fillCfgInputs() {
  $('#cfgOwner').value  = CFG.owner;
  $('#cfgRepo').value   = CFG.repo;
  $('#cfgBranch').value = CFG.branch;
  $('#cfgPath').value   = CFG.path;
  $('#cfgToken').value  = CFG.token;
}
function readCfgInputs() {
  CFG.owner  = $('#cfgOwner').value.trim();
  CFG.repo   = $('#cfgRepo').value.trim();
  CFG.branch = $('#cfgBranch').value.trim() || 'main';
  CFG.path   = $('#cfgPath').value.trim() || 'data.json';
  CFG.token  = $('#cfgToken').value.trim();
}

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ============================================================
//  Init
// ============================================================
async function init() {
  loadCfg();
  fillCfgInputs();
  await loadData();
  renderAll();

  // tabs
  $$('nav.tabs button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  // draw setup
  $('#addBoy').addEventListener('click', addBoy);
  $('#runDraw').addEventListener('click', runDraw);
  $('#redraw').addEventListener('click', () => {
    if (!confirm('Re-run the draw? This wipes the current allocations and any results.')) return;
    DATA.boys = DATA.draw.order.length ? DATA.draw.order.slice() : DATA.boys;
    DATA.draw = { completed: false, order: [], allocations: {} };
    DATA.champion = null;
    DATA.teams.forEach(t => t.status = 'alive');
    renderDrawTab();
    switchView('draw');
  });
  $('#stageSkip').addEventListener('click', () => { skipDraw = true; });

  // settings
  $('#cfgSave').addEventListener('click', () => { readCfgInputs(); saveCfg(); renderAll(); toast('Config saved'); $('#cfgStatus').textContent = 'Config saved to this browser.'; });
  $('#cfgPull').addEventListener('click', async () => { readCfgInputs(); saveCfg(); $('#cfgStatus').textContent = 'Loading…'; await loadData(); renderAll(); toast('Loaded from GitHub'); $('#cfgStatus').textContent = 'Loaded latest data from GitHub.'; });
  $('#cfgPush').addEventListener('click', async () => { readCfgInputs(); saveCfg(); const ok = await pushData(false); $('#cfgStatus').textContent = ok ? 'Pushed to GitHub.' : 'Push failed — check token & repo.'; });

  // backup
  $('#exportJson').addEventListener('click', () => {
    const out = JSON.parse(JSON.stringify(DATA)); delete out.__sha;
    download('world-cup-sweep.json', JSON.stringify(out, null, 2));
  });
  $('#importJsonBtn').addEventListener('click', () => $('#importJson').click());
  $('#importJson').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { DATA = normalise(JSON.parse(rd.result)); renderAll(); switchView('draw'); toast('Imported'); } catch { toast('Invalid JSON file', true); } };
    rd.readAsText(f);
  });

  // danger
  $('#resetDraw').addEventListener('click', async () => {
    if (!confirm('Reset the draw? Keeps the boys and teams, clears allocations and results.')) return;
    DATA.draw = { completed: false, order: [], allocations: {} };
    DATA.champion = null;
    DATA.teams.forEach(t => t.status = 'alive');
    renderAll(); switchView('draw'); await pushData(true); toast('Draw reset');
  });
  $('#resetAll').addEventListener('click', async () => {
    if (!confirm('Wipe everything back to a fresh tournament (teams stay, all teams alive, boys cleared)?')) return;
    DATA.boys = []; DATA.draw = { completed: false, order: [], allocations: {} };
    DATA.champion = null; DATA.teams.forEach(t => t.status = 'alive');
    renderAll(); switchView('draw'); await pushData(true); toast('Wiped');
  });
}

document.addEventListener('DOMContentLoaded', init);
