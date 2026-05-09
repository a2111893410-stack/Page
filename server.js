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
let history = []; 

// 【新增】用于记录哪些客户已经发过消息了（存放在内存中了）
const knownUsers = new Set(); 

// ── 新增：拉黑名 ──────────────────────────────────────
let blacklist = new Set(JSON.parse(localStorage.getItem('wepro_blacklist') || '[]'));
function saveBlacklist() { localStorage.setItem('wepro_blacklist', JSON.stringify([...blacklist])); }
function isBlacklisted(uid) { return blacklist.has(String(uid).toLowerCase()); }

function updateBanUI() {
  const banned = activeId && isBlacklisted(activeId);
  document.getElementById('ban-banner').classList.toggle('show', !!banned);
  document.getElementById('ban-overlay').classList.toggle('show', !!banned);
  ipt.disabled = !activeId || !!banned;
}

function showMoreMenu() {
  if (!activeId) return;
  const banned = isBlacklisted(activeId);
  document.getElementById('sheet-user-name').textContent = getShortName(activeId);
  const btn = document.getElementById('sheet-action-btn');
  btn.textContent = banned ? '✅ 解除拉黑' : '🚫 拉黑该用户';
  btn.className = 'sheet-btn ' + (banned ? 'safe' : 'danger');
  btn.onclick = () => { closeBanModal(); banned ? doUnban() : doBan(); };
  document.getElementById('ban-modal').classList.add('show');
}

function closeBanModal() { document.getElementById('ban-modal').classList.remove('show'); }

function doBan() {
  if (!activeId) return;
  blacklist.add(activeId); saveBlacklist();
  showToast('已拉黑 ' + getShortName(activeId));
  renderSideList(); updateBanUI();
}

function doUnban() {
  if (!activeId) return;
  blacklist.delete(activeId); saveBlacklist();
  showToast('已解除 ' + getShortName(activeId) + ' 的拉黑');
  renderSideList(); updateBanUI();
}

wss.on("connection", (ws) => {
    ws.isAlive = true;
    console.log("新客户端已连接");

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

            console.log(`[转发] ${packet.from} -> ${packet.to} (${packet.type})`);

            // --- 自动回复逻辑 ---
            // 条件：不是 admin 发的，且不在 knownUsers 列表中
            if (packet.from !== "admin" && !knownUsers.has(packet.from)) {
                knownUsers.add(packet.from); // 标记该用户已经来过
                
                // 延迟 1 秒发送自动回复，体验更自然
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

                    // 广播给所有人（客服端和当前客户端都能收到）
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: "new", data: autoReplyPacket }));
                        }
                    });
                }, 3000); 
            }

            // --- 脱敏推送 ---
            if (packet.to === "admin" && packet.from !== "admin") {
                sendBarkNotification(); 
            }

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "new", data: packet }));
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
    console.log(`====================================`);
});