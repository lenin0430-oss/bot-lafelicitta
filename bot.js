require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const conversaciones = {};
const pedidosGuardados = {};

function estaAbierto() {
  const ahora = new Date();
  const offsetChile = -4 * 60;
  const utcMin = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  const localMin = ((utcMin + offsetChile) % 1440 + 1440) % 1440;
  const hora = Math.floor(localMin / 60);
  const minuto = localMin % 60;
  const dia = ((ahora.getUTCDay() + Math.floor((utcMin + offsetChile) / 1440) % 7) + 7) % 7;
  if (dia === 3) return false;
  const min = hora * 60 + minuto;
  return min >= 510 && min < 1440;
}

function esDomingo() {
  const ahora = new Date();
  const offsetChile = -4 * 60;
  const utcMin = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  const localMin = ((utcMin + offsetChile) % 1440 + 1440) % 1440;
  const dia = ((ahora.getUTCDay() + Math.floor((utcMin + offsetChile) / 1440) % 7) + 7) % 7;
  const hora = Math.floor(localMin / 60);
  return dia === 0 && hora >= 8;
}

function getSystemPrompt() {
  const domingo = esDomingo();
  return 'Eres el asistente virtual de La Felicitta, restaurante venezolano-chileno en Barros Arana 504, Iquique. Respondes por WhatsApp de forma calida y natural como empleado del restaurante. HORARIO: Lun-Mar-Jue-Vie-Sab-Dom 8:30am-00:00. Miercoles CERRADO. MENU: Hamburguesas: La Felicitta $3500, Especial Carne $5000, Super Carne $6000, Doble $7500, La Pelua $8500, Triple $9990. XL200g: Estrella XL $7500, Luna XL $7500, Casa Club XL $9500. Perros: Luka $1000, Callejero $2500, Perro Loco $3500, Chileno $3500, Americano $3990, Peluo $3990. Completos: As Normal $3500, As XL $6500, Italiano Normal $2500, Italiano XL $4500, Churrasco Italiano $5000, Churrasco Super $5500, Barros Luco $5000, Churrasco Mechada $6000, Chacarero $6000. Arepas 5 ingredientes $3500. Cachapas: Queso Llanero $6500, Cochino Frito $8500, Queso de Mano $7500, Cochino+Queso $10000. Arroz Chino: Salteado $4500, Pollo+Arroz+Papas $4990, Cerdo-Pollo $8000, Cerdo-Camaron $10000, Arroz La Felicitta $12000. Pepitos: Pollo $7500, Carne $8500, Mixto $9500, BESTIA 30cm $14990. Patacones: Normal $7500, Especial $8500, Mixto TOP $12000. Papas: Normal $3500, XL $6500, Bacon Cheddar $5500, XL $9990, Salchipapas $4500, XL $7990, Nuggets 6u $4000, 12u $7500. Empanadas: Carne Mechada $3000, Pollo $2500, Molida $2500, Jamon Queso $2500, Pabellon $3000, Caraota Queso $2500, Perico Queso $2500, Queso $2500. Tequenos 25cm $2500. Tequenos 8cm: 4u $2600, 8u $4900, 12u $6900. PASAPALOS (1-2 dias anticipacion + 50porciento deposito): Mini Tequenos 50u $13500, 100u $24300, Mix1 50u $14500, Mix2 75u $23900, Mix3 100u $26500, Mix4 100u $31900, Mix5 100u $32900, Mix Full 200u $63900. CHURROS: 8u azucar $4500, 14u $6500, 8u+2salsas $5500, 14u+2salsas $6500, 20u+2salsas $7500. Salsas: Manjar, Chocolate, Leche Condensada, Azucar. SIEMPRE pedir 2 salsas si no las dice. Bebidas: CocaCola $1500, Lata $1300, Sprite $1500, Fanta $1500, 1.5L $2500, KR $1000. Jugos $3000, Kris $1000. Agua $1300. Cafe $1500, Cafe Leche $2000, Te $1500, Chocolate $2500. DELIVERY: Tadeo $2500, Tadeo-Padre Hurtado $3000, Padre Hurtado-Reinamar $3500, Bajo Muelle $4000, Zofri $3000, Valle Verde $3000, Luis Jaspard $3000, Laguna Verde $3000, Lonzana $3000. PAGO: Mercado Pago disponible, transferencia, debito, credito y efectivo. MENU: menu-lafelicitta.vercel.app. ' + (domingo ? 'HOY DOMINGO: Parrilla y Sancocho disponibles.' : 'Parrilla/Sancocho solo domingos.') + ' REGLAS: Pasapalos requieren anticipacion y deposito. Churros siempre pedir 2 salsas exactas. No inventar precios. Antes de cerrar un pedido confirma: productos, cantidades, direccion si es delivery, metodo de pago y total. Cuando el cliente confirme, responde que el pedido fue tomado y que se enviara a cocina. Tono calido venezolano.';
}

async function enviarMensaje(phone, message) {
  try {
    await axios.post('https://api.z-api.io/instances/' + ZAPI_INSTANCE + '/token/' + ZAPI_TOKEN + '/send-text', {
      phone,
      message
    });
  } catch (err) {
    console.error('Error enviando:', err.message);
  }
}

async function llamarClaude(numero, mensajeUsuario) {
  if (!conversaciones[numero]) conversaciones[numero] = [];
  conversaciones[numero].push({ role: 'user', content: mensajeUsuario });
  if (conversaciones[numero].length > 20) conversaciones[numero] = conversaciones[numero].slice(-20);
  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: getSystemPrompt(),
    messages: conversaciones[numero]
  }, {
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });
  const respuesta = response.data.content[0].text;
  conversaciones[numero].push({ role: 'assistant', content: respuesta });
  return respuesta;
}

function limpiarJson(texto) {
  if (!texto) return null;
  const limpio = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio === -1 || fin === -1) return null;
  return limpio.slice(inicio, fin + 1);
}

function debeIntentarGuardarPedido(textoCliente, respuestaBot) {
  const combinado = `${textoCliente || ''} ${respuestaBot || ''}`.toLowerCase();
  const palabrasConfirmacion = ['confirmo', 'confirmar', 'dale', 'listo', 'ok', 'sí', 'si', 'pago', 'transferi', 'transferí', 'efectivo', 'debito', 'débito', 'direccion', 'dirección', 'delivery', 'envialo', 'envíalo'];
  return palabrasConfirmacion.some(p => combinado.includes(p));
}

async function extraerPedidoConfirmado(numero) {
  const historial = (conversaciones[numero] || [])
    .map(m => `${m.role === 'user' ? 'CLIENTE' : 'BOT'}: ${m.content}`)
    .join('\n');

  const system = `Eres un extractor de pedidos para un restaurante. Devuelve SOLO JSON valido, sin markdown.
Schema exacto:
{
  "confirmado": boolean,
  "cliente": string,
  "telefono": string,
  "direccion": string,
  "metodo_pago": string,
  "total": number,
  "items": [{"nombre": string, "cantidad": number, "precio_unit": number, "nota": string}]
}
Reglas:
- confirmado debe ser true SOLO si el cliente ya acepto/cerró el pedido claramente.
- Si faltan productos o cantidades, confirmado false.
- Si el bot solo esta cotizando o preguntando datos, confirmado false.
- precio_unit debe ser numerico en pesos chilenos sin puntos.
- total debe ser la suma de items y delivery si fue mencionado. Si no hay delivery, solo productos.
- Si hay delivery, agrega un item llamado "Delivery" con su precio.
- telefono debe ser el numero de WhatsApp recibido.
- Si no hay direccion, usa "Retiro en local" si el pedido es para retirar. Si no se sabe, string vacio.
- No inventes productos.`;

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system,
    messages: [{ role: 'user', content: `Telefono WhatsApp: ${numero}\n\nHistorial:\n${historial}` }]
  }, {
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });

  const texto = response.data.content[0].text;
  const json = limpiarJson(texto);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (err) {
    console.error('No se pudo parsear pedido:', err.message, texto);
    return null;
  }
}

function normalizarPedido(pedido, numero) {
  const items = Array.isArray(pedido.items) ? pedido.items : [];
  const itemsLimpios = items
    .filter(i => i && i.nombre && Number(i.cantidad) > 0)
    .map(i => ({
      nombre: String(i.nombre).trim(),
      cantidad: Number(i.cantidad) || 1,
      precio_unit: Number(i.precio_unit) || 0,
      nota: i.nota ? String(i.nota).trim() : ''
    }));

  const totalCalculado = itemsLimpios.reduce((s, i) => s + (i.precio_unit * i.cantidad), 0);
  return {
    confirmado: !!pedido.confirmado,
    cliente: pedido.cliente ? String(pedido.cliente).trim() : 'Cliente WhatsApp',
    telefono: pedido.telefono ? String(pedido.telefono).trim() : String(numero),
    direccion: pedido.direccion ? String(pedido.direccion).trim() : '',
    metodo_pago: pedido.metodo_pago ? String(pedido.metodo_pago).trim() : 'Por confirmar',
    total: Number(pedido.total) || totalCalculado,
    items: itemsLimpios
  };
}

async function obtenerSiguienteNumeroVenta() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Date.now();
  try {
    const { data } = await axios.get(`${SUPABASE_URL}/rest/v1/ventas?select=numero&order=numero.desc&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });
    const ultimo = Array.isArray(data) && data[0] && data[0].numero ? Number(data[0].numero) : 0;
    return ultimo + 1;
  } catch (err) {
    console.error('No se pudo obtener numero de venta:', err.response?.data || err.message);
    return Date.now();
  }
}

async function guardarPedidoEnPOS(numero, pedidoExtraido) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('Supabase no configurado. Faltan SUPABASE_URL y SUPABASE_KEY/SUPABASE_ANON_KEY.');
    return false;
  }

  const pedido = normalizarPedido(pedidoExtraido, numero);
  if (!pedido.confirmado || pedido.items.length === 0 || pedido.total <= 0) return false;

  const hash = JSON.stringify({ items: pedido.items, total: pedido.total, direccion: pedido.direccion, metodo_pago: pedido.metodo_pago });
  if (pedidosGuardados[numero] === hash) return false;

  const ventaNumero = await obtenerSiguienteNumeroVenta();
  const mesa = pedido.direccion && pedido.direccion.toLowerCase() !== 'retiro en local' ? 'Delivery WhatsApp' : 'Retiro WhatsApp';
  const notaCliente = `Cliente: ${pedido.cliente} | Tel: ${pedido.telefono}${pedido.direccion ? ' | Dir: ' + pedido.direccion : ''}`;

  const venta = {
    numero: ventaNumero,
    mesa,
    mesero: 'Bot WhatsApp',
    personas: 1,
    metodo_pago: `WhatsApp - ${pedido.metodo_pago}`,
    total: pedido.total,
    items: pedido.items.map((i, idx) => ({
      nombre: i.nombre,
      cantidad: i.cantidad,
      precio_unit: i.precio_unit,
      nota: idx === 0 ? [notaCliente, i.nota].filter(Boolean).join(' | ') : i.nota
    })),
    estado: 'pendiente',
    created_at: new Date().toISOString()
  };

  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/ventas`, venta, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }
    });
    pedidosGuardados[numero] = hash;
    console.log('Pedido WhatsApp guardado en POS:', ventaNumero, numero);
    return true;
  } catch (err) {
    console.error('Error guardando pedido en POS:', err.response?.data || err.message);
    return false;
  }
}

async function intentarGuardarPedidoWhatsApp(numero, textoCliente, respuestaBot) {
  try {
    if (!debeIntentarGuardarPedido(textoCliente, respuestaBot)) return;
    const pedido = await extraerPedidoConfirmado(numero);
    if (!pedido || !pedido.confirmado) return;
    await guardarPedidoEnPOS(numero, pedido);
  } catch (err) {
    console.error('Error procesando pedido WhatsApp:', err.message);
  }
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const data = req.body;
  if (!data) return;
  if (data.fromMe) return;
  if (data.isGroup) return;
  const numero = data.phone;
  const texto = data.text ? data.text.message : '';
  if (!texto || !numero) return;
  console.log('Mensaje de ' + numero + ': ' + texto);
  try {
    if (!estaAbierto()) {
      await enviarMensaje(numero, 'Hola! Por el momento estamos cerrados. Horario: 8:30am a 12am, lunes a martes y jueves a domingo. Miercoles descansamos. Te esperamos!');
      return;
    }
    const respuesta = await llamarClaude(numero, texto);
    await enviarMensaje(numero, respuesta);
    await intentarGuardarPedidoWhatsApp(numero, texto, respuesta);
  } catch (err) {
    console.error('Error:', err.message);
  }
});

app.get('/', (req, res) => res.send('Bot La Felicitta activo'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Bot corriendo en puerto ' + PORT));
