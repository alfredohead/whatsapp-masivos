// =======================
// index.js (Node.js Backend)
// =======================
import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';

const { Client, LocalAuth } = pkg;
const app = express();
app.use(express.json());

let qrDataUrl = '';
let isReady = false;

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './sessions' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Wait until client is ready (authenticated or ready) with timeout
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

// QR code event
client.on('qr', async qr => {
  qrcodeTerminal.generate(qr, { small: true });
  try { qrDataUrl = await QRCode.toDataURL(qr); } catch (e) { console.error(e); }
  console.log('📲 QR generated');
});

client.on('authenticated', () => {
  isReady = true;
  qrDataUrl = '';
  console.log('🔒 Authenticated');
});

client.on('ready', () => {
  isReady = true;
  console.log('✅ Ready');
});

client.on('auth_failure', msg => {
  isReady = false;
  console.error('Auth failure:', msg);
});

client.on('disconnected', reason => {
  isReady = false;
  console.warn('Disconnected:', reason);
  client.initialize();
});

client.initialize();

// Serve QR
app.get('/', (req, res) => {
  if (!qrDataUrl) return res.send('<h3>No QR yet. Refresh soon.</h3>');
  res.send(`<h3>Scan QR</h3><img src="${qrDataUrl}" style="max-width:300px;"/>`);
});

// Healthcheck
app.get('/ping', (req, res) => res.send('pong'));

// Session status
app.get('/status', (req, res) => res.json({ active: isReady }));

// Generate new QR
app.get('/generateQr', async (req, res) => {
  try {
    await client.logout();
    isReady = false;
    qrDataUrl = '';
    client.initialize();
    res.json({ message: 'New QR requested' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate new QR', details: err.message });
  }
});

// Send single message
app.post('/enviar', async (req, res) => {
  if (!await waitForReady()) return res.status(503).json({ error: 'Client not ready' });
  try {
    const { numero, mensaje } = req.body;
    if (!numero || !mensaje) return res.status(400).json({ error: 'numero and mensaje required' });
    const cleaned = numero.replace(/\D/g, '');
    const chatId = numero.includes('@c.us') || numero.includes('@g.us')
      ? numero
      : `${cleaned}@c.us`;
    await client.sendMessage(chatId, mensaje, { sendSeen: false });
    res.json({ success: true, chatId });
  } catch (err) {
    const msg = err.message;
    if (msg.includes('Execution context was destroyed')) {
      return res.status(502).json({ error: 'ProtocolError', details: msg });
    }
    if (msg.includes('invalid wid')) {
      return res.status(400).json({ error: 'Invalid WhatsApp ID', details: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// Send batch messages
app.post('/enviarBatch', async (req, res) => {
  if (!await waitForReady()) return res.status(503).json({ error: 'Client not ready' });
  const batch = req.body;
  if (!Array.isArray(batch) || batch.length === 0) {
    return res.status(400).json({ error: 'Array of messages required' });
  }
  const results = await Promise.all(batch.map(async item => {
    try {
      const { numero, mensaje } = item;
      if (!numero || !mensaje) throw new Error('numero and mensaje required');
      const cleaned = numero.replace(/\D/g, '');
      const chatId = numero.includes('@c.us') || numero.includes('@g.us')
        ? numero
        : `${cleaned}@c.us`;
      await client.sendMessage(chatId, mensaje, { sendSeen: false });
      return { numero, status: 'OK' };
    } catch (err) {
      return { numero: item.numero || null, status: 'ERROR', error: err.message };
    }
  }));
  res.json({ results, last: results.slice(-1)[0] });
});

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
// Global error handler
app.use((err, req, res, next) => {
  console.error('Internal error:', err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));