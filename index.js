import 'dotenv/config';
import axios from 'axios';
import qrcode from 'qrcode';
import http from 'http';
import express from 'express';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { Server as SocketIOServer } from 'socket.io';

// 🎯 Constantes y configuración
const ICONS = {
  START: '🚀',
  ERROR: '❌',
  SUCCESS: '✅',
  WARNING: '⚠️',
  QR: '📱',
  AUTH: '🔐',
  DISCONNECT: '🔌',
  MESSAGE: '📨',
  WEBHOOK: '📡',
  SERVER: '🖥️',
  CLIENT: '👤',
  BATCH: '📦',
  INIT: '🔄'
};

// 📝 Logger mejorado
const logger = {
  info: (icon, message) => console.log(`${icon} ${message}`),
  error: (icon, message, error) => console.error(`${icon} ${message}`, error || ''),
  warn: (icon, message) => console.warn(`${icon} ${message}`),
  success: (icon, message) => console.log(`${icon} ${message}`)
};

// 🚀 Variables de entorno
const APPS_SCRIPT_WEBHOOK_URL = process.env.APPS_SCRIPT_WEBHOOK_URL;
const APPS_SCRIPT_WEBHOOK_SECRET = process.env.APPS_SCRIPT_WEBHOOK_SECRET;
const PORT = process.env.PORT || 3000;

// 🔌 Inicializar Express + HTTP + Socket.IO
const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = new SocketIOServer(server);

// 🌐 Estado de la sesión
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// 📲 Configurar cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-dev-tools',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-translate'
    ],
    defaultViewport: null,
    timeout: 60000
  }
});

// 🏠 Ruta raíz: página QR
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>WhatsApp QR</title>
    <style>
        body { 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            font-family: system-ui; 
            margin-top: 50px;
            background: #f0f2f5;
        }
        #qr { 
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        #qr img { 
            width: 300px; 
            height: 300px;
        }
        #status { 
            margin: 20px 0;
            padding: 10px 20px;
            border-radius: 5px;
            background: #e8f5e9;
        }
        button { 
            padding: 10px 20px;
            font-size: 16px;
            cursor: pointer;
            border: none;
            border-radius: 5px;
            background: #128C7E;
            color: white;
            transition: all 0.3s ease;
        }
        button:hover {
            background: #075E54;
        }
    </style>
</head>
<body>
    <h1>📱 WhatsApp Web QR</h1>
    <div id="qr">⌛ Generando código QR...</div>
    <p id="status">Iniciando...</p>
    <button onclick="location.reload()">🔄 Actualizar</button>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const statusEl = document.getElementById('status');
        const qrEl = document.getElementById('qr');

        socket.on('qr', qr => {
            qrEl.innerHTML = '<img src="' + qr + '" />';
            statusEl.innerText = '📱 Escanea el código QR';
            statusEl.style.background = '#fff3e0';
        });
        socket.on('ready', () => {
            statusEl.innerText = '✅ WhatsApp conectado';
            statusEl.style.background = '#e8f5e9';
            qrEl.innerHTML = '🎉 ¡Conectado!';
        });
        socket.on('authenticated', () => {
            statusEl.innerText = '🔐 Autenticado';
            statusEl.style.background = '#e8f5e9';
        });
        socket.on('auth_failure', msg => {
            statusEl.innerText = '❌ Error: ' + msg;
            statusEl.style.background = '#ffebee';
        });
        socket.on('disconnected', reason => {
            statusEl.innerText = '🔌 Desconectado: ' + reason;
            statusEl.style.background = '#fff3e0';
        });
    </script>
</body>
</html>`);
});

// 📡 Endpoint de estado
app.get('/status', (req, res) => {
  res.json({ 
    connected: isClientReady,
    reconnectAttempts,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS
  });
});

// 🔌 Socket.IO connection
io.on('connection', () => {
  logger.info(ICONS.CLIENT, 'Cliente web conectado');
});

// 🤖 Eventos WhatsApp
client.on('qr', async qr => {
  logger.info(ICONS.QR, 'Nuevo código QR generado');
  try {
    const qrUrl = await qrcode.toDataURL(qr);
    io.emit('qr', qrUrl);
  } catch (err) {
    logger.error(ICONS.ERROR, 'Error generando QR:', err);
  }
});

client.on('ready', () => {
  isClientReady = true;
  reconnectAttempts = 0;
  logger.success(ICONS.SUCCESS, 'Cliente WhatsApp listo');
  io.emit('ready');
});

client.on('authenticated', () => {
  logger.success(ICONS.AUTH, 'WhatsApp autenticado');
  io.emit('authenticated');
});

client.on('auth_failure', msg => {
  isClientReady = false;
  logger.error(ICONS.ERROR, 'Error de autenticación:', msg);
  io.emit('auth_failure', msg);
});

client.on('disconnected', reason => {
  isClientReady = false;
  logger.warn(ICONS.DISCONNECT, `WhatsApp desconectado: ${reason}`);
  io.emit('disconnected', reason);
  
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    logger.info(ICONS.INIT, `Reintentando conexión ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} en ${delay/1000}s...`);
    setTimeout(initializeClient, delay);
  } else {
    logger.error(ICONS.ERROR, 'Máximo número de intentos de reconexión alcanzado');
  }
});

// 🔄 Función de inicialización mejorada
async function initializeClient() {
  try {
    logger.info(ICONS.INIT, 'Iniciando cliente WhatsApp...');
    await client.initialize();
  } catch (err) {
    logger.error(ICONS.ERROR, 'Error inicializando cliente:', err);
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      logger.info(ICONS.INIT, `Reintentando en ${delay/1000}s...`);
      setTimeout(initializeClient, delay);
    }
  }
}

// 📨 Procesamiento de mensajes mejorado
async function procesarLoteEnSegundoPlano(mensajes) {
  logger.info(ICONS.BATCH, `Procesando lote de ${mensajes.length} mensajes`);
  const results = [];

  for (const { numero, mensaje } of mensajes) {
    try {
      await client.sendMessage(`${numero}@c.us`, mensaje);
      results.push({
        numero,
        estado: 'OK',
        error: null,
        timestamp: new Date().toISOString()
      });
      logger.success(ICONS.MESSAGE, `Mensaje enviado a ${numero}`);
      // Añadir delay entre mensajes para evitar bloqueos
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      results.push({
        numero,
        estado: 'ERROR',
        error: err.message,
        timestamp: new Date().toISOString()
      });
      logger.error(ICONS.ERROR, `Error enviando a ${numero}:`, err.message);
    }
  }

  if (APPS_SCRIPT_WEBHOOK_URL) {
    try {
      await axios.post(
        APPS_SCRIPT_WEBHOOK_URL, 
        { results },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': APPS_SCRIPT_WEBHOOK_SECRET
          },
          timeout: 10000
        }
      );
      logger.success(ICONS.WEBHOOK, 'Webhook notificado exitosamente');
    } catch (err) {
      logger.error(ICONS.ERROR, 'Error notificando webhook:', err.message);
    }
  }
  
  return results;
}

// 📨 Endpoint para envío de mensajes mejorado
app.post('/enviarBatch', async (req, res) => {
  const mensajes = Array.isArray(req.body.mensajes) ? req.body.mensajes : [];
  
  if (!mensajes.length) {
    logger.warn(ICONS.WARNING, 'Intento de envío sin mensajes');
    return res.status(400).json({ error: 'No hay mensajes para procesar' });
  }
  
  if (!isClientReady) {
    logger.warn(ICONS.WARNING, 'Intento de envío con WhatsApp desconectado');
    return res.status(503).json({ error: 'WhatsApp no está conectado' });
  }

  logger.info(ICONS.BATCH, `Recibido lote de ${mensajes.length} mensajes`);
  procesarLoteEnSegundoPlano(mensajes);
  res.status(202).json({ 
    status: 'Procesando mensajes',
    batch_size: mensajes.length,
    timestamp: new Date().toISOString()
  });
});

// 🚀 Iniciar servidor
server.listen(PORT, () => {
  logger.success(ICONS.SERVER, `Servidor iniciado en puerto ${PORT}`);
  initializeClient();
});

// 🔄 Monitor de conexión mejorado
setInterval(async () => {
  if (isClientReady && client?.pupPage) {
    try {
      await client.pupPage.title();
    } catch (err) {
      logger.warn(ICONS.WARNING, 'Conexión perdida, reiniciando...');
      isClientReady = false;
      initializeClient();
    }
  }
}, 30000);

// 🚨 Manejo de errores no capturados
process.on('uncaughtException', (err) => {
  logger.error(ICONS.ERROR, 'Error no capturado:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error(ICONS.ERROR, 'Promesa rechazada no manejada:', reason);
});

