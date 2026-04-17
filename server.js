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
    let myId = null;

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        if (data.type === "init") {
            myId = data.userId;
            clients.set(myId, ws);
            return;
        }

        if (data.type === "history") {
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

            // 1. 发给接收者
            const targetWs = clients.get(data.to);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify(msgObj));
            }
            // 2. 发回给发送者自己 (确保实时显示)
            ws.send(JSON.stringify(msgObj));
        }
    });

    ws.on("close", () => { if (myId) clients.delete(myId); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Chat Ready"));
// ... 前面部分保持不变 ...

if (data.type === "msg" || data.type === "img") {
    const msgObj = {
        from: data.from,
        to: data.to,
        type: data.type,
        text: data.text || null,
        src: data.src || null,
        time: Date.now()
    };

    messages.push(msgObj);

    // 1. 发送给目标接收者
    const targetWs = clients.get(data.to);
    if (targetWs && targetWs.readyState === 1) { // 1 = WebSocket.OPEN
        targetWs.send(JSON.stringify(msgObj));
    }

    // 2. 发回给发送者（这一步至关重要，让发送者能实时看到自己的消息）
    ws.send(JSON.stringify(msgObj));
}

