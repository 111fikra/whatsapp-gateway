const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

let sock;
let lastQR = "";
let isConnected = false;

async function startWA() {
    // استخدام مسار نظيف تماماً
    const { state, saveCreds } = await useMultiFileAuthState('/tmp/baileys_auth_final');
    
    console.log("🔄 محاولة تشغيل المحرك...");

    sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: true, // لطباعة المربعات في السجلات
        logger: pino({ level: 'silent' }), // صامت تماماً لتوفير الرام
        browser: ['Logistics Hub', 'Chrome', '1.0.0'],
        generateHighQualityQR: false // جودة عادية لتوفير الموارد
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log("========================================");
            console.log("✨ الرمز جاهز! إذا لم تظهر المربعات، انسخ هذا النص:");
            console.log(qr); 
            console.log("========================================");
        }

        if (connection === 'close') {
            isConnected = false;
            // معالجة ذكية لخطأ undefined
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) ? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            
            console.log('❌ انقطع الاتصال. جاري إعادة المحاولة...', shouldReconnect);
            if (shouldReconnect) setTimeout(startWA, 5000);
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح!');
            isConnected = true;
        }
    });
}

// السيرفر يستجيب فوراً لـ Railway ليظل حياً
app.get('/', (req, res) => res.send('API Active'));

app.get('/qr', async (req, res) => {
    if (isConnected) return res.send('Connected!');
    if (!lastQR) return res.send('Wait 15s and refresh...');
    const img = await QRCode.toDataURL(lastQR);
    res.send(`<center><img src="${img}" width="300"></center>`);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server on port ${PORT}`);
    startWA();
});
