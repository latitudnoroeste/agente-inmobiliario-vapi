const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/1d4m3m6u6nncxlqjb352q81nhmpdh4x2';

app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Servidor Marina Alta IA escuchando en http://localhost:${PORT}`);
});
