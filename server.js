const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const https = require("https"); // 新增：用于发送 Bark 推送请求

const app = express();
app.get("/", (req, res) => res.send("Pro Chat Server is Running"));

const server = http.createServer(app);

// 增加消息体限制，防止 Base64 图片过大导致崩溃
const wss = new WebSocket.Server({ 
    server,
    maxPayload: 10 * 1024 * 1024 // 设置最大传输限制为 10MB
});

// --- 配置区 ---
const BARK_KEY = "a7TwmrfWu7jK2ASRxkiXDB"; // 你的 Bark 密钥
const ADMIN_URL = "https://ml-theta-three.vercel.app/admin.html"; // 你的客服端地址
let history = []; // 存储最近 100 条消息

wss.on("connection", (ws) => {
    ws.isAlive = true;
    console.log("新客户端已连接");

    // 立即同步历史记录
    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            
            // 构建标准消息包
            const packet = {
                from: String(data.from).toLowerCase().trim(),
                to: String(data.to).toLowerCase().trim(),
                text: data.text,        
                type: data.type || 'text', 
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 4)
            };

            // 存入历史记录
            history.push(packet);
            if (history.length > 100) history.shift();

            console.log(`[转发] ${packet.from} -> ${packet.to} (${packet.type})`);

            // --- 核心：Bark 消息推送逻辑 ---
            // 只有发给 admin 的消息才推送，避免循环提醒
            if (packet.to === "admin" && packet.from !== "admin") {
                sendBarkNotification(packet);
            }

            // 广播给所有在线客户端
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "new", data: packet }));
                }
            });
        } catch (e) {
            console.error("消息解析失败:", e);
        }
    });

    ws.on("close", () => {
        console.log("客户端已断开");
    });
});

/**
 * 发送 Bark 推送函数
 */
function sendBarkNotification(packet) {
    const title = encodeURIComponent("客服系统有新消息");
    // 如果是图片，通知显示 [图片]，否则显示具体文本（截取前50字）
    const content = packet.type === 'img' ? '[图片消息]' : packet.text.substring(0, 50);
    const body = encodeURIComponent(content);
    
    // 构造 Bark 完整 URL
    // url 参数确保点击通知后直接打开你的 Vercel 客服端
    // group 参数将通知分类为“客服”
    // icon 参数设置一个绿色的客服小图标
    const barkUrl = `https://api.day.app/${BARK_KEY}/${title}/${body}?url=${encodeURIComponent(ADMIN_URL)}&group=客服&icon=https://dummyimage.com/100/07c160/fff&text=CS`;

    https.get(barkUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { console.log('Bark 推送成功响应:', data); });
    }).on('error', (err) => {
        console.error('Bark 推送失败:', err.message);
    });
}

// --- 心跳检测逻辑 ---
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`====================================`);
    console.log(`服务端启动成功！端口：${PORT}`);
    console.log(`Bark 推送已配置，目标：${BARK_KEY}`);
    console.log(`====================================`);
});
