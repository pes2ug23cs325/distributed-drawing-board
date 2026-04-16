#  Distributed Drawing Board — Mini-RAFT Consensus

A highly available, fault-tolerant **collaborative drawing application** built from scratch to demonstrate core distributed systems concepts. This project implements a custom **"RAFT-lite" consensus protocol** to manage state across a cluster of backend nodes, ensuring **zero data loss** and **real-time synchronization** across multiple clients.

---

##  Features

| Feature | Description |
|--------|-------------|
| **Strict RAFT Consensus** | Enforces mathematically strict majority quorums before committing data, preventing split-brain scenarios and dirty reads. |
| **Automatic Failover & Leader Election** | Nodes use randomized election timeouts (150ms–300ms) to detect failures and elect a new leader in under half a second. |
| **High-Performance Write Batching** | The Gateway queues and batches up to 50 WebSocket strokes into single HTTP requests, eliminating TCP socket exhaustion under heavy load. |
| **Zero-Downtime Recovery (Catch-up Sync)** | Crashed or restarted nodes automatically request missing log entries from the leader to restore their state. |
| **Fail-Fast Networking** | Utilizes `AbortController` kill-switches to instantly terminate hanging network requests to dead nodes, keeping the event loop responsive. |
| **Real-Time WebSocket Broadcasting** | Connected clients receive instantaneous, synchronized canvas updates once consensus is achieved. |

---

##  Tech Stack

| Layer | Technology | Purpose |
|------|-----------|---------|
| **Frontend** | React, Vite, HTML5 Canvas API | Interactive collaborative drawing interface |
| **Gateway** | Node.js, Express, WebSockets (`ws`), Axios | WebSocket handling, batching, and request routing |
| **RAFT Replicas** | Node.js, Express, Axios | Consensus, log replication, and state management |
| **Infrastructure** | Docker, Docker Compose | Containerization and orchestration |
| **Communication** | HTTP & WebSockets | Inter-node and client-server communication |

---

##  Architecture Overview
```plaintext
+-------------------+
|    Web Clients    |
|  (React + Canvas) |
+---------+---------+
          |
          | WebSocket
          v
+-------------------+
|      Gateway      |
|  (Batching Layer) |
+---------+---------+
          |
          | HTTP (RAFT RPCs)
          v
+-------------------------------+
|          RAFT Cluster         |
|  +-----------+  +-----------+ |
|  | Replica 1 |  | Replica 2 | |
|  |  (Leader) |  | Follower  | |
|  +-----------+  +-----------+ |
|        +-----------+          |
|        | Replica 3 |          |
|        | Follower  |          |
|        +-----------+          |
+-------------------------------+
```
##  Prerequisites

Ensure the following tools are installed:


| Tool | Version | Purpose |
|------|--------|---------|
| **Docker** | v20+ | Container runtime |
| **Docker Compose** | v2+ | Multi-container orchestration |
| **Git** | Latest | Repository management |

Verify installation:

```bash
docker --version
docker compose version
git --version
```

**Quick Start**
1️⃣ Clone the Repository
```bash
git clone https://github.com/pes2ug23cs325/distributed-drawing-board.git
cd distributed-drawing-board
```
2️⃣ Spin Up the Cluster
```bash
docker compose up --build
```
3️⃣ Access the Application

Open your browser and navigate to:
```bash
http://localhost:5173
```

Open multiple tabs to observe real-time synchronization between clients.

**Testing Failovers**

To test the resilience of the RAFT cluster, you can simulate a node crash.

Steps:
1. Open a second terminal window.
2. Identify the current leader from the Docker logs:
3. docker compose logs -f
4. Stop the leader container (example: replica2):
5. docker stop replica2
6. Observe the system behavior:
7. A new leader will be elected automatically.
8. Continue drawing in the browser without interruption.
9. The stopped node can be restarted and will perform a catch-up sync.
10. Restart the Node (Optional)
```bash
docker start replica2
```

📁 Project Structure
```plaintext 
distributed-drawing-board/
├── gateway/                     # WebSocket server and request router
│   ├── src/
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
│
├── replica1/                    # RAFT Consensus Node 1
│   ├── src/
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
│
├── replica2/                    # RAFT Consensus Node 2
│   ├── src/
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
│
├── replica3/                    # RAFT Consensus Node 3
│   ├── src/
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                    # React + Vite Canvas UI
│   ├── src/
│   │   ├── App.jsx
│   │   ├── Canvas.jsx
│   │   └── main.jsx
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml           # Cluster orchestration
└── README.md
```