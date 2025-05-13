// index.js (o index_asincrono.js) - completo y corregido 🎉
import 'dotenv/config';
import axios from 'axios';
import qrcode from 'qrcode';
import http from 'http';
import express from 'express';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { Server as SocketIOServer } from 'socket.io';

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

// 🏠 Ruta raíz: muestra la página con QR y estado usando template literal
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
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
      document.getElementById('qr').innerHTML = `<img src="${qr}" />`;
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
</html>`);
});

// 📡 Endpoint /status para verificar sesión desde Apps Script
app.get('/status', (req, res) => {
  res.json({ connected: isClientReady });
});

// 🔌 Conexiones Socket.IO
io.on('connection', () => console.log('🔌 Frontend conectado a Socket.IO'));

// 🌟 Eventos WhatsApp Web.js
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
 * 🚀 Procesa lote en segundo plano y notifica a Apps Script
 */
async function procesarLoteEnSegundoPlano(mensajes) {
  console.log(`📨 Procesando lote: ${mensajes.length} mensajes`);
  const resultados = [];
  for (const { numero, mensaje } of mensajes) {
    try {
      await client.sendMessage(`${numero}@c.us`, mensaje);
      resultados.push({ numero, mensajeOriginal: mensaje, estado: 'OK', error: null, timestamp: new Date().toISOString() });
      console.log(`✅ Enviado a ${numero}`);
    } catch (err) {
      resultados.push({ numero, mensajeOriginal: mensaje, estado: 'ERROR', error: err.message, timestamp: new Date().toISOString() });
      console.log(`❌ Error en envío a ${numero}: ${err.message}`);
    }
  }
  console.log('📊 Resultados:', resultados);

  if (APPS_SCRIPT_WEBHOOK_URL) {
    try {
      await axios.post(APPS_SCRIPT_WEBHOOK_URL, { results: resultados }, {
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': APPS_SCRIPT_WEBHOOK_SECRET },
        timeout: 10000
      });
      console.log('🎉 Webhook notificado');
    } catch (e) {
      console.error('🚨 Error notificando webhook:', e.toString());
    }
  } else {
    console.warn('⚠️ APPS_SCRIPT_WEBHOOK_URL no configurada');
  }
}

// 🔔 Endpoint /enviarBatch
app.post('/enviarBatch', express.json(), async (req, res) => {
  const mensajes = Array.isArray(req.body.mensajes) ? req.body.mensajes : [];
  console.log(`🔔 /enviarBatch: ${mensajes.length} mensajes`);
  procesarLoteEnSegundoPlano(mensajes);
  res.status(202).send({ status: 'Procesamiento iniciado 🚀' });
});

// 🏁 Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));


