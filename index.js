// index.js
import express from "express";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode";

const { Client, LocalAuth } = pkg;
const app = express();
app.use(express.json());

let qrDataUrl = "";

const client = new Client({
  authStrategy: new LocalAuth(),
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
  qrDataUrl = await qrcode.toDataURL(qr);
  console.log("📲 QR generado, visita / para escanearlo");
});

client.on("ready", () => {
  console.log("✅ WhatsApp Web listo");
  qrDataUrl = ""; 
});

client.initialize();

app.get("/", (req, res) => {
  if (!qrDataUrl) {
    return res.send(`<h2>QR no disponible</h2><p>Espera un momento y refresca.</p>`);
  }
  res.send(`
    <h2>Escanea este QR</h2>
    <img src="${qrDataUrl}" style="max-width:300px;" />
  `);
});

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
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
