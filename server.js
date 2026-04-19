const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const https = require("https"); 

const app = express();
app.get("/", (req, res) => res.send("Pro Chat Server (Private Mode) is Running"));

const server = http.createServer(app);

// 消息体限制
const wss = new WebSocket.Server({ 
    server,
    maxPayload: 10 * 1024 * 1024 
});

// --- 配置区 ---
const BARK_KEY = process.env.BARK_KEY || "a7TwmrfWu7jK2ASRxkiXDB"; 
const ADMIN_URL = "https://ml-theta-three.vercel.app/admin.html"; 
let history = []; 
const knownUsers = new Set(); // 记录已打过招呼的用户

wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            const packet = {
                from: String(data.from).toLowerCase().trim(),
                to: String(data.to).toLowerCase().trim(),
                text: data.text,        
                type: data.type || 'text', 
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 4)
            };

            history.push(packet);
            if (history.length > 100) history.shift();

            // --- 自动回复与正在输入逻辑 ---
            if (packet.from !== "admin" && !knownUsers.has(packet.from)) {
                knownUsers.add(packet.from);
                
                // 1. 立即通知客户端：对方正在输入
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            type: "typing", 
                            from: "admin", 
                            to: packet.from 
                        }));
                    }
                });

                // 2. 3秒后发送正式内容
                setTimeout(() => {
                    const autoReply = {
                        from: "admin",
                        to: packet.from,
                        text: "看片群20元永久看，上万部资源，小学初中高中，萝莉御姐熟女等等所有类型都有，每天更新，要进群吗？",
                        type: "text",
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        id: 'auto_' + Date.now()
                    };
                    history.push(autoReply);
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: "new", data: autoReply }));
                        }
                    });
                }, 5000); 
            }

            // 脱敏推送
            if (packet.to === "admin" && packet.from !== "admin") {
                sendBarkNotification(); 
            }

            // 正常广播消息
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "new", data: packet }));
                }
            });
        } catch (e) { console.error("解析失败:", e); }
    });

    ws.on("close", () => { console.log("断开连接"); });
});

function sendBarkNotification() {
    const title = encodeURIComponent("新咨询提醒");
    const body = encodeURIComponent("收到客户新消息");
    const barkUrl = `https://api.day.app/${BARK_KEY}/${title}/${body}?url=${encodeURIComponent(ADMIN_URL)}&group=客服&icon=https://dummyimage.com/100/07c160/fff&text=CS`;
    https.get(barkUrl, (res) => { res.on('data', () => {}); });
}

const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`后端启动成功，端口: ${PORT}`));
