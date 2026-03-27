//==== main.js===============

const state = {
   interval: null,
   time: 0,
   totalTime: 0,
   isWork: true,
   completed: 0,
   isRunning: false
};

const timerEl = document.getElementById('timer');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
const countEl = document.getElementById('count');

const workInput = document.getElementById('workTime');
const breakInput = document.getElementById('breakTime');

// 🔊 VOICE PRO
function speak(text, lang = 'en-US') {
    speechSynthesis.cancel();

    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = lang;
    msg.rate = 1;

    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === lang);

    if(voice) msg.voice = voice;

    speechSynthesis.speak(msg);
}

// ⏱️ DISPLAY + PROGRESS
function updateDisplay() {
    const m = Math.floor(state.time / 60);
    const s = state.time % 60;

    timerEl.innerText = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    const progress = state.totalTime > 0
      ? ((state.totalTime - state.time) / state.totalTime) * 100
      : 0;

    progressEl.style.width = progress + '%';
}

// 🔄 MODE CHANGE
function setMode(work) {
    state.isWork = work;

    if (work) {
        state.totalTime = workInput.value * 60;
        statusEl.innerText = 'Focused on work';
    } else {
        state.totalTime = breakInput.value * 60;
        statusEl.innerText = 'Break time';
    }

    state.time = state.totalTime;
    updateDisplay();
}

// 🎯 END OF CYCLE
function handleEnd() {
    if(state.isWork) {
        state.completed++;
        countEl.innerText = state.completed;

        speak('Pomodoro completed');
        notify('Pomodoro completed');

        setMode(false);
    } else {
        speak('Back to work');
        notify('Back to work');
        
        setMode(true);
    }

    startTimer();
}

// ⏱️ PRECISE TIMER
let endTime = 0;

function startTimer() {
    if(state.isRunning) return;

    state.isRunning = true;
    endTime = Date.now() + state.time * 1000;

    speak(state.isWork ? 'Starting work' : 'Break started');

    state.interval = setInterval(() => {
      const remaining = Math.round((endTime - Date.now()) / 1000);
      state.time = remaining > 0 ? remaining : 0;

      updateDisplay();

      if(state.time <= 0) {
        clearInterval(state.interval);
        state.isRunning = false;
        handleEnd();  
       }
    }, 250)
}

// ⏸️ PAUSE
function pauseTimer() {
    clearInterval(state.interval);
    state.isRunning = false;
    speak('Paused');
}

// 🔄 RESET
function resetTimer() {
    clearInterval(state.interval);
    state.isRunning = false;

    state.completed = 0;
    countEl.innerText = state.completed;

    setMode(true);
    speak('Reset');
}

// 💾 SAVED
function saveState() {
    localStorage.setItem('pomodoro', JSON.stringify(state));
}

function loadState() {
    const saved = JSON.parse(localStorage.getItem('pomodoro'));
    if(saved) Object.assign(state, saved);
}

// 🔔 NOTIFICATIONS
function notify(text) {
    if(Notification.permission === 'granted')
        new Notification(text)
}

Notification.requestPermission();

// 🎛️ EVENTS
document.getElementById('startBtn').onclick = startTimer;
document.getElementById('pauseBtn').onclick = pauseTimer;
document.getElementById('resetBtn').onclick = resetTimer;

// INIT
setMode(true);
