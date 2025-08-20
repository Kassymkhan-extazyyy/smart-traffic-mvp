import React, { useEffect, useMemo, useState, useRef } from "react";
import { Play, Pause, RefreshCw, TrafficCone, Home, BarChart3, Shield, Settings, Cpu, CircuitBoard, Wifi } from "lucide-react";


const SCENARIOS = [
  { id: "free", name: "Free Flow", timeline: Array.from({ length: 600 }, (_, i) => 10 + Math.round(15 * Math.sin(i / 20))) },
  { id: "congestion", name: "Congestion", timeline: Array.from({ length: 600 }, (_, i) => 70 + Math.round(15 * Math.sin(i / 15))) },
  { id: "incident", name: "Incident", timeline: Array.from({ length: 600 }, (_, i) => (i < 200 ? 40 : 90 - Math.round(5 * Math.cos(i / 8)))) }
];

const TICK_MS = 100;
const MIN_GREEN_MS = 7000;
const MAX_GREEN_MS = 45000;
const SAFETY_YELLOW_MS = 3000;
const SEC_SAFETY = Math.ceil(SAFETY_YELLOW_MS / 1000);

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function greenDurationFromScore(score) { const p = clamp(score, 0, 100) / 100; return Math.round(MIN_GREEN_MS + p * (MAX_GREEN_MS - MIN_GREEN_MS)); }
function useTicker(running) { const [tick, setTick] = useState(0); useEffect(() => { if (!running) return; const id = setInterval(() => setTick((t) => t + 1), TICK_MS); return () => clearInterval(id); }, [running]); return tick; }
function isGreenActive(phase, activeDir) { return (phase === "A" && activeDir === "A") || (phase === "B" && activeDir === "B"); }
function computeMessage(score, phase, activeDir, scenarioId, secondsLeft) {
  if (phase === "YELLOW") return "Safety phase. Please wait.";
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
  // набор слайдов (можно заменить своим контентом/картинками)
  const slides = useMemo(()=>[
    { id: 'ad1', cls: 'ad-g-blue',   text: 'City Wi‑Fi • Connected Everywhere' },
    { id: 'ad2', cls: 'ad-g-green',  text: 'Eco‑Transit • Clean Mobility' },
    { id: 'ad3', cls: 'ad-g-purple', text: 'Smart Energy • AI‑Optimized' },
    { id: 'ad4', cls: 'ad-g-cyan',   text: 'BaQdarsham • Smarter Cities' },
  ], []);

  const [idx, setIdx] = useState(0);

  useEffect(()=>{
    const t = setInterval(()=> setIdx(i => (i+1) % slides.length), 5000); // каждые 5s
    return ()=> clearInterval(t);
  }, [slides.length]);

  return (
    <div className="flex items-stretch gap-2">
      <div className="neu flex flex-col items-center w-[240px] text-white overflow-hidden border border-[rgba(255,255,255,.2)] rounded-xl">
        <div className="w-full p-2 bg-gray-800 text-center text-sm font-semibold">
          Smart Billboard #{id}
        </div>

        {/* индикатор статуса светофора */}
        <div className={`h-1 w-full ${isGreen ? "bg-emerald-500" : "bg-rose-500"}`} />

        {/* статус направления */}
        <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-blue-900 via-blue-800 to-blue-600 w-full">
          <p className={`text-base text-center font-bold ${
              isGreen ? "drop-shadow-[0_0_6px_rgba(34,197,94,0.8)] text-emerald-300"
                      : "drop-shadow-[0_0_6px_rgba(239,68,68,0.8)] text-rose-300"
            }`}>
            {dir}: {isGreen ? "GREEN" : "RED"}
          </p>
          <p className="text-sm text-center opacity-90 mt-1 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]">
            {isGreen ? `Ends in ${secForDir}s` : `~${secForDir}s to GREEN`}
          </p>
        </div>

        {/* РЕКЛАМА: нижняя зона ~40% — ротатор */}
        <div className="w-full h-[40%] p-2">
          <div className="ad-surface h-full neon-ring">
            {slides.map((s, i)=>(
              <div key={s.id} className={`ad-slide ${i===idx?'visible':'hidden'} ${s.cls}`}>
                <span className="text-xs sm:text-sm">{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* разделитель + очередь машин */}
      <div className="flex items-center"><div className="w-[2px] h-full bg-black/20" /></div>
    </div>
  );
}



function IntersectionMini({ counts, phase }) {
  const [n, e, s, w] = counts;

  // Дома только в 4-х углах. Центр (где дороги) — пустой.
  const BLOCKS = [
    // ── NW (верх-лево)
    { l: 4,  t: 4,  w: 10, h: 7 },  { l: 15, t: 5,  w: 8,  h: 6 },
    { l: 7,  t: 14, w: 9,  h: 7 },  { l: 18, t: 14, w: 7,  h: 6 },

    // ── NE (верх-право)
    { l: 74, t: 5,  w: 10, h: 7 },  { l: 86, t: 6,  w: 9,  h: 7 },
    { l: 77, t: 14, w: 9,  h: 7 },  { l: 88, t: 15, w: 7,  h: 6 },

    // ── SW (низ-лево)
    { l: 6,  t: 75, w: 10, h: 7 },  { l: 17, t: 76, w: 8,  h: 6 },
    { l: 8,  t: 84, w: 9,  h: 7 },  { l: 19, t: 85, w: 7,  h: 6 },

    // ── SE (низ-право)
    { l: 76, t: 74, w: 10, h: 7 },  { l: 88, t: 75, w: 9,  h: 7 },
    { l: 79, t: 83, w: 9,  h: 7 },  { l: 90, t: 84, w: 7,  h: 6 },
  ];

  return (
    <div className="relative w-full aspect-square rounded-xl mini-map overflow-hidden">
      {/* Дома (низкий слой, только по углам) */}
      <div className="absolute inset-0 z-0">
        {BLOCKS.map((b, i) => (
          <div
            key={i}
            className="city-block"
            style={{
              left: `${b.l}%`,
              top: `${b.t}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
            }}
          />
        ))}
      </div>



      {/* Дороги (выше домов) */}
      <div className="absolute inset-0 z-10">
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-16 asphalt rounded-md" />
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-16 asphalt rounded-md" />
        <div className="absolute ... asphalt rounded-md ring-1 ring-black/10" />
        <div className="lane-dash" />
      </div>

      {/* Машины (над дорогами) */}
      <div className="absolute left-1/2 -translate-x-1/2 top-1 p-1 flex flex-col gap-1 items-center z-20">
        {Array.from({ length: clamp(n, 0, 24) }).map((_, i) => (
          <div key={i} className="w-8 h-3 bg-gray-700 rounded-sm" />
        ))}
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 p-1 flex flex-row-reverse gap-1 items-center z-20">
        {Array.from({ length: clamp(e, 0, 24) }).map((_, i) => (
          <div key={i} className="w-8 h-3 bg-gray-700 rounded-sm" />
        ))}
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-1 p-1 flex flex-col-reverse gap-1 items-center z-20">
        {Array.from({ length: clamp(s, 0, 24) }).map((_, i) => (
          <div key={i} className="w-8 h-3 bg-gray-700 rounded-sm" />
        ))}
      </div>
      <div className="absolute left-1 top-1/2 -translate-y-1/2 p-1 flex flex-row gap-1 items-center z-20">
        {Array.from({ length: clamp(w, 0, 24) }).map((_, i) => (
          <div key={i} className="w-8 h-3 bg-gray-700 rounded-sm" />
        ))}
      </div>

  


      {/* Подписи */}
      <div className="absolute inset-0 pointer-events-none z-30">
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
  const [theme, setTheme] = useState("day");
  const [incidentSide, setIncidentSide] = useState(null); // "N" | "E" | "S" | "W" | null
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("A"); // "A" | "B" | "YELLOW"
  const [phaseEndAt, setPhaseEndAt] = useState(Date.now() + MIN_GREEN_MS);
  const [activeDir, setActiveDir] = useState("A");
  const [waitSec, setWaitSec] = useState([0, 0, 0, 0]); // N,E,S,W в секундах
const prevCountsRef = useRef([0, 0, 0, 0]);
const [lastGreenDir, setLastGreenDir] = useState("A"); // "A" или "B"
  const tick = useTicker(running);

  // при старте — восстановить
useEffect(() => {
  const saved = localStorage.getItem('theme');
  if (saved === 'day' || saved === 'night') setTheme(saved);
}, []);

// при смене — сохранить
useEffect(() => {
  localStorage.setItem('theme', theme);
}, [theme]);

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
const baseCounts = useMemo(() => distributeCars(totalCars, phase), [totalCars, phase]); // [N,E,S,W]

// усиливаем очередь на стороне инцидента (если выбран)
const counts = useMemo(() => {
  if (scenario.id !== "incident" || !incidentSide) return baseCounts;
  const idxMap = { N: 0, E: 1, S: 2, W: 3 };
  const idx = idxMap[incidentSide] ?? null;
  if (idx === null) return baseCounts.slice();

  const boosted = baseCounts.slice();
  // добавим «пробку» на стороне инцидента: +35% от суммарных машин, но с ограничением
  boosted[idx] = clamp(boosted[idx] + Math.ceil(totalCars * 0.35), 0, 24);

  // по желанию — слегка «снять» с противоположной стороны, чтобы суммарно смотрелось реалистично
  const opposite = (idx + 2) % 4;
  boosted[opposite] = clamp(boosted[opposite] - Math.ceil(totalCars * 0.10), 0, 24);

  return boosted;
}, [baseCounts, scenario.id, incidentSide, totalCars]);
  // live‑сообщение «мозга»
const infoMessage = computeMessage(score, phase, activeDir, scenario.id, secondsLeft);
  useEffect(() => {
  prevCountsRef.current = counts;
}, [counts]);


  useEffect(() => {
    if (!running) return;
    if (Date.now() >= phaseEndAt) {
  if (phase === "A") {
    setPhase("YELLOW");
    setPhaseEndAt(Date.now() + SAFETY_YELLOW_MS);

  } else if (phase === "B") {
    setPhase("YELLOW");
    setPhaseEndAt(Date.now() + SAFETY_YELLOW_MS);

  } else if (phase === "YELLOW") {
    // === решаем куда включать зелёный ===
    const prev = prevCountsRef.current;
    const curNS = counts[0] + counts[2];
    const curEW = counts[1] + counts[3];
    const prevNS = prev[0] + prev[2];
    const prevEW = prev[1] + prev[3];
    const outflowNS = lastGreenDir === "A" && prevNS > curNS;
    const outflowEW = lastGreenDir === "B" && prevEW > curEW;
    // плавный «поток» для анимации машин (0..1)
const [flow, setFlow] = useState(0);

useEffect(() => {
  if (!running) return;
  // шаг анимации — 0.02 ≈ 50 кадров на цикл
  const id = setInterval(() => {
    setFlow(f => (f + 0.02) % 1);
  }, TICK_MS); // синхронно с тиком симуляции
  return () => clearInterval(id);
}, [running]);

    const payload = {
      counts: { N: counts[0], E: counts[1], S: counts[2], W: counts[3] },
      waits:  { N: waitSec[0], E: waitSec[1], S: waitSec[2], W: waitSec[3] },
      scenarioId: scenario.id,
      lastGreenDir,
      outflowNS,
      outflowEW,
      incidentSide
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
        const fallback = greenDurationFromScore(score);
        const dir = activeDir === "A" ? "B" : "A";
        setActiveDir(dir);
        setPhase(dir);
        setPhaseEndAt(Date.now() + fallback);
      });
  }
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
    <div className={`relative min-h-screen p-4 smartcity-bg smartcity-noise ${theme==='night' ? 'theme-night' : 'theme-day'}`}>
      {/* Top toolbar: title + scenario chips + controls */}
<div className="sticky top-0 z-10 mb-4 bg-white/95 shadow-sm">
  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-2">
        <div className="sticky top-0 z-10 mb-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-2">


        {/* Логотип + текст */}
    <div className="flex items-center gap-3">
  <img src="/logo.png" alt="Logo" className="h-12 w-auto rounded-full shadow" />
  <h1 className="text-2xl font-bold">Smart Billboard – MVP (Simulation)</h1>





  {/* Smart City chips */}
  <div className="hidden md:flex items-center gap-2 ml-2">
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white/70 backdrop-blur border border-white/50 shadow-sm">
      <Cpu className="w-3.5 h-3.5" /> AI
    </span>
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white/70 backdrop-blur border border-white/50 shadow-sm">
      <CircuitBoard className="w-3.5 h-3.5" /> Edge
    </span>
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white/70 backdrop-blur border border-white/50 shadow-sm">
      <Wifi className="w-3.5 h-3.5" /> IoT
    </span>
  </div>
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
<div className="flex items-center gap-2">
  <button
    onClick={() => setTheme('day')}
    aria-pressed={theme === 'day'}
    className={`px-4 py-2 rounded-xl font-semibold border transition-all duration-200 transform
      ${theme === 'day'
        ? 'bg-white text-gray-900 border-gray-300 shadow-lg ring-2 ring-yellow-300 scale-105'
        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm hover:scale-105 active:scale-95'}`}
  >
    ☀️ Day
  </button>

  <button
    onClick={() => setTheme('night')}
    aria-pressed={theme === 'night'}
    className={`px-4 py-2 rounded-xl font-semibold border transition-all duration-200 transform
      ${theme === 'night'
        ? 'bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-lg ring-2 ring-indigo-400 scale-105'
        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm hover:scale-105 active:scale-95'}`}
  >
    🌙 Night
  </button>
</div>


{/* Incident side picker */}
{scenario.id === "incident" && (
  <div className="flex items-center gap-1 ml-1">
    {["N","E","S","W"].map((side) => (
      <button
        key={side}
        onClick={() => setIncidentSide(side)}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border
          ${incidentSide===side ? "bg-red-500 text-white border-red-500"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
        title={`Incident at ${side}`}
      >
        🚧 {side}
      </button>
    ))}
    {/* сброс выбора */}
    <button
      onClick={() => setIncidentSide(null)}
      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-600 hover:bg-gray-50"
      title="Clear incident"
    >
      Clear
    </button>
  </div>
)}
        </div>
      </div>
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

            <p className="text-xs text-rose-600 mt-1">
  {scenario.id === "incident"
    ? (incidentSide ? `Incident at: ${incidentSide}` : "Incident: pick a side (N/E/S/W)")
    : null}
</p>

            <p className="text-sm">Active direction: <strong>{activeDir}</strong> | Phase: <strong>{phase}</strong></p>
            <div className="flex items-center gap-6 mt-3">
  {/* Вертикальная ось (A) */}
  <div className="flex flex-col items-center gap-1">
    <div className={`w-10 h-10 rounded-full border-2 border-black ${phase==="A" ? "bg-green-500 shadow-[0_0_10px_3px_rgba(34,197,94,0.7)]" : "bg-gray-700"}`} />
    <span className="text-xs text-gray-600">North/South</span>
  </div>
  {/* Горизонтальная ось (B) */}
  <div className="flex flex-col items-center gap-1">
    <div className={`w-10 h-10 rounded-full border-2 border-black ${phase==="B" ? "bg-green-500 shadow-[0_0_10px_3px_rgba(34,197,94,0.7)]" : "bg-gray-700"}`} />
    <span className="text-xs text-gray-600">East/West</span>
  </div>
  {/* Safety */}
  <div className="flex flex-col items-center gap-1">
    <div className={`w-10 h-10 rounded-full border-2 border-black ${phase==="YELLOW" ? "bg-yellow-400 shadow-[0_0_10px_3px_rgba(250,204,21,0.7)]" : "bg-gray-700"}`} />
    <span className="text-xs text-gray-600">Yellow</span>
  </div>
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
