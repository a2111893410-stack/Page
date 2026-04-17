const express = require("express");  
const http = require("http");  
const WebSocket = require("ws");  
const cors = require("cors");  
  
const app = express();  
app.use(cors());  
  
const server = http.createServer(app);  
const wss = new WebSocket.Server({ server });  
  
/* =========================  
   内存存储（5小时自动清理）  
========================= */  
let messages = [];   
// {from,to,type,text,src,time}  
  
const SAVE_TIME = 5 * 60 * 60 * 1000; // 5小时  
  
function cleanOldMessages(){  
  const now = Date.now();  
  messages = messages.filter(m => now - m.time < SAVE_TIME);  
}  
setInterval(cleanOldMessages, 60 * 1000);  
  
/* =========================  
   用户连接池  
========================= */  
const clients = new Map();   
// userId -> ws  
  
/* =========================  
   WebSocket核心  
========================= */  
wss.on("connection", (ws) => {  
  
  let userId = null;  
  
  ws.on("message", (msg) => {  
    const data = JSON.parse(msg);  
  
    /* 初始化 */  
    if(data.type === "init"){  
      userId = data.userId;  
      clients.set(userId, ws);  
      return;  
    }  
  
    /* 历史记录 */  
    if(data.type === "history"){  
      const history = messages.filter(m =>  
        m.from === data.userId || m.to === data.userId  
      );  
  
      ws.send(JSON.stringify({  
        type:"history",  
        list:history  
      }));  
      return;  
    }  
  
    /* ===== 文本消息 ===== */  
    if(data.type === "msg"){  
      const msgObj = {  
        from: data.from,  
        to: data.to,  
        type: "msg",  
        text: data.text,  
        time: Date.now()  
      };  
  
      messages.push(msgObj);  
  
      sendToUser(data.to, msgObj);  
      sendToUser(data.from, msgObj);  
    }  
  
    /* ===== 图片消息 ===== */  
    if(data.type === "img"){  
      const msgObj = {  
        from: data.from,  
        to: data.to,  
        type: "img",  
        src: data.src,  
        time: Date.now()  
      };  
  
      messages.push(msgObj);  
  
      sendToUser(data.to, msgObj);  
      sendToUser(data.from, msgObj);  
    }  
  
  });  
  
  ws.on("close", ()=>{  
    if(userId) clients.delete(userId);  
  });  
});  
  
/* =========================  
   发送函数  
========================= */  
function sendToUser(userId, data){  
  const ws = clients.get(userId);  
  if(ws && ws.readyState === 1){  
    ws.send(JSON.stringify(data));  
  }  
}  
  
/* =========================  
   HTTP检查  
========================= */  
app.get("/", (req,res)=>{  
  res.send("Chat server running");  
});  
  
/* =========================  
   启动  
========================= */  
const PORT = process.env.PORT || 3000;  
server.listen(PORT, ()=>{  
  console.log("Server running on port", PORT);  
});  
