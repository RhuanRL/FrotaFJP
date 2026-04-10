"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Delivery } from "@/lib/types";

interface MapViewProps {
  deliveries: Delivery[];
  origin: { lat: number; lng: number; label: string };
  routeGeometry?: [number, number][];
  routeOrder?: string[];
}

const originIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="background:#7c3aed;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏭</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function createDeliveryIcon(stopNumber: number, orderCount: number) {
  const badge = orderCount > 1
    ? `<div style="position:absolute;top:-6px;right:-6px;background:#f59e0b;color:white;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:2px solid white;">${orderCount}</div>`
    : "";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="position:relative;background:#dc2626;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${stopNumber}${badge}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createUnorderedIcon() {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="background:#6b7280;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">📦</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Count how many pedidos a delivery has (from clientName like "NOME (3 pedidos)")
function getOrderCount(delivery: Delivery): number {
  const match = delivery.clientName.match(/\((\d+)\s*pedidos?\)/i);
  return match ? parseInt(match[1]) : 1;
}

export default function MapView({
  deliveries,
  origin,
  routeGeometry,
  routeOrder,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
    }

    const map = L.map(mapContainerRef.current).setView(
      [origin.lat, origin.lng],
      12
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Origin marker
    L.marker([origin.lat, origin.lng], { icon: originIcon })
      .addTo(map)
      .bindPopup(`<b>🏭 Origem</b><br/>${origin.label}`);

    // Build sequential stop numbers from route order
    // routeOrder = ["origin", "id-abc", "id-def", ...] → stops = ["id-abc", "id-def", ...]
    const stopSequence: string[] = routeOrder
      ? routeOrder.filter((id) => id !== "origin")
      : [];

    // Map delivery ID → sequential stop number (1-based)
    const stopNumberMap = new Map<string, number>();
    stopSequence.forEach((id, idx) => {
      stopNumberMap.set(id, idx + 1);
    });

    const bounds = L.latLngBounds([[origin.lat, origin.lng]]);

    deliveries.forEach((delivery) => {
      if (!delivery.lat || !delivery.lng) return;

      const stopNumber = stopNumberMap.get(delivery.id);
      const orderCount = getOrderCount(delivery);

      const icon = stopNumber !== undefined
        ? createDeliveryIcon(stopNumber, orderCount)
        : createUnorderedIcon();

      const pedidoInfo = orderCount > 1 ? `<br/><b style="color:#f59e0b;">${orderCount} pedidos nesta parada</b>` : "";

      L.marker([delivery.lat, delivery.lng], { icon })
        .addTo(map)
        .bindPopup(
          `<b>Parada ${stopNumber ?? "?"}: ${delivery.clientName}</b><br/>NF: ${delivery.nfNumber}<br/>${delivery.address}<br/>CEP: ${delivery.cep}${pedidoInfo}`
        );

      bounds.extend([delivery.lat, delivery.lng]);
    });

    // Route polyline
    if (routeGeometry && routeGeometry.length > 0) {
      L.polyline(routeGeometry, {
        color: "#7c3aed",
        weight: 4,
        opacity: 0.8,
      }).addTo(map);
    }

    if (deliveries.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [deliveries, origin, routeGeometry, routeOrder]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full rounded-lg"
      style={{ minHeight: "500px" }}
    />
  );
}
