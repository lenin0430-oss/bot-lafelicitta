const { Client, LocalAuth } = require("whatsapp-web.js");
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function estaAbierto() {
  const ahora = new Date().toLocaleString("en-US", { timeZone: "America/Santiago" });
  const fecha = new Date(ahora);
  const hora = fecha.getHours();
  return hora >= 8 && hora < 24;
}

const conversaciones = new Map();
const procesando = new Set(); // evitar doble respuesta

function obtenerHistorial(numero) {
  if (!conversaciones.has(numero)) conversaciones.set(numero, []);
  return conversaciones.get(numero);
}

function agregarMensaje(numero, rol, contenido) {
  const historial = obtenerHistorial(numero);
  historial.push({ role: rol, content: contenido });
  if (historial.length > 8) historial.shift();
}

async function responderConIA(numero, mensajeCliente) {
  const historial = obtenerHistorial(numero);
  const systemPrompt = `Eres el asistente de pedidos de La Felicitta, restaurante venezolano-chileno en Iquique. Responde SIEMPRE en máximo 3 líneas cortas. Sé directo y amable.

DATOS:
- Dirección: Barros Arana 504, Iquique
- Horario: 08:30-00:00 todos los días
- Pagos: transferencia, efectivo, tarjetas (solo local)

DELIVERY:
- Centro Iquique: $2.500 | Tadeo Hankee: $3.000 | Sector Sur: $4.000
- Preparación: ~20 minutos

MENÚ Y PRECIOS:
HAMBURGUESAS: La Felicitta $2.500 | Especial $4.500 | Super $5.500 | Doble $6.500 | La Pelua $7.500 | Triple $8.000
XL (200g+papas): Estrella $6.500 | Luna $7.500 | Casa Club $8.500 | Ahumada $9.500
PERROS: Luka $1.000 | Callejero $2.000 | Perro Loco/Chileno/Americano $3.000 | Peluo $3.500 | Premium venezolano/chileno $3.500 | Premium americano/BBQ $3.990
COMPLETOS (c/papas): As $3.000/XL$5.500 | Italiano $2.000/XL$3.500 | Churrasco Italiano $4.500 | Churrasco Super $5.000 | Barros Luco $4.500 | Churrasco Mechada $5.000 | Chacarero $5.000
AREPAS: $2.500 c/5 ingredientes (carne mechada, pollo, salchicha, jamón, pernil, perico, caraotas, queso gouda, huevo, tajadas, choclo, palta, etc.)
CACHAPAS: Sencilla $5.000 | Especial $6.000 | Ahumada $7.000 | Cochino $7.500 | Queso Mano $7.000 | Esp.Queso $7.500 | Chuleta Queso $9.000 | Cochino Queso $10.000
ARROZ CHINO: Promo $4.500 | Cerdo-Pollo $8.000 | Cerdo-Camarón $10.000 | Especial $12.000
PEPITOS: Pollo $6.000 | Carne $7.000 | Mixto $9.000 | Bestia 30cm $14.990
PATACONES: Normal $7.000 | Especial $8.500 | 3Quesos $11.000 | Mixto $12.000
PAPAS: Normal $3.500 | XL $5.500 | Bacon&Cheddar $4.500/XL$7.500 | Salchipapas $3.800/XL$6.300 | Nuggets 6u $2.500/12u $4.800
EMPANADAS: Carne $2.500 | Pollo/Molida/JQ/CaraotaQ/Queso $2.000 | Pabellón $3.000 | Perico $2.500
TEQUEÑOS: Queso 25cm $2.000 | JQ 25cm $2.500 | 4u $2.500 | 8u $4.600 | 12u $6.990
BEBIDAS: Gaseosa 500cc $1.200 | 1.5L $2.000 | Naranja/Piña $1.800 | Mango/Maracuyá $2.000 | Agua $800 | Café $800 | C/Leche $1.000 | Té $800 | Chocolate $1.200

PARA CONFIRMAR PEDIDO incluye siempre:
- Lista productos + precios
- Costo delivery si aplica
- TOTAL FINAL
- "Listo en ~20 minutos 🕐"
- "¡Pedido recibido! Lo estamos preparando 🍔🔥"`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 250,
    system: systemPrompt,
    messages: [...historial, { role: "user", content: mensajeCliente }],
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
    protocolTimeout: 180000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--single-process",
    ],
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
    const texto = (msg.body || "").trim();
    if (!texto) return;

    // Evitar procesar el mismo mensaje dos veces
    if (procesando.has(numero)) return;
    procesando.add(numero);

    console.log(`📩 ${numero}: ${texto}`);

    try {
      if (!estaAbierto()) {
        await msg.reply(`⏰ *La Felicitta* está cerrada ahora.\n🕐 Horario: 08:30–00:00 todos los días\n📍 Barros Arana 504, Iquique`);
        return;
      }

      const respuesta = await responderConIA(numero, texto);
      await msg.reply(respuesta);
      console.log(`✅ Respuesta enviada`);

    } finally {
      procesando.delete(numero);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    procesando.delete(msg.from);
    try {
      await msg.reply(`Hola! Somos *La Felicitta* 🍔\nEscríbenos en un momento, te atendemos altiro.\n📍 Barros Arana 504 · 08:30–00:00`);
    } catch (e) {}
  }
});

console.log("🚀 Iniciando bot La Felicitta...");
client.initialize();
