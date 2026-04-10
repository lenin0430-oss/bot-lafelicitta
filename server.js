const express = require("express");
const QRCode = require("qrcode");
const app = express();
const PORT = process.env.PORT || 3000;

// Estado global del bot
let qrActual = null;
let estadoBot = "iniciando";
let horaUltimoQR = null;

// Exportar funciones para que bot.js las use
global.actualizarQR = (qr) => {
  qrActual = qr;
  horaUltimoQR = new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago" });
  estadoBot = "esperando_qr";
  console.log("📱 Nuevo QR disponible en /qr");
};

global.actualizarEstado = (estado) => {
  estadoBot = estado;
  if (estado === "listo") qrActual = null;
};

// ─── Página principal ─────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  const escanearHTML =
    qrActual
      ? `<p style="color:#f59e0b;font-weight:600">📱 Bot esperando escaneo de QR</p>
         <a href="/qr" target="_blank" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
           Ver QR para escanear →
         </a>`
      : estadoBot === "listo"
        ? `<p style="color:#10b981;font-weight:600">✅ Bot conectado y activo</p>`
        : `<p style="color:#6b7280">⏳ ${estadoBot}...</p>`;

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>La Felicitta Bot</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #1e293b; border-radius: 16px; padding: 40px; text-align: center; max-width: 400px; width: 90%; }
        h1 { font-size: 24px; margin: 0 0 8px; color: #f1f5f9; }
        .sub { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
        .badge { display: inline-block; background: #0f172a; border-radius: 8px; padding: 12px 20px; font-size: 13px; color: #64748b; margin-top: 20px; }
      </style>
      <meta http-equiv="refresh" content="10">
    </head>
    <body>
      <div class="card">
        <h1>🍔 La Felicitta Bot</h1>
        <p class="sub">Sistema de pedidos WhatsApp</p>
        ${escanearHTML}
        <div class="badge">Estado: ${estadoBot} ${horaUltimoQR ? `· QR generado ${horaUltimoQR}` : ""}</div>
      </div>
    </body>
    </html>
  `);
});

// ─── Endpoint QR como imagen ──────────────────────────────────────────────────
app.get("/qr", async (req, res) => {
  if (!qrActual) {
    return res.status(404).send(`
      <!DOCTYPE html><html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
        <div>
          <p style="font-size:20px">${estadoBot === "listo" ? "✅ Bot ya está conectado" : "⏳ QR no disponible aún"}</p>
          <p style="color:#94a3b8;font-size:14px">Vuelve a <a href="/" style="color:#10b981">la página principal</a></p>
        </div>
      </body></html>
    `);
  }

  try {
    const qrImg = await QRCode.toBuffer(qrActual, {
      type: "png",
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-cache");
    res.send(qrImg);
  } catch (err) {
    console.error("Error generando QR:", err);
    res.status(500).send("Error generando QR");
  }
});

// ─── Estado del bot (para monitoreo) ─────────────────────────────────────────
app.get("/status", (req, res) => {
  res.json({
    estado: estadoBot,
    qrDisponible: !!qrActual,
    horaUltimoQR,
    timestamp: new Date().toISOString(),
  });
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Servidor web en puerto ${PORT}`);
  console.log(`🔗 Abre la URL de Railway para ver el QR`);
});

// Iniciar el bot después del servidor
require("./bot");
