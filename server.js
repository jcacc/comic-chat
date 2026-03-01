const { WebSocketServer } = require('ws');

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

const clients = new Map(); // ws → { name, charIdx }
let nextCharIdx = 0;

function broadcast(data, exclude = null) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

function broadcastAll(data) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

function getRoster() {
  return [...clients.values()].map(({ name, charIdx }) => ({ name, charIdx }));
}

wss.on('connection', (ws) => {
  let joined = false;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      if (joined) return;
      const name = String(msg.name || 'Anonymous').trim().slice(0, 32) || 'Anonymous';
      const charIdx = nextCharIdx++ % 8;
      clients.set(ws, { name, charIdx });
      joined = true;

      // Send roster to the newly joined client
      ws.send(JSON.stringify({ type: 'roster', users: getRoster() }));

      // Broadcast join + updated roster to everyone else
      broadcast({ type: 'join', user: name, charIdx }, ws);
      broadcastAll({ type: 'roster', users: getRoster() });

    } else if (msg.type === 'chat') {
      if (!joined) return;
      const client = clients.get(ws);
      broadcastAll({
        type: 'chat',
        user: client.name,
        charIdx: client.charIdx,
        text: String(msg.text || '').slice(0, 500),
        emotion: msg.emotion || 'neutral',
        balloon: msg.balloon || 'speech',
      });
    }
  });

  ws.on('close', () => {
    if (!joined) return;
    const client = clients.get(ws);
    clients.delete(ws);
    broadcast({ type: 'leave', user: client.name });
    broadcastAll({ type: 'roster', users: getRoster() });
  });

  ws.on('error', () => {
    if (joined) {
      const client = clients.get(ws);
      clients.delete(ws);
      broadcast({ type: 'leave', user: client.name });
      broadcastAll({ type: 'roster', users: getRoster() });
    }
  });
});

console.log(`Comic Chat server running on ws://localhost:${PORT}`);
