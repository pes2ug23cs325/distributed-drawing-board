const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const ID = process.env.REPLICA_ID || "replica1";
const PORT = parseInt(process.env.REPLICA_PORT) || 4001;
const PEERS = (process.env.PEERS || "").split(",").filter(Boolean);
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:3000";

// ── SIMPLE LEADER (for now) ─────────────────

let state = "follower";

// Make replica1 leader initially
if (ID === "replica1") state = "leader";

// ── LOG ────────────────────────────────────

let log = [];
let commitIndex = -1;

// ── Replication ────────────────────────────

async function replicateToFollowers(entry) {
  let success = 1; // self

  for (const peer of PEERS) {
    try {
      await axios.post(`${peer}/append`, { entry }, { timeout: 300 });
      success++;
    } catch {}
  }

  return success >= 2; // majority
}

// ── Append Endpoint (Follower) ─────────────

app.post("/append", (req, res) => {
  const { entry } = req.body;
  log.push(entry);
  res.json({ success: true });
});

// ── Stroke Endpoint (Leader only) ──────────

app.post("/stroke", async (req, res) => {
  if (state !== "leader") {
    return res.status(400).json({ error: "not leader" });
  }

  const { stroke } = req.body;

  log.push(stroke);

  const committed = await replicateToFollowers(stroke);

  if (!committed) {
    return res.status(500).json({ error: "replication failed" });
  }

  commitIndex++;

  // Notify gateway
  try {
    await axios.post(`${GATEWAY}/broadcast`, { stroke });
  } catch {}

  res.json({ success: true });
});

// ── Status ────────────────────────────────

app.get("/status", (req, res) => {
  res.json({
    id: ID,
    state,
    logLength: log.length,
    commitIndex,
  });
});

// ── Health ────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "up", id: ID });
});

app.listen(PORT, () => {
  console.log(`[${ID}] Running as ${state} on port ${PORT}`);
});