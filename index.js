import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';

const { Client, LocalAuth } = pkg;
const app = express();

// Permitir JSON grandes (por si envías muchos mensajes)
app.use(express.json({ limit: '5mb' }));

let qrDataUrl = '';
let isReady = false;

// Inicializar cliente WhatsApp Web
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './sessions' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Espera hasta que el cliente esté listo o expire el timeout
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
  try {
    qrDataUrl = await QRCode.toDataURL(qr);
  } catch (e) {
    console.error('Error al generar DataURL del QR:', e);
  }
  console.log('📲 QR generado, escanéalo.');
});

client.on('authenticated', () => {
  isReady = true;
  qrDataUrl = '';
  console.log('🔒 Sesión autenticada correctamente.');
});

client.on('ready', () => {
  isReady = true;
  console.log('✅ Cliente WhatsApp listo para enviar mensajes.');
});

client.on('auth_failure', msg => {
  isReady = false;
  console.error('❌ Fallo en autenticación:', msg);
});

client.on('disconnected', reason => {
  isReady = false;
  console.warn('⚠️ Cliente desconectado:', reason);
  // Considera una estrategia de reintento más robusta o notificaciones si la reinicialización falla repetidamente.
  client.initialize().catch(err => console.error('Error al reinicializar el cliente tras desconexión:', err));
});

client.initialize().catch(err => console.error('Error en la inicialización inicial del cliente:', err));

// Rutas HTTP
app.get('/', (req, res) => {
  if (!qrDataUrl) {
    return res.send('<h3>No hay QR disponible. Actualiza la página en unos segundos.</h3>');
  }
  res.send(`
    <h3>Escanea este QR con WhatsApp</h3>
    <img src="${qrDataUrl}" style="max-width:300px;"/>
  `);
});

app.get('/ping', (req, res) => res.send('pong'));
app.get('/status', (req, res) => res.json({ activo: isReady }));

app.get('/generateQr', async (req, res) => {
  console.log('🔔 /generateQr solicitado');
  try {
    if (client) {
        try {
            await client.logout();
            console.log('Sesión de cliente cerrada antes de generar nuevo QR.');
        } catch (logoutError) {
            console.warn('Error al intentar cerrar sesión del cliente (puede que no estuviera inicializado o listo):', logoutError.message);
        }
    }
    isReady = false;
    qrDataUrl = '';
    // Re-inicializar el cliente para obtener un nuevo QR
    await client.initialize(); 
    res.json({ mensaje: 'Nuevo QR solicitado. Escanea el nuevo QR que aparecerá en la consola y en la ruta principal.' });
  } catch (err) {
    console.error('Error en /generateQr:', err);
    res.status(500).json({ error: 'Error al generar nuevo QR', detalles: err.message });
  }
});

app.post('/enviar', async (req, res) => {
  console.log('🔔 POST /enviar recibido:', req.body);
  if (!await waitForReady()) {
    return res.status(503).json({ error: 'Cliente no listo. Escanea el QR y espera.' });
  }
  try {
    const { numero, mensaje } = req.body;
    if (!numero || !mensaje) {
      return res.status(400).json({ error: 'numero y mensaje son requeridos' });
    }
    const limpio = String(numero).replace(/\D/g, '');
    const chatId = String(numero).includes('@') ? numero : `${limpio}@c.us`;
    console.log(`✉️ Enviando mensaje a ${chatId}: "${mensaje}"`);
    await client.sendMessage(chatId, mensaje, { sendSeen: false });
    console.log(`✅ Mensaje enviado a ${chatId}`);
    res.json({ exito: true, chatId });
  } catch (err) {
    console.error('❌ Error en /enviar:', err);
    const m = err.message || String(err);
    if (m.includes('Execution context was destroyed')) {
      return res.status(502).json({ error: 'ProtocolError', detalles: m });
    }
    if (m.includes('invalid wid')) {
      return res.status(400).json({ error: 'ID inválido', detalles: m });
    }
    res.status(500).json({ error: 'Error interno', detalles: m });
  }
});

// Función para procesar el lote de mensajes en segundo plano
async function procesarLoteEnSegundoPlano(lote, clienteWhatsAppInstance) {
  console.log(`⚙️ Procesando lote de ${lote.length} mensajes en segundo plano...`);
  const resultados = [];
  for (const item of lote) {
    const { numero, mensaje } = item;
    const resItem = { numero, estado: '', error: null, timestamp: new Date().toISOString() };
    try {
      if (!numero || !mensaje) throw new Error('Número y mensaje son requeridos para este item del lote.');
      const limpio = String(numero).replace(/\D/g, '');
      const chatId = String(numero).includes('@') ? numero : `${limpio}@c.us`;
      console.log(`✉️ (BG) Enviando a ${chatId}: "${mensaje}"`);
      await clienteWhatsAppInstance.sendMessage(chatId, mensaje, { sendSeen: false });
      console.log(`✅ (BG) Enviado a ${chatId}`);
      resItem.estado = 'OK';
    } catch (err) {
      console.error(`❌ (BG) Error enviando a ${numero}:`, err);
      resItem.estado = 'ERROR';
      resItem.error = err.message || String(err);
    }
    resultados.push(resItem);
    // Pausa para no saturar Puppeteer y la API de WhatsApp
    await new Promise(r => setTimeout(r, 200)); // Ajusta esta pausa según sea necesario
  }
  console.log(`✅ (BG) Batch completado en segundo plano. Total procesados: ${resultados.length}`);
  // Aquí podrías, por ejemplo, guardar `resultados` en una base de datos o loggear a un archivo/servicio de monitoreo.
  // Por ahora, solo se loguea en la consola del servidor.
  console.log('Resultados del lote en segundo plano:', JSON.stringify(resultados, null, 2));
}

app.post('/enviarBatch', async (req, res) => {
  console.log(`🔔 POST /enviarBatch recibido — ${Array.isArray(req.body) ? req.body.length : 0} mensajes`);
  
  if (!await waitForReady()) {
    console.warn('Cliente no listo al recibir /enviarBatch. Solicitud rechazada.');
    return res.status(503).json({ error: 'Cliente no listo. Escanea el QR y espera.' });
  }
  
  const lote = req.body;
  if (!Array.isArray(lote) || lote.length === 0) {
    console.warn('/enviarBatch: Se requiere un array de mensajes. Solicitud rechazada.');
    return res.status(400).json({ error: 'Se requiere un array de mensajes con al menos un elemento.' });
  }

  // Envía respuesta inmediata a Apps Script (o cualquier cliente)
  res.status(202).json({ 
    mensaje: 'Lote recibido y aceptado para procesamiento en segundo plano.', 
    cantidadRecibida: lote.length,
    timestampRecepcion: new Date().toISOString()
  });

  // Llama a la función para procesar los mensajes en segundo plano SIN esperarla (no usar await aquí)
  procesarLoteEnSegundoPlano(lote, client).catch(error => {
    // Este catch es para errores inesperados DENTRO de procesarLoteEnSegundoPlano que no fueron manejados individualmente.
    console.error('Error crítico durante el procesamiento del lote en segundo plano:', error);
  });
});

// 404 y manejador global de errores
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, req, res, next) => {
  console.error('❌ Error inesperado del servidor:', err);
  // Evita enviar el stack trace completo al cliente en producción por seguridad.
  res.status(500).json({ error: 'Error interno del servidor. Revise los logs para más detalles.' });
});

// Arrancar servidor
const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => console.log(`🚀 Servidor escuchando en puerto ${PUERTO}`));
