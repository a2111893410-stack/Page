const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.get("/", (req, res) => res.send("Server is Alive"));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let history = [];

wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            const packet = { ...data, id: Date.now() + Math.random().toString(36).substr(2,4) };
            history.push(packet);
            if (history.length > 50) history.shift();

            console.log(`[转发] 从: ${data.from} -> 到: ${data.to} | 内容: ${data.text}`);

            wss.clients.forEach(c => {
                if (c.readyState === WebSocket.OPEN) {
                    c.send(JSON.stringify({ type: "new", data: packet }));
                }
            });
        } catch (e) {}
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Broadcaster Running"));
