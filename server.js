const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
// 确保访问首页有文字，证明服务活着
app.get("/", (req, res) => res.send("Chat Server is Live"));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let history = [];

wss.on("connection", (ws) => {
    // 连上后立即同步
    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            const packet = { 
                ...data, 
                id: Date.now() + Math.random().toString(36).substr(2,4) 
            };
            history.push(packet);
            if (history.length > 100) history.shift();

            // 广播给所有人
            wss.clients.forEach(c => {
                if (c.readyState === WebSocket.OPEN) {
                    c.send(JSON.stringify({ type: "new", data: packet }));
                }
            });
        } catch (e) {}
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Ready"));
