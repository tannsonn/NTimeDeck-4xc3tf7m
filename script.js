// State Management
const STORAGE_KEY = 'aestheticTimerState';

const defaultState = {
    settings: {
        bgPreset: 'gradient-aurora',
        bgUrl: '',
        soundTimer: './sounds/timer-bell.mp3',
        soundAlarm: './sounds/alarm-clock.mp3',
        soundPomo: './sounds/timer-bell.mp3',
        loopNotification: 'once',
        pomoAutoAdvance: false
    },
    timers: [
        { id: generateId(), name: '10m', totalSeconds: 600, remaining: 600, isRunning: false, isPinned: true, endTime: null },
        { id: generateId(), name: '15m', totalSeconds: 900, remaining: 900, isRunning: false, isPinned: true, endTime: null },
        { id: generateId(), name: '25m', totalSeconds: 1500, remaining: 1500, isRunning: false, isPinned: false, endTime: null }
    ],
    alarms: [],
    pomodoro: {
        mode: 'pomodoro',
        times: { pomodoro: 1500, shortBreak: 300, longBreak: 900 },
        remaining: 1500,
        isRunning: false,
        endTime: null
    }
};

let state = JSON.parse(JSON.stringify(defaultState));

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...defaultState, ...parsed };
            state.settings = { ...defaultState.settings, ...(parsed.settings || {}) };
            state.pomodoro = { ...defaultState.pomodoro, ...(parsed.pomodoro || {}) };
            state.pomodoro.times = { ...defaultState.pomodoro.times, ...(parsed.pomodoro?.times || {}) };
        }
    } catch (e) {
        console.error("Failed to load state", e);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Audio System
const AudioSys = {
    audio: null,

    play(src, loop = false) {
        this.stop();
        if (!src) return;
        this.audio = new Audio(src);
        this.audio.loop = loop;
        this.audio.play().catch(e => console.error("Audio play failed:", e));
    },

    stop() {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audio = null;
        }
    }
};

// UI Elements & App Logic
const App = {
    intervalId: null,
    activeTab: 'timer',
    contextMenuTarget: null,
    activeTimerId: null,
    timersExpanded: false,

    init() {
        loadState();
        if (state.timers.length > 0) {
            this.activeTimerId = state.timers[0].id;
        }
        this.setupEventListeners();
        this.applySettings();
        this.renderAll();
        
        // Initial width calc with a small delay for DOM render
        setTimeout(() => this.updateTimerPillsWidth(), 50);
        window.addEventListener('resize', () => {
            if (this.activeTab === 'timer') {
                this.updateTimerPillsWidth();
            }
        });
        
        this.intervalId = setInterval(() => this.tick(), 200);
        this.recalculateTimes();
    },

    recalculateTimes() {
        const now = Date.now();
        state.timers.forEach(t => {
            if (t.isRunning && t.endTime) {
                t.remaining = Math.max(0, Math.ceil((t.endTime - now) / 1000));
                if (t.remaining === 0) this.triggerAlarm('タイマー終了', t.name, 'timer');
            }
        });
        if (state.pomodoro.isRunning && state.pomodoro.endTime) {
            state.pomodoro.remaining = Math.max(0, Math.ceil((state.pomodoro.endTime - now) / 1000));
            if (state.pomodoro.remaining === 0) this.triggerAlarm('ポモドーロ終了', state.pomodoro.mode, 'pomo');
        }
    },

    setupEventListeners() {
        // Hamburger Menu
        document.getElementById('menu-btn').addEventListener('click', () => {
            document.getElementById('nav-drawer').classList.toggle('hidden');
        });
        
        // Close drawer when clicking outside
        document.addEventListener('click', (e) => {
            const drawer = document.getElementById('nav-drawer');
            const menuBtn = document.getElementById('menu-btn');
            if (!drawer.contains(e.target) && !menuBtn.contains(e.target) && !drawer.classList.contains('hidden')) {
                drawer.classList.add('hidden');
            }
        });

        // Tabs & Navigation
        document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = btn.dataset.tab;
                document.getElementById('nav-drawer').classList.add('hidden'); // Close drawer on selection

                if (tab === 'settings') {
                    // Open settings modal instead of switching tab
                    document.getElementById('setting-pomo-pomo').value = Math.floor(state.pomodoro.times.pomodoro / 60);
                    document.getElementById('setting-pomo-short').value = Math.floor(state.pomodoro.times.shortBreak / 60);
                    document.getElementById('setting-pomo-long').value = Math.floor(state.pomodoro.times.longBreak / 60);
                    document.getElementById('modal-settings').classList.remove('hidden');
                    return;
                }

                document.querySelectorAll('.nav-btn').forEach(b => {
                    // Don't remove active from the tab that was actually selected, since settings doesn't change activeTab
                    if (b.dataset.tab !== 'settings') b.classList.remove('active');
                });
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(`tab-${tab}`).classList.add('active');
                this.activeTab = tab;
                
                // Recalculate widths when switching back to timer
                if (tab === 'timer') {
                    setTimeout(() => this.updateTimerPillsWidth(), 50);
                }
            });
        });

        // Modal Outside Clicks (修正版: ドラッグ誤操作防止)
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            let isMouseDownOnOverlay = false;
            modal.addEventListener('mousedown', (e) => {
                // 押し始めがオーバーレイ（領域外）だったか記録
                if (e.target === modal) {
                    isMouseDownOnOverlay = true;
                } else {
                    isMouseDownOnOverlay = false;
                }
            });
            modal.addEventListener('mouseup', (e) => {
                // 押し始めも離した時もオーバーレイだった場合のみ閉じる
                if (isMouseDownOnOverlay && e.target === modal) {
                    modal.classList.add('hidden');
                }
                isMouseDownOnOverlay = false; // リセット
            });
        });

        // Keyboard Shortcuts for Modals
        document.addEventListener('keydown', (e) => {
            // 現在開いているモーダルをすべて取得し、一番手前（配列の最後）のものを対象とする
            const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
            if (openModals.length === 0) return;
            const openModal = openModals[openModals.length - 1];

            if (e.key === 'Escape') {
                e.preventDefault();
                if (openModal.id === 'modal-settings') {
                    openModal.classList.add('hidden');
                } else if (openModal.id === 'modal-timer') {
                    document.getElementById('modal-timer-cancel').click();
                } else if (openModal.id === 'modal-alarm') {
                    document.getElementById('modal-alarm-cancel').click();
                } else if (openModal.id === 'modal-pomodoro') {
                    document.getElementById('modal-pomodoro-cancel').click();
                }
            } else if (e.key === 'Enter') {
                // Enter時は設定画面では何もしない
                if (openModal.id === 'modal-timer') {
                    e.preventDefault();
                    document.getElementById('modal-timer-save').click();
                } else if (openModal.id === 'modal-alarm') {
                    e.preventDefault();
                    document.getElementById('modal-alarm-save').click();
                } else if (openModal.id === 'modal-pomodoro') {
                    e.preventDefault();
                    document.getElementById('modal-pomodoro-save').click();
                }
            }
        });

        // Settings Tabs
        document.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = btn.dataset.settingsTab;
                document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.settings-pane').forEach(p => p.classList.add('hidden', 'active'));
                document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
                
                btn.classList.add('active');
                const pane = document.getElementById(`settings-pane-${tab}`);
                if (pane) {
                    pane.classList.remove('hidden');
                    pane.classList.add('active');
                }
            });
        });

        // Settings Close Button
        document.getElementById('settings-close-btn').addEventListener('click', () => {
            document.getElementById('modal-settings').classList.add('hidden');
        });

        // Active Alarm Overlay outside click
        const activeOverlay = document.getElementById('active-alarm-overlay');
        if (activeOverlay) {
            activeOverlay.addEventListener('click', (e) => {
                if (e.target === activeOverlay) {
                    document.getElementById('active-alarm-stop').click();
                }
            });
        }

        // Settings
        document.getElementById('setting-bg-preset').addEventListener('change', (e) => {
            state.settings.bgPreset = e.target.value;
            this.applySettings();
            saveState();
        });
        
        ['sound-timer', 'sound-alarm', 'sound-pomo', 'loop', 'pomo-auto'].forEach(id => {
            const el = document.getElementById(id.startsWith('pomo-') ? 'setting-pomo-auto' : `setting-${id}`);
            el.addEventListener('change', (e) => {
                const val = el.type === 'checkbox' ? el.checked : el.value;
                if (id === 'sound-timer') state.settings.soundTimer = val;
                if (id === 'sound-alarm') state.settings.soundAlarm = val;
                if (id === 'sound-pomo') state.settings.soundPomo = val;
                if (id === 'loop') state.settings.loopNotification = val;
                if (id === 'pomo-auto') state.settings.pomoAutoAdvance = val;
                
                if (el.tagName === 'SELECT' && id.startsWith('sound-')) {
                    AudioSys.play(val, false);
                }
                saveState();
            });
        });
        
        ['pomo', 'short', 'long'].forEach(id => {
            document.getElementById(`setting-pomo-${id}`).addEventListener('change', (e) => {
                const val = parseInt(e.target.value) || 1;
                if (id === 'pomo') state.pomodoro.times.pomodoro = val * 60;
                else if (id === 'short') state.pomodoro.times.shortBreak = val * 60;
                else if (id === 'long') state.pomodoro.times.longBreak = val * 60;
                
                if (!state.pomodoro.isRunning) {
                    state.pomodoro.remaining = state.pomodoro.times[state.pomodoro.mode];
                }
                saveState();
                this.renderPomodoro();
            });
        });

        // Timer Central Controls
        document.getElementById('timer-start-btn').addEventListener('click', () => {
            this.toggleActiveTimer();
        });
        document.getElementById('timer-reset-btn').addEventListener('click', () => {
            this.resetActiveTimer();
        });

        // Timer Expand (Carousel)
        document.getElementById('timer-toggle-expand').addEventListener('click', () => {
            this.timersExpanded = !this.timersExpanded;
            const btn = document.getElementById('timer-toggle-expand');
            // Re-inject i tag because Lucide replaces it with svg
            btn.innerHTML = `<i data-lucide="${this.timersExpanded ? 'chevron-left' : 'chevron-right'}"></i>`;
            lucide.createIcons();
            
            const viewport = document.getElementById('timer-viewport');
            const pills = viewport.querySelectorAll('.mode-btn');
            
            if (this.timersExpanded) {
                viewport.classList.add('scrollable');
                let targetEl = null;
                for (const btn of pills) {
                    if (btn.offsetLeft + btn.offsetWidth > viewport.clientWidth) {
                        targetEl = btn;
                        break;
                    }
                }
                
                if (targetEl) {
                    setTimeout(() => viewport.scrollTo({ left: targetEl.offsetLeft, behavior: 'smooth' }), 10);
                } else {
                    setTimeout(() => viewport.scrollTo({ left: viewport.scrollWidth, behavior: 'smooth' }), 10);
                }
            } else {
                setTimeout(() => viewport.scrollTo({ left: 0, behavior: 'smooth' }), 10);
                // Hide scrollbar after animation finishes
                setTimeout(() => {
                    if(!this.timersExpanded) viewport.classList.remove('scrollable');
                }, 300);
            }
        });

        // Click and drag to scroll for timers
        const viewport = document.getElementById('timer-viewport');
        let isDown = false;
        let startX;
        let scrollLeft;

        const handleDown = (e) => {
            if (!this.timersExpanded) return;
            isDown = true;
            viewport.style.cursor = 'grabbing';
            viewport.style.scrollBehavior = 'auto'; // disable smooth scroll while dragging
            startX = (e.pageX || e.touches[0].pageX) - viewport.offsetLeft;
            scrollLeft = viewport.scrollLeft;
        };
        const handleLeaveOrUp = () => {
            isDown = false;
            viewport.style.cursor = '';
            viewport.style.scrollBehavior = 'smooth';
        };
        const handleMove = (e) => {
            if (!isDown) return;
            // Native overflow-x handles touch swipe, but preventing default here breaks native scrolling.
            // We use JS only for mouse, but it will work for touch if preventDefault is used.
            // Actually, for touch, browser handles it natively perfectly fine, so let's only rely on JS dragging for Mouse events, 
            // but the user explicitly requested "スワイプして左右にスクロールできる機能". 
            // Since touch is native, we don't strictly need JS for it, but adding it standardizes the speed.
            // We will let native handle touch by avoiding preventDefault on touch.
            if(e.type === 'mousemove') e.preventDefault();
            const x = (e.pageX || e.touches[0].pageX) - viewport.offsetLeft;
            const walk = (x - startX) * 1.5; // Scroll speed multiplier
            viewport.scrollLeft = scrollLeft - walk;
        };

        viewport.addEventListener('mousedown', handleDown);
        viewport.addEventListener('mouseleave', handleLeaveOrUp);
        viewport.addEventListener('mouseup', handleLeaveOrUp);
        viewport.addEventListener('mousemove', handleMove);

        // Touch events
        viewport.addEventListener('touchstart', handleDown, {passive: true});
        viewport.addEventListener('touchend', handleLeaveOrUp);
        viewport.addEventListener('touchmove', handleMove, {passive: true});

        // Pomodoro
        document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setPomodoroMode(btn.dataset.mode);
            });
            this.bindContextMenu(btn, { id: btn.dataset.mode, isPinned: false }, 'pomo-mode');
        });
        document.getElementById('pomo-start-btn').addEventListener('click', () => {
            this.togglePomodoro();
        });
        document.getElementById('pomo-reset-btn').addEventListener('click', () => {
            this.resetPomodoro();
        });
        // Modals (Timer)
        document.getElementById('timer-add-btn').addEventListener('click', () => {
            document.getElementById('modal-timer-title').textContent = "タイマーを追加";
            document.getElementById('modal-timer').dataset.editId = "";
            document.getElementById('modal-timer-name').value = "";
            document.getElementById('modal-timer-h').value = "0";
            document.getElementById('modal-timer-m').value = "10";
            document.getElementById('modal-timer-s').value = "0";
            document.getElementById('modal-timer').classList.remove('hidden');
        });
        document.getElementById('modal-timer-cancel').addEventListener('click', () => {
            document.getElementById('modal-timer').classList.add('hidden');
        });
        document.getElementById('modal-timer-save').addEventListener('click', () => {
            const h = parseInt(document.getElementById('modal-timer-h').value) || 0;
            const m = parseInt(document.getElementById('modal-timer-m').value) || 0;
            const s = parseInt(document.getElementById('modal-timer-s').value) || 0;
            const name = document.getElementById('modal-timer-name').value || 'Timer';
            const totalSecs = h * 3600 + m * 60 + s;
            if (totalSecs <= 0) return;

            const editId = document.getElementById('modal-timer').dataset.editId;
            if (editId) {
                const timer = state.timers.find(t => t.id === editId);
                if(timer) {
                    timer.name = name;
                    timer.totalSeconds = totalSecs;
                    timer.remaining = totalSecs;
                    timer.isRunning = false;
                    timer.endTime = null;
                }
            } else {
                const newId = generateId();
                state.timers.push({
                    id: newId,
                    name,
                    totalSeconds: totalSecs,
                    remaining: totalSecs,
                    isRunning: false,
                    isPinned: false,
                    endTime: null
                });
                this.activeTimerId = newId; // switch to new timer
            }
            saveState();
            this.renderTimers();
            document.getElementById('modal-timer').classList.add('hidden');
            this.renderSettingsManagementList();
        });

        // Modals (Pomodoro)
        document.getElementById('modal-pomodoro-cancel').addEventListener('click', () => {
            document.getElementById('modal-pomodoro').classList.add('hidden');
        });
        document.getElementById('modal-pomodoro-save').addEventListener('click', () => {
            const p = parseInt(document.getElementById('modal-pomo-pomo').value) || 25;
            const s = parseInt(document.getElementById('modal-pomo-short').value) || 5;
            const l = parseInt(document.getElementById('modal-pomo-long').value) || 15;
            
            state.pomodoro.times.pomodoro = p * 60;
            state.pomodoro.times.shortBreak = s * 60;
            state.pomodoro.times.longBreak = l * 60;
            
            // if currently stopped, update remaining time
            if (!state.pomodoro.isRunning) {
                state.pomodoro.remaining = state.pomodoro.times[state.pomodoro.mode];
            }
            
            saveState();
            this.renderPomodoro();
            document.getElementById('modal-pomodoro').classList.add('hidden');
        });

        // Modals (Alarm)
        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
            });
        });

        document.getElementById('alarm-add-btn').addEventListener('click', () => {
            document.getElementById('modal-alarm-title').textContent = "アラームを追加";
            document.getElementById('modal-alarm').dataset.editId = "";
            document.getElementById('modal-alarm-name').value = "";
            document.getElementById('modal-alarm-time').value = "12:00";
            document.getElementById('modal-alarm-snooze').checked = false;
            document.getElementById('modal-alarm-snooze-interval').value = "5";
            document.querySelectorAll('#modal-alarm-days .day-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('modal-alarm').classList.remove('hidden');
        });
        document.getElementById('modal-alarm-cancel').addEventListener('click', () => {
            document.getElementById('modal-alarm').classList.add('hidden');
        });
        document.getElementById('modal-alarm-save').addEventListener('click', () => {
            const name = document.getElementById('modal-alarm-name').value || 'Alarm';
            const time = document.getElementById('modal-alarm-time').value;
            if (!time) return;
            const snooze = document.getElementById('modal-alarm-snooze').checked;
            const snoozeInterval = parseInt(document.getElementById('modal-alarm-snooze-interval').value) || 5;
            const days = Array.from(document.querySelectorAll('#modal-alarm-days .day-btn.active'))
                             .map(btn => parseInt(btn.dataset.day));

            const editId = document.getElementById('modal-alarm').dataset.editId;
            if (editId) {
                const alarm = state.alarms.find(a => a.id === editId);
                if(alarm) {
                    alarm.name = name;
                    alarm.time = time;
                    alarm.snooze = snooze;
                    alarm.snoozeInterval = snoozeInterval;
                    alarm.days = days;
                    alarm.enabled = true;
                    alarm.lastTriggered = null;
                    alarm.nextSnoozeTime = null;
                }
            } else {
                state.alarms.push({
                    id: generateId(),
                    name,
                    time,
                    snooze,
                    snoozeInterval,
                    enabled: true,
                    isPinned: false,
                    lastTriggered: null,
                    nextSnoozeTime: null,
                    days: days
                });
            }
            saveState();
            this.renderAlarms();
            document.getElementById('modal-alarm').classList.add('hidden');
            this.renderSettingsManagementList();
        });

        // Context Menu
        document.addEventListener('click', (e) => {
            const ctx = document.getElementById('context-menu');
            if (!ctx.contains(e.target) && !e.target.closest('.mode-btn[data-tid]')) {
                ctx.classList.add('hidden');
            }
        });
        document.getElementById('ctx-delete').addEventListener('click', () => {
            if (this.contextMenuTarget) {
                if (this.contextMenuTarget.type === 'timer') {
                    state.timers = state.timers.filter(t => t.id !== this.contextMenuTarget.id);
                    if(this.activeTimerId === this.contextMenuTarget.id) {
                        this.activeTimerId = state.timers.length > 0 ? state.timers[0].id : null;
                    }
                    this.renderTimers();
                } else if (this.contextMenuTarget.type === 'alarm') {
                    state.alarms = state.alarms.filter(a => a.id !== this.contextMenuTarget.id);
                    this.renderAlarms();
                }
                saveState();
                document.getElementById('context-menu').classList.add('hidden');
            }
        });
        document.getElementById('ctx-pin').addEventListener('click', () => {
            if (this.contextMenuTarget) {
                if (this.contextMenuTarget.type === 'timer') {
                    const t = state.timers.find(t => t.id === this.contextMenuTarget.id);
                    if (t) t.isPinned = !t.isPinned;
                    this.renderTimers();
                } else if (this.contextMenuTarget.type === 'alarm') {
                    const a = state.alarms.find(a => a.id === this.contextMenuTarget.id);
                    if (a) a.isPinned = !a.isPinned;
                    this.renderAlarms();
                }
                saveState();
                document.getElementById('context-menu').classList.add('hidden');
            }
        });
        document.getElementById('ctx-edit').addEventListener('click', () => {
            if (this.contextMenuTarget) {
                if (this.contextMenuTarget.type === 'timer') {
                    const t = state.timers.find(t => t.id === this.contextMenuTarget.id);
                    if (t) {
                        document.getElementById('modal-timer-title').textContent = "タイマーを編集";
                        document.getElementById('modal-timer').dataset.editId = t.id;
                        document.getElementById('modal-timer-name').value = t.name;
                        document.getElementById('modal-timer-h').value = Math.floor(t.totalSeconds / 3600);
                        document.getElementById('modal-timer-m').value = Math.floor((t.totalSeconds % 3600) / 60);
                        document.getElementById('modal-timer-s').value = t.totalSeconds % 60;
                        document.getElementById('modal-timer').classList.remove('hidden');
                    }
                } else if (this.contextMenuTarget.type === 'alarm') {
                    const a = state.alarms.find(a => a.id === this.contextMenuTarget.id);
                    if (a) {
                        document.getElementById('modal-alarm-title').textContent = "アラームを編集";
                        document.getElementById('modal-alarm').dataset.editId = a.id;
                        document.getElementById('modal-alarm-name').value = a.name;
                        document.getElementById('modal-alarm-time').value = a.time;
                        document.getElementById('modal-alarm-snooze').checked = a.snooze;
                        document.getElementById('modal-alarm-snooze-interval').value = a.snoozeInterval || 5;
                        
                        document.querySelectorAll('#modal-alarm-days .day-btn').forEach(btn => {
                            if (a.days && a.days.includes(parseInt(btn.dataset.day))) {
                                btn.classList.add('active');
                            } else {
                                btn.classList.remove('active');
                            }
                        });

                        document.getElementById('modal-alarm').classList.remove('hidden');
                    }
                } else if (this.contextMenuTarget.type === 'pomo-mode') {
                    document.getElementById('modal-pomo-pomo').value = Math.floor(state.pomodoro.times.pomodoro / 60);
                    document.getElementById('modal-pomo-short').value = Math.floor(state.pomodoro.times.shortBreak / 60);
                    document.getElementById('modal-pomo-long').value = Math.floor(state.pomodoro.times.longBreak / 60);
                    document.getElementById('modal-pomodoro').classList.remove('hidden');
                }
                document.getElementById('context-menu').classList.add('hidden');
            }
        });

        // Active Alarm Overlay
        document.getElementById('active-alarm-stop').addEventListener('click', () => {
            AudioSys.stop();
            document.getElementById('active-alarm-overlay').classList.add('hidden');
            
            if (this.activeAlarmPopupData) {
                if (this.activeAlarmPopupData.moduleType === 'timer') {
                    const t = state.timers.find(x => x.id === this.activeAlarmPopupData.targetId);
                    if (t) {
                        t.isRunning = false;
                        t.endTime = null;
                        t.remaining = t.totalSeconds;
                        saveState();
                    }
                } else if (this.activeAlarmPopupData.moduleType === 'alarm') {
                    const a = state.alarms.find(x => x.id === this.activeAlarmPopupData.targetId);
                    if (a) {
                        if (a.snooze && (!a.snoozeCount || a.snoozeCount === 0)) {
                            // 1回だけスヌーズ待機状態に移行
                            a.nextSnoozeTime = Date.now() + (a.snoozeInterval || 5) * 60000;
                            a.snoozeCount = 1;
                        } else {
                            // 完全に終了
                            if (a.days && a.days.length > 0) {
                                a.snoozeCount = 0;
                                a.nextSnoozeTime = null;
                            } else {
                                a.enabled = false;
                                a.nextSnoozeTime = null;
                                a.snoozeCount = 0;
                            }
                        }
                        saveState();
                    }
                } else if (this.activeAlarmPopupData.moduleType === 'pomo') {
                    this.handlePomodoroAutoAdvance();
                }
                this.activeAlarmPopupData = null;
            }
            
            this.renderAll();
        });
    },

    bindContextMenu(element, item, type) {
        let touchTimer = null;
        let isMoving = false;

        const triggerMenu = (e) => {
            this.contextMenuTarget = { id: item.id, type: type };
            const ctx = document.getElementById('context-menu');
            
            let pageX, pageY;
            if (e.touches && e.touches.length > 0) {
                pageX = e.touches[0].pageX;
                pageY = e.touches[0].pageY;
            } else {
                pageX = e.pageX;
                pageY = e.pageY;
            }

            ctx.style.left = `${pageX}px`;
            ctx.style.top = `${pageY}px`;
            ctx.classList.remove('hidden');
            
            if (type === 'pomo-mode') {
                document.getElementById('ctx-pin').style.display = 'none';
                document.getElementById('ctx-delete').style.display = 'none';
            } else {
                document.getElementById('ctx-pin').style.display = 'flex';
                document.getElementById('ctx-delete').style.display = 'flex';
                document.getElementById('ctx-pin').innerHTML = `<i data-lucide="pin"></i> ${item.isPinned ? 'ピン留め解除' : 'ピン留め'}`;
            }
            
            lucide.createIcons();
            if (navigator.vibrate) navigator.vibrate(50);
        };

        element.addEventListener('touchstart', (e) => {
            isMoving = false;
            touchTimer = setTimeout(() => {
                if (!isMoving) triggerMenu(e);
            }, 500);
        }, {passive: true});

        element.addEventListener('touchmove', () => {
            isMoving = true;
            if (touchTimer) clearTimeout(touchTimer);
        }, {passive: true});

        const clearTouch = () => {
            if (touchTimer) clearTimeout(touchTimer);
        };

        element.addEventListener('touchend', clearTouch, {passive: true});
        element.addEventListener('touchcancel', clearTouch, {passive: true});

        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            triggerMenu(e);
        });
    },

    applySettings() {
        document.getElementById('setting-bg-preset').value = state.settings.bgPreset;
        document.getElementById('setting-sound-timer').value = state.settings.soundTimer;
        document.getElementById('setting-sound-alarm').value = state.settings.soundAlarm;
        document.getElementById('setting-sound-pomo').value = state.settings.soundPomo;
        document.getElementById('setting-loop').value = state.settings.loopNotification;
        document.getElementById('setting-pomo-auto').checked = state.settings.pomoAutoAdvance;

        const bgLayer = document.getElementById('bg-layer');
        bgLayer.className = 'bg-layer';
        if (state.settings.bgPreset.startsWith('gradient-')) {
            bgLayer.classList.add(state.settings.bgPreset);
            bgLayer.style.backgroundImage = '';
        } else if (state.settings.bgPreset === 'image-nature') {
            bgLayer.style.backgroundImage = "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=2000')";
        } else if (state.settings.bgPreset === 'image-space') {
            bgLayer.style.backgroundImage = "url('https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=2000')";
        } else if (state.settings.bgPreset === 'image-desk') {
            bgLayer.style.backgroundImage = "url('https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=2000')";
        } else {
            bgLayer.style.background = 'var(--bg-color)';
        }
    },

    formatTime(seconds) {
        if (seconds < 0) seconds = 0;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }
        return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    },

    renderAll() {
        this.renderTimers();
        this.renderPomodoro();
        this.renderAlarms();
        this.renderSettingsManagementList();
    },

    renderSettingsManagementList() {
        const listTimer = document.getElementById('settings-management-list-timer');
        const listAlarm = document.getElementById('settings-management-list-alarm');
        if (listTimer) listTimer.innerHTML = '';
        if (listAlarm) listAlarm.innerHTML = '';
        
        // タイマーのソート（ピン留め優先、総秒数順）
        let displayTimers = [...state.timers];
        displayTimers.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return a.totalSeconds - b.totalSeconds;
        });

        displayTimers.forEach(t => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '8px 12px';
            item.style.background = 'rgba(255, 255, 255, 0.05)';
            item.style.borderRadius = '8px';
            
            const timeStr = this.formatTime(t.totalSeconds);
            
            item.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 500; font-size: 0.95rem;">${t.name}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">タイマー・${timeStr}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="icon-btn small pin-btn" title="${t.isPinned ? 'ピン留め解除' : 'ピン留め'}">
                        <i data-lucide="${t.isPinned ? 'pin-off' : 'pin'}" style="width:16px;height:16px;"></i>
                    </button>
                    <button class="icon-btn small edit-btn" title="編集"><i data-lucide="edit-2" style="width:16px;height:16px;"></i></button>
                    <button class="icon-btn small danger delete-btn" title="削除"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                </div>
            `;
            
            item.querySelector('.pin-btn').addEventListener('click', () => {
                t.isPinned = !t.isPinned;
                saveState();
                this.renderAll();
            });

            item.querySelector('.edit-btn').addEventListener('click', () => {
                document.getElementById('modal-timer-title').textContent = "タイマーを編集";
                document.getElementById('modal-timer').dataset.editId = t.id;
                document.getElementById('modal-timer-name').value = t.name;
                const h = Math.floor(t.totalSeconds / 3600);
                const m = Math.floor((t.totalSeconds % 3600) / 60);
                const s = t.totalSeconds % 60;
                document.getElementById('modal-timer-h').value = h;
                document.getElementById('modal-timer-m').value = m;
                document.getElementById('modal-timer-s').value = s;
                document.getElementById('modal-timer').classList.remove('hidden');
            });
            
            item.querySelector('.delete-btn').addEventListener('click', () => {
                if (confirm(`タイマー「${t.name}」を削除しますか？`)) {
                    state.timers = state.timers.filter(x => x.id !== t.id);
                    if (this.activeTimerId === t.id) {
                        this.activeTimerId = state.timers.length > 0 ? state.timers[0].id : null;
                    }
                    saveState();
                    this.renderAll();
                }
            });
            
            if (listTimer) listTimer.appendChild(item);
        });

        // アラームのソート（ピン留め優先、時刻順）
        let displayAlarms = [...state.alarms];
        displayAlarms.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return a.time.localeCompare(b.time);
        });

        displayAlarms.forEach(a => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '8px 12px';
            item.style.background = 'rgba(255, 255, 255, 0.05)';
            item.style.borderRadius = '8px';
            
            item.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 500; font-size: 0.95rem;">${a.name}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">アラーム・${a.time}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="icon-btn small pin-btn" title="${a.isPinned ? 'ピン留め解除' : 'ピン留め'}">
                        <i data-lucide="${a.isPinned ? 'pin-off' : 'pin'}" style="width:16px;height:16px;"></i>
                    </button>
                    <button class="icon-btn small edit-btn" title="編集"><i data-lucide="edit-2" style="width:16px;height:16px;"></i></button>
                    <button class="icon-btn small danger delete-btn" title="削除"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                </div>
            `;
            
            item.querySelector('.pin-btn').addEventListener('click', () => {
                a.isPinned = !a.isPinned;
                saveState();
                this.renderAll();
            });

            item.querySelector('.edit-btn').addEventListener('click', () => {
                document.getElementById('modal-alarm-title').textContent = "アラームを編集";
                document.getElementById('modal-alarm').dataset.editId = a.id;
                document.getElementById('modal-alarm-name').value = a.name;
                document.getElementById('modal-alarm-time').value = a.time;
                document.getElementById('modal-alarm-snooze').checked = a.snooze;
                document.getElementById('modal-alarm-snooze-interval').value = a.snoozeInterval || 5;

                document.querySelectorAll('#modal-alarm-days .day-btn').forEach(btn => {
                    if (a.days && a.days.includes(parseInt(btn.dataset.day))) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });

                document.getElementById('modal-alarm').classList.remove('hidden');
            });
            
            item.querySelector('.delete-btn').addEventListener('click', () => {
                if (confirm(`アラーム「${a.name}」を削除しますか？`)) {
                    state.alarms = state.alarms.filter(x => x.id !== a.id);
                    saveState();
                    this.renderAll();
                }
            });
            
            if (listAlarm) listAlarm.appendChild(item);
        });
        
        lucide.createIcons();
    },

    // ---------------- Timer Logic ----------------

    toggleActiveTimer() {
        const t = state.timers.find(x => x.id === this.activeTimerId);
        if (!t) return;
        
        if (t.isRunning) {
            t.isRunning = false;
            t.endTime = null;
        } else {
            // Stop and Reset other timers
            state.timers.forEach(ot => { 
                if (ot.id !== t.id) {
                    ot.isRunning = false; 
                    ot.endTime = null; 
                    ot.remaining = ot.totalSeconds; // Reset to original
                }
            });
            state.pomodoro.isRunning = false;
            state.pomodoro.endTime = null;
            state.pomodoro.remaining = state.pomodoro.times[state.pomodoro.mode]; // Reset pomodoro

            if (t.remaining <= 0) t.remaining = t.totalSeconds;
            t.isRunning = true;
            t.endTime = Date.now() + t.remaining * 1000;
        }
        saveState();
        this.renderAll();
    },

    resetActiveTimer() {
        const t = state.timers.find(x => x.id === this.activeTimerId);
        if (!t) return;
        t.remaining = t.totalSeconds;
        if (t.isRunning) {
            t.endTime = Date.now() + t.remaining * 1000;
        }
        saveState();
        this.renderTimers();
    },

    renderTimers() {
        const list = document.getElementById('timer-pills');
        list.innerHTML = '';
        
        let displayList = [...state.timers];
        displayList.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return a.totalSeconds - b.totalSeconds;
        });

        // Always render all timers into the DOM. CSS will handle hiding them when not expanded.
        displayList.forEach((t, i) => {
            const btn = document.createElement('button');
            btn.className = `mode-btn ${this.activeTimerId === t.id ? 'active' : ''}`;
            
            let html = '';
            if (t.isPinned) {
                html += `<i data-lucide="pin" class="pin-icon"></i>`;
            }
            html += `<span>${t.name}</span>`;
            
            btn.innerHTML = html;
            btn.dataset.tid = t.id;
            
            btn.addEventListener('click', () => {
                this.activeTimerId = t.id;
                this.renderTimers();
            });

            this.bindContextMenu(btn, t, 'timer');

            list.appendChild(btn);
        });

        // Re-init icons for pins
        lucide.createIcons();

        // Render central display
        const activeT = state.timers.find(x => x.id === this.activeTimerId);
        const disp = document.getElementById('timer-time');
        const startBtn = document.getElementById('timer-start-btn');

        if (activeT) {
            disp.textContent = this.formatTime(activeT.remaining);
            startBtn.textContent = activeT.isRunning ? 'Pause' : 'Start';
            if (activeT.isRunning) startBtn.classList.remove('primary');
            else startBtn.classList.add('primary');
            
            if (this.activeTab === 'timer') {
                document.title = activeT.isRunning ? `${disp.textContent} - ${activeT.name}` : 'NTimeDeck';
            }
        } else {
            disp.textContent = '00:00';
            startBtn.textContent = 'Start';
        }
        
        setTimeout(() => this.updateTimerPillsWidth(), 50);
    },

    updateTimerPillsWidth() {
        if (this.activeTab !== 'timer') return;
        const viewport = document.getElementById('timer-viewport');
        const container = document.getElementById('timer-pills');
        const pills = container.querySelectorAll('.mode-btn');
        
        if (pills.length > 0) {
            // Check if we are in 3-row mode (is the second element below the first?)
            const isMultiRow = pills.length > 1 && pills[1].offsetTop > pills[0].offsetTop;
            
            // In 1-row mode, show 4 items. In 3-row mode, show 2 columns (6 items).
            const maxVisible = Math.min(pills.length, isMultiRow ? 6 : 4);
            let targetWidth = 0;
            
            // Find the exact maximum right edge of the visible items
            for (let i = 0; i < maxVisible; i++) {
                const rightEdge = pills[i].offsetLeft + pills[i].offsetWidth;
                if (rightEdge > targetWidth) targetWidth = rightEdge;
            }
            
            // Set maxWidth exactly to targetWidth + 4px (to include shadow but hide next item)
            // Since gap is 8px, +4px ensures the next column does not peek into view at all.
            viewport.style.maxWidth = `${targetWidth + 4}px`;
        } else {
            viewport.style.maxWidth = '100%';
        }
    },

    // ---------------- Pomodoro Logic ----------------

    setPomodoroMode(mode) {
        state.pomodoro.mode = mode;
        state.pomodoro.remaining = state.pomodoro.times[mode];
        state.pomodoro.isRunning = false;
        state.pomodoro.endTime = null;
        saveState();
        this.renderPomodoro();
    },

    togglePomodoro() {
        if (state.pomodoro.isRunning) {
            state.pomodoro.isRunning = false;
            state.pomodoro.endTime = null;
        } else {
            state.timers.forEach(t => { 
                t.isRunning = false; 
                t.endTime = null; 
                t.remaining = t.totalSeconds; 
            });
            if (state.pomodoro.remaining <= 0) {
                state.pomodoro.remaining = state.pomodoro.times[state.pomodoro.mode];
            }
            state.pomodoro.isRunning = true;
            state.pomodoro.endTime = Date.now() + state.pomodoro.remaining * 1000;
        }
        saveState();
        this.renderAll();
    },

    resetPomodoro() {
        state.pomodoro.remaining = state.pomodoro.times[state.pomodoro.mode];
        if (state.pomodoro.isRunning) {
            state.pomodoro.endTime = Date.now() + state.pomodoro.remaining * 1000;
        }
        saveState();
        this.renderPomodoro();
    },

    renderPomodoro() {
        document.querySelectorAll('.pomodoro-modes .mode-btn').forEach(b => {
            if (b.dataset.mode === state.pomodoro.mode) b.classList.add('active');
            else b.classList.remove('active');
        });
        document.getElementById('pomodoro-time').textContent = this.formatTime(state.pomodoro.remaining);
        const btn = document.getElementById('pomo-start-btn');
        btn.textContent = state.pomodoro.isRunning ? 'Pause' : 'Start';
        if (state.pomodoro.isRunning) btn.classList.remove('primary');
        else btn.classList.add('primary');

        if (this.activeTab === 'pomodoro') {
            document.title = state.pomodoro.isRunning ? `${this.formatTime(state.pomodoro.remaining)} - ${state.pomodoro.mode}` : 'NTimeDeck';
        }
    },

    // ---------------- Alarms Logic ----------------

    renderAlarms() {
        const list = document.getElementById('alarm-list');
        list.innerHTML = '';
        
        let displayList = [...state.alarms];
        displayList.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return a.time.localeCompare(b.time);
        });

        displayList.forEach(a => {
            const card = document.createElement('div');
            card.className = `card ${!a.enabled ? 'disabled' : ''}`;
            
            let pinHtml = a.isPinned ? `<i data-lucide="pin" class="pin-icon" style="width:14px;height:14px;margin-right:4px;"></i>` : '';
            let snoozeHtml = a.snooze ? `<i data-lucide="repeat" style="width:16px;height:16px;margin-left:8px;vertical-align:-3px;color:var(--text-muted);" title="スヌーズ有効"></i>` : '';
            
            // ▼ 追加：選択されている曜日のみのインジケーター生成 ▼
            let daysHtml = '';
            if (a.days && a.days.length > 0) {
                const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                const sortedDays = [...a.days].sort((x, y) => x - y); // 常に日〜土の順にする
                
                daysHtml = `<div class="card-days">`;
                sortedDays.forEach(d => {
                    daysHtml += `<div class="card-day-badge">${dayNames[d]}</div>`;
                });
                daysHtml += `</div>`;
            }

            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title">${pinHtml}${a.name}${snoozeHtml}</span>
                    <label class="switch" style="transform: scale(0.7); transform-origin: right;">
                        <input type="checkbox" ${a.enabled ? 'checked' : ''} class="alarm-toggle">
                        <span class="slider round"></span>
                    </label>
                </div>
                <div class="card-time" style="font-size: 2.5rem;">${a.time}</div>
                ${daysHtml}
            `;
            
            card.querySelector('.alarm-toggle').addEventListener('change', (e) => {
                a.enabled = e.target.checked;
                if(a.enabled) {
                    a.lastTriggered = null;
                } else {
                    a.snoozeCount = 0;
                    a.nextSnoozeTime = null;
                }
                saveState();
                this.renderAlarms();
            });

            this.bindContextMenu(card, a, 'alarm');

            list.appendChild(card);
        });

        // Re-init icons for pins
        lucide.createIcons();
    },

    // ---------------- Core Engine ----------------

    triggerAlarm(type, title, moduleType, targetId) {
        let soundType = state.settings.soundTimer;
        if (moduleType === 'pomo') soundType = state.settings.soundPomo;
        else if (moduleType === 'alarm') soundType = state.settings.soundAlarm;

        const isLoop = state.settings.loopNotification === 'loop';
        AudioSys.play(soundType, isLoop);

        let showPopup = isLoop;

        if (showPopup) {
            this.activeAlarmPopupData = { moduleType, title, type, targetId };
        }

        if (moduleType === 'timer') {
            const t = state.timers.find(x => x.id === targetId);
            if(t && !showPopup) { 
                t.isRunning = false; 
                t.endTime = null;
                // Revert the timer to original total after ringing
                t.remaining = t.totalSeconds; 
            }
        } else if (moduleType === 'alarm') {
            const a = state.alarms.find(x => x.id === targetId);
            if(a && !showPopup) {
                if (a.snooze && (!a.snoozeCount || a.snoozeCount === 0)) {
                    // Auto 1-time snooze
                    a.nextSnoozeTime = Date.now() + (a.snoozeInterval || 5) * 60000;
                    a.snoozeCount = 1;
                } else {
                    // Disable after 1 snooze or if snooze is off
                    if (a.days && a.days.length > 0) {
                        a.snoozeCount = 0;
                        a.nextSnoozeTime = null;
                    } else {
                        a.enabled = false;
                        a.snoozeCount = 0;
                        a.nextSnoozeTime = null;
                    }
                }
            }
        } else if (moduleType === 'pomo') {
            state.pomodoro.isRunning = false;
            state.pomodoro.endTime = null;
            state.pomodoro.remaining = state.pomodoro.times[state.pomodoro.mode]; // Revert
            
            if (!showPopup) {
                this.handlePomodoroAutoAdvance();
            }
        }
        
        saveState();
        
        if (showPopup) {
            const overlay = document.getElementById('active-alarm-overlay');
            const ringBox = document.getElementById('alarm-ring-box');
            
            document.getElementById('active-alarm-title').textContent = type;
            document.getElementById('active-alarm-desc').textContent = title;
            
            if (moduleType === 'alarm') {
                ringBox.classList.add('is-alarm');
            } else {
                ringBox.classList.remove('is-alarm');
            }
            overlay.classList.remove('hidden');
        }
        this.renderAll();
    },

    handlePomodoroAutoAdvance() {
        if (state.settings.pomoAutoAdvance) {
            if (state.pomodoro.mode === 'pomodoro') {
                state.pomodoro.cycleCount = (state.pomodoro.cycleCount || 0) + 1;
                if (state.pomodoro.cycleCount >= 4) {
                    this.setPomodoroMode('longBreak');
                } else {
                    this.setPomodoroMode('shortBreak');
                }
                state.pomodoro.isRunning = true;
                state.pomodoro.endTime = Date.now() + state.pomodoro.remaining * 1000;
            } else {
                this.setPomodoroMode('pomodoro');
                if (state.pomodoro.cycleCount >= 4) {
                    state.pomodoro.cycleCount = 0;
                    // 休憩の種類に関わらず必ず自動スタートさせる
                } 
                    state.pomodoro.isRunning = true;
                    state.pomodoro.endTime = Date.now() + state.pomodoro.remaining * 1000;
                
            }
        } else {
            if (state.pomodoro.mode === 'pomodoro') {
                this.setPomodoroMode('shortBreak');
            } else {
                this.setPomodoroMode('pomodoro');
            }
        }
        saveState();
        this.renderPomodoro();
    },

    tick() {
        let changed = false;
        const now = Date.now();
        const isOverlayOpen = !document.getElementById('active-alarm-overlay').classList.contains('hidden');

        // Timers
        state.timers.forEach(t => {
            if (t.isRunning && t.endTime) {
                const rem = Math.max(0, Math.ceil((t.endTime - now) / 1000));
                if (t.remaining !== rem) {
                    t.remaining = rem;
                    changed = true;
                }
                // remainingの変更とは独立して、0になっていれば通知判定をする
                if (t.remaining === 0 && !isOverlayOpen) {
                    t.isRunning = false;
                    this.triggerAlarm('タイマー終了！', t.name, 'timer', t.id);
                }
            }
        });

        // Pomodoro
        if (state.pomodoro.isRunning && state.pomodoro.endTime) {
            const rem = Math.max(0, Math.ceil((state.pomodoro.endTime - now) / 1000));
            if (state.pomodoro.remaining !== rem) {
                state.pomodoro.remaining = rem;
                changed = true;
            }
            // remainingの変更とは独立して判定
            if (state.pomodoro.remaining === 0 && !isOverlayOpen) {
                state.pomodoro.isRunning = false;
                this.triggerAlarm('ポモドーロ終了！', state.pomodoro.mode, 'pomo', 'pomo');
            }
        }

        // Alarms logic
        const d = new Date();
        const currentHMS = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        const currentDayStr = d.toDateString();

        state.alarms.forEach(a => {
            if (a.enabled) {
                if (a.days && a.days.length > 0 && !a.days.includes(d.getDay())) return;

                // ポップアップが開いているかどうかの判定を内側に移動
                if (a.time === currentHMS && a.lastTriggered !== currentDayStr) {
                    if (!isOverlayOpen) {
                        a.lastTriggered = currentDayStr;
                        changed = true;
                        this.triggerAlarm('アラーム！', a.name, 'alarm', a.id);
                    }
                } else if (a.snooze && a.nextSnoozeTime && now >= a.nextSnoozeTime) {
                    if (!isOverlayOpen) {
                        a.nextSnoozeTime = null;
                        changed = true;
                        this.triggerAlarm('アラーム！(スヌーズ)', a.name, 'alarm', a.id);
                    }
                }
            }
        });

        if (changed) {
            this.renderAll();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}
