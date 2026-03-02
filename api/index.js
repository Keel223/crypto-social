const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// --- КОНФИГ ---
// Вставьте сюда свои ключи, полученные на Этапе 1
const ADMIN_ID = "6188749367";
const KEY_IMGBB = process.env.KEY_IMGBB || "ВАШ_KEY_IMGBB"; 
const BIN_ID = process.env.BIN_ID || "ВАШ_BIN_ID";
const KEY_JSONBIN = process.env.KEY_JSONBIN || "ВАШ_KEY_JSONBIN";
const PROJECT_WALLET = "UQD__________________________________________0Vo"; // Замените на свой TON адрес

// --- БАЗА ДАННЫХ (JSONBin) ---
async function getDb() {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
        headers: { 'X-Master-Key': KEY_JSONBIN }
    });
    const data = await res.json();
    return data.record;
}

async function saveDb(data) {
    await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': KEY_JSONBIN
        },
        body: JSON.stringify(data)
    });
}

// --- API ---

// Лента
app.get('/api/feed', async (req, res) => {
    const data = await getDb();
    res.json(data.photos.reverse());
});

// Профиль
app.post('/api/get_profile', async (req, res) => {
    const { userId } = req.body;
    const data = await getDb();
    if (!data.users[userId]) {
        data.users[userId] = { balance: 0, wallet: "" };
        await saveDb(data);
    }
    res.json({ 
        balance: data.users[userId].balance, 
        wallet: data.users[userId].wallet,
        isAdmin: userId == ADMIN_ID 
    });
});

// Загрузка фото (ImgBB)
app.post('/api/upload', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('Нет файла');
        
        const form = new FormData();
        form.append('image', req.file.buffer.toString('base64'));

        const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${KEY_IMGBB}`, {
            method: 'POST',
            body: form
        });
        const imgData = await imgRes.json();
        
        if (!imgData.success) throw new Error("Ошибка ImgBB");

        const data = await getDb();
        const newPhoto = {
            id: Date.now(),
            url: imgData.data.url,
            author: req.body.author || 'Anonymous',
            authorId: req.body.authorId || 'unknown',
            likes: 0, donations: 0, comments: []
        };
        
        data.photos.push(newPhoto);
        await saveDb(data);
        res.json(newPhoto);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Лайк
app.post('/api/like', async (req, res) => {
    const { photoId } = req.body;
    const data = await getDb();
    const photo = data.photos.find(p => p.id == photoId);
    if (photo) {
        photo.likes = (photo.likes || 0) + 1;
        await saveDb(data);
        res.json({ success: true, likes: photo.likes });
    } else res.status(404).send('Not found');
});

// Комментарий
app.post('/api/comment', async (req, res) => {
    const { photoId, text, author } = req.body;
    const data = await getDb();
    const photo = data.photos.find(p => p.id == photoId);
    if (photo) {
        photo.comments.push({ author: author || 'Guest', text: text, date: new Date().toLocaleString() });
        await saveDb(data);
        res.json(photo.comments);
    } else res.status(404).send('Not found');
});

// Донат
app.post('/api/donate', async (req, res) => {
    const { photoId, amount, senderId, authorId } = req.body;
    const data = await getDb();
    
    if (!data.users[senderId] || data.users[senderId].balance < amount) {
        return res.status(400).json({ error: "Недостаточно средств" });
    }

    data.users[senderId].balance -= amount;
    if (!data.users[authorId]) data.users[authorId] = { balance: 0, wallet: "" };
    data.users[authorId].balance += amount;

    const photo = data.photos.find(p => p.id == photoId);
    if (photo) photo.donations = (photo.donations || 0) + amount;

    await saveDb(data);
    res.json({ success: true, newBalance: data.users[senderId].balance });
});

// Пополнение (Упрощенное)
app.post('/api/deposit', async (req, res) => {
    const { userId, amount } = req.body;
    const data = await getDb();
    if (!data.users[userId]) data.users[userId] = { balance: 0, wallet: "" };
    
    const usdAmount = parseFloat(amount) * 5; // 1 TON = 5 USD
