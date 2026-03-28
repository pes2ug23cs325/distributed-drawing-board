const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.json());

const PORT = process.env.GATEWAY_PORT || 3000;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Set();

/* -------------------- HEALTH -------------------- */
app.get("/health", (req, res) => {
  res.json({
    status: "gateway up",
    clients: clients.size,
  });
});

/* -------------------- WEBSOCKET -------------------- */
wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[Gateway] Client connected. Total: ${clients.size}`);

  ws.on("message", (data) => {
    let message;

    try {
      message = JSON.parse(data);
    } catch (err) {
      console.log("[Gateway] Invalid JSON");
      return;
    }

    /* CLEAR CANVAS */
    if (message.type === "clear") {
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "clear" }));
        }
      }
      console.log("[Gateway] Clear broadcast sent");
      return;
    }

    /* STROKE */
    if (message.type === "stroke") {
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message.payload));
        }
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[Gateway] Client disconnected. Total: ${clients.size}`);
  });
});

/* -------------------- START -------------------- */
server.listen(PORT, () => {
  console.log(`[Gateway] Running on port ${PORT}`);
});