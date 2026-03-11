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

async function loadDictionary() {
    try {
        const response = await fetch(`${API_URL}/api/dictionary`);
        const data = await response.json();
        if (data.success) {
            signDictionary = data.dictionary;
            console.log(`✅ Lug'at yuklandi: ${Object.keys(signDictionary).length} ta belgi`);
        }
    } catch (error) {
        console.error('❌ Lug\'atni yuklashda xato:', error);
        // Zaxira lug'at (prototype uchun)
        signDictionary = {
            "salom": { "original": "Salom", "description": "Salomlashish" },
            "rahmat": { "original": "Rahmat", "description": "Tashakkur" }
        };
    }
}

loadDictionary();

// MediaPipe natijalari
hands.onResults((results) => {
    if (!isDeafMode || !isCameraRunning) return;

    deafCtx.save();
    deafCtx.clearRect(0, 0, deafCanvas.width, deafCanvas.height);

    // Smooth image drawing
    deafCtx.globalAlpha = 1.0;
    deafCtx.drawImage(results.image, 0, 0, deafCanvas.width, deafCanvas.height);

    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            // Realistic "Skeleton" Look
            drawConnectors(deafCtx, landmarks, HAND_CONNECTIONS, {
                color: 'rgba(0, 210, 255, 0.8)',
                lineWidth: 5
            });
            drawLandmarks(deafCtx, landmarks, {
                color: '#ffffff',
                fillColor: '#3a7bd5',
                radius: 4
            });

            // Highlight fingertips for "Active" feel
            const fingertips = [4, 8, 12, 16, 20];
            fingertips.forEach(idx => {
                const lm = landmarks[idx];
                deafCtx.beginPath();
                deafCtx.arc(lm.x * deafCanvas.width, lm.y * deafCanvas.height, 8, 0, 2 * Math.PI);
                deafCtx.fillStyle = 'rgba(0, 210, 255, 0.3)';
                deafCtx.fill();
            });
        }

        // Detect sign
        detectSign(results.multiHandLandmarks);
    }

    deafCtx.restore();
});

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

// AI javob olish
async function getAIResponse(userMessage) {
    try {
        document.getElementById('deafLoading').style.display = 'inline-block';

        // Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Foydalanuvchi imo-ishora orqali aytdi: "${userMessage}". 
                        Unga qisqa, do'stona javob qaytar. Javobing 2-3 jumladan oshmasin.
                        Agar uyga ketayotgan bo'lsa, xayrlash.`
                    }]
                }]
            })
        });

        const data = await response.json();
        const aiResponse = data.candidates[0].content.parts[0].text;

        // AI javobini ko'rsatish
        document.getElementById('aiResponseText').textContent = aiResponse;

        // AI javobini imo-ishoraga aylantirish
        textToSigns(aiResponse);

        // Tarixga qo'shish
        addToHistory('ai', aiResponse);

    } catch (error) {
        console.error('AI xatosi:', error);
        document.getElementById('aiResponseText').textContent = 'Kechirasiz, xatolik yuz berdi';
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
}

if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

function speakText(text) {
    if (!synth) return;

    // Wait for voices to load if needed
    if (voices.length === 0) {
        loadVoices();
    }

    const utterance = new SpeechSynthesisUtterance(text);

    // Find best voice (Prefer Uzbek, then Turkish as a close sound, then any)
    let selectedVoice = voices.find(v => v.lang.includes('uz') || v.lang.includes('UZ'));
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.includes('tr') || v.lang.includes('TR'));
    }

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    utterance.lang = 'uz-UZ';
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;

    // Important: cancel current speaking before starting new
    synth.cancel();
    synth.speak(utterance);
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
function addToHistory(type, text) {
    const historyList = document.getElementById('historyList');
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';

    const icon = type === 'imo-ishora' ? '👤' : type === 'ai' ? '🤖' : '🗣️';
    const typeText = type === 'imo-ishora' ? 'Imo-ishora → Matn' :
        type === 'ai' ? 'AI javob' : 'Matn → Imo-ishora';

    const time = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

    historyItem.innerHTML = `
        <div class="history-icon">${icon}</div>
        <div class="history-text">
            <div><strong>${typeText}:</strong> ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}</div>
            <div class="history-time">${time}</div>
        </div>
    `;

    historyList.insertBefore(historyItem, historyList.firstChild);

    // 10 tadan ko'p bo'lmasin
    if (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild);
    }
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

// Rejim almashtirish
document.querySelectorAll('[data-mode]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();

        document.querySelectorAll('[data-mode]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const mode = link.dataset.mode;
        isDeafMode = mode === 'deaf';

        document.getElementById('deafMode').style.display = isDeafMode ? 'grid' : 'none';
        document.getElementById('hearingMode').style.display = isDeafMode ? 'none' : 'grid';

        if (!isDeafMode && isCameraRunning) {
            stopDeafCamera();
        }
    });
});

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mode = btn.dataset.mode;
        isDeafMode = mode === 'deaf';

        document.getElementById('deafMode').style.display = isDeafMode ? 'grid' : 'none';
        document.getElementById('hearingMode').style.display = isDeafMode ? 'none' : 'grid';

        if (!isDeafMode && isCameraRunning) {
            stopDeafCamera();
        }
    });
});

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
    for (const connection of connections) {
        const from = landmarks[connection[0]];
        const to = landmarks[connection[1]];
        if (from && to) {
            ctx.beginPath();
            ctx.moveTo(from.x * deafCanvas.width, from.y * deafCanvas.height);
            ctx.lineTo(to.x * deafCanvas.width, to.y * deafCanvas.height);
            ctx.strokeStyle = options.color || '#00FF00';
            ctx.lineWidth = options.lineWidth || 2;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    }
}

function drawLandmarks(ctx, landmarks, options) {
    if (!landmarks) return;
    for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(landmark.x * deafCanvas.width, landmark.y * deafCanvas.height, options.radius || 2, 0, 2 * Math.PI);
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
