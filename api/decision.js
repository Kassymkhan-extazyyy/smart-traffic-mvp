// api/decision.js — Rule-based PRO (без ML)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    counts = { N: 0, E: 0, S: 0, W: 0 },
    waits = { N: 0, E: 0, S: 0, W: 0 },
    scenarioId = "free",
    lastGreenDir = "A",            // "A" = NS, "B" = EW
    outflowNS = false,
    outflowEW = false
  } = req.body || {};

  const MIN_GREEN_MS = 7000;
  const MAX_GREEN_MS = 45000;
  const Tmax = 90; // секунд макс ожидания

  const sum = (a, b) => a + b;
  const total = [counts.N, counts.E, counts.S, counts.W].reduce(sum, 0);

  // 1) Max-wait гарантия (если кто-то ждет слишком долго — его ось идёт следующей)
  const waitsArr = [
    ["N", waits.N],
    ["E", waits.E],
    ["S", waits.S],
    ["W", waits.W],
  ].sort((a, b) => b[1] - a[1]);

  if (waitsArr[0][1] >= Tmax) {
    const d = waitsArr[0][0];
    const nextDir = (d === "N" || d === "S") ? "A" : "B";
    return res.status(200).json({ nextDir, greenMs: 15000, reason: "max-wait" });
  }

  // 2) Взвешенная "справедливость": очередь * (1 + wait/Tmax)
  const weight = (q, w) => q * (1 + (w / Tmax));
  const prioNS = weight(counts.N, waits.N) + weight(counts.S, waits.S);
  const prioEW = weight(counts.E, waits.E) + weight(counts.W, waits.W);

  let nextDir = prioNS >= prioEW ? "A" : "B";

  // 3) Инцидент → лёгкий приоритет оси с большей загрузкой и расширение cap
  let maxGreen = MAX_GREEN_MS;
  if (scenarioId === "incident") {
    if ((counts.N + counts.S) > (counts.E + counts.W)) nextDir = "A";
    else nextDir = "B";
    maxGreen = Math.round(MAX_GREEN_MS * 1.15); // +15% верхняя граница
  }

  // 4) База длительности зелёного: по общему трафику и среднему wait
  const avgWait = (waits.N + waits.E + waits.S + waits.W) / 4;
  let greenMs = MIN_GREEN_MS +
    Math.min(38000, total * 800 + avgWait * 120); // мягкая зависимость

  // 5) Пакеты/платооны: если на только что зелёной оси был заметен отток — чутка продлить
  if ((nextDir === "A" && outflowNS) || (nextDir === "B" && outflowEW)) {
    greenMs += 2500; // +2.5с продление, выглядит естественно
  }

  // 6) Жёсткие границы безопасности
  greenMs = Math.max(MIN_GREEN_MS, Math.min(maxGreen, Math.round(greenMs)));

  res.status(200).json({ nextDir, greenMs, reason: "rule-pro" });
}
