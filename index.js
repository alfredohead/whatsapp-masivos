// index.js
import express from "express";
import pkg from "whatsapp-web.js";
import QRCode from "qrcode";

const { Client, LocalAuth } = pkg;
const app = express();
app.use(express.json());

let qrDataUrl = "";

// Fuerza un store limpio en cada deploy
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./sessions",      // guarda la sesión aquí
    clientId: "whatsapp-masivos" // nombre de cliente único
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
    ]
  }
});

client.on("qr", async qr => {
  qrDataUrl = await QRCode.toDataURL(qr);
  console.log("📲 QR generado, visita / para escanearlo");
});

client.on("ready", () => {
  console.log("✅ WhatsApp Web listo, ya no hace falta QR");
  qrDataUrl = ""; // opcional: limpia el QR una vez conectado
});

client.initialize();

// Ruta para mostrar el QR
app.get("/", (req, res) => {
  if (!qrDataUrl) {
    return res.send(`
      <h2>QR no disponible</h2>
      <p>Espera unos segundos y refresca esta página.</p>
    `);
  }
  res.send(`
    <h2>Escanea este QR con tu móvil</h2>
    <img src="${qrDataUrl}" style="max-width:300px;" />
  `);
});

// Endpoint para enviar mensajes
app.post("/enviar", async (req, res) => {
  const { numero, mensaje } = req.body;
  try {
    await client.sendMessage(`${numero}@c.us`, mensaje);
    res.json({ status: "0", message: "Mensaje enviado" });
  } catch (e) {
    res.status(500).json({ status: "-1", message: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor arrancado en puerto ${PORT}`));
