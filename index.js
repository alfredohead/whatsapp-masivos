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
const RENDER_APP_TOKEN = process.env.RENDER_APP_TOKEN; // Opcional: Token para verificar requests a /enviarBatch

// 🔌 Inicializar Express + HTTP + Socket.IO
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

// 🌐 Estado de la sesión
let isClientReady = false; // Refleja el evento 'ready'

// 📲 Configurar cliente WhatsApp con Puppeteer mejorado
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

// 📡 Estado de conexión (simple)
app.get('/status', (req, res) => res.json({ clientReady: isClientReady }));

// 🔌 Socket.IO
io.on('connection', () => console.log(`[${new Date().toISOString()}] 🔗 Frontend conectado a Socket.IO`));

// 🌟 Eventos de cliente WhatsApp
client.on('qr', async qr => {
  console.log(`[${new Date().toISOString()}] 📱 QR Recibido. Generando Data URL para frontend...`);
  try {
    const url = await qrcode.toDataURL(qr);
    io.emit('qr', url);
    console.log(`[${new Date().toISOString()}] ✔️ QR enviado al frontend.`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Error generando QR Data URL:`, err);
  }
});

client.on('ready', () => {
  isClientReady = true;
  console.log(`[${new Date().toISOString()}] ✅ Cliente WhatsApp ¡LISTO Y CONECTADO!`);
  io.emit('ready');
});

client.on('authenticated', () => {
  console.log(`[${new Date().toISOString()}] 🔐 Cliente WhatsApp ¡AUTENTICADO!`);
  io.emit('authenticated');
});

client.on('auth_failure', msg => {
  isClientReady = false;
  console.error(`[${new Date().toISOString()}] 🚨 ¡FALLO DE AUTENTICACIÓN DE WHATSAPP!:`, msg);
  io.emit('auth_failure', msg);
  console.log(`[${new Date().toISOString()}] 🔄 Intentando reinicializar cliente en 10 segundos (fallo auth).`);
  setTimeout(() => initializeClient(), 10000);
});

client.on('disconnected', reason => {
  isClientReady = false;
  console.warn(`[${new Date().toISOString()}] 🔌 Cliente WhatsApp ¡DESCONECTADO! Razón:`, reason);
  io.emit('disconnected', reason);
  console.log(`[${new Date().toISOString()}] 🔄 Intentando reinicializar cliente en 5 segundos (desconexión).`);
  setTimeout(() => initializeClient(), 5000);
});

client.on('loading_screen', (percent, message) => {
    console.log(`[${new Date().toISOString()}] ⏳ CARGANDO WHATSAPP: ${percent}% - ${message}`);
});

// 🚨 Capturar promesas no manejadas y errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] 🔥 GRAVE: Unhandled Rejection en:`, promise, 'razón:', reason);
});
process.on('uncaughtException', (err, origin) => {
  console.error(`[${new Date().toISOString()}] 🔥 GRAVE: Uncaught Exception:`, err, 'Origen:', origin);
});

/**
 * Inicializar cliente WhatsApp con reintentos y logging mejorado.
 */
async function initializeClient() {
  if (client.pupBrowser) {
    console.log(`[${new Date().toISOString()}] 🧹 Intentando cerrar instancia previa de Puppeteer antes de reinicializar.`);
    try {
      await client.destroy();
      console.log(`[${new Date().toISOString()}] ✔️ Instancia previa de Puppeteer cerrada.`);
    } catch (destroyError) {
      console.error(`[${new Date().toISOString()}] ⚠️ Error al destruir cliente previo:`, destroyError);
    }
  }
  console.log(`[${new Date().toISOString()}] 🚀 Inicializando cliente WhatsApp...`);
  try {
    await client.initialize();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Error durante client.initialize():`, err);
    console.log(`[${new Date().toISOString()}] 🔄 Reintentando inicialización en 10 segundos.`);
    setTimeout(() => initializeClient(), 10000);
  }
}

initializeClient();

setInterval(async () => {
  if (client.pupPage && !client.pupPage.isClosed()) {
    try {
      await client.pupPage.title(); 
    } catch (err) {
      console.warn(`[${new Date().toISOString()}] ⚠️ Error en ping de contexto de Puppeteer:`, err.message);
      console.log(`[${new Date().toISOString()}] 🔄 Contexto Puppeteer posiblemente muerto, reiniciando cliente.`);
      isClientReady = false; 
      io.emit('disconnected', 'Contexto Puppeteer perdido');
      await initializeClient(); 
    }
  }
}, 60000);

async function procesarLoteEnSegundoPlano(mensajes) {
  console.log(`[${new Date().toISOString()}] 📨 Procesando lote de ${mensajes.length} mensajes.`);
  const results = [];
  let mensajesEnviadosConExito = 0;
  let mensajesConError = 0;

  for (let i = 0; i < mensajes.length; i++) {
    const { numero, mensaje } = mensajes[i];
    let currentState = 'UNKNOWN';
    try {
      currentState = await client.getState();
    } catch (stateError) {
      console.error(`[${new Date().toISOString()}] 🆘 [${i + 1}/${mensajes.length}] Error GRAVE obteniendo estado del cliente para ${numero}: ${stateError.message}`);
      currentState = 'ERROR_GETTING_STATE';
    }

    console.log(`[${new Date().toISOString()}] ℹ️ [${i + 1}/${mensajes.length}] Estado del cliente ANTES de enviar a ${numero}: ${currentState}`);
    console.log(`[${new Date().toISOString()}] 💬 [${i + 1}/${mensajes.length}] Intentando enviar a ${numero}. Mensaje: "${mensaje.substring(0, 30)}..."`);
    
    if (currentState !== 'CONNECTED') {
      console.warn(`[${new Date().toISOString()}] ⚠️ [${i + 1}/${mensajes.length}] Cliente NO conectado (estado: ${currentState}). Saltando envío a ${numero}.`);
      results.push({ numero, estado: 'ERROR', error: `Cliente WhatsApp no conectado (estado: ${currentState})`, timestamp: new Date().toISOString() });
      mensajesConError++;
      // Si el estado no es CONNECTED, y no hay navegador, es un problema serio, intentar reinicio.
      if (!client.pupBrowser && currentState !== 'INITIALIZING' && currentState !== 'QR_CODE') {
          console.error(`[${new Date().toISOString()}] 🆘 [${i + 1}/${mensajes.length}] El navegador de Puppeteer NO existe y el cliente no está conectado ni inicializando. Intentando reinicialización completa.`);
          await initializeClient();
      }
      continue; // Saltar al siguiente mensaje
    }

    try {
      const sendPromise = client.sendMessage(`${numero}@c.us`, mensaje);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: El envío a ${numero} tardó más de 45 segundos.`)), 45000)
      );

      await Promise.race([sendPromise, timeoutPromise]);

      results.push({ numero, estado: 'OK', error: null, timestamp: new Date().toISOString() });
      console.log(`[${new Date().toISOString()}] ✅ [${i + 1}/${mensajes.length}] ¡ÉXITO! Mensaje enviado a ${numero}`);
      mensajesEnviadosConExito++;
    } catch (err) {
      results.push({ numero, estado: 'ERROR', error: err.message, timestamp: new Date().toISOString() });
      console.error(`[${new Date().toISOString()}] ❌ [${i + 1}/${mensajes.length}] ¡ERROR! Enviando a ${numero}: ${err.message}`);
      mensajesConError++;
    }
    // Pausa opcional para no saturar (descomentar si es necesario)
    // console.log(`[${new Date().toISOString()}] ⏱️ Pausa de 1 segundo...`);
    // await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`[${new Date().toISOString()}] 🏁 Lote finalizado. ${mensajesEnviadosConExito} enviados OK, ${mensajesConError} con ERROR.`);

  if (APPS_SCRIPT_WEBHOOK_URL && APPS_SCRIPT_WEBHOOK_SECRET) {
    console.log(`[${new Date().toISOString()}] 📢 Enviando resultados al webhook de Apps Script...`);
    try {
      await axios.post(APPS_SCRIPT_WEBHOOK_URL, 
        { token: APPS_SCRIPT_WEBHOOK_SECRET, results }, 
        {
          headers: { 'Content-Type': 'application/json' }, 
          timeout: 20000 
        }
      );
      console.log(`[${new Date().toISOString()}] 🎉 Webhook de resultados ¡ENVIADO CORRECTAMENTE!`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] 🚨 Error al enviar resultados al webhook:`, e.message);
    }
  } else {
    console.warn(`[${new Date().toISOString()}] ⚠️ Webhook de Apps Script no configurado. No se enviarán resultados.`);
  }
}

app.post('/enviarBatch', express.json(), (req, res) => {
  const mensajes = Array.isArray(req.body.mensajes) ? req.body.mensajes : [];
  console.log(`[${new Date().toISOString()}] 📥 Recibida solicitud POST a /enviarBatch con ${mensajes.length} mensajes.`);
  
  if (!mensajes.length) {
    console.log(`[${new Date().toISOString()}] ℹ️ No hay mensajes en el payload.`);
    return res.status(400).send({ status: 'Error', message: 'No hay mensajes para procesar' });
  }

  // Verificación rápida del estado del cliente antes de aceptar la tarea
  // Usamos isClientReady como una primera barrera, el chequeo detallado está en procesarLoteEnSegundoPlano
  if (!isClientReady) {
    console.warn(`[${new Date().toISOString()}] ⚠️ Cliente WhatsApp no listo (isClientReady=false). Solicitud a /enviarBatch rechazada temporalmente.`);
    return res.status(503).send({ status: 'Error', message: 'Servicio no disponible temporalmente, cliente WhatsApp no listo.' });
  }

  procesarLoteEnSegundoPlano(mensajes); 
  res.status(202).send({ status: 'Iniciado', message: `Procesamiento de ${mensajes.length} mensajes iniciado.` });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Servidor Express escuchando en puerto ${PORT}`);
  console.log(`[${new Date().toISOString()}] 🌍 URL para QR y estado: http://localhost:${PORT}/`);
  if (APPS_SCRIPT_WEBHOOK_URL) {
    console.log(`[${new Date().toISOString()}] 📢 Webhook de Apps Script configurado para: ${APPS_SCRIPT_WEBHOOK_URL}`);
  } else {
    console.warn(`[${new Date().toISOString()}] ⚠️ Webhook de Apps Script (APPS_SCRIPT_WEBHOOK_URL) no configurado.`);
  }
});



