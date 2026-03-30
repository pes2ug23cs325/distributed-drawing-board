const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:3000");

ws.on("open", () => {
  console.log("Connected to gateway");

  for (let i = 0; i < 100; i++) {
    ws.send(JSON.stringify({
      type: "stroke",
      payload: {
        tool: "pen",
        x0: 100 + (i % 10) * 80,
        y0: 100 + Math.floor(i / 10) * 60,
        x1: 140 + (i % 10) * 80,
        y1: 140 + Math.floor(i / 10) * 60,
        color: "#000000",
        width: 3,
      }
    }));
  }

  console.log("100 strokes sent");
  setTimeout(() => ws.close(), 2000);
});

ws.on("error", (err) => console.log("Error:", err.message));