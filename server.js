const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let messageBuffer = []; 
const clients = new Map(); 

wss.on("connection", (ws) => {
    let currentId = null;

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);

            if (data.type === "init") {
                currentId = data.userId.trim(); // 去空格
                clients.set(currentId, ws);
                const myHistory = messageBuffer.filter(m => m.from === currentId || m.to === currentId);
                ws.send(JSON.stringify({ type: "history", list: myHistory }));
                return;
            }

            if (data.type === "msg") {
                const msgObj = { 
                    ...data, 
                    msgId: 'M' + Date.now() + Math.random().toString(16).slice(2,5)
                };
                messageBuffer.push(msgObj);
                if (messageBuffer.length > 300) messageBuffer.shift();

                // 策略：先尝试精准推送
                let delivered = false;
                const targetWs = clients.get(data.to);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(msgObj));
                    delivered = true;
                }

                // 保底策略：如果精准推送没成功，或者发给访客的消息，直接全量广播
                // 让前端自己根据 to 字段识别
                if (!delivered || data.from === "admin") {
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(msgObj));
                        }
                    });
                } else {
                    // 确保发送者自己能收到回显
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msgObj));
                }
            }
        } catch (e) {}
    });

    ws.on("close", () => {
        if (currentId) clients.delete(currentId);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("System Running"));
