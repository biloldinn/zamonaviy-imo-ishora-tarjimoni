const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Gemini API (Note: Use environment variables in production)
const GEMINI_API_KEY = 'AIzaSyDO4uO9XkdpNw1qwVMvcfrx6UWpOYDpGHI';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Kengaytirilgan Imo-ishora lug'ati (DOCX dan olingan namunalar)
const signDictionary = {
    "salom": {
        emoji: "👋",
        description: "O'ng kaft «a» holatida peshanaga, so'ng dahanga tekkiziladi.",
        translation: "Assalomu alaykum, salom"
    },
    "rahmat": {
        emoji: "🙏",
        description: "Kaftni ko'krakning chap tomoniga tekkizib oldinga-o'ngga yo'naltirish.",
        translation: "Tashakkur, minnatdorchilik"
    },
    "xayr": {
        emoji: "👋",
        description: "Hamma qo'llaydigan imo-ishora - qo'l siltash.",
        translation: "Xayr, xayrlashuv"
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
    "osh": {
        emoji: "🍚",
        description: "Osh yeyish harakati",
        translation: "Osh, palov"
    },
    "suv": {
        emoji: "💧",
        description: "Ichish harakati",
        translation: "Suv, drinking water"
    }
};

// API endpointlar
app.post('/api/translate/sign', async (req, res) => {
    const { sign } = req.body;
    const signData = signDictionary[sign.toLowerCase()];

    if (signData) {
        try {
            const prompt = `Foydalanuvchi imo-ishora orqali "${signData.translation}" dedi. Unga qisqa, do'stona javob qaytar (2-3 jumla).`;
            const result = await model.generateContent(prompt);
            const response = await result.response;

            res.json({
                success: true,
                translation: signData.translation,
                aiResponse: response.text(),
                emoji: signData.emoji
            });
        } catch (error) {
            console.error("Gemini Error:", error);
            res.json({
                success: true,
                translation: signData.translation,
                aiResponse: "Salom! Men sizni tushundim.",
                emoji: signData.emoji
            });
        }
    } else {
        res.status(404).json({ success: false, message: "Imo-ishora topilmadi" });
    }
});

app.post('/api/translate/text', async (req, res) => {
    const { text } = req.body;
    const words = text.toLowerCase().split(/\s+/);
    const resultSigns = [];

    words.forEach(word => {
        const cleanWord = word.replace(/[.,!?]/g, '');
        if (signDictionary[cleanWord]) {
            resultSigns.push({
                word: cleanWord,
                ...signDictionary[cleanWord]
            });
        }
    });

    res.json({ success: true, original: text, signs: resultSigns });
});

app.get('/api/dictionary', (req, res) => {
    res.json({ success: true, dictionary: signDictionary });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
