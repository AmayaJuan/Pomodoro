//==== main.js - FIXED idioma ES/EN ====

const langs = {
  es: {
    statusWork: 'Enfocado en trabajo',
    statusBreak: 'Hora de descanso',
    pomodoros: 'Pomodoros completados',
    pomodoroDone: 'Pomodoro completado',
    backWork: 'Vuelve al trabajo',
    paused: 'Pausado',
    reset: 'Reiniciado'
  },
  en: {
    statusWork: 'Focused on work',
    statusBreak: 'Break time',
    pomodoros: 'Pomodoros completed',
    pomodoroDone: 'Pomodoro completed',
    backWork: 'Back to work',
    paused: 'Paused',
    reset: 'Reset'
  }
};

let currentLang = 'es'; // Default español

const elements = {
  timerEl: document.getElementById('timer'),
  statusEl: document.getElementById('status'),
  progressEl: document.getElementById('progress'),
  countEl: document.getElementById('count'),
  workInput: document.getElementById('workTime'),
  breakInput: document.getElementById('breakTime'),
  langSelect: document.getElementById('langSelect'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resetBtn: document.getElementById('resetBtn')
};

const state = {
  lang: 'es',
  interval: null,
  time: 1500,
  totalTime: 1500,
  isWork: true,
  completed: 0,
  isRunning: false
};

// Load lang from localStorage
if (localStorage.getItem('pomodoroLang')) {
  currentLang = localStorage.getItem('pomodoroLang');
}
elements.langSelect.value = currentLang;

// Update UI texts
function updateUIText() {
  const t = langs[currentLang];
  elements.statusEl.textContent = state.isWork ? t.statusWork : t.statusBreak;
  const countText = document.querySelector('.status p');
  countText.innerHTML = `${t.pomodoros}: <span id="count">${state.completed}</span>`;
}

// Speech
function speak(text) {
  speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = currentLang === 'es' ? 'es-ES' : 'en-US';
  msg.rate = 0.9;
  
  speechSynthesis.speak(msg);
}

// Update display
function updateDisplay() {
  const m = Math.floor(state.time / 60);
  const s = state.time % 60;
  elements.timerEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  
  const progress = ((state.totalTime - state.time) / state.totalTime) * 100;
  elements.progressEl.style.width = progress + '%';
}

// Set mode
function setMode(isWork) {
  state.isWork = isWork;
  updateUIText();
  
  if (isWork) {
    state.totalTime = parseInt(elements.workInput.value) * 60 || 25 * 60;
  } else {
    state.totalTime = parseInt(elements.breakInput.value) * 60 || 5 * 60;
  }
  
  state.time = state.totalTime;
  updateDisplay();
}

// Timer
function startTimer() {
  if (state.isRunning) return;
  
  state.isRunning = true;
  const langText = state.isWork ? langs[currentLang].startWork : langs[currentLang].startBreak;
  speak(langText);
  
  const endTime = Date.now() + state.time * 1000;
  state.interval = setInterval(() => {
    state.time = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    updateDisplay();
    
    if (state.time <= 0) {
      clearInterval(state.interval);
      state.isRunning = false;
      handleEnd();
    }
  }, 50);
}

function pauseTimer() {
  clearInterval(state.interval);
  state.isRunning = false;
  speak(langs[currentLang].paused);
}

function resetTimer() {
  clearInterval(state.interval);
  state.isRunning = false;
  state.completed = 0;
  updateDisplay();
  setMode(true);
  speak(langs[currentLang].reset);
  localStorage.setItem('pomodoroCompleted', 0);
}

function handleEnd() {
  const t = langs[currentLang];
  if (state.isWork) {
    state.completed++;
    updateDisplay();
    speak(t.pomodoroDone);
    setMode(false);
  } else {
    speak(t.backWork);
    setMode(true);
  }
  localStorage.setItem('pomodoroCompleted', state.completed);
}

// Events
elements.langSelect.onchange = (e) => {
  currentLang = e.target.value;
  localStorage.setItem('pomodoroLang', currentLang);
  updateUIText();
  speak(langs[currentLang].reset);
};

elements.startBtn.onclick = startTimer;
elements.pauseBtn.onclick = pauseTimer;
elements.resetBtn.onclick = resetTimer;

elements.workInput.oninput = () => state.isWork && !state.isRunning && setMode(true);
elements.breakInput.oninput = () => !state.isWork && !state.isRunning && setMode(false);

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    state.isRunning ? pauseTimer() : startTimer();
  } else if (e.code === 'KeyR') {
    resetTimer();
  }
});

// Notification
if ('Notification' in window) {
  Notification.requestPermission();
}

// Init
updateUIText();
setMode(true);
