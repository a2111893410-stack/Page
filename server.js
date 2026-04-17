const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* =========================
   消息存储（5小时）
========================= */
let messages = [];

const SAVE_TIME = 5 * 60 * 60 * 1000;

function cleanOldMessages() {
  const now = Date.now();
  messages = messages.filter(m => now - m.time < SAVE_TIME);
}
setInterval(cleanOldMessages, 60 * 1000);

/* =========================
   连接池
========================= */
const clients = new Map();   // userId -> ws
const admins = new Set();    // admin ws

/* =========================
   WebSocket
========================= */
wss.on("connection", (ws) => {
  let userId = null;
  let isAdmin = false;

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    /* ===== INIT ===== */
    if (data.type === "init") {
      userId = data.userId;
      isAdmin = data.role === "admin";

      clients.set(userId, ws);

      if (isAdmin) {
        admins.add(ws);
        console.log("🟢 管理员上线:", userId);
      } else {
        console.log("👤 用户上线:", userId);
      }

      return;
    }

    /* ===== 用户历史 ===== */
    if (data.type === "history") {
      let history;

      if (data.role === "admin") {
        // 管理员：看全部
        history = messages;
      } else {
        // 用户：只看自己的
        history = messages.filter(m =>
          m.from === data.userId || m.to === data.userId
        );
      }

      ws.send(JSON.stringify({
        type: "history",
        list: history
      }));

      return;
    }

    /* =========================
       文本消息
    ========================= */
    if (data.type === "msg") {
      const msgObj = {
        from: data.from,
        to: data.to,
        type: "msg",
        text: data.text,
        time: Date.now()
      };

      messages.push(msgObj);

      sendToUser(data.to, msgObj);
      sendToUser(data.from, msgObj);
      broadcastToAdmins(msgObj);

      return;
    }

    /* =========================
       图片消息
    ========================= */
    if (data.type === "img") {
      const msgObj = {
        from: data.from,
        to: data.to,
        type: "img",
        src: data.src,
        time: Date.now()
      };

      messages.push(msgObj);

      sendToUser(data.to, msgObj);
      sendToUser(data.from, msgObj);
      broadcastToAdmins(msgObj);

      return;
    }
  });

  ws.on("close", () => {
    if (userId) clients.delete(userId);
    if (isAdmin) admins.delete(ws);
  });
});

/* =========================
   单用户发送
========================= */
function sendToUser(userId, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

/* =========================
   管理员广播
========================= */
function broadcastToAdmins(data) {
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
  res.send("Chat server running");
});

/* =========================
   启动
========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});