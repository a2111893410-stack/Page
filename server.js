const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            console.log("转发消息:", data);
            
            // 收到任何消息，直接广播给所有连接的人
            const msgString = JSON.stringify(data);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msgString);
                }
            });
        } catch (e) { console.error("解析失败"); }
    });
});

app.get("/", (req, res) => res.send({ status: "running", online: wss.clients.size }));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server Active"));
