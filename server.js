const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let messages = []; 
const SAVE_TIME = 5 * 60 * 60 * 1000; 

function cleanOldMessages() {
    const now = Date.now();
    messages = messages.filter(m => now - m.time < SAVE_TIME);
}
setInterval(cleanOldMessages, 60 * 1000);

// 用户连接池
const clients = new Map(); 

wss.on("connection", (ws) => {
    let currentUserId = null;

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);

            // 1. 初始化
            if (data.type === "init") {
                currentUserId = data.userId;
                clients.set(currentUserId, ws);
                console.log(`User Logged: ${currentUserId}`);
                return;
            }

            // 2. 历史记录 (严格隔离)
            if (data.type === "history") {
                const history = messages.filter(m =>
                    (m.from === data.userId && m.to === 'admin') || 
                    (m.from === 'admin' && m.to === data.userId)
                );
                ws.send(JSON.stringify({ type: "history", list: history }));
                return;
            }

            // 3. 转发消息 (文本和图片)
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

                // 发送给接收者
                sendToUser(data.to, msgObj);
                // 发送回发送者（解决实时显示问题）
                sendToUser(data.from, msgObj);
            }
        } catch (e) {
            console.error("Msg Error");
        }
    });

    ws.on("close", () => {
        if (currentUserId) clients.delete(currentUserId);
    });
});

function sendToUser(userId, data) {
    const ws = clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

app.get("/", (req, res) => res.send("Server Active"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Running..."));
