// index.js (o index_asincrono.js) - completo y corregido 🎉
import 'dotenv/config';
import axios from 'axios';
import qrcode from 'qrcode';
import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { Client, LocalAuth } from 'whatsapp-web.js';

// 🚀 Variables de entorno
const APPS_SCRIPT_WEBHOOK_URL    = process.env.APPS_SCRIPT_WEBHOOK_URL;
const APPS_SCRIPT_WEBHOOK_SECRET = process.env.APPS_SCRIPT_WEBHOOK_SECRET;

// 🔌 Inicializar Express + HTTP + Socket.IO
const app    = express();
const server = http.createServer(app);
const io     = new SocketIOServer(server);

// 🌐 Estado de la sesión
let isClientReady = false;

// 📲 Iniciar cliente WhatsApp
const client = new Client({ authStrategy: new LocalAuth({ dataPath: './session' }) });

// 🏠 Ruta raíz: muestra la página con QR y estado
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>WhatsApp QR</title>
      <style>
        body { display:flex; flex-direction:column; align-items:center; font-family:sans-serif; margin-top:50px; }
        #qr img { width:300px; }
        button { margin-top:10px; padding:8px 12px; font-size:16px; }
      </style>
    </head>
    <body>
      <h1>📲 Escanea el QR con WhatsApp Web</h1>
      <div id="qr">⏳ Esperando QR...</div>
      <p id="status">Estado: inicializando...</p>
      <button onclick="location.reload()">🔄 Refrescar página</button>
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        socket.on('qr', qr => {
          document.getElementById('qr').innerHTML = '<img src="' + qr + '" />';
          document.getElementById('status').innerText = '📥 QR recibido: ¡Escanea con tu móvil!';
        });
        socket.on('ready', () => {
          document.getElementById('status').innerText = '✅ WhatsApp conectado';
        });
        socket.on('authenticated', () => {
          document.getElementById('status').innerText = '🔐 Autenticado correctamente';
        });
        socket.on('auth_failure', msg => {
          document.getElementById('status').innerText = '🚨 Error de autenticación: ' + msg;
        });
      </script>
    </body>
    </html>
  `);
});

// 📡 Endpoint de estado para verificar sesión desde Apps Script
app.get('/status', (req, res) => {
  res.json({ connected: isClientReady });
});

// 🔌 Loguear conexiones de Socket.IO
io.on('connection', () => console.log('🔌 Frontend conectado a Socket.IO'));

// 🌟 Eventos del cliente WhatsApp
client.on('qr', qr => {
  console.log('📸 QR recibido');
  qrcode.toDataURL(qr, (err, url) => {
    if (err) return console.error('❌ Error generando QR:', err);
    io.emit('qr', url);
  });
});
client.on('ready', () => {
  isClientReady = true;
  console.log('✅ Cliente WhatsApp listo');
  io.emit('ready');
});
client.on('authenticated', () => {
  console.log('🔐 Autenticado');
  io.emit('authenticated');
});
client.on('auth_failure', msg => {
  isClientReady = false;
  console.error('🚨 Auth failure:', msg);
  io.emit('auth_failure', msg);
});
client.initialize();

/**
 * 🚀 Procesa un lote de envíos en segundo plano y notifica a Apps Script
 * @param {Array<{ numero: string, mensaje: string }>} mensajes
 */
async function procesarLoteEnSegundoPlano(mensajes) {
  console.log(`📨 Iniciando procesamiento de lote: ${mensajes.length} mensajes`);
  const resultados = [];
  for (const { numero, mensaje } of mensajes) {
    try {
      const chatId = `${numero}@c.us`;
      await client.sendMessage(chatId, mensaje);
      resultados.push({ numero, mensajeOriginal: mensaje, estado: 'OK', error: null, timestamp: new Date().toISOString() });
      console.log(`✅ Enviado a ${numero}`);
    } catch (err) {
      resultados.push({ numero, mensajeOriginal: mensaje, estado: 'ERROR', error: err.message, timestamp: new Date().toISOString() });
      console.log(`❌ Error en envío a ${numero}: ${err.message}`);
    }
  }
  console.log('📊 Resultados del lote:', resultados);

  if (APPS_SCRIPT_WEBHOOK_URL) {
    try {
      console.log('📤 Notificando a Apps Script…');
      await axios.post(APPS_SCRIPT_WEBHOOK_URL, { results: resultados }, {
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': APPS_SCRIPT_WEBHOOK_SECRET },
        timeout: 10000
      });
      console.log('🎉 Webhook notificado con éxito.');
    } catch (webhookErr) {
      console.error('🚨 Error notificando al webhook:', webhookErr.toString());
    }
  } else {
    console.warn('⚠️ APPS_SCRIPT_WEBHOOK_URL no configurada.');
  }
}

// 🔔 Endpoint para recibir y procesar lotes
app.post('/enviarBatch', express.json(), async (req, res) => {
  const mensajes = Array.isArray(req.body.mensajes) ? req.body.mensajes : [];
  console.log(`🔔 /enviarBatch: ${mensajes.length} mensajes recibidos`);
  procesarLoteEnSegundoPlano(mensajes);
  res.status(202).send({ status: 'Procesamiento en segundo plano iniciado 🚀' });
});

// 🏁 Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
