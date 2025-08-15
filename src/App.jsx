import React, { useEffect, useMemo, useState } from "react";
import { Play, Pause, RefreshCw, TrafficCone } from "lucide-react";

const SCENARIOS = [
  { id: "free", name: "Free Flow", timeline: Array.from({ length: 600 }, (_, i) => 10 + Math.round(15 * Math.sin(i / 20))) },
  { id: "congestion", name: "Congestion", timeline: Array.from({ length: 600 }, (_, i) => 70 + Math.round(15 * Math.sin(i / 15))) },
  { id: "incident", name: "Incident", timeline: Array.from({ length: 600 }, (_, i) => (i < 200 ? 40 : 90 - Math.round(5 * Math.cos(i / 8)))) }
];

const TICK_MS = 100;
const MIN_GREEN_MS = 7000;
const MAX_GREEN_MS = 45000;
const SAFETY_YELLOW_MS = 3000;
const SAFETY_ALL_RED_MS = 800;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function greenDurationFromScore(score) { const p = clamp(score, 0, 100) / 100; return Math.round(MIN_GREEN_MS + p * (MAX_GREEN_MS - MIN_GREEN_MS)); }
function useTicker(running) { const [tick, setTick] = useState(0); useEffect(() => { if (!running) return; const id = setInterval(() => setTick((t) => t + 1), TICK_MS); return () => clearInterval(id); }, [running]); return tick; }
function isGreenActive(phase, activeDir) { return (phase === "A" && activeDir === "A") || (phase === "B" && activeDir === "B"); }
function computeMessage(score, phase, activeDir, scenarioId, secondsLeft) {
  if (phase === "YELLOW" || phase === "ALLRED") return "Safety phase. Please wait.";
  if (scenarioId === "incident" && score > 85) { const base = "Incident ahead. Adjusting phase."; return isGreenActive(phase, activeDir) ? `${base} ${secondsLeft}s left.` : base; }
  if (score > 65) { const base = `High traffic. Extending ${activeDir} green.`; return isGreenActive(phase, activeDir) ? `${base} ${secondsLeft}s left.` : base; }
  if (score < 30) { const base = "Low traffic. Faster switching."; return isGreenActive(phase, activeDir) ? `${base} ${secondsLeft}s left.` : base; }
  const base = "Adaptive control active."; return isGreenActive(phase, activeDir) ? `${base} ${secondsLeft}s left.` : base;
}

function distributeCars(total, phase) {
  // Распределяем машины по направлениям N,E,S,W
  const weights = phase === "A" ? [0.2, 0.3, 0.2, 0.3] : phase === "B" ? [0.3, 0.2, 0.3, 0.2] : [0.25, 0.25, 0.25, 0.25];
  const raw = weights.map(w => total * w);
  const base = raw.map(v => Math.floor(v));
  let sum = base.reduce((a,b)=>a+b,0);
  const rem = raw.map((v,i)=>({i, r: v - base[i]})).sort((a,b)=>b.r-a.r);
  let k = 0; while (sum < total) { base[rem[k%4].i]++; sum++; k++; }
  return base; // [N,E,S,W]
}

function RoadQueue({ count, label, green }) {
  const capped = clamp(count, 0, 20);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-12 h-[180px] rounded-xl border ${green ? "border-green-500" : "border-red-500"} bg-gray-200/60 flex flex-col justify-end items-center gap-1 p-1 overflow-hidden`}>
        {Array.from({ length: capped }).map((_, i) => (
          <div key={i} className="w-8 h-3 rounded-sm bg-gray-700" />
        ))}
      </div>
      <div className="text-[10px] text-gray-600">{label}: {capped}</div>
    </div>
  );
}

function Billboard({ id, score, phase, activeDir, scenarioId, secondsLeft }) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex flex-col items-center w-[240px] bg-black text-white rounded-2xl shadow-lg overflow-hidden">
        <div className="w-full p-2 bg-gray-800 text-center text-sm font-semibold">Smart Billboard #{id}</div>
        <div className="flex-1 flex flex-col justify-center items-center bg-gray-900 px-2 py-6 aspect-[9/16]">
          <p className="text-sm text-center font-medium">{computeMessage(score, phase, activeDir, scenarioId, secondsLeft)}</p>
        </div>
        {/* нижняя зона рекламы ~40% */}
        <div className="flex gap-1 w-full h-[40%]">
          <div className="w-1/2 bg-white text-black text-xs font-medium text-center p-2 flex items-center justify-center">Ad Left {id}</div>
          <div className="w-1/2 bg-white text-black text-xs font-medium text-center p-2 flex items-center justify-center">Ad Right {id}</div>
        </div>
      </div>
      {/* тонкий разделитель и очередь машин для этой дороги */}
      <div className="flex items-center"><div className="w-[2px] h-full bg-black/20"/></div>
      {/* сам RoadQueue рендерится снаружи, чтобы передать правильное количество */}
    </div>
  );
}

function IntersectionMini({ counts, phase }) {
  const [n,e,s,w] = counts;
  return (
    <div className="relative w-full aspect-square rounded-xl bg-gray-100 overflow-hidden">
      {/* дороги */}
      <div className="absolute inset-0">
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-16 bg-gray-300" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-16 bg-gray-300" />
      </div>
      {/* машины */}
      <div className="absolute left-1/2 -translate-x-1/2 top-1 p-1 flex flex-col gap-1 items-center">
        {Array.from({length: clamp(n,0,20)}).map((_,i)=>(<div key={i} className="w-10 h-3 bg-gray-700 rounded-sm"/>))}
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 p-1 flex flex-col gap-1 items-end">
        {Array.from({length: clamp(e,0,20)}).map((_,i)=>(<div key={i} className="w-3 h-10 bg-gray-700 rounded-sm"/>))}
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-1 p-1 flex flex-col-reverse gap-1 items-center">
        {Array.from({length: clamp(s,0,20)}).map((_,i)=>(<div key={i} className="w-10 h-3 bg-gray-700 rounded-sm"/>))}
      </div>
      <div className="absolute left-1 top-1/2 -translate-y-1/2 p-1 flex flex-col gap-1 items-start">
        {Array.from({length: clamp(w,0,20)}).map((_,i)=>(<div key={i} className="w-3 h-10 bg-gray-700 rounded-sm"/>))}
      </div>
      <div className="absolute top-2 left-2 text-[10px] bg-white/70 rounded px-1">Phase: {phase}</div>
    </div>
  );
}

export default function App() {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("A"); // "A" | "B" | "YELLOW" | "ALLRED"
  const [phaseEndAt, setPhaseEndAt] = useState(Date.now() + MIN_GREEN_MS);
  const [activeDir, setActiveDir] = useState("A");
  const tick = useTicker(running);

  const score = useMemo(() => scenario.timeline[clamp(index, 0, scenario.timeline.length - 1)], [index, scenario]);
  const msLeft = Math.max(0, phaseEndAt - Date.now());
  const secondsLeft = Math.ceil(msLeft / 1000);
  const totalCars = Math.round(score / 5); // 0..20
  const counts = useMemo(() => distributeCars(totalCars, phase), [totalCars, phase]); // [N,E,S,W]

  useEffect(() => {
    if (!running) return;
    if (Date.now() >= phaseEndAt) {
      if (phase === "A") { setPhase("YELLOW"); setPhaseEndAt(Date.now() + SAFETY_YELLOW_MS); }
      else if (phase === "YELLOW") { setPhase("ALLRED"); setPhaseEndAt(Date.now() + SAFETY_ALL_RED_MS); }
      else if (phase === "ALLRED") { const nextDir = activeDir === "A" ? "B" : "A"; setActiveDir(nextDir); setPhase(nextDir); setPhaseEndAt(Date.now() + greenDurationFromScore(score)); }
      else if (phase === "B") { setPhase("YELLOW"); setPhaseEndAt(Date.now() + SAFETY_YELLOW_MS); }
    }
    setIndex((i) => (i + 1) % scenario.timeline.length);
  }, [tick, running, phase, activeDir, score]);

  const dirs = ["N", "E", "S", "W"];
  const isGreenMap = phase === "A"
    ? { N: true, S: true, E: false, W: false }
    : phase === "B"
    ? { N: false, S: false, E: true, W: true }
    : { N: false, E: false, S: false, W: false };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Smart Billboard – MVP (Simulation)</h1>
      <div className="flex gap-2 mb-4">
        {SCENARIOS.map((s) => (
          <button key={s.id} onClick={() => setScenario(s)} className={`px-4 py-2 rounded-full font-medium border shadow ${scenario.id === s.id ? "bg-black text-white" : "bg-white"}`}>{s.name}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LEFT: 4 billboards each with its road queue nearby */}
        <div className="grid grid-cols-2 gap-4">
          {[1,2,3,4].map((id, idx) => (
            <div key={id} className="flex items-stretch gap-2">
              <Billboard id={id} score={score} phase={phase} activeDir={activeDir} scenarioId={scenario.id} secondsLeft={secondsLeft} />
              <RoadQueue count={counts[idx]} label={dirs[idx]} green={isGreenMap[dirs[idx]]} />
            </div>
          ))}
        </div>

        {/* RIGHT: Controller with mini intersection visual */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl shadow">
            <h2 className="font-semibold flex items-center gap-2"><TrafficCone className="w-5 h-5 text-orange-500" />Intersection Controller</h2>
            <p className="text-sm">Active direction: <strong>{activeDir}</strong> | Phase: <strong>{phase}</strong></p>
            <div className="flex items-center gap-4 mt-3">
              <div className={`w-20 h-20 rounded-full ${phase === "A" ? "bg-green-500" : "bg-gray-800"} grid place-items-center text-white`}>A</div>
              <div className={`w-20 h-20 rounded-full ${phase === "B" ? "bg-green-500" : "bg-gray-800"} grid place-items-center text-white`}>B</div>
              <div className={`w-20 h-20 rounded-full ${(phase === "ALLRED" || phase === "YELLOW") ? "bg-yellow-500" : "bg-gray-800"} grid place-items-center text-white`}>All</div>
            </div>
            <p className="text-sm mt-2">Time left this phase: <strong>{secondsLeft}s</strong></p>
            <p className="text-xs text-gray-500">Target green (if next start): {greenDurationFromScore(score) / 1000}s</p>
            <div className="mt-4">
              <IntersectionMini counts={counts} phase={phase} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow text-sm">
            <div className="font-semibold mb-1">Live Metrics</div>
            <ul className="space-y-1 text-gray-700">
              <li>Sim FPS: ~{Math.round(1000 / TICK_MS)} fps</li>
              <li>Scenario length: {Math.round(scenario.timeline.length * TICK_MS / 1000)} s</li>
              <li>Green bounds: {Math.round(MIN_GREEN_MS/1000)}–{Math.round(MAX_GREEN_MS/1000)} s</li>
              <li>Total cars (sim): {totalCars} (N:{counts[0]}, E:{counts[1]}, S:{counts[2]}, W:{counts[3]})</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button onClick={() => setRunning(!running)} className="px-4 py-2 bg-green-600 text-white rounded shadow">{running ? <Pause className="inline w-4 h-4 mr-1" /> : <Play className="inline w-4 h-4 mr-1" />}{running ? "Pause" : "Play"}</button>
        <button onClick={() => { setIndex(0); setRunning(false); setPhase("A"); setActiveDir("A"); setPhaseEndAt(Date.now() + MIN_GREEN_MS); }} className="px-4 py-2 bg-gray-300 rounded shadow"><RefreshCw className="inline w-4 h-4 mr-1" /> Reset</button>
      </div>
    </div>
  );
}
