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

// Imo-ishora lug'ati (soddalashtirilgan)
const signDictionary = {
    "salom": {
        emoji: "👋",
        description: "Qo'l ochiq, chapdan o'ngga siltash",
        translation: "Salom, assalomu alaykum"
    },
    "rahmat": {
        emoji: "🙏",
        description: "Qo'lni iyakdan pastga tushirish",
        translation: "Rahmat, tashakkur"
    },
    "men": {
        emoji: "👤",
        description: "Qo'lni ko'krakka qo'yish",
        translation: "Men, o'zim"
    },
    "uy": {
        emoji: "🏠",
        description: "Ikki qo'l bilan tom shakli yasash",
        translation: "Uy, bino"
    },
    "ketyapman": {
        emoji: "🚶",
        description: "Qo'lni oldinga siljitish",
        translation: "Ketmoq, bormoq"
    },
    "men uyga ketyapman": {
        emoji: "👤🏠🚶",
        description: "Men + uy + ketish",
        translation: "Men uyga ketyapman"
    },
    "ha": {
        emoji: "👍",
        description: "Bosh barmoq ko'rsatish",
        translation: "Ha, to'g'ri"
    },
    "yo'q": {
        emoji: "👎",
        description: "Bosh barmoq pastga",
        translation: "Yo'q, noto'g'ri"
    },
    "qanday": {
        emoji: "❓",
        description: "Qo'lni chapdan-o'ngga silkitish",
        translation: "Qanday, qanaqa"
    },
    "yaxshi": {
        emoji: "👍",
        description: "Bosh barmoq ko'rsatish",
        translation: "Yaxshi, durust"
    },
    "non": {
        emoji: "🍞",
        description: "Non yasash harakati",
        translation: "Non, kulcha"
    },
    "suv": {
        emoji: "💧",
        description: "Ichish harakati",
        translation: "Suv, choy"
    },
    "ona": {
        emoji: "👩",
        description: "Qo'lni lunjga tekkizish",
        translation: "Ona, oyi"
    },
    "ota": {
        emoji: "👨",
        description: "Qo'lni peshanaga tekkizish",
        translation: "Ota, dada"
    },
    "bola": {
        emoji: "👶",
        description: "Kichkina odam ko'rsatish",
        translation: "Bola, chaqaloq"
    }
};

// MediaPipe natijalari
hands.onResults((results) => {
    if (!isDeafMode || !isCameraRunning) return;

    deafCtx.save();
    deafCtx.clearRect(0, 0, deafCanvas.width, deafCanvas.height);
    deafCtx.drawImage(results.image, 0, 0, deafCanvas.width, deafCanvas.height);

    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(deafCtx, landmarks, HAND_CONNECTIONS, {
                color: '#00FF00',
                lineWidth: 3
            });
            drawLandmarks(deafCtx, landmarks, {
                color: '#FF0000',
                radius: 5
            });
        }

        // Imo-ishorani aniqlash
        detectSign(results.multiHandLandmarks);
    }

    deafCtx.restore();
});

// Imo-ishora aniqlash (AI)
let lastSign = '';
let signCount = 0;
let currentSentence = [];

async function detectSign(hands) {
    // Bu yerda haqiqiy AI model bo'ladi
    // Hozircha demo versiya

    const signs = Object.keys(signDictionary);
    const randomSign = signs[Math.floor(Math.random() * signs.length)];

    if (randomSign === lastSign) {
        signCount++;
    } else {
        lastSign = randomSign;
        signCount = 1;
    }

    if (signCount >= 5) {
        // Imo-ishora topildi
        const sign = signDictionary[randomSign];

        // Ekranga chiqarish
        document.getElementById('deafTranslation').textContent = sign.translation;
        document.getElementById('deafDescription').textContent = sign.description;

        // Imo-ishora belgilarini ko'rsatish
        let signsHtml = '';
        const words = randomSign.split(' ');
        words.forEach(word => {
            if (signDictionary[word]) {
                signsHtml += `
                    <div class="sign-item">
                        <span class="sign-emoji">${signDictionary[word].emoji}</span>
                        <span class="sign-word">${word}</span>
                    </div>
                `;
            }
        });

        if (signsHtml) {
            document.getElementById('deafSigns').innerHTML = signsHtml;
        }

        // Ovozli chiqish
        speakText(sign.translation);

        // AI javob olish
        getAIResponse(sign.translation);

        // Tarixga qo'shish
        addToHistory('imo-ishora', sign.translation);

        signCount = 0;
    }
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

// Matnni imo-ishoralarga aylantirish
function textToSigns(text) {
    const words = text.toLowerCase().split(/\s+/);
    let signsHtml = '';

    words.forEach(word => {
        // So'zni tozalash
        const cleanWord = word.replace(/[.,!?]/g, '');

        if (signDictionary[cleanWord]) {
            signsHtml += `
                <div class="sign-item">
                    <span class="sign-emoji">${signDictionary[cleanWord].emoji}</span>
                    <span class="sign-word">${cleanWord}</span>
                </div>
            `;
        }
    });

    if (signsHtml) {
        document.getElementById('aiResponseSigns').innerHTML = signsHtml;
    }

    // Avatarni yangilash
    updateAvatar(text);
}

// Avatarni yangilash
function updateAvatar(text) {
    const avatar = document.getElementById('aiAvatar');
    const leftHand = document.getElementById('leftHand');
    const rightHand = document.getElementById('rightHand');

    // Imo-ishoraga qarab avatar harakatlari
    if (text.includes('salom')) {
        leftHand.textContent = '👋';
        rightHand.textContent = '👋';
    } else if (text.includes('xayr')) {
        leftHand.textContent = '🖐️';
        rightHand.textContent = '🖐️';
    } else if (text.includes('ha')) {
        leftHand.textContent = '👍';
        rightHand.textContent = '👍';
    } else {
        leftHand.textContent = '🖐️';
        rightHand.textContent = '🖐️';
    }
}

// Ovozli chiqish
function speakText(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'uz-UZ';
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    }
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
                    <span class="sign-emoji">${signDictionary[cleanWord].emoji}</span>
                    <span class="sign-word">${cleanWord}</span>
                </div>
            `;
            translationText += signDictionary[cleanWord].translation + ' ';
        } else {
            // Topilmagan so'zlar
            signsHtml += `
                <div class="sign-item">
                    <span class="sign-emoji">❓</span>
                    <span class="sign-word">${cleanWord}</span>
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
    const avatar = document.getElementById('signAvatar');
    const leftHand = document.getElementById('signLeftHand');
    const rightHand = document.getElementById('signRightHand');

    if (text.includes('salom')) {
        leftHand.textContent = '👋';
        rightHand.textContent = '👋';
    } else if (text.includes('xayr')) {
        leftHand.textContent = '🖐️';
        rightHand.textContent = '🖐️';
    } else {
        leftHand.textContent = '🖐️';
        rightHand.textContent = '🖐️';
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
            ctx.moveTo(from.x * canvasCtx.canvas.width, from.y * canvasCtx.canvas.height);
            ctx.lineTo(to.x * canvasCtx.canvas.width, to.y * canvasCtx.canvas.height);
            ctx.strokeStyle = options.color || '#00FF00';
            ctx.lineWidth = options.lineWidth || 2;
            ctx.stroke();
        }
    }
}

function drawLandmarks(ctx, landmarks, options) {
    if (!landmarks) return;
    for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(landmark.x * canvasCtx.canvas.width, landmark.y * canvasCtx.canvas.height, options.radius || 2, 0, 2 * Math.PI);
        ctx.fillStyle = options.color || '#FF0000';
        ctx.fill();
    }
}

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
    [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

// Boshlang'ich xabar
speakText('Imo-ishora AI tizimi ishga tushdi');
