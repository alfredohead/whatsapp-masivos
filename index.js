// index.js
import express from "express";
import pkg from "whatsapp-web.js";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";

const { Client, LocalAuth } = pkg;
const app = express();
app.use(express.json());

let qrDataUrl = "";

// Si hay una carpeta ./sessions de runs anteriores, elimínala para forzar QR
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./sessions" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", async (qr) => {
  // 1) Muestra ASCII en consola
  qrcodeTerminal.generate(qr, { small: true });
  console.log("📲 ¡QR generado! Escanéalo con tu móvil.");

  // 2) Guarda DataURL para / ruta
  qrDataUrl = await QRCode.toDataURL(qr);
});

client.on("ready", () => {
  console.log("✅ WhatsApp Web listo, ya no hace falta QR.");
  qrDataUrl = ""; // opcional: limpia el QR
});

client.initialize();

// Servir el QR en el navegador
app.get("/", (req, res) => {
  if (!qrDataUrl) {
    return res.send(`<h3>No hay QR disponible<br>Espera unos segundos y refresca.</h3>`);
  }
  res.send(`
    <h3>Escanea este QR</h3>
    <img src="${qrDataUrl}" style="max-width:300px;" />
  `);
});

// API para enviar mensajes
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
