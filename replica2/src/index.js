const express = require("express");
const axios = require("axios");
const http = require("http");

const app = express();
app.use(express.json());

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1000 });
axios.defaults.httpAgent = httpAgent;

const ID = process.env.REPLICA_ID;
const PORT = parseInt(process.env.REPLICA_PORT);
const PEERS = (process.env.PEERS || "").split(",").filter(Boolean);

let state = "follower";
let currentTerm = 0;
let votedFor = null;
let leaderId = null;
let log = [];
let commitIndex = -1;
let electionTimeout = null;
let heartbeatInterval = null;

const syncInProgress = new Set();

function logState(message) { console.log(`[${ID} | ${state.toUpperCase()}] ${message}`); }

function resetElectionTimeout() {
  clearTimeout(electionTimeout);
  electionTimeout = setTimeout(startElection, 150 + Math.random() * 150);
}

function updateTerm(newTerm) {
  if (newTerm > currentTerm) {
    logState(`Term updated: ${currentTerm} → ${newTerm}`);
    currentTerm = newTerm;
    votedFor = null;
  }
}

async function startElection() {
  state = "candidate";
  currentTerm++;
  votedFor = ID;
  logState(`Starting election for term ${currentTerm}`);

  let votes = 1;

  await Promise.all(
    PEERS.map(async (peer) => {
      try {
        const res = await axios.post(`${peer}/request-vote`, { term: currentTerm, candidateId: ID }, { timeout: 150 });
        if (res.data.voteGranted) { votes++; logState(`Vote granted by ${peer}`); }
        if (res.data.term > currentTerm) stepDown(res.data.term);
      } catch {}
    })
  );

  if (state !== "candidate") return;

  if (votes >= 2) {
    becomeLeader();
  } else {
    logState(`Split vote — retrying`);
    state = "follower";
    resetElectionTimeout();
  }
}

function becomeLeader() {
  state = "leader";
  leaderId = ID;
  logState(`*** BECAME LEADER for term ${currentTerm} ***`);
  clearTimeout(electionTimeout);
  clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(sendHeartbeats, 40);
  sendHeartbeats();
}

function stepDown(newTerm) {
  logState(`Stepping down — higher term ${newTerm}`);
  updateTerm(newTerm);
  state = "follower";
  clearInterval(heartbeatInterval);
  resetElectionTimeout();
}

function sendHeartbeats() {
  PEERS.forEach(async (peer) => {
    try {
      const res = await axios.post(`${peer}/heartbeat`, { term: currentTerm, leaderId: ID, leaderCommitIndex: commitIndex }, { timeout: 100 });
      if (res.data.term > currentTerm) return stepDown(res.data.term);
      if (res.data.needsSync && res.data.fromIndex !== undefined) {
        if (!syncInProgress.has(peer)) triggerSync(peer, res.data.fromIndex);
      }
    } catch {}
  });
}

async function triggerSync(peer, fromIndex) {
  syncInProgress.add(peer);
  try {
    const missing = log.slice(fromIndex);
    if (missing.length === 0) return;
    logState(`Sync-log → ${peer}: ${missing.length} entries from index ${fromIndex}`);
    await axios.post(`${peer}/sync-log`, { term: currentTerm, leaderId: ID, entries: missing, fromIndex }, { timeout: 500 });
    logState(`Sync-log to ${peer} done`);
  } catch (e) {
    logState(`Sync-log to ${peer} failed`);
  } finally {
    syncInProgress.delete(peer);
  }
}

app.post("/request-vote", (req, res) => {
  const { term, candidateId } = req.body;
  if (term > currentTerm) { updateTerm(term); state = "follower"; clearInterval(heartbeatInterval); }
  if (term < currentTerm) return res.json({ term: currentTerm, voteGranted: false });

  if (votedFor === null || votedFor === candidateId) {
    votedFor = candidateId;
    resetElectionTimeout();
    logState(`Voted for ${candidateId} in term ${term}`);
    return res.json({ term: currentTerm, voteGranted: true });
  }
  res.json({ term: currentTerm, voteGranted: false });
});

app.post("/heartbeat", (req, res) => {
  const { term, leaderId: incomingLeader, leaderCommitIndex } = req.body;
  if (term < currentTerm) return res.json({ term: currentTerm, success: false });
  if (term > currentTerm) updateTerm(term);
  state = "follower"; leaderId = incomingLeader; clearInterval(heartbeatInterval); resetElectionTimeout();
  if (leaderCommitIndex !== undefined && leaderCommitIndex >= 0 && log.length <= leaderCommitIndex) {
    return res.json({ term: currentTerm, success: true, needsSync: true, fromIndex: log.length });
  }
  res.json({ term: currentTerm, success: true });
});

app.post("/sync-log", (req, res) => {
  const { term, leaderId: incomingLeader, entries, fromIndex } = req.body;
  if (term < currentTerm) return res.json({ term: currentTerm, success: false });
  if (term > currentTerm) updateTerm(term);
  state = "follower"; leaderId = incomingLeader; clearInterval(heartbeatInterval); resetElectionTimeout();

  if (!Array.isArray(entries) || entries.length === 0) return res.json({ term: currentTerm, success: true });
  log = log.slice(0, fromIndex).concat(entries);
  commitIndex = log.length - 1;
  logState(`Sync-log applied — ${entries.length} entries from ${fromIndex}, log: ${log.length}`);
  res.json({ term: currentTerm, success: true });
});

// 🔥 THE FIX: Followers accept an array of entries at once!
app.post("/append-entries", (req, res) => {
  const { term, leaderId: incomingLeader, entries, prevLogIndex } = req.body;
  if (term < currentTerm) return res.json({ term: currentTerm, success: false });
  if (term > currentTerm) updateTerm(term);

  state = "follower"; leaderId = incomingLeader; clearInterval(heartbeatInterval); resetElectionTimeout();

  if (prevLogIndex !== undefined && prevLogIndex >= 0 && log.length <= prevLogIndex) {
    return res.json({ term: currentTerm, success: false, needsSync: true, fromIndex: log.length });
  }

  if (entries && Array.isArray(entries)) {
    log.push(...entries);
    commitIndex = log.length - 1;
  }
  res.json({ term: currentTerm, success: true });
});

// 🔥 THE FIX: Leader gets quorum on the entire batch at once!
app.post("/strokes", async (req, res) => {
  if (state !== "leader") return res.status(400).json({ error: "not leader", leaderId });

  const { strokes } = req.body;
  if (!strokes || !Array.isArray(strokes)) return res.status(400).json({ error: "missing strokes" });

  const startIndex = log.length;
  log.push(...strokes); // Append all at once
  const entryIndex = log.length - 1;

  let acks = 1; 
  const controller = new AbortController();

  await new Promise((resolve) => {
    let pending = PEERS.length;
    if (pending === 0) return resolve();

    PEERS.forEach((peer) => {
      // Send the entire array of strokes to the followers
      axios.post(`${peer}/append-entries`, {
          term: currentTerm, leaderId: ID, entries: strokes, prevLogIndex: startIndex - 1,
        }, { timeout: 150, signal: controller.signal }) 
        .then((r) => { 
          if (r.data.success) {
            acks++; 
            if (acks >= 2) { controller.abort(); resolve(); }
          } else if (r.data.needsSync && !syncInProgress.has(peer)) {
            triggerSync(peer, r.data.fromIndex);
          }
        })
        .catch(() => {}) 
        .finally(() => {
          pending--;
          if (pending === 0) resolve();
        });
    });
  });

  if (acks >= 2) {
    if (entryIndex > commitIndex) {
      commitIndex = entryIndex;
      logState(`Majority reached! Committed batch of ${strokes.length} strokes ending at index ${commitIndex}`);
    }
    res.json({ success: true });
  } else {
    logState(`Failed to reach quorum for batch`);
    log.splice(startIndex, strokes.length); // Rollback if failed
    res.status(500).json({ error: "failed to reach quorum" });
  }
});

app.post("/clear", async (req, res) => {
  if (state !== "leader") return res.status(400).json({ error: "not leader", leaderId });
  
  let acks = 1; 
  const controller = new AbortController();

  await new Promise((resolve) => {
    let pending = PEERS.length;
    if (pending === 0) return resolve();

    PEERS.forEach((peer) => {
      axios.post(`${peer}/clear-replicate`, { term: currentTerm, leaderId: ID }, { timeout: 150, signal: controller.signal })
        .then((r) => { if (r.data.success) acks++; })
        .catch(() => {})
        .finally(() => {
          pending--;
          if (acks >= 2) { controller.abort(); resolve(); } else if (pending === 0) resolve();
        });
    });
  });

  if (acks >= 2) {
    log = []; commitIndex = -1; logState(`Cleared log`); res.json({ success: true });
  } else {
    res.status(500).json({ error: "failed to reach quorum" });
  }
});

app.post("/clear-replicate", (req, res) => {
  const { term, leaderId: incomingLeader } = req.body;
  if (term < currentTerm) return res.json({ term: currentTerm, success: false });
  if (term > currentTerm) updateTerm(term);
  state = "follower"; leaderId = incomingLeader; clearInterval(heartbeatInterval); resetElectionTimeout();
  log = []; commitIndex = -1; logState(`Follower cleared log`); res.json({ term: currentTerm, success: true });
});

app.get("/log", (req, res) => res.json({ log, commitIndex }));
app.get("/status", (req, res) => res.json({ id: ID, state, term: currentTerm, leaderId, logSize: log.length, commitIndex }));
app.get("/health", (req, res) => res.json({ status: "up", id: ID }));

process.on("SIGTERM", () => {
  logState(`SIGTERM — shutting down`); clearTimeout(electionTimeout); clearInterval(heartbeatInterval); process.exit(0);
});

app.listen(PORT, () => { logState(`Running on port ${PORT}`); resetElectionTimeout(); });