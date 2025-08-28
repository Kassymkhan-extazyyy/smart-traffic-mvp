import express from "express";

const app = express();
app.use(express.json());

app.get("/api/traffic", (req, res) => {
  const score = Math.max(0, Math.min(100, Math.round(50 + (Math.random() - 0.5) * 20)));
  res.json({ score });
});

app.post("/api/decision", (req, res) => {
  const payload = req.body || {};
  const counts = payload.counts || {};
  const ns = (counts.N || 0) + (counts.S || 0);
  const ew = (counts.E || 0) + (counts.W || 0);

  const nextDir = ns >= ew ? "A" : "B";
  const greenMs = 12000 + Math.floor(Math.random() * 8000);

  res.json({ nextDir, greenMs, reason: "mock decision" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
