import express from "express";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import bodyParser from "body-parser";

const { Client, LocalAuth } = pkg;

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./sesion" }),
  puppeteer: { headless: true }
});

client.on("qr", qr => {
  console.log("Escaneá este QR para iniciar sesión:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ WhatsApp conectado y listo.");
});

client.initialize();

app.post("/enviar", async (req, res) => {
  const { numero, mensaje } = req.body;

  if (!numero || !mensaje) {
    return res.status(400).json({ status: "-1", message: "Faltan datos" });
  }

  try {
    await client.sendMessage(`${numero}@c.us`, mensaje);
    return res.json({ status: "0", message: "Mensaje enviado correctamente" });
  } catch (e) {
    return res.json({ status: "-1", message: "Error al enviar: " + e.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor activo en puerto ${port}`);
});
