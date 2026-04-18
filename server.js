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

            if (data.type === "init") {
                currentId = data.userId;
                // 强行覆盖旧连接，确保最新
                clients.set(currentId, ws);
                const myHistory = messageBuffer.filter(m => m.from === currentId || m.to === currentId);
                ws.send(JSON.stringify({ type: "history", list: myHistory }));
                return;
            }

            if (data.type === "msg") {
                // 生成唯一消息ID，解决重复显示问题
                const msgObj = { 
                    ...data, 
                    id: Date.now() + Math.random().toString(16).slice(2, 8) 
                };
                
                messageBuffer.push(msgObj);
                if (messageBuffer.length > 500) messageBuffer.shift();

                // 发送给目标
                const targetWs = clients.get(data.to);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(msgObj));
                }
                // 发送给自己（回显）
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msgObj));
                }
            }
        } catch (e) { console.error("Data error"); }
    });

    ws.on("close", () => {
        if (currentId && clients.get(currentId) === ws) {
            clients.delete(currentId);
        }
    });
});

// 每30秒发一次心跳，防止Render关掉连接
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:"ping"}));
    });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running`));
