import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';

const { Client, LocalAuth } = pkg;
const app = express();

// Middlewares
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

client.on('qr', async (qr) => {
  qrcodeTerminal.generate(qr, { small: true });
  console.log('📲 QR generado, escanéalo con tu móvil');
  try {
    qrDataUrl = await QRCode.toDataURL(qr);
  } catch (err) {
    console.error('Error generando DataURL del QR:', err);
  }
});

client.on('ready', () => {
  console.log('✅ WhatsApp Web listo.');
  qrDataUrl = '';
  isReady = true;
});

client.on('auth_failure', (msg) => {
  console.error('Error de autenticación:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('Cliente desconectado, reiniciando...', reason);
  isReady = false;
  client.initialize();
});

client.initialize();

// Rutas
// Servir QR en navegador
app.get('/', (req, res) => {
  if (!qrDataUrl) {
    return res.send('<h3>No hay QR disponible, espera unos segundos y refresca.</h3>');
  }
  res.send(`
    <h3>Escanea este QR con WhatsApp</h3>
    <img src="${qrDataUrl}" style="max-width:300px;" />
  `);
});

// Endpoint de salud
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Enviar mensaje
app.post('/enviar', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp client not ready. Please try again shortly.' });
  }
  try {
    const { numero, mensaje } = req.body;
    if (!numero || !mensaje || typeof numero !== 'string' || typeof mensaje !== 'string') {
      return res.status(400).json({ error: 'numero y mensaje son requeridos y deben ser strings' });
    }

    // Limpiar y formatear número
    const cleaned = numero.replace(/\D/g, '');
    const chatId = numero.includes('@c.us') || numero.includes('@g.us')
      ? numero
      : `${cleaned}@c.us`;
    console.log(`📨 Enviando mensaje a chatId: ${chatId}`);

    // Enviar mensaje
    await client.sendMessage(chatId, mensaje);
    return res.status(200).json({ success: true, message: 'Mensaje enviado', chatId });
  } catch (err) {
    console.error('Error en POST /enviar:', err);
    if (err.message && err.message.includes('invalid wid')) {
      return res.status(400).json({ error: 'Invalid WhatsApp ID', details: err.message });
    }
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error interno:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
