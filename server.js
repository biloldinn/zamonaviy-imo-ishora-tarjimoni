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
// "01_ Imo ishoralar.docx" kitobidan to'liq ma'lumotlar
const DOCX_KNOWLEDGE = `
"O'ZBEKISTON KARLARINING IMO-ISHORA NUTQI" LУГАТИ HAQIDA:

MUQADDIMA (F.F. Paramonova, O'zKJ raisi):
Ushbu lug'at o'zbek va rus tillarida ta'lim olib, muloqotda bo'layotgan kar va zaif eshituvchi fuqarolarining ehtiyojidan kelib chiqib, mamlakatimizda ilk bor nashr etilmoqda. Kitobga kiritilgan imo-ishoralar faqat muloqot vositasigina bo'lib qolmay, balki pedagogik, ijtimoiy-reabilitatsion ahamiyatga egadir: eshitishida nuqsoni bo'lgan odamlarni eshitadigan odamlar jamiyatiga kirib borishiga va o'z imkoniyatlarini to'laroq amalga oshirishga qaratilgan. Lug'at tuzilishi jihatidan 22 mavzudan, imo-ishoralarning nomlaridan, ularga muvofiq so'zli va foto tasvirlaridan iboratdir.

TARIX:
O'zbekiston karlarining imo-ishora nutqini rasmiylashtirish tarixi 1929-yil 21-maydagi O'zbekiston karlar jamiyatining (O'zKJ) rasmiy tashkil etilishi bilan bog'liqdir. O'zbekistondagi nogiron kar fuqarolar mustaqillikkacha Rossiya imo-ishora nutqidan va daktil alifbosidan foydalanishgan.

IMO-ISHORA TUZILISHI:
Har bir imo-ishora quyidagi 4 komponentdan iborat:
1. Konfiguratsiya - har bir qo'lning barmoqlarini, kaftlarning holatini belgilaydi.
2. Imo-ishoraning bajarish joyi - masalan "burun yonida", "chakka yonida".
3. Harakatning yo'nalishi - masalan "oldinga-o'ngga", "o'zimizdanoldinga".
4. Harakatning xususiyati - masalan "keskin", "silliq".

MUALLIFLAR VA TASHKILOTLAR:
- O'zKJ raisi: F.F. Paramonova
- Yetakchi mutaxassis: M.S. Umarov  
- Surdopedagoglar: F.J. Alimxo'jayeva va Z.A. Sharipova
- Moliyalashtiruv: LSA va Yaponiya xalqaro hamkorlik agentligi (JICA) vakolatxonasi rahbari Kae Yanagisava
- O'zKJ 1-sonli ishlab chiqarish korxonasi direktor o'rinbosari: M.M. Inog'omov
- O'zKJ Respublika madaniyat saroyi bo'lim boshlig'i: I.I. Osipova

ALIFBO VA DAKTILOLOGIYA:
Daktilologiya — bu barmoqlar yordamida harflarni ko'rsatish tizimi. O'zbekiston karlar uchun maxsus o'zbek-rus birlashtirilgan daktil alifbosi ishlatiladi.

PEDAGOGIK AHAMIYATI:
Ushbu lug'at eshitishida nuqsoni bo'lgan odamlarning o'zaro muloqotini osonlashtirib, ularning ijtimoiy mavqeini ko'tarib, kasbiy o'sishiga yordam beradi. Eshitadigan odamlarga esa kar odamlar dunyosini tushunishda yordamchi bo'ladi.
`;

const SYSTEM_PROMPT = `SIZ O'ZBEKISTON KARLAR JAMIYATI (O'zKJ) RASMIY "IMO-ISHORA NUTQI" KITOBIGA ASOSLANGAN AI YORDAMCHISIZ.

SIZNING BILIM BAZANGIZ:
${DOCX_KNOWLEDGE}

JAVOB BERISH QOIDALARI:
- FAQAT O'ZBEK TILIDA javob bering.
- Har bir javobda lug'at, O'zKJ tarixi yoki imo-ishora texnikasi haqida ANIQ ma'lumot keltiring.
- Imo-ishora ko'rsatilganda: uning O'zbek nomini, harakatini va ma'nosini tushuntiring.
- Javoblar QISQA (1-3 gap), ANIQ va DO'STONA bo'lsin.
- Agar foydalanuvchi so'rasa, 1929 yil, JICA yordami, Paramonova, Umarov kabi tarixiy faktlarni esla.`;

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
