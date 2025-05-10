import express from 'express';
import bodyParser from 'body-parser';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';

const app = express();
app.use(bodyParser.json());

let qrImage = null;
let connected = false;

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'default' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async qr => {
  // consola
  qrcodeTerminal.generate(qr, { small: true });
  // para servir por HTTP
  try {
    qrImage = await QRCode.toDataURL(qr);
  } catch (e) {
    console.error('No pude generar DataURL del QR:', e);
  }
});

client.on('ready', () => {
  connected = true;
  console.log('✅ WhatsApp conectado.');
});

client.initialize();

app.get('/', (req, res) => {
  if (!connected && qrImage) {
    return res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Escanea QR</title>
          <style>
            body { display:flex;flex-direction:column;align-items:center;padding:50px;font-family:sans-serif; }
            img { border:1px solid #ccc; }
          </style>
        </head>
        <body>
          <h2>Escanea este código QR con tu WhatsApp</h2>
          <img src="${qrImage}" alt="QR Code"/>
        </body>
      </html>
    `);
  }

  if (connected) {
    return res.send(`
      <!doctype html>
      <html>
        <head><meta charset="utf-8"><title>Conectado</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
          <h1>✅ WhatsApp Conectado</h1>
        </body>
      </html>
    `);
  }

  res.send(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Generando QR</title></head>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
        <h1>⏳ Generando código QR…</h1>
      </body>
    </html>
  `);
});

app.post('/enviar', async (req, res) => {
  if (!connected) {
    return res.status(400).json({ status: '-1', message: 'WhatsApp no está conectado aún.' });
  }
  const { numero, mensaje } = req.body;
  try {
    const chatId = numero.includes('@') ? numero : `${numero}@c.us`;
    await client.sendMessage(chatId, mensaje);
    res.json({ status: '0', message: 'Mensaje enviado' });
  } catch (err) {
    console.error('Error enviando:', err);
    res.status(500).json({ status: '-1', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
