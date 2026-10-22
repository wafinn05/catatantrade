'use strict';

const KEY = 'jurnaltrade.v1';
const VERSION = '1.2';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const r2 = n => Math.round(n * 100) / 100;
const num = s => parseFloat(String(s ?? '').trim().replace(',', '.'));
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const fmt = n => nf.format(r2(n));
const sgn = n => (r2(n) > 0 ? '+' : r2(n) < 0 ? '−' : '') + nf.format(Math.abs(r2(n)));
const cls = n => (r2(n) > 0 ? 'pos' : r2(n) < 0 ? 'neg' : '');
const pct = n => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n) + '%';
const inp = n => String(r2(n)).replace('.', ',');
const BASE_LOT = 0.01;
const r3 = n => Math.round(n * 1000) / 1000;
const lotf = n => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(n);
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const dShort = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const dFull = s => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  edit: svg('<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  down: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  up: svg('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
  file: svg('<path d="M14 3H6v18h12V7Z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>'),
  phone: svg('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>'),
};

/* ---------- state ---------- */
function fresh() {
  const p = { id: uid(), name: 'Bulan 1', weeks: 4 };
  return { v: 1, rate: 0.1, periods: [p], current: p.id, trades: [], lastSide: 'Buy', lastLot: BASE_LOT };
}

// rate = USD per pip untuk lot 0,01
const usdFor = (pip, lot, rate = state.rate) => pip * rate * (lot / BASE_LOT);

function normalize(d) {
  if (!d || !Array.isArray(d.periods) || !Array.isArray(d.trades) || !d.periods.length) throw new Error('Format salah');
  const rate = num(d.rate) > 0 ? num(d.rate) : 0.1;
  const periods = d.periods.map(p => ({ id: String(p.id || uid()), name: String(p.name || 'Bulan'), weeks: Math.max(1, Math.floor(+p.weeks) || 4) }));
  const ids = new Set(periods.map(p => p.id));
  const trades = d.trades
    .filter(t => ids.has(String(t.periodId)))
    .map((t, i) => {
      const result = t.result === 'SL' ? 'SL' : 'TP';
      const pip = Math.abs(num(t.pip)) || 0;
      const lot = r3(Math.abs(num(t.lot))) || BASE_LOT;
      let usd = num(t.usd);
      if (!isFinite(usd)) usd = usdFor(pip, lot, rate);
      return {
        id: String(t.id || uid() + i),
        periodId: String(t.periodId),
        week: Math.max(1, Math.floor(+t.week) || 1),
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : today(),
        side: t.side === 'Sell' ? 'Sell' : 'Buy',
        result,
        pip: r2(pip),
        lot,
        usd: r2(Math.abs(usd) * (result === 'TP' ? 1 : -1)),
        note: String(t.note || ''),
        created: Number.isFinite(+t.created) ? +t.created : i,
      };
    });
  return {
    v: 1,
    rate,
    periods,
    trades,
    current: ids.has(d.current) ? d.current : periods[0].id,
    lastSide: d.lastSide === 'Sell' ? 'Sell' : 'Buy',
    lastLot: r3(Math.abs(num(d.lastLot))) || BASE_LOT,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* fall through */ }
  return fresh();
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

let state = load();
const view = { week: 0 }; // 0 = semua minggu

const cur = () => state.periods.find(p => p.id === state.current) || state.periods[0];
const tradesOf = pid => state.trades.filter(t => t.periodId === pid);
const weekCount = p => Math.max(p.weeks, ...tradesOf(p.id).map(t => t.week));
const lastWeek = p => Math.max(1, ...tradesOf(p.id).map(t => t.week));
const sorted = list => [...list].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);

function stats(list) {
  const tp = list.filter(t => t.result === 'TP').length;
  return {
    n: list.length,
    tp,
    sl: list.length - tp,
    usd: list.reduce((a, t) => a + t.usd, 0),
    pip: list.reduce((a, t) => a + (t.result === 'TP' ? t.pip : -t.pip), 0),
    wr: list.length ? (tp / list.length) * 100 : 0,
  };
}

/* ---------- render ---------- */
const tabsEl = $('#tabs');
const listEl = $('#list');

function rowsHtml(list) {
  return sorted(list)
    .map((t, i) => ({ t, no: i + 1 }))
    .reverse()
    .map(({ t, no }) => `
      <button class="row" data-id="${t.id}">
        <span class="no">${no}</span>
        <span class="badge ${t.result.toLowerCase()}">${t.result}</span>
        <span class="mid"><b>${t.side} <em>${lotf(t.lot)}</em></b><small>${dShort(t.date)}${t.note ? ' · ' + esc(t.note) : ''}</small></span>
        <span class="right"><b class="${cls(t.usd)}">${sgn(t.usd)}</b><small>${fmt(t.pip)} pip</small></span>
      </button>`)
    .join('');
}

function render() {
  const p = cur();
  const all = tradesOf(p.id);
  const wc = weekCount(p);
  if (view.week > wc) view.week = 0;

  $('#periodName').textContent = p.name;

  const shown = view.week ? all.filter(t => t.week === view.week) : all;
  const s = stats(shown);
  $('#sScope').textContent = view.week ? `Minggu ${view.week}` : 'Total bulan';
  const total = $('#sTotal');
  total.textContent = sgn(s.usd);
  total.className = 'total ' + cls(s.usd);
  $('#sWr').textContent = s.n ? pct(s.wr) : '–';
  $('#sCount').textContent = s.n;
  $('#sTpSl').innerHTML = `<span class="pos">${s.tp}</span>/<span class="neg">${s.sl}</span>`;
  const pip = $('#sPip');
  pip.textContent = sgn(s.pip);
  pip.className = cls(s.pip);

  let tabs = `<button class="tab ${view.week === 0 ? 'on' : ''}" data-w="0">Semua</button>`;
  for (let i = 1; i <= wc; i++) tabs += `<button class="tab ${view.week === i ? 'on' : ''}" data-w="${i}">Minggu ${i}</button>`;
  tabs += `<button class="tab add" data-add aria-label="Tambah minggu">${I.plus}</button>`;
  tabsEl.innerHTML = tabs;
  const on = $('.tab.on', tabsEl);
  if (on) tabsEl.scrollLeft = on.offsetLeft - tabsEl.clientWidth / 2 + on.clientWidth / 2;

  let html = '';
  if (view.week) {
    if (shown.length) html = `<div class="card">${rowsHtml(shown)}</div>`;
  } else {
    for (let w = wc; w >= 1; w--) {
      const wl = all.filter(t => t.week === w);
      if (!wl.length) continue;
      const ws = stats(wl);
      html += `<button class="ghead" data-w="${w}"><span>Minggu ${w}</span><span><b class="${cls(ws.usd)}">${sgn(ws.usd)}</b> · ${pct(ws.wr)}</span></button>
        <div class="card">${rowsHtml(wl)}</div>`;
    }
  }
  if (!html) {
    html = `<div class="empty"><span>Belum ada trade</span>${
      state.trades.length ? '' : '<button class="link" data-seed>Muat data spreadsheet</button>'}</div>`;
  }
  listEl.innerHTML = html;
}

/* ---------- bottom sheet ---------- */
const sheet = $('#sheet');
const backdrop = $('#backdrop');
let sheetOpen = false;

const head = title => `<div class="shead"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Tutup">${I.x}</button></div>`;

function openSheet(html, mount) {
  const body = document.createElement('div');
  body.innerHTML = html;
  if (mount) mount(body);
  sheet.replaceChildren(body);
  sheet.scrollTop = 0;
  backdrop.classList.add('show');
  sheet.classList.add('show');
  document.body.classList.add('lock');
  if (!sheetOpen) {
    sheetOpen = true;
    history.pushState({ sheet: 1 }, '');
  }
}
function hideSheet() {
  sheetOpen = false;
  backdrop.classList.remove('show');
  sheet.classList.remove('show');
  document.body.classList.remove('lock');
}
function closeSheet() { if (sheetOpen) history.back(); }

addEventListener('popstate', () => {
  if (sheetOpen) hideSheet();
  else if (statsOpen) hideStats();
});
backdrop.addEventListener('click', closeSheet);
sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------- trade form ---------- */
function openTrade(t) {
  const p = cur();
  const wc = weekCount(p);
  const isNew = !t;
  const d = t || { date: today(), side: state.lastSide, result: 'TP', note: '', week: view.week || lastWeek(p) };
  const opts = Array.from({ length: wc + 1 }, (_, i) => i + 1)
    .map(w => `<option value="${w}" ${w === d.week ? 'selected' : ''}>Minggu ${w}</option>`).join('');

  openSheet(`${head(isNew ? 'Trade baru' : 'Edit trade')}
    <form class="stack" novalidate autocomplete="off">
      <div class="seg" data-name="side">
        <button type="button" data-v="Buy">Buy</button><button type="button" data-v="Sell">Sell</button>
      </div>
      <div class="seg res" data-name="result">
        <button type="button" data-v="TP">TP</button><button type="button" data-v="SL">SL</button>
      </div>
      <div class="grid3">
        <label class="field"><span>Lot</span>
          <input name="lot" inputmode="decimal" placeholder="0,01" value="${String(t ? t.lot : state.lastLot).replace('.', ',')}"></label>
        <label class="field"><span>Pip</span>
          <input name="pip" inputmode="decimal" placeholder="0" value="${t ? inp(t.pip) : ''}"></label>
        <label class="field"><span>USD</span>
          <span class="usd"><i class="sign"></i><input name="usd" inputmode="decimal" placeholder="0" value="${t ? inp(Math.abs(t.usd)) : ''}"></span></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Tanggal</span><input type="date" name="date" value="${d.date}"></label>
        <label class="field"><span>Minggu</span><select name="week">${opts}</select></label>
      </div>
      <label class="field"><span>Catatan</span>
        <input name="note" placeholder="Opsional" enterkeyhint="done" value="${esc(d.note)}"></label>
      <button class="primary" type="submit">Simpan</button>
      ${isNew ? '' : '<button type="button" class="danger" data-del>Hapus trade</button>'}
    </form>`, el => {
    const f = $('form', el);
    const pipI = f.elements.pip;
    const usdI = f.elements.usd;
    const lotI = f.elements.lot;
    const sign = $('.sign', el);
    let side = d.side;
    let result = d.result;
    let touched = !isNew && r2(Math.abs(t.usd)) !== r2(usdFor(t.pip, t.lot));

    const paint = () => {
      el.querySelectorAll('.seg').forEach(g => {
        const v = g.dataset.name === 'side' ? side : result;
        g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
      });
      sign.textContent = result === 'TP' ? '+' : '−';
      sign.className = 'sign ' + (result === 'TP' ? 'pos' : 'neg');
    };
    const auto = () => {
      if (touched) return;
      const v = num(pipI.value);
      const lot = num(lotI.value);
      usdI.value = v > 0 && lot > 0 ? inp(usdFor(v, lot)) : '';
    };
    paint();

    el.addEventListener('click', e => {
      const b = e.target.closest('.seg [data-v]');
      if (!b) return;
      if (b.parentElement.dataset.name === 'side') side = b.dataset.v;
      else result = b.dataset.v;
      paint();
    });
    pipI.addEventListener('input', () => { pipI.classList.remove('err'); auto(); });
    lotI.addEventListener('input', () => { lotI.classList.remove('err'); auto(); });
    usdI.addEventListener('input', () => { touched = usdI.value.trim() !== ''; if (!touched) auto(); });

    f.addEventListener('submit', e => {
      e.preventDefault();
      const pip = num(pipI.value);
      const lot = r3(num(lotI.value));
      if (!(lot > 0)) { lotI.classList.add('err'); lotI.focus(); return; }
      if (!(pip > 0)) { pipI.classList.add('err'); pipI.focus(); return; }
      let usd = num(usdI.value);
      if (!isFinite(usd)) usd = usdFor(pip, lot);
      const week = +f.elements.week.value;
      if (week > p.weeks) p.weeks = week;
      const rec = {
        ...(t || { id: uid(), periodId: p.id, created: Date.now() }),
        date: f.elements.date.value || today(),
        side,
        result,
        pip: r2(pip),
        lot,
        usd: r2(Math.abs(usd) * (result === 'TP' ? 1 : -1)),
        week,
        note: f.elements.note.value.trim(),
      };
      if (t) state.trades[state.trades.findIndex(x => x.id === t.id)] = rec;
      else state.trades.push(rec);
      state.lastSide = side;
      state.lastLot = lot;
      save();
      closeSheet();
      render();
      toast(isNew ? 'Trade ditambahkan' : 'Tersimpan');
    });

    const del = $('[data-del]', el);
    if (del) del.addEventListener('click', () => {
      if (!confirm('Hapus trade ini?')) return;
      state.trades = state.trades.filter(x => x.id !== t.id);
      save();
      closeSheet();
      render();
      toast('Trade dihapus');
    });
  });
}

/* ---------- bulan ---------- */
function openPeriods() {
  const rows = state.periods.map(p => {
    const s = stats(tradesOf(p.id));
    return `<div class="prow ${p.id === state.current ? 'on' : ''}">
      <button class="psel" data-sel="${p.id}"><b>${esc(p.name)}</b>
        <small><span class="${cls(s.usd)}">${sgn(s.usd)}</span> · ${s.n} trade · ${s.n ? pct(s.wr) : '–'}</small></button>
      <button class="icon-btn" data-ren="${p.id}" aria-label="Ganti nama">${I.edit}</button>
      <button class="icon-btn" data-del="${p.id}" aria-label="Hapus">${I.trash}</button>
    </div>`;
  }).join('');

  openSheet(`${head('Bulan')}<div class="plist">${rows}</div>
    <button class="secondary" data-new>${I.plus} Bulan baru</button>`, el => {
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const { sel, ren, del } = b.dataset;
      if (sel) {
        state.current = sel;
        view.week = 0;
        save();
        closeSheet();
        render();
      } else if (ren) {
        const p = state.periods.find(x => x.id === ren);
        const n = prompt('Nama bulan', p.name);
        if (n && n.trim()) { p.name = n.trim(); save(); render(); openPeriods(); }
      } else if (del) {
        if (state.periods.length === 1) return toast('Minimal satu bulan');
        const p = state.periods.find(x => x.id === del);
        const c = tradesOf(p.id).length;
        if (!confirm(`Hapus ${p.name}${c ? ` beserta ${c} trade` : ''}?`)) return;
        state.periods = state.periods.filter(x => x.id !== del);
        state.trades = state.trades.filter(x => x.periodId !== del);
        if (state.current === del) { state.current = state.periods[0].id; view.week = 0; }
        save();
        render();
        openPeriods();
      } else if ('new' in b.dataset) {
        const used = state.periods.map(x => +(/^Bulan (\d+)$/.exec(x.name) || [])[1] || 0);
        const p = { id: uid(), name: `Bulan ${Math.max(0, ...used) + 1}`, weeks: 4 };
        state.periods.push(p);
        state.current = p.id;
        view.week = 0;
        save();
        closeSheet();
        render();
      }
    });
  });
}

/* ---------- pengaturan ---------- */
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
addEventListener('appinstalled', () => { installEvt = null; });

async function shareOrDownload(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function toCsv() {
  const rows = [['Bulan', 'Minggu', 'No', 'Tanggal', 'Entry', 'Lot', 'TP/SL', 'Pip', 'USD', 'Catatan']];
  for (const p of state.periods) {
    for (let w = 1; w <= weekCount(p); w++) {
      sorted(tradesOf(p.id).filter(t => t.week === w)).forEach((t, i) =>
        rows.push([p.name, w, i + 1, dFull(t.date), t.side, t.lot, t.result, t.pip, t.usd, t.note]));
    }
  }
  const q = c => (/[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c);
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\n');
}

function replaceData(d) {
  state = normalize(d);
  view.week = 0;
  save();
  render();
}

function openSettings() {
  openSheet(`${head('Pengaturan')}
    <div class="stack">
      <button class="secondary" data-act="stats">${I.chart} Statistik</button>
      ${installEvt ? `<button class="secondary" data-act="install">${I.phone} Instal aplikasi</button>` : ''}
      <div class="grid2">
        <button class="secondary" data-act="backup">${I.down} Backup</button>
        <button class="secondary" data-act="restore">${I.up} Restore</button>
      </div>
      <button class="secondary" data-act="csv">${I.file} Export CSV</button>
      <button class="danger" data-act="reset">Hapus semua data</button>
      <p class="ver">JurnalTrade v${VERSION}</p>
      <input type="file" accept="application/json,.json" hidden>
    </div>`, el => {
    const fileI = $('input[type=file]', el);
    fileI.addEventListener('change', async () => {
      const f = fileI.files[0];
      if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        normalize(d);
        if (!confirm('Ganti semua data dengan backup ini?')) return;
        replaceData(d);
        closeSheet();
        toast('Data dipulihkan');
      } catch (e) {
        toast('File backup tidak valid');
      }
    });

    el.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'stats') {
        openStats();
      } else if (act === 'install' && installEvt) {
        installEvt.prompt();
        await installEvt.userChoice;
        installEvt = null;
        closeSheet();
      } else if (act === 'backup') {
        await shareOrDownload(`jurnaltrade-${today()}.json`, JSON.stringify(state, null, 1), 'application/json');
      } else if (act === 'restore') {
        fileI.click();
      } else if (act === 'csv') {
        await shareOrDownload(`jurnaltrade-${today()}.csv`, toCsv(), 'text/csv');
      } else if (act === 'reset') {
        if (!confirm('Hapus semua data? Tidak bisa dibatalkan.')) return;
        state = fresh();
        view.week = 0;
        save();
        render();
        closeSheet();
        toast('Data dihapus');
      }
    });
  });
}

/* ---------- statistik ---------- */
const statsEl = $('#stats');
const statsBody = $('#statsBody');
const fPeriod = $('#fPeriod');
const fWeek = $('#fWeek');
const sf = { period: '', week: 0 }; // period '' = semua bulan
let statsOpen = false;
let statsW = 0;
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const cnum = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const tick = n => (Math.abs(n) >= 1000 ? cnum.format(n) : fmt(n));
const sum = (list, f) => list.reduce((a, t) => a + f(t), 0);

function groupBy(list, key) {
  const m = new Map();
  for (const t of list) {
    const k = key(t);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return m;
}

function openStats() {
  sf.period = state.current;
  sf.week = view.week;
  if (sheetOpen) {
    hideSheet();
    history.replaceState({ stats: 1 }, '');
  } else {
    history.pushState({ stats: 1 }, '');
  }
  statsOpen = true;
  statsEl.hidden = false;
  statsEl.scrollTop = 0;
  document.body.classList.add('lock');
  renderStats();
}
function hideStats() {
  statsOpen = false;
  statsEl.hidden = true;
  document.body.classList.remove('lock');
}

function fillFilters() {
  const p = state.periods.find(x => x.id === sf.period);
  if (!p) { sf.period = ''; sf.week = 0; }
  const wc = p ? weekCount(p) : 0;
  if (sf.week > wc) sf.week = 0;
  fPeriod.innerHTML = '<option value="">Semua bulan</option>' +
    state.periods.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  fPeriod.value = sf.period;
  fWeek.innerHTML = '<option value="0">Semua minggu</option>' +
    Array.from({ length: wc }, (_, i) => `<option value="${i + 1}">Minggu ${i + 1}</option>`).join('');
  fWeek.value = String(sf.week);
  fWeek.disabled = !p;
}

function metrics(list) {
  const s = stats(list);
  const wins = list.filter(t => t.result === 'TP');
  const losses = list.filter(t => t.result === 'SL');
  const gw = sum(wins, t => t.usd);
  const gl = -sum(losses, t => t.usd);
  const avgWp = wins.length ? sum(wins, t => t.pip) / wins.length : 0;
  const avgLp = losses.length ? sum(losses, t => t.pip) / losses.length : 0;
  let eq = 0, peak = 0, dd = 0, ws = 0, ls = 0, mws = 0, mls = 0;
  for (const t of list) {
    eq += t.usd;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
    if (t.result === 'TP') { ws++; ls = 0; } else { ls++; ws = 0; }
    mws = Math.max(mws, ws);
    mls = Math.max(mls, ls);
  }
  return {
    ...s, gw, gl, avgWp, avgLp, dd, mws, mls,
    pf: gl ? gw / gl : null,
    avgW: wins.length ? gw / wins.length : 0,
    avgL: losses.length ? gl / losses.length : 0,
    rr: wins.length && losses.length ? avgWp / avgLp : null,
    exp: s.n ? s.usd / s.n : 0,
    best: Math.max(...list.map(t => t.usd)),
    worst: Math.min(...list.map(t => t.usd)),
  };
}

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const e = raw / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(r2(v));
  return ticks;
}

// 4px rounded data-end, square at the baseline
function barPath(x, y0, y1, w) {
  const r = Math.min(4, Math.abs(y0 - y1), w / 2);
  const s = y1 < y0 ? 1 : -1;
  return `M${x},${y0}V${y1 + s * r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + s * r}V${y0}Z`;
}

const chartW = () => Math.max(240, statsBody.clientWidth - 60);

function placeTip(box, x, html) {
  const tip = $('.tip', box);
  tip.innerHTML = html;
  tip.classList.add('show');
  const w = tip.offsetWidth;
  tip.style.left = Math.max(w / 2, Math.min(box.clientWidth - w / 2, x)) + 'px';
}
function hideTips() {
  statsEl.querySelectorAll('.tip.show').forEach(t => t.classList.remove('show'));
  statsEl.querySelectorAll('.xh').forEach(g => g.setAttribute('opacity', 0));
  statsEl.querySelectorAll('.col.on').forEach(c => c.classList.remove('on'));
}

function equityChart(list) {
  const W = chartW(), H = 200, L = 40, R = 10, T = 28, B = 24;
  const pts = [0];
  for (const t of list) pts.push(r2(pts[pts.length - 1] + t.usd));
  const n = pts.length - 1;
  const ticks = niceTicks(Math.min(0, ...pts), Math.max(0, ...pts));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const x = i => L + (i / n) * (W - L - R);
  const y = v => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const end = pts[n];
  const xs = [...new Set([1, Math.round((n + 1) / 2), n])].filter(i => i >= 1);

  const html = `<div class="chart" data-eq>
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kurva equity">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'zero' : 'grid'}"/>
        <text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${tick(v)}</text>`).join('')}
      <path d="${line}L${x(n)},${y(0)}L${x(0)},${y(0)}Z" class="eq-area"/>
      <path d="${line}" class="eq-line"/>
      ${xs.map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === n ? 'end' : 'middle'}">${i}</text>`).join('')}
      <circle cx="${x(n)}" cy="${y(end)}" r="4" class="eq-dot"/>
      <text x="${x(n) - 8}" y="${y(end) - 12}" text-anchor="end" class="lbl">${sgn(end)}</text>
      <g class="xh" opacity="0"><line y1="${T}" y2="${H - B}" class="xh-line"/><circle r="4" class="eq-dot"/></g>
    </svg><div class="tip"></div></div>`;

  const mount = root => {
    const box = $('[data-eq]', root);
    const svgEl = $('svg', box);
    const g = $('.xh', box);
    const ln = $('.xh-line', box);
    const dot = $('.xh circle', box);
    const show = e => {
      const px = e.clientX - svgEl.getBoundingClientRect().left;
      const i = Math.max(1, Math.min(n, Math.round(((px - L) / (W - L - R)) * n)));
      const t = list[i - 1];
      ln.setAttribute('x1', x(i));
      ln.setAttribute('x2', x(i));
      dot.setAttribute('cx', x(i));
      dot.setAttribute('cy', y(pts[i]));
      g.setAttribute('opacity', 1);
      placeTip(box, x(i), `<b>${sgn(pts[i])}</b>Trade ${i} · ${dShort(t.date)} · ${t.result} ${sgn(t.usd)}`);
    };
    svgEl.addEventListener('pointerdown', show);
    svgEl.addEventListener('pointermove', show);
    svgEl.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTips(); });
  };
  return { html, mount };
}

function columnChart(items) {
  const W = chartW(), H = 180, T = 22, B = 24;
  const vals = items.map(b => r2(sum(b.list, t => t.usd)));
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const bot = H - B - (min < 0 ? 18 : 0);
  const y = v => T + ((max - v) / (max - min || 1)) * (bot - T);
  const band = W / items.length;
  const bw = Math.min(24, band * 0.6);
  const showVal = band >= 46;
  const every = Math.ceil(30 / band);

  const cols = items.map((b, i) => {
    const v = vals[i], cx = band * (i + 0.5), y1 = y(v);
    return `<g class="col" data-i="${i}">
      ${v ? `<path d="${barPath(cx - bw / 2, y(0), y1, bw)}" class="${v > 0 ? 'up' : 'down'}"/>` : ''}
      ${showVal && b.list.length ? `<text x="${cx}" y="${v >= 0 ? y1 - 6 : y1 + 14}" text-anchor="middle" class="lbl">${sgn(v)}</text>` : ''}
      ${i % every === 0 ? `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>` : ''}
      <rect x="${band * i}" y="0" width="${band}" height="${H}" fill="transparent"/>
    </g>`;
  }).join('');

  const html = `<div class="chart" data-col><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit/loss per periode">
    <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="zero"/>${cols}</svg><div class="tip"></div></div>`;

  const mount = root => {
    const box = $('[data-col]', root);
    const show = e => {
      const c = e.target.closest('.col');
      if (!c) return;
      const i = +c.dataset.i, b = items[i], s = stats(b.list);
      hideTips();
      c.classList.add('on');
      placeTip(box, band * (i + 0.5), `<b>${sgn(vals[i])}</b>${esc(b.full || b.label)} · ${s.n} trade${s.n ? ' · ' + pct(s.wr) : ''}`);
    };
    box.addEventListener('pointerdown', show);
    box.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') show(e); });
    box.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTips(); });
  };
  return { html, mount };
}

function bucketsOf(list) {
  if (!sf.period) {
    return {
      title: 'P/L per bulan',
      items: state.periods.map(p => ({ label: p.name.slice(0, 9), full: p.name, list: list.filter(t => t.periodId === p.id) }))
        .filter(b => b.list.length),
    };
  }
  if (!sf.week) {
    const max = Math.max(0, ...list.map(t => t.week));
    return {
      title: 'P/L per minggu',
      items: Array.from({ length: max }, (_, i) => ({ label: `M${i + 1}`, full: `Minggu ${i + 1}`, list: list.filter(t => t.week === i + 1) })),
    };
  }
  const g = groupBy(list, t => t.date);
  return { title: 'P/L harian', items: [...g.keys()].sort().map(d => ({ label: dShort(d), list: g.get(d) })) };
}

function dayRows(list) {
  const g = groupBy(list, t => {
    const [Y, M, D] = t.date.split('-').map(Number);
    return new Date(Y, M - 1, D).getDay();
  });
  const rows = [1, 2, 3, 4, 5, 6, 0]
    .filter(d => (d >= 1 && d <= 5) || g.has(d))
    .map(d => ({ d, l: g.get(d) || [], s: stats(g.get(d) || []) }));
  const hasNeg = rows.some(r => r.s.usd < 0);
  const hasPos = rows.some(r => r.s.usd > 0);
  const both = hasNeg && hasPos;
  const maxAbs = Math.max(1e-9, ...rows.map(r => Math.abs(r.s.usd)));
  const html = rows.map(({ d, l, s }) => {
    const w = (Math.abs(s.usd) / maxAbs) * (both ? 62 : 78);
    const bar = s.usd ? `<i class="hbar ${s.usd > 0 ? 'up' : 'down'}" style="width:${w}%"></i>` : '';
    const val = l.length ? `<span class="hv">${sgn(s.usd)}</span>` : '';
    return `<div class="drow">
      <div class="dname"><b>${DAYS[d]}</b><small>${l.length ? `${l.length} · ${pct(s.wr)}` : '–'}</small></div>
      <div class="half hneg">${s.usd < 0 ? val + bar : ''}</div>
      <div class="half hpos">${s.usd >= 0 ? bar + val : ''}</div>
    </div>`;
  }).join('');
  return `<div class="days ${both ? '' : hasNeg ? 'only-neg' : 'only-pos'}">${html}</div>`;
}

function sideRows(list) {
  return ['Buy', 'Sell'].map(sd => {
    const l = list.filter(t => t.side === sd);
    const s = stats(l);
    return `<div class="bs">
      <div class="bs-top"><b>${sd}</b><span>${l.length ? sgn(s.usd) + ' USD' : '–'}</span></div>
      <div class="meter"><i style="width:${s.wr}%"></i></div>
      <small>${l.length} trade · winrate ${l.length ? pct(s.wr) : '–'}</small>
    </div>`;
  }).join('');
}

function groupTable(first, groups) {
  const rows = groups.map(([k, l]) => {
    const s = stats(l);
    return `<tr><td>${k}</td><td>${s.n}</td><td>${pct(s.wr)}</td><td>${sgn(s.usd)}</td></tr>`;
  }).join('');
  return `<table class="tbl"><thead><tr><th>${first}</th><th>Trade</th><th>Winrate</th><th>USD</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const kpi = (label, value, sub = '') =>
  `<div class="kpi"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;

function renderStats() {
  fillFilters();
  statsW = statsBody.clientWidth;
  let list = state.trades;
  if (sf.period) list = list.filter(t => t.periodId === sf.period);
  if (sf.week) list = list.filter(t => t.week === sf.week);
  list = sorted(list);

  if (!list.length) {
    statsBody.innerHTML = '<p class="empty">Belum ada trade</p>';
    return;
  }

  const m = metrics(list);
  const p = state.periods.find(x => x.id === sf.period);
  const scope = !p ? 'Semua bulan' : sf.week ? `${esc(p.name)} · Minggu ${sf.week}` : esc(p.name);
  const eq = equityChart(list);
  const bk = bucketsOf(list);
  const col = bk.items.length >= 2 ? columnChart(bk.items) : null;
  const lots = [...groupBy(list, t => t.lot)].sort((a, b) => a[0] - b[0]).map(([k, l]) => [lotf(k), l]);
  const notes = [...groupBy(list.filter(t => t.note), t => t.note)]
    .sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([k, l]) => [esc(k), l]);

  statsBody.innerHTML = `
    <section class="shero">
      <p class="scope">${scope}</p>
      <div class="total-wrap"><span class="total ${cls(m.usd)}">${sgn(m.usd)}</span><span class="unit">USD</span></div>
      <p class="scope">${m.n} trade · ${sgn(m.pip)} pip</p>
    </section>
    <div class="kpis">
      ${kpi('Winrate', pct(m.wr), `${m.tp} TP · ${m.sl} SL`)}
      ${kpi('Profit factor', m.pf === null ? '∞' : fmt(m.pf), `${fmt(m.gw)} / ${fmt(m.gl)}`)}
      ${kpi('Expectancy', sgn(m.exp), 'USD per trade')}
      ${kpi('Risk : reward', m.rr === null ? '–' : '1 : ' + fmt(m.rr), `${fmt(m.avgWp)} / ${fmt(m.avgLp)} pip`)}
      ${kpi('Rata-rata profit', m.tp ? '+' + fmt(m.avgW) : '–', m.tp ? fmt(m.avgWp) + ' pip' : '')}
      ${kpi('Rata-rata loss', m.sl ? '−' + fmt(m.avgL) : '–', m.sl ? fmt(m.avgLp) + ' pip' : '')}
      ${kpi('Trade terbaik', sgn(m.best))}
      ${kpi('Trade terburuk', sgn(m.worst))}
      ${kpi('Win streak', m.mws)}
      ${kpi('Loss streak', m.mls)}
      ${kpi('Max drawdown', m.dd ? '−' + fmt(m.dd) : '0', 'USD dari puncak')}
      ${kpi('Lot rata-rata', lotf(sum(list, t => t.lot) / m.n))}
    </div>
    <section class="scard"><h3>Kurva equity</h3>${eq.html}</section>
    ${col ? `<section class="scard"><h3>${bk.title}</h3>${col.html}</section>` : ''}
    <section class="scard"><h3>Hari</h3>${dayRows(list)}</section>
    <section class="scard"><h3>Buy vs Sell</h3>${sideRows(list)}</section>
    <section class="scard"><h3>Lot</h3>${groupTable('Lot', lots)}</section>
    ${notes.length ? `<section class="scard"><h3>Catatan</h3>${groupTable('Catatan', notes)}</section>` : ''}`;

  eq.mount(statsBody);
  if (col) col.mount(statsBody);
}

fPeriod.addEventListener('change', () => { sf.period = fPeriod.value; sf.week = 0; renderStats(); });
fWeek.addEventListener('change', () => { sf.week = +fWeek.value; renderStats(); });
$('#statsBack').addEventListener('click', () => history.back());
statsEl.addEventListener('pointerdown', e => { if (!e.target.closest('.chart')) hideTips(); });
addEventListener('resize', () => { if (statsOpen && statsBody.clientWidth !== statsW) renderStats(); });

/* ---------- events ---------- */
$('#addBtn').addEventListener('click', () => openTrade());
$('#periodBtn').addEventListener('click', openPeriods);
$('#settingsBtn').addEventListener('click', openSettings);

tabsEl.addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (!b) return;
  if ('add' in b.dataset) {
    const p = cur();
    p.weeks = weekCount(p) + 1;
    view.week = p.weeks;
    save();
  } else {
    view.week = +b.dataset.w;
  }
  render();
});

listEl.addEventListener('click', async e => {
  const row = e.target.closest('.row');
  if (row) return openTrade(state.trades.find(t => t.id === row.dataset.id));
  const gh = e.target.closest('.ghead');
  if (gh) { view.week = +gh.dataset.w; render(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (e.target.closest('[data-seed]')) {
    try {
      const res = await fetch('data-awal.json', { cache: 'no-store' });
      replaceData(await res.json());
      toast('Data dimuat');
    } catch (err) {
      toast('Gagal memuat data');
    }
  }
});

/* ---------- init ---------- */
render();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
