const axios = require("axios");

const ELECTION_TIMEOUT_MIN = 500;
const ELECTION_TIMEOUT_MAX = 800;
const HEARTBEAT_INTERVAL = 150;

class RaftNode {
  constructor(id, peers, onCommit) {
    this.id = id;
    this.peers = peers;
    this.onCommit = onCommit;
    this.state = "follower";
    this.currentTerm = 0;
    this.votedFor = null;
    this.log = [];
    this.commitIndex = -1;
    this.leaderId = null;
    this.electionTimer = null;
    this.heartbeatTimer = null;
    this.resetElectionTimer();
  }

  // ── Timers ──────────────────────────────────────────────

  randomTimeout() {
    return (
      Math.floor(
        Math.random() * (ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN)
      ) + ELECTION_TIMEOUT_MIN
    );
  }

  resetElectionTimer() {
    clearTimeout(this.electionTimer);
    this.electionTimer = setTimeout(
      () => this.startElection(),
      this.randomTimeout()
    );
  }

  stopElectionTimer() {
    clearTimeout(this.electionTimer);
  }

  startHeartbeatTimer() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeats(),
      HEARTBEAT_INTERVAL
    );
  }

  stopHeartbeatTimer() {
    clearInterval(this.heartbeatTimer);
  }

  // ── Election ────────────────────────────────────────────

  async startElection() {
    this.state = "candidate";
    this.currentTerm += 1;
    this.votedFor = this.id;
    console.log(`[${this.id}] Starting election for term ${this.currentTerm}`);

    let votes = 1;
    const majority = Math.floor((this.peers.length + 1) / 2) + 1;

    await Promise.all(
      this.peers.map(async (peer) => {
        try {
          const res = await axios.post(
            `${peer}/request-vote`,
            {
              term: this.currentTerm,
              candidateId: this.id,
              lastLogIndex: this.log.length - 1,
              lastLogTerm:
                this.log.length > 0
                  ? this.log[this.log.length - 1].term
                  : -1,
            },
            { timeout: 300 }
          );
          if (res.data.voteGranted) votes += 1;
          if (res.data.term > this.currentTerm)
            this.stepDown(res.data.term);
        } catch (e) {
          console.log(`[${this.id}] Vote request to ${peer} failed`);
        }
      })
    );

    if (this.state === "candidate" && votes >= majority) {
      this.becomeLeader();
    } else if (this.state === "candidate") {
      console.log(`[${this.id}] Election failed, retrying...`);
      this.state = "follower";
      this.resetElectionTimer();
    }
  }

  becomeLeader() {
    this.state = "leader";
    this.leaderId = this.id;
    console.log(
      `[${this.id}] *** Became LEADER for term ${this.currentTerm} ***`
    );
    this.stopElectionTimer();
    this.startHeartbeatTimer();
    this.sendHeartbeats();
  }

  stepDown(newTerm) {
    console.log(`[${this.id}] Stepping down. New term: ${newTerm}`);
    this.state = "follower";
    this.currentTerm = newTerm;
    this.votedFor = null;
    this.stopHeartbeatTimer();
    this.resetElectionTimer();
  }

  // ── Heartbeats ──────────────────────────────────────────

  async sendHeartbeats() {
    if (this.state !== "leader") return;
    for (const peer of this.peers) {
      try {
        const res = await axios.post(
          `${peer}/heartbeat`,
          { term: this.currentTerm, leaderId: this.id },
          { timeout: 200 }
        );
        if (res.data.term > this.currentTerm)
          this.stepDown(res.data.term);
      } catch (e) {
        // peer temporarily down, ignore
      }
    }
  }

  // ── Vote Handler ────────────────────────────────────────

  handleVoteRequest({ term, candidateId, lastLogIndex, lastLogTerm }) {
    if (term < this.currentTerm)
      return { term: this.currentTerm, voteGranted: false };

    if (term > this.currentTerm) this.stepDown(term);

    const myLastIndex = this.log.length - 1;
    const myLastTerm =
      this.log.length > 0 ? this.log[myLastIndex].term : -1;
    const logOk =
      lastLogTerm > myLastTerm ||
      (lastLogTerm === myLastTerm && lastLogIndex >= myLastIndex);

    if (
      (this.votedFor === null || this.votedFor === candidateId) &&
      logOk
    ) {
      this.votedFor = candidateId;
      this.resetElectionTimer();
      console.log(
        `[${this.id}] Voted for ${candidateId} in term ${term}`
      );
      return { term: this.currentTerm, voteGranted: true };
    }
    return { term: this.currentTerm, voteGranted: false };
  }

  // ── Heartbeat Handler ───────────────────────────────────

  handleHeartbeat({ term, leaderId }) {
    if (term < this.currentTerm)
      return { term: this.currentTerm, success: false };

    if (term > this.currentTerm) this.stepDown(term);
    this.leaderId = leaderId;
    this.state = "follower";
    this.resetElectionTimer();
    return { term: this.currentTerm, success: true };
  }

  // ── Log Replication ─────────────────────────────────────

  async replicateEntry(entry) {
    if (this.state !== "leader") return false;

    const logEntry = {
      term: this.currentTerm,
      entry,
      index: this.log.length,
    };
    this.log.push(logEntry);
    console.log(
      `[${this.id}] Replicating entry at index ${logEntry.index}`
    );

    let acks = 1;
    const majority = Math.floor((this.peers.length + 1) / 2) + 1;

    await Promise.all(
      this.peers.map(async (peer) => {
        try {
          const res = await axios.post(
            `${peer}/append-entries`,
            {
              term: this.currentTerm,
              leaderId: this.id,
              prevLogIndex: logEntry.index - 1,
              prevLogTerm:
                logEntry.index > 0
                  ? this.log[logEntry.index - 1].term
                  : -1,
              entry: logEntry,
              leaderCommit: this.commitIndex,
            },
            { timeout: 300 }
          );
          if (res.data.success) acks += 1;
          else if (res.data.term > this.currentTerm)
            this.stepDown(res.data.term);
        } catch (e) {
          console.log(
            `[${this.id}] AppendEntries to ${peer} failed`
          );
        }
      })
    );

    if (acks >= majority && this.state === "leader") {
      this.commitIndex = logEntry.index;
      console.log(
        `[${this.id}] Committed entry at index ${logEntry.index}`
      );
      if (this.onCommit) this.onCommit(logEntry);
      return true;
    }
    return false;
  }

  // ── AppendEntries Handler ───────────────────────────────

  handleAppendEntries({
    term,
    leaderId,
    prevLogIndex,
    prevLogTerm,
    entry,
    leaderCommit,
  }) {
    if (term < this.currentTerm)
      return {
        term: this.currentTerm,
        success: false,
        logLength: this.log.length,
      };

    if (term > this.currentTerm) this.stepDown(term);
    this.leaderId = leaderId;
    this.state = "follower";
    this.resetElectionTimer();

    if (prevLogIndex >= 0) {
      if (
        this.log.length <= prevLogIndex ||
        this.log[prevLogIndex]?.term !== prevLogTerm
      ) {
        return {
          term: this.currentTerm,
          success: false,
          logLength: this.log.length,
        };
      }
    }

    if (entry) {
      this.log[entry.index] = entry;
      this.log = this.log.slice(0, entry.index + 1);
    }

    if (leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(leaderCommit, this.log.length - 1);
    }

    return { term: this.currentTerm, success: true };
  }

  // ── Catch-Up Sync ───────────────────────────────────────

  handleSyncLog(fromIndex) {
    const entries = this.log
      .slice(fromIndex)
      .filter((_, i) => fromIndex + i <= this.commitIndex);
    return { entries, commitIndex: this.commitIndex };
  }

  applySync(entries, commitIndex) {
    for (const entry of entries) {
      this.log[entry.index] = entry;
    }
    this.commitIndex = commitIndex;
    console.log(`[${this.id}] Synced ${entries.length} entries from leader`);
  }

  // ── Status ──────────────────────────────────────────────

  getStatus() {
    return {
      id: this.id,
      state: this.state,
      term: this.currentTerm,
      leaderId: this.leaderId,
      logLength: this.log.length,
      commitIndex: this.commitIndex,
    };
  }
}

module.exports = RaftNode;