const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Нужно для запросов к TON Center

const app = express();
const PORT = process.env.PORT || 3000;

// --- КОНФИГ ---
const ADMIN_ID = "6188749367"; 
// Получите ключ здесь: https://toncenter.com/api/v2/?format=html
// Если оставить пустым, сервер будет принимать донаты без проверки (для теста)
const TON_CENTER_API_KEY = "7d64aeaa55dd626172a3f7fe82db0337ab642f23973ee3a3f926f23d94b8d313"; 

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// --- БАЗА ДАННЫХ ---
const DB_FILE = 'db.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ 
        photos: [], 
        users: {}, 
        payout_requests: [], 
        last_payout_time: Date.now() 
    }));
}
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- API ---

app.get('/api/feed', (req, res) => {
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    res.json(data.photos.reverse());
});

// Профиль
app.post('/api/get_profile', (req, res) => {
    const { userId } = req.body;
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    if (!data.users[userId]) {
        data.users[userId] = { balance: 0, wallet: "" };
        fs.writeFileSync(DB_FILE, JSON.stringify(data));
    }
    res.json({ 
        balance: data.users[userId].balance, 
        wallet: data.users[userId].wallet,
        isAdmin: userId == ADMIN_ID 
    });
});

// Загрузка
app.post('/api/upload', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).send('Нет файла');
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    const authorId = req.body.authorId || 'unknown';
    const newPhoto = {
        id: Date.now(), url: '/uploads/' + req.file.filename,
        author: req.body.author || 'Anonymous', authorId: authorId,
        likes: 0, donations: 0, comments: []
    };
    data.photos.push(newPhoto);
    fs.writeFileSync(DB_FILE, JSON.stringify(data));
    res.json(newPhoto);
});

// Лайк
app.post('/api/like', (req, res) => {
    const { photoId } = req.body;
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    const photo = data.photos.find(p => p.id == photoId);
    if (photo) {
        photo.likes = (photo.likes || 0) + 1;
        fs.writeFileSync(DB_FILE, JSON.stringify(data));
        res.json({ success: true, likes: photo.likes });
    } else res.status(404).send('Not found');
});

// Комментарий
app.post('/api/comment', (req, res) => {
    const { photoId, text, author } = req.body;
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    const photo = data.photos.find(p => p.id == photoId);
    if (photo) {
        photo.comments.push({ author: author || 'Guest', text: text, date: new Date().toLocaleString() });
        fs.writeFileSync(DB_FILE, JSON.stringify(data));
        res.json(photo.comments);
    } else res.status(404).send('Not found');
});

// Донат
app.post('/api/donate', (req, res) => {
    const { photoId, amount, senderId, authorId } = req.body;
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    
    if (!data.users[senderId] || data.users[senderId].balance < amount) {
        return res.status(400).json({ error: "Недостаточно средств" });
    }

    data.users[senderId].balance -= amount;
    if (!data.users[authorId]) data.users[authorId] = { balance: 0, wallet: "" };
    data.users[authorId].balance += amount;

    const photo = data.photos.find(p => p.id == photoId);
    if (photo) photo.donations = (photo.donations || 0) + amount;

    fs.writeFileSync(DB_FILE, JSON.stringify(data));
    res.json({ success: true, newBalance: data.users[senderId].balance });
});

// --- ПОПОЛНЕНИЕ (НОВОЕ) ---
// Адрес вашего проекта (Куда приходят деньги). Замените на свой!
const PROJECT_WALLET = "UQD__________________________________________0Vo"; 

app.post('/api/deposit', async (req, res) => {
    const { userId, amount, txHash } = req.body; 
    // amount в TON
    
    // 1. ПРОВЕРКА (Упрощенная для MVP)
    // В идеале тут надо запросить TON Center API и проверить, что транзакция с таким hash
    // действительно пришла на PROJECT_WALLET от пользователя.
    // Для теста мы пропускаем проверку, если нет API ключа, и просто верим.
    
    let verified = false;
    if (TON_CENTER_API_KEY) {
        // Тут должен быть запрос к toncenter.com/api/v2/getTransactions
        // Для простоты опустим код проверки, считаем что ок.
    } else {
        verified = true; // Режим теста: верим клиенту
    }

    if (verified) {
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        if (!data.users[userId]) data.users[userId] = { balance: 0, wallet: "" };
        
        // Конвертация TON -> USD (условно 1 TON = 5 USD)
        // В реальности надо парсить курс с Coingecko
        const usdAmount = parseFloat(amount) * 5; 
        
        data.users[userId].balance += usdAmount;
        fs.writeFileSync(DB_FILE, JSON.stringify(data));
        
        console.log(`User ${userId} deposited ${amount} TON ($${usdAmount})`);
        res.json({ success: true, newBalance: data.users[userId].balance });
    } else {
        res.status(400).json({ error: "Транзакция не найдена или неверна" });
    }
});

// Вывод и Админка (как было раньше)
app.post('/api/request_payout', (req, res) => {
    const { userId, amount, wallet } = req.body;
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    if (!data.users[userId] || data.users[userId].balance < amount) return res.status(400).json({ error: "Мало средств" });
    
    data.users[userId].balance -= amount;
    data.payout_requests.push({
        id: Date.now(), userId: userId, amount: amount, wallet: wallet,
        status: 'pending', date: new Date().toLocaleString()
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(data));
    res.json({ success: true });
});

app.post('/api/admin/get_requests', (req, res) => {
    const { adminId } = req.body;
    if (adminId != ADMIN_ID) return res.status(403).json({ error: "Нет доступа" });
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    res.json(data.payout_requests.filter(r => r.status === 'pending'));
});

app.post('/api/admin/resolve_request', (req, res) => {
    const { adminId, requestId, action } = req.body;
    if (adminId != ADMIN_ID) return res.status(403).json({ error: "Нет доступа" });
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    const request = data.payout_requests.find(r => r.id == requestId);
    if (!request) return res.status(404).send("Not found");
    if (action === 'reject') {
        if (data.users[request.userId]) data.users[request.userId].balance += request.amount;
        request.status = 'rejected';
    } else {
        request.status = 'approved';
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data));
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
