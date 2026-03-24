const express = require("express");
const app = express();
app.use(express.json());

const ID = process.env.REPLICA_ID || "replica1";
const PORT = process.env.REPLICA_PORT || 4001;

app.get("/health", (req, res) => {
  res.json({ status: "up", id: ID });
});

app.listen(PORT, () => {
  console.log(`[${ID}] Replica stub running on port ${PORT}`);
});