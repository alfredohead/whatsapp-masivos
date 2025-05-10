import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';

const { Client, LocalAuth } = pkg;
const app = express();

// Middleware JSON
app.use(express.json());

// Inicializar cliente de WhatsApp
let qrDataUrl = '';
let isReady = false;
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './sessions' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Espera readiness (auth o ready) con timeout reducido a 10s para respuesta más rápida
function waitForReady(timeout = 10000) {
  return new Promise(resolve => {
    if (isReady) return resolve(true);
    const interval = setInterval(() => {
      if (isReady) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve(true);
      }
    }, 300);
    const timer = setTimeout(() => {
      clearInterval(interval);
      resolve(false);
    }, timeout);
  });
}

// Eventos del cliente
client.on('qr', async qr => {
  qrcodeTerminal.generate(qr, { small: true });
  console.log('📲 QR generado, escanéalo con tu móvil');
  try { qrDataUrl = await QRCode.toDataURL(qr); } 
  catch (err) { console.error('Error generando DataURL del QR:', err); }
});

client.on('authenticated', session => {
  console.log('🔒 Sesión autenticada.');
  isReady = true;
  qrDataUrl = '';
});

client.on('ready', () => {
  console.log('✅ WhatsApp Web listo.');
  isReady = true;
});

client.on('auth_failure', msg => {
  console.error('Error de autenticación:', msg);
  isReady = false;
});

client.on('disconnected', reason => {
  console.warn('Cliente desconectado, reiniciando...', reason);
  isReady = false;
  client.initialize();
});

client.initialize();

// Rutas
app.get('/', (req, res) => {
  if (!qrDataUrl) return res.send('<h3>No hay QR disponible. Refresca en unos segundos.</h3>');
  res.send(`
    <h3>Escanea este QR con WhatsApp</h3>
    <img src="${qrDataUrl}" style="max-width:300px;" />
  `);
});

// Salud
app.get('/ping', (req, res) => res.status(200).send('pong'));

// Estado rápido: true en cuanto está autenticado o listo
app.get('/status', (req, res) => res.status(200).json({ active: isReady }));

// Enviar un solo mensaje
app.post('/enviar', async (req, res) => {
  const ready = await waitForReady();
  if (!ready) return res.status(503).json({ error: 'Cliente no listo. Escanea QR y espera.' });
  try {
    const { numero, mensaje } = req.body;
    if (!numero || !mensaje) return res.status(400).json({ error: 'numero y mensaje son requeridos' });
    const cleaned = numero.replace(/\D/g, '');
    const chatId = numero.includes('@c.us') || numero.includes('@g.us')
      ? numero : `${cleaned}@c.us`;
    await client.sendMessage(chatId, mensaje);
    return res.status(200).json({ success: true, chatId });
  } catch (err) {
    console.error('Error POST /enviar:', err);
    if (err.message.includes('Execution context was destroyed')) {
      return res.status(502).json({ error: 'ProtocolError', details: err.message });
    }
    if (err.message.includes('invalid wid')) {
      return res.status(400).json({ error: 'Invalid WhatsApp ID', details: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

// Enviar lote en paralelo (batch)
app.post('/enviarBatch', async (req, res) => {
  const ready = await waitForReady();
  if (!ready) return res.status(503).json({ error: 'Cliente no listo. Escanea QR y espera.' });
  const batch = req.body;
  if (!Array.isArray(batch) || batch.length === 0) return res.status(400).json({ error: 'Se necesita un array de mensajes' });

  const results = await Promise.all(batch.map(async item => {
    try {
      const { numero, mensaje } = item;
      if (!numero || !mensaje) throw new Error('numero y mensaje son requeridos');
      const cleaned = numero.replace(/\D/g, '');
      const chatId = numero.includes('@c.us') || numero.includes('@g.us')
        ? numero : `${cleaned}@c.us`;
      await client.sendMessage(chatId, mensaje);
      return { numero, status: 'OK' };
    } catch (err) {
      console.error('Error batch item:', err);
      return { numero: item.numero || null, status: 'ERROR', error: err.message };
    }
  }));

  const last = results[results.length - 1];
  return res.status(200).json({ results, last });
});

// 404 y errores
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  console.error('Error interno:', err);
  res.status(500).json({ error: 'Servidor error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
