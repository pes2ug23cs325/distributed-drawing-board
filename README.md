# Distributed Real-Time Drawing Board — Mini-RAFT Consensus

A fault-tolerant, real-time collaborative whiteboard built with a custom
Mini-RAFT consensus protocol, WebSockets, Docker, and React.

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React + Vite                      |
| Gateway   | Node.js + Express + WebSocket     |
| Replicas  | Node.js + Express (RAFT protocol) |
| Infra     | Docker + docker-compose           |

---

## Architecture
```
Browser Tabs
     │  WebSocket
     ▼
  Gateway (port 3000)
     │  HTTP
     ▼
Leader Replica ──── AppendEntries ────► Follower Replicas
(replica1/2/3)                          (replica1/2/3)
     │
     └──► /broadcast ──► Gateway ──► All Browser Tabs
```

- **Gateway** accepts all browser WebSocket connections and forwards
  strokes to the current RAFT leader
- **3 Replica nodes** run Mini-RAFT consensus — one is elected leader,
  others are followers
- **Leader** replicates strokes to followers, waits for majority acks,
  then commits and broadcasts to all clients via gateway

---

## RAFT Protocol Summary

| Property         | Value         |
|-----------------|---------------|
| Election timeout | 500–800ms     |
| Heartbeat interval | 150ms       |
| Majority quorum  | 2 out of 3    |

### Node States
- **Follower** — waits for heartbeats from leader
- **Candidate** — starts election when heartbeat times out
- **Leader** — handles all writes, replicates log, sends heartbeats

### RPC Endpoints (per replica)
| Endpoint           | Purpose                              |
|--------------------|--------------------------------------|
| POST /request-vote | Candidate requests vote from peer    |
| POST /heartbeat    | Leader keeps followers alive         |
| POST /append-entries | Leader replicates log entry to follower |
| POST /sync-log     | Leader pushes missing entries to restarted follower |
| POST /stroke       | Gateway forwards client stroke to leader |
| POST /clear        | Gateway forwards canvas clear to leader |
| POST /clear-replicate | Leader replicates clear to followers |
| GET  /status       | Returns node state, term, leader ID  |
| GET  /health       | Returns up/down status               |
| GET  /log          | Returns full committed log           |

---

## How to Run

### Prerequisites
- Docker Desktop installed and running
- Node.js installed (for stress test only)

### Start the system
```bash
docker-compose up --build
```

### Open the app
```
http://localhost:5173
```

Open in multiple tabs to see real-time sync.

### Check replica status
```bash
curl http://localhost:4001/status
curl http://localhost:4002/status
curl http://localhost:4003/status
```

### Check gateway
```bash
curl http://localhost:3000/health
```

---

## Stress Test

Sends 100 strokes simultaneously to test system under load.

### Install dependency
```bash
npm install ws
```

### Run
```bash
node stress-test.js
```

You should see 100 strokes appear on all open browser tabs instantly.

---

## Failover Demo

### Kill the leader
```bash
docker stop replica1   # or whichever is leader
```

Watch the terminal — within 800ms a new leader is elected automatically.
All connected browser tabs continue working with zero downtime.

### Restart the killed replica
```bash
docker start replica1
```

The restarted replica catches up via `/sync-log` and rejoins the cluster.

### Hot-reload (zero downtime)
Edit any file inside `replica1/src/`, `replica2/src/`, or `replica3/src/`.
nodemon detects the change, restarts that container, triggers a new
election, and the system stays live throughout.

---

## Capturing Failover Logs
```bash
docker-compose logs --no-color > logs/failover.log
```

---

## Project Structure
```
distributed-drawing-board/
├── gateway/
│   ├── src/index.js       # WebSocket server, leader detection, forwarding
│   ├── Dockerfile
│   └── package.json
├── replica1/              # Same structure for replica2 and replica3
│   ├── src/index.js       # Full Mini-RAFT implementation
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main app, WebSocket integration
│   │   ├── Canvas.jsx     # Drawing canvas, local + remote stroke rendering
│   │   ├── Toolbar.jsx    # Tool selection, color, thickness
│   │   └── useWebSocket.js # WebSocket hook with auto-reconnect
│   ├── index.html
│   └── package.json
├── stress-test.js         # Load test — sends 100 strokes via WebSocket
├── docker-compose.yml     # All 5 services with healthchecks
└── README.md
```

---

## Week Milestones

| Week | Focus | Status |
|------|-------|--------|
| Week 1 | Scaffold, Docker, RAFT design | 
| Week 2 | Leader election, replication, canvas | 
| Week 3 | Failover, zero-downtime, stress test |