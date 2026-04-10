const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const Anthropic = require("@anthropic-ai/sdk");
const pino = require("pino");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SESSION_PATH = process.env.SESSION_PATH || "./session";

function estaAbierto() {
  const ahora = new Date().toLocaleString("en-US", { timeZone: "America/Santiago" });
  const fecha = new Date(ahora);
  const hora = fecha.getHours();
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
La Felicitta $2.500 | Especial de Carne $4.500 | Super de Carne $5.500 | Doble $6.500 | La Pelua $7.500 | Triple $8.000

HAMBURGUESAS XL (200g + papas fritas incluidas):
La Estrella XL $6.500 | La Luna XL $7.500 | La Casa Club XL $8.500 | La Ahumada XL $9.500

PERROS CALIENTES:
El de Luka $1.000 | Callejero $2.000 | Perro Loco $3.000 | El Chileno $3.000 | El Americano $3.000 | El Peluo $3.500 | Venezolano Premium $3.500 | Chileno Premium $3.500 | Americano Premium $3.990 | BBQ Premium $3.990

COMPLETOS (incluyen papas fritas):
As Normal $3.000/XL $5.500 | Italiano Normal $2.000/XL $3.500 | Churrasco Italiano $4.500 | Churrasco Super $5.000 | Barros Luco $4.500 | Churrasco Mechada $5.000 | Chacarero $5.000

AREPAS VENEZOLANAS: $2.500 (con 5 ingredientes a elección: carne mechada, pollo, salchicha, jamón, pernil, perico, caraotas, queso gouda, huevo, tajadas, choclo, etc.)

CACHAPAS:
Sencilla $5.000 | Especial $6.000 | Ahumada $7.000 | Cochino Frito $7.500 | Queso de Mano $7.000 | Especial Queso Mano $7.500 | Chuleta Queso $9.000 | Cachapa Cochino $10.000

ARROZ CHINO VENEZOLANO:
Promo $4.500 | Cerdo-Pollo $8.000 | Cerdo-Camarón $10.000 | La Felicitta Especial $12.000

PEPITOS (pan orégano + papas hilo):
Pollo 15cm $6.000 | Carne 15cm $7.000 | Mixto 15cm $9.000 | Mixto 30cm BESTIA $14.990

PATACONES:
Normal $7.000 | Especial $8.500 | 3 Quesos $11.000 | Mixto TOP $12.000

PAPAS Y ACOMPAÑAMIENTOS:
Papas Normal $3.500/XL $5.500 | Bacon&Cheddar $4.500/XL $7.500 | Salchipapas $3.800/XL $6.300 | Nuggets 6u $2.500/12u $4.800

EMPANADAS: Carne Mechada $2.500 | Pollo $2.000 | Molida $2.000 | Jamón Queso $2.000 | Pabellón $3.000 | Perico Queso $2.500 | Queso $2.000

TEQUEÑOS: Queso 25cm $2.000 | Jamón Queso 25cm $2.500 | 4u $2.500 | 8u $4.600 | 12u $6.990

BEBIDAS:
Coca-Cola/Sprite/Fanta 500cc $1.200 | Bebida 1.5L $2.000 | Jugo Naranja $1.800 | Jugo Mango/Maracuyá $2.000 | Jugo Piña $1.800 | Agua $800/$900 | Café $800 | Café con Leche $1.000 | Té $800 | Chocolate $1.200

CÓMO TOMAR EL PEDIDO:
1. Ayuda al cliente a elegir con precios
2. Confirma platos, cantidades y calcula el TOTAL
3. Pregunta retiro o delivery (si delivery, pedir dirección)
4. Pide nombre del cliente
5. Confirma método de pago
6. Muestra resumen con TOTAL y di "¡Pedido recibido! El equipo de La Felicitta lo está preparando 🍔"

REGLAS:
- Responde en español, amable y breve (máximo 4 líneas)
- SIEMPRE incluye precios cuando menciones productos
- Calcula el total cuando el cliente confirme su pedido
- Sugiere combos o adicionales naturalmente
- Nunca digas que no sabes los precios`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: systemPrompt,
    messages: [...historial, { role: "user", content: mensajeCliente }],
  });

  const respuesta = response.content[0].text;
  agregarMensaje(numero, "user", mensajeCliente);
  agregarMensaje(numero, "assistant", respuesta);
  return respuesta;
}

let sock;

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["La Felicitta Bot", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("📱 QR generado");
      if (global.actualizarQR) global.actualizarQR(qr);
    }
    if (connection === "open") {
      console.log("✅ Bot conectado a WhatsApp");
      if (global.actualizarEstado) global.actualizarEstado("listo");
    }
    if (connection === "close") {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const reconectar = codigo !== DisconnectReason.loggedOut;
      console.log(`⚠️ Desconectado (${codigo}) — ${reconectar ? "reconectando..." : "sesión cerrada"}`);
      if (global.actualizarEstado) global.actualizarEstado("desconectado");
      if (reconectar) setTimeout(conectar, 5000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    if (from.includes("@g.us")) return;

    const texto = msg.message.conversation || 
                  msg.message.extendedTextMessage?.text || "";
    if (!texto) return;

    console.log(`📩 ${from}: ${texto}`);

    try {
      if (!estaAbierto()) {
        await sock.sendMessage(from, { 
          text: `⏰ Hola! *La Felicitta* está cerrada ahora.\n\n🕐 Horario: todos los días 08:30 – 00:00\n📍 Barros Arana 504, Iquique` 
        });
        return;
      }

      const respuesta = await responderConIA(from, texto);
      await sock.sendMessage(from, { text: respuesta });
      console.log("✅ Respuesta enviada");

    } catch (error) {
      console.error("❌ Error:", error.message);
      try {
        await sock.sendMessage(from, { 
          text: `Hola! Somos *La Felicitta* 🍔\nEstamos atendiendo tu pedido, escríbenos en un momento.\n📍 Barros Arana 504 · 08:30–00:00` 
        });
      } catch(e) {}
    }
  });
}

console.log("🚀 Iniciando bot Baileys con IA Claude...");
conectar();

module.exports = { getSocket: () => sock };
