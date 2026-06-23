// Serveur de l'Arene.
//  1) Echange du code OAuth Discord contre un access_token (obligatoire pour les Activities).
//  2) Serveur WebSocket qui relaie l'etat du jeu entre les joueurs d'une meme "room"
//     (une room = une instance d'Activity, identifiee par l'instanceId Discord).
import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const PORT = process.env.PORT || 3001;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Echange OAuth : le client envoie le `code`, on recupere un access_token Discord ---
app.post('/api/token', async (req, res) => {
  try {
    const { code } = req.body ?? {};
    if (!code) return res.status(400).json({ error: 'code manquant' });
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: 'DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET non configures' });
    }

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Echec OAuth Discord:', data);
      return res.status(502).json({ error: 'echec echange OAuth', details: data });
    }
    res.json({ access_token: data.access_token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'erreur serveur' });
  }
});

// --- Config publique pour le client (le CLIENT_ID n'est pas secret) ---
// Le client la recupere a l'execution -> pas besoin de l'injecter au build.
app.get('/api/config', (_req, res) => {
  res.json({ clientId: CLIENT_ID || null });
});

// --- En prod : sert le client buildé (client/dist). En dev, c'est Vite qui sert. ---
const clientDist = fileURLToPath(new URL('../client/dist', import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // fallback SPA : tout ce qui n'est pas /api ou /ws renvoie index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(fileURLToPath(new URL('../client/dist/index.html', import.meta.url)));
  });
  console.log('📦 Client statique servi depuis', clientDist);
}

// --- WebSocket : relais temps reel par room ---
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** roomId -> Set<ws> */
const rooms = new Map();

function joinRoom(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
}
function leaveRoom(ws) {
  const room = rooms.get(ws.roomId);
  if (!room) return;
  room.delete(ws);
  broadcast(ws.roomId, { t: 'leave', id: ws.playerId }, ws);
  if (room.size === 0) rooms.delete(ws.roomId);
}
function broadcast(roomId, msg, except) {
  const room = rooms.get(roomId);
  if (!room) return;
  const raw = JSON.stringify(msg);
  for (const client of room) {
    if (client !== except && client.readyState === client.OPEN) client.send(raw);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Premier message attendu : { t:'join', room, id, name, cls }
    if (msg.t === 'join') {
      ws.roomId = String(msg.room || 'global');
      ws.playerId = String(msg.id);
      ws.name = msg.name;
      joinRoom(ws.roomId, ws);

      // On informe le nouveau venu des joueurs deja presents...
      const room = rooms.get(ws.roomId);
      const peers = [];
      for (const client of room) {
        if (client !== ws && client.playerId) {
          peers.push({ id: client.playerId, name: client.name, cls: client.cls });
        }
      }
      ws.send(JSON.stringify({ t: 'peers', peers }));
      // ...et on annonce le nouveau venu aux autres.
      broadcast(ws.roomId, { t: 'join', id: ws.playerId, name: ws.name, cls: msg.cls }, ws);
      ws.cls = msg.cls;
      return;
    }

    if (!ws.roomId) return; // pas encore dans une room

    // Tout le reste (state/hit/hp/super/ko...) est relaye tel quel, en tamponnant l'id de l'envoyeur.
    msg.id = ws.playerId;
    broadcast(ws.roomId, msg, ws);
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// Ping periodique pour nettoyer les connexions mortes.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { leaveRoom(ws); ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`⚔️  Serveur Arene sur http://localhost:${PORT}`);
  console.log(`    WebSocket : ws://localhost:${PORT}/ws`);
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('⚠️  DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET absents : l\'auth Discord ne marchera pas (le mode local fonctionne quand meme).');
  }
});
