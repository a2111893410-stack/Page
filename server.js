const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.get("/", (req, res) => res.send("Chat Server is Active"));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let history = []; // 内存存储最近100条记录

wss.on("connection", (ws) => {
    // 1. 连上立即下发历史记录
    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            const packet = { 
                ...data, 
                id: 'M-' + Date.now() + Math.random().toString(36).substr(2,4) 
            };
            
            history.push(packet);
            if (history.length > 100) history.shift();

            // 2. 广播：推送到每一个在线的窗口
            wss.clients.forEach(c => {
                if (c.readyState === WebSocket.OPEN) {
                    c.send(JSON.stringify({ type: "new", data: packet }));
                }
            });
        } catch (e) { console.error("解析错误"); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Broadcaster Running on " + PORT));
