import 'dotenv/config';
import axios from 'axios';
import qrcode from 'qrcode';
import http from 'http';
import express from 'express';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { Server as SocketIOServer } from 'socket.io';

// 🚀 Variables de entorno
const APPS_SCRIPT_WEBHOOK_URL = process.env.APPS_SCRIPT_WEBHOOK_URL;
const APPS_SCRIPT_WEBHOOK_SECRET = process.env.APPS_SCRIPT_WEBHOOK_SECRET;

// 🔌 Inicializar Express + HTTP + Socket.IO
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

// 🌐 Estado de la sesión
let isClientReady = false;

// 📲 Configurar cliente WhatsApp con Puppeteer mejorado
t const client = new Client({
  authStrategy: new LocalAuth({ session: { dataPath: './session' } }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
    defaultViewport: null,
    timeout: 60000 // 60 segundos
  }
});

// 🏠 Ruta raíz: página QR y estado
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
      document.getElementById('qr').innerHTML = '<img src="' + qr + '" />';
      document.getElementById('status').innerText = '📥 QR recibido';
    });
    socket.on('ready', () => document.getElementById('status').innerText = '✅ Conectado');
    socket.on('authenticated', () => document.getElementById('status').innerText = '🔐 Autenticado');
    socket.on('auth_failure', msg => document.getElementById('status').innerText = '🚨 Auth failure: ' + msg);
    socket.on('disconnected', reason => document.getElementById('status').innerText = '🔌 Desconectado: ' + reason);
  </script>
</body>
</html>`);
});

// 📡 Estado de conexión
app.get('/status', (req, res) => res.json({ connected: isClientReady }));

// 🔌 Socket.IO
io.on('connection', () => console.log('🔌 Frontend conectado'));

// 🌟 Eventos de cliente WhatsApp
client.on('qr', async qr => {
  console.log('📸 QR recibido');
  const url = await qrcode.toDataURL(qr).catch(err => { console.error('❌ QR error:', err); });
  io.emit('qr', url);
});

client.on('ready', () => {
  isClientReady = true;
  console.log('✅ Cliente listo');
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
  // Reinicializar después de fallo
  setTimeout(() => initializeClient(), 10000);
});

client.on('disconnected', reason => {
  isClientReady = false;
  console.warn('🔌 Desconectado:', reason);
  io.emit('disconnected', reason);
  setTimeout(() => initializeClient(), 5000);
});

// 🚨 Capturar promesas no manejadas
process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
  setTimeout(() => initializeClient(), 10000);
});

/**
 * Inicializar cliente con reintentos
 */
async function initializeClient() {
  try {
    await client.initialize();
  } catch (err) {
    console.error('❌ Error en initialize():', err);
    setTimeout(() => initializeClient(), 10000);
  }
}

// Arrancar la inicialización
eninitializeClient();

/**
 * Ping periódico para asegurar contexto vivo
 */
setInterval(async () => {
  if (client?.pupPage) {
    try {
      await client.pupPage.title();
    } catch (err) {
      console.warn('🔄 Contexto muerto, reiniciando cliente');
      initializeClient();
    }
  }
}, 30000);

/**
 * Procesar lote y notificar webhook
 */
async function procesarLoteEnSegundoPlano(mensajes) {
  console.log(`📨 Lote ${mensajes.length}`);
  const results = [];
  for (const { numero, mensaje } of mensajes) {
    try {
      await client.sendMessage(`${numero}@c.us`, mensaje);
      results.push({ numero, estado: 'OK', error: null, timestamp: new Date().toISOString() });
      console.log(`✅ ${numero}`);
    } catch (err) {
      results.push({ numero, estado: 'ERROR', error: err.message, timestamp: new Date().toISOString() });
      console.error(`❌ ${numero}:`, err);
    }
  }
  if (APPS_SCRIPT_WEBHOOK_URL) {
    try {
      await axios.post(APPS_SCRIPT_WEBHOOK_URL, { results }, {
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': APPS_SCRIPT_WEBHOOK_SECRET },
        timeout: 10000
      });
      console.log('🎉 Webhook ok');
    } catch (e) {
      console.error('🚨 Webhook error:', e);
    }
  }
}

// 🔔 Recepción de lote
app.post('/enviarBatch', express.json(), (req, res) => {
  const mensajes = Array.isArray(req.body.mensajes) ? req.body.mensajes : [];
  console.log(`🔔 /enviarBatch ${mensajes.length}`);
  procesarLoteEnSegundoPlano(mensajes);
  res.status(202).send({ status: 'Iniciado' });
});

// 🏁 Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 en puerto ${PORT}`));

