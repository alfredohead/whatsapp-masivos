import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';

const { Client, LocalAuth } = pkg;
const app = express();

// Soporte para payloads grandes (por si envías muchos mensajes)
app.use(express.json({ limit: '5mb' }));

let qrDataUrl = '';
let isReady = false;

// Inicialización del cliente WhatsApp Web
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './sessions' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Espera hasta que el cliente esté listo o timeout
function waitForReady(timeout = 10000) {
  return new Promise(resolve => {
    if (isReady) return resolve(true);
    const check = setInterval(() => {
      if (isReady) {
        clearInterval(check);
        clearTimeout(timer);
        resolve(true);
      }
    }, 300);
    const timer = setTimeout(() => {
      clearInterval(check);
      resolve(false);
    }, timeout);
  });
}

// Eventos del cliente
client.on('qr', async qr => {
  qrcodeTerminal.generate(qr, { small: true });
  try {
    qrDataUrl = await QRCode.toDataURL(qr);
  } catch (e) {
    console.error('Error generando DataURL del QR:', e);
  }
  console.log('📲 QR generado');
});

client.on('authenticated', () => {
  isReady = true;
  qrDataUrl = '';
  console.log('🔒 Sesión autenticada');
});

client.on('ready', () => {
  isReady = true;
  console.log('✅ Cliente WhatsApp listo');
});

client.on('auth_failure', msg => {
  isReady = false;
  console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', reason => {
  isReady = false;
  console.warn('⚠️ Cliente desconectado:', reason);
  client.initialize();
});

client.initialize();

// Rutas HTTP
app.get('/', (req, res) => {
  if (!qrDataUrl) {
    return res.send('<h3>No hay QR disponible. Recarga en unos segundos.</h3>');
  }
  res.send(`
    <h3>Escanea este QR con WhatsApp</h3>
    <img src="${qrDataUrl}" style="max-width:300px;"/>
  `);
});

app.get('/ping', (req, res) => res.send('pong'));

app.get('/status', (req, res) => res.json({ activo: isReady }));

app.get('/generateQr', async (req, res) => {
  console.log('🔔 Solicitud de nuevo QR');
  try {
    await client.logout();
    isReady = false;
    qrDataUrl = '';
    client.initialize();
    res.json({ mensaje: 'Nuevo QR solicitado' });
  } catch (err) {
    console.error('Error en /generateQr:', err);
    res.status(500).json({ error: 'Error al generar nuevo QR', detalles: err.message });
  }
});

app.post('/enviar', async (req, res) => {
  console.log('🔔 POST /enviar body:', req.body);
  if (!await waitForReady()) {
    return res.status(503).json({ error: 'Cliente no listo. Escanea el QR y espera.' });
  }
  try {
    const { numero, mensaje } = req.body;
    if (!numero || !mensaje) {
      return res.status(400).json({ error: 'numero y mensaje requeridos' });
    }
    const limpio = numero.replace(/\D/g, '');
    const chatId = numero.includes('@') ? numero : `${limpio}@c.us`;
    await client.sendMessage(chatId, mensaje, { sendSeen: false });
    res.json({ exito: true, chatId });
  } catch (err) {
    console.error('Error en /enviar:', err);
    const m = err.message;
    if (m.includes('Execution context was destroyed')) {
      return res.status(502).json({ error: 'ProtocolError', detalles: m });
    }
    if (m.includes('invalid wid')) {
      return res.status(400).json({ error: 'ID inválido', detalles: m });
    }
    res.status(500).json({ error: 'Error interno', detalles: m });
  }
});

app.post('/enviarBatch', async (req, res) => {
  console.log(`🔔 POST /enviarBatch — ${Array.isArray(req.body) ? req.body.length : 0} ítems`);
  if (!await waitForReady()) {
    return res.status(503).json({ error: 'Cliente no listo. Escanea el QR y espera.' });
  }
  const lote = req.body;
  if (!Array.isArray(lote) || lote.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de mensajes' });
  }

  const resultados = [];
  for (const item of lote) {
    const { numero, mensaje } = item;
    const resultado = { numero, estado: '', error: null };
    try {
      if (!numero || !mensaje) throw new Error('numero y mensaje requeridos');
      const limpio = numero.replace(/\D/g, '');
      const chatId = numero.includes('@') ? numero : `${limpio}@c.us`;
      console.log(`✉️ Enviando a ${chatId}: "${mensaje}"`);
      await client.sendMessage(chatId, mensaje, { sendSeen: false });
      resultado.estado = 'OK';
    } catch (err) {
      console.error(`❌ Error enviando a ${numero}:`, err);
      resultado.estado = 'ERROR';
      resultado.error = err.message;
    }
    resultados.push(resultado);
    // Pequeña pausa para no saturar Puppeteer
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('✅ Batch finalizado:', resultados);
  res.json({ resultados, ultimo: resultados[resultados.length - 1] });
});

// Manejadores de error y 404
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  console.error('❌ Error del servidor:', err);
  res.status(500).json({ error: 'Error del servidor' });
});

// Iniciar servidor
const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => console.log(`🚀 Servidor escuchando en puerto ${PUERTO}`));
