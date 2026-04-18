const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.get("/", (req, res) => res.send("Chat Server is Running"));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let history = []; // 存储最近50条消息

wss.on("connection", (ws) => {
    // 连上后同步历史
    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            // 构造标准报文
            const packet = { 
                from: String(data.from).toLowerCase().trim(),
                to: String(data.to).toLowerCase().trim(),
                text: data.text,
                time: new Date().toLocaleTimeString()
            };
            
            history.push(packet);
            if (history.length > 50) history.shift();

            // 全量广播
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "new", data: packet }));
                }
            });
        } catch (e) { console.log("数据解析错误"); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("WebSocket Server Ready"));
