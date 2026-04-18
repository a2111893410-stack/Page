const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 内存缓冲区：重启前记录所有聊天
let messageBuffer = []; 

wss.on("connection", (ws) => {
    // 1. 只要有人连上来，立刻把所有历史记录同步过去
    ws.send(JSON.stringify({ type: "history", list: messageBuffer }));

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            
            // 2. 只处理消息类型
            if (data.type === "msg") {
                const msgObj = { 
                    ...data, 
                    msgId: 'ID-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5) 
                };

                // 存入历史（最多500条）
                messageBuffer.push(msgObj);
                if (messageBuffer.length > 500) messageBuffer.shift();

                // 3. 全局广播：不挑人，发给当前所有在线的 WebSocket 客户端
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msgObj));
                    }
                });
            }
        } catch (e) {
            console.error("解析失败");
        }
    });
});

// 健康检查
app.get("/", (req, res) => res.send({ status: "active", buffer: messageBuffer.length }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Mirror Server on ${PORT}`));
