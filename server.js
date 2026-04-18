const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
// 基础路由，用于检查服务是否存活
app.get("/", (req, res) => res.send("Chat Server is Online"));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let history = [];

wss.on("connection", (ws) => {
    console.log("New Connection established");
    
    // 连上后立即同步历史
    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on("message", (message) => {
        try {
            const parsed = JSON.parse(message);
            if (parsed.type === "msg") {
                const packet = {
                    ...parsed,
                    id: Date.now() + Math.random().toString(16).slice(2, 6)
                };
                history.push(packet);
                if (history.length > 200) history.shift();

                // 暴力广播给所有人
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(packet));
                    }
                });
            }
        } catch (err) {
            console.error("Payload error:", err);
        }
    });

    ws.on("error", (err) => console.error("Socket error:", err));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
