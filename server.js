const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

let sock;
let lastQR = "";
let isConnected = false;

// مسار التخزين (تأكد أنه نظيف)
const sessionDir = path.join('/tmp', 'auth_final_v5');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    console.log("--- محاولة بدء محرك واتساب لـ Logistics Hub ---");

    sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: true, // المربعات السوداء
        logger: pino({ level: 'silent' }), 
        browser: ['Shi One Web', 'Chrome', '1.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log("========================================");
            console.log("✨ الرمز جاهز الآن!");
            console.log("انسخ هذا النص إذا لم تظهر المربعات:");
            console.log(qr); // طباعة النص الخام للرمز كخطة بديلة
            console.log("========================================");
        }

        if (connection === 'close') {
            isConnected = false;
            // حل مشكلة undefined بشكل نهائي
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log('انقطع الاتصال، السبب:', reason || 'غير معروف');
            
            if (reason !== DisconnectReason.loggedOut) {
                console.log('إعادة محاولة الاتصال بعد 5 ثوانٍ...');
                setTimeout(startWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح وبوابة Logistics Hub تعمل الآن!');
            isConnected = true;
            lastQR = "connected";
        }
    });
}

// مسار الـ QR
app.get('/qr', async (req, res) => {
    if (isConnected) return res.send('<h1>✅ المتجر متصل بالواتساب</h1>');
    if (!lastQR) return res.send('<h1>⏳ جاري تجهيز الرمز.. انتظر 10 ثوانٍ وحدث الصفحة</h1>');
    
    try {
        const qrImage = await QRCode.toDataURL(lastQR);
        res.send(`<div style="text-align:center;"><img src="${qrImage}" width="300"/><p>امسح الرمز من هاتفك</p></div>`);
    } catch (e) { res.send('Error generating image'); }
});

app.get('/', (req, res) => res.send('WhatsApp Gateway is UP'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على المنفذ: ${PORT}`);
    startWhatsApp();
});
