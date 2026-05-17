const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const https = require("https");

const app = express();

// ── CORS & JSON 解析 ──────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

// ── 基础路由 ──────────────────────────────────────────────
app.get("/", (req, res) =>
  res.send("Server Running: Chat (WebSocket) + Escrow (REST API)")
);

// ═══════════════════════════════════════════════════════════
//  担保交易 API — 使用 JSONBin.io 持久化
//  环境变量（在 Render 的 Environment 里配置）：
//    JSONBIN_BIN_ID  = 你的 Bin ID
//    JSONBIN_API_KEY = 你的 Secret Key
// ═══════════════════════════════════════════════════════════
const BIN_ID  = process.env.JSONBIN_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// 内存缓存，减少对 JSONBin 的请求次数
let escrowCache = null;

async function jsonbinGet() {
  if (escrowCache) return escrowCache; // 命中缓存直接返回
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.jsonbin.io",
      path: `/v3/b/${BIN_ID}/latest`,
      method: "GET",
      headers: { "X-Master-Key": API_KEY }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          escrowCache = json.record || {};
          resolve(escrowCache);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function jsonbinPut(data) {
  escrowCache = data; // 同步更新缓存
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: "api.jsonbin.io",
      path: `/v3/b/${BIN_ID}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "X-Master-Key": API_KEY
      }
    };
    const req = https.request(options, (res) => {
      let resp = "";
      res.on("data", (chunk) => (resp += chunk));
      res.on("end", () => resolve(JSON.parse(resp)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── GET /escrow/:token — 查询订单 ─────────────────────────
app.get("/escrow/:token", async (req, res) => {
  const token = req.params.token.toUpperCase();
  try {
    const db = await jsonbinGet();
    const order = db[token];
    if (!order) return res.status(404).json({ error: "订单不存在" });
    // 返回时隐藏口令（仅 done 状态才返回）
    const safeOrder = { ...order };
    if (order.status !== "done") delete safeOrder.kw;
    res.json(safeOrder);
  } catch (e) {
    console.error("GET /escrow error:", e);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ── POST /escrow — 创建订单 ───────────────────────────────
app.post("/escrow", async (req, res) => {
  const { token, kw, price, note, pin } = req.body;
  if (!token || !kw || !price || !pin)
    return res.status(400).json({ error: "缺少必要字段" });
  try {
    const db = await jsonbinGet();
    if (db[token]) return res.status(409).json({ error: "令牌冲突，请重试" });
    db[token] = {
      token,
      kw,
      price: Number(price),
      note: note || "无备注",
      pin, // 前端已哈希，后端直接存
      status: "pending",
      at: Date.now(),
      doneAt: null
    };
    await jsonbinPut(db);
    res.json({ ok: true, token });
  } catch (e) {
    console.error("POST /escrow error:", e);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ── PUT /escrow/:token/confirm — 买家确认收货 ─────────────
app.put("/escrow/:token/confirm", async (req, res) => {
  const token = req.params.token.toUpperCase();
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "缺少密码" });
  try {
    const db = await jsonbinGet();
    const order = db[token];
    if (!order) return res.status(404).json({ error: "订单不存在" });
    if (order.status === "done") return res.status(409).json({ error: "订单已完成" });
    if (order.pin !== pin) return res.status(403).json({ error: "密码错误" });
    order.status = "done";
    order.doneAt = Date.now();
    db[token] = order;
    await jsonbinPut(db);
    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /escrow confirm error:", e);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ── GET /escrow/list/:pinHash — 买家查询所有订单 ──────────
app.get("/escrow/list/:pinHash", async (req, res) => {
  const pinHash = req.params.pinHash;
  try {
    const db = await jsonbinGet();
    const list = Object.values(db)
      .filter((o) => o.pin === pinHash)
      .sort((a, b) => b.at - a.at)
      .map((o) => {
        const safe = { ...o };
        if (o.status !== "done") delete safe.kw;
        return safe;
      });
    res.json(list);
  } catch (e) {
    console.error("GET /escrow/list error:", e);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ═══════════════════════════════════════════════════════════
//  原有聊天 WebSocket 服务（原样保留）
// ═══════════════════════════════════════════════════════════
const server = http.createServer(app);

const wss = new WebSocket.Server({
  server,
  maxPayload: 10 * 1024 * 1024
});

const BARK_KEY  = process.env.BARK_KEY || "a7TwmrfWu7jK2ASRxkiXDB";
const ADMIN_URL = "https://ml-theta-three.vercel.app/admin.html";
let history = [];
const knownUsers = new Set();

wss.on("connection", (ws) => {
  ws.isAlive = true;
  console.log("新客户端已连接");
  ws.send(JSON.stringify({ type: "history", data: history }));
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw);
      const packet = {
        from: String(data.from).toLowerCase().trim(),
        to:   String(data.to).toLowerCase().trim(),
        text: data.text,
        type: data.type || "text",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        id:   "msg_" + Date.now() + Math.random().toString(36).substr(2, 4)
      };

      history.push(packet);
      if (history.length > 100) history.shift();
      console.log(`[转发] ${packet.from} -> ${packet.to} (${packet.type})`);

      if (packet.from !== "admin" && !knownUsers.has(packet.from)) {
        knownUsers.add(packet.from);
        setTimeout(() => {
          const autoReply = {
            from: "admin", to: packet.from,
            text: "稍等", type: "text",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            id: "auto_" + Date.now()
          };
          history.push(autoReply);
          if (history.length > 100) history.shift();
          wss.clients.forEach((c) => {
            if (c.readyState === WebSocket.OPEN)
              c.send(JSON.stringify({ type: "new", data: autoReply }));
          });
        }, 3000);
      }

      if (packet.to === "admin" && packet.from !== "admin") {
        sendBarkNotification();
      }

      wss.clients.forEach((c) => {
        if (c.readyState === WebSocket.OPEN)
          c.send(JSON.stringify({ type: "new", data: packet }));
      });
    } catch (e) {
      console.error("消息解析失败:", e);
    }
  });

  ws.on("close", () => { console.log("客户端已断开"); });
});

function sendBarkNotification() {
  const title = encodeURIComponent("新咨询提醒");
  const body  = encodeURIComponent("收到来自客户的新消息，请查看");
  const url   = `https://api.day.app/${BARK_KEY}/${title}/${body}?url=${encodeURIComponent(ADMIN_URL)}&group=客服`;
  https.get(url, (res) => {
    res.on("data", () => {});
    res.on("end", () => { console.log("Bark 推送已发送"); });
  }).on("error", (err) => { console.error("Bark 推送失败:", err.message); });
}

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => { clearInterval(interval); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================`);
  console.log(`服务启动成功 Port:${PORT}`);
  console.log(`聊天 WebSocket + 担保交易 REST API`);
  console.log(`====================================`);
});