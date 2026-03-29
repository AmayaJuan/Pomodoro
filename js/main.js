/* =============================================
   Pomodoro Pro — main.js
   Lee configuración desde config.json
   ============================================= */

/* ── Estado de la aplicación ──────────────── */
const state = {
  lang:         'es',
  phase:        'work',       // 'work' | 'break' | 'longBreak' | 'meal'
  mealIdx:      null,         // índice de la comida activa (0-3)
  running:      false,
  interval:     null,
  time:         0,
  totalTime:    0,
  completed:    0,
  settingsOpen: false,
  toastTimer:   null,

  // Datos de config.json (cargados al init)
  config:       null,

  // Estado de comidas (se fusiona con config.json al cargar)
  meals: []
};

/* ── Helpers DOM ───────────────────────────── */
const v  = (id) => document.getElementById(id);
const vv = (sel) => document.querySelector(sel);

function numVal(id) {
  return parseInt(v(id).value) || 0;
}

/* ── Cargar config.json ────────────────────── */
async function loadConfig() {
  try {
    const res  = await fetch('config.json');
    const cfg  = await res.json();
    state.config = cfg;

    // Aplicar defaults a los inputs
    const d = cfg.defaults;
    v('workTime').value  = d.workTime;
    v('shortBreak').value = d.shortBreak;
    v('longBreak').value  = d.longBreak;
    v('cycleLen').value   = d.cycleLength;

    // Construir estado de comidas desde JSON
    state.meals = cfg.meals.map((m, i) => ({
      icon:      m.icon,
      id:        m.id,
      duration:  m.defaultDuration,
      trigger:   m.defaultTrigger,
      enabled:   m.enabled
    }));

    // Renderizar comidas dinámicamente
    renderMealItems();

    // Restaurar estado guardado en localStorage
    restoreFromStorage();

    // Inicializar UI
    applyLang();
    setPhase('work');
    updateCycleDots();
    updateCount();
    updateAutoBreakInfo();

  } catch (err) {
    console.error('Error cargando config.json:', err);
    // Fallback: iniciar con valores hardcoded si falla el fetch
    fallbackInit();
  }
}

/* ── Restaurar localStorage ────────────────── */
function restoreFromStorage() {
  const savedLang = localStorage.getItem('pm_lang');
  if (savedLang && state.config.langs[savedLang]) {
    state.lang = savedLang;
  }

  const savedCompleted = parseInt(localStorage.getItem('pm_completed') || '0');
  state.completed = savedCompleted;
}

function saveToStorage() {
  localStorage.setItem('pm_lang',      state.lang);
  localStorage.setItem('pm_completed', state.completed);
}

/* ── Traducción ────────────────────────────── */
function t(key, vars = {}) {
  const val = state.config?.langs?.[state.lang]?.[key];
  if (val === undefined || val === null) return key;
  if (Array.isArray(val)) return val;
  return String(val).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function mealName(i) {
  const names = t('mealNames');
  return Array.isArray(names) ? (names[i] || '') : '';
}

/* ── Fases ─────────────────────────────────── */
function setPhase(phase, mealIdx = null) {
  state.phase   = phase;
  state.mealIdx = mealIdx;

  // Calcular duración
  let sec;
  if (phase === 'work')      sec = numVal('workTime')  * 60;
  else if (phase === 'break')     sec = numVal('shortBreak') * 60;
  else if (phase === 'longBreak') sec = numVal('longBreak')  * 60;
  else if (phase === 'meal')      sec = (state.meals[mealIdx]?.duration || 15) * 60;

  state.time      = sec;
  state.totalTime = sec;

  // Actualizar colores CSS
  const phaseColors = state.config?.phases?.[phase];
  if (phaseColors) {
    document.documentElement.style.setProperty('--phase-color',  phaseColors.color);
    document.documentElement.style.setProperty('--phase-shadow', phaseColors.shadowColor);
  }

  updatePhaseLabel();
  updateTimerDisplay();
  updateRing();
}

function updatePhaseLabel() {
  let label;
  if (state.phase === 'meal' && state.mealIdx !== null) {
    const meal = state.meals[state.mealIdx];
    label = `${meal.icon} ${mealName(state.mealIdx)}`;
  } else {
    label = t(state.phase);
  }
  v('phaseLabel').textContent = label.toUpperCase();
}

/* ── Qué descanso corresponde ──────────────── */
function getBreakAfter(count) {
  // Comidas tienen prioridad
  for (let i = 0; i < state.meals.length; i++) {
    if (state.meals[i].enabled && count === state.meals[i].trigger) {
      return { type: 'meal', idx: i };
    }
  }
  // Descanso largo al completar ciclo
  const cycleLen = numVal('cycleLen');
  if (cycleLen > 0 && count % cycleLen === 0) {
    return { type: 'longBreak' };
  }
  return { type: 'break' };
}

/* ── Timer ─────────────────────────────────── */
function startTimer() {
  if (state.running) return;
  if (state.time <= 0) setPhase(state.phase, state.mealIdx);

  state.running = true;
  v('mainBtn').textContent = '⏸';
  updateStatus(t('running'));
  speak(t('startPhase_' + state.phase));

  const endTime = Date.now() + state.time * 1000;

  state.interval = setInterval(() => {
    state.time = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    updateTimerDisplay();
    updateRing();

    if (state.time <= 0) {
      clearInterval(state.interval);
      state.running = false;
      handlePhaseEnd();
    }
  }, 100);
}

function pauseTimer() {
  clearInterval(state.interval);
  state.running = false;
  v('mainBtn').textContent = '▶';
  updateStatus(t('paused'));
  speak(t('paused'));
}

function toggleTimer() {
  state.running ? pauseTimer() : startTimer();
}

function resetTimer() {
  clearInterval(state.interval);
  state.running  = false;
  state.completed = 0;
  v('mainBtn').textContent = '▶';
  setPhase('work');
  updateStatus(t('ready'));
  updateCycleDots();
  updateCount();
  saveToStorage();
  showToast(t('reset'));
}

function skipPhase() {
  clearInterval(state.interval);
  state.running = false;
  showToast(t('skipped'));
  if (state.phase === 'work') {
    handlePhaseEnd();
  } else {
    setPhase('work');
  }
}

/* ── Fin de fase ───────────────────────────── */
function handlePhaseEnd() {
  if (state.phase === 'work') {
    state.completed++;
    updateCount();
    saveToStorage();

    const next = getBreakAfter(state.completed);

    if (next.type === 'meal') {
      const label = mealName(next.idx);
      const msg   = t('mealTime', { name: label });
      showToast(msg);
      speak(msg);
      setPhase('meal', next.idx);
    } else if (next.type === 'longBreak') {
      showToast(t('pomodoroDone'));
      speak(t('pomodoroDone'));
      setPhase('longBreak');
    } else {
      showToast(t('pomodoroDone'));
      speak(t('pomodoroDone'));
      setPhase('break');
    }

    updateCycleDots();

  } else {
    showToast(t('backWork'));
    speak(t('backWork'));
    setPhase('work');
    updateCycleDots();
  }

  // Auto-start si está habilitado en config
  if (state.config?.defaults?.autoStart) {
    setTimeout(() => { if (!state.running) startTimer(); }, 1000);
  }
}

/* ── UI: display ───────────────────────────── */
function updateTimerDisplay() {
  const m = String(Math.floor(state.time / 60)).padStart(2, '0');
  const s = String(state.time % 60).padStart(2, '0');
  v('timerDisplay').textContent = `${m}:${s}`;
}

function updateRing() {
  const circ = 628;
  const pct  = state.totalTime > 0 ? (state.totalTime - state.time) / state.totalTime : 0;
  v('ringProgress').style.strokeDashoffset = circ - pct * circ;
}

function updateCycleDots() {
  const n    = numVal('cycleLen');
  const wrap = v('cycleDots');
  wrap.innerHTML = '';
  const pos = state.completed % (n || 1);

  for (let i = 0; i < n; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    if (i < pos) dot.classList.add('done');
    else if (i === pos && state.phase === 'work') dot.classList.add('current');
    wrap.appendChild(dot);
  }
}

function updateCount() {
  const c = state.completed;
  v('countDisplay').textContent  = c;
  v('pomLabel').textContent = c === 1 ? t('pomodoro') : t('pomodoros');
}

function updateStatus(txt) {
  v('statusText').textContent = txt;
}

function updateAutoBreakInfo() {
  const s = numVal('shortBreak');
  const l = numVal('longBreak');
  const c = numVal('cycleLen');
  v('autoBreakInfo').textContent = t('autoBreakInfo', { short: s, long: l, cycle: c });
}

/* ── Settings panel ────────────────────────── */
function toggleSettings() {
  state.settingsOpen = !state.settingsOpen;
  v('settingsPanel').classList.toggle('open', state.settingsOpen);
  v('settingsToggleBtn').textContent = state.settingsOpen
    ? t('btnClose')
    : t('btnSettings');
  if (state.settingsOpen) updateAutoBreakInfo();
}

function step(id, delta) {
  const el  = v(id);
  const min = parseInt(el.min) || 0;
  const max = parseInt(el.max) || 999;
  el.value  = Math.min(max, Math.max(min, (parseInt(el.value) || 0) + delta));
  onSettingChange();
}

function onSettingChange() {
  if (!state.running) setPhase(state.phase, state.mealIdx);
  updateCycleDots();
  updateAutoBreakInfo();
}

/* ── Comidas ───────────────────────────────── */
function renderMealItems() {
  const container = v('mealContainer');
  if (!container) return;
  container.innerHTML = '';

  state.meals.forEach((meal, i) => {
    const item = document.createElement('div');
    item.className = `meal-item${meal.enabled ? ' active' : ''}`;
    item.id        = `mealItem_${i}`;
    item.onclick   = () => toggleMeal(i);

    item.innerHTML = `
      <div class="meal-info">
        <div class="meal-name" id="mealName_${i}">${meal.icon} ${mealName(i)}</div>
        <div class="meal-when" id="mealWhen_${i}"></div>
      </div>
      <div class="meal-right">
        <span class="setting-unit" style="font-size:10px" id="lTrigger_${i}"></span>
        <input class="meal-trigger-input" type="number"
               id="mealTrigger_${i}" value="${meal.trigger}"
               min="1" max="50"
               onclick="event.stopPropagation()"
               oninput="onMealTriggerChange(${i})">
        <span class="meal-sep">·</span>
        <input class="meal-dur-input" type="number"
               id="mealDur_${i}" value="${meal.duration}"
               min="5" max="120"
               onclick="event.stopPropagation()"
               oninput="onMealDurChange(${i})">
        <span class="setting-unit">min</span>
        <div class="toggle-switch${meal.enabled ? ' on' : ''}" id="mealSwitch_${i}"></div>
      </div>
    `;

    container.appendChild(item);
  });

  updateMealLabels();
}

function toggleMeal(i) {
  state.meals[i].enabled = !state.meals[i].enabled;
  v(`mealItem_${i}`).classList.toggle('active',    state.meals[i].enabled);
  v(`mealSwitch_${i}`).classList.toggle('on',      state.meals[i].enabled);
}

function onMealTriggerChange(i) {
  const val = parseInt(v(`mealTrigger_${i}`).value) || 1;
  state.meals[i].trigger = val;
  updateMealLabels();
}

function onMealDurChange(i) {
  const val = parseInt(v(`mealDur_${i}`).value) || 5;
  state.meals[i].duration = val;
}

function updateMealLabels() {
  const afterText = t('mealAfter');
  state.meals.forEach((meal, i) => {
    const whenEl    = v(`mealWhen_${i}`);
    const triggerEl = v(`lTrigger_${i}`);
    if (whenEl)    whenEl.textContent    = `${afterText} ${meal.trigger}`;
    if (triggerEl) triggerEl.textContent = `#`;
  });
}

/* ── Idioma ────────────────────────────────── */
function toggleLang() {
  state.lang = state.lang === 'es' ? 'en' : 'es';
  saveToStorage();
  applyLang();
}

function applyLang() {
  if (!state.config) return;

  // Campos estáticos
  const fields = [
    ['lWorkTime',   'lWorkTime'],
    ['lShortBreak', 'lShortBreak'],
    ['lLongBreak',  'lLongBreak'],
    ['lCycleLen',   'lCycleLen'],
    ['lMin1',       'lMin'],
    ['lMin2',       'lMin'],
    ['lMin3',       'lMin'],
    ['lCycles',     'lCycles'],
    ['lMealBreaks', 'lMealBreaks'],
    ['settingsTitle','settingsTitle'],
  ];

  fields.forEach(([id, key]) => {
    const el = v(id);
    if (el) el.textContent = t(key);
  });

  // Nombres de comidas
  state.meals.forEach((meal, i) => {
    const nameEl = v(`mealName_${i}`);
    if (nameEl) nameEl.textContent = `${meal.icon} ${mealName(i)}`;
  });

  // Hint del teclado
  const kbEl = v('kbHint');
  if (kbEl) kbEl.innerHTML = t('kbHint');

  // Botón settings
  v('settingsToggleBtn').textContent = state.settingsOpen ? t('btnClose') : t('btnSettings');

  updateMealLabels();
  updateAutoBreakInfo();
  updatePhaseLabel();
  updateStatus(!state.running ? t('ready') : t('running'));
  updateCount();
}

/* ── Voz (TTS) ─────────────────────────────── */
function speak(text) {
  try {
    speechSynthesis.cancel();
    const u    = new SpeechSynthesisUtterance(text);
    u.lang     = state.config?.langs?.[state.lang]?.speechLang || 'es-ES';
    u.rate     = state.config?.defaults?.speechRate || 0.92;
    speechSynthesis.speak(u);
  } catch (_) {}
}

/* ── Toast ─────────────────────────────────── */
function showToast(msg) {
  const el = v('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/* ── Teclado ───────────────────────────────── */
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

  if (e.code === 'Space') { e.preventDefault(); toggleTimer(); }
  else if (e.code === 'KeyR') resetTimer();
  else if (e.code === 'KeyS') skipPhase();
});

/* ── Notificaciones del sistema ────────────── */
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

/* ── Fallback si config.json no carga ──────── */
function fallbackInit() {
  console.warn('Usando valores por defecto (config.json no disponible)');
  state.config = {
    defaults: { workTime:25, shortBreak:5, longBreak:15, cycleLength:4, speechRate:0.92, autoStart:true },
    phases: {
      work:      { color:'#e05c3a', shadowColor:'rgba(224,92,58,.3)' },
      break:     { color:'#4a9b7f', shadowColor:'rgba(74,155,127,.3)' },
      longBreak: { color:'#7b9fd4', shadowColor:'rgba(123,159,212,.3)' },
      meal:      { color:'#c4a882', shadowColor:'rgba(196,168,130,.3)' }
    },
    meals: [],
    langs: {
      es: {
        work:'Trabajo', break:'Descanso corto', longBreak:'Descanso largo', meal:'Comida',
        ready:'Listo para empezar', paused:'Pausado', running:'Enfocado',
        pomodoroDone:'¡Pomodoro completado!', backWork:'¡Vuelve al trabajo!',
        mealTime:'¡Hora de {name}!', reset:'Reiniciado', skipped:'Fase saltada',
        pomodoros:'pomodoros', pomodoro:'pomodoro',
        autoBreakInfo:'Descanso corto {short}min · Descanso largo {long}min cada {cycle} pomodoros',
        lWorkTime:'Trabajo', lShortBreak:'Descanso corto', lLongBreak:'Descanso largo',
        lCycleLen:'Por ciclo', lMin:'min', lCycles:'ciclos', lMealBreaks:'Comidas',
        settingsTitle:'Configuración', mealAfter:'Después del #', mealNames:['Desayuno','Almuerzo','Merienda','Cena'],
        btnSettings:'⚙ Ajustes', btnClose:'✕ Cerrar',
        kbHint:'<span class="kb-key">Espacio</span> pausar &nbsp;·&nbsp; <span class="kb-key">R</span> reiniciar',
        speechLang:'es-ES'
      },
      en: {
        work:'Work', break:'Short break', longBreak:'Long break', meal:'Meal',
        ready:'Ready to start', paused:'Paused', running:'Focused',
        pomodoroDone:'Pomodoro done!', backWork:'Back to work!',
        mealTime:'Time for {name}!', reset:'Reset', skipped:'Skipped',
        pomodoros:'pomodoros', pomodoro:'pomodoro',
        autoBreakInfo:'Short break {short}min · Long break {long}min every {cycle} pomodoros',
        lWorkTime:'Work time', lShortBreak:'Short break', lLongBreak:'Long break',
        lCycleLen:'Per cycle', lMin:'min', lCycles:'cycles', lMealBreaks:'Meal breaks',
        settingsTitle:'Settings', mealAfter:'After #', mealNames:['Breakfast','Lunch','Snack','Dinner'],
        btnSettings:'⚙ Settings', btnClose:'✕ Close',
        kbHint:'<span class="kb-key">Space</span> pause &nbsp;·&nbsp; <span class="kb-key">R</span> reset',
        speechLang:'en-US'
      }
    }
  };
  state.meals = [];
  applyLang();
  setPhase('work');
  updateCycleDots();
  updateCount();
  updateAutoBreakInfo();
}

/* ── Arranque ──────────────────────────────── */
loadConfig();