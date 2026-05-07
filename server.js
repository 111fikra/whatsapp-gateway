const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// 1. تشغيل السيرفر أولاً وبأسرع وقت ممكن ليرضي Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log('====================================');
    console.log(`🚀 Server live on port ${PORT}`);
    console.log('====================================');
    
    // تأخير تشغيل الواتساب 5 ثوانٍ لضمان استقرار السيرفر
    setTimeout(startWhatsApp, 5000);
});

let lastQR = "";
let isConnected = false;
const sessionDir = path.join('/tmp', 'session_final');

async function startWhatsApp() {
    console.log("🔄 Starting WhatsApp engine...");
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // سيظهر الرمز في السجلات (المربعات السوداء)
        browser: ['Logistics Hub', 'Chrome', '1.0.0'],
        generateHighQualityQR: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            lastQR = qr;
            console.log("✨ QR Code generated! Check logs or /qr");
        }
        if (connection === 'close') {
            console.log("⚠️ Connection closed. Retrying...");
            setTimeout(startWhatsApp, 5000);
        } else if (connection === 'open') {
            console.log("✅ WA CONNECTED SUCCESSFULLY");
            isConnected = true;
        }
    });
}

app.get('/qr', async (req, res) => {
    if (!lastQR) return res.send("Generating... please refresh");
    const img = await QRCode.toDataURL(lastQR);
    res.send(`<center><img src="${img}" width="300"></center>`);
});

app.get('/', (req, res) => res.send("Logistics Hub API is active."));
