const API_URL = 'https://crypto-social.onrender.com'; // Вставим сюда ссылку позже!
let currentPhotoIndex = 0;
let photos = [];

// Загрузка ленты
async function loadFeed() {
    const res = await fetch(API_URL + '/api/feed');
    photos = await res.json();
    if (photos.length > 0) showPhoto(photos.length - 1); // Показываем последнее
}

function showPhoto(index) {
    if (index < 0) return;
    const container = document.getElementById('feed-container');
    const photo = photos[index];
    
    // Создаем карточку
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.style.backgroundImage = `url(${API_URL}${photo.url})`;
    
    // Логика Свайпа (Мышь и Палец)
    let startY = 0;
    const onStart = (e) => startY = e.clientY || e.touches[0].clientY;
    const onMove = (e) => {
        const currentY = e.clientY || e.touches[0].clientY;
        const diff = startY - currentY;
        if (diff > 0) showDonateProgress(card, diff);
    };
    const onEnd = async () => {
        const diff = startY - (e.clientY || e.changedTouches[0].clientY);
        if (diff > 200) await sendDonate(photo.id, 5); // Если протянули высоко
        loadFeed(); // Обновляем
    };

    card.addEventListener('mousedown', onStart);
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseup', onEnd);
    card.addEventListener('touchstart', onStart);
    card.addEventListener('touchmove', onMove);
    card.addEventListener('touchend', onEnd);

    container.innerHTML = '';
    container.appendChild(card);
}

function showDonateProgress(card, height) {
    // Тут можно рисовать зеленую полоску
    console.log('Donating...', height);
}

async function sendDonate(id, amount) {
    await fetch(API_URL + '/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: id, amount })
    });
    alert('Спасибо! Донат отправлен в блокчейн (имитация)');
}


loadFeed();
