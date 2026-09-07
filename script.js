/* ── STREAK ─────────────────────────────────────────────
   Everything saves to localStorage, so a reload (or a
   reopen tomorrow) picks up exactly where you left off.  */

const KEY = 'streak.v1';

const blank = { groups: [], days: [], timerMins: 30, sound: true, skin: 'candy' };

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return {...blank};
    const d = JSON.parse(raw);
    const out = {
      groups: Array.isArray(d.groups) ? d.groups : [],
      days:   Array.isArray(d.days)   ? d.days   : [],
      timerMins: Number(d.timerMins) || 30,
      sound: d.sound !== false,
      skin: d.skin === 'mono' ? 'mono' : 'candy'
    };
    // migrate a flat v1 list into a single "Tasks" group
    if(!out.groups.length && Array.isArray(d.tasks) && d.tasks.length){
      out.groups = [{
        id: 'migrated', name: 'Tasks', collapsed: false,
        tasks: d.tasks.map(t => ({
          id: String(t.id), name: String(t.name),
          done: !!t.done, steps: [], open: false
        }))
      }];
    }
    out.groups.forEach(g => {
      g.tasks = Array.isArray(g.tasks) ? g.tasks : [];
      g.tasks.forEach(t => { t.steps = Array.isArray(t.steps) ? t.steps : []; });
    });
    return out;
  }catch(e){ return {...blank}; }
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(state)); }
  catch(e){ /* private mode / storage off — app still works for this session */ }
}

let state = load();

/* ── date helpers ─────────────────────────────────────── */
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayISO = () => iso(new Date());
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

/* last 7 days, oldest first */
function lastSeven(){
  const out = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date();
    d.setHours(12,0,0,0);
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

/* ══ TASK MANAGER (groups › tasks › steps) ══════════════ */
const groupList = document.getElementById('groupList');
const groupInput = document.getElementById('groupInput');
const taskCount = document.getElementById('taskCount');
const clearDone = document.getElementById('clearDone');
const clearAll  = document.getElementById('clearAll');

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* a task counts as done when it is ticked, or when every step is */
function taskDone(t){
  if(t.steps && t.steps.length) return t.steps.every(s => s.done);
  return !!t.done;
}
function taskPart(t){
  return !!(t.steps && t.steps.length && t.steps.some(s => s.done) && !t.steps.every(s => s.done));
}

/* how far along one task is, 0–1: steps count fractionally */
function taskFraction(t){
  if(t.steps && t.steps.length) return t.steps.filter(s => s.done).length / t.steps.length;
  return t.done ? 1 : 0;
}
function groupFraction(g){
  if(!g.tasks.length) return 0;
  return g.tasks.reduce((n, t) => n + taskFraction(t), 0) / g.tasks.length;
}

/* ── due dates ──────────────────────────────────────── */
const MS_DAY = 86400000;

function daysUntil(dateStr){
  const d = new Date(dateStr + 'T12:00:00');
  const now = new Date(); now.setHours(12,0,0,0);
  return Math.round((d - now) / MS_DAY);
}

function dueLabel(dateStr){
  const n = daysUntil(dateStr);
  if(n === 0)  return 'today';
  if(n === 1)  return 'tomorrow';
  if(n === -1) return '1 day late';
  if(n < 0)    return `${-n} days late`;
  if(n <= 6)   return `in ${n} days`;
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function dueClass(t){
  if(!t.due) return '';
  if(taskDone(t)) return ' set';
  const n = daysUntil(t.due);
  if(n < 0)  return ' set late';
  if(n === 0) return ' set today';
  if(n <= 2)  return ' set soon';
  return ' set';
}

function isLate(t){ return !!t.due && !taskDone(t) && daysUntil(t.due) < 0; }

/* two little music notes drift off whatever you just ticked */
function popNotes(el){
  if(state.skin === 'mono') return;                       // no ♪ in the plain skin
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  ['♪', '♫'].forEach((glyph, i) => {
    const n = document.createElement('span');
    n.className = 'note';
    n.textContent = glyph;
    n.style.left = (r.left + r.width / 2 - 6) + 'px';
    n.style.top  = (r.top - 4) + 'px';
    n.style.setProperty('--nx', (i ? 18 : -16) + 'px');
    n.style.animationDelay = (i * 90) + 'ms';
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 1100);
  });
}

function tickBtn(label, on, part, onClick){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tick' + (part ? ' part' : '');
  b.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#cone"/></svg>';
  b.setAttribute('aria-label', (on ? 'Mark unfinished: ' : 'Mark finished: ') + label);
  b.addEventListener('click', e => { if(!on) popNotes(e.currentTarget); onClick(e); });
  return b;
}
function miniBtn(cls, glyph, label, onClick){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mini ' + cls;
  b.textContent = glyph;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}
function inlineAdd(cls, placeholder, maxlen, onAdd){
  const form = document.createElement('form');
  form.className = cls;
  form.autocomplete = 'off';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = maxlen;
  input.placeholder = placeholder;
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.textContent = 'add';
  form.append(input, btn);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value.trim();
    if(!v) return;
    input.value = '';
    onAdd(v);
  });
  return form;
}

function renderStep(t, s){
  const li = document.createElement('li');
  li.className = 'step' + (s.done ? ' done' : '');
  li.append(
    tickBtn(s.name, s.done, false, () => { s.done = !s.done; save(); renderGroups(); }),
    Object.assign(document.createElement('span'), { className: 'name', textContent: s.name }),
    miniBtn('del', '×', 'Delete step: ' + s.name, () => {
      t.steps = t.steps.filter(x => x.id !== s.id);
      save(); renderGroups();
    })
  );
  return li;
}

function renderTask(g, t){
  const done = taskDone(t);
  const wrap = document.createElement('div');
  wrap.className = 'task' + (done ? ' done' : '');
  wrap.dataset.tid = t.id;

  const row = document.createElement('div');
  row.className = 'row';

  const tick = tickBtn(t.name, done, taskPart(t), () => {
    const next = !taskDone(t);
    t.done = next;
    if(t.steps) t.steps.forEach(s => s.done = next);   // ticking a task ticks its steps
    save(); renderGroups();
  });

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = t.name + (t.steps && t.steps.length
    ? `  (${t.steps.filter(s => s.done).length}/${t.steps.length})` : '');

  /* due-date pill — click to pick, click again to change, blank to clear */
  const due = document.createElement('button');
  due.type = 'button';
  due.className = 'due' + dueClass(t);
  due.textContent = t.due ? dueLabel(t.due) : 'due?';
  due.setAttribute('aria-label', t.due ? `Due ${t.due} — change` : 'Set a due date for: ' + t.name);
  due.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'due-input';
    input.value = t.due || '';
    const commit = () => {
      t.due = input.value || null;
      save(); renderGroups();
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => { if(e.key === 'Escape') renderGroups(); });
    due.replaceWith(input);
    input.focus();
    if(input.showPicker) try{ input.showPicker(); }catch(e){}
  });

  row.append(
    tick, name, due,
    miniBtn('plus', '+', 'Add a step to: ' + t.name, () => {
      t.open = true; save(); renderGroups();
      const el = wrap.querySelector('.step-add input');
      if(el) el.focus();
    }),
    miniBtn('del', '×', 'Delete task: ' + t.name, () => {
      g.tasks = g.tasks.filter(x => x.id !== t.id);
      save(); renderGroups();
    })
  );
  wrap.appendChild(row);

  const hasSteps = t.steps && t.steps.length;
  if(hasSteps || t.open){
    const ul = document.createElement('ul');
    ul.className = 'steps';
    (t.steps || []).forEach(s => ul.appendChild(renderStep(t, s)));
    const add = inlineAdd('step-add', 'a smaller step…', 60, v => {
      t.steps = t.steps || [];
      t.steps.push({ id: uid(), name: v, done: false });
      t.done = false;
      t.open = true;
      save(); renderGroups();
    });
    ul.appendChild(add);
    wrap.appendChild(ul);
  }

  return wrap;
}

function renderGroup(g){
  const total = g.tasks.length;
  const done = g.tasks.filter(taskDone).length;

  const box = document.createElement('section');
  box.className = 'group' + (g.collapsed ? ' collapsed' : '');
  box.dataset.gid = g.id;

  const head = document.createElement('div');
  head.className = 'group-head';
  head.append(
    miniBtn('caret', '▼', (g.collapsed ? 'Expand ' : 'Collapse ') + g.name, () => {
      g.collapsed = !g.collapsed; save(); renderGroups();
    }),
    Object.assign(document.createElement('span'), { className: 'group-name', textContent: g.name }),
    Object.assign(document.createElement('span'), {
      className: 'group-prog',
      textContent: total ? `${done}/${total}` : 'empty'
    }),
    miniBtn('del', g.armed ? 'sure?' : '×', 'Delete group: ' + g.name, () => {
      if(g.tasks.length && !g.armed){          // click once to arm, again to delete
        state.groups.forEach(x => x.armed = false);
        g.armed = true;
        renderGroups();
        return;
      }
      state.groups = state.groups.filter(x => x.id !== g.id);
      save(); renderGroups();
    })
  );
  head.querySelector('.caret').className = 'caret';

  const lateCount = g.tasks.filter(isLate).length;
  if(lateCount){
    const badge = document.createElement('span');
    badge.className = 'group-late';
    badge.textContent = lateCount + ' late';
    head.insertBefore(badge, head.querySelector('.group-prog'));
  }
  box.appendChild(head);

  const gbar = document.createElement('div');
  gbar.className = 'group-bar';
  const gfill = document.createElement('span');
  gfill.style.width = Math.round(groupFraction(g) * 100) + '%';
  gbar.appendChild(gfill);
  box.appendChild(gbar);

  const body = document.createElement('div');
  body.className = 'group-body';
  g.tasks.forEach(t => body.appendChild(renderTask(g, t)));
  body.appendChild(inlineAdd('task-add', 'add a task to ' + g.name + '…', 80, v => {
    const id = uid();
    g.tasks.push({ id, name: v, done: false, steps: [], open: false });
    g.collapsed = false;
    save(); renderGroups();
    revealNew(`[data-tid="${id}"]`);
  }));
  box.appendChild(body);

  return box;
}

function renderGroups(){
  groupList.innerHTML = '';
  state.groups.forEach(g => groupList.appendChild(renderGroup(g)));

  const all = state.groups.flatMap(g => g.tasks);
  const done = all.filter(taskDone).length;
  const left = all.length - done;
  taskCount.textContent = state.groups.length === 0
    ? 'no groups yet'
    : (all.length === 0 ? 'no tasks yet' : `${left} to go · ${done} done`);

  clearDone.style.display = done ? '' : 'none';
  clearAll.style.display = state.groups.length ? '' : 'none';
  if(!state.groups.length) disarmClearAll();
  renderProgress(all);
  if(typeof queueFit === 'function') queueFit();
  if(typeof watchGroups === 'function') watchGroups();
  if(typeof bubbleForState === 'function') say(bubbleForState());
}

/* ══ PROGRESS BAR + CELEBRATION ═════════════════════════ */
const fillEl = document.getElementById('fill');
const barEl  = document.getElementById('bar');
const pctEl  = document.getElementById('pct');
const rider  = document.getElementById('rider');

let wasFull = null;   // null until the first render, so a reload doesn't re-fire

function renderProgress(all){
  const pct = all.length
    ? Math.round(all.reduce((n, t) => n + taskFraction(t), 0) / all.length * 100)
    : 0;

  fillEl.style.width = pct + '%';
  if(rider){
    rider.style.left = pct + '%';
    rider.classList.toggle('hidden', pct === 0);
  }
  fillEl.classList.toggle('empty', pct === 0);
  fillEl.classList.toggle('full', pct === 100 && all.length > 0);
  pctEl.textContent = pct + '%';
  pctEl.classList.toggle('full', pct === 100 && all.length > 0);
  barEl.setAttribute('aria-valuenow', pct);

  const full = pct === 100 && all.length > 0;
  if(full && wasFull === false) celebrate();     // only on the moment it flips
  wasFull = full;
}

const cheer = document.getElementById('cheer');
const canvas = document.getElementById('confetti');
const ctx2d = canvas.getContext ? canvas.getContext('2d') : null;
let confettiId = null;

function celebrate(){
  cheer.classList.add('show');
  setTimeout(() => cheer.classList.remove('show'), 3600);
  if(rider) { rider.classList.add('cheer'); setTimeout(()=>rider.classList.remove('cheer'), 800); }
  beep();
  if(!ctx2d) return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.add('on');

  /* read the live palette so confetti matches whichever skin is on */
  const css = getComputedStyle(document.documentElement);
  const ink = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
  const COCOA  = ink('--cocoa',  '#4a2b22'),
        BLUSH  = state.skin === 'mono' ? '#e6e6e4' : ink('--blush',  '#f8b9c6'),
        CHOC   = state.skin === 'mono' ? '#5a5a58' : ink('--cocoa-mid', '#8a5240'),
        BERRY  = state.skin === 'mono' ? '#8e8e8c' : ink('--berry',  '#e1323c'),
        LEAF   = ink('--leaf',   '#57b15a'),
        BUTTER = ink('--butter', '#ffd24a');

  /* one candy cone, drawn as a rounded wedge with a pink cap */
  function drawCone(x, y, s, rot){
    ctx2d.save();
    ctx2d.translate(x, y); ctx2d.rotate(rot); ctx2d.scale(s / 100, s / 100);
    ctx2d.lineWidth = 8; ctx2d.strokeStyle = COCOA; ctx2d.lineJoin = 'round';
    const body = () => {
      ctx2d.beginPath();
      ctx2d.moveTo(0, -42);
      ctx2d.bezierCurveTo(-4, -42, -8, -36, -11, -25);
      ctx2d.lineTo(-29, 18);
      ctx2d.bezierCurveTo(-31, 25, -29, 28, -23, 28);
      ctx2d.quadraticCurveTo(-15, 35, -8, 28);      // fluted skirt
      ctx2d.quadraticCurveTo(0, 35, 8, 28);
      ctx2d.quadraticCurveTo(15, 35, 23, 28);
      ctx2d.bezierCurveTo(29, 28, 31, 25, 29, 18);
      ctx2d.lineTo(11, -25);
      ctx2d.bezierCurveTo(8, -36, 4, -42, 0, -42);
      ctx2d.closePath();
    };
    body(); ctx2d.fillStyle = CHOC; ctx2d.fill(); ctx2d.stroke();
    ctx2d.beginPath();                                  // pink cap
    ctx2d.moveTo(0, -42);
    ctx2d.bezierCurveTo(-4, -42, -8, -36, -11, -25);
    ctx2d.lineTo(-15, -10); ctx2d.lineTo(15, -10); ctx2d.lineTo(11, -25);
    ctx2d.bezierCurveTo(8, -36, 4, -42, 0, -42);
    ctx2d.closePath();
    ctx2d.fillStyle = BLUSH; ctx2d.fill(); ctx2d.stroke();
    ctx2d.restore();
  }

  /* one strawberry */
  function drawBerry(x, y, s, rot){
    ctx2d.save();
    ctx2d.translate(x, y); ctx2d.rotate(rot); ctx2d.scale(s / 100, s / 100);
    ctx2d.lineWidth = 7; ctx2d.strokeStyle = COCOA; ctx2d.lineJoin = 'round';
    ctx2d.beginPath();
    ctx2d.moveTo(0, -22);
    ctx2d.bezierCurveTo(28, -22, 34, -2, 30, 14);
    ctx2d.bezierCurveTo(26, 30, 12, 40, 0, 46);
    ctx2d.bezierCurveTo(-12, 40, -26, 30, -30, 14);
    ctx2d.bezierCurveTo(-34, -2, -28, -22, 0, -22);
    ctx2d.closePath();
    ctx2d.fillStyle = BERRY; ctx2d.fill(); ctx2d.stroke();
    ctx2d.beginPath();                                  // calyx
    ctx2d.moveTo(-18, -24); ctx2d.lineTo(0, -34); ctx2d.lineTo(18, -24);
    ctx2d.lineTo(0, -14); ctx2d.closePath();
    ctx2d.fillStyle = LEAF; ctx2d.fill(); ctx2d.stroke();
    ctx2d.restore();
  }

  /* a little four-point sparkle */
  function drawSpark(x, y, s, rot){
    ctx2d.save();
    ctx2d.translate(x, y); ctx2d.rotate(rot); ctx2d.scale(s / 100, s / 100);
    ctx2d.beginPath();
    ctx2d.moveTo(0, -40); ctx2d.quadraticCurveTo(6, -6, 40, 0);
    ctx2d.quadraticCurveTo(6, 6, 0, 40); ctx2d.quadraticCurveTo(-6, 6, -40, 0);
    ctx2d.quadraticCurveTo(-6, -6, 0, -40);
    ctx2d.closePath();
    ctx2d.fillStyle = BUTTER; ctx2d.fill();
    ctx2d.lineWidth = 6; ctx2d.strokeStyle = COCOA; ctx2d.stroke();
    ctx2d.restore();
  }

  /* mono celebrates with plain chips rather than sweets */
  function drawChip(x, y, s, rot){
    ctx2d.save();
    ctx2d.translate(x, y); ctx2d.rotate(rot);
    const w = s * 0.62, h = s * 0.42;
    ctx2d.fillStyle = [COCOA, CHOC, BLUSH][Math.floor(Math.abs(Math.sin(x)) * 3) % 3];
    ctx2d.strokeStyle = COCOA; ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    if(ctx2d.roundRect) ctx2d.roundRect(-w/2, -h/2, w, h, 2);
    else ctx2d.rect(-w/2, -h/2, w, h);
    ctx2d.fill(); ctx2d.stroke();
    ctx2d.restore();
  }

  const KINDS = state.skin === 'mono'
    ? [drawChip]
    : [drawCone, drawCone, drawBerry, drawSpark];
  const bits = Array.from({ length: 74 }, () => ({
    x: Math.random() * canvas.width,
    y: -40 - Math.random() * canvas.height * 0.6,
    s: 20 + Math.random() * 20,
    vy: 2.4 + Math.random() * 3.2,
    sway: 0.6 + Math.random() * 1.6,        // side-to-side drift
    phase: Math.random() * Math.PI * 2,
    rot: Math.random() * Math.PI,
    vr: -0.11 + Math.random() * 0.22,
    draw: KINDS[Math.floor(Math.random() * KINDS.length)]
  }));

  const started = Date.now();
  clearInterval(confettiId);
  confettiId = setInterval(() => {
    const t = (Date.now() - started) / 1000;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    bits.forEach(b => {
      b.y += b.vy; b.rot += b.vr;
      b.draw(b.x + Math.sin(t * 2 + b.phase) * b.sway * 9, b.y, b.s, b.rot);
    });
    if(Date.now() - started > 4600){
      clearInterval(confettiId); confettiId = null;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.remove('on');
    }
  }, 1000 / 45);
}

function revealNew(selector){
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = groupList.querySelector(selector);
    if(!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.classList.add('just-added');
    setTimeout(() => el.classList.remove('just-added'), 1200);
  }));
}

document.getElementById('addGroupForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = groupInput.value.trim();
  if(!name) return;
  const id = uid();
  state.groups.push({ id, name, collapsed: false, tasks: [] });
  groupInput.value = '';
  save(); renderGroups();
  revealNew(`[data-gid="${id}"]`);
});

/* clear all — one tap arms it, a second within 4s wipes the board */
let clearArmed = false, clearTimer = null;

function disarmClearAll(){
  clearArmed = false;
  clearTimeout(clearTimer);
  clearAll.classList.remove('armed');
  clearAll.textContent = 'clear all';
}

clearAll.addEventListener('click', () => {
  if(!clearArmed){
    clearArmed = true;
    clearAll.classList.add('armed');
    clearAll.textContent = 'erase everything?';
    clearTimer = setTimeout(disarmClearAll, 4000);
    return;
  }
  disarmClearAll();
  state.groups = [];
  save(); renderGroups();
});

clearDone.addEventListener('click', () => {
  state.groups.forEach(g => { g.tasks = g.tasks.filter(t => !taskDone(t)); });
  save(); renderGroups();
});

/* ══ DAILY STREAK ═══════════════════════════════════════ */
const weekRow    = document.getElementById('weekRow');
const curStreakEl  = document.getElementById('curStreak');
const bestStreakEl = document.getElementById('bestStreak');
const totalDaysEl  = document.getElementById('totalDays');

function markToday(){
  const t = todayISO();
  if(!state.days.includes(t)){
    state.days.push(t);
    save(); renderWeek();
  }
}

function currentStreak(){
  const set = new Set(state.days);
  const d = new Date(); d.setHours(12,0,0,0);
  // today not ticked yet shouldn't break yesterday's run
  if(!set.has(iso(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while(set.has(iso(d))){ n++; d.setDate(d.getDate() - 1); }
  return n;
}

function bestStreak(){
  const sorted = [...new Set(state.days)].sort();
  let best = 0, run = 0, prev = null;
  for(const s of sorted){
    const d = new Date(s + 'T12:00:00');
    if(prev && (d - prev) === 86400000) run++;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

function renderWeek(){
  weekRow.innerHTML = '';
  const t = todayISO();

  lastSeven().forEach(d => {
    const key = iso(d);
    const on  = state.days.includes(key);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day' + (on ? ' on' : '') + (key === t ? ' is-today' : '');
    btn.setAttribute('aria-label', key + (on ? ' — done' : ' — not done'));

    const box = document.createElement('span');
    box.className = 'box';
    box.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#berry"/></svg>';

    const lab = document.createElement('span');
    lab.className = 'lab';
    lab.textContent = DAY_LABELS[d.getDay()];

    btn.append(box, lab);
    btn.addEventListener('click', () => {
      if(state.days.includes(key)) state.days = state.days.filter(x => x !== key);
      else state.days.push(key);
      save(); renderWeek();
    });

    weekRow.appendChild(btn);
  });

  const lucky = document.getElementById('lucky');
  if(lucky) lucky.hidden = !state.days.includes(t);

  curStreakEl.textContent  = currentStreak();
  bestStreakEl.textContent = bestStreak();
  totalDaysEl.textContent  = new Set(state.days).size;
}

/* ══ FOCUS TIMER ════════════════════════════════════════ */
const clock     = document.getElementById('clock');
const startBtn  = document.getElementById('startBtn');
const resetBtn  = document.getElementById('resetTimer');
const timerNote = document.getElementById('timerNote');
const chips     = [...document.querySelectorAll('.chip')];
const plusBtn   = document.getElementById('plusBtn');
const minusBtn  = document.getElementById('minusBtn');

const STEP_MIN = 5;      // how much + and − move the clock
const MIN_SEC  = 0;      // reset takes it all the way to zero
const MAX_SEC  = 4 * 60 * 60;

let mins = state.timerMins;
let left = mins * 60;
let endsAt = null;
let tickId = null;

/* time actually spent focusing in this run, so the half-hour
   marker survives pauses and nudges */
const MARK_MS = 30 * 60 * 1000;
let elapsedMs = 0;       // banked from finished segments
let segStart  = null;    // when the current running segment began
let marksHit  = 0;

function focusedMs(){
  return elapsedMs + (segStart ? Date.now() - segStart : 0);
}
function resetRun(){
  elapsedMs = 0; segStart = null; marksHit = 0;
}

const fmt = s => {
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

function paint(){
  clock.textContent = fmt(Math.max(0, left));
  clock.classList.toggle('running', tickId !== null);
  minusBtn.disabled = left <= MIN_SEC;
  plusBtn.disabled  = left >= MAX_SEC;
  startBtn.disabled = left <= 0 && tickId === null;
}

/* + / − nudge the clock by 5 minutes, running or not */
function nudge(deltaMin){
  const next = Math.min(MAX_SEC, Math.max(MIN_SEC, left + deltaMin * 60));
  if(next === left) return;
  left = next;
  clock.classList.remove('done');
  if(tickId !== null) endsAt = Date.now() + left * 1000;   // keep a running timer honest
  else { mins = left / 60; state.timerMins = mins; save(); }
  chips.forEach(c => c.classList.toggle('active', Number(c.dataset.mins) * 60 === left && tickId === null));
  paint();
}

plusBtn.addEventListener('click',  () => nudge(STEP_MIN));
minusBtn.addEventListener('click', () => nudge(-STEP_MIN));

function setMins(m){
  mins = m;
  state.timerMins = m;
  save();
  chips.forEach(c => c.classList.toggle('active', Number(c.dataset.mins) === m));
  if(tickId === null){
    left = m * 60;
    clock.classList.remove('done');
    if(timerNote.textContent === 'add some time first.') timerNote.textContent = 'ready when you are.';
    paint();
  }
}

function stop(){
  if(segStart){ elapsedMs += Date.now() - segStart; segStart = null; }  // bank it
  clearInterval(tickId);
  tickId = null; endsAt = null;
  startBtn.textContent = 'start';
  paint();
}

function tick(){
  left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  paint();

  /* half-hour marker — skipped if the finish bell is about to ring anyway */
  const due = Math.floor(focusedMs() / MARK_MS);
  if(due > marksHit && left > 3){
    marksHit = due;
    mark();
    const half = due * 30;                    // 30, 60, 90, 120 …
    const h = Math.floor(half / 60), m = half % 60;
    const label = h === 0 ? m + ' min'
      : (h === 1 && m === 0) ? '1 hour'
      : h + (m ? '\u00bd' : '') + ' hours';
    timerNote.textContent = label + ' of focus — keep going.';
    say(label + ' in!');
    if(soundBtn){
      soundBtn.classList.add('ring');
      setTimeout(() => soundBtn.classList.remove('ring'), 700);
    }
  }

  if(left === 0){
    stop();
    clock.classList.add('done');
    timerNote.textContent = 'done — nice one. tick today off →';
    say('yatta! おつかれ');
    chime();
    resetRun();
    markToday();
  }
}

startBtn.addEventListener('click', () => {
  if(tickId !== null){                       // pause
    stop();
    timerNote.textContent = 'paused.';
    say('taking a breather?');
    return;
  }
  if(left <= 0){                             // nothing on the clock yet
    timerNote.textContent = 'add some time first.';
    return;
  }
  clock.classList.remove('done');
  endsAt = Date.now() + left * 1000;
  segStart = Date.now();
  tickId = setInterval(tick, 250);
  startBtn.textContent = 'pause';
  timerNote.textContent = 'go. phone face down.';
  say('focus mode — go!');
  paint();
});

resetBtn.addEventListener('click', () => {
  stop();
  resetRun();
  left = 0;                                   // back to 00:00
  clock.classList.remove('done');
  chips.forEach(c => c.classList.remove('active'));
  timerNote.textContent = 'pick a length, or + to add time.';
  paint();
});

chips.forEach(c => c.addEventListener('click', () => setMins(Number(c.dataset.mins))));

/* ══ SOUND ══════════════════════════════════════════════
   One shared AudioContext, unlocked on the first tap —
   browsers refuse to make noise before you interact, which
   is why a chime created cold can come out silent. Every
   note is synthesised, so there is no audio file to load. */
let actx = null;

function audio(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    if(!actx) actx = new Ctx();
    if(actx.state === 'suspended') actx.resume();   // Safari parks it otherwise
    return actx;
  }catch(e){ return null; }
}

/* unlock on the very first interaction, whatever it is */
['pointerdown','keydown','touchstart'].forEach(ev =>
  window.addEventListener(ev, () => audio(), { once:true, passive:true }));

/* one bell note: a sine body with a bright partial, struck and left to ring */
function bell(ctx, freq, at, dur, gain){
  const t = ctx.currentTime + at;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + 0.012);   // hard strike
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);   // long decay
  out.connect(ctx.destination);

  [[1, 1], [2.01, 0.32], [3.02, 0.12]].forEach(([mult, amp]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = mult === 1 ? 'sine' : 'triangle';
    o.frequency.value = freq * mult;
    g.gain.value = amp;
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
}

/* short tick for小 things — ticking a task, a UI ping */
function beep(){
  if(!state.sound) return;
  const ctx = audio(); if(!ctx) return;
  bell(ctx, 880, 0, 0.35, 0.16);
  bell(ctx, 1318.5, 0.09, 0.4, 0.12);
}

/* every half hour of focus: two quick wooden blips, about a
   quarter of a second all in. Short and dry on purpose — you
   should never mistake it for the finish bell.               */
function mark(){
  if(!state.sound) return;
  const ctx = audio(); if(!ctx) return;
  [[784, 0], [1046.5, 0.11]].forEach(([f, at]) => {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.008);   // sharp attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);  // clipped, no ring
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.16);
  });
}

/* the timer's finish: a proper little four-note chime that
   rings out, plus a soft echo of the last note              */
function chime(){
  if(!state.sound) return;
  const ctx = audio(); if(!ctx) return;
  // C6 · E6 · G6 · C7 — a bright major arpeggio
  const notes = [1046.5, 1318.5, 1568, 2093];
  notes.forEach((f, i) => bell(ctx, f, i * 0.16, 1.5 - i * 0.15, 0.2 - i * 0.02));
  bell(ctx, 2093, 0.86, 2.2, 0.1);          // the ring-out
  bell(ctx, 523.25, 0.9, 2.4, 0.07);        // a low sweetener underneath

  if(soundBtn){                              // the toggle rings along with it
    soundBtn.classList.add('ring');
    setTimeout(() => soundBtn.classList.remove('ring'), 1600);
  }
}

/* the toggle */
const soundBtn = document.getElementById('soundBtn');
function paintSound(){
  if(!soundBtn) return;
  soundBtn.classList.toggle('off', !state.sound);
  soundBtn.setAttribute('aria-pressed', String(!!state.sound));
  soundBtn.querySelector('.slab').textContent = state.sound ? 'chime on' : 'chime off';
}
if(soundBtn){
  soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    save(); paintSound();
    if(state.sound) mark();                  // hear what you just turned on
  });
}

/* keep the timer honest if the tab was backgrounded */
document.addEventListener('visibilitychange', () => {
  if(!document.hidden && tickId !== null) tick();
});

/* ══ MOBILE: shrink the task list until it fits ═════════
   Rather than scrolling, the panel steps down through
   five density levels — fewer tasks stay roomy, more
   tasks get compact. Only past the tightest level does
   the list start scrolling.                            */
const taskPanel = document.querySelector('.task-panel');
const DENSITY = ['', 'd2', 'd3', 'd4', 'd5'];

function fitTasks(){
  for(const level of DENSITY){
    taskPanel.classList.remove(...DENSITY.filter(Boolean));
    if(level) taskPanel.classList.add(level);
    // let the browser settle the new sizes before measuring
    if(groupList.scrollHeight <= groupList.clientHeight + 1) return;
  }
  // still too long at the tightest level — the list scrolls from here
}

let fitPending = null;
function queueFit(){
  cancelAnimationFrame(fitPending);
  fitPending = requestAnimationFrame(fitTasks);
}
window.addEventListener('resize', queueFit);
window.addEventListener('orientationchange', queueFit);

/* ══ SKINS ══════════════════════════════════════════════
   Same kit, different ink. The skin only swaps CSS custom
   properties on <html>, so every shape, shadow, motif and
   animation carries over untouched.                      */
const skinBtns = [...document.querySelectorAll('.skin')];

function applySkin(){
  document.documentElement.dataset.skin = state.skin;
  skinBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.skin === state.skin)));
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', state.skin === 'mono' ? '#ffffff' : '#fff7ee');
}

const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
let swapping = false;

/* the curtain: down, swap behind it, up again */
function switchSkin(next){
  if(swapping || state.skin === next) return;
  const calmNow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if(calmNow || !loader){                    // no theatre if motion is off
    state.skin = next; save(); applySkin();
    if(typeof mark === 'function') mark();
    return;
  }

  swapping = true;
  loaderText.textContent = next === 'mono' ? 'switching to mono…' : 'switching to candy…';
  loader.classList.remove('out');
  loader.classList.add('on');
  if(typeof mark === 'function') mark();

  setTimeout(() => {                          // swap while it is covered
    state.skin = next;
    save(); applySkin();
    loaderText.textContent = next === 'mono' ? 'mono' : 'candy';
  }, 420);

  setTimeout(() => {                          // lift the curtain
    loader.classList.remove('on');
    loader.classList.add('out');
  }, 900);

  setTimeout(() => {
    loader.classList.remove('out');
    swapping = false;
  }, 1320);
}

skinBtns.forEach(b => b.addEventListener('click', () => switchSkin(b.dataset.skin)));

/* ══ TOUCHABLE MOTIFS ═══════════════════════════════════
   Beri-chan tumbles when tapped, the floating cones and
   berries lean toward the pointer, and freshly rendered
   group cards pop in as they enter the list.            */
const bubble = document.getElementById('bubble');
function say(text){
  if(!bubble || bubble.textContent === text) return;
  bubble.textContent = text;
  bubble.classList.remove('swap');
  void bubble.offsetWidth;
  bubble.classList.add('swap');
}

const mascot = document.getElementById('mascot');
if(mascot){
  mascot.addEventListener('click', () => {
    mascot.classList.remove('spin');
    void mascot.offsetWidth;                 // restart the animation
    mascot.classList.add('spin');
    setTimeout(() => mascot.classList.remove('spin'), 900);
    say('よろしく!');
    setTimeout(() => say(bubbleForState()), 1800);
  });
}

const floats = [...document.querySelectorAll('.float')];
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if(floats.length && !calm){
  let px = 0, py = 0, raf = null;
  const lean = () => {
    raf = null;
    floats.forEach(f => {
      const d = Number(f.dataset.depth || 20) / 100;
      f.style.translate = `${px * d}px ${py * d}px`;
    });
  };
  const track = (x, y) => {
    px = (x / window.innerWidth  - .5) * 100;
    py = (y / window.innerHeight - .5) * 100;
    if(!raf) raf = requestAnimationFrame(lean);
  };
  window.addEventListener('pointermove', e => track(e.clientX, e.clientY), { passive:true });
  // on a phone there is no pointer to follow, so the list's scroll drives them
  window.addEventListener('scroll', () => track(window.innerWidth / 2,
    window.innerHeight / 2 + window.scrollY), { passive:true });
}

/* group cards pop in the first time they scroll into the list */
const popSeen = new WeakSet();
const popObserver = ('IntersectionObserver' in window && !calm)
  ? new IntersectionObserver(entries => {
      entries.forEach(en => {
        if(en.isIntersecting && !popSeen.has(en.target)){
          popSeen.add(en.target);
          en.target.classList.add('pop');
          setTimeout(() => en.target.classList.remove('pop'), 500);
        }
      });
    }, { root: groupList, threshold: .15 })
  : null;

function watchGroups(){
  if(!popObserver) return;
  groupList.querySelectorAll('.group').forEach(el => popObserver.observe(el));
}

/* what Beri-chan should be saying right now */
function bubbleForState(){
  if(typeof tickId !== 'undefined' && tickId !== null) return 'focus mode — go!';
  const all = state.groups.flatMap(g => g.tasks);
  if(all.length && all.every(taskDone)) return 'all done — yatta!';
  if(!state.groups.length) return 'add a group to start';
  const left = all.filter(t => !taskDone(t)).length;
  if(left) return left + (left === 1 ? ' thing left' : ' things left');
  return 'ready when you are!';
}

/* ══ GO ═════════════════════════════════════════════════ */
applySkin();
paintSound();
document.getElementById('year').textContent = new Date().getFullYear();
setMins(mins);
renderGroups();
watchGroups();
say(bubbleForState());
renderWeek();
paint();
fitTasks();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
