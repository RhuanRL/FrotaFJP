"use client";

interface RouteStatsProps {
  totalDistanceKm: number;
  totalTimeMinutes: number;
  fuelLiters: number;
  fuelCost: number;
  deliveryCount: number;
}

export default function RouteStats({
  totalDistanceKm,
  totalTimeMinutes,
  fuelLiters,
  fuelCost,
  deliveryCount,
}: RouteStatsProps) {
  const hours = Math.floor(totalTimeMinutes / 60);
  const minutes = totalTimeMinutes % 60;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="bg-white dark:bg-[#111c32] rounded-xl border border-gray-200 dark:border-[#1e3050] p-4 text-center transition-colors duration-300">
        <div className="text-2xl font-bold text-violet-700 dark:text-violet-400">{deliveryCount}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Entregas</div>
      </div>
      <div className="bg-white dark:bg-[#111c32] rounded-xl border border-gray-200 dark:border-[#1e3050] p-4 text-center transition-colors duration-300">
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {totalDistanceKm.toFixed(1)} km
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Distância Total</div>
      </div>
      <div className="bg-white dark:bg-[#111c32] rounded-xl border border-gray-200 dark:border-[#1e3050] p-4 text-center transition-colors duration-300">
        <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
          {hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tempo Estimado</div>
      </div>
      <div className="bg-white dark:bg-[#111c32] rounded-xl border border-gray-200 dark:border-[#1e3050] p-4 text-center transition-colors duration-300">
        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
          {fuelLiters.toFixed(1)} L
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Combustível</div>
      </div>
      <div className="bg-white dark:bg-[#111c32] rounded-xl border border-gray-200 dark:border-[#1e3050] p-4 text-center col-span-2 md:col-span-1 transition-colors duration-300">
        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
          R$ {fuelCost.toFixed(2)}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Custo Estimado</div>
      </div>
    </div>
  );
}
