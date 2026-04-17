const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let messages = []; 
const clients = new Map(); 

wss.on("connection", (ws) => {
    let currentUserId = null;

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);

            if (data.type === "init") {
                currentUserId = data.userId;
                clients.set(currentUserId, ws);
                return;
            }

            if (data.type === "history") {
                // 返回该用户与 admin 之间的历史
                const history = messages.filter(m => 
                    (m.from === data.userId && m.to === 'admin') || 
                    (m.from === 'admin' && m.to === data.userId)
                );
                ws.send(JSON.stringify({ type: "history", list: history }));
                return;
            }

            if (data.type === "msg" || data.type === "img") {
                const msgObj = { ...data, time: Date.now() };
                messages.push(msgObj);

                // 转发给目标
                const targetWs = clients.get(data.to);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(msgObj));
                }
                // 同时也发给自己，确保界面实时更新
                ws.send(JSON.stringify(msgObj));
            }
        } catch (e) {}
    });

    ws.on("close", () => {
        if (currentUserId) clients.delete(currentUserId);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running..."));
