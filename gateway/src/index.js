const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.GATEWAY_PORT || 3000;
const REPLICAS = (process.env.REPLICAS || "").split(",").filter(Boolean);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let currentLeader = null;
let clients = new Set();

// ── Leader Detection ─────────────────────────

async function findLeader() {
  for (const replica of REPLICAS) {
    try {
      const res = await axios.get(`${replica}/status`, { timeout: 500 });
      if (res.data.state === "leader") {
        currentLeader = replica;
        console.log(`[Gateway] Leader = ${replica}`);
        return;
      }
    } catch {}
  }
  currentLeader = null;
}

setInterval(findLeader, 500);
findLeader();

// ── WebSocket ───────────────────────────────

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Client connected");

  ws.on("message", async (data) => {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (parsed.type !== "stroke") return;

    if (!currentLeader) await findLeader();

    if (!currentLeader) {
      console.log("No leader, dropping");
      return;
    }

    try {
      await axios.post(`${currentLeader}/stroke`, {
        stroke: parsed.stroke,
      });
    } catch {
      console.log("Leader failed, retrying...");
      await findLeader();
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

// ── Broadcast (called by leader after commit) ───────────────

app.post("/broadcast", (req, res) => {
  const { stroke } = req.body;

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "stroke",
          stroke,
        })
      );
    }
  }

  res.json({ success: true });
});

// ── Health ───────────────────────────────

app.get("/health", (req, res) => {
  res.json({ leader: currentLeader });
});

server.listen(PORT, () => {
  console.log(`[Gateway] Running on ${PORT}`);
});