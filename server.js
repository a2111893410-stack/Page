const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

// 创建服务器
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/**
 * 核心存储
 * messageBuffer: 存储最近的消息，解决一小时内刷新消失问题
 * clients: 存储在线连接，解决消息互通（精准私聊）问题
 */
let messageBuffer = []; 
const clients = new Map(); // Map<userId, ws_connection>

wss.on("connection", (ws) => {
    let currentUserId = null;

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);

            // 1. 初始化/断线重连逻辑
            if (data.type === "init") {
                currentUserId = data.userId;
                clients.set(currentUserId, ws);
                console.log(`[上线] ID: ${currentUserId}`);

                // 【关键】从缓冲区中提取属于这个人的历史记录，发回给前端
                const myHistory = messageBuffer.filter(m => 
                    m.from === currentUserId || m.to === currentUserId
                );
                ws.send(JSON.stringify({ type: "history", list: myHistory }));
                return;
            }

            // 2. 消息转发逻辑
            if (data.type === "msg" || data.type === "img") {
                const msgObj = {
                    from: data.from,
                    to: data.to,
                    type: data.type,
                    text: data.text || null,
                    src: data.src || null,
                    time: Date.now()
                };

                // 存入缓冲区（限制300条，防止内存溢出）
                messageBuffer.push(msgObj);
                if (messageBuffer.length > 300) messageBuffer.shift();

                // 【核心修改】精准投递，不再广播
                // 发给接收者
                const targetWs = clients.get(data.to);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(msgObj));
                }
                
                // 同时也发给自己，确保发送端也能实时看到
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msgObj));
                }
            }
        } catch (e) {
            console.error("解析消息失败:", e);
        }
    });

    // 连接断开处理
    ws.on("close", () => {
        if (currentUserId) {
            clients.delete(currentUserId);
            console.log(`[下线] ID: ${currentUserId}`);
        }
    });

    ws.on("error", (err) => console.log("Socket错误:", err));
});

// Render 健康检查接口
app.get("/", (req, res) => {
    res.send({ 
        status: "running", 
        onlineCount: clients.size, 
        bufferCount: messageBuffer.length 
    });
});

// 启动
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`聊天服务器已启动，端口: ${PORT}`);
});
