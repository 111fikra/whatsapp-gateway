const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 8080;

let lastQR = "";

async function startWhatsApp() {
    // تخزين محلي لضمان الاستقرار
    const { state, saveCreds } = await useMultiFileAuthState('./auth_logistics');
    
    console.log("🔄 جاري تشغيل بوابة Logistics Hub...");

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // توفير أقصى قدر من الذاكرة
        printQRInTerminal: true,
        browser: ['Logistics Hub', 'Chrome', '1.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log("----------------------------------------");
            console.log("✅ الرمز جاهز! اضغط على الرابط التالي لمسحه:");
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log("----------------------------------------");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(startWhatsApp, 5000);
        } else if (connection === 'open') {
            console.log("✅ تم الاتصال بنجاح! البوابة تعمل الآن.");
            lastQR = "connected";
        }
    });
}

// مسارات السيرفر
app.get('/', (req, res) => res.send('Logistics Hub Gateway is Online'));
app.get('/qr', async (req, res) => {
    if (lastQR === "connected") return res.send('<h1>Connected!</h1>');
    if (!lastQR) return res.send('Generating... please wait');
    const img = await QRCode.toDataURL(lastQR);
    res.send(`<center><h2 style="font-family:sans-serif;">Logistics Hub QR Scan</h2><img src="${img}" width="300"></center>`);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    startWhatsApp();
});
