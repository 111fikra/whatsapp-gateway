const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    delay
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());
app.use(cors());

let sock;
let lastQR = "";

// التأكد من وجود مجلد الجلسة في المسار المسموح به في Railway
const sessionDir = '/tmp/auth_info';
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }), // تقليل السجلات لتوفير موارد السيرفر
        browser: ['Shi One Gateway', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log('QR Code generated, visit /qr to scan');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting: ', shouldReconnect);
            lastQR = "";
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('WA Connected Successfully');
            lastQR = "connected";
        }
    });
}

// مسار عرض الـ QR Code
app.get('/qr', async (req, res) => {
    if (lastQR === "connected") {
        return res.send('<h1>✅ Gateway Active</h1><p>WhatsApp is already connected.</p>');
    }
    if (!lastQR) {
        return res.send('<h1>⏳ Please wait...</h1><p>Generating QR code, refresh in 10 seconds.</p>');
    }
    
    try {
        const qrImage = await QRCode.toDataURL(lastQR);
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>Scan to connect Shi One & Logistics Hub</h1>
                <img src="${qrImage}" style="border:10px solid #fff; box-shadow:0 0 15px rgba(0,0,0,0.1);" />
                <p>The page will reload automatically every 15 seconds.</p>
                <script>setTimeout(() => { location.reload(); }, 15000);</script>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Error generating QR');
    }
});

// مسار إرسال OTP لموقعك
app.post('/send-otp', async (req, res) => {
    const { phone, code } = req.body;
    
    if (lastQR !== "connected") {
        return res.status(500).json({ status: 'error', message: 'Gateway not connected' });
    }

    try {
        const formattedPhone = phone.replace(/\D/g, '') + '@s.whatsapp.net';
        await sock.sendMessage(formattedPhone, { text: `كود التحقق الخاص بك هو: ${code}` });
        res.status(200).json({ status: 'success', message: 'OTP sent' });
    } catch (e) {
        console.error('Error sending message:', e);
        res.status(500).json({ status: 'error', message: 'Failed to send OTP' });
    }
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send('<h1>WhatsApp Gateway is Running</h1>');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    connectToWhatsApp();
});
