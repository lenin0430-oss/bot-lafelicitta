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
  return hora >= 8 && hora < 24;
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

  const systemPrompt = `Eres el asistente de pedidos de *La Felicitta*, restaurante venezolano-chileno en Iquique.

DATOS:
- Dirección: Barros Arana 504, Iquique
- Horario: todos los días 08:30 – 00:00
- Teléfono: +56 9 63376893
- Pagos: transferencia, efectivo, tarjetas (solo local)
- Delivery disponible en Iquique

MENÚ COMPLETO CON PRECIOS:

HAMBURGUESAS (pan brioche):
- La Felicitta: $2.500
- Especial de Carne: $4.500
- Super de Carne: $5.500
- Doble: $6.500
- La Pelua: $7.500
- Triple: $8.000

HAMBURGUESAS XL (200g + papas fritas incluidas):
- La Estrella XL: $6.500
- La Luna XL: $7.500
- La Casa Club XL: $8.500
- La Ahumada XL: $9.500

PERROS CALIENTES:
- El de Luka (15cm): $1.000
- El Callejero (20cm): $2.000
- El Perro Loco (22cm): $3.000
- El Chileno (22cm): $3.000
- El Americano (22cm): $3.000
- El Peluo (22cm): $3.500
- El Venezolano Premium: $3.500
- El Chileno Premium: $3.500
- El Americano Premium: $3.990
- BBQ Premium: $3.990

COMPLETOS Y SÁNDWICHS (incluyen papas fritas):
- As Normal: $3.000 / XL: $5.500
- Italiano Normal: $2.000 / XL: $3.500
- Churrasco Italiano: $4.500
- Churrasco Super: $5.000
- Barros Luco: $4.500
- Churrasco Mechada: $5.000
- Chacarero: $5.000
- Pan molde Jamón Queso: $2.000 / Completo: $3.000

AREPAS VENEZOLANAS: $2.500 (con 5 ingredientes a elección)
Ingredientes: carne mechada, pollo mechado, salchicha, jamón, pernil, perico, carne molida, ens. gallina, caraotas, queso gouda, reina pepida, huevo frito, mariscos, tajadas, choclo, queso llanero, huevo duro

CACHAPAS 100% MAÍZ:
- Sencilla (queso llanero): $5.000
- Cachapa Especial: $6.000
- Cachapa Ahumada: $7.000
- Cochino Frito: $7.500
- Queso de Mano: $7.000
- Especial Queso Mano: $7.500
- Chuleta Queso: $9.000
- Cachapa Cochino: $10.000

ARROZ CHINO VENEZOLANO:
- Arroz Promo: $4.500
- Especial Cerdo-Pollo: $8.000
- Especial Cerdo-Camarón: $10.000
- La Felicitta Especial: $12.000

PEPITOS (pan orégano parmesano + papas hilo):
- Pepito Pollo 15cm: $6.000
- Pepito Carne 15cm: $7.000
- Pepito Mixto 15cm: $9.000
- Pepito Mixto 30cm BESTIA: $14.990

PATACONES:
- Normal: $7.000
- Especial: $8.500
- 3 Quesos: $11.000
- Mixto TOP: $12.000

PAPAS Y ACOMPAÑAMIENTOS:
- Papas Fritas Normal: $3.500 / XL: $5.500
- Bacon & Cheddar: $4.500 / XL: $7.500
- Salchipapas Normal: $3.800 / XL: $6.300
- Nuggets 6u: $2.500 / 12u: $4.800

EMPANADAS: Carne Mechada $2.500, Pollo $2.000, Molida $2.000, Jamón Queso $2.000, Pabellón $3.000, Caraota Queso $2.000, Perico Queso Llanero $2.500, Queso $2.000

TEQUEÑOS: Queso 25cm $2.000, Jamón Queso 25cm $2.500, 4u pequeños $2.500, 8u $4.600, 12u $6.990

BEBIDAS:
- Coca-Cola/Sprite/Fanta 500cc: $1.200
- Bebida 1.5L: $2.000
- Jugo Naranja: $1.800
- Jugo Mango/Maracuyá: $2.000
- Jugo Piña: $1.800
- Agua sin gas: $800 / con gas: $900
- Café Americano: $800
- Café con Leche: $1.000
- Té/Infusión: $800
- Chocolate caliente: $1.200

CÓMO TOMAR EL PEDIDO:
1. Ayuda al cliente a elegir del menú con precios
2. Confirma los platos, cantidades y calcula el total
3. Pregunta: retiro en local o delivery (si delivery, pedir dirección)
4. Pregunta nombre del cliente
5. Confirma método de pago
6. Muestra resumen final con TOTAL y di "¡Pedido recibido! El equipo de La Felicitta lo está preparando"

REGLAS:
- Siempre responde en español, amable y breve (máximo 4 líneas)
- SIEMPRE incluye precios cuando menciones productos
- Calcula el total cuando el cliente confirme su pedido
- Sugiere combos o adicionales naturalmente
- Si preguntan por algo no disponible, sugiere alternativas del menú
- Nunca digas "no tengo los precios" — siempre los tienes`;

  const mensajes = [
    ...historial,
    { role: "user", content: mensajeCliente }
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
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
    protocolTimeout: 120000,
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
      await msg.reply(`⏰ Hola! *La Felicitta* está cerrada ahora.\n\n🕐 Horario: todos los días 08:30 – 00:00\n📍 Barros Arana 504, Iquique`);
      return;
    }

    const respuesta = await responderConIA(numero, texto);
    await msg.reply(respuesta);
    console.log(`✅ Respuesta enviada`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    try {
      await msg.reply(`Hola! Somos *La Felicitta* 🍔\n\nPor favor escríbenos en un momento, estamos atendiendo tu pedido.\n\n📍 Barros Arana 504, Iquique\n🕐 08:30 – 00:00`);
    } catch (e) {}
  }
});

console.log("🚀 Iniciando bot con IA Claude + menú completo...");
client.initialize();
