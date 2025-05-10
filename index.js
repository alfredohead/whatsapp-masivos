// index.js
import express from 'express';
import bodyParser from 'body-parser';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { chromium } from 'playwright';

const app = express();
app.use(bodyParser.json());

let qrImageDataUrl = null;
let isReady = false;

// Obtenemos la ruta al Chromium que instala Playwright
const executablePath = chromium.executablePath();

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

client.on('qr', async qr => {
  // Muestra en consola
  qrcodeTerminal.generate(qr, { small: true });
  // Genera Data URL para servir vía HTTP
  try {
    qrImageDataUrl = await QRCode.toDataURL(qr);
  } catch (err) {
    console.error('Error al generar DataURL del QR:', err);
  }
});

client.on('ready', () => {
  isReady = true;
  console.log('✅ WhatsApp Web listo');
});

client.initialize();

// Página principal: muestra QR o estado
app.get('/', (req, res) => {
  if (!isReady && qrImageDataUrl) {
    return res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Escanea el QR de WhatsApp</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; font-family: sans-serif; padding-top: 50px; }
            img { border: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <h2>⏳ Escanea este QR con tu WhatsApp</h2>
          <img src="${qrImageDataUrl}" alt="QR Code"/>
        </body>
      </html>
    `);
  }

  if (isReady) {
    return res.send(`
      <!doctype html>
      <html>
        <head><meta charset="utf-8"><title>WhatsApp Conectado</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
          <h1>✅ WhatsApp Conectado</h1>
        </body>
      </html>
    `);
  }

  res.send(`<h1 style="text-align:center;font-family:sans-serif;padding-top:50px;">⏳ Generando QR…</h1>`);
});

// Endpoint para enviar mensajes
app.post('/enviar', async (req, res) => {
  if (!isReady) {
    return res.status(400).json({ status: '-1', message: 'Aún no estás conectado a WhatsApp.' });
  }

  const { numero, mensaje } = req.body;
  const chatId = numero.includes('@') ? numero : `${numero}@c.us`;

  try {
    await client.sendMessage(chatId, mensaje);
    res.json({ status: '0', message: 'Mensaje enviado' });
  } catch (err) {
    console.error('Error enviando mensaje:', err);
    res.status(500).json({ status: '-1', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
