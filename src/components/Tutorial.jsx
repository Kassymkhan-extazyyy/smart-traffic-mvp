import React, { useEffect, useState } from "react";

const LS_KEY = "sb_tutorial_seen_v2";

export default function Tutorial({ open, onClose }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  const steps = [
    {
      title: "Добро пожаловать в BaQdarsham",
      desc: "Это симулятор перекрёстка с умными билбордами и ИИ решениями для предотвращения пробок. Здесь вы видите очереди машин и статус фаз светофора.",
    },
    {
      title: "Сценарии трафика",
      desc: "Сверху можно переключать сценарии: Free Flow, Congestion, Incident. Для Incident можно выбрать сторону с инцидентом (🚧 N/E/S/W).",
    },
    {
      title: "Управление симуляцией",
      desc: "Кнопки Play/Pause и Reset управляют ходом. Слева — билборды и очереди, справа — контроллер фаз и мини-карта.",
    },
    {
      title: "Mock / Real traffic",
      desc: "В режиме Real трафик берётся с вашего API (`/api/traffic`). Если сервер не запущен — переключитесь на Mock.",
    },
    {
      title: "Live metrics & Ad impressions",
      desc: "Тут вы можете видеть сколько машин проехало а также примерную рекламную прибыльность с каждого биллборда.",
    },
  ];

  if (!open) return null;

  const closeAndRemember = (remember) => {
    if (remember) localStorage.setItem(LS_KEY, "1");
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[min(96vw,560px)] rounded-2xl bg-white shadow-2xl p-5">
        <div className="mb-3">
          <h3 className="text-xl font-bold">{steps[step].title}</h3>
          <p className="text-sm text-gray-600 mt-1">{steps[step].desc}</p>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-8 rounded-full ${
                  i <= step ? "bg-black" : "bg-gray-300"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="px-3 py-1.5 rounded-lg border"
              >
                Назад
              </button>
            )}
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                className="px-4 py-1.5 rounded-lg bg-black text-white"
              >
                Далее
              </button>
            ) : (
              <>
                <button
                  onClick={() => closeAndRemember(false)}
                  className="px-3 py-1.5 rounded-lg border"
                >
                  Понял
                </button>
                <button
                  onClick={() => closeAndRemember(true)}
                  className="px-3 py-1.5 rounded-lg bg-black text-white"
                  title="Больше не показывать"
                >
                  Не показывать снова
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// утилита, пригодится снаружи
export function wasTutorialSeen() {
  try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
}
