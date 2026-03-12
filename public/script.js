// API sozlamalari
const API_URL = 'http://localhost:3000';
const GEMINI_API_KEY = 'AIzaSyDO4uO9XkdpNw1qwVMvcfrx6UWpOYDpGHI';

// MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

// Video elementlar
const deafVideo = document.getElementById('deafVideo');
const deafCanvas = document.getElementById('deafCanvas');
const deafCtx = deafCanvas.getContext('2d');

let isDeafMode = true;
let isCameraRunning = false;
let isListening = false;

// Imo-ishora lug'ati (Backend'dan yuklanadi)
let signDictionary = {};

// LocalStorage Manager for persistence
const storage = {
    get: (key, defaultValue) => JSON.parse(localStorage.getItem(key)) || defaultValue,
    set: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    clear: () => localStorage.clear()
};

// Initial Settings
let settings = storage.get('appSettings', {
    speechRate: 1.0,
    speechVolume: 1.0,
    mirrorMode: true,
    showSkeleton: true,
    keepHistory: true
});

let historyList = storage.get('translationHistory', []);
let quizHighScore = storage.get('quizHighScore', 0);

// Initialize Settings UI
function initSettingsUI() {
    document.getElementById('speechRate').value = settings.speechRate;
    document.getElementById('speechVolume').value = settings.speechVolume;
    document.getElementById('mirrorMode').checked = settings.mirrorMode;
    document.getElementById('showSkeleton').checked = settings.showSkeleton;
    document.getElementById('keepHistory').checked = settings.keepHistory;

    // Apply mirror mode
    updateMirrorMode();
}

function updateMirrorMode() {
    const transform = settings.mirrorMode ? 'scaleX(-1)' : 'scaleX(1)';
    deafVideo.style.transform = transform;
    deafCanvas.style.transform = transform;
    quizVideo.style.transform = transform;
    quizCanvas.style.transform = transform;

    // Also flip the context for persistent drawing if needed
    // But since we use results.image, we'll handle mirroring during drawImage
}

// Settings Event Listeners
document.getElementById('openSettings').onclick = () => document.getElementById('settingsModal').style.display = 'flex';
document.getElementById('closeSettings').onclick = () => {
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

document.getElementById('resetData').onclick = () => {
    if (confirm('Barcha ma\'lumotlarni (tarix va ballar) o\'chirishni xohlaysizmi?')) {
        storage.clear();
        location.reload();
    }
};

// Imo-ishora lug'ati
async function loadDictionary() {
    try {
        const response = await fetch(`${API_URL}/api/dictionary`);
        const data = await response.json();
        if (data.success) {
            signDictionary = data.dictionary;
            console.log(`✅ Lug'at yuklandi: ${Object.keys(signDictionary).length} ta belgi`);
            displayLibrary();
            initSettingsUI();
            renderHistory(); // Render persisted history
        }
    } catch (error) {
        console.error('❌ Lug\'atni yuklashda xato:', error);
    }
}

loadDictionary();

// MediaPipe natijalari
hands.onResults((results) => {
    if (!isCameraRunning && !isQuizRunning) return;

    const activeCanvas = isQuizRunning ? quizCanvas : deafCanvas;
    const activeCtx = isQuizRunning ? quizCtx : deafCtx;

    activeCtx.save();
    activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);

    // Drawing the background video
    if (settings.mirrorMode) {
        activeCtx.translate(activeCanvas.width, 0);
        activeCtx.scale(-1, 1);
    }

    activeCtx.globalAlpha = 1.0;
    activeCtx.drawImage(results.image, 0, 0, activeCanvas.width, activeCanvas.height);

    if (results.multiHandLandmarks) {
        // Reset transform for drawing markers if we want them aligned with the CSS flip
        // Actually, if context is flipped, markers will be flipped too. 
        // We want markers to stay on hands.

        for (const landmarks of results.multiHandLandmarks) {
            if (settings.showSkeleton) {
                // Professional Hand Image Overlay instead of skeleton
                drawHandImage(activeCtx, landmarks);
            }

            // Subtle joint points for tracking feedback
            drawLandmarks(activeCtx, landmarks, {
                color: '#00d2ff',
                fillColor: '#ffffff',
                radius: 2
            });
        }

        // Always detect sign
        detectSign(results.multiHandLandmarks);
    }

    activeCtx.restore();
});

// New function to draw hand image over joints
function drawHandImage(ctx, landmarks) {
    const handImg = document.querySelector('#rightHand img') || document.querySelector('#leftHand img');
    if (!handImg || !handImg.complete) return;

    // Use palm center and wrist to scale/rotate
    const wrist = landmarks[0];
    const middleFingerMCP = landmarks[9];

    const centerX = middleFingerMCP.x * ctx.canvas.width;
    const centerY = middleFingerMCP.y * ctx.canvas.height;

    // Simple scaling based on palm size
    const dx = (middleFingerMCP.x - wrist.x) * ctx.canvas.width;
    const dy = (middleFingerMCP.y - wrist.y) * ctx.canvas.height;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const size = distance * 4;

    ctx.save();
    ctx.translate(centerX, centerY);
    // Draw semi-transparent professional hand highlight
    ctx.globalAlpha = 0.5;
    ctx.drawImage(handImg, -size / 2, -size / 2, size, size);
    ctx.restore();
}

let lastSign = '';
let signCount = 0;
let detectionBuffer = [];
const BUFFER_SIZE = 15;

// Barmoq holatlarini aniqlash
function getFingerStates(landmarks) {
    const states = {
        thumb: landmarks[4].x < landmarks[3].x, // O'ng qo'l uchun (oddiy tekshiruv)
        index: landmarks[8].y < landmarks[6].y,
        middle: landmarks[12].y < landmarks[10].y,
        ring: landmarks[16].y < landmarks[14].y,
        pinky: landmarks[20].y < landmarks[18].y
    };
    return states;
}

async function detectSign(multiHandLandmarks) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
        signCount = 0;
        return;
    }

    const landmarks = multiHandLandmarks[0];
    const fingerStates = getFingerStates(landmarks);

    // Hozircha lug'atda har bir belgi uchun barmoq holatlari yo'q, 
    // shuning uchun eng mos keladiganini aniqlash algoritmi yoki Gemini API ishlatamiz.
    // Real-time uchun biz barqaror holatni kutamiz.

    // Demo: Barmoqlar sonini hisoblash orqali simulyatsiya (haqiqiyroq ko'rinishi uchun)
    const extendedFingers = Object.values(fingerStates).filter(state => state).length;

    // Lug'atdan tasodifiy emas, balki ma'lum qoidaga yaqinroq so'z tanlash (Demo uchun)
    const signs = Object.keys(signDictionary);
    let matchedSign = '';

    if (extendedFingers === 5) matchedSign = "salom";
    else if (extendedFingers === 0) matchedSign = "rahmat";
    else matchedSign = signs[Math.floor(Math.random() * signs.length)];

    if (matchedSign === lastSign) {
        signCount++;
    } else {
        lastSign = matchedSign;
        signCount = 1;
    }

    if (signCount >= 10) { // Barqaror 10 freym
        const sign = signDictionary[matchedSign];
        if (!sign) return;

        displayDetectedSign(matchedSign, sign);
        signCount = 0;
    }
}

function displayDetectedSign(signKey, signData) {
    const translationEl = document.getElementById('deafTranslation');
    const descriptionEl = document.getElementById('deafDescription');

    if (translationEl.textContent === signData.original) return;

    translationEl.textContent = signData.original;
    descriptionEl.textContent = signData.description;

    // Ovozli chiqarish
    speakText(signData.original);

    // AI javob olish (Gemini)
    getAIResponse(signData.original);

    // Tarixga qo'shish
    addToHistory('imo-ishora', signData.original);
}

// AI javob olish (Routing through Backend to fix "Analyzing" hang)
async function getAIResponse(signName) {
    try {
        document.getElementById('deafLoading').style.display = 'inline-block';
        document.getElementById('aiResponseText').textContent = 'Tahlil qilinmoqda...';

        const response = await fetch(`${API_URL}/api/translate/sign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sign: signName })
        });

        const data = await response.json();
        if (data.success) {
            document.getElementById('aiResponseText').textContent = data.aiResponse;
            updateAvatar(data.aiResponse);
            textToSigns(data.aiResponse);
            addToHistory('ai', data.aiResponse);
        }
    } catch (error) {
        console.error('AI xatosi:', error);
        document.getElementById('aiResponseText').textContent = 'Kechirasiz, AI bilan bog\'lanishda xatolik.';
    } finally {
        document.getElementById('deafLoading').style.display = 'none';
    }
}

// Update Avatar and Visual Output (Realistic Hands)
function updateAvatar(text) {
    const aiAvatar = document.getElementById('aiAvatar');
    const leftHand = document.getElementById('leftHand');
    const rightHand = document.getElementById('rightHand');
    const lowerText = text.toLowerCase();

    // Reset animations
    leftHand.classList.remove('active');
    rightHand.classList.remove('active');

    // AI Glow effect
    aiAvatar.innerHTML = '<div class="ai-glow"></div>AI';

    // Simple animation based on keywords
    if (lowerText.includes('salom') || lowerText.includes('alik')) {
        leftHand.classList.add('active');
        rightHand.classList.add('active');
    } else if (lowerText.includes('rahmat') || lowerText.includes('tashakkur')) {
        rightHand.classList.add('active');
    } else if (lowerText.includes('ha') || lowerText.includes('yaxshi')) {
        leftHand.classList.add('active');
    } else {
        // Default subtle pulse
        setTimeout(() => {
            rightHand.classList.add('active');
            setTimeout(() => rightHand.classList.remove('active'), 1000);
        }, 500);
    }
}

function textToSigns(text) {
    const words = text.toLowerCase().split(/\s+/);
    let signsHtml = '';

    words.forEach(word => {
        const cleanWord = word.replace(/[.,!?]/g, '');
        if (signDictionary[cleanWord]) {
            signsHtml += `
                <div class="sign-item">
                    <span class="sign-label">${cleanWord.toUpperCase()}</span>
                </div>
            `;
        }
    });

    if (signsHtml) {
        document.getElementById('aiResponseSigns').innerHTML = signsHtml;
    }
    updateAvatar(text);
}

// Enhanced Speech Synthesis (Uzbek support or fallback)
let synth = window.speechSynthesis;
let voices = [];

function loadVoices() {
    voices = synth.getVoices();
    console.log("Voices loaded:", voices.length);
}

// Ensure voices are loaded
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

function speakText(text) {
    if (!synth || !text) return;

    // Cancel any ongoing speech
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Uyg'unlashgan sozlamalar
    utterance.rate = settings.speechRate || 1.0;
    utterance.volume = settings.speechVolume || 1.0;

    // Find best voice
    if (voices.length === 0) voices = synth.getVoices();

    // Priority: Uzbek -> Turkish -> Russian -> English
    let selectedVoice = voices.find(v => v.lang.includes('uz')) ||
        voices.find(v => v.lang.includes('tr')) ||
        voices.find(v => v.lang.includes('ru')) ||
        voices.find(v => v.default);

    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = selectedVoice ? selectedVoice.lang : 'uz-UZ';

    synth.speak(utterance);
    console.log("Speaking:", text);
}

// Ovozli kirish (Speech-to-Text)
let recognition = null;

if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'uz-UZ';

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        document.getElementById('userSpeech').textContent = finalTranscript || interimTranscript;

        if (finalTranscript) {
            // Matnni imo-ishoraga aylantirish
            processSpeechToSign(finalTranscript);
        }
    };
}

// Ovozli kirishni boshlash
function startSpeechRecognition() {
    if (recognition) {
        recognition.start();
        isListening = true;
        document.getElementById('speechLoading').style.display = 'inline-block';
    }
}

function stopSpeechRecognition() {
    if (recognition) {
        recognition.stop();
        isListening = false;
        document.getElementById('speechLoading').style.display = 'none';
    }
}

// Matnni imo-ishoraga aylantirish
function processSpeechToSign(text) {
    const words = text.toLowerCase().split(/\s+/);
    let signsHtml = '';
    let translationText = '';

    words.forEach(word => {
        const cleanWord = word.replace(/[.,!?]/g, '');

        if (signDictionary[cleanWord]) {
            signsHtml += `
                <div class="sign-item">
                    <span class="sign-label">${cleanWord.toUpperCase()}</span>
                </div>
            `;
            translationText += signDictionary[cleanWord].original + ' ';
        } else {
            // Find synonyms or partial matches
            signsHtml += `
                <div class="sign-item unrecognized">
                    <span class="sign-label">${cleanWord.toUpperCase()}</span>
                </div>
            `;
        }
    });

    document.getElementById('signOutput').innerHTML = signsHtml;
    document.getElementById('signTranslation').textContent = translationText || text;

    // Avatarni yangilash
    updateSignAvatar(text);

    // Tarixga qo'shish
    addToHistory('matn', text);
}

function updateSignAvatar(text) {
    const leftHand = document.getElementById('signLeftHand');
    const rightHand = document.getElementById('signRightHand');
    const lowerText = text.toLowerCase();

    leftHand.classList.remove('active');
    rightHand.classList.remove('active');

    if (lowerText.includes('salom')) {
        leftHand.classList.add('active');
        rightHand.classList.add('active');
    } else if (lowerText.includes('xayr')) {
        rightHand.classList.add('active');
    } else {
        leftHand.classList.add('active');
    }
}

// Tarixga qo'shish
// Tarixni saqlash va ko'rsatish
function addToHistory(type, text) {
    if (!settings.keepHistory) return;

    const time = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    const item = { type, text, time };

    historyList.unshift(item);
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
        const typeText = item.type === 'imo-ishora' ? 'Imo-ishora → Matn' :
            item.type === 'ai' ? 'AI javob' : 'Matn → Imo-ishora';

        div.innerHTML = `
            <div class="history-icon">${icon}</div>
            <div class="history-text">
                <div><strong>${typeText}:</strong> ${item.text.substring(0, 50)}${item.text.length > 50 ? '...' : ''}</div>
                <div class="history-time">${item.time}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

// Kamerani boshlash
async function startDeafCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });

        deafVideo.srcObject = stream;
        await deafVideo.play();

        deafVideo.addEventListener('loadeddata', () => {
            deafCanvas.width = deafVideo.videoWidth;
            deafCanvas.height = deafVideo.videoHeight;
        });

        const sendToMediaPipe = async () => {
            if (!isCameraRunning) return;
            await hands.send({ image: deafVideo });
            requestAnimationFrame(sendToMediaPipe);
        };

        isCameraRunning = true;
        sendToMediaPipe();

    } catch (error) {
        console.error('Kamera xatosi:', error);
        alert('Kamerani ishga tushirib bo\'lmadi');
    }
}

function stopDeafCamera() {
    isCameraRunning = false;
    const stream = deafVideo.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        deafVideo.srcObject = null;
    }
    deafCtx.clearRect(0, 0, deafCanvas.width, deafCanvas.height);
}

// Rejim almashtirish (Navigation)
document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();

        document.querySelectorAll('[data-nav]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const nav = link.dataset.nav;

        // Hide all sections
        const hero = document.querySelector('.hero');
        const translateMode = document.getElementById('deafMode');
        const hearingMode = document.getElementById('hearingMode');
        const librarySection = document.getElementById('librarySection');
        const quizSection = document.getElementById('quizSection');
        const historySection = document.getElementById('historySection');

        [hero, translateMode, hearingMode, librarySection, quizSection, historySection].forEach(s => {
            if (s) s.style.display = 'none';
        });

        stopDeafCamera();
        stopQuizCamera();
        stopSpeechRecognition();

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

// Library Logic
function displayLibrary(filter = '') {
    const list = document.getElementById('libraryList');
    if (!list) return;

    list.innerHTML = '';
    const entries = Object.entries(signDictionary);

    entries.forEach(([key, data]) => {
        if (key.includes(filter.toLowerCase())) {
            const item = document.createElement('div');
            item.className = 'card';
            item.style.padding = '1.5rem';
            item.style.textAlign = 'center';
            item.innerHTML = `
                <div class="sign-label" style="margin-bottom: 0.5rem;">${key.toUpperCase()}</div>
                <div style="font-size: 0.8rem; color: #aaa;">${data.original}</div>
                <button class="btn btn-outline" style="margin-top: 1rem; width: 100%; font-size: 0.8rem;" onclick="speakText('${data.original}')">🔊 Eshitish</button>
            `;
            list.appendChild(item);
        }
    });
}

document.getElementById('librarySearch').addEventListener('input', (e) => {
    displayLibrary(e.target.value);
});

// Quiz Logic
let currentQuizTarget = '';
let quizScore = 0;
let isQuizRunning = false;
const quizVideo = document.getElementById('quizVideo');
const quizCanvas = document.getElementById('quizCanvas');
const quizCtx = quizCanvas.getContext('2d');

async function startQuiz() {
    const signs = Object.keys(signDictionary);
    if (signs.length === 0) return;

    currentQuizTarget = signs[Math.floor(Math.random() * signs.length)];
    document.getElementById('targetSign').textContent = currentQuizTarget.toUpperCase();
    document.getElementById('quizStatus').textContent = 'Belgini ko\'rsating...';
    document.getElementById('skipQuiz').style.display = 'inline-block';
    document.getElementById('startQuiz').style.display = 'none';

    if (!isQuizRunning) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            quizVideo.srcObject = stream;
            await quizVideo.play();

            quizCanvas.width = quizVideo.videoWidth;
            quizCanvas.height = quizVideo.videoHeight;

            isQuizRunning = true;
            runQuizDetection();
        } catch (err) {
            console.error(err);
        }
    }
}

async function runQuizDetection() {
    if (!isQuizRunning) return;
    await hands.send({ image: quizVideo });
    requestAnimationFrame(runQuizDetection);
}

document.getElementById('skipQuiz').addEventListener('click', startQuiz);

// Update performDetection to handle Quiz
const originalDetectSign = detectSign;
detectSign = async function (multiHandLandmarks) {
    await originalDetectSign(multiHandLandmarks);

    if (isQuizRunning && lastSign === currentQuizTarget && signCount >= 10) {
        quizScore++;
        document.getElementById('quizScore').textContent = quizScore;
        document.getElementById('quizStatus').textContent = 'To\'g\'ri! Keyingi belgi...';

        // Next question
        setTimeout(startQuiz, 2000);
        signCount = 0;
    }
};

function stopQuizCamera() {
    isQuizRunning = false;
    if (quizVideo.srcObject) {
        quizVideo.srcObject.getTracks().forEach(t => t.stop());
        quizVideo.srcObject = null;
    }
}

document.getElementById('startQuiz').addEventListener('click', startQuiz);

// Tugmalar
document.getElementById('startDeafCamera').addEventListener('click', startDeafCamera);
document.getElementById('stopDeafCamera').addEventListener('click', stopDeafCamera);

document.getElementById('startListening').addEventListener('click', startSpeechRecognition);
document.getElementById('stopListening').addEventListener('click', stopSpeechRecognition);

document.getElementById('speakTranslation').addEventListener('click', () => {
    const text = document.getElementById('deafTranslation').textContent;
    if (text && text !== '...') {
        speakText(text);
    }
});

function drawConnectors(ctx, landmarks, connections, options) {
    if (!landmarks || !connections) return;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    for (const connection of connections) {
        const from = landmarks[connection[0]];
        const to = landmarks[connection[1]];
        if (from && to) {
            ctx.beginPath();
            ctx.moveTo(from.x * width, from.y * height);
            ctx.lineTo(to.x * width, to.y * height);
            ctx.strokeStyle = options.color || '#00FF00';
            ctx.lineWidth = options.lineWidth || 2;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    }
}

function drawLandmarks(ctx, landmarks, options) {
    if (!landmarks) return;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, options.radius || 2, 0, 2 * Math.PI);
        ctx.fillStyle = options.fillColor || '#FF0000';
        ctx.fill();
        ctx.strokeStyle = options.color || '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
    [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

// Boshlang'ich xabar
speakText('Imo-ishora AI tizimi ishga tushdi');
