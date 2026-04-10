const { Client, LocalAuth } = require("whatsapp-web.js");
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MENU_URL = "https://menu-lafelicitta.vercel.app";

function estaAbierto() {
  const ahora = new Date().toLocaleString("en-US", { timeZone: "America/Santiago" });
  const fecha = new Date(ahora);
  const hora = fecha.getHours();
  const dia = fecha.getDay();
  if (dia === 1) return false;
  return hora >= 12 && hora < 22;
}

const conversaciones = new Map();

function obtenerHistorial(numero) {
  if (!conversaciones.has(numero)) conversaciones.set(numero, []);
  return conversaciones.get(numero);
}

function agregarMensaje(numero, rol, contenido) {
  const historial = obtenerHistorial(numero);
  historial.push({ role: rol, content: contenido });
  if (historial.length > 10) historial.shift();
}

async function responderConIA(numero, mensajeCliente) {
  const historial = obtenerHistorial(numero);

  const systemPrompt = `Eres el asistente virtual de *La Felicitta*, restaurante venezolano-chileno en Iquique, Chile.

DATOS:
- Dirección: Barros Arana 504, Iquique
- Horario: Martes a domingo 12:00-22:00 (lunes cerrado)
- Menú: ${MENU_URL}
- Pagos: transferencia, efectivo, tarjetas (solo local)
- Delivery disponible en Iquique

PLATOS PRINCIPALES: hamburguesas venezolanas, perros calientes, arepas, cachapas, parrilla, sancocho (fines de semana), bebidas, papas fritas.

PARA TOMAR PEDIDOS pide: 1) platos y cantidades 2) retiro o delivery (si delivery, dirección) 3) nombre 4) método de pago.

REGLAS: responde en español, amable y breve (máximo 4 líneas), usa pocos emojis, no inventes precios exactos, confirma pedidos completos antes de cerrarlos.`;

  const mensajes = [
    ...historial,
    { role: "user", content: mensajeCliente }
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: systemPrompt,
    messages: mensajes,
  });

  const respuesta = response.content[0].text;
  agregarMensaje(numero, "user", mensajeCliente);
  agregarMensaje(numero, "assistant", respuesta);
  return respuesta;
}

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.SESSION_PATH || "./.wwebjs_auth",
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-accelerated-2d-canvas","--no-first-run","--no-zygote","--disable-gpu"],
  },
});

client.on("qr", (qr) => {
  console.log("📱 QR generado");
  if (global.actualizarQR) global.actualizarQR(qr);
});

client.on("ready", () => {
  console.log("✅ Bot listo");
  if (global.actualizarEstado) global.actualizarEstado("listo");
});

client.on("authenticated", () => {
  console.log("✅ Autenticado");
  if (global.actualizarEstado) global.actualizarEstado("autenticado");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Error auth:", msg);
  if (global.actualizarEstado) global.actualizarEstado("error_auth");
});

client.on("disconnected", (reason) => {
  console.log("⚠️ Desconectado:", reason);
  if (global.actualizarEstado) global.actualizarEstado("desconectado");
});

client.on("message", async (msg) => {
  try {
    if (msg.fromMe) return;
    if (msg.from.includes("@g.us")) return;

    const numero = msg.from;
    const texto = msg.body || "";
    console.log(`📩 ${numero}: ${texto}`);

    if (!estaAbierto()) {
      await msg.reply(`⏰ Hola! *La Felicitta* está cerrada ahora.\n\n🕐 Martes a domingo: 12:00–22:00\n📍 Barros Arana 504, Iquique\n\nTe esperamos pronto 🍔`);
      return;
    }

    const respuesta = await responderConIA(numero, texto);
    await msg.reply(respuesta);
    console.log(`✅ Respuesta enviada`);

  } catch (error) {
    console.error("❌ Error:", error);
    try {
      await msg.reply(`👋 Hola! Hubo un problema técnico momentáneo. Por favor visita nuestro menú: ${MENU_URL}\n\n📍 Barros Arana 504, Iquique`);
    } catch (e) {}
  }
});

console.log("🚀 Iniciando bot con IA Claude...");
client.initialize();
