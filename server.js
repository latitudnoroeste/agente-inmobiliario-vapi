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

  try {
    const response = await axios.post(MAKE_WEBHOOK_URL, data, {
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
