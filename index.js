// index.js
// Servidor Express + WhatsApp Web.js con manejo automático de sesión

import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { Client } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';

// Ruta donde se guardará la sesión de WhatsApp
const SESSION_FILE_PATH = './session.json';

// 1️⃣ Carga la sesión si ya existe
let sessionData = {};
if (fs.existsSync(SESSION_FILE_PATH)) {
  try {
    sessionData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
  } catch (err) {
    console.error('❌ Error leyendo session.json:', err);
    sessionData = {};
  }
}

// 2️⃣ Inicializa el cliente con los datos de sesión (vacío la primera vez)
const client = new Client({ session: sessionData });

// 3️⃣ Eventos de sesión
client.on('qr', qr => {
  console.log('🔎 Escanea este QR con tu WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', session => {
  console.log('✅ Autenticado correctamente');
  fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(session), 'utf8');
  console.log('💾 session.json guardado');
});

client.on('auth_failure', msg => {
  console.error('❌ Falló la autenticación:', msg);
  // Borra session para forzar re-login
  if (fs.existsSync(SESSION_FILE_PATH)) fs.unlinkSync(SESSION_FILE_PATH);
});

client.on('ready', () => {
  console.log('🚀 WhatsApp Client listo');
});

// Inicia la conexión con WhatsApp
client.initialize();

// 4️⃣ Configuración de Express
const app = express();
// Aumentamos límite para cuerpos JSON grandes
app.use(express.json({ limit: '10mb' }));

// 5️⃣ Ruta para recibir lotes desde Apps Script
app.post('/enviarBatch', (req, res) => {
  const { lote, callbackUrl } = req.body;
  console.log(`🔔 Recibido lote de ${lote.length} mensajes → callback: ${callbackUrl}`);

  // Respuesta inmediata para no bloquear la petición
  res.json({ status: 'accepted', count: lote.length });

  // Procesamiento asíncrono de envíos
  (async () => {
    const results = [];
    for (const { numero, mensaje, rowIndex } of lote) {
      try {
        const chatId = numero.includes('@c.us') ? numero : `${numero}@c.us`;
        await client.sendMessage(chatId, mensaje);
        results.push({ rowIndex, estado: 'OK' });
      } catch (err) {
        console.error(`❌ Error enviando a ${numero}:`, err);
        results.push({ rowIndex, estado: 'ERROR', error: err.message });
      }
    }

    // Envío de resultados de vuelta a Apps Script
    try {
      await axios.post(callbackUrl, results, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('✅ Callback enviado correctamente');
    } catch (err) {
      console.error('❌ Error enviando callback:', err);
    }
  })();
});

// 6️⃣ Arranca el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server corriendo en puerto ${PORT}`));


