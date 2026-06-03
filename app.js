/* ============================================================
   World Cup '26 Sweep
   Vanilla JS. Data lives in data.json, synced to GitHub via PAT.
   ============================================================ */

const CFG_KEY = 'wcs_config';
const HOUSE = '40th Trip';   // leftover teams (the pot) go here
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
// This site's own repo — pre-filled so the admin only has to paste a token.
const DEFAULT_REPO = { owner: 'danielf-neara', repo: 'world-cup-sweep', branch: 'main', path: 'data.json' };
function loadCfg() {
  try { CFG = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }
  catch { CFG = {}; }
  CFG.owner  = CFG.owner  || DEFAULT_REPO.owner;
  CFG.repo   = CFG.repo   || DEFAULT_REPO.repo;
  CFG.branch = CFG.branch || DEFAULT_REPO.branch;
  CFG.path   = CFG.path   || DEFAULT_REPO.path;
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

function splitCounts(nBoys) {
  const T = DATA.teams.length;
  const per = Math.floor(T / nBoys);
  return { per, rem: T - per * nBoys, T };
}
function splitText(nBoys) {
  if (nBoys <= 0) return '';
  const { per, rem, T } = splitCounts(nBoys);
  const base = `${nBoys} boys → <b>${per} teams each</b>`;
  return rem === 0
    ? `${base} (${T} total, nothing spare)`
    : `${base} · <b>40th Trip gets ${rem}</b> (${T} total)`;
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
  $('#drawOrderBtn').disabled = n < 2 || dupes.size > 0;
}

// ============================================================
//  THE DRAW (animated)
// ============================================================
// ---- Draw 1 of 2: the running order ----
async function drawOrder() {
  const boys = cleanBoys();
  if (boys.length < 2) return;
  DATA.boys = boys;
  skipDraw = false;

  const stage = $('#stage');
  stage.classList.add('show');
  const phase = $('#stagePhase'), onClock = $('#stageOnClock'), bodyEl = $('#stageBody');

  const order = shuffle(boys);
  phase.textContent = 'Draw 1 of 2 · Shuffling the order';
  onClock.innerHTML = '';
  bodyEl.innerHTML = `<div class="order-reveal" id="orderReveal"></div>`;
  const orWrap = $('#orderReveal');

  if (!skipDraw) {
    for (let s = 0; s < 14 && !skipDraw; s++) {
      const r = shuffle(boys);
      orWrap.innerHTML = r.map((b, i) => `<div class="oi in" style="animation:none; opacity:1; transform:none;"><span class="pos">${i + 1}</span>${esc(b)}</div>`).join('');
      await sleep(70 + s * 14);
    }
  }
  orWrap.innerHTML = order.map((b, i) =>
    `<div class="oi" style="animation-delay:${i * 90}ms"><span class="pos">${i + 1}</span>${esc(b)}</div>`).join('');
  $$('#orderReveal .oi').forEach(el => el.classList.add('in'));
  await sleep(skipDraw ? 0 : order.length * 90 + 800);

  // order locked, teams still to come
  DATA.draw = { completed: false, order, allocations: {} };
  DATA.champion = null;
  DATA.teams.forEach(t => t.status = 'alive');

  onClock.innerHTML = `Order locked! <em>Teams next…</em>`;
  if (!skipDraw) await sleep(1100);

  stage.classList.remove('show');
  switchView('draw');
  renderAll();
  toast('Order drawn — saving…');
  await pushData(true);
  toast(canEdit() ? 'Order saved ✓ — now draw the teams' : 'Order set (local only)');
}

// ---- Draw 2 of 2: the team allocation ----
async function drawTeams() {
  const order = (DATA.draw && DATA.draw.order) || [];
  if (order.length < 2) return;
  skipDraw = false;

  const stage = $('#stage');
  stage.classList.add('show');
  const phase = $('#stagePhase'), onClock = $('#stageOnClock'), bodyEl = $('#stageBody');

  const T = DATA.teams.length, n = order.length;
  const per = Math.floor(T / n), rem = T - per * n;   // equal per boy, rest to 40th Trip
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
  const spin = async (picked, who) => {
    phase.textContent = `Draw 2 of 2 · Pick ${pIdx} of ${T}`;
    onClock.innerHTML = `On the clock: <em>${esc(who)}</em>`;
    if (skipDraw) return;
    slot.classList.remove('locked');
    for (let s = 0; s < 16 && !skipDraw; s++) {
      setSlot(DATA.teams[Math.floor(Math.random() * T)]);
      await sleep(38 + s * 9);
    }
    setSlot(picked);
    slot.classList.add('locked');
    await sleep(620);
  };

  // equal share to each boy, in the drawn order
  for (let round = 0; round < per; round++) {
    for (const boy of order) {
      const picked = teamById(pool[pIdx++]);
      alloc[boy].push(picked.id);
      await spin(picked, boy);
    }
  }
  // leftovers to 40th Trip
  if (rem > 0) {
    alloc[HOUSE] = [];
    for (let k = 0; k < rem; k++) {
      const picked = teamById(pool[pIdx++]);
      alloc[HOUSE].push(picked.id);
      await spin(picked, `${HOUSE} 🏖️`);
    }
  }

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
// everyone holding teams: the boys in drawn order, then 40th Trip if it has any
function participants() {
  const list = (DATA.draw.order || []).slice();
  if (((DATA.draw.allocations || {})[HOUSE] || []).length) list.push(HOUSE);
  return list;
}

function boyCardHTML(boy, pos, opts = {}) {
  const ids = DATA.draw.allocations[boy] || [];
  const alive = aliveTeams(ids).length;
  const isWinner = championOwner() === boy;
  const isHouse = boy === HOUSE;
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
  return `<div class="boy-card ${isWinner ? 'winner' : ''} ${isHouse ? 'house' : ''} ${alive === 0 && DATA.champion ? 'out' : ''}">
    <div class="bc-head">
      <span class="bc-name">${isHouse ? '🏖️ ' : ''}${esc(boy)}${isHouse ? '<span class="house-sub">the pot</span>' : ''}</span>
      ${isWinner ? '<span class="crown">👑</span>'
        : `<span class="alive-badge ${alive === 0 ? 'zero' : ''}">${alive} alive</span>`}
    </div>
    ${teamsHTML}
  </div>`;
}

function renderBoard() {
  const wrap = $('#board');
  if (!(DATA.draw.completed && DATA.draw.order.length)) {
    wrap.innerHTML = `<div class="empty">⚽ The draw hasn't been done yet — check back soon.</div>`;
    $('#boardSub').textContent = '';
    $('#winnerBannerSlot').innerHTML = '';
    return;
  }
  wrap.innerHTML = participants().map(b => boyCardHTML(b)).join('');
  const houseN = (DATA.draw.allocations[HOUSE] || []).length;
  $('#boardSub').textContent =
    `${DATA.draw.order.length} boys · ${DATA.teams.length} teams${houseN ? ` · ${houseN} to 40th Trip` : ''} · whoever owns the champion wins`;
  renderWinnerBanner('#winnerBannerSlot');
}

function renderStandings() {
  const wrap = $('#standingsBoard');
  if (!DATA.draw.completed) {
    wrap.innerHTML = `<div class="empty">No draw yet. Head to <b>The Draw</b> tab to deal out the teams.</div>`;
    $('#standingsWinnerSlot').innerHTML = '';
    return;
  }
  const ranked = participants().sort((a, b) =>
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
    ${editable ? `<span class="acts">
      <button class="mini ${t.status === 'out' ? '' : 'on-out'}" data-act="toggle" data-id="${t.id}" title="${t.status === 'out' ? 'Revive' : 'Knock out'}">${t.status === 'out' ? '↺' : '✕'}</button>
      <button class="mini ${isChamp ? 'on-champ' : ''}" data-act="champ" data-id="${t.id}" title="Crown champion">👑</button>
    </span>` : (isChamp ? '<span class="crown">👑</span>' : t.status === 'out' ? '<span class="owner" style="color:var(--magenta)">OUT</span>' : '')}
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
//  Schedule · Groups · Knockout
// ============================================================
const schedule = () => Array.isArray(DATA.schedule) ? DATA.schedule : [];

function boyColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 72% 62%)`;
}
function ownerTag(teamId) {
  const o = ownerOf(teamId);
  if (!o) return '';
  return `<span class="otag" style="--oc:${boyColor(o)}" title="${esc(o)}">${esc(o)}</span>`;
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
function prettyRef(r) {
  if (!r) return 'TBD';
  if (/^1[A-L]$/.test(r)) return 'Winner Grp ' + r[1];
  if (/^2[A-L]$/.test(r)) return 'Runner-up Grp ' + r[1];
  if (/^3/.test(r))       return '3rd: ' + r.slice(1);
  if (/^W\d+/.test(r))    return 'Winner M' + r.slice(1);
  if (/^L\d+/.test(r))    return 'Loser M' + r.slice(1);
  return r;
}

// ---- group standings ----
function computeGroup(letter) {
  const row = {};
  DATA.teams.filter(t => t.group === letter)
    .forEach(t => row[t.id] = { id: t.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
  schedule()
    .filter(m => m.stage === 'group' && m.group === letter && m.status === 'finished' && m.t1 && m.t2 && m.s1 != null)
    .forEach(m => {
      const a = row[m.t1], b = row[m.t2]; if (!a || !b) return;
      a.p++; b.p++; a.gf += m.s1; a.ga += m.s2; b.gf += m.s2; b.ga += m.s1;
      if (m.s1 > m.s2) { a.w++; b.l++; a.pts += 3; }
      else if (m.s1 < m.s2) { b.w++; a.l++; b.pts += 3; }
      else { a.d++; b.d++; a.pts++; b.pts++; }
    });
  Object.values(row).forEach(r => r.gd = r.gf - r.ga);
  return Object.values(row).sort((x, y) =>
    y.pts - x.pts || y.gd - x.gd || y.gf - x.gf ||
    teamById(x.id).name.localeCompare(teamById(y.id).name));
}

function renderGroups() {
  const grid = $('#groupsGrid'); if (!grid) return;
  const groups = [...new Set(DATA.teams.map(t => t.group))].sort();
  const gm = schedule().filter(m => m.stage === 'group');
  const played = gm.filter(m => m.status === 'finished').length;
  $('#groupsProgress').innerHTML = `<b>${played}</b> / ${gm.length} played`;
  grid.className = 'groups-grid';
  grid.innerHTML = groups.map(groupCardHTML).join('');
}
function groupCardHTML(g) {
  const rows = computeGroup(g);
  const trs = rows.map((r, i) => {
    const t = teamById(r.id);
    const qual = i < 2 ? 'qual' : (i === 2 ? 'third' : '');
    const dead = t.status === 'out' ? 'dead' : '';
    return `<tr class="${qual} ${dead}">
      <td class="pos">${i + 1}</td>
      <td class="tm"><span class="fl">${t.flag}</span><span class="nm">${esc(t.name)}</span>${ownerTag(t.id)}</td>
      <td>${r.p}</td><td class="hs">${r.w}</td><td class="hs">${r.d}</td><td class="hs">${r.l}</td>
      <td class="hs">${r.gf}</td><td class="hs">${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td></tr>`;
  }).join('');
  const fx = schedule().filter(m => m.stage === 'group' && m.group === g).map(fixtureRowHTML).join('');
  return `<div class="group-card">
    <h3>Group ${g}</h3>
    <table class="standings-tbl">
      <thead><tr><th></th><th></th><th>P</th><th class="hs">W</th><th class="hs">D</th><th class="hs">L</th><th class="hs">GF</th><th class="hs">GA</th><th>GD</th><th>Pts</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
    <details class="fixtures"><summary>Fixtures (${schedule().filter(m => m.stage === 'group' && m.group === g).length})</summary>${fx}</details>
  </div>`;
}
function sideLabel(m, s) {
  const id = m['t' + s];
  if (id) { const t = teamById(id); return `<span class="fl">${t.flag}</span> ${esc(t.name)}`; }
  return `<span class="ref">${esc(prettyRef(m['ref' + s]))}</span>`;
}
function pen(m) { return m.p1 != null ? ` <span class="kp">(pens ${m.p1}-${m.p2})</span>` : ''; }
function fixtureRowHTML(m) {
  const mid = m.status === 'finished'
    ? `<b>${m.s1}-${m.s2}</b>${pen(m)}`
    : `<span class="v">v</span>`;
  return `<div class="fx"><span class="fxd">${fmtDate(m.date)}</span>
    <span class="fa">${sideLabel(m, '1')}</span><span class="fm">${mid}</span><span class="fb">${sideLabel(m, '2')}</span></div>`;
}

// ---- knockout bracket ----
function knockoutWinnerId(m) {
  if (m.status !== 'finished' || !m.t1 || !m.t2) return null;
  let a = m.s1, b = m.s2;
  if (m.p1 != null && a === b) { a = m.p1; b = m.p2; }
  if (a === b) return null;
  return a > b ? m.t1 : m.t2;
}
function bracketOrder() {
  const by = {}; schedule().forEach(m => by[m.num] = m);
  const order = { R32: [], R16: [], QF: [], SF: [], F: [] };
  const kids = m => [m.ref1, m.ref2].filter(r => r && /^W\d+/.test(r)).map(r => +r.slice(1));
  const seen = new Set();
  (function visit(num) {
    const m = by[num]; if (!m || seen.has(num)) return; seen.add(num);
    kids(m).forEach(visit);
    if (order[m.stage]) order[m.stage].push(num);
  })((schedule().find(m => m.stage === 'F') || {}).num);
  // fallback for any round the tree-walk missed
  ['R32', 'R16', 'QF', 'SF', 'F'].forEach(st => {
    if (!order[st].length)
      order[st] = schedule().filter(m => m.stage === st).sort((a, b) => a.num - b.num).map(m => m.num);
  });
  return { order, by };
}
function renderKnockout() {
  const wrap = $('#bracket'); if (!wrap) return;
  const { order, by } = bracketOrder();
  const ko = schedule().filter(m => ['R32', 'R16', 'QF', 'SF', 'F'].includes(m.stage));
  const played = ko.filter(m => m.status === 'finished').length;
  $('#knockoutProgress').innerHTML = `<b>${played}</b> / ${ko.length} ties played`;
  const cols = [['R32', 'Round of 32'], ['R16', 'Round of 16'], ['QF', 'Quarter-finals'], ['SF', 'Semi-finals'], ['F', 'Final']];
  wrap.innerHTML = cols.map(([st, label]) =>
    `<div class="bcol">
       <div class="bcol-h">${label}</div>
       <div class="bcol-body">${(order[st] || []).map(n => koMatchHTML(by[n])).join('')}</div>
     </div>`).join('');
  const tp = schedule().find(m => m.stage === '3P');
  $('#thirdPlaceSlot').innerHTML = tp
    ? `<div class="panel third-place"><h3>Third-place play-off</h3>${koMatchHTML(tp, true)}</div>` : '';
}
function koMatchHTML(m, flat) {
  if (!m) return '';
  const w = knockoutWinnerId(m);
  const champ = m.stage === 'F' && w;
  return `<div class="ko ${flat ? 'ko-flat' : ''}">
    ${koSideHTML(m, '1', w, champ)}
    ${koSideHTML(m, '2', w, champ)}
    <span class="ko-num">M${m.num} · ${fmtDate(m.date)}</span>
  </div>`;
}
function koSideHTML(m, s, w, champ) {
  const id = m['t' + s];
  const isW = id && id === w;
  const score = m.status === 'finished' ? (s === '1' ? m.s1 : m.s2) : '';
  const penTxt = m.p1 != null ? ` <span class="kp">(${s === '1' ? m.p1 : m.p2})</span>` : '';
  let inner;
  if (id) { const t = teamById(id); inner = `<span class="fl">${t.flag}</span><span class="nm">${esc(t.name)}</span>${ownerTag(id)}`; }
  else inner = `<span class="ref">${esc(prettyRef(m['ref' + s]))}</span>`;
  return `<div class="ko-side ${isW ? 'win' : ''} ${id && w && !isW ? 'lose' : ''}">
    <span class="ko-team">${inner}${isW && champ ? ' <span class="kc">👑</span>' : ''}</span>
    <span class="ko-score">${score}${score !== '' ? penTxt : ''}</span>
  </div>`;
}

// ============================================================
//  View routing
// ============================================================
function switchView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
}
function drawPhase() {
  if (DATA.draw.completed && DATA.draw.order.length) return 'done';
  if ((DATA.draw.order || []).length) return 'ordered';   // order drawn, teams pending
  return 'setup';
}
function renderDrawTab() {
  const phase = drawPhase();
  const admin = canEdit();
  // Admin drives the two-step setup; everyone else just sees the board
  // (with a friendly "not done yet" message until the teams are drawn).
  const showSetup = admin && phase !== 'done';
  $('#drawSetup').style.display   = showSetup ? 'block' : 'none';
  $('#drawResults').style.display = showSetup ? 'none' : 'block';
  if (!showSetup) { renderBoard(); return; }

  const ordered = phase === 'ordered';
  $('#setupEntry').style.display   = ordered ? 'none' : 'block';
  $('#setupOrdered').style.display = ordered ? 'block' : 'none';
  if (ordered) {
    const { per, rem } = splitCounts(DATA.draw.order.length);
    $('#orderedHint').innerHTML =
      `This is the running order. Each boy gets <b>${per} teams</b>${rem ? ` and <b>40th Trip</b> gets the spare <b>${rem}</b>` : ''}. Now deal them out.`;
    $('#orderLocked').innerHTML = DATA.draw.order
      .map(b => `<li><span class="ol-pos"></span>${esc(b)}</li>`).join('');
  } else {
    renderBoysSetup();
  }
}

function renderAll() {
  document.body.classList.toggle('spectator', !canEdit());
  $('#subtitle').textContent = DATA.meta.subtitle || '';
  renderDrawTab();
  renderGroups();
  renderKnockout();
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

  // draw setup — two steps: draw the order, then draw the teams
  $('#addBoy').addEventListener('click', addBoy);
  $('#drawOrderBtn').addEventListener('click', drawOrder);
  $('#drawTeamsBtn').addEventListener('click', drawTeams);
  $('#editBoysBtn').addEventListener('click', () => {
    // back to the entry step, keeping the names so they can tweak and redraw the order
    DATA.boys = DATA.draw.order.length ? DATA.draw.order.slice() : DATA.boys;
    DATA.draw = { completed: false, order: [], allocations: {} };
    DATA.champion = null;
    DATA.teams.forEach(t => t.status = 'alive');
    renderDrawTab();
  });
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
