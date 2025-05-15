import 'dotenv/config';
import axios from 'axios';
import qrcode from 'qrcode';
import http from 'http';
import express from 'express';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { Server as SocketIOServer } from 'socket.io';

const APPS_SCRIPT_WEBHOOK_URL = process.env.APPS_SCRIPT_WEBHOOK_URL;
const APPS_SCRIPT_WEBHOOK_SECRET = process.env.APPS_SCRIPT_WEBHOOK_SECRET;

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

let isClientReady = false;

const client = new Client({
  authStrategy: new LocalAuth({ session: { dataPath: './session' } }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    defaultViewport: null,
    timeout: 60000,
  },
});

app.use(express.json());

app.get('/', (req, res) => {
  res.send('<h1>Servidor de WhatsApp Masivo Activo</h1>');
});

client.on('qr', async qr => {
  try {
    const url = await qrcode.toDataURL(qr);
    io.emit('qr', url);
    console.log(`[${new Date().toISOString()}] 📱 QR generado y enviado.`);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ❌ Error generando QR:`, e);
  }
});

client.on('ready', () => {
  isClientReady = true;
  console.log(`[${new Date().toISOString()}] ✅ Cliente WhatsApp listo.`);
  io.emit('ready');
});

client.on('authenticated', () => {
  console.log(`[${new Date().toISOString()}] 🔐 Cliente autenticado.`);
});

client.on('auth_failure', msg => {
  isClientReady = false;
  console.error(`[${new Date().toISOString()}] ❌ Fallo de autenticación:`, msg);
  setTimeout(() => initializeClient(), 10000);
});

client.on('disconnected', reason => {
  isClientReady = false;
  console.warn(`[${new Date().toISOString()}] 🔌 Cliente desconectado:`, reason);
  setTimeout(() => initializeClient(), 5000);
});

async function initializeClient() {
  try {
    await client.destroy();
  } catch (e) {
    console.warn(`[${new Date().toISOString()}] ⚠️ No se pudo destruir el cliente previo:`, e.message);
  }
  try {
    await client.initialize();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Error al inicializar cliente:`, err);
    setTimeout(() => initializeClient(), 10000);
  }
}

initializeClient();

async function procesarLoteEnSegundoPlano(mensajes) {
  console.log(`[${new Date().toISOString()}] 📤 Iniciando procesamiento de ${mensajes.length} mensajes en segundo plano...`);
  const results = [];
  for (let i = 0; i < mensajes.length; i++) {
    const { numero, mensaje } = mensajes[i];
    let currentState = 'UNKNOWN';
    let intentos = 0;
    console.log(`[${new Date().toISOString()}] 🔍 [${i + 1}/${mensajes.length}] Verificando estado del cliente para ${numero}`);
    while (intentos < 2) {
      try {
        currentState = await Promise.race([
          client.getState(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout getState')), 15000))
        ]);
        console.log(`[${new Date().toISOString()}] 🟢 Estado del cliente: ${currentState}`);
        break;
      } catch (err) {
        intentos++;
        console.warn(`[${new Date().toISOString()}] ⚠️ Error obteniendo estado del cliente (intento ${intentos}): ${err.message}`);
        if (intentos >= 2) {
          currentState = 'ERROR_GETTING_STATE';
          console.warn(`[${new Date().toISOString()}] 🛠️ Reiniciando cliente automáticamente tras múltiples fallos de estado.`);
          isClientReady = false;
          await initializeClient();
        }
      }
    }

    if (currentState !== 'CONNECTED') {
      console.warn(`[${new Date().toISOString()}] ⚠️ Cliente no conectado. Saltando envío a ${numero}`);
      results.push({ numero, estado: 'ERROR', error: `Cliente WhatsApp no conectado (estado: ${currentState})`, timestamp: new Date().toISOString() });
      continue;
    }

    console.log(`[${new Date().toISOString()}] 💬 Enviando mensaje a ${numero}`);
    try {
      await Promise.race([
        client.sendMessage(`${numero}@c.us`, mensaje),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout envío a ${numero}`)), 45000))
      ]);
      console.log(`[${new Date().toISOString()}] ✅ Mensaje enviado a ${numero}`);
      results.push({ numero, estado: 'OK', error: null, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ❌ Error enviando a ${numero}: ${err.message}`);
      results.push({ numero, estado: 'ERROR', error: err.message, timestamp: new Date().toISOString() });
    }

    console.log(`[${new Date().toISOString()}] ⏱️ Pausando 500ms antes del siguiente mensaje...`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[${new Date().toISOString()}] 🧾 Lote finalizado. Total: ${mensajes.length}. OK: ${results.filter(r => r.estado === 'OK').length}, Errores: ${results.filter(r => r.estado === 'ERROR').length}`);

  if (APPS_SCRIPT_WEBHOOK_URL && APPS_SCRIPT_WEBHOOK_SECRET) {
    console.log(`[${new Date().toISOString()}] 🔔 Enviando resultados al webhook de Apps Script...`);
    try {
      await axios.post(APPS_SCRIPT_WEBHOOK_URL, { token: APPS_SCRIPT_WEBHOOK_SECRET, results }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
      console.log(`[${new Date().toISOString()}] 📬 Resultados enviados correctamente al webhook.`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] 🚨 Error al enviar resultados al webhook:`, e.message);
    }
  } else {
    console.warn(`[${new Date().toISOString()}] ⚠️ Webhook no configurado. Resultados no enviados.`);
  }
}

app.post('/enviarBatch', (req, res) => {
  const mensajes = Array.isArray(req.body.mensajes) ? req.body.mensajes : [];
  console.log(`[${new Date().toISOString()}] 📥 Recibida solicitud POST a /enviarBatch con ${mensajes.length} mensajes.`);
  if (!mensajes.length) return res.status(400).send({ status: 'Error', message: 'No hay mensajes para procesar' });
  if (!isClientReady) return res.status(503).send({ status: 'Error', message: 'Cliente WhatsApp no listo' });
  procesarLoteEnSegundoPlano(mensajes);
  res.status(202).send({ status: 'Iniciado', message: `Procesamiento de ${mensajes.length} mensajes iniciado.` });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Servidor escuchando en puerto ${PORT}`);
});

