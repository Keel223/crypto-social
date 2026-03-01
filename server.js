const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Разрешаем запросы с других сайтов (нужно для GitHub Pages)
app.use(cors());
app.use(express.json());

// Папка для статики
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// "База данных" (простой файл JSON)
const DB_FILE = 'db.json';
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ photos: [] }));

// Настройка загрузки фото
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- API ---

// 1. Получить ленту фото
app.get('/api/feed', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DB_FILE));
  res.json(data.photos);
});

// 2. Загрузить фото
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).send('Нет файла');
  
  const data = JSON.parse(fs.readFileSync(DB_FILE));
  const newPhoto = {
    id: Date.now(),
    url: '/uploads/' + req.file.filename,
    author: 'User' + Math.floor(Math.random() * 1000),
    likes: 0,
    donations: 0
  };
  
  data.photos.push(newPhoto);
  fs.writeFileSync(DB_FILE, JSON.stringify(data));
  res.json(newPhoto);
});

// 3. Донат (Свайп)
app.post('/api/donate', (req, res) => {
  const { photoId, amount } = req.body;
  // ТУТ БУДЕТ КОД ДЛЯ TON CRYPTO
  console.log(`Донат $${amount} на фото #${photoId}`);
  res.json({ success: true, newBalance: 100 });
});

app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));