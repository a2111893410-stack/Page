const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

let history = [];
wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "history", data: history }));
    ws.on("message", (raw) => {
        try {
            const data = JSON.parse(raw);
            const packet = { ...data, id: Date.now() };
            history.push(packet);
            if (history.length > 50) history.shift();
            // 广播给所有人
            wss.clients.forEach(c => {
                if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: "new", data: packet }));
            });
        } catch (e) {}
    });
});
