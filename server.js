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
