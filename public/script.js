// ============================================================
// GLOBAL CONFIG
// ============================================================
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin;

// ============================================================
// GLOBAL STATE
// ============================================================
let signDictionary = {};
let isCameraRunning = false;
let isListening = false;
let recognition = null;
let isQuizRunning = false;
let currentQuizTarget = '';
let quizScore = 0;
let lastSign = '';
let signCount = 0;
// PROGRESS_LIMIT moved to detection section

// 3D scene globals
let threeScene, threeCamera, threeRenderer;
let leftHandObj = { group: null, joints: [] };
let rightHandObj = { group: null, joints: [] };
let joints = []; // legacy reference

// Storage
const storage = {
    get: (key, def) => { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } },
    set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
    clear: () => localStorage.clear()
};

let settings = storage.get('appSettings', {
    speechRate: 1.0, speechVolume: 1.0,
    mirrorMode: true, showSkeleton: true, keepHistory: true
});
let historyList = storage.get('translationHistory', []);

// ============================================================
// MEDIAPIPE HANDS
// ============================================================
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

const deafVideo = document.getElementById('deafVideo');
const deafCanvas = document.getElementById('deafCanvas');
const deafCtx = deafCanvas.getContext('2d');
const quizVideo = document.getElementById('quizVideo');
const quizCanvas = document.getElementById('quizCanvas');
const quizCtx = quizCanvas.getContext('2d');

hands.onResults((results) => {
    if (!isCameraRunning && !isQuizRunning) return;
    const activeCanvas = isQuizRunning ? quizCanvas : deafCanvas;
    const activeCtx = isQuizRunning ? quizCtx : deafCtx;

    activeCtx.save();
    activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    activeCtx.globalAlpha = 1.0;
    activeCtx.drawImage(results.image, 0, 0, activeCanvas.width, activeCanvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        update3DHand(results);
        detectSign(results.multiHandLandmarks);
    } else {
        if (leftHandObj.group) leftHandObj.group.visible = false;
        if (rightHandObj.group) rightHandObj.group.visible = false;
    }
    activeCtx.restore();
});

// ============================================================
// THREE.JS 3D HAND
// ============================================================
function createHandModel(color) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({
        color, transparent: true, opacity: 0.85,
        emissive: color, emissiveIntensity: 0.25
    });
    const jts = [];
    for (let i = 0; i < 21; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), material);
        jts.push(mesh);
        group.add(mesh);
    }
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]
    ];
    connections.forEach(([f, t]) => {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), boneMat);
        cyl.userData = { from: f, to: t };
        group.add(cyl);
    });
    return { group, joints: jts };
}

function init3DScene() {
    const container = document.getElementById('hand3DContainer');
    if (!container || !window.THREE) return;

    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(50, container.clientWidth / (container.clientHeight || 300), 0.1, 1000);
    threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    threeRenderer.setSize(container.clientWidth, container.clientHeight || 300);
    container.appendChild(threeRenderer.domElement);

    threeScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 5, 5);
    threeScene.add(dirLight);

    leftHandObj = createHandModel(0xff0088);  // Pink for left
    rightHandObj = createHandModel(0x00d2ff); // Cyan for right
    threeScene.add(leftHandObj.group);
    threeScene.add(rightHandObj.group);
    leftHandObj.group.visible = false;
    rightHandObj.group.visible = false;

    threeCamera.position.z = 10;

    function animate() {
        requestAnimationFrame(animate);
        threeRenderer.render(threeScene, threeCamera);
    }
    animate();
}

function update3DHand(results) {
    if (!threeScene || !results.multiHandLandmarks) return;

    leftHandObj.group.visible = false;
    rightHandObj.group.visible = false;

    results.multiHandLandmarks.forEach((landmarks, idx) => {
        if (!results.multiHandedness || !results.multiHandedness[idx]) return;
        const label = results.multiHandedness[idx].label; // 'Left' or 'Right'
        const hand = label === 'Left' ? leftHandObj : rightHandObj;
        hand.group.visible = true;

        landmarks.forEach((lm, i) => {
            const mx = 1 - lm.x; // mirror X
            hand.joints[i].position.set((mx - 0.5) * 12, -(lm.y - 0.5) * 12, -lm.z * 12);
        });

        hand.group.children.filter(c => c.userData.from !== undefined).forEach(cyl => {
            const p1 = hand.joints[cyl.userData.from].position;
            const p2 = hand.joints[cyl.userData.to].position;
            cyl.position.copy(p1).lerp(p2, 0.5);
            cyl.scale.set(1, p1.distanceTo(p2), 1);
            cyl.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                p2.clone().sub(p1).normalize()
            );
        });
    });
}

// ============================================================
// SIGN DETECTION
// ============================================================
function getFingerStates(landmarks) {
    // Improved: use both X and Y for better accuracy
    const wrist = landmarks[0];
    // Finger tips: 4 (thumb), 8 (index), 12 (middle), 16 (ring), 20 (pinky)
    // Finger PIPs: 3 (thumb), 6 (index), 10 (middle), 14 (ring), 18 (pinky)
    return {
        // Thumb: Check if tip is far from both MCP and PIP
        thumb: Math.hypot(landmarks[4].x - landmarks[2].x, landmarks[4].y - landmarks[2].y) > 0.05,
        // For other fingers: tip should be clearly higher than PIP (y decreases upwards)
        index: landmarks[8].y < landmarks[6].y - 0.05,
        middle: landmarks[12].y < landmarks[10].y - 0.05,
        ring: landmarks[16].y < landmarks[14].y - 0.05,
        pinky: landmarks[20].y < landmarks[18].y - 0.05
    };
}

// Fallback dictionary for common signs in case server fails
const fallbackDictionary = {
    'salom': { original: 'Salom', description: 'Assalomu alaykum!' },
    'rahmat': { original: 'Rahmat', description: 'Tashakkur!' },
    'men': { original: 'Men', description: 'Men o\'zim' },
    'ikki': { original: 'Ikki', description: '2 soni' },
    'telefon': { original: 'Telefon', description: 'Aloqa vositasi' }
};

const PROGRESS_LIMIT = 8; // Low threshold for fast detection
let lastSignTime = 0;
const SIGN_COOLDOWN_MS = 2000; // Don't repeat same sign within 2 seconds

async function detectSign(multiHandLandmarks) {
    const progressEl = document.getElementById('detectProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressPercent');

    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
        signCount = 0;
        if (progressEl) progressEl.style.display = 'none';
        return;
    }

    const landmarks = multiHandLandmarks[0];
    const f = getFingerStates(landmarks);
    const ext = Object.values(f).filter(Boolean).length;

    let matched = '';
    if (ext >= 4 && f.index && f.middle && f.ring && f.pinky) matched = 'salom';
    else if (ext === 0) matched = 'rahmat';
    else if (f.index && !f.middle && !f.ring && !f.pinky) matched = 'men';
    else if (f.index && f.middle && !f.ring && !f.pinky) matched = 'ikki';
    else if (f.thumb && f.pinky && !f.index && !f.middle && !f.ring) matched = 'telefon';

    if (matched) {
        if (progressEl) progressEl.style.display = 'block';
        if (matched === lastSign) { signCount++; } else { lastSign = matched; signCount = 1; }

        const pct = Math.min((signCount / PROGRESS_LIMIT) * 100, 100);
        const offset = 251.2 - (251.2 * pct / 100);
        if (progressBar) progressBar.style.strokeDashoffset = offset;
        if (progressText) progressText.textContent = Math.round(pct) + '%';

        if (signCount >= PROGRESS_LIMIT) {
            const signData = signDictionary[matched] || fallbackDictionary[matched];
            const now = Date.now();
            if (signData && now - lastSignTime > SIGN_COOLDOWN_MS) {
                lastSignTime = now;
                playSuccessSound();
                displayDetectedSign(matched, signData);
                showToast(`✅ Aniqlandi: ${signData.original}`, 'success');
                signCount = 0; lastSign = '';
                if (progressEl) progressEl.style.display = 'none';
            } else {
                signCount = 0;
            }
        }
    } else {
        signCount = 0;
        if (progressEl) progressEl.style.display = 'none';
    }
}

function displayDetectedSign(signKey, signData) {
    if (!signData) return;
    const translEl = document.getElementById('deafTranslation');
    const descEl = document.getElementById('deafDescription');

    // Guard against missing properties
    const original = signData.original || signKey;
    const cleanTitle = original.split(/[(,[]/)[0].trim();
    const cleanDesc = (signData.description || 'Belgi aniqlandi').split('.')[0] + '.';

    if (translEl) translEl.textContent = cleanTitle;
    if (descEl) descEl.textContent = cleanDesc;

    speakText(cleanTitle);
    getAIResponse(cleanTitle);
    addToHistory('imo-ishora', cleanTitle);
}

// ============================================================
// AI RESPONSE
// ============================================================
async function getAIResponse(signName) {
    const thinkingEl = document.getElementById('aiThinking');
    const aiTextEl = document.getElementById('aiResponseText');
    if (!aiTextEl) return;

    try {
        if (thinkingEl) thinkingEl.style.display = 'flex';
        aiTextEl.textContent = 'AI tahlil qilmoqda...';
        aiTextEl.style.opacity = '0.5';

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${API_URL}/api/translate/sign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sign: signName }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        const data = await response.json();
        if (data.success) {
            aiTextEl.textContent = data.aiResponse;
            speakText(data.aiResponse);
            addToHistory('ai', data.aiResponse);
        } else {
            aiTextEl.textContent = 'AI javob bera olmadi.';
        }
    } catch (err) {
        aiTextEl.textContent = err.name === 'AbortError' ? 'AI javobi kechikdi...' : 'Xatolik yuz berdi.';
    } finally {
        if (thinkingEl) thinkingEl.style.display = 'none';
        aiTextEl.style.opacity = '1';
    }
}

async function getAIChatResponse(message) {
    const aiTextEl = document.getElementById('aiResponseText');
    try {
        const response = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const data = await response.json();
        if (data.success) {
            if (aiTextEl) aiTextEl.textContent = data.aiResponse;
            speakText(data.aiResponse);
            addToHistory('user', message);
            addToHistory('ai', data.aiResponse);
        }
    } catch (err) { console.error('Chat xatosi:', err); }
}

// ============================================================
// VOICE TO SIGN (Hearing Mode)
// ============================================================
async function processVoiceToSign(text) {
    const signOutputEl = document.getElementById('signOutput');
    const signTranslEl = document.getElementById('signTranslation');
    const aiGuideEl = document.getElementById('aiResponseText');

    if (signOutputEl) signOutputEl.innerHTML = '<div style="color:#aaa;padding:1rem;">⏳ Tarjima qilinmoqda...</div>';
    if (aiGuideEl) { aiGuideEl.textContent = 'AI tahlil qilmoqda...'; aiGuideEl.style.opacity = '0.5'; }

    try {
        const response = await fetch(`${API_URL}/api/voice-to-sign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Show sign cards
        if (signOutputEl) {
            let html = '';
            data.signs.forEach(s => {
                html += `<div style="
                    background:rgba(0,210,255,0.1);
                    border:1px solid rgba(0,210,255,0.3);
                    border-radius:15px;
                    padding:1rem;
                    margin:0.5rem 0;
                    animation: fadeIn 0.3s ease;">
                    <div style="font-weight:700;font-size:1.1rem;color:#00d2ff;">${s.word.toUpperCase()}</div>
                    <div style="font-size:0.9rem;color:#aaa;margin-top:0.3rem;">${s.translation}</div>
                    <div style="font-size:0.8rem;color:#888;margin-top:0.3rem;">👋 ${s.description}</div>
                </div>`;
            });
            if (data.notFound && data.notFound.length > 0) {
                html += `<div style="
                    background:rgba(255,200,0,0.08);
                    border:1px solid rgba(255,200,0,0.2);
                    border-radius:15px;
                    padding:1rem;
                    margin:0.5rem 0;">
                    <div style="font-weight:700;color:#ffc800;">🔤 Daktil bilan yoziladi:</div>
                    <div style="color:#aaa;margin-top:0.3rem;">${data.notFound.map(w => w.toUpperCase()).join(' • ')}</div>
                </div>`;
            }
            signOutputEl.innerHTML = html || '<div style="color:#888">Belgi topilmadi</div>';
        }

        // Show AI guide text
        if (aiGuideEl) { aiGuideEl.textContent = data.aiGuide; aiGuideEl.style.opacity = '1'; }
        if (signTranslEl) signTranslEl.textContent = text;

        // Speak the guide
        speakText(data.aiGuide);
        addToHistory('matn', text);

    } catch (err) {
        console.error('Voice-to-sign error:', err);
        if (signOutputEl) signOutputEl.innerHTML = '<div style="color:#f44">Xatolik yuz berdi</div>';
        if (aiGuideEl) { aiGuideEl.textContent = 'Tarjimada xatolik.'; aiGuideEl.style.opacity = '1'; }
    }
}

// ============================================================
// SPEECH (TTS) - Enhanced Robustness
// ============================================================
function speakText(text) {
    if (!text || !window.speechSynthesis) return;

    // Explicitly check for user interaction if needed, though most browsers allow it once started
    window.speechSynthesis.cancel();

    const doSpeak = () => {
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();

            // Priority: Uzbek -> Turkish -> Russian -> English
            let voice = voices.find(v => v.lang.startsWith('uz') || v.name.toLowerCase().includes('uzbek'))
                || voices.find(v => v.lang.startsWith('tr'))
                || voices.find(v => v.lang.startsWith('ru'))
                || voices.find(v => v.lang.startsWith('en'))
                || voices[0];

            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            } else {
                utterance.lang = 'uz-UZ';
            }

            utterance.rate = (settings && settings.speechRate) || 0.95;
            utterance.volume = (settings && settings.speechVolume) || 1.0;
            utterance.pitch = 1.0;

            window.speechSynthesis.speak(utterance);
            console.log('🔊 AI Ovoz:', text);
        } catch (e) {
            console.error('Speech error:', e);
        }
    };

    if (window.speechSynthesis.getVoices().length > 0) {
        doSpeak();
    } else {
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.onvoiceschanged = null;
            doSpeak();
        };
    }
}

// ============================================================
// CAMERA
// ============================================================
async function startDeafCamera() {
    if (isCameraRunning) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        deafVideo.srcObject = stream;
        await deafVideo.play();

        await new Promise(resolve => {
            if (deafVideo.readyState >= 2) resolve();
            else deafVideo.addEventListener('loadeddata', resolve, { once: true });
        });

        deafCanvas.width = deafVideo.videoWidth || 640;
        deafCanvas.height = deafVideo.videoHeight || 480;
        isCameraRunning = true;

        const loop = async () => {
            if (!isCameraRunning) return;
            if (deafVideo.readyState >= 2) await hands.send({ image: deafVideo });
            requestAnimationFrame(loop);
        };
        loop();
        showToast('Kamera ishga tushdi ✅', 'success');
    } catch (err) {
        const msg = err.name === 'NotAllowedError'
            ? 'Kameraga ruxsat yo\'q! Brauzer sozlamalarini tekshiring.'
            : 'Kamera xatosi: ' + err.message;
        showToast(msg, 'error');
        console.error('Camera error:', err);
    }
}

function stopDeafCamera() {
    isCameraRunning = false;
    if (deafVideo.srcObject) {
        deafVideo.srcObject.getTracks().forEach(t => t.stop());
        deafVideo.srcObject = null;
    }
    deafCtx.clearRect(0, 0, deafCanvas.width, deafCanvas.height);
    if (leftHandObj.group) leftHandObj.group.visible = false;
    if (rightHandObj.group) rightHandObj.group.visible = false;
}

// ============================================================
// SPEECH TO TEXT (STT)
// ============================================================
function startSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        showToast("Bu brauzer ovoz tanishni qo'llab-quvvatlamaydi.", 'error');
        return;
    }
    if (recognition) { stopVoiceRecognition(); return; }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'uz-UZ';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => { isListening = true; updateVoiceUI(true); showToast('Gapiring... 🎤', 'info'); };
    recognition.onresult = (event) => {
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
        }
        if (final.trim()) {
            const userSpeechEl = document.getElementById('userSpeech');
            if (userSpeechEl) userSpeechEl.textContent = final.trim();
            processVoiceToSign(final.trim());
        }
    };
    recognition.onerror = (e) => { console.error('STT Error:', e.error); stopVoiceRecognition(); };
    recognition.onend = () => { if (isListening && recognition) { try { recognition.start(); } catch (e) { } } };
    recognition.start();
}

function stopVoiceRecognition() {
    if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
    isListening = false;
    updateVoiceUI(false);
}

function updateVoiceUI(active) {
    const btn = document.getElementById('startListening');
    const stopBtn = document.getElementById('stopListening');
    if (btn) btn.disabled = active;
    if (stopBtn) stopBtn.disabled = !active;
}

// ============================================================
// QUIZ CAMERA
// ============================================================
async function startQuiz() {
    const signs = Object.keys(signDictionary);
    if (signs.length === 0) { showToast('Lug\'at yuklanmagan', 'error'); return; }
    currentQuizTarget = signs[Math.floor(Math.random() * signs.length)];
    const targetEl = document.getElementById('targetSign');
    const statusEl = document.getElementById('quizStatus');
    const skipBtn = document.getElementById('skipQuiz');
    const startBtn = document.getElementById('startQuiz');
    if (targetEl) targetEl.textContent = currentQuizTarget.toUpperCase();
    if (statusEl) statusEl.textContent = 'Belgini ko\'rsating...';
    if (skipBtn) skipBtn.style.display = 'inline-block';
    if (startBtn) startBtn.style.display = 'none';

    if (!isQuizRunning) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            quizVideo.srcObject = stream;
            await quizVideo.play();
            await new Promise(r => {
                if (quizVideo.readyState >= 2) r();
                else quizVideo.addEventListener('loadeddata', r, { once: true });
            });
            quizCanvas.width = quizVideo.videoWidth || 640;
            quizCanvas.height = quizVideo.videoHeight || 480;
            isQuizRunning = true;
            const quizLoop = async () => {
                if (!isQuizRunning) return;
                if (quizVideo.readyState >= 2) await hands.send({ image: quizVideo });
                requestAnimationFrame(quizLoop);
            };
            quizLoop();
        } catch (err) { console.error('Quiz camera error:', err); }
    }
}

function stopQuizCamera() {
    isQuizRunning = false;
    if (quizVideo.srcObject) {
        quizVideo.srcObject.getTracks().forEach(t => t.stop());
        quizVideo.srcObject = null;
    }
}

// ============================================================
// DICTIONARY & LIBRARY
// ============================================================
async function loadDictionary() {
    try {
        const res = await fetch(`${API_URL}/api/dictionary`);
        const data = await res.json();
        if (data.success) {
            signDictionary = data.dictionary;
            console.log(`✅ Lug'at yuklandi: ${Object.keys(signDictionary).length} ta so'z`);
            displayLibrary();
            initSettingsUI();
            renderHistory();
        }
    } catch (err) { console.error('Lug\'at yuklanmadi:', err); }
}

function displayLibrary(filter = '') {
    const list = document.getElementById('libraryList');
    if (!list) return;
    list.innerHTML = '';
    Object.entries(signDictionary).forEach(([key, data]) => {
        if (filter && !key.includes(filter.toLowerCase())) return;
        const item = document.createElement('div');
        item.className = 'card';
        item.style.cssText = 'padding:1.5rem;text-align:center;cursor:pointer;';
        item.innerHTML = `<div style="font-weight:700;margin-bottom:0.5rem;">${key.toUpperCase()}</div>
            <div style="font-size:0.8rem;color:#aaa;margin-bottom:1rem;">${data.original}</div>
            <button class="btn btn-primary" style="width:100%;font-size:0.8rem;" onclick="speakText('${data.original.replace(/'/g, "\\'")}')">🔊 Eshitish</button>`;
        list.appendChild(item);
    });
}

// ============================================================
// HISTORY
// ============================================================
function addToHistory(type, text) {
    if (!settings.keepHistory) return;
    const time = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    historyList.unshift({ type, text, time });
    if (historyList.length > 20) historyList.pop();
    storage.set('translationHistory', historyList);
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = '';
    historyList.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const icon = item.type === 'imo-ishora' ? '👤' : item.type === 'ai' ? '🤖' : '🗣️';
        const label = item.type === 'imo-ishora' ? 'Imo-ishora → Matn' : item.type === 'ai' ? 'AI javob' : 'Matn';
        div.innerHTML = `<div class="history-icon">${icon}</div>
            <div class="history-text">
                <div><strong>${label}:</strong> ${item.text.substring(0, 60)}${item.text.length > 60 ? '...' : ''}</div>
                <div class="history-time">${item.time}</div>
            </div>`;
        list.appendChild(div);
    });
}

// ============================================================
// SETTINGS
// ============================================================
function initSettingsUI() {
    const rateEl = document.getElementById('speechRate');
    const volEl = document.getElementById('speechVolume');
    const mirrorEl = document.getElementById('mirrorMode');
    const skelEl = document.getElementById('showSkeleton');
    const histEl = document.getElementById('keepHistory');
    if (rateEl) rateEl.value = settings.speechRate;
    if (volEl) volEl.value = settings.speechVolume;
    if (mirrorEl) mirrorEl.checked = settings.mirrorMode;
    if (skelEl) skelEl.checked = settings.showSkeleton;
    if (histEl) histEl.checked = settings.keepHistory;
    updateMirrorMode();
}

function updateMirrorMode() {
    const t = settings.mirrorMode ? 'scaleX(-1)' : 'scaleX(1)';
    if (deafVideo) deafVideo.style.transform = t;
    if (deafCanvas) deafCanvas.style.transform = t;
    if (quizVideo) quizVideo.style.transform = t;
    if (quizCanvas) quizCanvas.style.transform = t;
}

// ============================================================
// UI: TOASTS, SOUNDS
// ============================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function playSuccessSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch (e) { }
}

// ============================================================
// NAVIGATION
// ============================================================
document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('[data-nav]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const nav = link.dataset.nav;
        const hero = document.querySelector('.hero');
        const translateMode = document.getElementById('deafMode');
        const hearingMode = document.getElementById('hearingMode');
        const librarySection = document.getElementById('librarySection');
        const quizSection = document.getElementById('quizSection');
        const historySection = document.getElementById('historySection');

        [hero, translateMode, hearingMode, librarySection, quizSection, historySection]
            .forEach(s => { if (s) s.style.display = 'none'; });

        stopDeafCamera(); stopQuizCamera(); stopVoiceRecognition();

        if (nav === 'translate') {
            hero.style.display = 'block';
            translateMode.style.display = 'grid';
            historySection.style.display = 'block';
        } else if (nav === 'library') {
            librarySection.style.display = 'block';
        } else if (nav === 'quiz') {
            quizSection.style.display = 'block';
        }
    });
});

// Mode toggle (deaf / hearing)
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        const deafMode = document.getElementById('deafMode');
        const hearingMode = document.getElementById('hearingMode');
        if (mode === 'deaf') {
            if (deafMode) deafMode.style.display = 'grid';
            if (hearingMode) hearingMode.style.display = 'none';
            stopVoiceRecognition();
        } else {
            if (deafMode) deafMode.style.display = 'none';
            if (hearingMode) hearingMode.style.display = 'grid';
            stopDeafCamera();
        }
    });
});

// Settings
const openSettingsBtn = document.getElementById('openSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const resetDataBtn = document.getElementById('resetData');
if (openSettingsBtn) openSettingsBtn.onclick = () => document.getElementById('settingsModal').style.display = 'flex';
if (closeSettingsBtn) closeSettingsBtn.onclick = () => {
    settings = {
        speechRate: parseFloat(document.getElementById('speechRate').value),
        speechVolume: parseFloat(document.getElementById('speechVolume').value),
        mirrorMode: document.getElementById('mirrorMode').checked,
        showSkeleton: document.getElementById('showSkeleton').checked,
        keepHistory: document.getElementById('keepHistory').checked
    };
    storage.set('appSettings', settings);
    updateMirrorMode();
    document.getElementById('settingsModal').style.display = 'none';
};
if (resetDataBtn) resetDataBtn.onclick = () => {
    if (confirm('Barcha ma\'lumotlarni o\'chirishni xohlaysizmi?')) { storage.clear(); location.reload(); }
};

// Camera buttons
const startCamBtn = document.getElementById('startDeafCamera');
const stopCamBtn = document.getElementById('stopDeafCamera');
if (startCamBtn) startCamBtn.addEventListener('click', startDeafCamera);
if (stopCamBtn) stopCamBtn.addEventListener('click', stopDeafCamera);

// STT buttons
const startListeningBtn = document.getElementById('startListening');
const stopListeningBtn = document.getElementById('stopListening');
if (startListeningBtn) startListeningBtn.addEventListener('click', startSpeechRecognition);
if (stopListeningBtn) stopListeningBtn.addEventListener('click', stopVoiceRecognition);

// Speak translation
const speakTranslBtn = document.getElementById('speakTranslation');
if (speakTranslBtn) speakTranslBtn.addEventListener('click', () => {
    const t = document.getElementById('deafTranslation')?.textContent;
    if (t && t !== '...') speakText(t);
});

// Library search
const libSearch = document.getElementById('librarySearch');
if (libSearch) libSearch.addEventListener('input', e => displayLibrary(e.target.value));

// Quiz
const startQuizBtn = document.getElementById('startQuiz');
const skipQuizBtn = document.getElementById('skipQuiz');
if (startQuizBtn) startQuizBtn.addEventListener('click', startQuiz);
if (skipQuizBtn) skipQuizBtn.addEventListener('click', startQuiz);

// Quiz detection integration
const _origDetect = detectSign;
detectSign = async function (multiHandLandmarks) {
    await _origDetect(multiHandLandmarks);
    if (isQuizRunning && lastSign === currentQuizTarget && signCount >= PROGRESS_LIMIT) {
        quizScore++;
        const scoreEl = document.getElementById('quizScore');
        const statusEl = document.getElementById('quizStatus');
        if (scoreEl) scoreEl.textContent = quizScore;
        if (statusEl) statusEl.textContent = 'To\'g\'ri! Keyingi belgi...';
        setTimeout(startQuiz, 2000);
        signCount = 0;
    }
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    init3DScene();
    loadDictionary();

    // Voice test button
    const testVoiceBtn = document.getElementById('testVoice');
    if (testVoiceBtn) {
        testVoiceBtn.addEventListener('click', () => {
            speakText('Ovoz tizimi muvaffaqiyatli ishlamoqda.');
            showToast('Ovoz sinab ko\'rildi! 🔊', 'success');
        });
    }

    // Initial greeting
    setTimeout(() => speakText('Imo-ishora AI tayyor'), 1500);
});
