// API sozlamalari (Dual support: Local and Production)
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin;
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
let recognition = null; // Centralized STT instance

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

    // Drawing the background video (already mirrored by CSS if mirrorMode is on)
    activeCtx.globalAlpha = 1.0;
    activeCtx.drawImage(results.image, 0, 0, activeCanvas.width, activeCanvas.height);

    if (results.multiHandLandmarks) {
        // Update 3D hand model (separate panel) - Now supports both hands
        update3DHand(results);

        // 2D Skeleton is COMPLETELY REMOVED from camera to avoid visual clutter
        // Always detect sign (still based on primary hand for now)
        detectSign(results.multiHandLandmarks);
    }

    activeCtx.restore();
});

// --- Three.js 3D Hand Setup ---
let scene, camera, renderer, handMesh;
let joints = [];

function init3DHand() {
    const container = document.getElementById('hand3DContainer');
    if (!container) return;

    // --- Three.js 3D Hand Setup ---
    let scene, camera, renderer;
    let leftHandObj = { group: null, joints: [] };
    let rightHandObj = { group: null, joints: [] };

    function createHandModel(color) {
        const group = new THREE.Group();
        const material = new THREE.MeshPhongMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            emissive: color,
            emissiveIntensity: 0.2
        });
        const joints = [];
        for (let i = 0; i < 21; i++) {
            const geo = new THREE.SphereGeometry(0.12, 16, 16);
            const mesh = new THREE.Mesh(geo, material);
            joints.push(mesh);
            group.add(mesh);
        }
        const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
            [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16],
            [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17], [0, 17], [0, 5]
        ];
        connections.forEach(conn => {
            const geometry = new THREE.CylinderGeometry(0.05, 0.05, 1);
            const cylinder = new THREE.Mesh(geometry, boneMaterial);
            cylinder.userData = { from: conn[0], to: conn[1] };
            group.add(cylinder);
        });
        return { group, joints };
    }

    function init3DHand() {
        const container = document.getElementById('hand3DContainer');
        if (!container) return;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 5, 5);
        scene.add(light);

        leftHandObj = createHandModel(0xff0088); // Pink-ish for left
        rightHandObj = createHandModel(0x00d2ff); // Blue for right
        scene.add(leftHandObj.group);
        scene.add(rightHandObj.group);
        camera.position.z = 10;
        function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }
        animate();
    }

    function update3DHand(results) {
        if (!scene || !results.multiHandLandmarks) return;

        // Reset hands visibility
        leftHandObj.group.visible = false;
        rightHandObj.group.visible = false;

        results.multiHandLandmarks.forEach((landmarks, index) => {
            const label = results.multiHandedness[index].label;
            const hand = label === 'Left' ? leftHandObj : rightHandObj;
            hand.group.visible = true;

            landmarks.forEach((lm, i) => {
                const mirroredX = 1 - lm.x;
                hand.joints[i].position.x = (mirroredX - 0.5) * 12;
                hand.joints[i].position.y = -(lm.y - 0.5) * 12;
                hand.joints[i].position.z = -lm.z * 12;
            });

            const cylinders = hand.group.children.filter(c => c.userData.from !== undefined);
            cylinders.forEach(cyl => {
                const p1 = hand.joints[cyl.userData.from].position;
                const p2 = hand.joints[cyl.userData.to].position;
                cyl.position.copy(p1).lerp(p2, 0.5);
                cyl.scale.set(1, p1.distanceTo(p2), 1);
                cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
            });
        });
    }

    // POSES LIBRARY FOR VOICE-TO-SIGN
    const HAND_POSES = {
        'idle': Array(21).fill({ x: 0, y: 0, z: 0 }),
        'salom': [ // Waving pose (coordinates relative to wrist)
            { x: 0, y: 0, z: 0 }, // 0
            { x: 0.5, y: 0.2, z: 0 }, { x: 0.8, y: 0.5, z: 0 }, { x: 1.0, y: 0.8, z: 0 }, { x: 1.2, y: 1.1, z: 0 }, // Thumb
            { x: 0.2, y: 1, z: 0 }, { x: 0.2, y: 1.5, z: 0 }, { x: 0.2, y: 1.9, z: 0 }, { x: 0.2, y: 2.2, z: 0 }, // Index
            { x: 0, y: 1.1, z: 0 }, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 2.1, z: 0 }, { x: 0, y: 2.5, z: 0 }, // Middle
            { x: -0.2, y: 1, z: 0 }, { x: -0.2, y: 1.5, z: 0 }, { x: -0.2, y: 1.9, z: 0 }, { x: -0.2, y: 2.2, z: 0 }, // Ring
            { x: -0.5, y: 0.8, z: 0 }, { x: -0.5, y: 1.2, z: 0 }, { x: -0.5, y: 1.5, z: 0 }, { x: -0.5, y: 1.8, z: 0 } // Pinky
        ],
        'rahmat': [ // Closed fist pose (clamped)
            { x: 0, y: 0, z: 0 },
            { x: 0.2, y: 0.1, z: 0 }, { x: 0.3, y: 0.2, z: 0 }, { x: 0.4, y: 0.3, z: 0 }, { x: 0.5, y: 0.4, z: 0 },
            { x: 0.1, y: 0.2, z: 0 }, { x: 0.1, y: 0.3, z: 0 }, { x: 0.1, y: 0.4, z: 0 }, { x: 0.1, y: 0.5, z: 0 },
            { x: 0, y: 0.2, z: 0 }, { x: 0, y: 0.3, z: 0 }, { x: 0, y: 0.4, z: 0 }, { x: 0, y: 0.5, z: 0 },
            { x: -0.1, y: 0.2, z: 0 }, { x: -0.1, y: 0.3, z: 0 }, { x: -0.1, y: 0.4, z: 0 }, { x: -0.1, y: 0.5, z: 0 },
            { x: -0.2, y: 0.1, z: 0 }, { x: -0.2, y: 0.2, z: 0 }, { x: -0.2, y: 0.3, z: 0 }, { x: -0.2, y: 0.4, z: 0 }
        ],
        'ha': [ // Index finger nodding pose
            { x: 0, y: 0, z: 0 },
            { x: 0.4, y: 0.1, z: 0 }, { x: 0.6, y: 0.2, z: 0 }, { x: 0.7, y: 0.3, z: 0 }, { x: 0.8, y: 0.4, z: 0 },
            { x: 0.2, y: 1.5, z: 0.5 }, { x: 0.2, y: 2, z: 1 }, { x: 0.2, y: 2.5, z: 1.5 }, { x: 0.2, y: 3, z: 2 },
            { x: 0, y: 0.5, z: 0 }, { x: 0, y: 0.8, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 1.2, z: 0 },
            { x: -0.2, y: 0.5, z: 0 }, { x: -0.2, y: 0.8, z: 0 }, { x: -0.2, y: 1, z: 0 }, { x: -0.2, y: 1.2, z: 0 },
            { x: -0.4, y: 0.4, z: 0 }, { x: -0.4, y: 0.7, z: 0 }, { x: -0.4, y: 0.9, z: 0 }, { x: -0.4, y: 1.1, z: 0 }
        ],
        'men': [ // Index finger pointing to self
            { x: 0, y: 0, z: 0 },
            { x: 0.3, y: 0.2, z: 0 }, { x: 0.5, y: 0.4, z: 0 }, { x: 0.6, y: 0.6, z: 0 }, { x: 0.7, y: 0.8, z: 0 },
            { x: 0, y: 1, z: 1.5 }, { x: 0, y: 1.5, z: 2 }, { x: 0, y: 2, z: 2.5 }, { x: 0, y: 2.5, z: 3 },
            { x: 0, y: 0.4, z: 0 }, { x: 0, y: 0.6, z: 0 }, { x: 0, y: 0.8, z: 0 }, { x: 0, y: 1, z: 0 },
            { x: -0.2, y: 0.3, z: 0 }, { x: -0.2, y: 0.5, z: 0 }, { x: -0.2, y: 0.7, z: 0 }, { x: -0.2, y: 0.9, z: 0 },
            { x: -0.4, y: 0.2, z: 0 }, { x: -0.4, y: 0.4, z: 0 }, { x: -0.4, y: 0.6, z: 0 }, { x: -0.4, y: 0.8, z: 0 }
        ]
    };

    document.addEventListener('DOMContentLoaded', init3DHand);

    // Update performDetection to include 3D updates
    const originalDrawHandImage = drawHandImage;
    function drawHandImage(ctx, landmarks) {
        update3DHand(landmarks);
        // Keep 2D skeleton for debug/overlay if needed, but 3D is primary
    }

    let lastSign = '';
    let signCount = 0;
    let detectionBuffer = [];
    const BUFFER_SIZE = 15;

    // Barmoq holatlarini aniqlash (Heuristic improvement)
    function getFingerStates(landmarks) {
        const getDist = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

        // Check if finger is extended by comparing tip distance to MCP joint
        const isExtended = (tip, mcp, wrist) => getDist(tip, wrist) > getDist(mcp, wrist);

        const states = {
            thumb: getDist(landmarks[4], landmarks[17]) > getDist(landmarks[3], landmarks[17]) && landmarks[4].x < landmarks[3].x, // Thumb is tricky
            index: landmarks[8].y < landmarks[6].y,
            middle: landmarks[12].y < landmarks[10].y,
            ring: landmarks[16].y < landmarks[14].y,
            pinky: landmarks[20].y < landmarks[18].y
        };
        return states;
    }

    const PROGRESS_LIMIT = 15;

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
        const fingerStates = getFingerStates(landmarks);
        const extendedFingers = Object.values(fingerStates).filter(state => state).length;

        // Real-time Heuristic Logic
        let matchedSign = '';

        if (extendedFingers === 5) matchedSign = "salom";
        else if (extendedFingers === 0) matchedSign = "rahmat";
        else if (fingerStates.index && extendedFingers === 1) matchedSign = "men";
        else if (fingerStates.index && fingerStates.middle && extendedFingers === 2) matchedSign = "ikki";
        else if (fingerStates.thumb && fingerStates.pinky && extendedFingers === 2) matchedSign = "telefon";

        if (matchedSign) {
            if (progressEl) progressEl.style.display = 'block';

            if (matchedSign === lastSign) {
                signCount++;
            } else {
                lastSign = matchedSign;
                signCount = 1;
            }

            // Update Circular Progress
            const percent = Math.min((signCount / PROGRESS_LIMIT) * 100, 100);
            const offset = 251.2 - (251.2 * percent) / 100;
            if (progressBar) progressBar.style.strokeDashoffset = offset;
            if (progressText) progressText.textContent = Math.round(percent) + '%';

            if (signCount >= PROGRESS_LIMIT) {
                console.log("Triggering detection for:", matchedSign);
                const signData = signDictionary[matchedSign];
                if (signData) {
                    playSuccessSound();
                    displayDetectedSign(matchedSign, signData);
                    showToast(`Aniqlangan belgi: ${signData.original}`, 'success');

                    // Visual feedback on 3D hand
                    highlight3DHand('#00ff00');

                    signCount = 0;
                    lastSign = '';
                    if (progressEl) progressEl.style.display = 'none';
                }
            }
        } else {
            signCount = 0;
            if (progressEl) progressEl.style.display = 'none';
        }
    }

    function highlight3DHand(color) {
        joints.forEach(j => j.material.color.set(color));
        setTimeout(() => joints.forEach(j => j.material.color.set('#00d2ff')), 1000);
    }

    function displayDetectedSign(signKey, signData) {
        const translationEl = document.getElementById('deafTranslation');
        const descriptionEl = document.getElementById('deafDescription');

        // Only show the clean word, not the whole dictionary entry
        const cleanTitle = signData.original.split(/[(\[,]/)[0].trim();
        translationEl.textContent = cleanTitle;

        // Shorten description if it's too long
        const cleanDesc = signData.description.split('.')[0] + '.';
        descriptionEl.textContent = cleanDesc;

        speakText(cleanTitle);
        getAIResponse(cleanTitle);
        addToHistory('imo-ishora', cleanTitle);
    }

    async function getAIResponse(signName) {
        const thinkingEl = document.getElementById('aiThinking');
        const aiTextEl = document.getElementById('aiResponseText');

        try {
            if (thinkingEl) thinkingEl.style.display = 'flex';
            aiTextEl.textContent = 'AI tahlil qilmoqda...';
            aiTextEl.style.opacity = '0.5';

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

            const response = await fetch(`${API_URL}/api/translate/sign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sign: signName }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();
            if (data.success) {
                aiTextEl.textContent = data.aiResponse;
                speakText(data.aiResponse);
                update3DFromText(data.aiResponse);
                textToSigns(data.aiResponse);
                addToHistory('ai', data.aiResponse);
            } else {
                aiTextEl.textContent = "AI javob bera olmadi.";
            }
        } catch (error) {
            console.error('AI xatosi:', error);
            aiTextEl.textContent = error.name === 'AbortError' ? 'AI javobi kechikmoqda...' : 'Bog\'lanishda xatolik.';
        } finally {
            if (thinkingEl) thinkingEl.style.display = 'none';
            aiTextEl.style.opacity = '1';
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
        if (voices.length > 0) {
            console.log("✅ Ovozlar yuklandi:", voices.filter(v => v.lang.includes('uz') || v.lang.includes('tr') || v.lang.includes('ru')).length, "ta mos ovoz");
        }
    }

    // Robust voice loading loop
    const voiceInterval = setInterval(() => {
        loadVoices();
        if (voices.length > 0) {
            clearInterval(voiceInterval);
            // Initial greeting once voices are ready
            speakText('Imo-ishora AI tizimi tayyor');
        }
    }, 1000);

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

    // O'zbekcha ovozli o'qish (Optimized TTS)
    function speakText(text) {
        if (!window.speechSynthesis) return;

        // Stop any current speaking to avoid overlap
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();

        // 1. Try to find actual Uzbek voice (Google O'zbekcha)
        // 2. Fallback to Turkish (sounds very similar and usually available)
        // 3. Fallback to Russian/English if necessary
        let voice = voices.find(v => v.lang.startsWith('uz') || v.name.toLowerCase().includes('uzbek'));
        if (!voice) voice = voices.find(v => v.lang.startsWith('tr') || v.name.toLowerCase().includes('turkish'));
        if (!voice) voice = voices.find(v => v.lang.startsWith('ru'));

        if (voice) utterance.voice = voice;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        window.speechSynthesis.speak(utterance);
        console.log("Speaking (Ovozli chiqish):", text);
    }

    // Ovozdan Imo-ishoraga aylantirish (Voice to 3D Sign)
    function update3DFromText(text) {
        const words = text.toLowerCase().split(' ');
        words.forEach((word, index) => {
            setTimeout(() => {
                if (word.includes('salom')) animate3DPose('salom');
                else if (word.includes('rahmat')) animate3DPose('rahmat');
                else if (word.includes('ha')) animate3DPose('ha');
                else if (word.includes('men')) animate3DPose('men');
            }, index * 1500);
        });
    }

    function animate3DPose(poseName) {
        const pose = HAND_POSES[poseName];
        if (!pose) return;

        const startTime = Date.now();
        const duration = 1000;

        function lerpPose() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Use a sin ease for smoothness
            const ease = Math.sin(progress * Math.PI / 2);

            joints.forEach((joint, i) => {
                if (pose[i]) {
                    joint.position.x = THREE.MathUtils.lerp(joint.position.x, pose[i].x * 3, ease);
                    joint.position.y = THREE.MathUtils.lerp(joint.position.y, pose[i].y * 3, ease);
                    joint.position.z = THREE.MathUtils.lerp(joint.position.z, pose[i].z * 3, ease);
                }
            });

            if (progress < 1) requestAnimationFrame(lerpPose);
        }
        lerpPose();
    }

    // Ovozli rejimni yoqish (Speech to Text)
    let recognition = null;
    function startSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window)) {
            showToast("Browseringiz ovoz tanishni qo'llab-quvvatlamaydi.", "error");
            return;
        }
        if (recognition) {
            stopVoiceRecognition();
            return;
        }
        recognition = new webkitSpeechRecognition();
        recognition.lang = 'uz-UZ';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onstart = () => {
            isListening = true;
            updateVoiceUI(true);
            showToast("Ovozli rejim faol: Gapiring...", "info");
        };
        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            }
            if (finalTranscript) {
                const chatInput = document.getElementById('chatInput');
                if (chatInput) chatInput.value = finalTranscript;
                getAIChatResponse(finalTranscript.trim());
                update3DFromText(finalTranscript.trim());
            }
        };
        recognition.onerror = (event) => {
            console.error("STT Error:", event.error);
            stopVoiceRecognition();
        };
        recognition.onend = () => {
            if (isListening && recognition) try { recognition.start(); } catch (e) { }
        };
        recognition.start();
    }

    function stopVoiceRecognition() {
        if (recognition) {
            recognition.onend = null;
            recognition.stop();
            recognition = null;
        }
        isListening = false;
        updateVoiceUI(false);
    }

    function updateVoiceUI(active) {
        const btn = document.getElementById('voiceControlBtn');
        if (!btn) return;
        if (active) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="fas fa-microphone"></i> To\'xtatish';
            btn.style.background = 'var(--accent)';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="fas fa-microphone-alt"></i> Ovozli Rejim';
            btn.style.background = '';
        }
    }

    // AI Chat Javobi (Voice/Text Chat Mode)
    async function getAIChatResponse(message) {
        const aiTextEl = document.getElementById('aiResponseText');
        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });
            const data = await response.json();
            if (data.success) {
                aiTextEl.textContent = data.aiResponse;
                speakText(data.aiResponse);
                addToHistory('user', message);
                addToHistory('ai', data.aiResponse);
            }
        } catch (error) {
            console.error("Chat error:", error);
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

    // Toast Notifications System
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

    // Success Sound Effect (Synth)
    function playSuccessSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1);
        } catch (e) {
            console.warn("Sound blocked by browser policy");
        }
    }
