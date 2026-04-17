const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* =========================
   消息存储（5小时自动清理）
========================= */
let messages = []; 
const SAVE_TIME = 5 * 60 * 60 * 1000; // 5小时

function cleanOldMessages(){
  const now = Date.now();
  messages = messages.filter(m => now - m.time < SAVE_TIME);
}
setInterval(cleanOldMessages, 60 * 1000);

/* =========================
   连接池
========================= */
const clients = new Map(); // userId -> ws
const admins = new Set();  // 管理员ws集合

/* =========================
   WebSocket 核心
========================= */
wss.on("connection", (ws) => {

  let userId = null;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    /* ===== 初始化 ===== */
    if (data.type === "init") {
      userId = data.userId;

      clients.set(userId, ws);

      // 标记管理员
      if (data.role === "admin") {
        admins.add(ws);
        console.log("管理员已上线:", userId);
      } else {
        console.log("用户上线:", userId);
      }

      return;
    }

    /* ===== 历史记录 ===== */
    if (data.type === "history") {
      const history = messages.filter(m =>
        m.from === data.userId || m.to === data.userId
      );

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

      // 发给目标用户
      sendToUser(data.to, msgObj);

      // 发回发送者（保证双方同步）
      sendToUser(data.from, msgObj);

      // ⭐ 关键：发给所有管理员
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

      // ⭐ 管理员也能看到图片
      broadcastToAdmins(msgObj);

      return;
    }
  });

  ws.on("close", () => {
    if (userId) clients.delete(userId);
    admins.delete(ws);
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
   广播给管理员
========================= */
function broadcastToAdmins(data) {
  admins.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  });
}

/* =========================
   HTTP 测试
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