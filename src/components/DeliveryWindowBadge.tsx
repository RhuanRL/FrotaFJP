"use client";

import { DeliveryWindow } from "@/lib/types";

interface DeliveryWindowBadgeProps {
  windows: DeliveryWindow[];
  currentTime?: string;
}

export default function DeliveryWindowBadge({
  windows,
  currentTime,
}: DeliveryWindowBadgeProps) {
  const now = currentTime || new Date().toTimeString().slice(0, 5);

  function getActiveWindow(): DeliveryWindow | null {
    const sorted = [...windows].sort((a, b) =>
      a.cutoffTime.localeCompare(b.cutoffTime)
    );
    for (const w of sorted) {
      if (now < w.cutoffTime) return w;
    }
    const nextDay = sorted.find((w) => w.isNextDay);
    return nextDay || null;
  }

  const active = getActiveWindow();

  return (
    <div className="flex flex-wrap gap-2">
      {windows.map((w) => {
        const isActive = active?.id === w.id;
        return (
          <div
            key={w.id}
            className={`px-3 py-2 rounded-lg border text-sm transition-colors duration-300 ${
              isActive
                ? "bg-violet-100 dark:bg-violet-900/30 border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-300 font-semibold"
                : "bg-gray-50 dark:bg-[#0d1829] border-gray-200 dark:border-[#1e3050] text-gray-500 dark:text-gray-400"
            }`}
          >
            <div className="font-medium">{w.name}</div>
            <div className="text-xs mt-0.5">
              Pedidos até <strong>{w.cutoffTime}</strong>
              {" → "}
              Saída às <strong>{w.departureTime}</strong>
              {w.isNextDay && " (dia seguinte)"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
