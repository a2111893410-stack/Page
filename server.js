const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let msgHistory = []; // 存储最近的聊天记录

wss.on("connection", (ws) => {
    // 1. 连上就送出所有历史
    ws.send(JSON.stringify({ type: "history", data: msgHistory }));

    ws.on("message", (raw) => {
        try {
            const obj = JSON.parse(raw);
            // 补全时间戳和唯一ID
            const packet = { 
                ...obj, 
                id: Date.now() + Math.random().toString(36).substr(2,4) 
            };
            
            msgHistory.push(packet);
            if (msgHistory.length > 200) msgHistory.shift();

            // 2. 暴力广播：发给当前连接的所有人
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "new_msg", data: packet }));
                }
            });
        } catch (e) {}
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Broadcaster Running"));
