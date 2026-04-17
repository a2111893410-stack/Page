const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* =========================
   消息池（5小时）
========================= */
let messages = [];
const SAVE_TIME = 5 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  messages = messages.filter(m => now - m.time < SAVE_TIME);
}, 60 * 1000);

/* =========================
   连接池
========================= */
const clients = new Map(); // userId -> ws
const rooms = new Map();   // roomId -> Set(ws)
const admins = new Set();  // admin ws

/* =========================
   核心
========================= */
wss.on("connection", (ws) => {

  let userId = null;
  let roomId = null;
  let isAdmin = false;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    /* ===== 连接 ===== */
    if (data.type === "join") {
      userId = data.userId;
      roomId = data.roomId;

      clients.set(userId, ws);

      if (data.role === "admin") {
        isAdmin = true;
        admins.add(ws);
      }

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      rooms.get(roomId).add(ws);

      console.log("JOIN:", userId, roomId);
      return;
    }

    /* ===== 历史 ===== */
    if (data.type === "history") {
      const history = messages.filter(m => m.roomId === data.roomId);

      ws.send(JSON.stringify({
        type: "history",
        list: history
      }));
      return;
    }

    /* ===== 文本 ===== */
    if (data.type === "msg") {
      const msgObj = {
        type: "msg",
        from: data.from,
        roomId: data.roomId,
        text: data.text,
        time: Date.now()
      };

      messages.push(msgObj);

      broadcastRoom(data.roomId, msgObj);
      return;
    }

    /* ===== 图片 ===== */
    if (data.type === "img") {
      const msgObj = {
        type: "img",
        from: data.from,
        roomId: data.roomId,
        src: data.src,
        time: Date.now()
      };

      messages.push(msgObj);

      broadcastRoom(data.roomId, msgObj);
      return;
    }
  });

  ws.on("close", () => {
    if (userId) clients.delete(userId);
    if (isAdmin) admins.delete(ws);
    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).delete(ws);
    }
  });
});

/* =========================
   房间广播（核心）
========================= */
function broadcastRoom(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  });

  // 管理员也收
  admins.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  });
}

/* =========================
   HTTP
========================= */
app.get("/", (req, res) => {
  res.send("Chat OK");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("RUN:", PORT);
});