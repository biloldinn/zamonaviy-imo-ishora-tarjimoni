const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = 3000;

// Gemini API
const genAI = new GoogleGenerativeAI('AIzaSyDO4uO9XkdpNw1qwVMvcfrx6UWpOYDpGHI');
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Imo-ishora lug'ati
const signDictionary = {
    "salom": "Salom, assalomu alaykum",
    "rahmat": "Rahmat, tashakkur",
    "men": "Men, o'zim",
    "uy": "Uy, bino",
    "ketyapman": "Ketmoq, bormoq",
    "men uyga ketyapman": "Men uyga ketyapman",
    "ha": "Ha, to'g'ri",
    "yo'q": "Yo'q, noto'g'ri",
    "qanday": "Qanday, qanaqa",
    "yaxshi": "Yaxshi, durust",
    "non": "Non, kulcha",
    "suv": "Suv, choy",
    "ona": "Ona, oyi",
    "ota": "Ota, dada",
    "bola": "Bola, chaqaloq"
};

// API endpointlar
app.post('/api/translate/sign', async (req, res) => {
    const { sign } = req.body;

    if (signDictionary[sign]) {
        // Gemini AI dan javob olish
        try {
            const prompt = `Foydalanuvchi imo-ishora orqali "${signDictionary[sign]}" dedi. Unga qisqa, do'stona javob qaytar.`;
            const result = await model.generateContent(prompt);
            const response = await result.response;

            res.json({
                success: true,
                translation: signDictionary[sign],
                aiResponse: response.text(),
                sign: sign
            });
        } catch (error) {
            res.json({
                success: true,
                translation: signDictionary[sign],
                aiResponse: "Salom! Qanday yordam kerak?",
                sign: sign
            });
        }
    } else {
        res.status(404).json({
            success: false,
            message: "Imo-ishora topilmadi"
        });
    }
});

app.post('/api/translate/text', async (req, res) => {
    const { text } = req.body;

    // Matnni imo-ishoralarga aylantirish
    const words = text.toLowerCase().split(/\s+/);
    const signs = [];

    words.forEach(word => {
        const cleanWord = word.replace(/[.,!?]/g, '');
        if (signDictionary[cleanWord]) {
            signs.push({
                word: cleanWord,
                translation: signDictionary[cleanWord]
            });
        }
    });

    res.json({
        success: true,
        original: text,
        signs: signs
    });
});

app.get('/api/signs', (req, res) => {
    res.json({
        success: true,
        signs: Object.keys(signDictionary)
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server ishga tushdi: http://localhost:${PORT}`);
});
