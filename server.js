const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let messageBuffer = []; 
const clients = new Map(); // 存储 userId -> ws

wss.on("connection", (ws) => {
    let currentId = null;

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);

            // 路由 A: 身份初始化
            if (data.type === "init") {
                currentId = data.userId;
                clients.set(currentId, ws);
                console.log(`[身份绑定成功] ID: ${currentId}`);
                
                // 推送历史记录
                const myHistory = messageBuffer.filter(m => m.from === currentId || m.to === currentId);
                ws.send(JSON.stringify({ type: "history", list: myHistory }));
                return;
            }

            // 路由 B: 消息转发
            if (data.type === "msg") {
                const msgObj = { 
                    ...data, 
                    msgId: 'M-' + Date.now() + '-' + Math.random().toString(16).slice(2,5) 
                };
                messageBuffer.push(msgObj);
                if (messageBuffer.length > 300) messageBuffer.shift();

                // 寻找目标连接
                const targetWs = clients.get(data.to);
                
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(msgObj));
                    console.log(`[路由成功] 从 ${data.from} 发往 ${data.to}`);
                } else {
                    console.log(`[路由失败] 目标 ${data.to} 不在线或连接已失效`);
                }

                // 无论如何，发回给自己一份用于回显
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msgObj));
                }
            }
        } catch (e) { console.log("数据解析失败"); }
    });

    ws.on("close", () => {
        if (currentId) clients.delete(currentId);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Service Active"));
