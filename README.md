# Distributed Drawing Board — Mini RAFT Consensus

Built with Node.js, React, Docker, and a custom RAFT-lite protocol.

## Stack
- Gateway: Node.js + Express + WebSocket
- Replicas: Node.js + Express + RAFT
- Frontend: React + Vite
- Infra: Docker + docker-compose

## Run
docker-compose up --build

## Stages
- Stage 1 (Week 1): Scaffold + Docker ✅
- Stage 2 (Week 2): RAFT + WebSocket + Canvas
- Stage 3 (Week 3): Failover + Zero-downtime + Stress test
```

---

### Step 8 — Verify your folder structure looks like this
```
distributed-drawing-board/
├── gateway/
│   ├── src/index.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── replica1/
│   ├── src/index.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── replica2/          ← identical to replica1
├── replica3/          ← identical to replica1
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   └── App.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── docker-compose.yml
├── .gitignore
└── README.md