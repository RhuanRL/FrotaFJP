"use client";

import { VehicleType } from "@/lib/types";

interface VehicleTabsProps {
  activeTab: VehicleType | "all";
  onTabChange: (tab: VehicleType | "all") => void;
  furgaoCount: number;
  caminhaoCount: number;
}

export default function VehicleTabs({
  activeTab,
  onTabChange,
  furgaoCount,
  caminhaoCount,
}: VehicleTabsProps) {
  const tabs = [
    { key: "all" as const, label: "Todas", count: furgaoCount + caminhaoCount, icon: "📋" },
    { key: "furgao" as const, label: "Furgão (local)", count: furgaoCount, icon: "🚐", color: "text-blue-600 dark:text-blue-400" },
    { key: "caminhao" as const, label: "Caminhão (distante)", count: caminhaoCount, icon: "🚛", color: "text-orange-600 dark:text-orange-400" },
  ];

  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-[#0d1829] rounded-lg p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === tab.key
              ? "bg-white dark:bg-[#1a2d4a] text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
          <span
            className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${
              activeTab === tab.key
                ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                : "bg-gray-200 dark:bg-[#1e3050] text-gray-600 dark:text-gray-400"
            }`}
          >
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
}
