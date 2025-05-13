// index.js
import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import { Client } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import sessionData from './session.json' assert { type: 'json' };

const app = express();
// Aumentamos el límite para evitar truncados en JSON grandes
app.use(express.json({ limit: '10mb' }));

// Inicialización de WhatsApp Web.js
const client = new Client({ session: sessionData });
client.initialize();
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ WhatsApp Client listo'));

app.post('/enviarBatch', (req, res) => {
  const { lote, callbackUrl } = req.body;
  console.log(`🔔 Recibido lote de ${lote.length} mensajes. Callback: ${callbackUrl}`);
  // Respondemos rápido para no bloquear a Render
  res.json({ status: 'accepted', count: lote.length });

  // Procesamiento asíncrono del envío y webhook de respuesta
  (async () => {
    const results = [];
    for (const { numero, mensaje, rowIndex } of lote) {
      try {
        const chatId = numero.includes('@c.us') ? numero : `${numero}@c.us`;
        await client.sendMessage(chatId, mensaje);
        results.push({ rowIndex, numero, estado: 'OK' });
      } catch (err) {
        console.error(`❌ Error enviando a ${numero}:`, err);
        results.push({ rowIndex, numero, estado: 'ERROR', error: err.message });
      }
    }
    try {
      await axios.post(callbackUrl, results, { headers: { 'Content-Type': 'application/json' } });
      console.log('✅ Callback enviado a Apps Script');
    } catch (err) {
      console.error('❌ Falló el envío del callback:', err);
    }
  })();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server en puerto ${PORT}`));

