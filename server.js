const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Налаштування CORS (дозволяємо запити з твого сайту в Telegram)
app.use(cors());
app.use(express.json());

// Підключення до бази даних MongoDB
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Успішно підключено до MongoDB!'))
  .catch(err => console.error('❌ Помилка підключення до MongoDB:', err));

// Створюємо структуру (Схему) для поїздки
const rideSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'driver' або 'passenger'
  from: { type: String, required: true },
  to: { type: String, required: true },
  date: { type: String, required: true }, // Формат YYYY-MM-DD
  time: { type: String, required: true },
  seats: { type: Number, required: true },
  price: { type: Number }, // Може бути порожнім для пасажира
  phone: { type: String, required: true },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Ride = mongoose.model('Ride', rideSchema);

// === API 1: ОТРИМАТИ ВСІ ПОЇЗДКИ ===
// Віддає тільки АКТУАЛЬНІ поїздки (сьогоднішні та майбутні)
app.get('/api/rides', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // Отримуємо '2026-04-02'
    
    // Шукаємо поїздки, дата яких >= сьогоднішній
    const rides = await Ride.find({ date: { $gte: today } }).sort({ date: 1, time: 1 });
    
    res.status(200).json(rides);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка сервера при отриманні поїздок' });
  }
});

// === API 2: ДОДАТИ НОВУ ПОЇЗДКУ ===
app.post('/api/rides', async (req, res) => {
  try {
    const newRide = new Ride(req.body);
    await newRide.save();
    res.status(201).json({ message: '✅ Поїздку успішно додано!', ride: newRide });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка при збереженні поїздки' });
  }
});

// === API 3: ВИДАЛИТИ ПОЇЗДКУ ===
app.delete('/api/rides/:id', async (req, res) => {
  try {
    await Ride.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: '✅ Поїздку видалено!' });
  } catch (error) {
    res.status(500).json({ error: 'Помилка при видаленні поїздки' });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер BlaBlaCar працює на порту ${PORT}`);
});
