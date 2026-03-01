// api/index.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Нужен для отправки фото на ImgBB
const FormData = require('form-data'); // Нужен для FormData

const app = express();

// --- КОНФИГ ---
const ADMIN_ID = "6188749367"; 
const IMGBB_API_KEY = "ВАШ_КЛЮЧ_ОТ_IMGBB"; // Вставьте сюда ключ с сайта imgbb

app.use(cors());
app.use(express.json());

// База данных (теперь она будет в корне проекта на Vercel)
// Внимание: на бесплатном Vercel база данных тоже будет сбрасываться при каждом деплое!
// Для продакшена лучше использовать внешнюю БД (например, Supabase или MongoDB).
const DB_PATH = path.join(process.cwd(), 'db.json');

function getDb() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ photos: [], users: {}, payout_requests: [] }));
    }
    return JSON.parse(fs.readFileSync(DB_PATH));
}

function saveDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data));
}

const upload = multer({ storage: multer.memoryStorage() }); // Храним фото в памяти, а не на диске

// --- ROUTES ---

// Лента
app.get('/api/feed', (req, res) => {
    res.json(getDb().photos.reverse());
});

// Профиль
app.post('/api/get_profile', (req, res) => {
    const { userId } = req.body;
    const data = getDb();
    if (!data.users[userId]) {
        data.users[userId] = { balance: 0, wallet: "" };
        saveDb(data);
    }
    res.json({ 
        balance: data.users[userId].balance, 
        wallet: data.users[userId].wallet,
        isAdmin: userId == ADMIN_ID 
    });
});

// Загрузка фото (Теперь на ImgBB!)
app.post('/api/upload', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('Нет файла');

        // Отправляем фото на ImgBB
        const form = new FormData();
        form.append('image', req.file.buffer.toString('base64'));

        const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: form
        });
        const imgData = await imgbbRes.json();

        if (!imgData.success) throw new Error("Ошибка загрузки ImgBB");

        const photoUrl = imgData.data.url; // Получаем вечную ссылку на фото

        const data = getDb();
        const newPhoto = {
            id: Date.now(),
            url: photoUrl, // Сохраняем ссылку ImgBB
            author: req.body.author || 'Anonymous',
            authorId: req.body.authorId || 'unknown',
            likes: 0, donations: 0, comments: []
        };
        
        data.photos.push(newPhoto);
        saveDb(data);
        res.json(newPhoto);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Остальные роуты (лайк, донат, админка) берем из старого кода без изменений
// (просто скопируйте их сюда из вашего старого server.js)
// ... [Вставьте сюда код для /api/like, /api/comment, /api/donate, /api/deposit, /api/admin/* из предыдущего ответа] ...

// Для Vercel нужно экспортировать приложение
module.exports = app;
