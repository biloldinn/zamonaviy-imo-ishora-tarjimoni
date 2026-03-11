const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Gemini API
const genAI = new GoogleGenerativeAI('AIzaSyDO4uO9XkdpNw1qwVMvcfrx6UWpOYDpGHI');
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Imo-ishora lug'atni yuklash
let signDictionary = {};
try {
    const dictionaryData = fs.readFileSync(path.join(__dirname, 'sign_dictionary.json'), 'utf-8');
    signDictionary = JSON.parse(dictionaryData);
    console.log(`✅ Lug'at yuklandi: ${Object.keys(signDictionary).length} ta belgi`);
} catch (error) {
    console.error('❌ Lug\'atni yuklashda xato:', error);
    // Zaxira lug'at
    signDictionary = {
        "salom": { "original": "Salom", "description": "Salomlashish" },
        "rahmat": { "original": "Rahmat", "description": "Tashakkur" }
    };
}

// API endpointlar
app.post('/api/translate/sign', async (req, res) => {
    const { sign } = req.body;
    const lookupSign = sign.toLowerCase().trim();
    const signData = signDictionary[lookupSign];

    if (signData) {
        try {
            // Enhanced Prompt for a more "human" feel
            const prompt = `Foydalanuvchi imo-ishora tili orqali quyidagilarni aytdi: "${signData.original}". 
            Ushbu gapning tavsifi: "${signData.description}". 
            Iltimos, ushbu ma'lumotga asoslanib, juda samimiy, do'stona va qisqa (1-2 gap) javob qaytar. 
            Javobing faqat o'zbek tilida bo'lsin.
            Agar foydalanuvchi "salom" desa, alik ol. Agar "rahmat" desa, xursand bo'l.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const textResponse = response.text();

            res.json({
                success: true,
                translation: signData.original,
                description: signData.description,
                aiResponse: textResponse,
                sign: sign
            });
        } catch (error) {
            console.error('AI Error:', error);
            res.json({
                success: true,
                translation: signData.original,
                aiResponse: "Tushunarlik! Qanday yordam bera olaman?",
                sign: sign
            });
        }
    } else {
        res.status(404).json({
            success: false,
            message: "Kuzatilgan imo-ishora lug'atda topilmadi."
        });
    }
});

app.post('/api/translate/text', async (req, res) => {
    const { text } = req.body;

    // Matnni imo-ishoralarga aylantirish
    const words = text.toLowerCase().split(/\s+/);
    const signs = [];

    words.forEach(word => {
        const cleanWord = word.replace(/[.,!?]/g, '').trim();
        const signData = signDictionary[cleanWord];
        if (signData) {
            signs.push({
                word: cleanWord,
                translation: signData.original,
                description: signData.description
            });
        }
    });

    res.json({
        success: true,
        original: text,
        signs: signs
    });
});

app.get('/api/dictionary', (req, res) => {
    res.json({
        success: true,
        dictionary: signDictionary
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
