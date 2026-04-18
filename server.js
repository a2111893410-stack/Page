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

            // 1. 登录与历史同步
            if (data.type === "init") {
                currentId = data.userId;
                clients.set(currentId, ws);
                const myHistory = messageBuffer.filter(m => m.from === currentId || m.to === currentId);
                ws.send(JSON.stringify({ type: "history", list: myHistory }));
                return;
            }

            // 2. 消息精准转发
            if (data.type === "msg") {
                const msgObj = { ...data, time: Date.now() };
                messageBuffer.push(msgObj);
                if (messageBuffer.length > 500) messageBuffer.shift();

                // 投递给目标
                const targetWs = clients.get(data.to);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(msgObj));
                }
                // 投递给自己（用于回显确认）
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msgObj));
                }
            }
        } catch (e) { console.error("Data error"); }
    });

    ws.on("close", () => { if (currentId) clients.delete(currentId); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
