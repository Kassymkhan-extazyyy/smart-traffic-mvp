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
const PED_MS = 10000;

// ====== LOGGING HELPERS ======
const LOG_KEY = "decisions";
const LOG_CAP = 300_000; // мягкий лимит для localStorage, можно менять

function _readLogs() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; }
}
function _writeLogs(arr) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(arr)); } catch (e) { console.error("log write failed:", e); }
}
function getLogsCount() {
  return _readLogs().length;
}
function getRecentLogs(n = 20) {
  const all = _readLogs();
  return all.slice(Math.max(0, all.length - n));
}
function exportLogsToFile(filename = "decisions.json") {
  const blob = new Blob([JSON.stringify(_readLogs(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
function clearLogs() {
  localStorage.removeItem(LOG_KEY);
  window.dispatchEvent(new CustomEvent("logs:updated", { detail: { total: 0 } }));
}

/** ЛОГГЕР: сохраняет решение + триггерит событие для UI */
function logDecision(payload, decision) {
  try {
    const entry = { payload, decision, ts: Date.now() };
    const logs = _readLogs();
    logs.push(entry);
    if (logs.length > LOG_CAP) logs.splice(0, logs.length - LOG_CAP); // не даём расти бесконечно
    _writeLogs(logs);
    const total = logs.length;
    console.log("📊 Decision logged. Total:", total);
    window.dispatchEvent(new CustomEvent("logs:updated", { detail: { total } }));
  } catch (e) {
    console.error("logDecision failed:", e);
  }
}


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



function IntersectionMini({ counts, phase, theme = 'day', running = false, onImpressions }) {
  const canvasRef = React.useRef(null);
  const animRef   = React.useRef(null);
  const lastTsRef = React.useRef(0);
 

  // === 2 полосы в каждую сторону ===
  // carsRef[dir][lane] -> массив машин, lane: 0 (внутренняя), 1 (внешняя)
  const carsRef   = React.useRef({
    N: [[], []],
    E: [[], []],
    S: [[], []],
    W: [[], []],
  });


  

  // === Параметры сцены ===
  const MAX_PER_LANE = 8;      // кап машин на полосе (держим FPS)
  const ROAD_W = 16;           // ширина дороги в % (та же геометрия)
  const LANE_GAP = 0.22;       // доля половины дороги между полосами (позиционный сдвиг)
  const STOP_POS = 0.80;   // машины останавливаются раньше — есть путь для «разгона»
  const CENTER_GAP = 6;    

  // плотная сетка домов по углам (как ранее)
  const GRID = { rows: 3, cols: 4 };
  const HOUSE = { w: [5.5, 8], h: [4.5, 7], padX: 1.6, padY: 1.6 };
  const WINDOWS = { rows: 3, cols: 4, padX: 2, padY: 2, w: 6, h: 8, gapX: 6, gapY: 8 };

  const PX = (v, size) => Math.round(v * size / 100);

  const palette = theme === 'night'
    ? {
        bg:   '#0b1020',
        asphalt: '#1f2533',
        lane: 'rgba(255,255,255,0.55)',
        laneInner: 'rgba(255,255,255,0.25)', // разделение двух полос
        zebra: '#ffffff',
        car: '#374151',
        houseA: 'rgba(255,255,255,0.08)',
        houseB: 'rgba(255,255,255,0.10)',
        window: 'rgba(255,215,120,0.9)',
        glow:   'rgba(255,215,120,0.35)',
      }
    : {
        bg:   '#eef2f7',
        asphalt: '#9aa3af',
        lane: '#eaeef5',
        laneInner: 'rgba(255,255,255,0.55)',
        zebra: '#ffffff',
        car: '#4b5563',
        houseA: 'rgba(0,0,0,0.06)',
        houseB: 'rgba(0,0,0,0.08)',
        window: 'rgba(255,235,180,0.25)',
        glow:   'rgba(255,235,180,0.07)',
      };

  const isGreen = React.useMemo(() => ({
    N: phase === 'A',
    S: phase === 'A',
    E: phase === 'B',
    W: phase === 'B',
  }), [phase]);


  // распределяем машины на 2 полосы (примерно поровну)
  const syncCars = React.useCallback((dir, wantTotal) => {
  const lanes = carsRef.current[dir];           // <-- ВАЖНО
  const capTotal = Math.min(wantTotal, MAX_PER_LANE * 2);
  const lane0Target = Math.floor(capTotal / 2);
  const lane1Target = capTotal - lane0Target;

  const ensure = (laneArr, target) => {
    while (laneArr.length < target) {
      laneArr.push({
        pos: 0.0 + Math.random() * 0.35, 
        speed: 0.12 + Math.random() * 0.08,
        jitter: (Math.random() - 0.5) * 0.02,
        type: (() => {
          const r = Math.random();
          if (r < 0.10) return 'bus';
          if (r < 0.25) return 'van';
          return 'sedan';
        })(),
        color: (() => {
          const day = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#14b8a6','#64748b'];
          const night = ['#fca5a5','#93c5fd','#86efac','#fde68a','#c4b5fd','#99f6e4','#94a3b8'];
          const bank = (theme === 'night') ? night : day;
          return bank[Math.floor(Math.random() * bank.length)];
        })(),
        braking: false,
        blinkPhase: Math.random() * Math.PI * 2,
      });
    }
    while (laneArr.length > target) laneArr.pop();
  };

  ensure(lanes[0], lane0Target);
  ensure(lanes[1], lane1Target);
}, [theme]);

  React.useEffect(() => {
    const [n,e,s,w] = counts.map(c => Math.max(0, Math.min(c, 24)));
    syncCars('N', Math.round(n));
    syncCars('E', Math.round(e));
    syncCars('S', Math.round(s));
    syncCars('W', Math.round(w));
  }, [counts, syncCars]);

  // --- План домов (кеш) ---
  const housePlanRef = React.useRef(null);
  const makeHousePlan = (width, height) => {
    const QUADS = [
      { x: 3, y: 3,   w: 28, h: 28 },  // NW
      { x: 69, y: 3,  w: 28, h: 28 },  // NE
      { x: 3, y: 69,  w: 28, h: 28 },  // SW
      { x: 69, y: 69, w: 28, h: 28 },  // SE
    ];
    const pick = (a,b) => a + Math.random()*(b-a);
    const plan = [];
    QUADS.forEach((q, qi) => {
      const cellW = q.w / GRID.cols;
      const cellH = q.h / GRID.rows;
      for (let r=0; r<GRID.rows; r++) {
        for (let c=0; c<GRID.cols; c++) {
          const dw = pick(HOUSE.w[0], HOUSE.w[1]);
          const dh = pick(HOUSE.h[0], HOUSE.h[1]);
          const cx = q.x + c * cellW + HOUSE.padX;
          const cy = q.y + r * cellH + HOUSE.padY;
          const cw = cellW - HOUSE.padX*2;
          const ch = cellH - HOUSE.padY*2;
          const x = cx + Math.max(0, (cw - dw)/2);
          const y = cy + Math.max(0, (ch - dh)/2);
          plan.push({
            x, y, w: dw, h: dh,
            tone: (qi + r + c) % 2 ? 'A' : 'B',
            flickerSeed: Math.random() * Math.PI * 2,
          });
        }
      }
    });
    return plan;
  };

  // перерисовка
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;

    const fixSize = () => {
      const dpr = window.devicePixelRatio || 1;
      width  = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width  = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      housePlanRef.current = makeHousePlan(width, height);
    };
    fixSize();
    const onResize = () => fixSize();
    window.addEventListener('resize', onResize);

    const drawStatic = () => {
      // фон
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);

      // дома
      if (!housePlanRef.current) housePlanRef.current = makeHousePlan(width, height);
      const houses = housePlanRef.current;
      houses.forEach(b => {
        ctx.fillStyle = b.tone === 'A' ? palette.houseA : palette.houseB;
        ctx.fillRect(PX(b.x,width), PX(b.y,height), PX(b.w,width), PX(b.h,height));
      });

      // дороги
      ctx.fillStyle = palette.asphalt;
      // вертикальная
      ctx.fillRect(PX(50 - ROAD_W/2, width), 0, PX(ROAD_W, width), height);
      // горизонтальная
      ctx.fillRect(0, PX(50 - ROAD_W/2, height), width, PX(ROAD_W, height));

     

      // центральная осевая (штрих)
      ctx.strokeStyle = palette.lane;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 14]);
      ctx.beginPath(); ctx.moveTo(PX(50, width), 0); ctx.lineTo(PX(50, width), height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, PX(50, height)); ctx.lineTo(width, PX(50, height)); ctx.stroke();
      ctx.setLineDash([]);

      // разделитель двух полос (тонкая пунктирная внутри каждой дороги)
      ctx.strokeStyle = palette.laneInner;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 10]);
      // внутри вертикальной
      const vMidLeft  = PX(50 - ROAD_W/4, width);
      const vMidRight = PX(50 + ROAD_W/4, width);
      ctx.beginPath(); ctx.moveTo(vMidLeft, 0);  ctx.lineTo(vMidLeft, height);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(vMidRight, 0); ctx.lineTo(vMidRight, height); ctx.stroke();
      // внутри горизонтальной
      const hMidTop    = PX(50 - ROAD_W/4, height);
      const hMidBottom = PX(50 + ROAD_W/4, height);
      ctx.beginPath(); ctx.moveTo(0, hMidTop);    ctx.lineTo(width, hMidTop);    ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hMidBottom); ctx.lineTo(width, hMidBottom); ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawWindows = (ts) => {
      if (!housePlanRef.current) return;
      const houses = housePlanRef.current;
      const night = theme === 'night';
      ctx.shadowColor = night ? palette.glow : 'transparent';
      ctx.shadowBlur  = night ? 8 : 2;

      houses.forEach((b) => {
        const x = PX(b.x, width), y = PX(b.y, height);
        const w = PX(b.w, width), h = PX(b.h, height);
        const padX = WINDOWS.padX, padY = WINDOWS.padY;
        const startX = x + padX, startY = y + padY;

        for (let r=0; r<WINDOWS.rows; r++) {
          for (let c=0; c<WINDOWS.cols; c++) {
            const phase = b.flickerSeed + (r*0.6 + c*0.4);
            const tw = night ? 0.75 + 0.25*Math.max(0, Math.sin(ts*0.001 + phase)) : 0.25;
            const wx = startX + c*(WINDOWS.w + WINDOWS.gapX);
            const wy = startY + r*(WINDOWS.h + WINDOWS.gapY);
            if (wx + WINDOWS.w > x + w - padX || wy + WINDOWS.h > y + h - padY) continue;
            ctx.fillStyle = palette.window.replace(/,0\.\d+\)/, `,${tw.toFixed(2)})`);
            ctx.fillRect(wx, wy, WINDOWS.w, WINDOWS.h);
          }
        }
      });

      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    };

    // обновление позиций машин
    // ⬅️ REPLACE старую версию ВНЕ tick:
const updateLane = (arr, green, dt, dir, crossedRef) => {
  if (!arr.length) return;
  const minGap = 0.035;

  arr.sort((a,b) => b.pos - a.pos);

  let leaderPos = 999;
  for (let i = 0; i < arr.length; i++) {
    const car = arr[i];
    const v = (car.speed + car.jitter);
    car.braking = false;

    const old = car.pos;

    if (green) {
      car.pos += v * dt * 0.001 * 0.60;
      if (old < 1.0 && car.pos >= 1.0) {
        // засчитываем показ (машина прошла «линию билборда»)
        crossedRef.current[dir] = (crossedRef.current[dir] || 0) + 1;
      }
      if (car.pos > 1.1) car.pos = 0.0; 
    } else {
      if (car.pos < STOP_POS) {
        car.pos = Math.min(STOP_POS, car.pos + v * dt * 0.001 * 0.35);
      }
    }

    car.prevPos = old;

    if (i === 0) {
      leaderPos = car.pos;
    } else {
      const ahead = leaderPos;
      if (ahead - car.pos < minGap) {
        car.pos = ahead - minGap;
        car.braking = true;
      }
      leaderPos = car.pos;
    }

    if (!green && Math.abs(car.pos - STOP_POS) < 0.002) {
      car.braking = true;
    }
  }
};

    

    // отрисовка машин по двум полосам
    // === Хелперы для отрисовки машин ===
const roundRect = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y,   x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x,   y+h, rr);
  ctx.arcTo(x,   y+h, x,   y,   rr);
  ctx.arcTo(x,   y,   x+w, y,   rr);
  ctx.closePath();
};

const drawCar = ({ x, y, w, h, color, dir, night, braking, t }) => {
  // тень
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  roundRect(ctx, x+2, y+2, w, h, 3);
  ctx.fill();
  ctx.restore();

  // корпус
  ctx.save();
  roundRect(ctx, x, y, w, h, 3);
  ctx.fillStyle = color;
  ctx.fill();

  // окна
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#111';
  roundRect(ctx, x + w*0.15, y + h*0.15, w*0.7, h*0.3, 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const head = night ? 'rgba(255,255,210,0.85)' : 'rgba(255,255,210,0.45)';
  const tail = braking ? 'rgba(255,80,80,0.95)' : 'rgba(255,80,80,0.55)';
  const blink = (Math.sin(t/900) > 0.4);

  ctx.save();
  ctx.shadowBlur = night ? 10 : 6;

  if (dir === 'N') {
    ctx.shadowColor = head; ctx.fillStyle = head;
    ctx.fillRect(x + 3, y + h - 2, 3, 2);
    ctx.fillRect(x + w - 6, y + h - 2, 3, 2);
    ctx.shadowColor = tail; ctx.fillStyle = tail;
    ctx.fillRect(x + 3, y, 3, 2);
    ctx.fillRect(x + w - 6, y, 3, 2);
    if (blink) {
      ctx.fillStyle = 'rgba(255,180,0,0.9)';
      ctx.fillRect(x - 1, y + h - 2, 2, 2);
      ctx.fillRect(x + w - 1, y + h - 2, 2, 2);
    }
  } else if (dir === 'S') {
    ctx.shadowColor = head; ctx.fillStyle = head;
    ctx.fillRect(x + 3, y, 3, 2);
    ctx.fillRect(x + w - 6, y, 3, 2);
    ctx.shadowColor = tail; ctx.fillStyle = tail;
    ctx.fillRect(x + 3, y + h - 2, 3, 2);
    ctx.fillRect(x + w - 6, y + h - 2, 3, 2);
    if (blink) {
      ctx.fillStyle = 'rgba(255,180,0,0.9)';
      ctx.fillRect(x - 1, y, 2, 2);
      ctx.fillRect(x + w - 1, y, 2, 2);
    }
  } else if (dir === 'E') {
    ctx.shadowColor = head; ctx.fillStyle = head;
    ctx.fillRect(x + w - 2, y + 2, 2, 3);
    ctx.fillRect(x + w - 2, y + h - 5, 2, 3);
    ctx.shadowColor = tail; ctx.fillStyle = tail;
    ctx.fillRect(x, y + 2, 2, 3);
    ctx.fillRect(x, y + h - 5, 2, 3);
    if (blink) {
      ctx.fillStyle = 'rgba(255,180,0,0.9)';
      ctx.fillRect(x + w - 2, y - 1, 2, 2);
      ctx.fillRect(x + w - 2, y + h - 1, 2, 2);
    }
  } else if (dir === 'W') {
    ctx.shadowColor = head; ctx.fillStyle = head;
    ctx.fillRect(x, y + 2, 2, 3);
    ctx.fillRect(x, y + h - 5, 2, 3);
    ctx.shadowColor = tail; ctx.fillStyle = tail;
    ctx.fillRect(x + w - 2, y + 2, 2, 3);
    ctx.fillRect(x + w - 2, y + h - 5, 2, 3);
    if (blink) {
      ctx.fillStyle = 'rgba(255,180,0,0.9)';
      ctx.fillRect(x, y - 1, 2, 2);
      ctx.fillRect(x, y + h - 1, 2, 2);
    }
  }

  ctx.restore();
  ctx.restore();
};

// === НОВАЯ версия drawCars (вне tick!) ===
const drawCars = (tsNow = performance.now()) => {
  const night = theme === 'night';

  const dims = {
    sedan: { w: 18, h: 10 },
    van:   { w: 20, h: 12 },
    bus:   { w: 28, h: 12 },
  };

  const laneShift = (lane, vertical=true) => {
    const half = PX(ROAD_W/4, vertical ? width : height);
    const shift = half * LANE_GAP;
    return (lane === 0) ? -shift : +shift;
  };

  // N (вниз)
  carsRef.current.N.forEach((arr, lane) => {
    const baseX = PX(50 - ROAD_W/4, width);
    const xCenter = baseX + laneShift(lane, true);
    arr.forEach((car) => {
      const { w, h } = dims[car.type] || dims.sedan;
      const y = PX(5 + car.pos * (45 - CENTER_GAP/2), height);
      drawCar({ x: xCenter - w/2, y, w, h, color: car.color, dir: 'N', night, braking: car.braking, t: tsNow });
    });
  });

  // S (вверх)
  carsRef.current.S.forEach((arr, lane) => {
    const baseX = PX(50 + ROAD_W/4, width);
    const xCenter = baseX + laneShift(lane, true);
    arr.forEach((car) => {
      const { w, h } = dims[car.type] || dims.sedan;
      const y = PX(95 - car.pos * (45 - CENTER_GAP/2), height) - h;
      drawCar({ x: xCenter - w/2, y, w, h, color: car.color, dir: 'S', night, braking: car.braking, t: tsNow });
    });
  });

  // E (вправо)
  carsRef.current.E.forEach((arr, lane) => {
    const baseY = PX(50 + ROAD_W/4, height);
    const yCenter = baseY + laneShift(lane, false);
    arr.forEach((car) => {
      const { w, h } = dims[car.type] || dims.sedan;
      const x = PX(5 + car.pos * (45 - CENTER_GAP/2), width);
      drawCar({ x, y: yCenter - h/2, w, h, color: car.color, dir: 'E', night, braking: car.braking, t: tsNow });
    });
  });

  // W (влево)
  carsRef.current.W.forEach((arr, lane) => {
    const baseY = PX(50 - ROAD_W/4, height);
    const yCenter = baseY + laneShift(lane, false);
    arr.forEach((car) => {
      const { w, h } = dims[car.type] || dims.sedan;
      const x = PX(95 - car.pos * (45 - CENTER_GAP/2), width) - w;
      drawCar({ x, y: yCenter - h/2, w, h, color: car.color, dir: 'W', night, braking: car.braking, t: tsNow });
    });
  });
};

   const tick = (ts) => {
  const dt = Math.min(50, ts - (lastTsRef.current || ts));
  lastTsRef.current = ts;

  drawStatic();
  drawWindows(ts);

  // счетчик переходов за линию показы (сбрасываем каждый кадр)
  const crossedRef = { current: { North: 0, East: 0, South: 0, West: 0 } };

  updateLane(carsRef.current.N[0], isGreen.N, dt, "North", crossedRef);
  updateLane(carsRef.current.N[1], isGreen.N, dt, "North", crossedRef);
  updateLane(carsRef.current.E[0], isGreen.E, dt, "East",  crossedRef);
  updateLane(carsRef.current.E[1], isGreen.E, dt, "East",  crossedRef);
  updateLane(carsRef.current.S[0], isGreen.S, dt, "South", crossedRef);
  updateLane(carsRef.current.S[1], isGreen.S, dt, "South", crossedRef);
  updateLane(carsRef.current.W[0], isGreen.W, dt, "West",  crossedRef);
  updateLane(carsRef.current.W[1], isGreen.W, dt, "West",  crossedRef);

  // сообщаем наверх, если были «показы»
  const batch = crossedRef.current;
  if (onImpressions && (batch.North || batch.East || batch.South || batch.West)) {
    onImpressions(batch);
  }

  drawCars(ts);
  animRef.current = requestAnimationFrame(tick);
};

const start = () => {
  if (!running) {
    drawStatic();
    drawWindows(performance.now());
    // хочешь видеть машины в паузе — раскомментируй:
    // drawCars(performance.now());
    return;
  }
  // первый кадр и в цикл
  drawCars(performance.now());
  animRef.current = requestAnimationFrame(tick);
};

start();

return () => {
  if (animRef.current) cancelAnimationFrame(animRef.current);
  window.removeEventListener('resize', onResize);
};
  }, [theme, palette.bg, palette.asphalt, palette.lane, palette.laneInner, palette.houseA, phase, running , palette.houseB, palette.zebra, palette.window, palette.glow, palette.car, isGreen]);
  

  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden mini-map">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* метки сторон */}
      <div className="absolute top-2 left-2 text-[10px] bg-white/70 rounded px-1">Phase: {phase}</div>
      <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] bg-white/70 rounded px-1">North</div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] bg-white/70 rounded px-1">East</div>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] bg-white/70 rounded px-1">South</div>
      <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] bg-white/70 rounded px-1">West</div>
    </div>
  );
}



async function getModelDecision(payload) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 4000); // 4s timeout
  try {
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("Model API failed");
    return await res.json(); // { nextDir, greenMs, reason }
  } finally { clearTimeout(to); }
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

// --- DROP-IN REPLACEMENT: безопасный провайдер трафика ---
function useTrafficProvider({
  mode,                // "mock" | "real"
  bbox,                // {north,south,east,west}  — валидируем
  uiTickMs = 3000,     // как часто «шевелить» UI (интерполяция/шум)
  fetchMs  = 6000,     // как часто реально ходить в API
  timeoutMs = 4000,    // таймаут на один сетевой запрос
  cacheTtlMs = 60000,  // сколько держать кэш свежим (1 мин)
  maxDaily = 2400,     // защитный лимит на день
}) {
  const [score, setScore] = React.useState(50);
  const [loading, setLoading] = React.useState(mode === "real");
  const [error, setError] = React.useState(null);
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const [source, setSource] = React.useState(mode); // "mock" | "real" | "cache"

  const fetchTimerRef = React.useRef(null);
  const uiTimerRef    = React.useRef(null);
  const inFlightRef   = React.useRef(null);
  const backoffRef    = React.useRef(0); // эксп. бэкофф в реальном режиме
  const quotaRef      = React.useRef({ count: 0, resetAt: nextMidnight() });
  const scenariosLocked = mode === "real";

  // ── Гард на SSR/тесты ────────────────────────────────────────────────────────
  const isBrowser = typeof window !== "undefined";

  // ── утилиты ─────────────────────────────────────────────────────────────────
  function nextMidnight() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
  function resetQuotaIfNewDay() {
    const now = Date.now();
    if (now >= quotaRef.current.resetAt) {
      quotaRef.current = { count: 0, resetAt: nextMidnight() };
    }
  }
  function incQuota() {
    resetQuotaIfNewDay();
    quotaRef.current.count += 1;
  }
  function quotaLeft() {
    resetQuotaIfNewDay();
    return Math.max(0, maxDaily - quotaRef.current.count);
  }

  function validBbox(b) {
    if (!b) return false;
    const ok = ["north","south","east","west"].every(k => typeof b[k] === "number");
    if (!ok) return false;
    return b.north > b.south && b.east > b.west;
  }

  const CACHE_KEY = "traffic:last";
  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { score, ts } = JSON.parse(raw);
      if (!Number.isFinite(ts)) return null;
      if (Date.now() - ts > cacheTtlMs) return null;
      if (!Number.isFinite(score)) return null;
      return { score, ts };
    } catch { return null; }
  }
  function writeCache(val) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ score: val, ts: Date.now() })); } catch {}
  }

  function jitter(n, amp = 2) {
    return Math.max(0, Math.min(100, Math.round(n + (Math.random() - 0.5) * amp)));
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ── остановить таймеры/запросы ──────────────────────────────────────────────
  function stopAll() {
    if (fetchTimerRef.current) { clearTimeout(fetchTimerRef.current); fetchTimerRef.current = null; }
    if (uiTimerRef.current) { clearInterval(uiTimerRef.current); uiTimerRef.current = null; }
    if (inFlightRef.current) { inFlightRef.current.abort(); inFlightRef.current = null; }
  }

  // ── основной fetch c таймаутом, офлайном, квотой и бэкоффом ────────────────
  async function fetchRealOnce() {
    if (!isBrowser) return;
    if (!validBbox(bbox)) throw new Error("Invalid bbox");
    if (!navigator.onLine) throw new Error("offline");
    if (quotaLeft() <= 0) throw new Error("quota_exceeded");

    const ctrl = new AbortController();
    inFlightRef.current = ctrl;
    const to = setTimeout(() => ctrl.abort(), timeoutMs);


    try {
      const res = await fetch(`/api/traffic?bbox=${encodeURIComponent(JSON.stringify(bbox))}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const json = await res.json();
      const s = Math.max(0, Math.min(100, Number(json?.score ?? 50)));
incQuota();
backoffRef.current = 0;
writeCache(s);
setScore(s);
setSource("real");
setLastUpdated(Date.now());
setError(null);
// ДОБАВЬ СЮДА:
setLoading(false);

return s;

    } finally {
      clearTimeout(to);
      inFlightRef.current = null;
    }
  }

  // ── планировщик реальных запросов с эксп. бэкоффом ─────────────────────────
  function scheduleRealFetch() {
    const base = fetchMs;
    const step = backoffRef.current;
    // эксп. рост: base * 2^step, с джиттером ±10%
    const delay = Math.round(base * Math.pow(2, step) * (0.9 + Math.random() * 0.2));
    fetchTimerRef.current = setTimeout(async () => {
      try {
        await fetchRealOnce();
      } catch (e) {
        // fallback из кэша, безопасный фейл-опен
        const cached = readCache();
        if (cached) {
          setScore(cached.score);
          setSource("cache");
          setLastUpdated(cached.ts);
          setLoading(false);
        } else {
          setScore(s => jitter(s, 3)); // чтобы UI не «умирал»
          setSource("cache");
        }
        // увеличить бэкофф, но ограничить, чтобы не «замолчать»
        backoffRef.current = Math.min(backoffRef.current + 1, 5);
        setError(String(e?.message || e));
      } finally {
        scheduleRealFetch(); // планируем следующий
      }
    }, delay);
  }

  // ── UI тики: плавная интерполяция/шум, пауза при скрытом табе ──────────────
  function startUiTicker() {
    if (uiTimerRef.current) clearInterval(uiTimerRef.current);
    uiTimerRef.current = setInterval(() => {
      if (document.hidden) return; // пауза в фоновом табе
      setScore(s => {
        if (mode === "real") {
          // легкое сглаживание, чтобы графика «жила»
          const target = readCache()?.score ?? s;
          return Math.round(lerp(s, target, 0.15));
        } else {
          // mock — просто пульс с шумом
          return jitter(s, 1.2);
        }
      });
    }, uiTickMs);
  }

  // ── основной эффект ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!isBrowser) return;

    stopAll();
    setLoading(mode === "real");
    setError(null);
    setSource(mode);
    backoffRef.current = 0;

    // при старте поднимем кэш, чтобы быстро показать что-то осмысленное
    const cached = readCache();
    if (cached) {
      setScore(cached.score);
      setSource("cache");
      setLastUpdated(cached.ts);
    }

    // подписка на смену видимости — чтобы останавливать частые запросы в фоне
    const onVis = () => {
      if (document.hidden) return;
      // При возвращении — мягко синхронизируемся
      if (mode === "real") {
        try { fetchRealOnce(); } catch {}
      }
    };
    document.addEventListener("visibilitychange", onVis);

    // режимы
    if (mode === "mock") {
      setLoading(false);
      startUiTicker();
      // реальных запросов нет
    } else {
      startUiTicker();
      scheduleRealFetch();
    }

    return () => {
      stopAll();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mode, fetchMs, uiTickMs, timeoutMs, cacheTtlMs,
      bbox?.north, bbox?.south, bbox?.east, bbox?.west]);

  return {
    score,          // 0..100
    loading,        // true — когда первый real-фетч ещё не вернул
    error,          // строка или null
    lastUpdated,    // ts
    source,         // "mock" | "real" | "cache"
    quota: {
      used: quotaRef.current.count,
      limit: maxDaily,
      resetAt: quotaRef.current.resetAt,
      left: quotaLeft(),
    },
  };
}

// === ЛОКАЛЬНЫЙ РЕШАТЕЛЬ (без ИИ) ===
function decideNextPhaseLocally({ counts, waits, lastGreenDir }) {
  // веса: очередь важнее, но учитываем и накопленное ожидание
  const wQ = 1.0;     // вес очереди
  const wW = 0.6;     // вес ожидания (борьба с «обделёнными» направлениями)

  const scoreNS = wQ * (counts.N + counts.S) + wW * (waits.N + waits.S);
  const scoreEW = wQ * (counts.E + counts.W) + wW * (waits.E + waits.W);

  // «справедливость»: если ось давно не получала зелёный — слегка бустим её
  const fairnessBoost = 5;
  const last = (lastGreenDir === "A") ? "A" : "B";
  const other = (last === "A") ? "B" : "A";

  let nextDir = scoreNS >= scoreEW ? "A" : "B";
  // если разница невелика — переключаемся на «другую» ось для равенства
  if (Math.abs(scoreNS - scoreEW) < 3) nextDir = other;

  // базовая длительность от «нагруженности» будущей оси
  const loadNext = (nextDir === "A")
    ? (counts.N + counts.S)
    : (counts.E + counts.W);

  // нормируем к 0..100 (у вас score ≈ 0..100, но здесь исходник — количество машин в очереди)
  const approxScore = Math.max(0, Math.min(100, Math.round(loadNext * 4)));
  const greenMsBase = greenDurationFromScore(approxScore);

  // легкая коррекция длительности от ожидания на выбранной оси
  const waitsNext = (nextDir === "A") ? (waits.N + waits.S) : (waits.E + waits.W);
  const bonus = Math.min(6000, waitsNext * 60); // до +6 сек за «страдания»
  const greenMs = clamp(greenMsBase + bonus, MIN_GREEN_MS, MAX_GREEN_MS);

  const reason = `local: NS=${scoreNS.toFixed(1)} EW=${scoreEW.toFixed(1)} last=${last} → ${nextDir} @ ${Math.round(greenMs/1000)}s`;
  return { nextDir, greenMs, reason };
}








import Tutorial, { wasTutorialSeen } from "./components/Tutorial.jsx";
export default function App() {
  const [theme, setTheme] = useState("day");
  const [incidentSide, setIncidentSide] = useState(null); // "N" | "E" | "S" | "W" | null
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  // ====== LOGGING UI STATE ======
const [logCount, setLogCount] = useState(0);
const [logsOpen, setLogsOpen] = useState(false);
const [recentLogs, setRecentLogs] = useState([]);


  const [phase, setPhase] = useState("A"); // "A" | "B" | "PED"
  const pendingVehicularRef = useRef(null); // что включим после PED
  const [phaseEndAt, setPhaseEndAt] = useState(Date.now() + MIN_GREEN_MS);
  const [activeDir, setActiveDir] = useState("A");
  const [waitSec, setWaitSec] = useState([0, 0, 0, 0]); // N,E,S,W в секундах
const prevCountsRef = useRef([0, 0, 0, 0]);
const [lastGreenDir, setLastGreenDir] = useState("A"); // "A" или "B"
  const tick = useTicker(running);
  const [trafficMode, setTrafficMode] = useState("mock"); // "mock" | "real"
// для реального режима можно хранить bbox выбранного района
const scenariosLocked = trafficMode === "real"; // ← добавь это
const [bbox] = useState({ north: 25.3, south: 25.1, east: 55.35, west: 55.23 });
const getCPI = () => (pricing.model === "CPM" ? pricing.value / 1000 : pricing.value);
const getCPM = () => (pricing.model === "CPM" ? pricing.value : pricing.value * 1000);
const [ads, setAds] = useState([
  { id: "ad1", text: "City Wi-Fi • Connected Everywhere", cls: "ad-g-blue",  cpm: 20 },
  { id: "ad2", text: "Eco-Transit • Clean Mobility",      cls: "ad-g-green", cpm: 25 },
  { id: "ad3", text: "Smart Energy • AI-Optimized",       cls: "ad-g-purple",cpm: 30 },
  { id: "ad4", text: "BaQdarsham • Smarter Cities",       cls: "ad-g-cyan",  cpm: 35 },
]);
// === Tutorial state ===
const [tutorialOpen, setTutorialOpen] = useState(false);
useEffect(() => {
  // открываем только при первом заходе
  if (!wasTutorialSeen()) setTutorialOpen(true);
}, []);
const { score: liveScore, loading: trafficLoading, error: trafficErr, source, quota } =
  useTrafficProvider({ mode: trafficMode, bbox, uiTickMs: 3000, fetchMs: 8000 });
  // УДАЛИТЬ из IntersectionMini:




  // при старте — восстановить
useEffect(() => {
  const saved = localStorage.getItem('theme');
  if (saved === 'day' || saved === 'night') setTheme(saved);
}, []);

// Инициализируем счётчик и подписываемся на обновления
useEffect(() => {
  setLogCount(getLogsCount());
  setRecentLogs(getRecentLogs(20));

  const onUpdated = (e) => {
    const total = e?.detail?.total ?? getLogsCount();
    setLogCount(total);
    // обновляем предпросмотр только если панель открыта, чтобы не дёргать лишний раз
    if (logsOpen) setRecentLogs(getRecentLogs(20));
  };
  const onStorage = (e) => {
    if (e.key === LOG_KEY) {
      setLogCount(getLogsCount());
      if (logsOpen) setRecentLogs(getRecentLogs(20));
    }
  };
  window.addEventListener("logs:updated", onUpdated);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("logs:updated", onUpdated);
    window.removeEventListener("storage", onStorage);
  };
}, [logsOpen]);


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

// 4 билборда: North, East, South, West
const [adStats, setAdStats] = useState({
  North: { impressions: 0, cost: 0 },  // cost — сколько потрачено на текущий креатив (опционально)
  East:  { impressions: 0, cost: 0 },
  South: { impressions: 0, cost: 0 },
  West:  { impressions: 0, cost: 0 },
});

// цена за 1000 показов (CPM) или за 1 показ (CPI) — выбери модель.
// Пример: CPM = $4.00
const [pricing, setPricing] = useState({ model: "CPM", value: 20 });



  // mock-score как было
const mockScore = useMemo(
  () => scenario.timeline[clamp(index, 0, scenario.timeline.length - 1)],
  [index, scenario]
);

// ✅ Дефолт и защита для real
const scoreRaw = trafficMode === "mock"
  ? mockScore
  : (liveScore ?? 50); // если liveScore undefined → 50

const score = Number.isFinite(scoreRaw) ? scoreRaw : 50; // если NaN → 50


const msLeft = Math.max(0, phaseEndAt - Date.now());
const secondsLeft = Math.ceil(msLeft / 1000);

// 1) базовое число машин из score
const baseCars = Math.round(score / 5);

// 2) множитель сценария — ТОЛЬКО в mock
const scenarioFactor =
  trafficMode === "real" ? 1.0 :
  (scenario.id === "free"       ? 0.9 :
   scenario.id === "congestion" ? 2.0 :
   /* incident */                 1.6);

// 3) общий объём машин
const totalCars = clamp(Math.round(baseCars * scenarioFactor), 0, 80);

// 4) распределение по направлениям (одинаково и для real, и для mock)
const baseCounts = useMemo(() => distributeCars(totalCars, phase), [totalCars, phase]);

// 5) инцидент-буст — ТОЛЬКО в mock
const counts = useMemo(() => {
  if (trafficMode === "real") return baseCounts;

  if (scenario.id !== "incident" || !incidentSide) return baseCounts;
  const idxMap = { N: 0, E: 1, S: 2, W: 3 };
  const idx = idxMap[incidentSide] ?? null;
  if (idx === null) return baseCounts.slice();

  const boosted = baseCounts.slice();
  boosted[idx] = clamp(boosted[idx] + Math.ceil(totalCars * 0.35), 0, 24);
  const opposite = (idx + 2) % 4;
  boosted[opposite] = clamp(boosted[opposite] - Math.ceil(totalCars * 0.10), 0, 24);
  return boosted;
}, [trafficMode, baseCounts, scenario.id, incidentSide, totalCars]);



  useEffect(() => {
  if (!running) return;

  // Накапливаем ожидание: на зелёном — 0, на красном — растёт. На PED все красные.
  setWaitSec(prev => {
    const green = phase === "A" ? [true,false,true,false]
                : phase === "B" ? [false,true,false,true]
                :                  [false,false,false,false]; // PED
    const next = [...prev];
    for (let i = 0; i < 4; i++) next[i] = green[i] ? 0 : Math.min(prev[i] + TICK_MS/1000, 3600);
    return next;
  });

  if (Date.now() >= phaseEndAt) {
    // обновим «прошлые» counts для корректной аналитики outflow
    prevCountsRef.current = counts;

    if (phase === "A" || phase === "B") {
      // Входим в PED и ПАРАЛЛЕЛЬНО заранее решаем следующий авто-зелёный
      const payload = {
        counts: { N: counts[0], E: counts[1], S: counts[2], W: counts[3] },
        waits:  { N: waitSec[0], E: waitSec[1], S: waitSec[2], W: waitSec[3] },
        scenarioId: scenario.id,
        lastGreenDir,
        // опционально: outflowNS/EW, incidentSide — если используешь
      };


    const local = decideNextPhaseLocally(payload);

    
// 1. Локальное решение
  const localDecision = decideNextPhaseLocally(payload);
  logDecision(payload, localDecision);

  getModelDecision(payload)
  .then(({ nextDir, greenMs }) => {
    const dir = (nextDir === "A" || nextDir === "B") ? nextDir : localDecision.nextDir;
    const dur = clamp(greenMs ?? localDecision.greenMs, MIN_GREEN_MS, MAX_GREEN_MS);
    pendingVehicularRef.current = { dir, dur };
  })
  .catch((err) => {
    console.warn("AI decision failed, fallback to local:", err);
    pendingVehicularRef.current = { dir: localDecision.nextDir, dur: localDecision.greenMs };
  });



  // 4. Входим в фазу PED
  setPhase("PED");
  setPhaseEndAt(Date.now() + PED_MS);


    } else if (phase === "PED") {
      // Закончилась пешеходная пауза — включаем отложенный авто-зелёный
      const pending = pendingVehicularRef.current;
      const dir = pending?.dir ?? (lastGreenDir === "A" ? "B" : "A");
      const dur = pending?.dur ?? greenDurationFromScore(score);

      setPhase(dir);
      setActiveDir(dir);
      setLastGreenDir(dir);
      setPhaseEndAt(Date.now() + dur);
      pendingVehicularRef.current = null;
    }
  }

  setIndex(i => (i + 1) % scenario.timeline.length);
}, [tick, running, phase, phaseEndAt, counts, waitSec, scenario.id, lastGreenDir, score]);


  const dirs = ["North", "East", "South", "West"];
  const isGreenMap = phase === "A"
  ? { North: true, South: true, East: false, West: false }
  : phase === "B"
  ? { North: false, South: false, East: true, West: true }
  : { North: false, South: false, East: false, West: false }; // PED
  


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
  <h1 className="text-2xl font-bold">BaQdarsham – MVP (Simulation)</h1>





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
        onClick={() => { if (!scenariosLocked) setScenario(s); }}
        disabled={scenariosLocked}
        aria-pressed={active}
        className={`relative px-4 py-2 rounded-full font-medium border
          ${active ? "bg-black text-white" : "bg-white text-gray-800"}
          ${scenariosLocked
            ? "opacity-50 cursor-not-allowed pointer-events-none"
            : "hover:shadow-md active:scale-95"}
        `}
      >
        <span className="pointer-events-none">{s.name}</span>
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

<div className="flex items-center gap-2">
  <button
    onClick={() => setTrafficMode("mock")}
    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${trafficMode==="mock" ? "bg-black text-white" : "bg-white text-gray-700"}`}
  >
    Mock traffic
  </button>
  <button
    onClick={() => setTrafficMode("real")}
    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${trafficMode==="real" ? "bg-black text-white" : "bg-white text-gray-700"}`}
  >
    Real traffic
  </button>
  {trafficMode==="real" && <span className="text-xs text-gray-500">{trafficLoading ? "loading…" : "live ✓"}</span>}
</div>

<button
  onClick={() => setTutorialOpen(true)}
  className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white"
  title="Показать краткий гайд"
>
  Помощь
</button>






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
    const secForDir = secondsLeft;

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

            <div className="flex items-center gap-6 mt-3">
  {/* A: North/South */}
  <div className="flex flex-col items-center gap-1">
    <div className={`w-10 h-10 rounded-full border-2 border-black ${phase==="A" ? "bg-green-500 shadow-[0_0_10px_3px_rgba(34,197,94,0.7)]" : "bg-gray-700"}`} />
    <span className="text-xs text-gray-600">North/South</span>
  </div>

  {/* B: East/West */}
  <div className="flex flex-col items-center gap-1">
    <div className={`w-10 h-10 rounded-full border-2 border-black ${phase==="B" ? "bg-green-500 shadow-[0_0_10px_3px_rgba(34,197,94,0.7)]" : "bg-gray-700"}`} />
    <span className="text-xs text-gray-600">East/West</span>
  </div>

  {/* PED: пешеходная пауза */}
  <div className="flex flex-col items-center gap-1">
    <div className={`w-10 h-10 rounded-full border-2 border-black ${phase==="PED" ? "bg-yellow-400 shadow-[0_0_10px_3px_rgba(250,204,21,0.7)]" : "bg-gray-700"}`} />
    <span className="text-xs text-gray-600">Pedestrians</span>
  </div>
</div>



            <p className="text-sm mt-2">Time left this phase: <strong>{secondsLeft}s</strong></p>
            <p className="text-xs text-gray-500">Target green (if next start): {greenDurationFromScore(score) / 1000}s</p>
            <div className="mt-4">
              <IntersectionMini
  counts={counts}
  phase={phase}
  theme={theme}
  running={running}
  onImpressions={(batch) => {
 // batch: { North?: number, East?: number, South?: number, West?: number }
if (!batch) return;
setAdStats((prev) => {
  const next = { ...prev };
  ["North", "East", "South", "West"].forEach((dir) => {
    const add = (batch && batch[dir]) != null ? batch[dir] : 0;
    if (add > 0) {
      next[dir] = {
        impressions: next[dir].impressions + add,
        cost: next[dir].cost + add * getCPI(),
      };
    }
  });
  return next;
});
  }}
/>

            </div>
          </div>

          <div className="card p-4 text-sm">
            <div className="font-semibold mb-1">Live Metrics</div>
            <ul className="space-y-1 text-gray-700">
              <li>Sim FPS: ~{Math.round(1000 / TICK_MS)} fps</li>
              <li>Scenario length: {Math.round(scenario.timeline.length * TICK_MS / 1000)} s</li>
              <li>Green bounds: {Math.round(MIN_GREEN_MS/1000)}–{Math.round(MAX_GREEN_MS/1000)} s</li>
              <li>Total cars (sim): {totalCars} (N:{counts[0]}, E:{counts[1]}, S:{counts[2]}, W:{counts[3]})</li>
<li className="mt-2 font-semibold">Ad Impressions:</li>
<li>North: {adStats.North.impressions} (≈ ${adStats.North.cost.toFixed(2)})</li>
<li>East:  {adStats.East.impressions}  (≈ ${adStats.East.cost.toFixed(2)})</li>
<li>South: {adStats.South.impressions} (≈ ${adStats.South.cost.toFixed(2)})</li>
<li>West:  {adStats.West.impressions}  (≈ ${adStats.West.cost.toFixed(2)})</li>
<li className="text-xs text-gray-500">
  Pricing: {pricing.model} = ${pricing.value} → CPM ${getCPM().toFixed(2)}, CPI ${getCPI().toFixed(4)}
</li>
<li className="mt-2 font-semibold">Data Logging</li>
<li>Situations logged: <strong>{logCount}</strong></li>
<li className="flex gap-2 mt-1">
  <button
    onClick={() => { setLogsOpen(true); setRecentLogs(getRecentLogs(20)); }}
    className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white hover:bg-gray-50"
  >
    View last 20
  </button>
  <button
    onClick={() => exportLogsToFile()}
    className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white hover:bg-gray-50"
  >
    Export JSON
  </button>
  <button
    onClick={() => { if (confirm('Очистить все сохранённые логи?')) { clearLogs(); setRecentLogs([]); } }}
    className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white hover:bg-gray-50 text-rose-600"
  >
    Clear
  </button>

  <button
    onClick={() => {
      const payload = {
        counts: { N: 5, E: 3, S: 4, W: 2 },
        waits:  { N: 10, E: 20, S: 5, W: 15 },
        scenarioId: 'test',
        lastGreenDir: 'A',
      };
      const decision = { nextDir: 'B', greenMs: 9000, reason: 'manual test' };
      logDecision(payload, decision);
      alert('Test log saved');
    }}
    className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white hover:bg-gray-50"
    title="Создать тестовую запись в лог"
  >
    Test Log
  </button>
</li>

        
            </ul>
          </div>
        </div>
      </div>
      {/* Logs Modal */}
{logsOpen && (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
    <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold">Recent logs (last 20 of {logCount})</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRecentLogs(getRecentLogs(20)); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={() => setLogsOpen(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto text-sm">
        <table className="w-full">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="text-left">
              <th className="px-3 py-2 w-40">Time</th>
              <th className="px-3 py-2">Counts N/E/S/W</th>
              <th className="px-3 py-2">Waits N/E/S/W</th>
              <th className="px-3 py-2">Decision</th>
              <th className="px-3 py-2">Green (s)</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((row, i) => {
              const ts = new Date(row.ts).toLocaleString();
              const c = row.payload?.counts || {};
              const w = row.payload?.waits || {};
              const d = row.decision || {};
              return (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{ts}</td>
                  <td className="px-3 py-2">N:{c.N ?? "-"} / E:{c.E ?? "-"} / S:{c.S ?? "-"} / W:{c.W ?? "-"}</td>
                  <td className="px-3 py-2">N:{w.N ?? "-"} / E:{w.E ?? "-"} / S:{w.S ?? "-"} / W:{w.W ?? "-"}</td>
                  <td className="px-3 py-2">{d.nextDir ?? "-"}</td>
                  <td className="px-3 py-2">{Math.round((d.greenMs ?? 0) / 1000)}</td>
                </tr>
              );
            })}
            {recentLogs.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Нет записей</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t text-xs text-gray-500">
        Хранятся только локально (localStorage). Export сохраняет весь массив в JSON.
      </div>
    </div>
  </div>
)}


      {/* Tutorial modal */}
<Tutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
    
  );
}