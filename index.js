// =======================
// index.js (Servidor Node.js)
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

// Inicializa cliente WhatsApp Web
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './sessions' }),
  puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] },
});

// Espera readiness con timeout
function waitForReady(timeout = 10000) {
  return new Promise(resolve => {
    if (isReady) return resolve(true);
    const interval = setInterval(() => {
      if (isReady) { clearInterval(interval); clearTimeout(timer); resolve(true); }
    },300);
    const timer = setTimeout(() => { clearInterval(interval); resolve(false); },timeout);
  });
}

// Eventos de cliente
client.on('qr', async qr => {
  qrcodeTerminal.generate(qr,{small:true});
  try { qrDataUrl = await QRCode.toDataURL(qr); } catch(e){console.error(e);}
  console.log('📲 QR generado');
});
client.on('authenticated',()=>{ isReady=true; qrDataUrl=''; console.log('🔒 Sesión autenticada'); });
client.on('ready',()=>{ isReady=true; console.log('✅ WhatsApp Web listo'); });
client.on('auth_failure',msg=>{ isReady=false; console.error('❌ Auth failure',msg); });
client.on('disconnected',reason=>{ isReady=false; console.warn('⚠️ Desconectado',reason); client.initialize(); });
client.initialize();

// Rutas
app.get('/',(req,res)=>{
  if(!qrDataUrl) return res.send('<h3>No hay QR disponible. Recarga la página.</h3>');
  res.send(`<h3>Escanea este QR con WhatsApp</h3><img src="${qrDataUrl}" style="max-width:300px;"/>`);
});
app.get('/ping',(req,res)=>res.send('pong'));
app.get('/status',(req,res)=>res.json({ activo:isReady }));

app.get('/generateQr',async(req,res)=>{
  try{
    await client.logout(); isReady=false; qrDataUrl=''; client.initialize();
    res.json({ mensaje:'Nuevo QR solicitado' });
  }catch(err){
    res.status(500).json({ error:'Error generando QR', detalles:err.message });
  }
});

app.post('/enviar',async(req,res)=>{
  if(!await waitForReady()) return res.status(503).json({ error:'Cliente no listo. Escanea el QR y espera.' });
  try{
    const { numero,mensaje }=req.body;
    if(!numero||!mensaje) return res.status(400).json({ error:'numero y mensaje requeridos' });
    const limpio=numero.replace(/\D/g,'');
    const chatId=numero.includes('@')? numero : `${limpio}@c.us`;
    await client.sendMessage(chatId,mensaje,{sendSeen:false});
    res.json({ exito:true, chatId });
  }catch(err){
    const m=err.message;
    if(m.includes('Execution context was destroyed')) return res.status(502).json({ error:'ProtocolError',detalles:m });
    if(m.includes('invalid wid')) return res.status(400).json({ error:'ID inválido',detalles:m });
    res.status(500).json({ error:'Error interno',detalles:m });
  }
});

app.post('/enviarBatch',async(req,res)=>{
  if(!await waitForReady()) return res.status(503).json({ error:'Cliente no listo. Escanea el QR y espera.' });
  const lote=req.body;
  if(!Array.isArray(lote)||lote.length===0) return res.status(400).json({ error:'Se requiere un array de mensajes' });
  const resultados=await Promise.all(lote.map(async item=>{
    try{
      const { numero,mensaje }=item;
      if(!numero||!mensaje) throw new Error('numero y mensaje requeridos');
      const limpio=numero.replace(/\D/g,'');
      const chatId=numero.includes('@')? numero : `${limpio}@c.us`;
      await client.sendMessage(chatId,mensaje,{sendSeen:false});
      return { numero,estado:'OK' };
    }catch(err){
      return { numero:item.numero||null,estado:'ERROR',error:err.message };
    }
  }));
  res.json({ resultados, ultimo:resultados.slice(-1)[0] });
});

// Errores
app.use((req,res)=>res.status(404).json({ error:'Ruta no encontrada' }));
app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({ error:'Error servidor' }); });

// Inicia servidor
const PUERTO=process.env.PORT||3000;
app.listen(PUERTO,()=>console.log(`🚀 Servidor puerto ${PUERTO}`));