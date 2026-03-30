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

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Set();

const REPLICAS = [
  { id: "replica1", url: "http://replica1:4001" },
  { id: "replica2", url: "http://replica2:4002" },
  { id: "replica3", url: "http://replica3:4003" },
];

let leaderUrl = null;
let leaderName = "none";

// ─── Leader detection ─────────────────────────────────────────────────────────

async function detectLeader() {
  for (const r of REPLICAS) {
    try {
      const res = await axios.get(`${r.url}/status`, { timeout: 400 });
      if (res.data.state === "leader") {
        if (leaderName !== r.id) {
          console.log(`[Gateway] Leader is now: ${r.id} at ${r.url}`);
        }
        leaderUrl = r.url;
        leaderName = r.id;
        return;
      }
    } catch (e) {}
  }
  leaderUrl = null;
  leaderName = "none";
  console.log("[Gateway] No leader found");
}

setInterval(detectLeader, 500);
detectLeader();

// ─── Stroke forwarding ────────────────────────────────────────────────────────

async function forwardStroke(stroke) {
  for (let i = 0; i < 3; i++) {
    if (!leaderUrl) {
      console.log("[Gateway] No leader, waiting...");
      await new Promise((r) => setTimeout(r, 300));
      await detectLeader();
      continue;
    }
    try {
      console.log(`[Gateway] Forwarding stroke to ${leaderUrl}`);
      await axios.post(`${leaderUrl}/stroke`, { stroke }, { timeout: 1000 });
      console.log(`[Gateway] Stroke forwarded successfully`);
      return;
    } catch (e) {
      console.log(`[Gateway] Forward attempt ${i + 1} failed: ${e.message}`);
      leaderUrl = null;
      leaderName = "none";
      await detectLeader();
    }
  }
}

// ─── Forward clear to leader so it replicates to all replicas ─────────────────

async function forwardClear() {
  for (let i = 0; i < 3; i++) {
    if (!leaderUrl) {
      await new Promise((r) => setTimeout(r, 300));
      await detectLeader();
      continue;
    }
    try {
      await axios.post(`${leaderUrl}/clear`, {}, { timeout: 1000 });
      console.log(`[Gateway] Clear forwarded to leader`);
      return;
    } catch (e) {
      console.log(`[Gateway] Clear forward attempt ${i + 1} failed: ${e.message}`);
      leaderUrl = null;
      leaderName = "none";
      await detectLeader();
    }
  }
}

// ─── Fetch full committed log from leader (for new-client state sync) ─────────

async function fetchLeaderLog() {
  if (!leaderUrl) await detectLeader();
  if (!leaderUrl) return [];
  try {
    const res = await axios.get(`${leaderUrl}/log`, { timeout: 1000 });
    return res.data.log || [];
  } catch (e) {
    console.log(`[Gateway] Failed to fetch leader log: ${e.message}`);
    return [];
  }
}

// ─── WebSocket connections ────────────────────────────────────────────────────

wss.on("connection", async (ws) => {
  clients.add(ws);
  console.log(`[Gateway] Client connected. Total: ${clients.size}`);

  // ── Commit 2: replay full committed log to the newly connected client ──────
  const existingLog = await fetchLeaderLog();
  if (existingLog.length > 0 && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "init", payload: existingLog }));
    console.log(`[Gateway] Sent ${existingLog.length} existing strokes to new client`);
  }

  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    console.log(`[Gateway] Received message type: ${data.type}`);

    if (data.type === "clear") {
      // ── Commit 3: forward clear to leader so replicas clear their logs ──
      await forwardClear();
      // Note: broadcast-clear back to WS clients is triggered by the leader
      // calling POST /broadcast-clear on us (see below). No double-broadcast here.
      return;
    }

    if (data.type === "stroke") {
      await forwardStroke(data.payload);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[Gateway] Client disconnected. Total: ${clients.size}`);
  });

  ws.on("error", () => clients.delete(ws));
});

// ─── POST /broadcast — leader calls this to push a committed stroke ───────────

app.post("/broadcast", (req, res) => {
  const { stroke } = req.body;
  if (!stroke) return res.status(400).json({ error: "missing stroke" });

  let delivered = 0;
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify({ type: "stroke", payload: stroke }));
      delivered++;
    }
  }
  console.log(`[Gateway] Broadcasted stroke to ${delivered} clients`);
  res.json({ ok: true });
});

// ─── POST /broadcast-clear — leader calls this after clearing its log ─────────
// Commit 3: replicas clear their logs, then leader calls this to clear all UIs.

app.post("/broadcast-clear", (req, res) => {
  let delivered = 0;
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify({ type: "clear" }));
      delivered++;
    }
  }
  console.log(`[Gateway] Broadcasted clear to ${delivered} clients`);
  res.json({ ok: true });
});

// ─── GET /health ──────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ leader: leaderName, clients: clients.size });
});

server.listen(3000, () => {
  console.log("[Gateway] Running on port 3000");
});