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

// استخدام مسار جديد لتجنب أي ملفات تالفة
const sessionDir = path.join('/tmp', 'auth_session_v3');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

async function connectToWA() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    console.log("محاولة بدء الاتصال بواتساب...");

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // سيظهر الرمز في السجلات كـ مربعات سوداء
        logger: pino({ level: 'silent' }), // إغلاق السجلات تماماً لتوفير الرام
        browser: ['Logistics Hub', 'Chrome', '1.0.0'],
        syncFullHistory: false, // تعطيل مزامنة السجلات القديمة لتوفير الذاكرة
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            lastQR = qr;
            console.log(">> تم توليد رمز QR جديد بنجاح.");
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
            console.log('انقطع الاتصال. الكود:', statusCode);
            isConnected = false;
            
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(connectToWA, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح!');
            isConnected = true;
            lastQR = "connected";
        }
    });
}

// صفحة الـ QR
app.get('/qr', async (req, res) => {
    if (isConnected) return res.send('<h1>✅ متصل بالفعل</h1>');
    if (!lastQR) return res.send('<h1>⏳ جاري توليد الرمز... انتظر 30 ثانية ثم حدث الصفحة</h1><script>setTimeout(()=>location.reload(), 15000)</script>');
    
    try {
        const qrImage = await QRCode.toDataURL(lastQR);
        res.send(`<div style="text-align:center;padding-top:50px;"><h2>امسح الرمز لربط بوابة Logistics Hub</h2><img src="${qrImage}" width="300"/><p>تتحدث الصفحة تلقائياً...</p></div><script>setTimeout(()=>location.reload(), 20000)</script>`);
    } catch (err) { res.send('خطأ في توليد الصورة'); }
});

app.get('/', (req, res) => res.send('WhatsApp Gateway is Active'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`السيرفر يعمل على منفذ: ${PORT}`);
    connectToWA();
});
