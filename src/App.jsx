import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RefreshCw, TrafficCone } from "lucide-react";

const SCENARIOS = [
  {
    id: "free",
    name: "Free Flow",
    description: "Low congestion, fast switching.",
    timeline: Array.from({ length: 600 }, (_, i) => 10 + Math.round(15 * Math.sin(i / 20)) + (i % 7 === 0 ? 3 : 0))
  },
  {
    id: "congestion",
    name: "Congestion",
    description: "High congestion, longer green on main.",
    timeline: Array.from({ length: 600 }, (_, i) => 70 + Math.round(15 * Math.sin(i / 15)) + (i % 11 === 0 ? 5 : 0))
  },
  {
    id: "incident",
    name: "Incident",
    description: "Sudden blockage, safety-first behavior.",
    timeline: Array.from({ length: 600 }, (_, i) => (i < 200 ? 40 + Math.round(10 * Math.sin(i / 18)) : 90 - Math.round(5 * Math.cos(i / 8))))
  }
];

const TICK_MS = 100;
const MIN_GREEN_MS = 7000;
const MAX_GREEN_MS = 45000;
const SAFETY_YELLOW_MS = 3000;
const SAFETY_ALL_RED_MS = 800;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function greenDurationFromScore(score) {
  const p = clamp(score, 0, 100) / 100;
  return Math.round(MIN_GREEN_MS + p * (MAX_GREEN_MS - MIN_GREEN_MS));
}
function useTicker(running) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(t => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [running]);
  return tick;
}
function isGreenActive(phase, activeDir) {
  return (phase === "A" && activeDir === "A") || (phase === "B" && activeDir === "B");
}
function computeMessage(score, phase, activeDir, scenarioId, secondsLeft) {
  if (phase === "YELLOW" || phase === "ALLRED") return "Safety phase. Please wait.";
  if (scenarioId === "incident" && score > 85) {
    const base = "Incident ahead detected. Adjusting phases.";
    return isGreenActive(phase, activeDir) ? `${base} ${secondsLeft}s left.` : base;
  }
  if (score > 65) {
    const base = `High traffic. Extending ${activeDir} green.`;
    return isGreenActive(phase, activeDir) ? `${base} ${secondsLeft}s left.` : base;
  }
  if (score < 30) {
    const base = "Low traffic. Faster switching.";
    return isGreenActive(phase, activeDir) ? `${base} ${secondsLeft}s left.` : base;
  }
  const base = "Adaptive control active.";
  return isGreenActive(phase, activeDir) ? `${base} ${secondsLeft}s left.` : base;
}

export default function App() {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("A");          // "A" | "B" | "YELLOW" | "ALLRED"
  const [phaseEndAt, setPhaseEndAt] = useState(Date.now() + MIN_GREEN_MS);
  const [activeDir, setActiveDir] = useState("A");  // "A" | "B"
  const [latencyMs, setLatencyMs] = useState(60);

  const [adIdxLeft, setAdIdxLeft] = useState(0);
  const [adIdxRight, setAdIdxRight] = useState(1);
  const [fadeLeft, setFadeLeft] = useState(true);
  const [fadeRight, setFadeRight] = useState(true);

  const latencyWindow = useRef([]);
  const tick = useTicker(running);

  const score = useMemo(() => scenario.timeline[clamp(index, 0, scenario.timeline.length - 1)], [scenario, index]);
  const targetGreenMs = useMemo(() => greenDurationFromScore(score), [score]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setFadeLeft(false);
      setFadeRight(false);
      setTimeout(() => {
        setAdIdxLeft(i => (i + 1) % ADS_LEFT.length);
        setAdIdxRight(i => (i + 1) % ADS_RIGHT.length);
        setFadeLeft(true);
        setFadeRight(true);
      }, 350);
    }, 8000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    setIndex(i => (i + 1) % scenario.timeline.length);

    const st = performance.now();
    const waste = Math.sqrt(score * score + (index % 97));
    void waste;
    const lt = Math.round(performance.now() - st) + 40;
    latencyWindow.current.push(lt);
    if (latencyWindow.current.length > 10) latencyWindow.current.shift();
    setLatencyMs(Math.round(latencyWindow.current.reduce((a, b) => a + b, 0) / latencyWindow.current.length));

    if (Date.now() >= phaseEndAt) {
      if (phase === "A" || phase === "B") {
        setPhase("YELLOW");
        setPhaseEndAt(Date.now() + SAFETY_YELLOW_MS);
      } else if (phase === "YELLOW") {
        setPhase("ALLRED");
        setPhaseEndAt(Date.now() + SAFETY_ALL_RED_MS);
      } else if (phase === "ALLRED") {
        const nextDir = activeDir === "A" ? "B" : "A";
        setActiveDir(nextDir);
        setPhase(nextDir);
        setPhaseEndAt(Date.now() + greenDurationFromScore(score));
      }
    } else {
      if ((phase === "A" && activeDir === "A") || (phase === "B" && activeDir === "B")) {
        const remaining = phaseEndAt - Date.now();
        const target = targetGreenMs;
        if (target > remaining && remaining < MAX_GREEN_MS) {
          const extension = Math.min(300, target - remaining);
          setPhaseEndAt(t => t + extension);
        }
      }
    }
  }, [tick]);

  useEffect(() => {
    setIndex(0);
    setActiveDir("A");
    setPhase("A");
    setPhaseEndAt(Date.now() + greenDurationFromScore(scenario.timeline[0]));
  }, [scenario.id]);

  const secondsLeft = Math.max(0, Math.ceil((phaseEndAt - Date.now()) / 1000));
  const msgTop = computeMessage(score, phase, activeDir, scenario.id, secondsLeft);

  useEffect(() => {
    const t1 = computeMessage(90, "A", "A", "incident", 12);
    console.assert(t1.startsWith("Incident ahead"));
    const t2 = computeMessage(90, "YELLOW", "A", "incident", 5);
    console.assert(t2 === "Safety phase. Please wait.");
    const t3 = computeMessage(90, "A", "A", "congestion", 10);
    console.assert(t3.includes("High traffic") && t3.includes("10s"));
  }, []);

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900 p-6">
      <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
        {/* LEFT: Billboard layout */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-semibold">Smart Billboard – MVP (Simulation)</h1>
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 rounded-2xl bg-white shadow" onClick={() => setRunning(true)}><Play className="inline w-4 h-4"/> Play</button>
              <button className="px-3 py-2 rounded-2xl bg-white shadow" onClick={() => setRunning(false)}><Pause className="inline w-4 h-4"/> Pause</button>
              <button className="px-3 py-2 rounded-2xl bg-white shadow" onClick={() => {
                setIndex(0); setActiveDir("A"); setPhase("A"); setPhaseEndAt(Date.now() + greenDurationFromScore(scenario.timeline[0]));
              }}><RefreshCw className="inline w-4 h-4"/> Reset</button>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            {SCENARIOS.map(s => (
              <button key={s.id} onClick={() => setScenario(s)} className={`px-3 py-2 rounded-2xl shadow ${scenario.id===s.id?"bg-black text-white":"bg-white"}`}>
                {s.name}
              </button>
            ))}
          </div>

          {/* Billboard frame */}
          <div className="relative w-full bg-[#0f141c] rounded-2xl overflow-hidden shadow border border-black/10" style={{aspectRatio:"3/4"}}>
            {/* Warning (top) */}
            <div className="absolute top-0 left-0 right-0" style={{height:"58%"}}>
              <div className="w-full h-full bg-[#0b1220] flex items-center justify-center p-4">
                <div className="text-center">
                  <div className="text-white text-xl md:text-2xl font-semibold mb-2">Warning screen</div>
                  <div className="text-white/90 text-base md:text-lg">{msgTop}</div>
                </div>
              </div>
            </div>

            {/* Divider bar */}
            <div className="absolute left-0 right-0 bg-black/60" style={{height:"3%", top:"58%"}} />

            {/* Ads bottom (two slots) */}
            <div className="absolute left-0 right-0 bottom-0" style={{height:"39%"}}>
              <div className="grid grid-cols-2 gap-2 h-full p-3">
                <div className={`bg-white rounded-xl grid place-items-center overflow-hidden transition-opacity duration-700 ${fadeLeft ? "opacity-100" : "opacity-0"}`}>
                  <img src={ADS_LEFT[adIdxLeft].url} alt="ad-left" className="max-h-full max-w-full object-contain" />
                </div>
                <div className={`bg-white rounded-xl grid place-items-center overflow-hidden transition-opacity duration-700 ${fadeRight ? "opacity-100" : "opacity-0"}`}>
                  <img src={ADS_RIGHT[adIdxRight].url} alt="ad-right" className="max-h-full max-w-full object-contain" />
                </div>
              </div>
            </div>
          </div>

          {/* Helper note */}
          <div className="mt-3 text-xs text-gray-500">
            Demo only. No real traffic infrastructure is controlled.
          </div>
        </div>

        {/* RIGHT: Intersection Controller (kept as in your screenshot) */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center gap-2 mb-2"><TrafficCone className="w-5 h-5"/><h2 className="font-semibold">Intersection Controller</h2></div>
            <div className="text-sm text-gray-600 mb-3">Active direction: <b>{activeDir}</b> | Phase: <b>{phase}</b></div>
            <div className="grid grid-cols-3 gap-4 place-items-center mb-3">
              <div className="w-28 h-28 rounded-full grid place-items-center" style={{ background: phase === "A" ? "#16a34a" : phase === "YELLOW" ? "#fbbf24" : "#ef4444" }}>
                <span className="text-white text-sm">A</span>
              </div>
              <div className="w-28 h-28 rounded-full grid place-items-center" style={{ background: phase === "B" ? "#16a34a" : phase === "YELLOW" ? "#fbbf24" : "#0f1626" }}>
                <span className="text-white text-sm">B</span>
              </div>
              <div className="w-28 h-28 rounded-full grid place-items-center" style={{ background: phase === "ALLRED" ? "#ef4444" : "#0f1626" }}>
                <span className="text-white text-sm">All</span>
              </div>
            </div>
            <div className="mt-1 text-sm">Time left this phase: <b>{Math.max(0, Math.ceil((phaseEndAt - Date.now()) / 1000))}s</b></div>
            <div className="mt-1 text-xs text-gray-600">Target green (if next start): <b>{Math.round(targetGreenMs/1000)}s</b></div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 text-sm">
            <div className="font-semibold mb-2">Live Metrics</div>
            <ul className="space-y-1 text-gray-700">
              <li>Sim FPS: ~{Math.round(1000 / TICK_MS)} fps</li>
              <li>Decision latency (sim): {latencyMs} ms</li>
              <li>Scenario length: {Math.round(scenario.timeline.length * TICK_MS / 1000)} s</li>
              <li>Green bounds: {Math.round(MIN_GREEN_MS/1000)}–{Math.round(MAX_GREEN_MS/1000)} s</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const ADS_LEFT = [
  { url: "https://placehold.co/500x300?text=Ad+Left+1" },
  { url: "https://placehold.co/500x300?text=Ad+Left+2" },
  { url: "https://placehold.co/500x300?text=Ad+Left+3" }
];

const ADS_RIGHT = [
  { url: "https://placehold.co/500x300?text=Ad+Right+1" },
  { url: "https://placehold.co/500x300?text=Ad+Right+2" },
  { url: "https://placehold.co/500x300?text=Ad+Right+3" }
];
