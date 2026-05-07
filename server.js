const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 8080;

let lastQR = "";
let isConnected = false;

async function startWhatsApp() {
    // التخزين في مجلد محلي داخل المشروع بدلاً من /tmp
    const { state, saveCreds } = await useMultiFileAuthState('./auth_session_local');
    
    console.log("--- محاولة تشغيل المحرك (نسخة الاستقرار) ---");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, 
        logger: pino({ level: 'silent' }),
        browser: ['Shi One Gateway', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log("========================================");
            console.log("✨ الرمز جاهز! انسخ النص التالي فوراً:");
            console.log(qr); // هذا هو النص الذي سنحوله لصور
            console.log("========================================");
        }

        if (connection === 'close') {
            isConnected = false;
            console.log('⚠️ الاتصال تعثر.. إعادة محاولة بعد 5 ثوانٍ');
            setTimeout(startWhatsApp, 5000);
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح!');
            isConnected = true;
        }
    });
}

app.get('/qr', async (req, res) => {
    if (!lastQR) return res.send('جاري التجهيز.. انتظر دقيقة');
    const img = await QRCode.toDataURL(lastQR);
    res.send(`<center><img src="${img}" width="300"></center>`);
});

app.get('/', (req, res) => res.send('B gateway is Online'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on ${PORT}`);
    startWhatsApp();
});
