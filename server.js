const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason } = baileys;
const { Boom } = require('@hapi/boom');
const express = require('express');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const cors = require('cors');
const pino = require('pino');

const app = express();
app.use(bodyParser.json());
app.use(cors());

let sock;
let lastQR = "";

async function connectToWhatsApp() {
    // استخدام مجلد auth_info لتخزين بيانات الجلسة
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'info' }), // تفعيل السجلات لمراقبة الحالة
        browser: ["Shi One Gateway", "Chrome", "1.0.0"],
        connectTimeoutMs: 120000, // مهلة اتصال 120 ثانية لتجنب الفشل في الاستضافات الضعيفة
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 20000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('🔄 تم توليد رمز QR جديد، قم بتحديث صفحة /qr');
            lastQR = await QRCode.toDataURL(qr);
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            console.log('انقطع الاتصال. الحالة:', statusCode);
            
            // إعادة المحاولة إذا لم يكن السبب هو تسجيل خروج يدوي
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('جاري محاولة إعادة الاتصال خلال 5 ثوانٍ...');
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            lastQR = "connected";
            console.log('✅ تم الاتصال بواتساب بنجاح!');
        }
    });
}

// مسار عرض الـ QR
app.get('/qr', (req, res) => {
    if (lastQR === "connected") return res.send('<h1>✅ بوابة واتساب متصلة الآن</h1>');
    if (!lastQR) return res.send('<h1>⏳ جاري توليد الرمز... يرجى تحديث الصفحة بعد قليل</h1>');
    res.send(`
        <div style="text-align:center; font-family:Arial;">
            <h1>امسح الكود لربط Shi One</h1>
            <img src="${lastQR}" style="border:10px solid #f0f0f0;">
            <p>سيتم تحديث الصفحة تلقائياً عند نجاح الاتصال</p>
            <script>setTimeout(() => { location.reload(); }, 15000);</script>
        </div>
    `);
});

// مسار إرسال الـ OTP
app.post('/send-otp', async (req, res) => {
    const { phone, code } = req.body;
    if (lastQR !== "connected") return res.status(500).json({ error: 'السيرفر غير مرتبط بواتساب حالياً' });

    try {
        const formattedPhone = phone.replace(/\D/g, '') + '@s.whatsapp.net';
        await sock.sendMessage(formattedPhone, { text: `رمز التحقق الخاص بك هو: ${code}` });
        res.status(200).json({ status: 'success', message: 'تم إرسال الكود' });
    } catch (e) {
        console.error('خطأ أثناء الإرسال:', e);
        res.status(500).json({ status: 'error', message: 'فشل في إرسال الرسالة' });
    }
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send('<h1>✅ Gateway Active</h1><p>Shi One & Logistics Hub API is running.</p>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('Server running on port ' + PORT);
    connectToWhatsApp();
});