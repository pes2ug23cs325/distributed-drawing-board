const express = require("express");
const app = express();
app.use(express.json());

const ID = process.env.REPLICA_ID || "replica1";
const PORT = process.env.REPLICA_PORT || 4001;

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "up", id: ID });
});

// NEW: Draw endpoint
app.post("/draw", (req, res) => {
  const stroke = req.body;

  console.log(`[${ID}] Received stroke:`, stroke);

  // For now just acknowledge
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`[${ID}] Replica running on port ${PORT}`);
});