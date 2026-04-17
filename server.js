const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

/**
 * 基础配置
 */
const app = express();
app.use(cors()); // 允许前端跨域访问

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 内存存储：保存最近的消息（重启后会清空）
let messageHistory = []; 
// 连接池：存储在线用户 userId -> ws 实例
const clients = new Map(); 

wss.on("connection", (ws) => {
    let currentId = null;

    ws.on("message", (rawMsg) => {
        try {
            const data = JSON.parse(rawMsg);

            // --- 路由逻辑 ---
            switch (data.type) {
                // 1. 身份注册
                case "init":
                    currentId = data.userId;
                    clients.set(currentId, ws);
                    console.log(`[用户上线]: ${currentId}`);
                    break;

                // 2. 拉取私聊历史记录
                case "history":
                    const history = messageHistory.filter(m => 
                        (m.from === data.userId && m.to === 'admin') || 
                        (m.from === 'admin' && m.to === data.userId)
                    );
                    ws.send(JSON.stringify({ type: "history", list: history }));
                    break;

                // 3. 转发消息（文字或图片）
                case "msg":
                case "img":
                    const msgObj = {
                        from: data.from,
                        to: data.to,
                        type: data.type,
                        text: data.text || null,
                        src: data.src || null,
                        time: Date.now()
                    };

                    // 存入内存记录
                    messageHistory.push(msgObj);
                    if (messageHistory.length > 2000) messageHistory.shift();

                    // 【核心转发】：发给接收者
                    const targetWs = clients.get(data.to);
                    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                        targetWs.send(JSON.stringify(msgObj));
                    }

                    // 【同步显示】：同时也发回给发送者自己
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(msgObj));
                    }
                    break;
            }
        } catch (e) {
            console.error("消息解析错误:", e);
        }
    });

    // 离线处理
    ws.on("close", () => {
        if (currentId) {
            clients.delete(currentId);
            console.log(`[用户下线]: ${currentId}`);
        }
    });

    ws.on("error", (err) => console.log("Socket错误:", err));
});

// 健康检查接口：防止 Render 认为部署失败
app.get("/", (req, res) => {
    res.send({ status: "running", online: clients.size });
});

// 端口监听：Render 必须使用 process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is active on port ${PORT}`);
});
