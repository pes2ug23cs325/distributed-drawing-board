const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1000 });
axios.defaults.httpAgent = httpAgent;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Set();

const REPLICAS = [
  { id: "replica1", url: "http://replica1:4001" },
  { id: "replica2", url: "http://replica2:4002" },
  { id: "replica3", url: "http://replica3:4003" },
];

let leaderUrl = null;
let leaderName = "unknown";
let detectPromise = null;

function detectLeader() {
  if (detectPromise) return detectPromise;
  detectPromise = (async () => {
    try {
      const promises = REPLICAS.map((r) =>
        axios.get(`${r.url}/status`, { timeout: 150 }) 
          .then((res) => (res.data.state === "leader" ? r : null))
          .catch(() => null)
      );
      const results = await Promise.all(promises);
      const leader = results.find((r) => r !== null);
      
      if (leader) {
        if (leaderName !== leader.id) {
          console.log(`[Gateway] Leader is now: ${leader.id}`);
        }
        leaderUrl = leader.url;
        leaderName = leader.id;
      } else {
        leaderUrl = null;
        leaderName = "none";
      }
    } finally {
      detectPromise = null;
    }
    return leaderUrl;
  })();
  return detectPromise;
}

setInterval(detectLeader, 500);

// ─── THE BATCHING QUEUE (The Latency Killer) ─────────────────────────────────
let queue = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  
  if (!leaderUrl) await detectLeader();
  
  if (!leaderUrl) {
    await new Promise(r => setTimeout(r, 50));
    isProcessing = false;
    if (queue.length > 0) processQueue();
    return; 
  }

  // 🔥 BATCHING: Grab up to 50 strokes at once to send in a single HTTP request!
  const batch = queue.splice(0, Math.min(queue.length, 50));

  try {
    const clears = batch.filter(i => i.type === "clear");
    const strokes = batch.filter(i => i.type === "stroke");

    if (clears.length > 0) {
      await axios.post(`${leaderUrl}/clear`, {}, { timeout: 1000 });
      for (const c of clients) {
        if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: "clear" }));
      }
    }

    if (strokes.length > 0) {
      const payloads = strokes.map(s => s.payload);
      
      console.log(`[Gateway] (Step 1) Forwarding BATCH of ${strokes.length} strokes to ${leaderName}...`);
      
      // Send the entire array of strokes to the new /strokes endpoint
      await axios.post(`${leaderUrl}/strokes`, { strokes: payloads }, { timeout: 1500 });
      
      console.log(`[Gateway] (Step 5) Quorum confirmed by ${leaderName}. Broadcasting batch!`);
      
      // Instantly broadcast the successfully saved strokes to the other tabs
      for (const item of strokes) {
        for (const c of clients) {
          if (c !== item.originWs && c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify({ type: "stroke", payload: item.payload }));
          }
        }
      }
    }
  } catch (e) {
    // If it fails, put the batch back at the front of the queue
    queue.unshift(...batch);
    if (e.response && e.response.status === 500) {
      await new Promise(r => setTimeout(r, 5));
    } else {
      leaderUrl = null;
      leaderName = "none";
    }
  }
  
  isProcessing = false;
  // If more strokes arrived while we were sending, immediately process them
  if (queue.length > 0) processQueue();
}

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[Gateway] Client connected. Total: ${clients.size}`);

  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.type === "clear") {
      queue.push({ type: "clear", originWs: ws });
      processQueue();
    }

    if (data.type === "stroke") {
      queue.push({ type: "stroke", payload: data.payload, originWs: ws });
      processQueue(); 
    }
  });

  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));

  detectLeader().then(() => {
    if (leaderUrl) {
       axios.get(`${leaderUrl}/log`, { timeout: 1000 }).then(res => {
           if (res.data && res.data.log && ws.readyState === WebSocket.OPEN) {
               ws.send(JSON.stringify({ type: "init", payload: res.data.log }));
           }
       }).catch(() => {});
    }
  });
});

app.get("/health", (req, res) => res.json({ leader: leaderName, clients: clients.size }));
server.listen(3000, () => console.log("[Gateway] Running on port 3000"));