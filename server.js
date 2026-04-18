const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let messageBuffer = []; 

wss.on("connection", (ws) => {
    console.log("新连接已建立");
    // 连接时同步历史
    ws.send(JSON.stringify({ type: "history", list: messageBuffer }));

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            if (data.type === "msg") {
                const msgObj = { 
                    ...data, 
                    msgId: 'ID-' + Date.now() + Math.random().toString(36).substr(2, 4) 
                };
                messageBuffer.push(msgObj);
                if (messageBuffer.length > 300) messageBuffer.shift();

                console.log(`广播消息: 从 ${data.from} 发往 ${data.to}: ${data.text}`);

                // 全量广播给所有人
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msgObj));
                    }
                });
            }
        } catch (e) {
            console.log("解析失败");
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server is running..."));
