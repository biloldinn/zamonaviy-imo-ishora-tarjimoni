const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Gemini API
const genAI = new GoogleGenerativeAI('AIzaSyDO4uO9XkdpNw1qwVMvcfrx6UWpOYDpGHI');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
    signDictionary = { "salom": { "original": "Salom", "description": "Salomlashish" } };
}

// API endpointlar
app.post('/api/translate/sign', async (req, res) => {
    const { sign } = req.body;
    const lookupSign = sign.toLowerCase().trim();
    const signData = signDictionary[lookupSign];

    if (signData) {
        try {
            const prompt = `Siz Imo-ishora AI yordamchisiz. Foydalanuvchi "${signData.original}" belgisini ko'rsatdi.
            Ushbu belgining tavsifi: "${signData.description}".
            Faqat ushbu ma'lumotga asoslanib, o'zbek tilida juda samimiy va qisqa (1 ta gap) javob bering.
            Stiker yoki emojilardan foydalanmang. Do'stona munosabat bildiring.`;

            const result = await model.generateContent(prompt);
            const textResponse = result.response.text();

            res.json({
                success: true,
                translation: signData.original,
                description: signData.description,
                aiResponse: textResponse,
                sign: sign
            });
        } catch (error) {
            console.error('AI Error:', error);
            res.status(500).json({ success: false, error: 'AI tahlilida xatolik' });
        }
    } else {
        res.status(404).json({ success: false, error: 'Belgi topilmadi' });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    try {
        const prompt = `Siz Imo-ishora AI yordamchisiz. Foydalanuvchi aytdi: "${message}". 
        Unga o'zbek tilida qisqa va do'stona javob bering.`;
        const result = await model.generateContent(prompt);
        res.json({ success: true, aiResponse: result.response.text() });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Chat xatosi' });
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
