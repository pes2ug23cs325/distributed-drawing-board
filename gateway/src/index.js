const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.GATEWAY_PORT || 3000;

app.get("/health", (req, res) => {
  res.json({ status: "gateway up" });
});

app.listen(PORT, () => {
  console.log(`[Gateway] Stub running on port ${PORT}`);
});