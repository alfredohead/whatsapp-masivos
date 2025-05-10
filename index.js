// index.js
import express from "express";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode";

const app = express();
app.use(express.json());

let qrCodeDataUrl = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      // Estas flags ayudan en entornos como Fly/Render
    ],
  },
});

// Al recibir el QR, lo convertimos a data-URL
client.on("qr", async (qr) => {
  qrCodeDataUrl = await qrcode.toDataURL(qr);
  console.log("📲 QR generado, visita / para verlo");
});

client.on("ready", () => {
  console.log("✅ WhatsApp listo");
});

// Inicializamos el cliente
client.initialize();

// Ruta principal que muestra el QR
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>WhatsApp Masivos</title>
      <style>
        body { display: flex; flex-direction: column; align-items: center; padding: 50px; font-family: sans-serif; }
        img { max-width: 300px; }
      </style>
    </head>
    <body>
      <h1>Escanea el QR con tu WhatsApp</h1>
      ${qrCodeDataUrl
        ? `<img src="${qrCodeDataUrl}" alt="QR de WhatsApp" />`
        : `<p>Generando QR, espera unos segundos...</p>`}
    </body>
    </html>
  `);
});

// Endpoint para enviar mensajes
app.post("/enviar", async (req, res) => {
  const { numero, mensaje } = req.body;
  try {
    await client.sendMessage(`${numero}@c.us`, mensaje);
    res.json({ status: "0", message: "Mensaje enviado" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "-1", message: error.message });
  }
});

// Ponemos a escuchar en el puerto 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});
