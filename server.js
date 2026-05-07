const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 8080;

let lastQR = "";

async function startWA() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_session');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Logistics Hub', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            lastQR = qr;
            console.log("----------------------------------------");
            console.log("🔗 رابط مباشر للرمز (اضغط عليه):");
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log("----------------------------------------");
        }
        if (connection === 'close') {
            console.log("⚠️ إعادة محاولة...");
            setTimeout(startWA, 5000);
        } else if (connection === 'open') {
            console.log("✅ متصل الآن!");
        }
    });
}

app.get('/', (req, res) => res.send('Active'));
app.get('/qr', async (req, res) => {
    if (!lastQR) return res.send('Generating...');
    const img = await QRCode.toDataURL(lastQR);
    res.send(`<img src="${img}">`);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on ${PORT}`);
    startWA();
});
