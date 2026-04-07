// ══════════════════════════════════════════════
// IMPORTAR HERRAMIENTAS
// ══════════════════════════════════════════════

const express = require('express')
const axios = require('axios')
require('dotenv').config()

const app = express()
app.use(express.json())

// Servir la página web de pago (HTML) desde la carpeta public
app.use(express.static('public'))


// ══════════════════════════════════════════════
// VARIABLES IMPORTANTES
// ══════════════════════════════════════════════

// URL oficial de la Open API de HeyCharge
const HEYCHARGE_URL = 'https://openapi.heycharge.global'

// IMEI de tu estación física
const STATION_ID = 'DCHEYS2603000893'

// Tu API key (viene del .env para mantenerla segura)
const API_KEY = process.env.HEYCHARGE_API_KEY

// Headers que usa HeyCharge para autenticación
const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json'
}


// ══════════════════════════════════════════════
// RUTA 0 — VERIFICAR QUE EL SERVIDOR FUNCIONA
// ══════════════════════════════════════════════

app.get('/', (req, res) => {
  res.sendFile('public/cargaya-pago.html', { root: '.' })
})


// ══════════════════════════════════════════════
// RUTA 1 — VER TU ESTACIÓN Y BATERÍAS
// ══════════════════════════════════════════════

app.get('/api/estacion', async (req, res) => {
  try {
    const response = await axios.get(
      `${HEYCHARGE_URL}/v1/station/${STATION_ID}`,
      { headers }
    )
    res.json(response.data)
  } catch (error) {
    console.error('❌ Error al obtener estación:', error.response?.data || error.message)
    res.status(500).json({
      error: error.message,
      detalle: error.response?.data || 'Sin detalles'
    })
  }
})


// ══════════════════════════════════════════════
// RUTA 2 — VER TODAS LAS BATERÍAS DISPONIBLES
// ══════════════════════════════════════════════

app.get('/api/baterias', async (req, res) => {
  try {
    const response = await axios.get(
      `${HEYCHARGE_URL}/v1/station/${STATION_ID}/batteries`,
      { headers }
    )
    res.json(response.data)
  } catch (error) {
    console.error('❌ Error al obtener baterías:', error.response?.data || error.message)
    res.status(500).json({
      error: error.message,
      detalle: error.response?.data || 'Sin detalles'
    })
  }
})


// ══════════════════════════════════════════════
// RUTA 3 — LIBERAR UNA BATERÍA (cuando el cliente paga)
// ══════════════════════════════════════════════

// El flujo es:
// 1. Cliente paga con Yape/Plin/Tarjeta
// 2. Culqi confirma el pago a este endpoint
// 3. Tu backend le dice a HeyCharge que libere la batería
// 4. La estación expulsa el power bank físicamente

app.post('/api/liberar', async (req, res) => {
  try {
    const { slot_id } = req.body

    if (!slot_id) {
      return res.status(400).json({ error: 'Falta slot_id' })
    }

    const response = await axios.post(
      `${HEYCHARGE_URL}/v1/station/${STATION_ID}/borrow`,
      { slot: slot_id },
      { headers }
    )

    console.log(`✅ Batería liberada del slot ${slot_id}`)
    res.json(response.data)

  } catch (error) {
    console.error('❌ Error al liberar batería:', error.response?.data || error.message)
    res.status(500).json({
      error: error.message,
      detalle: error.response?.data || 'Sin detalles'
    })
  }
})


// ══════════════════════════════════════════════
// WEBHOOK 1 — ESTACIÓN SE CONECTA A INTERNET
// ══════════════════════════════════════════════

// HeyCharge llama automáticamente a esta ruta
// cuando tu estación enciende y se conecta al WiFi

app.post('/webhook/register', (req, res) => {
  console.log('📡 WEBHOOK - Estación conectada:', req.body)

  const { imei, batteries } = req.body

  console.log(`✅ Estación online: ${imei}`)
  if (batteries) {
    console.log(`🔋 Baterías disponibles: ${batteries.length}`)
  }

  res.json({ code: 0, message: 'success' })
})


// ══════════════════════════════════════════════
// WEBHOOK 2 — USUARIO DEVUELVE BATERÍA
// ══════════════════════════════════════════════

// HeyCharge llama automáticamente cuando alguien
// devuelve el power bank a cualquier estación CargaYa

app.post('/webhook/return', (req, res) => {
  console.log('↩️ WEBHOOK - Batería devuelta:', req.body)

  const { imei, battery_id, slot_id, battery_capacity } = req.body

  console.log(`🔋 Batería ${battery_id} devuelta al slot ${slot_id}`)
  console.log(`⚡ Nivel de carga al devolver: ${battery_capacity}%`)

  // TODO: aquí irá la lógica de cobro con Culqi/Yape/Plin

  res.json({ code: 0, message: 'success' })
})


// ══════════════════════════════════════════════
// WEBHOOK 3 — ESTACIÓN SE DESCONECTA
// ══════════════════════════════════════════════

app.post('/webhook/status', (req, res) => {
  console.log('📡 WEBHOOK - Cambio de estado:', req.body)

  const { imei, status } = req.body

  if (status === '0') {
    console.log(`⚠️ ALERTA: Estación ${imei} se desconectó!`)
    // TODO: enviar alerta por WhatsApp
  } else {
    console.log(`✅ Estación ${imei} volvió a conectarse`)
  }

  res.json({ code: 0, message: 'success' })
})


// ══════════════════════════════════════════════
// ARRANCAR EL SERVIDOR
// ══════════════════════════════════════════════

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`✅ CargaYa backend corriendo en http://localhost:${PORT}`)
  console.log(`🔑 API Key: ${API_KEY ? API_KEY.substring(0, 8) + '...' : 'NO CONFIGURADA ❌'}`)
  console.log(`📡 Estación: ${STATION_ID}`)
})