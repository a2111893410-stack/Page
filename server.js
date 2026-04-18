const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const https = require("https"); 

const app = express();
app.get("/", (req, res) => res.send("Pro Chat Server (Private Mode) is Running"));

const server = http.createServer(app);

// 增加消息体限制，防止 Base64 图片过大导致崩溃
const wss = new WebSocket.Server({ 
    server,
    maxPayload: 10 * 1024 * 1024 // 10MB
});

// --- 配置区 ---
// 建议：在 Render 后台设置名为 BARK_KEY 的环境变量，更安全
const BARK_KEY = process.env.BARK_KEY || "a7TwmrfWu7jK2ASRxkiXDB"; 
const ADMIN_URL = "https://ml-theta-three.vercel.app/admin.html"; 
let history = []; 

wss.on("connection", (ws) => {
    ws.isAlive = true;
    console.log("新客户端已连接");

    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            
            const packet = {
                from: String(data.from).toLowerCase().trim(),
                to: String(data.to).toLowerCase().trim(),
                text: data.text,        
                type: data.type || 'text', 
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 4)
            };

            history.push(packet);
            if (history.length > 100) history.shift();

            console.log(`[转发] ${packet.from} -> ${packet.to} (${packet.type})`);

            // --- 核心修改：脱敏推送 ---
            if (packet.to === "admin" && packet.from !== "admin") {
                sendBarkNotification(); // 不再传递 packet，确保推送内容固定
            }

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "new", data: packet }));
                }
            });
        } catch (e) {
            console.error("消息解析失败:", e);
        }
    });

    ws.on("close", () => { console.log("客户端已断开"); });
});

/**
 * 发送 Bark 脱敏提醒
 */
function sendBarkNotification() {
    const title = encodeURIComponent("新咨询提醒");
    // 固定字符串，不包含任何聊天原文
    const body = encodeURIComponent("收到来自客户的新消息，请查看");
    
    // 构造 Bark URL
    const barkUrl = `https://api.day.app/${BARK_KEY}/${title}/${body}?url=${encodeURIComponent(ADMIN_URL)}&group=客服&icon=https://dummyimage.com/100/07c160/fff&text=CS`;

    https.get(barkUrl, (res) => {
        res.on('data', () => {}); // 消耗数据流
        res.on('end', () => { console.log('脱敏推送已发送'); });
    }).on('error', (err) => {
        console.error('Bark 推送失败:', err.message);
    });
}

// --- 心跳检测 ---
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => { clearInterval(interval); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`====================================`);
    console.log(`脱敏版服务端启动成功！`);
    console.log(`隐私保护状态：已开启 (Bark 不处理消息原文)`);
    console.log(`====================================`);
});
