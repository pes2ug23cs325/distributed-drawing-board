const express = require("express");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.GATEWAY_PORT || 3000;

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`[Gateway] Running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

let clients = [];

wss.on("connection", (ws) => {
  console.log("Client connected");
  clients.push(ws);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      console.log("[Gateway] Stroke received:", data);

      // TEMP: send to replica1 (leader placeholder)
      await axios.post("http://replica1:4001/draw", data).catch(() => {});

      // Broadcast to all clients
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });

    } catch (err) {
      console.error("Error:", err.message);
    }
  });

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "gateway up" });
});