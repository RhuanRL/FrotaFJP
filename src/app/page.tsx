"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { v4 as uuidv4 } from "uuid";
import FileUpload, { ProcessedNF } from "@/components/FileUpload";
import DeliveryTable from "@/components/DeliveryTable";
import RouteStats from "@/components/RouteStats";
import DeliveryWindowBadge from "@/components/DeliveryWindowBadge";
import ManualDeliveryForm from "@/components/ManualDeliveryForm";
import VehicleTabs from "@/components/VehicleTabs";
import ShareRoute from "@/components/ShareRoute";
import { Delivery, AppConfig, VehicleType, haversineKm } from "@/lib/types";
import { getConfig } from "@/lib/config-store";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] bg-gray-200 dark:bg-[#131f35] rounded-lg animate-pulse flex items-center justify-center text-gray-400 dark:text-gray-500">
      Carregando mapa...
    </div>
  ),
});

interface RouteResult {
  order: string[];
  legs: { deliveryId: string; order: number; distanceKm: number; timeMinutes: number }[];
  totalDistanceKm: number;
  totalTimeMinutes: number;
  fuelLiters: number;
  fuelCost: number;
  geometry: [number, number][];
  approximate?: boolean;
}

export default function Home() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [routeFurgao, setRouteFurgao] = useState<RouteResult | null>(null);
  const [routeCaminhao, setRouteCaminhao] = useState<RouteResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<VehicleType | "all">("all");

  useEffect(() => {
    setConfig(getConfig());
  }, []);

  const origin = useMemo(
    () => ({
      lat: config?.originLat ?? -16.7364989,
      lng: config?.originLng ?? -49.2627635,
      label: config?.originAddress ?? "Aparecida de Goiânia, GO",
    }),
    [config]
  );

  // Classify deliveries by vehicle type based on distance from origin
  const classifyDelivery = useCallback(
    (delivery: Delivery): Delivery => {
      if (!delivery.lat || !delivery.lng || !config) return delivery;
      const dist = haversineKm(origin.lat, origin.lng, delivery.lat, delivery.lng);
      const vehicleType: VehicleType = dist <= (config.localRadiusKm ?? 50) ? "furgao" : "caminhao";
      return { ...delivery, distanceFromOrigin: Math.round(dist * 10) / 10, vehicleType };
    },
    [origin, config]
  );

  // Split deliveries by type (unclassified defaults to furgão)
  const furgaoDeliveries = useMemo(
    () => deliveries.filter((d) => d.vehicleType !== "caminhao"),
    [deliveries]
  );
  const caminhaoDeliveries = useMemo(
    () => deliveries.filter((d) => d.vehicleType === "caminhao"),
    [deliveries]
  );

  // Active deliveries based on tab
  const activeDeliveries = useMemo(() => {
    if (activeTab === "furgao") return furgaoDeliveries;
    if (activeTab === "caminhao") return caminhaoDeliveries;
    return deliveries;
  }, [activeTab, deliveries, furgaoDeliveries, caminhaoDeliveries]);

  const activeRoute = useMemo(() => {
    if (activeTab === "furgao") return routeFurgao;
    if (activeTab === "caminhao") return routeCaminhao;
    return null;
  }, [activeTab, routeFurgao, routeCaminhao]);

  const geocodeDeliveries = useCallback(
    async (newDeliveries: Delivery[]): Promise<Delivery[]> => {
      const cepsToGeocode = [...new Set(
        newDeliveries.filter((d) => !d.lat || !d.lng).map((d) => d.cep)
      )];

      if (cepsToGeocode.length === 0) return newDeliveries;

      setIsGeocoding(true);
      try {
        const geoMap = new Map<string, { lat: number; lng: number; address: string; city: string; state: string }>();

        // Process 3 CEPs at a time in parallel, each as its own request
        const PARALLEL = 3;
        for (let i = 0; i < cepsToGeocode.length; i += PARALLEL) {
          const batch = cepsToGeocode.slice(i, i + PARALLEL);
          const promises = batch.map(async (cep) => {
            try {
              const res = await fetch("/api/geocode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ceps: [cep] }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.results?.[0]) {
                  const r = data.results[0];
                  geoMap.set(r.cep.replace(/\D/g, ""), r);
                }
              }
            } catch {
              // Skip this CEP
            }
          });
          await Promise.all(promises);
        }

        return newDeliveries.map((d) => {
          const cleanCep = d.cep.replace(/\D/g, "");
          const geo = geoMap.get(cleanCep);
          if (geo) {
            return {
              ...d,
              lat: geo.lat,
              lng: geo.lng,
              address: d.address || geo.address,
              city: d.city || geo.city,
              state: d.state || geo.state,
            };
          }
          return d;
        });
      } catch {
        return newDeliveries;
      } finally {
        setIsGeocoding(false);
      }
    },
    []
  );

  const handleFilesProcessed = useCallback(
    async (results: ProcessedNF[], fileErrors: string[]) => {
      setErrors(fileErrors);

      if (results.length === 0) return;

      let newDeliveries: Delivery[] = results.map((r) => ({
        id: uuidv4(),
        nfNumber: r.nfNumber,
        clientName: r.clientName,
        address: r.address,
        cep: r.cep,
        city: r.city,
        state: r.state,
        lat: 0,
        lng: 0,
        value: r.value,
        createdAt: new Date().toISOString(),
      }));

      newDeliveries = await geocodeDeliveries(newDeliveries);

      // Classify each delivery by distance
      newDeliveries = newDeliveries.map(classifyDelivery);

      setDeliveries((prev) => [...prev, ...newDeliveries]);
      setRouteFurgao(null);
      setRouteCaminhao(null);
    },
    [geocodeDeliveries, classifyDelivery]
  );

  const handleManualAdd = useCallback(
    async (data: { nfNumber: string; clientName: string; cep: string; address: string }) => {
      let newDelivery: Delivery = {
        id: uuidv4(),
        nfNumber: data.nfNumber,
        clientName: data.clientName,
        address: data.address,
        cep: data.cep,
        city: "",
        state: "GO",
        lat: 0,
        lng: 0,
        createdAt: new Date().toISOString(),
      };

      const geocoded = await geocodeDeliveries([newDelivery]);
      newDelivery = classifyDelivery(geocoded[0]);

      setDeliveries((prev) => [...prev, newDelivery]);
      setRouteFurgao(null);
      setRouteCaminhao(null);
    },
    [geocodeDeliveries, classifyDelivery]
  );

  const handleRemove = useCallback((id: string) => {
    setDeliveries((prev) => prev.filter((d) => d.id !== id));
    setRouteFurgao(null);
    setRouteCaminhao(null);
  }, []);

  const optimizeGroup = useCallback(
    async (group: Delivery[], consumption: number): Promise<RouteResult | null> => {
      const valid = group.filter((d) => d.lat && d.lng);
      if (valid.length === 0) return null;

      const res = await fetch("/api/optimize-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: origin.lat, lng: origin.lng },
          deliveries: valid.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng })),
          fuelPrice: config?.fuelPricePerLiter ?? 6.0,
          consumption,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    [origin, config]
  );

  const handleOptimize = useCallback(async () => {
    setIsOptimizing(true);
    setErrors([]);

    const newErrors: string[] = [];

    try {
      // Optimize furgão route (local)
      if (furgaoDeliveries.filter((d) => d.lat && d.lng).length > 0) {
        try {
          const result = await optimizeGroup(
            furgaoDeliveries,
            config?.vehicleConsumption ?? 10
          );
          setRouteFurgao(result);
        } catch (err) {
          newErrors.push(`Furgão: ${(err as Error).message}`);
        }
      }

      // Optimize caminhão route (long distance)
      if (caminhaoDeliveries.filter((d) => d.lat && d.lng).length > 0) {
        try {
          const result = await optimizeGroup(
            caminhaoDeliveries,
            config?.truckConsumption ?? 5
          );
          setRouteCaminhao(result);
        } catch (err) {
          newErrors.push(`Caminhão: ${(err as Error).message}`);
        }
      }

      if (newErrors.length > 0) {
        setErrors(newErrors);
      }

      // Switch to the tab that has results
      if (furgaoDeliveries.length > 0 && caminhaoDeliveries.length > 0) {
        setActiveTab("furgao");
      } else if (furgaoDeliveries.length > 0) {
        setActiveTab("furgao");
      } else {
        setActiveTab("caminhao");
      }
    } catch (err) {
      setErrors([`Erro ao otimizar: ${(err as Error).message}`]);
    } finally {
      setIsOptimizing(false);
    }
  }, [furgaoDeliveries, caminhaoDeliveries, optimizeGroup, config]);

  const handleClearAll = useCallback(() => {
    setDeliveries([]);
    setRouteFurgao(null);
    setRouteCaminhao(null);
    setErrors([]);
    setActiveTab("all");
  }, []);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  const totalValidDeliveries = deliveries.filter((d) => d.lat && d.lng).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Roteirização de Entregas
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Importe NFs, visualize no mapa e otimize a rota
          </p>
        </div>
        <DeliveryWindowBadge windows={config.deliveryWindows} />
      </div>

      <div className="bg-white dark:bg-[#111c32] rounded-xl p-5 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] space-y-4 transition-colors duration-300">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Importar Notas Fiscais
        </h2>
        <FileUpload
          onFilesProcessed={handleFilesProcessed}
          isLoading={isUploading}
          setIsLoading={setIsUploading}
        />
        <ManualDeliveryForm onAdd={handleManualAdd} />
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">Avisos:</h3>
          <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
            {errors.map((err, i) => (
              <li key={i}>- {err}</li>
            ))}
          </ul>
        </div>
      )}

      {isGeocoding && (
        <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-lg p-3">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-500 border-t-transparent" />
          Geocodificando CEPs... (pode levar alguns segundos)
        </div>
      )}

      {/* Vehicle tabs */}
      {deliveries.length > 0 && (
        <VehicleTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          furgaoCount={furgaoDeliveries.length}
          caminhaoCount={caminhaoDeliveries.length}
        />
      )}

      {/* Route Stats */}
      {activeRoute && (
        <>
          <RouteStats
            totalDistanceKm={activeRoute.totalDistanceKm}
            totalTimeMinutes={activeRoute.totalTimeMinutes}
            fuelLiters={activeRoute.fuelLiters}
            fuelCost={activeRoute.fuelCost}
            deliveryCount={
              activeTab === "furgao"
                ? furgaoDeliveries.filter((d) => d.lat && d.lng).length
                : activeTab === "caminhao"
                ? caminhaoDeliveries.filter((d) => d.lat && d.lng).length
                : totalValidDeliveries
            }
          />
          {activeRoute.approximate && (
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3">
              Valores aproximados (linha reta x1.3). A rota real pode variar.
            </div>
          )}
        </>
      )}

      {/* Combined stats when both routes exist and viewing "all" */}
      {activeTab === "all" && routeFurgao && routeCaminhao && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl p-4 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🚐</span>
              <span className="font-semibold text-blue-800 dark:text-blue-300">Furgão (local)</span>
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
              <p>{furgaoDeliveries.length} entregas - {routeFurgao.totalDistanceKm} km - R$ {routeFurgao.fuelCost.toFixed(2)}</p>
            </div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 rounded-xl p-4 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🚛</span>
              <span className="font-semibold text-orange-800 dark:text-orange-300">Caminhão (distante)</span>
            </div>
            <div className="text-sm text-orange-700 dark:text-orange-400 space-y-1">
              <p>{caminhaoDeliveries.length} entregas - {routeCaminhao.totalDistanceKm} km - R$ {routeCaminhao.fuelCost.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="bg-white dark:bg-[#111c32] rounded-xl shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] overflow-hidden transition-colors duration-300">
        <div className="p-4 border-b border-gray-100 dark:border-[#1e3050] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Mapa de Entregas
            {activeTab === "furgao" && <span className="text-sm font-normal text-blue-600 dark:text-blue-400 ml-2">🚐 Furgão (&lt;{config.localRadiusKm}km)</span>}
            {activeTab === "caminhao" && <span className="text-sm font-normal text-orange-600 dark:text-orange-400 ml-2">🚛 Caminhão (&gt;{config.localRadiusKm}km)</span>}
          </h2>
          <div className="flex gap-2">
            {deliveries.length > 0 && (
              <>
                <button
                  onClick={handleOptimize}
                  disabled={isOptimizing || totalValidDeliveries === 0}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isOptimizing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Otimizando...
                    </>
                  ) : (
                    "Otimizar Rotas"
                  )}
                </button>
                {activeRoute && activeTab !== "all" && (
                  <ShareRoute
                    deliveries={activeDeliveries}
                    routeOrder={activeRoute.order}
                    origin={origin}
                    totalDistanceKm={activeRoute.totalDistanceKm}
                    totalTimeMinutes={activeRoute.totalTimeMinutes}
                    fuelCost={activeRoute.fuelCost}
                    vehicleLabel={activeTab === "furgao" ? "🚐 Furgão" : "🚛 Caminhão"}
                  />
                )}
                <button
                  onClick={handleClearAll}
                  className="px-4 py-2 bg-gray-200 dark:bg-[#1a2d4a] text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-[#243a5c] transition-colors"
                >
                  Limpar Tudo
                </button>
              </>
            )}
          </div>
        </div>
        <div className="h-[500px]">
          <MapView
            deliveries={activeDeliveries}
            origin={origin}
            routeGeometry={activeRoute?.geometry}
            routeOrder={activeRoute?.order}
          />
        </div>
      </div>

      {/* Delivery Table */}
      <div className="bg-white dark:bg-[#111c32] rounded-xl p-5 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] space-y-4 transition-colors duration-300">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Entregas ({activeDeliveries.length})
          </h2>
          <div className="flex items-center gap-2">
            {activeRoute && (
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 rounded-full font-medium">
                Rota otimizada
              </span>
            )}
          </div>
        </div>
        <DeliveryTable
          deliveries={activeDeliveries}
          routeOrder={activeRoute?.order}
          onRemove={handleRemove}
        />
      </div>
    </div>
  );
}
