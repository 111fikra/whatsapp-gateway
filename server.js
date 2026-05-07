const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 8080;
let lastQR = "";

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_logistics');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        // حذفنا الخيار القديم لتجنب التنبيه
        browser: ['Logistics Hub', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) {
            lastQR = qr;
            // طباعة الرابط المباشر بوضوح شديد في السجلات
            console.log("\n\n--- COPY THIS LINK TO SCAN ---");
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log("-------------------------------\n\n");
        }
        if (connection === 'open') {
            console.log("✅ CONNECTED SUCCESSFULLY");
            lastQR = "connected";
        }
        if (connection === 'close') setTimeout(startWhatsApp, 5000);
    });
}

app.get('/qr', async (req, res) => {
    if (lastQR === "connected") return res.send('<h1>Connected!</h1>');
    if (!lastQR) return res.send('<h1>Generating... Refresh in 10s</h1>');
    const img = await QRCode.toDataURL(lastQR);
    res.send(`<center><h2>Scan for Logistics Hub</h2><img src="${img}" width="300"></center>`);
});

app.get('/', (req, res) => res.send('Logistics Hub is Online'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started`);
    startWhatsApp();
});
