"use client";

import { useState } from "react";
import { Delivery } from "@/lib/types";

interface ShareRouteProps {
  deliveries: Delivery[];
  routeOrder: string[];
  origin: { lat: number; lng: number; label: string };
  totalDistanceKm: number;
  totalTimeMinutes: number;
  fuelCost: number;
  vehicleLabel?: string;
}

function getOrderCount(delivery: Delivery): number {
  const match = delivery.clientName.match(/\((\d+)\s*pedidos?\)/i);
  return match ? parseInt(match[1]) : 1;
}

function cleanClientName(name: string): string {
  return name.replace(/\s*\(\d+\s*pedidos?\)/i, "").trim();
}

export default function ShareRoute({
  deliveries,
  routeOrder,
  origin,
  totalDistanceKm,
  totalTimeMinutes,
  fuelCost,
  vehicleLabel,
}: ShareRouteProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get ordered deliveries (excluding origin)
  const stopIds = routeOrder.filter((id) => id !== "origin");
  const orderedDeliveries = stopIds
    .map((id) => deliveries.find((d) => d.id === id))
    .filter((d): d is Delivery => d !== undefined && d.lat !== 0 && d.lng !== 0);

  if (orderedDeliveries.length === 0) return null;

  // Google Maps URL with waypoints
  // Format: /dir/origin/waypoint1/waypoint2/.../last_stop
  // Google Maps supports up to ~25 waypoints in URL
  function openGoogleMaps() {
    const originStr = `${origin.lat},${origin.lng}`;

    if (orderedDeliveries.length <= 9) {
      // Direct URL with all waypoints + return to origin
      const waypoints = orderedDeliveries
        .map((d) => `${d.lat},${d.lng}`)
        .join("/");
      const url = `https://www.google.com/maps/dir/${originStr}/${waypoints}/${originStr}`;
      window.open(url, "_blank");
    } else {
      // Too many waypoints for URL, split into chunks
      // First open the main route
      const first9 = orderedDeliveries.slice(0, 9);
      const waypoints = first9.map((d) => `${d.lat},${d.lng}`).join("/");
      const url = `https://www.google.com/maps/dir/${originStr}/${waypoints}`;
      window.open(url, "_blank");

      // Alert about remaining stops
      alert(
        `Google Maps suporta até 10 paradas por vez.\n` +
        `Abrindo as primeiras 9 paradas.\n` +
        `Restam ${orderedDeliveries.length - 9} paradas - use a folha de rota impressa para o roteiro completo.`
      );
    }
  }

  // Waze URL - opens to first stop, driver follows sequence
  function openWaze() {
    const first = orderedDeliveries[0];
    const url = `https://waze.com/ul?ll=${first.lat},${first.lng}&navigate=yes`;
    window.open(url, "_blank");
  }

  // Build text summary for WhatsApp/clipboard
  function buildRouteText(): string {
    const hours = Math.floor(totalTimeMinutes / 60);
    const mins = totalTimeMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h${mins}min` : `${mins}min`;

    let text = `🚚 *ROTA DE ENTREGAS - FAST AÇAÍ*\n`;
    text += `📅 ${new Date().toLocaleDateString("pt-BR")}\n`;
    if (vehicleLabel) text += `🚐 ${vehicleLabel}\n`;
    text += `📍 ${orderedDeliveries.length} paradas | ${totalDistanceKm}km | ~${timeStr} | R$${fuelCost.toFixed(2)} combustível\n`;
    text += `\n`;

    orderedDeliveries.forEach((d, idx) => {
      const count = getOrderCount(d);
      const name = cleanClientName(d.clientName);
      const pedidos = count > 1 ? ` (${count} pedidos)` : "";
      text += `*${idx + 1}.* ${name}${pedidos}\n`;
      text += `   📍 ${d.address || d.cep}\n`;
      text += `   ${d.city || ""} - CEP ${d.cep}\n`;
      if (d.value) text += `   💰 R$ ${d.value.toFixed(2)}\n`;
      text += `\n`;
    });

    text += `🏭 *RETORNO À FÁBRICA*\n\n`;

    // Add Google Maps link
    const originStr = `${origin.lat},${origin.lng}`;
    const waypointsForLink = orderedDeliveries.slice(0, 9);
    const waypoints = waypointsForLink.map((d) => `${d.lat},${d.lng}`).join("/");
    const mapsUrl = `https://www.google.com/maps/dir/${originStr}/${waypoints}/${originStr}`;
    text += `🗺️ Abrir no Google Maps:\n${mapsUrl}`;

    return text;
  }

  function shareWhatsApp() {
    const text = buildRouteText();
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  }

  function copyToClipboard() {
    const text = buildRouteText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }

  function printRoute() {
    const hours = Math.floor(totalTimeMinutes / 60);
    const mins = totalTimeMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h${mins}min` : `${mins}min`;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Rota de Entregas - Fast Açaí</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; color: #111; font-size: 12px; }
    .header { text-align: center; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; color: #7c3aed; }
    .header p { font-size: 11px; color: #666; margin-top: 4px; }
    .summary { display: flex; gap: 16px; justify-content: center; margin-bottom: 16px; padding: 10px; background: #f3f0ff; border-radius: 8px; }
    .summary-item { text-align: center; }
    .summary-item .value { font-size: 16px; font-weight: bold; color: #7c3aed; }
    .summary-item .label { font-size: 10px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #7c3aed; color: white; padding: 8px 6px; text-align: left; font-size: 11px; }
    td { padding: 7px 6px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    tr:nth-child(even) { background: #faf9ff; }
    .stop-num { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: #7c3aed; color: white; font-weight: bold; font-size: 13px; }
    .orders-badge { display: inline-block; background: #f59e0b; color: white; border-radius: 10px; padding: 1px 7px; font-size: 10px; font-weight: bold; }
    .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; }
    .footer p { font-size: 10px; color: #999; }
    .signature { margin-top: 40px; display: flex; gap: 60px; justify-content: center; }
    .signature div { text-align: center; border-top: 1px solid #333; padding-top: 4px; width: 200px; font-size: 11px; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>ROTA DE ENTREGAS - FAST AÇAÍ</h1>
    <p>${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}${vehicleLabel ? ` | ${vehicleLabel}` : ""}</p>
  </div>

  <div class="summary">
    <div class="summary-item">
      <div class="value">${orderedDeliveries.length}</div>
      <div class="label">Paradas</div>
    </div>
    <div class="summary-item">
      <div class="value">${totalDistanceKm} km</div>
      <div class="label">Distância</div>
    </div>
    <div class="summary-item">
      <div class="value">${timeStr}</div>
      <div class="label">Tempo est.</div>
    </div>
    <div class="summary-item">
      <div class="value">R$ ${fuelCost.toFixed(2)}</div>
      <div class="label">Combustível</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>Cliente</th>
        <th>Endereço / CEP</th>
        <th style="width:50px">Pedidos</th>
        <th style="width:70px">Valor</th>
        <th style="width:28px">✓</th>
      </tr>
    </thead>
    <tbody>
      ${orderedDeliveries
        .map((d, idx) => {
          const count = getOrderCount(d);
          const name = cleanClientName(d.clientName);
          const ordersBadge = count > 1 ? `<span class="orders-badge">${count}</span>` : "1";
          return `
        <tr>
          <td><span class="stop-num">${idx + 1}</span></td>
          <td><strong>${name}</strong></td>
          <td>${d.address || ""}<br/><strong>${d.cep}</strong> - ${d.city || ""}</td>
          <td style="text-align:center">${ordersBadge}</td>
          <td>${d.value ? "R$ " + d.value.toFixed(2) : "-"}</td>
          <td style="text-align:center">☐</td>
        </tr>`;
        })
        .join("")}
      <tr style="background:#f0fdf4">
        <td><span class="stop-num" style="background:#16a34a">⟳</span></td>
        <td colspan="5"><strong>RETORNO À FÁBRICA</strong> - Rua Guarai, Vila Brasília, Aparecida de Goiânia</td>
      </tr>
    </tbody>
  </table>

  <div class="signature">
    <div>Motorista</div>
    <div>Conferente</div>
  </div>

  <div class="footer">
    <p>FrotaFJP - Sistema de Otimização de Rotas</p>
    <p>Impresso em ${new Date().toLocaleString("pt-BR")}</p>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  }

  return (
    <>
      <button
        onClick={() => setShowMenu(true)}
        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
      >
        📤 Enviar Rota
      </button>

      {showMenu && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMenu(false)}
          />
          <div className="relative bg-white dark:bg-[#1a2d4a] rounded-xl shadow-2xl dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)] border border-gray-200 dark:border-[#2a3f5f] p-3 min-w-[280px]">
            <button
              onClick={() => { openGoogleMaps(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243a5c] text-left transition-colors"
            >
              <span className="text-lg">🗺️</span>
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Google Maps</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Abrir navegação com todas as paradas</div>
              </div>
            </button>

            <button
              onClick={() => { openWaze(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243a5c] text-left transition-colors"
            >
              <span className="text-lg">🚗</span>
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Waze</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Navegar até a próxima parada</div>
              </div>
            </button>

            <div className="border-t border-gray-200 dark:border-[#2a3f5f] my-1" />

            <button
              onClick={() => { printRoute(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243a5c] text-left transition-colors"
            >
              <span className="text-lg">🖨️</span>
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Imprimir Folha de Rota</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">PDF com sequência e checkbox</div>
              </div>
            </button>

            <div className="border-t border-gray-200 dark:border-[#2a3f5f] my-1" />

            <button
              onClick={() => { shareWhatsApp(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243a5c] text-left transition-colors"
            >
              <span className="text-lg">💬</span>
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100">WhatsApp</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Enviar rota com link do Maps</div>
              </div>
            </button>

            <button
              onClick={() => { copyToClipboard(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243a5c] text-left transition-colors"
            >
              <span className="text-lg">📋</span>
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {copied ? "Copiado!" : "Copiar Rota"}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Copiar texto da rota completa</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
