const { Client, LocalAuth } = require("whatsapp-web.js");

const MENU = "https://menu-lafelicitta.vercel.app";

// ─── Horario del restaurante (hora Chile) ─────────────────────────────────────
function estaAbierto() {
  const ahora = new Date().toLocaleString("en-US", { timeZone: "America/Santiago" });
  const fecha = new Date(ahora);
  const hora = fecha.getHours();
  const dia = fecha.getDay(); // 0=domingo, 1=lunes...

  // Lunes cerrado, resto 12:00–22:00
  if (dia === 1) return false;
  return hora >= 12 && hora < 22;
}

// ─── Cliente WhatsApp ─────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.SESSION_PATH || "./.wwebjs_auth",
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

// ─── Eventos del cliente ──────────────────────────────────────────────────────
client.on("qr", (qr) => {
  console.log("📱 QR generado — abre la URL de Railway para escanearlo");
  // Actualizar la página web con el QR
  if (global.actualizarQR) global.actualizarQR(qr);
});

client.on("ready", () => {
  console.log("✅ Bot listo y conectado a WhatsApp");
  if (global.actualizarEstado) global.actualizarEstado("listo");
});

client.on("authenticated", () => {
  console.log("✅ WhatsApp autenticado");
  if (global.actualizarEstado) global.actualizarEstado("autenticado");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Error de autenticación:", msg);
  if (global.actualizarEstado) global.actualizarEstado("error_auth");
});

client.on("disconnected", (reason) => {
  console.log("⚠️ Bot desconectado:", reason);
  if (global.actualizarEstado) global.actualizarEstado("desconectado");
});

// ─── Manejo de mensajes ───────────────────────────────────────────────────────
client.on("message", async (msg) => {
  try {
    if (msg.fromMe) return;
    if (msg.from.includes("@g.us")) return; // Ignorar grupos

    const texto = (msg.body || "").toLowerCase().trim();

    // ── Restaurante cerrado ──────────────────────────────────────────────────
    if (!estaAbierto()) {
      await msg.reply(`⏰ Hola! En este momento *La Felicitta* está cerrada.

🕐 Horario:
• Martes a domingo: 12:00 – 22:00
• Lunes: cerrado

Te esperamos pronto 🍔🔥`);
      return;
    }

    // ── Saludo / bienvenida ──────────────────────────────────────────────────
    if (
      texto.includes("hola") ||
      texto.includes("buenas") ||
      texto.includes("buenos días") ||
      texto.includes("buenos dias") ||
      texto.includes("buenas tardes") ||
      texto.includes("buenas noches") ||
      texto.includes("info") ||
      texto === "hi" ||
      texto === "hey"
    ) {
      await msg.reply(`👋 ¡Bienvenido a *La Felicitta*! 🍔🔥

Para hacer tu pedido tienes 2 opciones:

1️⃣ *Ver menú completo aquí:*
${MENU}

2️⃣ *Escribirme directo así:*
"2 hamburguesas + 1 bebida"

📍 Barros Arana 504, Iquique
💳 Transferencia · Efectivo · Tarjetas (local)

Escríbeme tu pedido y te ayudo 👇`);
      return;
    }

    // ── Menú ─────────────────────────────────────────────────────────────────
    if (texto.includes("menu") || texto.includes("menú") || texto.includes("carta")) {
      await msg.reply(`📋 *Menú La Felicitta:*
${MENU}

Escríbeme qué quieres pedir y te ayudo 👇`);
      return;
    }

    // ── Ubicación ────────────────────────────────────────────────────────────
    if (
      texto.includes("direccion") ||
      texto.includes("dirección") ||
      texto.includes("ubicacion") ||
      texto.includes("ubicación") ||
      texto.includes("donde") ||
      texto.includes("dónde")
    ) {
      await msg.reply(`📍 *Estamos en:*
Barros Arana 504, Iquique

🕐 Martes a domingo: 12:00 – 22:00`);
      return;
    }

    // ── Pagos ─────────────────────────────────────────────────────────────────
    if (texto.includes("pago") || texto.includes("pagos") || texto.includes("precio") || texto.includes("transferencia")) {
      await msg.reply(`💳 *Medios de pago:*
• Transferencia bancaria
• Efectivo
• Tarjetas (solo en local)

¿Te ayudo con tu pedido? 🍔`);
      return;
    }

    // ── Delivery / retiro ─────────────────────────────────────────────────────
    if (texto.includes("delivery") || texto.includes("domicilio") || texto.includes("despacho") || texto.includes("retiro")) {
      await msg.reply(`🛵 *Opciones de entrega:*
• Retiro en local: Barros Arana 504
• Delivery: disponible según zona

¿Cuál prefieres? Cuéntame tu dirección si es delivery 📍`);
      return;
    }

    // ── Detección de pedido ───────────────────────────────────────────────────
    const palabrasPedido = [
      "hamburguesa", "burger", "perro", "hot dog", "arepa", "cachapa",
      "bebida", "papas", "arroz", "combo", "quiero", "pedido",
      "pedir", "orden", "dame", "tráeme", "traeme", "me pones",
      "sancocho", "parrilla", "churrasco",
    ];

    if (palabrasPedido.some((p) => texto.includes(p))) {
      await msg.reply(`🔥 *¡Perfecto! Ya vi tu pedido.*

Para confirmarlo necesito:

1️⃣ Nombre completo
2️⃣ ¿Retiro en local o delivery?
   (si es delivery, tu dirección)
3️⃣ Método de pago

Y te confirmamos altiro 👌`);
      return;
    }

    // ── Horarios ──────────────────────────────────────────────────────────────
    if (texto.includes("horario") || texto.includes("hora") || texto.includes("abierto") || texto.includes("abren")) {
      await msg.reply(`🕐 *Horario La Felicitta:*
• Lunes a domingo: 08:00 – 00:00

¡Estamos abiertos ahora! 🍔`);
      return;
    }

    // ── Respuesta por defecto ─────────────────────────────────────────────────
    await msg.reply(`👋 ¡Hola! Soy el bot de *La Felicitta* 🍔🔥

Puedo ayudarte con:
• 📋 Ver el *menú*
• 📍 Nuestra *ubicación*
• 💳 Medios de *pago*
• 🛵 Info de *delivery*
• 🛒 Hacer tu *pedido*

¿Qué necesitas? 👇`);
  } catch (error) {
    console.error("❌ Error al responder mensaje:", error);
  }
});

// ─── Inicializar ──────────────────────────────────────────────────────────────
console.log("🚀 Iniciando bot...");
client.initialize();
