# Party Game Hub 🎉

Сборник многопользовательских игр для вечеринок с друзьями.
Всё работает в реальном времени через Firebase.

## Игры

- **Мафия** — классическая мафия с ролями (мафия, доктор, шериф, мирные)

## Как запустить

### 1. Создай проект в Firebase

1. Зайди на https://console.firebase.google.com
2. Нажми **"Создать проект"** (или выбери существующий)
3. Отключи Google Analytics (не нужен)
4. После создания проекта нажми **"</>" (Web)** — добавить веб-приложение
5. Назови приложение (например, "party-game-hub")
6. Скопируй объект `firebaseConfig` — он понадобится

### 2. Настрой Firestore Database

1. В консоли Firebase слева выбери **Firestore Database**
2. Нажми **"Создать базу данных"**
3. Выбери регион (лучше `eur3` — Европа)
4. Выбери **"Тестовый режим"** (для разработки) — это откроет доступ всем
5. Нажми **"Готово"**

### 3. Вставь свои ключи в проект

Открой файл `js/firebase-config.js` и замени заглушки на свои данные:

```js
const firebaseConfig = {
  apiKey: "твой-api-key",
  authDomain: "твой-project.firebaseapp.com",
  projectId: "твой-project-id",
  storageBucket: "твой-project.appspot.com",
  messagingSenderId: "твой-sender-id",
  appId: "твой-app-id"
};
```

### 4. Залей на GitHub Pages

```bash
# Создай репозиторий на GitHub
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/твой-ник/party-game-hub.git
git push -u origin main

# В настройках репозитория → Pages → выбери ветку main, папку /
```

Через 1-2 минуты сайт будет доступен по адресу:
`https://твой-ник.github.io/party-game-hub/`

## Как играть

1. Хост открывает сайт, вводит имя, выбирает **Мафия** → **Создать комнату**
2. Появляется код комнаты (6 букв/цифр)
3. Друзья заходят на сайт → **Присоединиться** → вводят код и имя
4. Когда все собрались, хост жмёт **"Начать игру"**
5. Каждому игроку назначается роль (мафия, доктор, шериф, мирный)
6. **Ночь**: мафия выбирает жертву, доктор спасает, шериф проверяет
7. **День**: объявление убитого, обсуждение, голосование
8. Игра до победы одной из сторон

## Правила Firestore

⚠️ **Важно**: В тестовом режиме база открыта всем. Если будешь показывать проект публично, настрой **правила доступа** в Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if true;
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
}
```