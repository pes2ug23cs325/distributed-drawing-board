const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const ID = process.env.REPLICA_ID;
const PORT = parseInt(process.env.REPLICA_PORT);
const PEERS = (process.env.PEERS || "").split(",").filter(Boolean);
const GATEWAY = process.env.GATEWAY_URL || "http://gateway:3000";

let state = "follower";
let currentTerm = 0;
let votedFor = null;
let leaderId = null;
let log = [];         // committed stroke entries
let commitIndex = -1;
let electionTimeout = null;
let heartbeatInterval = null;

// ─── Election Timeout ────────────────────────────────────────────────────────

function resetElectionTimeout() {
  clearTimeout(electionTimeout);
  // Spec: 500–800 ms
  electionTimeout = setTimeout(startElection, 500 + Math.random() * 300);
}

// ─── Election ────────────────────────────────────────────────────────────────

async function startElection() {
  state = "candidate";
  currentTerm++;
  votedFor = ID;
  console.log(`[${ID}] Starting election term ${currentTerm}`);

  let votes = 1;

  await Promise.all(
    PEERS.map(async (peer) => {
      try {
        const res = await axios.post(
          `${peer}/vote`,
          { term: currentTerm, candidateId: ID },
          { timeout: 300 }
        );
        if (res.data.voteGranted) votes++;
        if (res.data.term > currentTerm) stepDown(res.data.term);
      } catch (e) {}
    })
  );

  if (state !== "candidate") return;

  if (votes >= 2) {
    becomeLeader();
  } else {
    // Split-vote: fall back to follower and retry
    state = "follower";
    resetElectionTimeout();
  }
}

function becomeLeader() {
  state = "leader";
  leaderId = ID;
  console.log(`[${ID}] *** BECAME LEADER term ${currentTerm} ***`);
  clearTimeout(electionTimeout);
  clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(sendHeartbeats, 150);
  sendHeartbeats();
}

function stepDown(newTerm) {
  console.log(`[${ID}] Stepping down, new term ${newTerm}`);
  state = "follower";
  currentTerm = newTerm;
  votedFor = null;
  clearInterval(heartbeatInterval);
  resetElectionTimeout();
}

// ─── Heartbeats ──────────────────────────────────────────────────────────────

async function sendHeartbeats() {
  for (const peer of PEERS) {
    try {
      const res = await axios.post(
        `${peer}/append`,
        {
          term: currentTerm,
          leaderId: ID,
          prevLogIndex: log.length - 1, // tell follower what we expect
        },
        { timeout: 200 }
      );
      if (res.data.term > currentTerm) {
        stepDown(res.data.term);
        return;
      }
      // If follower reports a log gap, trigger catch-up sync
      if (res.data.needsSync && res.data.fromIndex !== undefined) {
        triggerSync(peer, res.data.fromIndex);
      }
    } catch (e) {}
  }
}

// ─── Catch-up sync: leader pushes missing entries to a lagging follower ──────

async function triggerSync(peer, fromIndex) {
  const missing = log.slice(fromIndex);
  if (missing.length === 0) return;
  try {
    await axios.post(
      `${peer}/sync-log`,
      { term: currentTerm, leaderId: ID, entries: missing, fromIndex },
      { timeout: 500 }
    );
    console.log(`[${ID}] Sync-log sent to ${peer} (${missing.length} entries from ${fromIndex})`);
  } catch (e) {
    console.log(`[${ID}] Sync-log to ${peer} failed: ${e.message}`);
  }
}

// ─── /vote ───────────────────────────────────────────────────────────────────

app.post("/vote", (req, res) => {
  const { term, candidateId } = req.body;

  if (term > currentTerm) {
    currentTerm = term;
    votedFor = null;
    state = "follower";
    clearInterval(heartbeatInterval);
  }

  if (term < currentTerm) {
    return res.json({ term: currentTerm, voteGranted: false });
  }

  if (votedFor === null || votedFor === candidateId) {
    votedFor = candidateId;
    resetElectionTimeout();
    console.log(`[${ID}] Voted for ${candidateId}`);
    return res.json({ term: currentTerm, voteGranted: true });
  }

  res.json({ term: currentTerm, voteGranted: false });
});

// ─── /append (AppendEntries + heartbeat) ─────────────────────────────────────

app.post("/append", (req, res) => {
  const { term, leaderId: incomingLeader, entry, prevLogIndex } = req.body;

  if (term < currentTerm) {
    return res.json({ term: currentTerm, success: false });
  }

  if (term > currentTerm) {
    currentTerm = term;
    votedFor = null;
  }

  state = "follower";
  leaderId = incomingLeader;
  clearInterval(heartbeatInterval);
  resetElectionTimeout();

  // prevLogIndex check — detect gap and request sync
  if (prevLogIndex !== undefined && prevLogIndex > log.length - 1 && log.length < prevLogIndex + 1) {
    // We are behind; tell leader where we are so it can sync us
    console.log(`[${ID}] Log gap detected. Have ${log.length}, leader expects prevLogIndex ${prevLogIndex}`);
    return res.json({
      term: currentTerm,
      success: false,
      needsSync: true,
      fromIndex: log.length,
    });
  }

  if (entry) {
    log.push(entry);
    commitIndex = log.length - 1; // ✅ followers now track commitIndex
    console.log(`[${ID}] Appended entry, log size: ${log.length}, commitIndex: ${commitIndex}`);
  }

  res.json({ term: currentTerm, success: true });
});

// ─── /sync-log — catch-up endpoint for restarted/lagging followers ────────────
// Called by leader after detecting a gap via /append response.
// Follower receives all missing committed entries from `fromIndex` onward.

app.post("/sync-log", (req, res) => {
  const { term, leaderId: incomingLeader, entries, fromIndex } = req.body;

  if (term < currentTerm) {
    return res.json({ term: currentTerm, success: false });
  }

  if (term > currentTerm) {
    currentTerm = term;
    votedFor = null;
  }

  state = "follower";
  leaderId = incomingLeader;
  clearInterval(heartbeatInterval);
  resetElectionTimeout();

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.json({ term: currentTerm, success: true });
  }

  // Splice in the missing entries starting at fromIndex
  log = log.slice(0, fromIndex).concat(entries);
  commitIndex = log.length - 1;
  console.log(`[${ID}] Sync-log applied: ${entries.length} entries from index ${fromIndex}. Log size now: ${log.length}`);

  res.json({ term: currentTerm, success: true });
});

// ─── /stroke — only leader accepts this from gateway ─────────────────────────

app.post("/stroke", async (req, res) => {
  if (state !== "leader") {
    return res.status(400).json({ error: "not leader", leaderId });
  }

  const { stroke } = req.body;
  if (!stroke) return res.status(400).json({ error: "missing stroke" });

  // 1. Append to own log immediately
  log.push(stroke);
  commitIndex = log.length - 1;
  console.log(`[${ID}] Leader committed stroke, log size: ${log.length}`);

  // 2. Broadcast to gateway IMMEDIATELY — don't wait for peer acks
  try {
    await axios.post(`${GATEWAY}/broadcast`, { stroke }, { timeout: 500 });
    console.log(`[${ID}] Broadcast sent to gateway`);
  } catch (e) {
    console.log(`[${ID}] Gateway broadcast failed: ${e.message}`);
  }

  // 3. Replicate to peers in background (don't block response)
  PEERS.forEach(async (peer) => {
    try {
      await axios.post(
        `${peer}/append`,
        { term: currentTerm, leaderId: ID, entry: stroke, prevLogIndex: log.length - 2 },
        { timeout: 300 }
      );
    } catch (e) {
      console.log(`[${ID}] Replication to ${peer} failed`);
    }
  });

  res.json({ success: true });
});

// ─── /clear — leader clears log and replicates clear to all peers ─────────────
// Commit 3: clear is now fully replicated so restarts don't replay old strokes.

app.post("/clear", async (req, res) => {
  if (state !== "leader") {
    return res.status(400).json({ error: "not leader", leaderId });
  }

  const { term: incomingTerm } = req.body;
  if (incomingTerm !== undefined && incomingTerm < currentTerm) {
    return res.status(400).json({ error: "stale term" });
  }

  log = [];
  commitIndex = -1;
  console.log(`[${ID}] Leader cleared log`);

  // Broadcast clear event to all WS clients via gateway
  try {
    await axios.post(`${GATEWAY}/broadcast-clear`, {}, { timeout: 500 });
  } catch (e) {
    console.log(`[${ID}] Gateway broadcast-clear failed: ${e.message}`);
  }

  // Replicate clear to peers
  PEERS.forEach(async (peer) => {
    try {
      await axios.post(`${peer}/clear-replicate`, { term: currentTerm, leaderId: ID }, { timeout: 300 });
    } catch (e) {
      console.log(`[${ID}] Clear replication to ${peer} failed`);
    }
  });

  res.json({ success: true });
});

// ─── /clear-replicate — followers apply a clear from the leader ───────────────

app.post("/clear-replicate", (req, res) => {
  const { term, leaderId: incomingLeader } = req.body;

  if (term < currentTerm) {
    return res.json({ term: currentTerm, success: false });
  }

  if (term > currentTerm) {
    currentTerm = term;
    votedFor = null;
  }

  state = "follower";
  leaderId = incomingLeader;
  clearInterval(heartbeatInterval);
  resetElectionTimeout();

  log = [];
  commitIndex = -1;
  console.log(`[${ID}] Follower cleared log via replication`);

  res.json({ term: currentTerm, success: true });
});

// ─── /log — expose committed log (used by gateway for new-client state sync) ──

app.get("/log", (req, res) => {
  res.json({ log, commitIndex });
});

// ─── /status & /health ────────────────────────────────────────────────────────

app.get("/status", (req, res) => {
  res.json({ id: ID, state, term: currentTerm, leaderId, logSize: log.length, commitIndex });
});

app.get("/health", (req, res) => {
  res.json({ status: "up", id: ID });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  clearTimeout(electionTimeout);
  clearInterval(heartbeatInterval);
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`[${ID}] Running on port ${PORT}`);
  resetElectionTimeout();
});