const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 内存缓冲区（重启会清空，但只要不重启，一小时内消息都在）
let messageBuffer = []; 
const clients = new Map(); 

wss.on("connection", (ws) => {
    let currentUserId = null;

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            
            // 路由 A: 初始化身份
            if (data.type === "init") {
                currentUserId = data.userId;
                clients.set(currentUserId, ws);
                console.log(`[用户登录] ID: ${currentUserId}`);
                
                // 将缓冲区中属于该用户的历史同步回去
                const history = messageBuffer.filter(m => m.from === currentUserId || m.to === currentUserId);
                ws.send(JSON.stringify({ type: "history", list: history }));
                return;
            }

            // 路由 B: 转发私聊消息
            if (data.type === "msg") {
                const msgObj = {
                    ...data,
                    msgId: Date.now() + Math.random().toString(16).slice(2, 8),
                    time: new Date().toLocaleTimeString()
                };

                // 存入缓冲区
                messageBuffer.push(msgObj);
                if (messageBuffer.length > 500) messageBuffer.shift();

                // 【核心：双向投递】
                // 1. 发给目标人
                const target = clients.get(data.to);
                if (target && target.readyState === WebSocket.OPEN) {
                    target.send(JSON.stringify(msgObj));
                    console.log(`[转发成功] 从 ${data.from} 到 ${data.to}`);
                } else {
                    console.log(`[转发失败] 目标 ${data.to} 不在线`);
                }

                // 2. 发回给发送者（用于回显）
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msgObj));
                }
            }
        } catch (err) {
            console.error("解析错误");
        }
    });

    ws.on("close", () => {
        if (currentUserId) clients.delete(currentUserId);
    });
});

// 健康检查与保活
app.get("/", (req, res) => res.send({ status: "running", online: clients.size }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
