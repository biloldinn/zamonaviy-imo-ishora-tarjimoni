const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Imo-ishora lug'atni yuklash
let signDictionary = {};
const dictionaryPath = path.join(__dirname, 'sign_dictionary.json');

function reloadDictionary() {
    try {
        if (fs.existsSync(dictionaryPath)) {
            const dictionaryData = fs.readFileSync(dictionaryPath, 'utf-8');
            signDictionary = JSON.parse(dictionaryData);
            console.log(`✅ Lug'at muvaffaqiyatli yuklandi: ${Object.keys(signDictionary).length} ta belgi`);
        } else {
            console.warn('⚠️ sign_dictionary.json topilmadi, demo rejimida ishlanmoqda.');
            signDictionary = { "salom": { "original": "Salom", "description": "Salomlashish" } };
        }
    } catch (error) {
        console.error('❌ Lug\'atni yuklashda xato:', error);
    }
}

reloadDictionary();

// API endpointlar
const SYSTEM_PROMPT = `Siz O'zbekiston karlar jamiyati (O'zKJ) tomonidan qo'llab-quvvatlanadigan "Zamonaviy Imo-ishora Tarjimoni" uchun maxsus AI yordamchisiz.

TARIXIY VA TEXNIK KONTEKST:
1. O'zKJ 1929-yil 21-mayda tashkil etilgan.
2. "O'zbekiston karlarining imo-ishora nutqi" lug'ati Yaponiya xalqaro hamkorlik agentligi (JICA/LSA) yordami bilan yaratilgan.
3. Mualliflar: F.F. Paramonova (O'zKJ raisi), M.S. Umarov va boshqa mutaxassislar.
4. Ushbu loyiha O'zbekiston karlarining ijtimoiy-reabilitatsion ahamiyatini oshirishga qaratilgan.

SIZNING VAZIFANGIZ:
- Foydalanuvchi ko'rsatgan imo-ishoralarni o'zbek tilida samimiy va do'stona tarzda izohlang.
- Savollarga O'zbekiston karlar madaniyati va imo-ishora qoidalari asosida javob bering.
- Javoblaringiz qisqa (1-2 gap), tushunarli va professional bo'lsin.
- Stiker yoki keraksiz emojilardan foydalanmang.`;

app.post('/api/translate/sign', async (req, res) => {
    const { sign } = req.body;
    const lookupSign = sign.toLowerCase().trim();
    const signData = signDictionary[lookupSign];

    if (signData) {
        try {
            const prompt = `${SYSTEM_PROMPT}
            
            FOYDALANUVCHI HARAKATI: Foydalanuvchi "${signData.original}" imo-ishorasini ko'rsatdi.
            TAVSIF: "${signData.description}".
            
            Ushbu belgining ma'nosini samimiy tarzda tasdiqlang va foydalanuvchiga qisqa (1 gap) munosabat bildiring.`;

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
        const prompt = `${SYSTEM_PROMPT}
        
        FOYDALANUVCHI SAVOLI: "${message}"
        
        Unga o'zbek tilida qisqa, aqlli va do'stona javob bering.`;
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
