const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;
const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/1d4m3m6u6nncxlqjb352q81nhmpdh4x2';
const CALENDAR_ID = '6bf019e75479a3c0e06bb6aa956baad76c557b72e043d9efdb1cf1cb601bb5fe@group.calendar.google.com';
const SLOT_DURATION_MS = 60 * 60 * 1000;
const BUSINESS_START = 9;
const BUSINESS_END = 19;

app.use(express.json());

// --- Google Calendar helpers ---

function spainToUTC(day, month, year, hour, minute) {
  const localStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`;
  const utcCandidate = new Date(localStr);
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(utcCandidate);
  const get = (type) => parseInt(parts.find(p => p.type === type).value, 10);
  const madridAsUTC = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')));
  return new Date(utcCandidate.getTime() - (madridAsUTC - utcCandidate));
}

function addDays(year, month, day, n) {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

async function queryFreebusy(auth, timeMin, timeMax) {
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: CALENDAR_ID }],
    },
  });
  return res.data.calendars[CALENDAR_ID].busy || [];
}

function overlaps(slotStart, slotEnd, busy) {
  return busy.some(({ start, end }) => slotStart < new Date(end) && slotEnd > new Date(start));
}

async function findFreeSlots(auth, origDay, origMonth, origYear, afterHour, count) {
  const slots = [];
  for (let offset = 0; offset < 3 && slots.length < count; offset++) {
    const { day, month, year } = offset === 0
      ? { day: origDay, month: origMonth, year: origYear }
      : addDays(origYear, origMonth, origDay, offset);
    const startHour = offset === 0 ? Math.max(afterHour + 1, BUSINESS_START) : BUSINESS_START;
    if (startHour >= BUSINESS_END) continue;
    const queryStart = spainToUTC(day, month, year, startHour, 0);
    const queryEnd = spainToUTC(day, month, year, BUSINESS_END, 0);
    const busy = await queryFreebusy(auth, queryStart, queryEnd);
    for (let h = startHour; h < BUSINESS_END && slots.length < count; h++) {
      const slotStart = spainToUTC(day, month, year, h, 0);
      const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MS);
      if (!overlaps(slotStart, slotEnd, busy)) {
        slots.push({
          fecha: `${String(day).padStart(2,'0')}-${String(month).padStart(2,'0')}-${year}`,
          hora: `${String(h).padStart(2,'0')}:00`,
        });
      }
    }
  }
  return slots;
}

app.get('/', (req, res) => {
  res.send('Servidor de Marina Alta IA activo');
});

app.post('/webhook', async (req, res) => {
  const data = req.body;
  console.log('Datos recibidos de Vapi:', JSON.stringify(data, null, 2));

  const structuredData = data?.message?.analysis?.structuredData || {};
  const { appointment_date, appointment_time, appointment_slot } = structuredData;

  const payload = {
    ...data,
    appointment_date: appointment_date ?? null,
    appointment_time: appointment_time ?? null,
    appointment_slot: appointment_slot ?? null,
  };

  console.log('Campos de cita extraídos:', { appointment_date, appointment_time, appointment_slot });

  try {
    const response = await axios.post(MAKE_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('Respuesta de Make:', response.status);
  } catch (error) {
    console.error('Error al enviar a Make:', error.message);
  }

  res.status(200).json({ status: 'ok', mensaje: 'Webhook recibido correctamente' });
});

app.post('/check-availability', async (req, res) => {
  // Acepta tanto fecha/hora (nombre que usa Vapi) como fecha_cita/hora_cita
  const fecha_cita = req.body.fecha_cita || req.body.fecha;
  const hora_cita  = req.body.hora_cita  || req.body.hora;

  if (!fecha_cita || !hora_cita) {
    return res.status(400).json({ error: 'Se requieren fecha_cita y hora_cita (o fecha y hora)' });
  }

  const dateMatch = fecha_cita.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const timeMatch = hora_cita.match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    return res.status(400).json({ error: 'Use DD-MM-YYYY para fecha_cita y HH:MM para hora_cita' });
  }

  const day = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const year = parseInt(dateMatch[3], 10);
  const hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
    return res.status(500).json({ error: 'Credenciales de Google Calendar no configuradas' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const slotStart = spainToUTC(day, month, year, hour, minute);
    const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MS);

    const busy = await queryFreebusy(auth, slotStart, slotEnd);

    if (!overlaps(slotStart, slotEnd, busy)) {
      return res.json({ available: true });
    }

    const alternatives = await findFreeSlots(auth, day, month, year, hour, 3);
    return res.json({ available: false, alternatives });

  } catch (error) {
    console.error('Error en /check-availability:', error.message);
    return res.status(500).json({ error: 'Error al consultar el calendario' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Marina Alta IA escuchando en http://localhost:${PORT}`);
});
