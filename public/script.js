// MediaPipe Hands Configuration
const videoElement = document.getElementById('videoInput');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');

let isCameraActive = false;
let currentMode = 'deaf';

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(onResults);

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00d2ff', lineWidth: 5 });
            drawLandmarks(canvasCtx, landmarks, { color: '#ffffff', lineWidth: 2, radius: 4 });
        }
        // Mock recognition logic - in real app, we use landmark coordinates for classification
        simulateRecognition();
    }
    canvasCtx.restore();
}

// Recognition Logic Simulator (Simplified for Prototype)
let lastRecognized = "";
let stableCount = 0;

function simulateRecognition() {
    // In a real implementation, we compare landmakrs against our dictionary patterns
    // For now, we simulate detecting a sign every few seconds if hands are present
    stableCount++;
    if (stableCount > 60) { // Approx 2 seconds at 30fps
        const signs = ["salom", "rahmat", "ona", "ota", "osh", "suv"];
        const randomSign = signs[Math.floor(Math.random() * signs.length)];
        if (randomSign !== lastRecognized) {
            translateSign(randomSign);
            lastRecognized = randomSign;
        }
        stableCount = 0;
    }
}

async function translateSign(sign) {
    try {
        const response = await fetch('/api/translate/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sign })
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('signResult').textContent = data.emoji + " " + data.translation;
            document.getElementById('aiResponse').textContent = data.aiResponse;
            addToHistory("Imo-ishora: " + data.translation);
            speak(data.translation);
        }
    } catch (err) {
        console.error("Translation error:", err);
    }
}

// Speech Recognition (Hearing Mode)
let recognition;
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.lang = 'uz-UZ';
    recognition.continuous = true;
    recognition.onresult = (event) => {
        const text = event.results[event.results.length - 1][0].transcript;
        document.getElementById('speechText').textContent = text;
        processTextToSign(text);
    };
}

async function processTextToSign(text) {
    try {
        const response = await fetch('/api/translate/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await response.json();

        if (data.success && data.signs.length > 0) {
            let outputHtml = "";
            let emojiStr = "";
            data.signs.forEach(s => {
                outputHtml += `<span title="${s.description}">${s.emoji}</span> `;
                emojiStr += s.emoji;
            });
            document.getElementById('signOutput').innerHTML = outputHtml;
            document.getElementById('avatarDisplay').textContent = data.signs[0].emoji;
        } else {
            document.getElementById('signOutput').textContent = "Imo-ishora topilmadi";
            document.getElementById('avatarDisplay').textContent = "❓";
        }
    } catch (err) {
        console.error("Text to Sign error:", err);
    }
}

// Helpers
function speak(text) {
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'uz-UZ';
    window.speechSynthesis.speak(msg);
}

function addToHistory(text) {
    const list = document.getElementById('historyList');
    const item = document.createElement('div');
    item.textContent = `${new Date().toLocaleTimeString()} - ${text}`;
    list.prepend(item);
    if (list.children.length > 5) list.lastChild.remove();
}

// UI Controls
document.getElementById('deafModeBtn').onclick = () => switchMode('deaf');
document.getElementById('hearingModeBtn').onclick = () => switchMode('hearing');

function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(mode + 'ModeBtn').classList.add('active');
    document.getElementById('deafPanel').style.display = mode === 'deaf' ? 'grid' : 'none';
    document.getElementById('hearingPanel').style.display = mode === 'hearing' ? 'grid' : 'none';
    if (mode === 'hearing') stopCamera();
}

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = stream;
    isCameraActive = true;
    requestAnimationFrame(processVideo);
}

function stopCamera() {
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(t => t.stop());
    }
    isCameraActive = false;
}

async function processVideo() {
    if (!isCameraActive) return;
    await hands.send({ image: videoElement });
    requestAnimationFrame(processVideo);
}

document.getElementById('startCam').onclick = startCamera;
document.getElementById('stopCam').onclick = stopCamera;

document.getElementById('startMic').onclick = () => {
    recognition?.start();
    document.getElementById('voiceWave').style.display = 'flex';
};
document.getElementById('stopMic').onclick = () => {
    recognition?.stop();
    document.getElementById('voiceWave').style.display = 'none';
};

// Auto set canvases size
videoElement.onloadedmetadata = () => {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
};

setInterval(() => {
    document.getElementById('currentTime').textContent = new Date().toLocaleTimeString();
}, 1000);
