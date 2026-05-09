require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const ULTRAMSG_INSTANCE = process.env.ULTRAMSG_INSTANCE;
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const conversaciones = {};

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
  return 'Eres el asistente virtual de La Felicitta, restaurante venezolano-chileno en Barros Arana 504, Iquique. Respondes por WhatsApp de forma calida y natural como empleado del restaurante. HORARIO: Lun-Mar-Jue-Vie-Sab-Dom 8:30am-00:00. Miercoles CERRADO. MENU: Hamburguesas: La Felicitta $3500, Especial Carne $5000, Super Carne $6000, Doble $7500, La Pelua $8500, Triple $9990. XL200g: Estrella XL $7500, Luna XL $7500, Casa Club XL $9500. Perros: Luka $1000, Callejero $2500, Perro Loco $3500, Chileno $3500, Americano $3990, Peluo $3990. Completos: As Normal $3500, As XL $6500, Italiano Normal $2500, Italiano XL $4500, Churrasco Italiano $5000, Churrasco Super $5500, Barros Luco $5000, Churrasco Mechada $6000, Chacarero $6000. Arepas 5 ingredientes $3500. Cachapas: Queso Llanero $6500, Cochino Frito $8500, Queso de Mano $7500, Cochino+Queso $10000. Arroz Chino: Salteado $4500, Pollo+Arroz+Papas $4990, Cerdo-Pollo $8000, Cerdo-Camaron $10000, Arroz La Felicitta $12000. Pepitos: Pollo $7500, Carne $8500, Mixto $9500, BESTIA 30cm $14990. Patacones: Normal $7500, Especial $8500, Mixto TOP $12000. Papas: Normal $3500, XL $6500, Bacon Cheddar $5500, XL $9990, Salchipapas $4500, XL $7990, Nuggets 6u $4000, 12u $7500. Empanadas: Carne Mechada $3000, Pollo $2500, Molida $2500, Jamon Queso $2500, Pabellon $3000, Caraota Queso $2500, Perico Queso $2500, Queso $2500. Tequenos 25cm $2500. Tequenos 8cm: 4u $2600, 8u $4900, 12u $6900. PASAPALOS (1-2 dias anticipacion + 50porciento deposito): Mini Tequenos 50u $13500, 100u $24300, Mix1 50u $14500, Mix2 75u $23900, Mix3 100u $26500, Mix4 100u $31900, Mix5 100u $32900, Mix Full 200u $63900. CHURROS: 8u azucar $4500, 14u $6500, 8u+2salsas $5500, 14u+2salsas $6500, 20u+2salsas $7500. Salsas: Manjar, Chocolate, Leche Condensada, Azucar. SIEMPRE pedir 2 salsas si no las dice. Bebidas: CocaCola $1500, Lata $1300, Sprite $1500, Fanta $1500, 1.5L $2500, KR $1000. Jugos $3000, Kris $1000. Agua $1300. Cafe $1500, Cafe Leche $2000, Te $1500, Chocolate $2500. DELIVERY: Tadeo $2500, Tadeo-Padre Hurtado $3000, Padre Hurtado-Reinamar $3500, Bajo Muelle $4000, Zofri $3000, Valle Verde $3000, Luis Jaspard $3000, Laguna Verde $3000, Lonzana $3000. PAGO: Mercado Pago ID 1059389577, BancoEstado CuentaRUT Lenin Rodriguez RUT 779823431 cuenta 1093647440 Ventas@lafelicittacl.com. MENU: menu-lafelicitta.vercel.app. ' + (domingo ? 'HOY DOMINGO: Parrilla y Sancocho disponibles.' : 'Parrilla/Sancocho solo domingos.') + ' REGLAS: Pasapalos requieren anticipacion y deposito. Churros siempre pedir 2 salsas exactas. No inventar precios. Tono calido venezolano.';
}

async function enviarMensaje(to, body) {
  try {
    await axios.post('https://api.ultramsg.com/' + ULTRAMSG_INSTANCE + '/messages/chat', {
      token: ULTRAMSG_TOKEN, to, body
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

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const data = req.body;
  if (!data || data.type !== 'chat') return;
  if (data.fromMe) return;
  const numero = data.from;
  const texto = data.body ? data.body.trim() : '';
  if (!texto) return;
  console.log('Mensaje de ' + numero + ': ' + texto);
  try {
    if (!estaAbierto()) {
      await enviarMensaje(numero, 'Hola! Por el momento estamos cerrados. Horario: 8:30am a 12am, lunes a martes y jueves a domingo. Miercoles descansamos. Te esperamos!');
      return;
    }
    const respuesta = await llamarClaude(numero, texto);
    await enviarMensaje(numero, respuesta);
  } catch (err) {
    console.error('Error:', err.message);
  }
});

app.get('/', (req, res) => res.send('Bot La Felicitta activo'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Bot corriendo en puerto ' + PORT));
