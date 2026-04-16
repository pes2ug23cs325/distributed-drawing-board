/**
 * stress-test.js
 *
 * Sends 100 strokes via WebSocket to the gateway to stress test
 * the Mini-RAFT consensus pipeline under load.
 *
 * Usage:
 *   npm install ws     (only needed once)
 *   node stress-test.js
 *
 * Expected result:
 *   - 100 strokes appear on all open browser tabs
 *   - Gateway logs show "Broadcasted to N clients" for each stroke
 *   - Replicas log "Majority reached" for each committed stroke
 */
const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:3000");

ws.on("open", async () => {
  console.log("Connected to gateway");

  const total = 100;
  const batchSize = 10; // send 10 at a time

  for (let i = 0; i < total; i += batchSize) {
    const batch = [];

    for (let j = i; j < i + batchSize && j < total; j++) {
      batch.push({
        type: "stroke",
        payload: {
          tool: "pen",
          x0: 100 + (j % 10) * 80,
          y0: 100 + Math.floor(j / 10) * 60,
          x1: 140 + (j % 10) * 80,
          y1: 140 + Math.floor(j / 10) * 60,
          color: "#000000",
          width: 3,
        },
      });
    }

    // send batch
    batch.forEach(msg => ws.send(JSON.stringify(msg)));

    //  tiny delay so backend can breathe
    await new Promise(res => setTimeout(res, 5));
  }

  console.log("All 100 strokes sent reliably");

  setTimeout(() => {
    ws.close();
    console.log("Connection closed");
  }, 2000);
});

ws.on("error", (err) => console.log("Error:", err.message));