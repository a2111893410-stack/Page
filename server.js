const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const https = require("https");

const app = express();
app.get("/", (req, res) => res.send("Pro Chat Server (Private Mode) is Running"));

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server,
    maxPayload: 10 * 1024 * 1024
});

// --- 配置区 ---
const BARK_KEY = process.env.BARK_KEY || "a7TwmrfWu7jK2ASRxkiXDB";
const ADMIN_URL = "https://ml-theta-three.vercel.app/admin.html";

// --- 状态存储（内存版，重启后会清空。如需持久化请连接数据库） ---
let history = [];
const knownUsers = new Set();
const blacklist = new Set(); // 后端内存黑名单

// 提供一个简单的 HTTP 接口供前端管理员调用来拉黑/解封用户 (可选)
app.get("/api/ban/:uid", (req, res) => {
    blacklist.add(req.params.uid.toLowerCase());
    res.send({ success: true, message: `已拉黑 ${req.params.uid}` });
});
app.get("/api/unban/:uid", (req, res) => {
    blacklist.delete(req.params.uid.toLowerCase());
    res.send({ success: true, message: `已解封 ${req.params.uid}` });
});

wss.on("connection", (ws) => {
    ws.isAlive = true;
    console.log("新客户端已连接");

    // 发送历史记录
    ws.send(JSON.stringify({ type: "history", data: history }));

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            const fromUid = String(data.from).toLowerCase().trim();
            const toUid = String(data.to).toLowerCase().trim();

            // 1. 拦截黑名单用户发消息
            if (blacklist.has(fromUid)) {
                console.log(`[拦截] 黑名单用户 ${fromUid} 尝试发送消息`);
                return; // 直接丢弃消息
            }

            // 记录当前 ws 连接的身份，方便做精准推送
            ws.uid = fromUid; 

            const packet = {
                from: fromUid,
                to: toUid,
                text: data.text,
                type: data.type || 'text',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 4)
            };

            history.push(packet);
            if (history.length > 100) history.shift();

            console.log(`[转发] ${packet.from} -> ${packet.to} (${packet.type})`);

            // --- 自动回复逻辑 ---
            if (packet.from !== "admin" && !knownUsers.has(packet.from)) {
                knownUsers.add(packet.from);
                
                setTimeout(() => {
                    const autoReplyPacket = {
                        from: "admin",
                        to: packet.from,
                        text: "开通永久会员20元，要开通吗？",
                        type: "text",
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        id: 'auto_' + Date.now()
                    };

                    history.push(autoReplyPacket);
                    if (history.length > 100) history.shift();

                    // 【修复】仅将自动回复发给该用户和管理员，不再全网广播
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN && (client.uid === packet.from || client.uid === "admin")) {
                            client.send(JSON.stringify({ type: "new", data: autoReplyPacket }));
                        }
                    });
                }, 3000);
            }

            // --- 脱敏推送 ---
            if (packet.to === "admin" && packet.from !== "admin") {
                sendBarkNotification();
            }

            // 【修复】精准推送：只发给 发送者、接收者 和 管理员
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    // 如果这是全局广播消息(to为空/all)，或者是发给管理员的，或者是发给目标用户的，或者是自己发的
                    if (!packet.to || packet.to === 'all' || client.uid === packet.to || client.uid === "admin" || client.uid === packet.from) {
                        client.send(JSON.stringify({ type: "new", data: packet }));
                    }
                }
            });
        } catch (e) {
            console.error("消息解析失败:", e);
        }
    });

    ws.on("close", () => { console.log("客户端已断开"); });
});

/**
 * 发送 Bark 脱敏提醒
 */
function sendBarkNotification() {
    const title = encodeURIComponent("新咨询提醒");
    const body = encodeURIComponent("收到来自客户的新消息，请查看");
    const barkUrl = `https://api.day.app/${BARK_KEY}/${title}/${body}?url=${encodeURIComponent(ADMIN_URL)}&group=客服&icon=https://dummyimage.com/100/07c160/fff&text=CS`;

    https.get(barkUrl, (res) => {
        res.on('data', () => {});
        res.on('end', () => { console.log('脱敏推送已发送'); });
    }).on('error', (err) => {
        console.error('Bark 推送失败:', err.message);
    });
}

// --- 心跳检测 ---
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => { clearInterval(interval); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`====================================`);
    console.log(`脱敏版服务端启动成功 (含自动回复功能)`);
    console.log(`运行在端口: ${PORT}`);
    console.log(`====================================`);
});
