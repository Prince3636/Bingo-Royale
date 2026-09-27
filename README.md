# Bingo Royale - Production-Ready Multiplayer Bingo Game

A fast, reliable, real-time multiplayer Bingo game built with **React + Vite** and **Node.js + Express + Socket.IO**.

## Features
- **Real-Time Multiplayer**: Synchronized turns, number calling, and live board updates.
- **Authoritative Server**: Server validates all moves, numbers, turns, boards, and Bingo winning conditions.
- **Reconnection Handling**: Disconnect grace period (60s default) with session restoration via persistent Player ID.
- **Bot Support**: Add AI bots directly to games.
- **In-Game Chat**: Rate-limited, bounded in-memory buffer with anti-spam protection.
- **Horizontal Scaling Ready**: Built-in support for `@socket.io/redis-adapter` via `REDIS_URL`.
- **Resource Management**: Inactive/abandoned room cleanup sweep, memory safeguards, and rate limiting.
- **Responsive Neo-Brutalist UI**: Light and Dark mode, touch-friendly mobile layout and desktop view.
- **Health Checks & Observability**: Structured JSON logging and `/health` endpoint.

---

## Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment (optional)**:
   ```bash
   cp .env.example .env.local
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

4. **Run automated tests**:
   ```bash
   npm test
   ```

5. **Run load & stress tests**:
   ```bash
   npm run test:load
   ```

---

## Production Deployment

### Option A: Render.com (Unified All-in-One)
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment Variables**:
  - `NODE_ENV=production`
  - `CLIENT_URL=*`

### Option B: Split Deployment (Backend on Render, Frontend on Vercel)
- **Backend (Render)**:
  - Command: `npm start`
  - Env: `CLIENT_URL=https://your-frontend.vercel.app`
- **Frontend (Vercel)**:
  - Framework: Vite
  - Build: `npm run build`
  - Output: `dist`
  - Env: `VITE_SERVER_URL=https://your-backend.onrender.com`
