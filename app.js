/* =========================================================
   Gym Quest - logica
   Ogni serie registrata e' una riga in state.logs:
   { id, date, exercise, group, weight, reps, sets, xp, pr }
   Tutto viene salvato nel localStorage del browser.
   ========================================================= */
(() => {
  'use strict';

  const KEY = 'gymquest_v1';
  const BASE_TITLE = 'Gym Quest';
  const TITLES = ['Novizio', 'Apprendista', 'Recluta', 'Guerriero', 'Veterano', 'Gladiatore', 'Campione', 'Titano', 'Leggenda', 'Mito'];
  const DEFAULT_EX = ['Panca piana', 'Squat', 'Stacco da terra', 'Lat machine', 'Military press', 'Curl con manubri', 'Rematore', 'Pressa', 'Crunch'];

  // Gruppi muscolari e parole chiave per indovinarli dal nome dell'esercizio (l'ordine conta)
  const GROUPS = ['Petto', 'Schiena', 'Spalle', 'Bicipiti', 'Tricipiti', 'Gambe', 'Core'];
  const GUESS = [
    ['Core', /crunch|addominal|plank|sit.?up|russian twist|ab wheel|leg raise|\bcore\b/],
    ['Gambe', /squat|\bleg\b|pressa|affond|lunge|rumeno|romanian|polpacc|calf|glute|gluteo|hip thrust|quadricip|femoral/],
    ['Tricipiti', /tricip|french|pushdown|push down|skull|\bdips?\b|kickback/],
    ['Bicipiti', /bicip|curl|hammer|scott/],
    ['Spalle', /spall|military|shoulder|alzate|lateral raise|arnold|face pull|overhead|\blento\b/],
    ['Schiena', /schiena|\blat\b|pulldown|trazion|pull.?up|chin.?up|rematore|\brow\b|stacco|pulley|dorsal|lombar|iperext|hyperext/],
    ['Petto', /panca|petto|chest|croci|piegament|push.?up|pec deck|pectoral|cable cross/]
  ];

  // ---------- Utilita ----------
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const norm = s => String(s).trim().toLowerCase();
  const num = n => Math.round(n).toLocaleString('it-IT');
  const kg = n => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
  const mondayOf = s => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const shortDate = s => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
  const longDate = s => {
    const d = parseISO(s);
    const o = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString('it-IT', o);
  };
  const rankOf = lvl => TITLES[Math.min(Math.floor((lvl - 1) / 2), TITLES.length - 1)];
  const sameEx = (l, ex) => norm(l.exercise) === norm(ex);
  const guessGroup = name => { const n = norm(name); const g = GUESS.find(([, re]) => re.test(n)); return g ? g[0] : ''; };
  const groupOf = l => l.group || guessGroup(l.exercise);
  const pillText = l => {
    const core = l.weight > 0 ? `${kg(l.weight)} kg × ${l.reps}` : `${l.reps} rip.`;
    return (l.sets > 1 ? `${l.sets} serie · ` : '') + core;
  };

  const fmtDur = m => {
    const t = Math.round(m * 60);
    const h = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
    return h ? `${h}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
  };
  const fmtPace = p => { const t = Math.round(p * 60); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
  const runText = r => `${kg(r.km)} km · ${fmtDur(r.min)} · ${fmtPace(r.min / r.km)} /km`;

  // ---------- Dati ----------
  let state = load();
  let saveWarned = false;

  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s || !Array.isArray(s.logs)) s = { logs: [] };
    if (!Array.isArray(s.runs)) s.runs = [];
    s.settings = Object.assign({ goal: 3, rest: 90, sound: true }, s.settings || {});
    s.logs.forEach(l => { if (!l.sets) l.sets = 1; });
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      if (!saveWarned) { saveWarned = true; toast('Il browser non permette di salvare. Esporta un backup dalla sezione Altro.', 'bad'); }
    }
  }
  function lastLog(ex) {
    let best = null;
    state.logs.forEach(l => {
      if (sameEx(l, ex) && (!best || l.date > best.date || (l.date === best.date && l.id > best.id))) best = l;
    });
    return best;
  }
  function exerciseNames() {
    const seen = new Map();
    [...state.logs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .forEach(l => { if (!seen.has(norm(l.exercise))) seen.set(norm(l.exercise), l.exercise); });
    return [...seen.values()];
  }

  // ---------- Calcoli ----------
  function calcXp(weight, reps, sets) {
    return sets * (5 + reps) + Math.round(weight * reps * sets / 20);
  }

  function groupStats() {
    return GROUPS.map(g => {
      const xp = sum(state.logs.filter(l => groupOf(l) === g), l => l.xp);
      const lvl = Math.floor(Math.sqrt(xp / 75)) + 1;
      const base = 75 * (lvl - 1) ** 2, next = 75 * lvl ** 2;
      return { g, xp, lvl, pct: Math.min(100, ((xp - base) / (next - base)) * 100) };
    });
  }

  function stats() {
    const logs = state.logs;
    const runs = state.runs;
    const xp = sum(logs, l => l.xp) + sum(runs, r => r.xp);
    const lvl = Math.floor(Math.sqrt(xp / 150)) + 1;
    const base = 150 * (lvl - 1) ** 2;
    const next = 150 * lvl ** 2;

    const days = new Set([...logs.map(l => l.date), ...runs.map(r => r.date)]);
    const weeks = {};
    days.forEach(d => { const k = mondayOf(d); if (!weeks[k]) weeks[k] = new Set(); weeks[k].add(d); });

    // Serie a settimane: quante settimane consecutive hanno raggiunto l'obiettivo
    const goal = state.settings.goal;
    const met = k => (weeks[k] ? weeks[k].size : 0) >= goal;
    const thisKey = mondayOf(today());
    let k = thisKey, streak = 0;
    if (!met(k)) k = addDays(k, -7);
    while (met(k)) { streak++; k = addDays(k, -7); }

    const gs = groupStats();
    return {
      xp, lvl, base, next,
      days: days.size,
      weekCount: weeks[thisKey] ? weeks[thisKey].size : 0,
      streak,
      volume: sum(logs, l => l.weight * l.reps * l.sets),
      prs: logs.filter(l => l.pr).length,
      runKm: sum(runs, r => r.km),
      runCount: runs.length,
      longestRun: runs.length ? Math.max(...runs.map(r => r.km)) : 0,
      count: sum(logs, l => l.sets),
      groupsL3: gs.filter(x => x.lvl >= 3).length
    };
  }

  const BADGES = [
    { id: 'first',   ic: '🥇', name: 'Prima serie',          desc: 'Registra la prima serie',                        prog: s => [s.count, 1] },
    { id: 'days10',  ic: '📅', name: 'Habitué',              desc: '10 giorni di allenamento',                       prog: s => [s.days, 10] },
    { id: 'days50',  ic: '🗓️', name: 'Cinquanta giorni',     desc: '50 giorni di allenamento',                       prog: s => [s.days, 50] },
    { id: 'w3',      ic: '🔥', name: 'Costanza',             desc: 'Obiettivo settimanale per 3 settimane di fila',  prog: s => [s.streak, 3] },
    { id: 'w8',      ic: '⚡', name: 'Inarrestabile',        desc: 'Obiettivo settimanale per 8 settimane di fila',  prog: s => [s.streak, 8] },
    { id: 'vol10k',  ic: '🏗️', name: 'Dieci tonnellate',     desc: '10.000 kg sollevati in totale',                  prog: s => [s.volume, 10000] },
    { id: 'vol100k', ic: '🚀', name: 'Cento tonnellate',     desc: '100.000 kg sollevati in totale',                 prog: s => [s.volume, 100000] },
    { id: 'pr5',     ic: '🏆', name: 'Rompirecord',          desc: 'Batti 5 record di peso',                         prog: s => [s.prs, 5] },
    { id: 'pr25',    ic: '💎', name: 'Cacciatore di record', desc: 'Batti 25 record di peso',                        prog: s => [s.prs, 25] },
    { id: 'lvl5',    ic: '👑', name: 'Livello 5',            desc: 'Raggiungi il livello 5',                         prog: s => [s.lvl, 5] },
    { id: 'lvl10',   ic: '🐉', name: 'Livello 10',           desc: 'Raggiungi il livello 10',                        prog: s => [s.lvl, 10] },
    { id: 'bal',     ic: '⚖️', name: 'Equilibrato',          desc: 'Porta tutti i gruppi muscolari al livello 3',    prog: s => [s.groupsL3, GROUPS.length] },
    { id: 'run1',    ic: '👟', name: 'Prima corsa',          desc: 'Registra la prima corsa',                        prog: s => [s.runCount, 1] },
    { id: 'run5k',   ic: '🏃', name: 'Cinque chilometri',    desc: 'Corri almeno 5 km in una volta sola',            prog: s => [s.longestRun, 5] },
    { id: 'km100',   ic: '🛣️', name: 'Cento chilometri',     desc: '100 km corsi in totale',                         prog: s => [s.runKm, 100] }
  ];
  const isDone = (b, s) => { const [c, t] = b.prog(s); return c >= t; };
  const earned = s => new Set(BADGES.filter(b => isDone(b, s)).map(b => b.id));

  // ---------- Suoni ----------
  let ac = null;
  function audio() {
    if (!state.settings.sound) return null;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch (e) { return null; }
  }
  function tone(freq, start, dur, type, vol) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    set:   () => { tone(523, 0, .08); tone(784, .08, .12); },
    pr:    () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .14)); },
    level: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .1, .22, 'triangle', .08)); },
    timer: () => { tone(880, 0, .15); tone(880, .22, .15); tone(1175, .44, .3); }
  };

  // ---------- Feedback ----------
  let toastTimer;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = (kind || '') + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
  }
  function popXp(text, sel) {
    const b = $(sel || '#btnAdd').getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'xppop';
    el.textContent = text;
    el.style.left = (b.left + b.width / 2) + 'px';
    el.style.top = b.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('#levelup');
    const colors = ['#ffc93c', '#ff5a8a', '#47e0a4', '#7c5cff', '#ffffff'];
    for (let i = 0; i < 50; i++) {
      const p = document.createElement('i');
      p.className = 'cf';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * .6) + 's';
      p.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
      p.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      box.appendChild(p);
    }
    setTimeout(() => box.querySelectorAll('.cf').forEach(n => n.remove()), 4200);
  }
  function levelUp(lvl) {
    $('#luN').textContent = lvl;
    $('#luT').textContent = 'Nuovo rank: ' + rankOf(lvl) + '. Tocca per continuare.';
    $('#levelup').classList.add('show');
    confetti();
    SFX.level();
    setTimeout(() => $('#levelup').classList.remove('show'), 4200);
  }
  $('#levelup').addEventListener('click', () => $('#levelup').classList.remove('show'));

  // ---------- Timer di recupero ----------
  let timerEnd = 0, timerTotal = 0, timerTick = null;
  const fmtTime = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
  function startTimer(sec) {
    timerEnd = Date.now() + sec * 1000;
    timerTotal = sec;
    if (!timerTick) timerTick = setInterval(tickTimer, 250);
    tickTimer();
  }
  function tickTimer() {
    const left = Math.ceil((timerEnd - Date.now()) / 1000);
    const el = $('#timer');
    if (left > 0) {
      el.classList.add('show');
      el.classList.remove('done');
      $('#tLeft').textContent = fmtTime(left);
      $('#tFill').style.width = (100 * (1 - left / timerTotal)) + '%';
      document.title = `⏱ ${fmtTime(left)} · ${BASE_TITLE}`;
    } else {
      endTimer(true);
    }
  }
  function endTimer(natural) {
    clearInterval(timerTick);
    timerTick = null;
    document.title = BASE_TITLE;
    const el = $('#timer');
    if (natural) {
      el.classList.add('done');
      $('#tLeft').textContent = 'Via!';
      $('#tFill').style.width = '100%';
      SFX.timer();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setTimeout(() => { if (!timerTick) el.classList.remove('show', 'done'); }, 4000);
    } else {
      el.classList.remove('show', 'done');
    }
  }
  $('#tAdd').addEventListener('click', () => {
    if (!timerTick) return;
    timerEnd += 15000;
    timerTotal += 15;
    tickTimer();
  });
  $('#tSkip').addEventListener('click', () => endTimer(false));

  // ---------- Modulo: registrazione di una serie ----------
  let prefilled = false;   // peso e ripetizioni sono stati riempiti in automatico
  let autoGrp = false;     // il gruppo e' stato scelto in automatico

  function onExercise() {
    const ex = $('#ex').value;
    const known = ex.trim() ? lastLog(ex) : null;

    const g = known ? groupOf(known) : guessGroup(ex);
    if (g) { $('#grp').value = g; autoGrp = true; }
    else if (autoGrp) { $('#grp').value = ''; autoGrp = false; }

    if (known && ($('#w').value === '' && $('#r').value === '' || prefilled)) {
      $('#w').value = known.weight;
      $('#r').value = known.reps;
      prefilled = true;
    } else if (!known && prefilled) {
      $('#w').value = '';
      $('#r').value = '';
      prefilled = false;
    }
    updateHint();
  }

  function updateHint() {
    const el = $('#hint');
    const ex = $('#ex').value.trim();
    if (!ex) { el.textContent = "Scegli un esercizio per vedere l'ultima volta e l'obiettivo di oggi."; return; }
    const ls = state.logs.filter(l => sameEx(l, ex));
    if (!ls.length) { el.textContent = 'Prima volta con questo esercizio: parti con un peso comodo, ti aspetta un bonus di 20 xp.'; return; }
    const lastDate = ls.reduce((a, l) => l.date > a ? l.date : a, '0000-00-00');
    const day = ls.filter(l => l.date === lastDate);
    const top = day.reduce((a, l) => (l.weight > a.weight || (l.weight === a.weight && l.reps > a.reps)) ? l : a, day[0]);
    let goal;
    if (top.weight > 0) goal = top.reps >= 10 ? `${kg(top.weight + 2.5)} kg × 8` : `${kg(top.weight)} kg × ${top.reps + 1}`;
    else goal = `${top.reps + 1} ripetizioni`;
    el.textContent = `Ultima volta (${shortDate(lastDate)}): la serie migliore è stata ${pillText({ ...top, sets: 1 })}. Obiettivo di oggi: ${goal}.`;
  }

  $('#ex').addEventListener('input', onExercise);
  $('#grp').addEventListener('change', () => { autoGrp = false; });
  ['#w', '#r'].forEach(id => $(id).addEventListener('input', () => { prefilled = false; }));
  $('#d').addEventListener('change', renderSession);
  $('#rest').addEventListener('change', () => { state.settings.rest = +$('#rest').value; save(); });

  $$('.st').forEach(b => b.addEventListener('click', () => {
    const inp = $('#' + b.dataset.t);
    const cur = parseFloat(inp.value) || 0;
    const min = b.dataset.t === 'r' ? 1 : 0;
    inp.value = Math.max(min, Math.round((cur + parseFloat(b.dataset.d)) * 100) / 100);
    prefilled = false;
  }));

  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    audio(); // sblocca l'audio del browser con questo tocco

    const ex = $('#ex').value.trim();
    const weight = parseFloat(String($('#w').value).replace(',', '.'));
    const reps = parseInt($('#r').value, 10);
    const date = $('#d').value || today();
    const group = $('#grp').value;
    if (!ex || isNaN(weight) || weight < 0 || !(reps > 0)) { toast('Inserisci esercizio, peso e ripetizioni', 'bad'); return; }
    if (!group) { toast('Scegli il gruppo muscolare', 'bad'); return; }

    const before = stats();
    const badgesBefore = earned(before);
    const gBefore = groupStats().find(x => x.g === group);

    // Bonus: primo esercizio, record di peso, record di ripetizioni
    const prev = state.logs.filter(l => sameEx(l, ex));
    let bonus = 0, pr = false, repPr = false, first = false;
    if (!prev.length) { bonus = 20; first = true; }
    else if (weight > Math.max(...prev.map(l => l.weight))) { bonus = 50; pr = true; }
    else {
      const same = prev.filter(l => l.weight === weight);
      if (same.length && reps > Math.max(...same.map(l => l.reps))) { bonus = 15; repPr = true; }
    }

    const xp = calcXp(weight, reps, 1) + bonus;
    state.logs.push({ id: Date.now(), date, exercise: ex, weight, reps, sets: 1, group, xp, pr });
    save();

    const after = stats();
    const gAfter = groupStats().find(x => x.g === group);
    render();

    const lines = [`+${xp} xp`];
    if (pr) lines.push('Nuovo record di peso! (+50 bonus)');
    if (repPr) lines.push('Record di ripetizioni con questo peso (+15 bonus)');
    if (first) lines.push('Nuovo esercizio sbloccato (+20 bonus)');
    BADGES.filter(b => isDone(b, after) && !badgesBefore.has(b.id)).forEach(b => lines.push(`Trofeo: ${b.name}`));
    if (gAfter.lvl > gBefore.lvl) lines.push(`${group} sale al livello ${gAfter.lvl}`);
    if (date !== today()) lines.push(`Serie salvata il ${shortDate(date)}`);
    toast(lines.join('\n'));
    popXp(`+${xp} xp`);
    if (navigator.vibrate) navigator.vibrate(30);

    if (after.lvl > before.lvl) levelUp(after.lvl);
    else if (pr || repPr) SFX.pr();
    else SFX.set();

    if (date === today() && state.settings.rest > 0) startTimer(state.settings.rest);
  });

  // ---------- Modulo: registrazione di una corsa ----------
  $('#runForm').addEventListener('submit', e => {
    e.preventDefault();
    audio();
    const km = parseFloat(String($('#rk').value).replace(',', '.'));
    const min = (parseFloat($('#rm').value) || 0) + (parseFloat($('#rs').value) || 0) / 60;
    const date = $('#rd').value || today();
    if (!(km > 0) || !(min > 0)) { toast('Inserisci distanza e tempo', 'bad'); return; }

    const before = stats();
    const badgesBefore = earned(before);

    // Bonus: prima corsa, miglior passo (da 1 km in su), corsa piu' lunga
    const prev = state.runs;
    let bonus = 0, first = false, paceBest = false, longest = false;
    if (!prev.length) { bonus = 20; first = true; }
    else {
      const paces = prev.filter(r => r.km >= 1).map(r => r.min / r.km);
      if (km >= 1 && paces.length && min / km < Math.min(...paces)) { bonus += 30; paceBest = true; }
      if (km > Math.max(...prev.map(r => r.km))) { bonus += 30; longest = true; }
    }
    const xp = Math.round(km * 30) + bonus;
    state.runs.push({ id: Date.now(), date, km, min, xp });
    save();

    const after = stats();
    render();

    const lines = [`+${xp} xp`];
    if (first) lines.push('Prima corsa registrata (+20 bonus)');
    if (paceBest) lines.push(`Miglior passo: ${fmtPace(min / km)} /km (+30 bonus)`);
    if (longest) lines.push('Corsa più lunga di sempre (+30 bonus)');
    BADGES.filter(b => isDone(b, after) && !badgesBefore.has(b.id)).forEach(b => lines.push(`Trofeo: ${b.name}`));
    if (date !== today()) lines.push(`Corsa salvata il ${shortDate(date)}`);
    toast(lines.join('\n'));
    popXp(`+${xp} xp`, '#btnRun');
    if (navigator.vibrate) navigator.vibrate(30);

    if (after.lvl > before.lvl) levelUp(after.lvl);
    else if (paceBest || longest) SFX.pr();
    else SFX.set();

    ['#rk', '#rm', '#rs'].forEach(id => { $(id).value = ''; });
  });

  // ---------- Rendering ----------
  function render() {
    const s = stats();
    renderHero(s);
    renderDatalist();
    renderSession();
    renderGroups();
    renderChartSelect();
    drawChart();
    renderHeat();
    renderRecords();
    renderRuns();
    renderBadges(s);
    renderHistory();
    updateHint();
  }

  function renderHero(s) {
    $('#lvl').textContent = s.lvl;
    $('#rank').textContent = rankOf(s.lvl);
    const pct = Math.min(100, ((s.xp - s.base) / (s.next - s.base)) * 100);
    $('#fill').style.width = pct + '%';
    $('#barA11y').setAttribute('aria-valuenow', Math.round(pct));
    $('#xpNow').textContent = num(s.xp);
    $('#xpLeft').textContent = num(s.next - s.xp);
    $('#lvlNext').textContent = s.lvl + 1;
    const goal = state.settings.goal;
    $('#stWeek').textContent = `${s.weekCount}/${goal}`;
    $('#statWeek').classList.toggle('ok', s.weekCount >= goal);
    $('#stStreak').textContent = s.streak;
    $('#stStreakL').textContent = s.streak === 1 ? 'settimana di fila' : 'settimane di fila';
    $('#stVol').textContent = num(s.volume);
  }

  function renderDatalist() {
    const all = exerciseNames();
    DEFAULT_EX.forEach(n => { if (!all.some(x => norm(x) === norm(n))) all.push(n); });
    $('#exlist').innerHTML = all.map(n => `<option value="${esc(n)}"></option>`).join('');
  }

  // Serie di un giorno raggruppate per esercizio (usato in "Allenati" e nello storico)
  function dayHTML(date) {
    const ls = state.logs.filter(l => l.date === date).sort((a, b) => a.id - b.id);
    const byEx = new Map();
    ls.forEach(l => { const k = norm(l.exercise); if (!byEx.has(k)) byEx.set(k, []); byEx.get(k).push(l); });
    const gym = [...byEx.values()].map(arr => {
      const g = groupOf(arr[0]);
      return `<div class="ex">
        <div class="ex-h"><b>${esc(arr[0].exercise)}</b>${g ? `<span class="gtag">${g}</span>` : ''}<span class="xp">+${num(sum(arr, l => l.xp))} xp</span></div>
        <div class="pills">${arr.map(l => `<span class="pill">${pillText(l)}${l.pr ? '<i class="pr" title="Record di peso">★</i>' : ''}<button type="button" class="x" data-del="${l.id}" aria-label="Elimina questa serie">×</button></span>`).join('')}</div>
      </div>`;
    }).join('');
    const runs = state.runs.filter(r => r.date === date).sort((a, b) => a.id - b.id).map(r => `<div class="ex">
        <div class="ex-h"><b>Corsa</b><span class="gtag">Cardio</span><span class="xp">+${num(r.xp)} xp</span></div>
        <div class="pills"><span class="pill">${runText(r)}<button type="button" class="x" data-delrun="${r.id}" aria-label="Elimina questa corsa">×</button></span></div>
      </div>`).join('');
    return gym + runs;
  }

  // Riepilogo di un giorno: serie, chilometri e xp
  function daySummary(date) {
    const ls = state.logs.filter(l => l.date === date);
    const rs = state.runs.filter(r => r.date === date);
    const parts = [];
    if (ls.length) {
      const nEx = new Set(ls.map(l => norm(l.exercise))).size;
      parts.push(`${sum(ls, l => l.sets)} serie · ${nEx} ${nEx === 1 ? 'esercizio' : 'esercizi'}`);
    }
    if (rs.length) parts.push(`${kg(Math.round(sum(rs, r => r.km) * 10) / 10)} km corsi`);
    parts.push(`${num(sum(ls, l => l.xp) + sum(rs, r => r.xp))} xp`);
    return parts.join(' · ');
  }

  function renderSession() {
    const date = $('#d').value || today();
    const has = state.logs.some(l => l.date === date) || state.runs.some(r => r.date === date);
    $('#sessTitle').textContent = date === today() ? 'Allenamento di oggi' : 'Allenamento del ' + longDate(date);
    const box = $('#session');
    if (!has) {
      $('#sessSub').textContent = '';
      box.innerHTML = '<p class="empty">Niente per ora. Compila il modulo e tocca "Registra serie" (il timer di recupero parte da solo) oppure registra una corsa.</p>';
      return;
    }
    $('#sessSub').textContent = daySummary(date);
    box.innerHTML = dayHTML(date);
  }

  let histLimit = 8;
  function renderHistory() {
    const box = $('#history');
    const dates = [...new Set([...state.logs.map(l => l.date), ...state.runs.map(r => r.date)])].sort().reverse();
    if (!dates.length) {
      box.innerHTML = '<p class="empty">Niente qui, per ora. Il primo allenamento è quello che conta di più.</p>';
      $('#histMore').hidden = true;
      return;
    }
    box.innerHTML = dates.slice(0, histLimit).map(d => {
      return `<div class="day"><h3>${longDate(d)}</h3>
        <p class="dsub">${daySummary(d)}</p>
        ${dayHTML(d)}</div>`;
    }).join('');
    $('#histMore').hidden = dates.length <= histLimit;
  }
  $('#histMore').addEventListener('click', () => { histLimit += 8; renderHistory(); });

  // Elimina una serie (funziona sia in "Allenati" sia nello storico)
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-del], [data-delrun]');
    if (!btn) return;
    const isRun = btn.hasAttribute('data-delrun');
    if (!confirm(isRun ? 'Eliminare questa corsa? Perderai anche gli xp che ti ha dato.' : 'Eliminare questa serie? Perderai anche gli xp che ti ha dato.')) return;
    if (isRun) state.runs = state.runs.filter(r => String(r.id) !== btn.dataset.delrun);
    else state.logs = state.logs.filter(l => String(l.id) !== btn.dataset.del);
    save(); render();
  });

  function renderRecords() {
    const box = $('#records');
    const names = exerciseNames();
    if (!names.length) { box.innerHTML = '<p class="empty">Ancora nessun record. Registra la prima serie per iniziare.</p>'; return; }
    const rows = names.map(n => {
      const ls = state.logs.filter(l => sameEx(l, n));
      const best = ls.reduce((a, l) => (l.weight > a.weight || (l.weight === a.weight && l.reps > a.reps)) ? l : a, ls[0]);
      const e1rm = Math.max(...ls.map(l => l.weight * (1 + l.reps / 30)));
      return { n, best, e1rm };
    }).sort((a, b) => b.best.weight - a.best.weight);
    box.innerHTML = rows.map(r => `
      <div class="rec">
        <div><b>${esc(r.n)}</b><br><small>${r.best.weight > 0 ? `${kg(r.best.weight)} kg × ${r.best.reps}` : `${r.best.reps} ripetizioni`}, ${shortDate(r.best.date)}${r.e1rm > 0 && r.best.weight > 0 ? ` · massimale stimato ${Math.round(r.e1rm)} kg` : ''}</small></div>
        <div class="big">${r.best.weight > 0 ? kg(r.best.weight) + ' kg' : r.best.reps + ' rip.'}</div>
      </div>`).join('');
  }

  function renderBadges(s) {
    const done = BADGES.filter(b => isDone(b, s)).length;
    $('#badgeCount').textContent = `${done} di ${BADGES.length} sbloccati`;
    $('#badges').innerHTML = BADGES.map(b => {
      const [c, t] = b.prog(s);
      const ok = c >= t;
      return `<div class="badge ${ok ? 'on' : 'off'}">
        <span class="ic">${b.ic}</span>
        <div><b>${b.name}</b><small>${b.desc}</small>
        ${ok ? '' : `<div class="bp"><i style="width:${Math.min(100, c / t * 100)}%"></i></div><small>${num(Math.min(c, t))} / ${num(t)}</small>`}</div>
      </div>`;
    }).join('');
  }

  // Grafico radar dei livelli per gruppo muscolare
  function renderGroups() {
    const gs = groupStats();
    const maxLvl = Math.max(5, ...gs.map(x => x.lvl));
    const S = 420, c = S / 2, R = 125, n = gs.length;
    const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i, r) => [c + r * Math.cos(ang(i)), c + r * Math.sin(ang(i))];
    const f = v => v.toFixed(1);
    const poly = r => gs.map((_, i) => pt(i, r).map(f).join(',')).join(' ');

    const rings = [1, 2, 3, 4].map(k => `<polygon class="ring" points="${poly(R * k / 4)}"/>`).join('');
    const spokes = gs.map((_, i) => { const [x, y] = pt(i, R); return `<line class="spoke" x1="${c}" y1="${c}" x2="${f(x)}" y2="${f(y)}"/>`; }).join('');
    const shape = gs.map((x, i) => pt(i, R * (x.lvl / maxLvl)).map(f).join(',')).join(' ');
    const marks = gs.map((x, i) => {
      const [vx, vy] = pt(i, R * (x.lvl / maxLvl));
      const [lx, ly] = pt(i, R + 22);
      const cs = Math.cos(ang(i));
      const anchor = cs > 0.3 ? 'start' : cs < -0.3 ? 'end' : 'middle';
      return `<circle class="vtx" cx="${f(vx)}" cy="${f(vy)}" r="5"/>
        <text class="glab" x="${f(lx)}" y="${f(ly - 2)}" text-anchor="${anchor}">${x.g}</text>
        <text class="glv" x="${f(lx)}" y="${f(ly + 13)}" text-anchor="${anchor}">Lv ${x.lvl}</text>`;
    }).join('');
    const desc = gs.map(x => `${x.g} livello ${x.lvl}`).join(', ');
    $('#radar').innerHTML = `<svg viewBox="0 0 ${S} ${S}" role="img" aria-label="Livelli per gruppo muscolare: ${desc}">${rings}${spokes}<polygon class="shape" points="${shape}"/>${marks}</svg>`;

    const total = sum(gs, x => x.xp);
    let tip = 'Registra una serie per far crescere il grafico.';
    if (total > 0) {
      const weakest = gs.reduce((a, x) => x.xp < a.xp ? x : a, gs[0]);
      const strongest = gs.reduce((a, x) => x.xp > a.xp ? x : a, gs[0]);
      tip = weakest.lvl < strongest.lvl
        ? `Il gruppo più indietro è ${weakest.g} (livello ${weakest.lvl}): un allenamento lì riequilibra il grafico.`
        : 'Ogni gruppo sale di livello con gli xp degli esercizi che gli assegni.';
    }
    $('#gbars').innerHTML = gs.map(x => `
      <div class="gbar"><b>${x.g}</b><div class="mini"><i style="width:${x.pct.toFixed(0)}%"></i></div><span class="lv">Lv ${x.lvl}</span></div>`).join('')
      + `<p class="hint">${tip}</p>`;
  }

  // Andamento di un esercizio nel tempo
  function renderChartSelect() {
    const sel = $('#chartEx');
    const names = exerciseNames();
    const current = sel.value;
    if (!names.length) { sel.innerHTML = '<option value="">Nessun esercizio</option>'; return; }
    sel.innerHTML = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (names.includes(current)) sel.value = current;
    else {
      const last = [...state.logs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).pop();
      sel.value = last ? last.exercise : names[0];
    }
  }
  $('#chartEx').addEventListener('change', drawChart);
  $('#chartMet').addEventListener('change', drawChart);

  function drawChart() {
    const box = $('#chart');
    const ex = $('#chartEx').value, met = $('#chartMet').value;
    const agg = {};
    state.logs.filter(l => ex && sameEx(l, ex)).forEach(l => {
      const v = met === 'weight' ? l.weight : met === 'e1rm' ? l.weight * (1 + l.reps / 30) : l.weight * l.reps * l.sets;
      agg[l.date] = met === 'volume' ? (agg[l.date] || 0) + v : Math.max(agg[l.date] || 0, v);
    });
    const dates = Object.keys(agg).sort();
    if (dates.length < 2) {
      box.innerHTML = '<p class="empty">Servono almeno due giorni con questo esercizio per vedere l\'andamento.</p>';
      return;
    }
    const W = 600, H = 220, L = 58, R = 16, T = 16, B = 30;
    const r1 = v => Math.round(v * 10) / 10;
    const vals = dates.map(d => agg[d]);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const x = i => L + (i * (W - L - R)) / (dates.length - 1);
    const y = v => T + (1 - (v - min) / (max - min)) * (H - T - B);
    const pts = dates.map((d, i) => `${x(i).toFixed(1)},${y(agg[d]).toFixed(1)}`).join(' ');
    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento di ${esc(ex)}">
        <line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>
        <line class="axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>
        <text class="lab" x="${L - 6}" y="${T + 4}" text-anchor="end">${num(max)} kg</text>
        <text class="lab" x="${L - 6}" y="${H - B}" text-anchor="end">${num(min)} kg</text>
        <text class="lab" x="${L}" y="${H - 8}">${shortDate(dates[0])}</text>
        <text class="lab" x="${W - R}" y="${H - 8}" text-anchor="end">${shortDate(dates[dates.length - 1])}</text>
        <polyline class="line" points="${pts}"/>
        ${dates.map((d, i) => `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(agg[d]).toFixed(1)}" r="5"><title>${shortDate(d)}: ${kg(r1(agg[d]))} kg</title></circle>`).join('')}
      </svg>`;
  }

  // Costanza: un quadrato per giorno, ultime 16 settimane
  function renderHeat() {
    const WEEKS = 16;
    const xpByDay = {};
    state.logs.forEach(l => { xpByDay[l.date] = (xpByDay[l.date] || 0) + l.xp; });
    state.runs.forEach(r => { xpByDay[r.date] = (xpByDay[r.date] || 0) + r.xp; });
    const t = today();
    const start = addDays(mondayOf(t), -7 * (WEEKS - 1));
    let html = ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(l => `<span class="hl">${l}</span>`).join('');
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        const xp = xpByDay[date] || 0;
        let cls, title = '';
        if (date > t) cls = 'lf';
        else {
          cls = xp === 0 ? '' : xp < 200 ? 'l1' : xp < 450 ? 'l2' : xp < 800 ? 'l3' : 'l4';
          title = `${shortDate(date)}: ${xp ? num(xp) + ' xp' : 'riposo'}`;
        }
        html += `<i class="hc ${cls}" title="${title}"></i>`;
      }
    }
    $('#heat').innerHTML = `<div class="heat">${html}</div>`;
  }

  // Corsa: riepilogo, record e chilometri per settimana
  function renderRuns() {
    const box = $('#runStats');
    const rs = state.runs;
    if (!rs.length) { box.innerHTML = '<p class="empty">Nessuna corsa registrata. Aggiungila dalla scheda Allenati.</p>'; return; }
    const r1 = v => Math.round(v * 10) / 10;
    const wk = mondayOf(today());
    const kmWeek = sum(rs.filter(r => mondayOf(r.date) === wk), r => r.km);
    const long = rs.reduce((a, r) => r.km > a.km ? r : a, rs[0]);
    const fast = rs.filter(r => r.km >= 1).reduce((a, r) => (!a || r.min / r.km < a.min / a.km) ? r : a, null);
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const k = addDays(wk, -7 * i);
      weeks.push({ k, km: sum(rs.filter(r => mondayOf(r.date) === k), r => r.km) });
    }
    const max = Math.max(1, ...weeks.map(w => w.km));
    box.innerHTML = `
      <div class="rgrid">
        <div class="stat"><b>${kg(r1(sum(rs, r => r.km)))}</b><span>km in totale</span></div>
        <div class="stat"><b>${kg(r1(kmWeek))}</b><span>km questa settimana</span></div>
        <div class="stat"><b>${fast ? fmtPace(fast.min / fast.km) : '–'}</b><span>miglior passo, min/km</span></div>
      </div>
      <p class="hint">Corsa più lunga: ${kg(long.km)} km il ${shortDate(long.date)}. ${rs.length} ${rs.length === 1 ? 'corsa registrata' : 'corse registrate'}.</p>
      <div class="wkbars" role="img" aria-label="Chilometri corsi nelle ultime 8 settimane">
        ${weeks.map(w => `<div class="wk" title="Settimana dal ${shortDate(w.k)}: ${kg(r1(w.km))} km"><div class="b"><i style="height:${w.km ? Math.max(4, Math.round(w.km / max * 100)) : 0}%"></i></div><small>${shortDate(w.k)}</small></div>`).join('')}
      </div>`;
  }

  // ---------- Navigazione a schede ----------
  function showTab(id) {
    $$('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + id; });
    $$('.nav button').forEach(b => {
      const on = b.dataset.tab === id;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0 });
  }
  $$('.nav button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- Impostazioni e dati ----------
  $('#goal').addEventListener('change', () => { state.settings.goal = +$('#goal').value; save(); render(); });
  $('#sound').addEventListener('change', () => { state.settings.sound = $('#sound').checked; save(); if (state.settings.sound) SFX.set(); });

  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-quest-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#btnImport').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result);
        if (!data || !Array.isArray(data.logs)) throw new Error('formato');
        if (!confirm('Importare il backup? Sostituirà i dati attuali.')) return;
        state = { logs: data.logs, runs: Array.isArray(data.runs) ? data.runs : [], settings: data.settings || {} };
        state.settings = Object.assign({ goal: 3, rest: 90, sound: true }, state.settings);
        state.logs.forEach(l => { if (!l.sets) l.sets = 1; });
        save(); syncSettings(); render();
        toast('Backup importato');
      } catch (err) {
        toast('File non valido', 'bad');
      }
    };
    rd.readAsText(file);
    e.target.value = '';
  });
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Cancellare tutti i dati? Non si può annullare.')) return;
    state = { logs: [], runs: [], settings: state.settings };
    save(); render();
  });

  function syncSettings() {
    $('#goal').value = String(state.settings.goal);
    $('#rest').value = String(state.settings.rest);
    $('#sound').checked = !!state.settings.sound;
  }

  // ---------- Avvio ----------
  $('#grp').innerHTML = '<option value="">Scegli il gruppo</option>' + GROUPS.map(g => `<option value="${g}">${g}</option>`).join('');
  $('#d').value = today();
  $('#rd').value = today();
  syncSettings();
  render();
})();
