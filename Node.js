// ════════════════════════════════════════════════════════
//  云端存储：对接自己的后端服务器
// ════════════════════════════════════════════════════════
const BACKEND_API = "http://localhost:3000/api/orders"; // 你的后端接口地址

async function cloudLoad() {
  // 先用本地缓存保证离线可用
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) memCache = JSON.parse(local);
  } catch {}

  try {
    // 请求自己的后端，无需在前端暴露任何密钥
    const response = await fetch(BACKEND_API, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    
    if (response.ok) {
      const data = await response.json();
      memCache = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memCache));
      setSyncStatus("ok");
    } else {
      throw new Error("后端响应异常");
    }
    return memCache || {};
  } catch (err) {
    console.error("读取失败:", err);
    setSyncStatus(memCache ? "warn" : "err");
    return memCache || {};
  }
}

async function cloudSave(data) {
  memCache = data;
  const json = JSON.stringify(data);
  localStorage.setItem(STORAGE_KEY, json);
  
  try {
    // 将新数据发送给后端，由后端负责安全地写入 JSONBin
    const response = await fetch(BACKEND_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json
    });

    if (response.ok) {
      setSyncStatus("ok");
    } else {
      throw new Error("后端保存异常");
    }
  } catch (err) {
    console.error("保存失败:", err);
    setSyncStatus("warn");
  }
}
