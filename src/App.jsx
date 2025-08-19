import React, { useEffect, useMemo, useState, useRef } from "react";
import { Play, Pause, RefreshCw, TrafficCone, Home, BarChart3, Shield, Settings } from "lucide-react";


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
const SEC_SAFETY = Math.ceil((SAFETY_YELLOW_MS + SAFETY_ALL_RED_MS) / 1000);

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
  const weights = phase === "A"
  ? [0.15, 0.35, 0.15, 0.35]   // A=North&South зелёные -> меньше там, больше на E/W (красные)
  : phase === "B"
  ? [0.35, 0.15, 0.35, 0.15]   // B=East&West зелёные -> больше на N/S (красные)
  : [0.25, 0.25, 0.25, 0.25];
  const raw = weights.map(w => total * w);
  const base = raw.map(v => Math.floor(v));
  let sum = base.reduce((a,b)=>a+b,0);
  const rem = raw.map((v,i)=>({i, r: v - base[i]})).sort((a,b)=>b.r-a.r);
  let k = 0; while (sum < total) { base[rem[k%4].i]++; sum++; k++; }
  return base; // [N,E,S,W]
}

function RoadQueue({ count, label, green }) {
  const capped = clamp(count, 0, 24);
return (
  <div className="flex flex-col items-center gap-1">
    <div className="text-[10px] text-gray-700 font-medium">{label} Road</div>
    <div className={`w-12 h-[240px] rounded-xl border ${green ? "border-green-500" : "border-red-500"} bg-gray-200/60 flex flex-col justify-end items-center gap-1 p-1 overflow-hidden`}>
      {Array.from({ length: clamp(count, 0, 24) }).map((_, i) => (
        <div key={i} className="w-8 h-2 rounded-sm bg-gray-700" />
      ))}
    </div>
    <div className="text-[10px] text-gray-600">Queue: {clamp(count, 0, 24)} cars</div>
  </div>
);
}

function Billboard({ id, dir, isGreen, secForDir }) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="neu flex flex-col items-center w-[240px] text-white overflow-hidden border border-[rgba(255,255,255,.2)]">
  <div className="w-full p-2 bg-gray-800 text-center text-sm font-semibold">
    Smart Billboard #{id}
  </div>

  {/* индикатор */}
  <div className={`h-1 w-full ${isGreen ? "bg-emerald-500" : "bg-rose-500"}`} />

  {/* основная зона с фоном-градиентом */}
  <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-blue-900 via-blue-800 to-blue-600 w-full">
    <p className="text-sm text-center font-semibold">
      {dir}: {isGreen ? "GREEN" : "RED"}
    </p>
    <p className="text-xs text-center opacity-90 mt-1">
      {isGreen ? `Ends in ${secForDir}s` : `~${secForDir}s to GREEN`}
    </p>
  </div>

        {/* нижняя зона рекламы ~40% высоты */}
<div className="flex w-full h-[40%] relative px-2 pb-2">
  {/* Левая реклама */}
  <div className="flex-1 bg-white text-black text-xs font-medium text-center 
                  p-2 flex items-center justify-center rounded-l-lg shadow-sm border">
    Ad Left {id}
  </div>

  {/* Разделительная линия */}
  <div className="w-[2px] bg-gradient-to-b from-black/40 via-black/60 to-black/40"></div>

  {/* Правая реклама */}
  <div className="flex-1 bg-white text-black text-xs font-medium text-center 
                  p-2 flex items-center justify-center rounded-r-lg shadow-sm border">
    Ad Right {id}
  </div>
</div>
      </div>

      {/* тонкий разделитель — визуально отделяет биллборд от очереди машин */}
      <div className="flex items-center">
        <div className="w-[2px] h-full bg-black/20" />
      </div>
    </div>
  );
}



function IntersectionMini({ counts, phase }) {
  const [n,e,s,w] = counts; // numbers
  return (
    <div className="relative w-full aspect-square rounded-xl bg-gray-100 overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-16 bg-gray-300" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-16 bg-gray-300" />
      </div>
      {/* cars */}
      <div className="absolute left-1/2 -translate-x-1/2 top-1 p-1 flex flex-col gap-1 items-center">
        {Array.from({length: Math.min(Math.max(n,0),24)}).map((_,i)=>(<div key={i} className="w-8 h-3 bg-gray-700 rounded-sm"/>))}
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 p-1 flex flex-row-reverse gap-1 items-center">
  {Array.from({length: clamp(e,0,24)}).map((_,i)=>(
    <div key={i} className="w-8 h-3 bg-gray-700 rounded-sm"/>
  ))}
</div>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-1 p-1 flex flex-col-reverse gap-1 items-center">
        {Array.from({length: Math.min(Math.max(s,0),24)}).map((_,i)=>(<div key={i} className="w-8 h-3 bg-gray-700 rounded-sm"/>))}
      </div>
      <div className="absolute left-1 top-1/2 -translate-y-1/2 p-1 flex flex-row gap-1 items-center">
  {Array.from({length: clamp(w,0,24)}).map((_,i)=>(
    <div key={i} className="w-8 h-3 bg-gray-700 rounded-sm"/>
  ))}
</div>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-2 left-2 text-[10px] bg-white/70 rounded px-1">Phase: {phase}</div>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] bg-white/70 rounded px-1">North</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] bg-white/70 rounded px-1">East</div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] bg-white/70 rounded px-1">South</div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] bg-white/70 rounded px-1">West</div>
      </div>
    </div>
  );
}

async function getModelDecision(payload) {
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Model API failed");
  return res.json(); // { nextDir, greenMs, reason }
}

function MiniCross({ activeAxis, phase }) {
  // activeAxis: "A" (North-South) | "B" (East-West)
  const glowA = activeAxis === "A" && phase === "A";
  const glowB = activeAxis === "B" && phase === "B";
  return (
    <div className="relative w-full h-56 rounded-xl bg-slate-100 overflow-hidden">
      {/* вертикальная ось */}
      <div className={`absolute left-1/2 -translate-x-1/2 inset-y-0 w-20 rounded-md 
                       ${glowA ? "bg-emerald-200" : "bg-slate-300"}`}>
        {glowA && <div className="absolute inset-0 bg-emerald-400/30 blur-xl" />}
      </div>
      {/* горизонтальная ось */}
      <div className={`absolute top-1/2 -translate-y-1/2 inset-x-0 h-20 rounded-md 
                       ${glowB ? "bg-emerald-200" : "bg-slate-300"}`}>
        {glowB && <div className="absolute inset-0 bg-emerald-400/30 blur-xl" />}
      </div>
      {/* подписи сторон (минимал) */}
      <span className="absolute top-2 left-2 text-[10px] text-slate-600">North</span>
      <span className="absolute bottom-2 left-2 text-[10px] text-slate-600">West</span>
      <span className="absolute bottom-2 right-2 text-[10px] text-slate-600">East</span>
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
  const [waitSec, setWaitSec] = useState([0, 0, 0, 0]); // N,E,S,W в секундах
const prevCountsRef = useRef([0, 0, 0, 0]);
const [lastGreenDir, setLastGreenDir] = useState("A"); // "A" или "B"
  const tick = useTicker(running);
  useEffect(() => {
  if (!running) return;

  setWaitSec(prev => {
    const isA = phase === "A";
    const isB = phase === "B";

    // N,S зелёные на A; E,W зелёные на B
    const green = [isA, isB, isA, isB]; // индексы 0=N,1=E,2=S,3=W

    const next = [...prev];
    for (let i = 0; i < 4; i++) {
      next[i] = green[i] ? 0 : Math.min(prev[i] + Math.ceil(TICK_MS / 1000), 3600); // кап 1ч
    }
    return next;
  });
}, [tick, running, phase]);


  const score = useMemo(() => scenario.timeline[clamp(index, 0, scenario.timeline.length - 1)], [index, scenario]);
  const msLeft = Math.max(0, phaseEndAt - Date.now());
  const secondsLeft = Math.ceil(msLeft / 1000);
  const baseCars = Math.round(score / 5);
const scenarioFactor =
  scenario.id === "free"       ? 0.9 :
  scenario.id === "congestion" ? 2.0 :
  /* incident */                 1.6;
const totalCars = clamp(Math.round(baseCars * scenarioFactor), 0, 80); // до 80 машин суммарно
  const counts = useMemo(() => distributeCars(totalCars, phase), [totalCars, phase]); // [N,E,S,W]
  // live‑сообщение «мозга»
const infoMessage = computeMessage(score, phase, activeDir, scenario.id, secondsLeft);
  useEffect(() => {
  prevCountsRef.current = counts;
}, [counts]);


  useEffect(() => {
    if (!running) return;
    if (Date.now() >= phaseEndAt) {
      if (phase === "A") { setPhase("YELLOW"); setPhaseEndAt(Date.now() + SAFETY_YELLOW_MS); }
      else if (phase === "YELLOW") { setPhase("ALLRED"); setPhaseEndAt(Date.now() + SAFETY_ALL_RED_MS); }
      else if (phase === "ALLRED") {
  // вычислим признак «шёл ли отток на прошлой зелёной оси»
  const prev = prevCountsRef.current;
  const curNS = counts[0] + counts[2];
  const curEW = counts[1] + counts[3];
  const prevNS = prev[0] + prev[2];
  const prevEW = prev[1] + prev[3];
  const outflowNS = lastGreenDir === "A" && prevNS > curNS;
  const outflowEW = lastGreenDir === "B" && prevEW > curEW;

  // подготовим полезную нагрузку для решателя
  const payload = {
    counts: { N: counts[0], E: counts[1], S: counts[2], W: counts[3] },
    waits:  { N: waitSec[0], E: waitSec[1], S: waitSec[2], W: waitSec[3] },
    scenarioId: scenario.id,
    lastGreenDir,
    outflowNS,
    outflowEW
  };

  getModelDecision(payload)
    .then(({ nextDir, greenMs }) => {
      const bounded = clamp(
        greenMs ?? greenDurationFromScore(score),
        MIN_GREEN_MS,
        MAX_GREEN_MS
      );
      const dir = nextDir === "A" || nextDir === "B"
        ? nextDir
        : (activeDir === "A" ? "B" : "A");
      setActiveDir(dir);
      setLastGreenDir(dir);
      setPhase(dir);
      setPhaseEndAt(Date.now() + bounded);
    })
    .catch(() => {
      // запасной вариант — прежняя формула
      const fallback = greenDurationFromScore(score);
      const dir = activeDir === "A" ? "B" : "A";
      setActiveDir(dir);
      setPhase(dir);
      setPhaseEndAt(Date.now() + fallback);
    });
}
      else if (phase === "B") { setPhase("YELLOW"); setPhaseEndAt(Date.now() + SAFETY_YELLOW_MS); }
    }
    setIndex((i) => (i + 1) % scenario.timeline.length);
  }, [tick, running, phase, activeDir, score]);

  const dirs = ["North", "East", "South", "West"];
  const isGreenMap = phase === "A"
  ? { North: true, South: true, East: false, West: false }
  : phase === "B"
  ? { North: false, South: false, East: true, West: true }
  : { North: false, East: false, South: false, West: false };


  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      {/* Top toolbar: title + scenario chips + controls */}
<div className="sticky top-0 z-10 bg-gray-100/80 backdrop-blur mb-4">
  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-2">
        <div className="sticky top-0 z-10 bg-gray-100/80 backdrop-blur mb-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-2">
        {/* Логотип + текст */}
    <div className="flex items-center gap-3">
     <img src="/logo.png" alt="Logo" className="h-12 w-auto rounded-full shadow" />
      <h1 className="text-2xl font-bold">Smart Billboard – MVP (Simulation)</h1>
    </div>

        <div className="flex flex-wrap items-center gap-2">
          {SCENARIOS.map((s) => {
  const active = scenario.id === s.id;
  return (
    <button
      key={s.id}
      onClick={() => setScenario(s)}
      aria-pressed={active}
      className={`relative px-4 py-2 rounded-full font-medium border
        transition duration-200 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        ${active
          ? "bg-black text-white shadow-lg ring-1 ring-black/30 hover:shadow-xl active:scale-[0.98]"
          : "bg-white text-gray-800 shadow hover:shadow-md active:scale-95"}
      `}
    >
      <span className="pointer-events-none">{s.name}</span>
      {/* мягкое «свечение» для активной */}
      <span
        className={`absolute inset-0 rounded-full transition-opacity
          ${active ? "opacity-20" : "opacity-0"} bg-white`}
        aria-hidden="true"
      />
    </button>
  );
})}

          <div className="hidden md:block h-6 w-px bg-gray-300 mx-1" />

          <button
  onClick={() => setRunning(!running)}
  className={`px-6 py-2 rounded-xl font-semibold transition 
    shadow-lg hover:scale-105 active:scale-95
    ${running 
      ? "bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-red-300/50" 
      : "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-green-300/50"}`}
>
  {running ? <Pause className="inline w-5 h-5 mr-2" /> : <Play className="inline w-5 h-5 mr-2" />}
  {running ? "Pause" : "Play"}
</button>

<button
  onClick={() => {
    setIndex(0);
    setRunning(false);
    setPhase("A");
    setActiveDir("A");
    setPhaseEndAt(Date.now() + MIN_GREEN_MS);
  }}
  className="px-6 py-2 rounded-xl font-semibold transition
    bg-gradient-to-r from-gray-200 to-gray-300 text-gray-800
    shadow-lg hover:scale-105 active:scale-95"
>
  <RefreshCw className="inline w-5 h-5 mr-2" /> Reset
</button>
        </div>
      </div>
    </div>

    {/* Main Layout */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    </div>
  </div>
</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LEFT: 4 billboards each with its road queue nearby */}
        <div className="grid grid-cols-2 gap-4">
  {[1, 2, 3, 4].map((id, idx) => {
    const dir = dirs[idx];
    const isGreen = isGreenMap[dir];
    // если зелёный — показываем оставшиеся секунды,
    // если красный — примерное время до зелёного (конец текущей фазы + safety)
    const secForDir = isGreen ? secondsLeft : (secondsLeft + SEC_SAFETY);

    return (
      <div key={dir} className="flex items-stretch gap-2">
        <Billboard id={id} dir={dir} isGreen={isGreen} secForDir={secForDir} />
        <RoadQueue count={counts[idx]} label={dir} green={isGreen} />
      </div>
    );
  })}
</div>


        {/* RIGHT: Controller with mini intersection visual */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="font-semibold flex items-center gap-2"><TrafficCone className="w-5 h-5 text-orange-500" />Intersection Controller</h2>
            <p className="text-sm">Active direction: <strong>{activeDir}</strong> | Phase: <strong>{phase}</strong></p>
            <div className="flex items-center gap-4 mt-3">
              <div className={`w-24 h-24 rounded-full ${phase === "A" ? "bg-green-500" : "bg-gray-800"} grid place-items-center text-white`}>A</div>
              <div className={`w-24 h-24 rounded-full ${phase === "B" ? "bg-green-500" : "bg-gray-800"} grid place-items-center text-white`}>B</div>
              <div className={`w-24 h-24 rounded-full ${(phase === "ALLRED" || phase === "YELLOW") ? "bg-yellow-500" : "bg-gray-800"} grid place-items-center text-white`}>All</div>
            </div>
            <p className="text-sm mt-2">Time left this phase: <strong>{secondsLeft}s</strong></p>
            <p className="text-xs text-gray-500">Target green (if next start): {greenDurationFromScore(score) / 1000}s</p>
            <div className="mt-4">
              <IntersectionMini counts={counts} phase={phase} />
            </div>
          </div>

          <div className="card p-4 text-sm">
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
    </div>
  );
}
