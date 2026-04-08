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

// HeyCharge usa HTTP Basic Auth
// La API key va como username, sin contraseña (por eso los dos puntos al final)
const getAuthHeader = () => {
  const encoded = Buffer.from(API_KEY + ':').toString('base64')
  return {
    'Authorization': `Basic ${encoded}`,
    'Content-Type': 'application/json'
  }
}


// ══════════════════════════════════════════════
// RUTA 0 — PÁGINA DE PAGO PARA EL CLIENTE
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
      { headers: getAuthHeader() }
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

// La info de baterías viene dentro del objeto estación
app.get('/api/baterias', async (req, res) => {
  try {
    const response = await axios.get(
      `${HEYCHARGE_URL}/v1/station/${STATION_ID}`,
      { headers: getAuthHeader() }
    )

    const baterias = response.data.batteries || []
    const disponibles = baterias.filter(b => b.lock_status === '1' && b.battery_abnormal === '0')

    res.json({
      total: baterias.length,
      disponibles: disponibles.length,
      baterias: baterias
    })
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

// ✅ CORREGIDO: El endpoint correcto es POST /v1/station/:imei/borrow
//              Solo se manda slot_id (NO battery_id)
//              El battery_id llega en la RESPUESTA de HeyCharge

app.post('/api/liberar', async (req, res) => {
  try {
    const { slot_id } = req.body

    if (!slot_id) {
      return res.status(400).json({ error: 'Falta slot_id' })
    }

    const response = await axios.post(
      `${HEYCHARGE_URL}/v1/station/${STATION_ID}/borrow`,
      { slot_id },
      { headers: getAuthHeader() }
    )

    console.log(`✅ Batería liberada del slot ${slot_id}`)
    console.log(`🔋 Respuesta HeyCharge:`, response.data)

    // La respuesta incluye: battery_id, result (0=fallo, 1=éxito, 2=timeout)
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
// RUTA 4 — FORCE UNLOCK (desbloquear slot a la fuerza)
// ══════════════════════════════════════════════

// Útil si una batería se traba en el slot
// ✅ Confirmado en doc: POST /v1/station/:imei/forceUnlock con { slot_id }
app.post('/api/forzar', async (req, res) => {
  try {
    const { slot_id } = req.body

    if (!slot_id) {
      return res.status(400).json({ error: 'Falta slot_id' })
    }

    const response = await axios.post(
      `${HEYCHARGE_URL}/v1/station/${STATION_ID}/forceUnlock`,
      { slot_id },
      { headers: getAuthHeader() }
    )

    console.log(`🔓 Slot ${slot_id} desbloqueado a la fuerza`)
    res.json(response.data)

  } catch (error) {
    console.error('❌ Error al forzar unlock:', error.response?.data || error.message)
    res.status(500).json({
      error: error.message,
      detalle: error.response?.data || 'Sin detalles'
    })
  }
})


// ══════════════════════════════════════════════
// RUTA 5 — REINICIAR ESTACIÓN
// ══════════════════════════════════════════════

// Útil si la máquina se cuelga
// ✅ Confirmado en doc: POST /v1/station/:imei/reboot
app.post('/api/reiniciar', async (req, res) => {
  try {
    const response = await axios.post(
      `${HEYCHARGE_URL}/v1/station/${STATION_ID}/reboot`,
      {},
      { headers: getAuthHeader() }
    )

    console.log(`🔄 Estación reiniciada`)
    res.json(response.data)

  } catch (error) {
    console.error('❌ Error al reiniciar estación:', error.response?.data || error.message)
    res.status(500).json({
      error: error.message,
      detalle: error.response?.data || 'Sin detalles'
    })
  }
})


// ══════════════════════════════════════════════
// WEBHOOK 1 — ESTACIÓN SE CONECTA A INTERNET
// ══════════════════════════════════════════════

// HeyCharge llama a este endpoint cuando la estación se enciende/conecta
// URL configurada: https://cargaya-backend-production.up.railway.app/webhook/register

app.post('/webhook/register', (req, res) => {
  console.log('📡 WEBHOOK - Estación conectada:', req.body)

  const { imei, iccid, batteries } = req.body

  console.log(`✅ Estación online: ${imei}`)
  if (iccid) console.log(`📶 SIM: ${iccid}`)
  if (batteries) {
    console.log(`🔋 Baterías en estación: ${batteries.length}`)
    batteries.forEach(b => {
      console.log(`  Slot ${b.slot_id}: batería ${b.battery_id} - carga ${b.battery_capacity}%`)
    })
  }

  // HeyCharge espera esta respuesta exacta
  res.json({ code: 0, message: 'success' })
})


// ══════════════════════════════════════════════
// WEBHOOK 2 — USUARIO DEVUELVE BATERÍA
// ══════════════════════════════════════════════

// HeyCharge llama a este endpoint cuando alguien devuelve un power bank
// URL configurada: https://cargaya-backend-production.up.railway.app/webhook/return

app.post('/webhook/return', (req, res) => {
  console.log('↩️ WEBHOOK - Batería devuelta:', req.body)

  const { imei, battery_id, slot_id, battery_capacity, battery_abnormal, cable_abnormal } = req.body

  console.log(`🔋 Batería ${battery_id} devuelta al slot ${slot_id}`)
  console.log(`⚡ Nivel de carga: ${battery_capacity}%`)
  if (battery_abnormal === '1') console.log(`⚠️ ALERTA: Batería defectuosa!`)
  if (cable_abnormal === '1') console.log(`⚠️ ALERTA: Cable perdido o roto!`)

  // TODO: aquí irá la lógica de cobro final con Culqi/Yape/Plin

  // HeyCharge espera esta respuesta exacta
  res.json({ code: 0, message: 'success' })
})


// ══════════════════════════════════════════════
// WEBHOOK 3 — ESTACIÓN SE DESCONECTA / RECONECTA
// ══════════════════════════════════════════════

// HeyCharge llama a este endpoint cuando cambia el estado de conexión
// URL configurada: https://cargaya-backend-production.up.railway.app/webhook/status

app.post('/webhook/status', (req, res) => {
  console.log('📡 WEBHOOK - Cambio de estado:', req.body)

  const { imei, status } = req.body

  if (status === '0') {
    console.log(`⚠️ ALERTA: Estación ${imei} se desconectó!`)
    // TODO: enviar alerta por WhatsApp
  } else {
    console.log(`✅ Estación ${imei} volvió a conectarse`)
  }

  // HeyCharge espera esta respuesta exacta
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
  console.log(``)
  console.log(`📌 Webhooks listos en:`)
  console.log(`   POST /webhook/register`)
  console.log(`   POST /webhook/return`)
  console.log(`   POST /webhook/status`)
})