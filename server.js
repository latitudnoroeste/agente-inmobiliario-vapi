const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Servidor de Marina Alta IA activo');
});

// Webhook para recibir datos de Vapi
app.post('/webhook', (req, res) => {
  const data = req.body;
  console.log('Datos recibidos de Vapi:', JSON.stringify(data, null, 2));

  // Aquí procesaremos los eventos de Vapi (llamadas, transcripciones, etc.)
  res.status(200).json({ status: 'ok', mensaje: 'Webhook recibido correctamente' });
});

app.listen(PORT, () => {
  console.log(`Servidor Marina Alta IA escuchando en http://localhost:${PORT}`);
});
