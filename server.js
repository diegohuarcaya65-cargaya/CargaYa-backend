// ══════════════════════════════════════════════
// IMPORTAR HERRAMIENTAS
// ══════════════════════════════════════════════

const express = require('express')
const axios = require('axios')
const Culqi = require('culqi-node')
require('dotenv').config()

const app = express()
app.use(express.json())
app.use(express.static('public'))

// ══════════════════════════════════════════════
// VARIABLES IMPORTANTES
// ══════════════════════════════════════════════

const HEYCHARGE_URL = 'https://openapi.heycharge.global'
const STATION_ID = 'DCHEYS2603000893'
const API_KEY = process.env.HEYCHARGE_API_KEY

// Inicializar Culqi
const culqi = new Culqi({ privateKey: process.env.CULQI_PRIVATE_KEY })

const getAuthHeader = () => {
  const encoded = Buffer.from(API_KEY + ':').toString('base64')
  return `Basic ${encoded}`
}
const jsonHeaders = () => ({ 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' })
const formHeaders = () => ({ 'Authorization': getAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' })

// ══════════════════════════════════════════════
// RUTA 0 — PÁGINA PRINCIPAL
// ══════════════════════════════════════════════

app.get('/', (req, res) => {
  res.sendFile('public/index.html', { root: '.' })
})

// ══════════════════════════════════════════════
// RUTA 1 — VER ESTACIÓN
// ══════════════════════════════════════════════

app.get('/api/estacion', async (req, res) => {
  try {
    const response = await axios.get(`${HEYCHARGE_URL}/v1/station/${STATION_ID}`, { headers: jsonHeaders() })
    res.json(response.data)
  } catch (error) {
    console.error('Error al obtener estacion:', error.response?.data || error.message)
    res.status(500).json({ error: error.message, detalle: error.response?.data || 'Sin detalles' })
  }
})

// ══════════════════════════════════════════════
// RUTA 2 — VER BATERIAS
// ══════════════════════════════════════════════

app.get('/api/baterias', async (req, res) => {
  try {
    const response = await axios.get(`${HEYCHARGE_URL}/v1/station/${STATION_ID}`, { headers: jsonHeaders() })
    const baterias = response.data.batteries || []
    const disponibles = baterias.filter(b => b.lock_status === '1' && b.battery_abnormal === '0')
    res.json({ total: baterias.length, disponibles: disponibles.length, baterias })
  } catch (error) {
    console.error('Error al obtener baterias:', error.response?.data || error.message)
    res.status(500).json({ error: error.message, detalle: error.response?.data || 'Sin detalles' })
  }
})

// ══════════════════════════════════════════════
// RUTA 3 — LIBERAR BATERIA (manual)
// ══════════════════════════════════════════════

app.post('/api/liberar', async (req, res) => {
  try {
    const { battery_id, slot_id } = req.body
    if (!battery_id || !slot_id) return res.status(400).json({ error: 'Faltan battery_id y/o slot_id' })
    const params = new URLSearchParams()
    params.append('battery_id', battery_id)
    params.append('slot_id', slot_id)
    const response = await axios.post(`${HEYCHARGE_URL}/v1/station/${STATION_ID}`, params, { headers: formHeaders() })
    console.log(`Bateria ${battery_id} liberada del slot ${slot_id}`)
    res.json(response.data)
  } catch (error) {
    console.error('Error al liberar bateria:', error.response?.data || error.message)
    res.status(500).json({ error: error.message, detalle: error.response?.data || 'Sin detalles' })
  }
})

// ══════════════════════════════════════════════
// RUTA 4 — EXPULSAR DESDE ADMIN
// ══════════════════════════════════════════════

app.post('/api/expulsar', async (req, res) => {
  try {
    const { battery_id, slot_id } = req.body
    if (!battery_id || !slot_id) return res.status(400).json({ error: 'Faltan battery_id y/o slot_id' })
    const params = new URLSearchParams()
    params.append('battery_id', battery_id)
    params.append('slot_id', slot_id)
    const response = await axios.post(`${HEYCHARGE_URL}/v1/station/${STATION_ID}`, params, { headers: formHeaders() })
    console.log(`Bateria ${battery_id} expulsada del slot ${slot_id} desde admin`)
    res.json(response.data)
  } catch (error) {
    console.error('Error al expulsar slot:', error.response?.data || error.message)
    res.status(500).json({ error: error.message, detalle: error.response?.data || 'Sin detalles' })
  }
})

// ══════════════════════════════════════════════
// RUTA 5 — FORCE UNLOCK
// ══════════════════════════════════════════════

app.post('/api/forzar', async (req, res) => {
  try {
    const { slot_id } = req.body
    if (!slot_id) return res.status(400).json({ error: 'Falta slot_id' })
    const response = await axios.post(`${HEYCHARGE_URL}/v1/station/${STATION_ID}/forceUnlock`, { slot_id }, { headers: jsonHeaders() })
    console.log(`Slot ${slot_id} desbloqueado a la fuerza`)
    res.json(response.data)
  } catch (error) {
    console.error('Error al forzar unlock:', error.response?.data || error.message)
    res.status(500).json({ error: error.message, detalle: error.response?.data || 'Sin detalles' })
  }
})

// ══════════════════════════════════════════════
// RUTA 6 — REINICIAR ESTACION
// ══════════════════════════════════════════════

app.post('/api/reiniciar', async (req, res) => {
  try {
    const response = await axios.post(`${HEYCHARGE_URL}/v1/station/${STATION_ID}/reboot`, {}, { headers: jsonHeaders() })
    console.log('Estacion reiniciada')
    res.json(response.data)
  } catch (error) {
    console.error('Error al reiniciar estacion:', error.response?.data || error.message)
    res.status(500).json({ error: error.message, detalle: error.response?.data || 'Sin detalles' })
  }
})

// ══════════════════════════════════════════════
// RUTA NUEVA - PAGAR CON CULQI
// ══════════════════════════════════════════════

app.post('/api/pagar', async (req, res) => {
  try {
    const { token, email, horas, monto } = req.body

    if (!token || !email || !horas || !monto) {
      return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos' })
    }

    console.log(`Procesando pago: ${email} - S/${monto} (${horas}h)`)

    // Crear cargo en Culqi
    const charge = await culqi.charges.createCharge({
      amount: String(Math.round(monto * 100)),
      currency_code: 'PEN',
      email: email,
      source_id: token,
      description: `CargaYa - Power Bank ${horas} hora${horas > 1 ? 's' : ''}`,
      metadata: { horas: String(horas), station_id: STATION_ID }
    })

    console.log(`Cargo Culqi: ${charge.id} -> ${charge.outcome?.type}`)

    if (charge.outcome && charge.outcome.type === 'venta_exitosa') {
      // Buscar bateria disponible
      let battery_id = null
      let slot_id = null

      try {
        const estacion = await axios.get(`${HEYCHARGE_URL}/v1/station/${STATION_ID}`, { headers: jsonHeaders() })
        const baterias = estacion.data.batteries || []
        const disponible = baterias.find(b => b.lock_status === '1' && b.battery_abnormal === '0')
        if (disponible) {
          battery_id = disponible.battery_id
          slot_id = disponible.slot_id
        }
      } catch (err) {
        console.error('Error obteniendo bateria:', err.message)
      }

      // Liberar bateria
      let bateriaLiberada = false
      if (battery_id && slot_id) {
        try {
          const params = new URLSearchParams()
          params.append('battery_id', battery_id)
          params.append('slot_id', slot_id)
          await axios.post(`${HEYCHARGE_URL}/v1/station/${STATION_ID}`, params, { headers: formHeaders() })
          bateriaLiberada = true
          console.log(`Bateria ${battery_id} liberada del slot ${slot_id}`)
        } catch (err) {
          console.error('Error liberando bateria:', err.message)
        }
      }

      res.json({
        success: true,
        charge_id: charge.id,
        monto,
        horas,
        bateria_liberada: bateriaLiberada,
        slot: slot_id,
        mensaje: bateriaLiberada
          ? `Pago exitoso! Tu power bank esta siendo liberado del slot ${slot_id}.`
          : 'Pago recibido! Contacta al staff para recibir tu power bank.'
      })
    } else {
      res.json({
        success: false,
        mensaje: charge.outcome?.merchant_message || 'Pago rechazado. Intenta con otro metodo.'
      })
    }

  } catch (error) {
    console.error('Error en /api/pagar:', error.message)
    res.status(500).json({ success: false, mensaje: 'Error al procesar el pago. Intenta de nuevo.' })
  }
})

// ══════════════════════════════════════════════
// WEBHOOK CULQI
// ══════════════════════════════════════════════

app.post('/webhook/culqi', (req, res) => {
  console.log('WEBHOOK Culqi:', req.body?.type)
  res.json({ received: true })
})

// ══════════════════════════════════════════════
// WEBHOOKS HEYCHARGE
// ══════════════════════════════════════════════

app.post('/webhook/register', (req, res) => {
  console.log('WEBHOOK - Estacion conectada:', req.body)
  const { imei, iccid, batteries } = req.body
  console.log(`Estacion online: ${imei}`)
  if (iccid) console.log(`SIM: ${iccid}`)
  if (batteries) {
    batteries.forEach(b => {
      console.log(`  Slot ${b.slot_id}: bateria ${b.battery_id} - carga ${b.battery_capacity}%`)
    })
  }
  res.json({ code: 0, message: 'success' })
})

app.post('/webhook/return', (req, res) => {
  console.log('WEBHOOK - Bateria devuelta:', req.body)
  const { battery_id, slot_id, battery_capacity, battery_abnormal, cable_abnormal } = req.body
  console.log(`Bateria ${battery_id} devuelta al slot ${slot_id} - carga ${battery_capacity}%`)
  if (battery_abnormal === '1') console.log('ALERTA: Bateria defectuosa!')
  if (cable_abnormal === '1') console.log('ALERTA: Cable perdido o roto!')
  res.json({ code: 0, message: 'success' })
})

app.post('/webhook/status', (req, res) => {
  console.log('WEBHOOK - Cambio de estado:', req.body)
  const { imei, status } = req.body
  if (status === '0') {
    console.log(`ALERTA: Estacion ${imei} se desconecto!`)
  } else {
    console.log(`Estacion ${imei} volvio a conectarse`)
  }
  res.json({ code: 0, message: 'success' })
})

// ══════════════════════════════════════════════
// ARRANCAR EL SERVIDOR
// ══════════════════════════════════════════════

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`CargaYa backend corriendo en http://localhost:${PORT}`)
  console.log(`HeyCharge API Key: ${API_KEY ? API_KEY.substring(0, 8) + '...' : 'NO CONFIGURADA'}`)
  console.log(`Culqi: ${process.env.CULQI_PRIVATE_KEY ? 'Configurado' : 'NO CONFIGURADO'}`)
  console.log(`Estacion: ${STATION_ID}`)
  console.log(`Rutas: GET /api/estacion | GET /api/baterias | POST /api/pagar | POST /api/liberar | POST /api/expulsar | POST /api/forzar | POST /api/reiniciar`)
})