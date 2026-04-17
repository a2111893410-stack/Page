const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 关键：内存缓冲区（只存1小时内或200条）
let msgBuffer = []; 
const clients = new Map();

wss.on("connection", (ws) => {
    let myId = null;

    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);

            // 1. 初始化：拉取属于自己的私有历史
            if (data.type === "init") {
                myId = data.userId;
                clients.set(myId, ws);
                
                // 只把跟“我”相关的历史发回来
                const myHistory = msgBuffer.filter(m => m.from === myId || m.to === myId);
                ws.send(JSON.stringify({ type: "history", list: myHistory }));
                return;
            }

            // 2. 消息转发：严格私聊
            if (data.type === "msg") {
                const msgObj = { ...data, time: Date.now() };
                msgBuffer.push(msgObj);
                if(msgBuffer.length > 300) msgBuffer.shift(); // 限制内存

                // 精准投递：只发给接收者和发送者自己
                const targetWs = clients.get(data.to);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(msgObj));
                }
                ws.send(JSON.stringify(msgObj)); 
            }
        } catch (e) {}
    });

    ws.on("close", () => { if (myId) clients.delete(myId); });
});

server.listen(process.env.PORT || 3000);

// 1. 初始化时，先渲染本地缓存，再连接Socket拉取最新的
let myId = localStorage.getItem('chat_uid') || 'U' + Math.random().toString(36).substr(2,5);
localStorage.setItem('chat_uid', myId);

// 恢复本地快照（即便没网，以前聊的也得在）
const localData = JSON.parse(localStorage.getItem('chat_records_' + myId) || '[]');
localData.forEach(m => renderMsg(m));

const socket = new WebSocket('wss://page-c4hm.onrender.com');

socket.onopen = () => {
    socket.send(JSON.stringify({ type: "init", userId: myId }));
};

socket.onmessage = (e) => {
    const res = JSON.parse(e.data);

    // 情况A：收到的是历史同步包（用来填补断网期间的空缺）
    if (res.type === "history") {
        // 合并去重并更新本地存储
        localStorage.setItem('chat_records_' + myId, JSON.stringify(res.list));
        refreshUI(res.list);
        return;
    }

    // 情况B：收到的是实时私聊
    if (res.from === myId || res.to === myId) {
        renderMsg(res);
        saveToLocal(res);
    }
};

function saveToLocal(msg) {
    let history = JSON.parse(localStorage.getItem('chat_records_' + myId) || '[]');
    history.push(msg);
    localStorage.setItem('chat_records_' + myId, JSON.stringify(history.slice(-50)));
}

