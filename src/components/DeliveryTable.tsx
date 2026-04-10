"use client";

import { Delivery } from "@/lib/types";

interface DeliveryTableProps {
  deliveries: Delivery[];
  routeOrder?: string[];
  onRemove: (id: string) => void;
}

function getOrderCount(delivery: Delivery): number {
  const match = delivery.clientName.match(/\((\d+)\s*pedidos?\)/i);
  return match ? parseInt(match[1]) : 1;
}

export default function DeliveryTable({
  deliveries,
  routeOrder,
  onRemove,
}: DeliveryTableProps) {
  // Build sequential stop map: delivery ID → stop number (1-based)
  const stopSequence = routeOrder
    ? routeOrder.filter((id) => id !== "origin")
    : [];
  const stopNumberMap = new Map<string, number>();
  stopSequence.forEach((id, idx) => {
    stopNumberMap.set(id, idx + 1);
  });

  // Sort by stop number if route exists
  const sorted = routeOrder
    ? [...deliveries].sort((a, b) => {
        const numA = stopNumberMap.get(a.id) ?? 999;
        const numB = stopNumberMap.get(b.id) ?? 999;
        return numA - numB;
      })
    : deliveries;

  if (deliveries.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-[#0d1829] rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
        Nenhuma entrega adicionada. Importe NFs acima para começar.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#1e3050]">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-[#0d1829]">
          <tr>
            {routeOrder && (
              <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
                Parada
              </th>
            )}
            <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
              NF
            </th>
            <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
              Cliente
            </th>
            <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
              CEP
            </th>
            <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
              Cidade
            </th>
            <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
              Dist.
            </th>
            <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
              Pedidos
            </th>
            <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
              Veículo
            </th>
            <th className="px-3 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">
              Valor
            </th>
            <th className="px-3 py-3 text-center font-semibold text-gray-600 dark:text-gray-300">
              Ação
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-[#1e3050]">
          {sorted.map((delivery) => {
            const stopNumber = stopNumberMap.get(delivery.id);
            const orderCount = getOrderCount(delivery);

            return (
              <tr key={delivery.id} className="hover:bg-gray-50 dark:hover:bg-[#1a2d4a]/50 transition-colors">
                {routeOrder && (
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold text-sm">
                      {stopNumber ?? "-"}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 font-mono text-gray-800 dark:text-gray-200 text-xs">
                  {delivery.nfNumber}
                </td>
                <td className="px-3 py-2 text-gray-800 dark:text-gray-200 max-w-[180px]">
                  <div className="truncate">{delivery.clientName.replace(/\s*\(\d+\s*pedidos?\)/i, "")}</div>
                </td>
                <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 text-xs">
                  {delivery.cep}
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">{delivery.city}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">
                  {delivery.distanceFromOrigin ? `${delivery.distanceFromOrigin} km` : "-"}
                </td>
                <td className="px-3 py-2">
                  {orderCount > 1 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">
                      {orderCount} pedidos
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 text-xs">1</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {delivery.vehicleType === "furgao" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium">
                      🚐
                    </span>
                  ) : delivery.vehicleType === "caminhao" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium">
                      🚛
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">
                  {delivery.value
                    ? `R$ ${delivery.value.toFixed(2)}`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => onRemove(delivery.id)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded p-1 transition-colors"
                    title="Remover"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
