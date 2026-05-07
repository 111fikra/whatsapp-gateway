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

// استخدام مسار نظيف في كل مرة لضمان عدم وجود ملفات تالفة
const sessionDir = path.join('/tmp', 'auth_v4');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

async function startWA() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    // إعداد الواتساب بأقل استهلاك ذاكرة ممكن
    sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: true, // سيظهر الرمز كمربعات في سجلات Railway السوداء
        logger: pino({ level: 'silent' }), // إخفاء السجلات تماماً لتوفير الرام
        browser: ['Shi One Gateway', 'Chrome', '1.0.0'],
        version: [2, 3000, 1015901307], // استخدام نسخة ثابتة لتسريع البدء
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log(">> QR CODE READY: Visit /qr or check terminal logs.");
        }

        if (connection === 'close') {
            isConnected = false;
            // حل مشكلة undefined بإضافة check بسيط
            const error = lastDisconnect?.error;
            const statusCode = error instanceof Boom ? error.output.statusCode : error?.code;
            
            console.log(`Connection closed (Code: ${statusCode}). Reconnecting...`);
            
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(startWA, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ WA CONNECTED');
            isConnected = true;
            lastQR = "connected";
        }
    });
}

// مسار الـ QR المحسن
app.get('/qr', async (req, res) => {
    if (isConnected) return res.send('<h1>Connected!</h1>');
    if (!lastQR) return res.send('<h1>Generating QR... please wait 15s</h1><script>setTimeout(()=>location.reload(), 10000)</script>');
    
    try {
        const qrImage = await QRCode.toDataURL(lastQR);
        res.send(`<div style="text-align:center;"><img src="${qrImage}" width="300"/><p>Refresh if it fails.</p></div>`);
    } catch (e) { res.status(500).send('Error'); }
});

app.get('/', (req, res) => res.send('API Running'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on ${PORT}`);
    startWA();
});
