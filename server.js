const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.get("/", (req, res) => res.send("Pro Chat Server is Running"));

const server = http.createServer(app);

// 增加消息体限制，防止 Base64 图片过大导致崩溃
const wss = new WebSocket.Server({ 
    server,
    maxPayload: 10 * 1024 * 1024 // 设置最大传输限制为 10MB
});

let history = []; // 存储最近 100 条消息

wss.on("connection", (ws) => {
    // --- 1. 初始化连接 ---
    ws.isAlive = true;
    console.log("新客户端已连接");

    // --- 2. 立即同步历史记录 ---
    // 访客端重连后会自动收到之前没看到的旧消息
    ws.send(JSON.stringify({ type: "history", data: history }));

    // --- 3. 处理心跳响应 (Pong) ---
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    // --- 4. 接收并转发消息 ---
    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            
            // 构建标准消息包
            const packet = {
                from: String(data.from).toLowerCase().trim(),
                to: String(data.to).toLowerCase().trim(),
                text: data.text,        // 文本内容或图片的 Base64 编码
                type: data.type || 'text', // text 或 img
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 4)
            };

            // 存入历史记录
            history.push(packet);
            if (history.length > 100) history.shift(); // 保持最近 100 条

            console.log(`[转发] ${packet.from} -> ${packet.to} (${packet.type})`);

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

// --- 5. 心跳检测逻辑 (解决不刷新网页就收不到信息的问题) ---
// 每 30 秒向所有客户端发送 Ping，如果没收到 Pong，则强制断开并触发前端的 onclose 自动重连
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

// --- 6. 启动服务器 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`====================================`);
    console.log(`服务端启动成功！端口：${PORT}`);
    console.log(`WebSocket 地址: wss://你的域名/`);
    console.log(`====================================`);
});
