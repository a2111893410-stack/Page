const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());

// 创建 HTTP 服务器
const server = http.createServer(app);
// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

/**
 * 内存存储消息列表
 * 实际项目中建议使用 Redis 或 MongoDB
 */
let messageHistory = []; 
const MAX_HISTORY = 1000; // 最大存储消息条数，防止内存溢出

/**
 * 在线用户映射表
 * Key: userId (如 '访客-ABCDE' 或 'admin')
 * Value: WebSocket 实例
 */
const clients = new Map();

wss.on("connection", (ws) => {
    let currentId = null;

    ws.on("message", (rawMsg) => {
        try {
            const data = JSON.parse(rawMsg);

            switch (data.type) {
                // 1. 初始化连接：将用户ID与连接绑定
                case "init":
                    currentId = data.userId;
                    clients.set(currentId, ws);
                    console.log(`[上线] 用户: ${currentId}`);
                    break;

                // 2. 获取历史记录：实现会话隔离
                case "history":
                    const history = messageHistory.filter(m => 
                        (m.from === data.userId && m.to === 'admin') || 
                        (m.from === 'admin' && m.to === data.userId)
                    );
                    ws.send(JSON.stringify({ type: "history", list: history }));
                    break;

                // 3. 处理转发消息（文字或图片）
                case "msg":
                case "img":
                    const msgObj = {
                        from: data.from,
                        to: data.to,
                        type: data.type,
                        text: data.text || null,
                        src: data.src || null, // 图片Base64
                        time: Date.now()
                    };

                    // 存入内存历史
                    messageHistory.push(msgObj);
                    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

                    // 【核心逻辑】精准投递给接收者
                    const receiverWs = clients.get(data.to);
                    if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
                        receiverWs.send(JSON.stringify(msgObj));
                        console.log(`[转发] 从 ${data.from} 到 ${data.to}`);
                    }

                    // 【核心逻辑】发回给发送者，确保其界面立即显示
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(msgObj));
                    }
                    break;

                default:
                    console.warn("未知消息类型:", data.type);
            }
        } catch (err) {
            console.error("处理消息失败:", err);
        }
    });

    // 处理连接断开
    ws.on("close", () => {
        if (currentId) {
            clients.delete(currentId);
            console.log(`[下线] 用户: ${currentId}`);
        }
    });

    // 错误处理
    ws.on("error", (err) => {
        console.error(`[连接错误] 用户 ${currentId}:`, err);
    });
});

// 定时清理（可选）：比如每小时清理一次过期内存
setInterval(() => {
    const fiveHoursAgo = Date.now() - (5 * 60 * 60 * 1000);
    messageHistory = messageHistory.filter(m => m.time > fiveHoursAgo);
}, 10 * 60 * 1000);

// 健康检查接口（用于 Render 存活检查）
app.get("/", (req, res) => {
    res.status(200).send({
        status: "Running",
        online_count: clients.size,
        history_count: messageHistory.length
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`后端服务已启动！`);
    console.log(`端口: ${PORT}`);
    console.log(`WebSocket地址: wss://你的域名:${PORT}`);
    console.log(`=================================`);
});
