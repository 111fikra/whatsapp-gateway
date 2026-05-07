const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(cors());

let sock;
let lastQR = "";
let isConnected = false;

// إعداد مسار الجلسة
const sessionDir = path.join('/tmp', 'auth_info_v2');
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    console.log("Starting WhatsApp Connection...");

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: true, // سيظهر الرمز في سجلات Railway أيضاً
        logger: pino({ level: 'info' }), // رفع مستوى السجلات مؤقتاً للتشخيص
        browser: ['Logistics Hub', 'Chrome', '1.0.0'],
        generateHighQualityQR: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log(">> New QR Code Generated! Check the /qr page.");
        }

        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ WA Connected Successfully');
            isConnected = true;
            lastQR = "connected";
        }
    });
}

app.get('/qr', async (req, res) => {
    if (isConnected) return res.send('<h1>✅ Connected</h1>');
    if (!lastQR) return res.send('<h1>⏳ Generating... Refresh in 30s</h1><script>setTimeout(()=>location.reload(), 10000)</script>');
    
    try {
        const qrImage = await QRCode.toDataURL(lastQR);
        res.send(`<div style="text-align:center;"><h1>Scan Me</h1><img src="${qrImage}" width="300"/></div><script>setTimeout(()=>location.reload(), 20000)</script>`);
    } catch (err) { res.send('Error'); }
});

app.post('/send-otp', async (req, res) => {
    const { phone, code } = req.body;
    if (!isConnected) return res.status(500).json({ error: 'Not connected' });
    try {
        const id = phone.replace(/\D/g, '') + '@s.whatsapp.net';
        await sock.sendMessage(id, { text: `كود التحقق الخاص بك هو: ${code}` });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.send('API Active'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on ${PORT}`);
    connectToWhatsApp();
});
