"use client";

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { AppConfig, DeliveryWindow, DEFAULT_CONFIG } from "@/lib/types";
import { getConfig, saveConfig } from "@/lib/config-store";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-[#2a3f5f] bg-white dark:bg-[#111c32] text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-600 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors";

export default function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    setConfig(getConfig());
  }, []);

  if (!config) return null;

  function handleSave() {
    if (!config) return;
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleReset() {
    setConfig(DEFAULT_CONFIG);
    saveConfig(DEFAULT_CONFIG);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleGeocodeOrigin() {
    if (!config?.originAddress) return;
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({
            q: config.originAddress + ", Brasil",
            format: "json",
            limit: "1",
          }),
        { headers: { "User-Agent": "FrotaFJP/1.0" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        setConfig({
          ...config,
          originLat: parseFloat(data[0].lat),
          originLng: parseFloat(data[0].lon),
        });
      }
    } catch {
      // ignore
    } finally {
      setGeocoding(false);
    }
  }

  function addWindow() {
    if (!config) return;
    setConfig({
      ...config,
      deliveryWindows: [
        ...config.deliveryWindows,
        {
          id: uuidv4(),
          name: "Nova Janela",
          cutoffTime: "12:00",
          departureTime: "13:00",
          isNextDay: false,
        },
      ],
    });
  }

  function updateWindow(id: string, updates: Partial<DeliveryWindow>) {
    if (!config) return;
    setConfig({
      ...config,
      deliveryWindows: config.deliveryWindows.map((w) =>
        w.id === id ? { ...w, ...updates } : w
      ),
    });
  }

  function removeWindow(id: string) {
    if (!config) return;
    setConfig({
      ...config,
      deliveryWindows: config.deliveryWindows.filter((w) => w.id !== id),
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configurações</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure o ponto de partida, custos e janelas de entrega
        </p>
      </div>

      <div className="bg-white dark:bg-[#111c32] rounded-xl p-5 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] space-y-4 transition-colors duration-300">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Ponto de Partida (Fábrica)
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Endereço
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.originAddress}
                onChange={(e) =>
                  setConfig({ ...config, originAddress: e.target.value })
                }
                placeholder="Ex: Rua X, 123, Goiânia, GO"
                className={`flex-1 ${inputClass}`}
              />
              <button
                onClick={handleGeocodeOrigin}
                disabled={geocoding}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {geocoding ? "Buscando..." : "Buscar Coordenadas"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="any"
                value={config.originLat}
                onChange={(e) =>
                  setConfig({ ...config, originLat: parseFloat(e.target.value) || 0 })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="any"
                value={config.originLng}
                onChange={(e) =>
                  setConfig({ ...config, originLng: parseFloat(e.target.value) || 0 })
                }
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#111c32] rounded-xl p-5 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] space-y-4 transition-colors duration-300">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Veículos e Combustível
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Preço do litro (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={config.fuelPricePerLiter}
              onChange={(e) =>
                setConfig({
                  ...config,
                  fuelPricePerLiter: parseFloat(e.target.value) || 0,
                })
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Raio entregas locais (km)
            </label>
            <input
              type="number"
              step="1"
              value={config.localRadiusKm ?? 50}
              onChange={(e) =>
                setConfig({
                  ...config,
                  localRadiusKm: parseFloat(e.target.value) || 50,
                })
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              🚐 Consumo Furgão (km/l)
            </label>
            <input
              type="number"
              step="0.1"
              value={config.vehicleConsumption}
              onChange={(e) =>
                setConfig({
                  ...config,
                  vehicleConsumption: parseFloat(e.target.value) || 1,
                })
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              🚛 Consumo Caminhão (km/l)
            </label>
            <input
              type="number"
              step="0.1"
              value={config.truckConsumption ?? 5}
              onChange={(e) =>
                setConfig({
                  ...config,
                  truckConsumption: parseFloat(e.target.value) || 1,
                })
              }
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#111c32] rounded-xl p-5 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] space-y-4 transition-colors duration-300">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Janelas de Entrega
          </h2>
          <button
            onClick={addWindow}
            className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 font-medium"
          >
            + Adicionar janela
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Defina os horários de corte (pedidos até X horas) e de saída (veículo
          sai às Y horas)
        </p>
        <div className="space-y-3">
          {config.deliveryWindows.map((w) => (
            <div
              key={w.id}
              className="bg-gray-50 dark:bg-[#0d1829] rounded-lg p-4 border border-gray-200 dark:border-[#1e3050] space-y-3 transition-colors"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={w.name}
                    onChange={(e) =>
                      updateWindow(w.id, { name: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Corte (pedidos até)
                  </label>
                  <input
                    type="time"
                    value={w.cutoffTime}
                    onChange={(e) =>
                      updateWindow(w.id, { cutoffTime: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Saída às
                  </label>
                  <input
                    type="time"
                    value={w.departureTime}
                    onChange={(e) =>
                      updateWindow(w.id, { departureTime: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={w.isNextDay}
                      onChange={(e) =>
                        updateWindow(w.id, { isNextDay: e.target.checked })
                      }
                      className="rounded border-gray-300 dark:border-[#2a3f5f] text-violet-600 focus:ring-violet-300"
                    />
                    Dia seguinte
                  </label>
                  <button
                    onClick={() => removeWindow(w.id)}
                    className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm pb-2 ml-auto"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          Salvar Configurações
        </button>
        <button
          onClick={handleReset}
          className="px-6 py-2.5 bg-gray-200 dark:bg-[#1a2d4a] text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-[#243a5c] transition-colors"
        >
          Restaurar Padrão
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
            Configurações salvas!
          </span>
        )}
      </div>
    </div>
  );
}
