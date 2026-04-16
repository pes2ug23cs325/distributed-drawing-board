# Distributed Drawing Board — Mini-RAFT Consensus

A highly available, fault-tolerant collaborative drawing application built from scratch to demonstrate core distributed systems concepts. This project implements a custom "RAFT-lite" consensus protocol to manage state across a cluster of backend nodes, ensuring zero data loss and real-time synchronization across multiple clients.

## 🚀 Features

- **Strict RAFT Consensus**: Enforces mathematically strict majority quorums before committing data, preventing split-brain scenarios and dirty reads.
- **Automatic Failover & Leader Election**: Nodes use randomized timeouts (150ms-300ms) to automatically detect failures and elect a new leader in under half a second.
- **High-Performance Write Batching**: The Gateway queues and batches up to 50 WebSocket strokes into single HTTP requests, eliminating TCP socket exhaustion under heavy load.
- **Zero-Downtime Recovery (Catch-up Sync)**: If a node crashes and reboots, it automatically requests missing log entries from the leader to perfectly restore its state.
- **Fail-Fast Networking**: Utilizes `AbortController` kill-switches to instantly sever hanging network requests to dead nodes, keeping the event loop unblocked.
- **Real-Time WebSocket Broadcasting**: Connected clients receive instantaneous, synchronized canvas updates the moment consensus is achieved.

## 🛠️ Tech Stack

- **Gateway**: Node.js, Express, WebSockets (`ws`), Axios
- **Replicas (RAFT Cluster)**: Node.js, Express, Axios
- **Frontend**: React, Vite, HTML5 Canvas API
- **Infrastructure**: Docker, Docker Compose (with hot-reloading via bind mounts)

## 🏃‍♂️ Quick Start

Make sure you have Docker and Docker Desktop installed and running.

1. **Clone the repository**
   ```bash
   git clone [https://github.com/pes2ug23cs325/distributed-drawing-board.git](https://github.com/pes2ug23cs325/distributed-drawing-board.git)
   cd distributed-drawing-board 
   ```
2. **Spin up the cluster**
   ```bash 
     docker-compose up --build
     Open your browser and navigate to:
     http://localhost:5173 (Open multiple tabs to see real-time synchronization) 
     ```

3. ***Testing Failovers***
To test the resilience of the RAFT cluster, you can simulate a node crash:

Open a second terminal window.

Find the current leader in your Docker logs (e.g., replica2).

Kill the container: 
    ```bash
     docker stop replica2
     ```

Continue drawing in the browser. The system will automatically elect a new leader, queue your strokes, and resume synchronization seamlessly.

4. **Project Structure**
Plaintext
distributed-drawing-board/
├── gateway/                 # WebSocket server and request router
│   ├── src/index.js
│   ├── Dockerfile
│   └── package.json
├── replica1/                # RAFT Consensus Node 1
│   ├── src/index.js
│   ├── Dockerfile
│   └── package.json
├── replica2/                # RAFT Consensus Node 2
├── replica3/                # RAFT Consensus Node 3
├── frontend/                # React Vite Canvas UI
│   ├── src/
│   │   ├── App.jsx
│   │   ├── Canvas.jsx
│   │   └── main.jsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml       # Cluster orchestration
└── README.md