const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let msgHistory = []; 

// 心跳逻辑：防止 Render 自动断开连接
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(); // 向客户端发送 ping
    });
}, 20000);

wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; }); // 收到客户端响应则标记存活

    // 同步历史记录
    ws.send(JSON.stringify({ type: "history", data: msgHistory }));

    ws.on("message", (raw) => {
        try {
            const obj = JSON.parse(raw);
            if (obj.type === "msg") {
                const packet = { 
                    ...obj, 
                    id: 'ID' + Date.now() + Math.random().toString(36).substr(2,4) 
                };
                msgHistory.push(packet);
                if (msgHistory.length > 200) msgHistory.shift();

                // 广播给所有人
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: "new_msg", data: packet }));
                    }
                });
            }
        } catch (e) { console.error("解析失败"); }
    });

    ws.on('close', () => console.log("连接断开"));
});

wss.on('close', () => clearInterval(interval));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port " + PORT));
