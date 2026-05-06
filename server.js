const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
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

// إعداد مسار الجلسة في المجلد المؤقت لـ Railway لضمان صلاحيات الكتابة
const sessionDir = path.join('/tmp', 'whatsapp_auth');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }), // تقليل السجلات لتوفير موارد السيرفر ومنع الانهيار
        browser: ['Logistics Hub Gateway', 'Chrome', '1.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
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

// واجهة عرض الـ QR Code محسنة
app.get('/qr', async (req, res) => {
    if (isConnected) {
        return res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1 style="color: #25D366;">✅ بوابة الواتساب متصلة الآن</h1>
                <p>بوابة Shi One و Logistics Hub جاهزة للعمل.</p>
            </div>
        `);
    }
    
    if (!lastQR) {
        return res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>⏳ جاري توليد الرمز...</h1>
                <p>يرجى تحديث الصفحة بعد 10 ثوانٍ.</p>
                <script>setTimeout(() => { location.reload(); }, 10000);</script>
            </div>
        `);
    }
    
    try {
        const qrImage = await QRCode.toDataURL(lastQR);
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1 style="color: #075E54;">اربط الواتساب لبوابة Logistics Hub</h1>
                <img src="${qrImage}" style="border:10px solid #fff; box-shadow:0 0 15px rgba(0,0,0,0.1); width: 300px;" />
                <p style="color: #666;">قم بمسح الرمز من داخل تطبيق الواتساب (الأجهزة المرتبطة).</p>
                <script>setTimeout(() => { location.reload(); }, 20000);</script>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Error generating QR');
    }
});

// استقبال طلبات الإرسال من ووردبريس (Digits)
app.post('/send-otp', async (req, res) => {
    const { phone, code } = req.body;
    
    if (!isConnected) {
        return res.status(500).json({ status: 'error', message: 'البوابة غير متصلة بالواتساب' });
    }

    try {
        const formattedPhone = phone.replace(/\D/g, '') + '@s.whatsapp.net';
        await sock.sendMessage(formattedPhone, { text: `كود التحقق الخاص بك هو: ${code}` });
        res.status(200).json({ status: 'success', message: 'تم إرسال الكود بنجاح' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: 'فشل إرسال الرسالة' });
    }
});

app.get('/', (req, res) => {
    res.send('WhatsApp OTP Gateway is running.');
});

// تشغيل السيرفر على المنفذ الذي يحدده Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is live on port ${PORT}`);
    connectToWhatsApp();
});
