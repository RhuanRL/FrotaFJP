import { NextRequest, NextResponse } from "next/server";

interface RoutePoint {
  lat: number;
  lng: number;
  id: string;
}

// Haversine distance in meters
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Build distance matrix using Haversine (fallback)
function buildHaversineMatrix(points: RoutePoint[]): {
  distances: number[][];
  durations: number[][];
} {
  const n = points.length;
  const distances: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const durations: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const dist = haversine(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
        distances[i][j] = dist * 1.3;
        durations[i][j] = (distances[i][j] / 1000 / 40) * 3600;
      }
    }
  }

  return { distances, durations };
}

// Try OSRM distance matrix, fall back to Haversine
async function getDistanceMatrix(
  points: RoutePoint[]
): Promise<{ distances: number[][]; durations: number[][]; usedFallback: boolean }> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");

  try {
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance,duration`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) {
      const fallback = buildHaversineMatrix(points);
      return { ...fallback, usedFallback: true };
    }

    const data = await res.json();

    if (data.code !== "Ok" || !data.distances || !data.durations) {
      const fallback = buildHaversineMatrix(points);
      return { ...fallback, usedFallback: true };
    }

    let hasNull = false;
    for (const row of data.distances) {
      if (row.some((v: number | null) => v === null)) {
        hasNull = true;
        break;
      }
    }

    if (hasNull) {
      const fallback = buildHaversineMatrix(points);
      return { ...fallback, usedFallback: true };
    }

    return {
      distances: data.distances,
      durations: data.durations,
      usedFallback: false,
    };
  } catch {
    const fallback = buildHaversineMatrix(points);
    return { ...fallback, usedFallback: true };
  }
}

// Calculate total round-trip distance (origin → stops → origin)
function tourDistance(tour: number[], distances: number[][]): number {
  let total = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    total += distances[tour[i]][tour[i + 1]];
  }
  // Return to origin
  total += distances[tour[tour.length - 1]][tour[0]];
  return total;
}

// Nearest Neighbor heuristic for TSP
function nearestNeighborTSP(distances: number[][], startIndex: number): number[] {
  const n = distances.length;
  const visited = new Set<number>([startIndex]);
  const tour = [startIndex];
  let current = startIndex;

  while (visited.size < n) {
    let nearest = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < n; i++) {
      if (!visited.has(i) && distances[current][i] < nearestDist) {
        nearest = i;
        nearestDist = distances[current][i];
      }
    }

    if (nearest === -1) break;
    visited.add(nearest);
    tour.push(nearest);
    current = nearest;
  }

  return tour;
}

// Nearest Neighbor from multiple starting nodes, keep the best
function multiStartNearestNeighbor(distances: number[][]): number[] {
  const n = distances.length;
  let bestTour = nearestNeighborTSP(distances, 0);
  let bestDist = tourDistance(bestTour, distances);

  // Try starting from each node, but always fix origin at position 0
  for (let start = 1; start < n; start++) {
    const trial = nearestNeighborTSP(distances, start);

    // Rotate so that node 0 (origin) is first
    const originIdx = trial.indexOf(0);
    const rotated = [...trial.slice(originIdx), ...trial.slice(0, originIdx)];

    const dist = tourDistance(rotated, distances);
    if (dist < bestDist) {
      bestDist = dist;
      bestTour = rotated;
    }
  }

  return bestTour;
}

// 2-opt improvement considering round trip back to origin
function twoOptImprove(tour: number[], distances: number[][]): number[] {
  const n = tour.length;
  let best = [...tour];
  let bestDist = tourDistance(best, distances);
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Reverse segment between i and j
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const candidateDist = tourDistance(candidate, distances);

        if (candidateDist < bestDist - 0.01) {
          best = candidate;
          bestDist = candidateDist;
          improved = true;
        }
      }
    }
  }

  return best;
}

// Or-opt: try moving each stop to its best position in the tour
function orOptImprove(tour: number[], distances: number[][]): number[] {
  let best = [...tour];
  let bestDist = tourDistance(best, distances);
  let improved = true;

  while (improved) {
    improved = false;
    // Don't move origin (index 0)
    for (let i = 1; i < best.length; i++) {
      const node = best[i];
      const without = [...best.slice(0, i), ...best.slice(i + 1)];

      for (let j = 1; j <= without.length; j++) {
        if (j === i) continue; // Same position
        const candidate = [...without.slice(0, j), node, ...without.slice(j)];
        const candidateDist = tourDistance(candidate, distances);

        if (candidateDist < bestDist - 0.01) {
          best = candidate;
          bestDist = candidateDist;
          improved = true;
          break; // Restart outer loop
        }
      }
      if (improved) break;
    }
  }

  return best;
}

// Full optimization: multi-start NN → 2-opt → or-opt
function optimizeTour(distances: number[][]): number[] {
  let tour = multiStartNearestNeighbor(distances);
  tour = twoOptImprove(tour, distances);
  tour = orOptImprove(tour, distances);
  // Run 2-opt again after or-opt for final polish
  tour = twoOptImprove(tour, distances);
  return tour;
}

// Fetch real road geometry between two points from OSRM
async function getSegmentGeometry(
  from: RoutePoint,
  to: RoutePoint
): Promise<{ coordinates: [number, number][]; distance: number; duration: number } | null> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]] as [number, number]
      ),
      distance: route.distance,
      duration: route.duration,
    };
  } catch {
    return null;
  }
}

// Fetch real road geometry for the full route, segment by segment
async function getFullRouteGeometry(
  points: RoutePoint[],
  order: number[]
): Promise<{
  geometry: [number, number][];
  totalDistance: number;
  totalDuration: number;
  legDistances: number[];
  legDurations: number[];
  isReal: boolean;
}> {
  const allCoords: [number, number][] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  const legDistances: number[] = [];
  const legDurations: number[] = [];
  let allSuccess = true;

  // Fetch each segment (A→B, B→C, C→D, ..., last→origin)
  for (let i = 0; i < order.length - 1; i++) {
    const from = points[order[i]];
    const to = points[order[i + 1]];

    const segment = await getSegmentGeometry(from, to);

    if (segment) {
      // Don't duplicate the first point of each segment (it's the last of the previous)
      if (allCoords.length > 0) {
        allCoords.push(...segment.coordinates.slice(1));
      } else {
        allCoords.push(...segment.coordinates);
      }
      totalDistance += segment.distance;
      totalDuration += segment.duration;
      legDistances.push(segment.distance);
      legDurations.push(segment.duration);
    } else {
      // Fallback for this segment: straight line
      allSuccess = false;
      allCoords.push([from.lat, from.lng], [to.lat, to.lng]);
      const dist = haversine(from.lat, from.lng, to.lat, to.lng) * 1.3;
      totalDistance += dist;
      totalDuration += (dist / 1000 / 40) * 3600;
      legDistances.push(dist);
      legDurations.push((dist / 1000 / 40) * 3600);
    }

    // Small delay between requests to be respectful to OSRM
    if (i < order.length - 2) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return {
    geometry: allCoords,
    totalDistance,
    totalDuration,
    legDistances,
    legDurations,
    isReal: allSuccess,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origin, deliveries, fuelPrice, consumption } = body as {
      origin: { lat: number; lng: number };
      deliveries: { id: string; lat: number; lng: number }[];
      fuelPrice: number;
      consumption: number;
    };

    if (!deliveries || deliveries.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma entrega para otimizar" },
        { status: 400 }
      );
    }

    // Build points array: origin + delivery points
    const points: RoutePoint[] = [
      { lat: origin.lat, lng: origin.lng, id: "origin" },
      ...deliveries.map((d) => ({ lat: d.lat, lng: d.lng, id: d.id })),
    ];

    // Get distance matrix (with Haversine fallback)
    const { distances, durations } = await getDistanceMatrix(points);

    // Solve TSP: multi-start nearest neighbor → 2-opt → or-opt → 2-opt
    const tour = optimizeTour(distances);

    // Add return to origin
    const tourWithReturn = [...tour, 0];

    // Fetch real road geometry segment by segment
    const routeData = await getFullRouteGeometry(points, tourWithReturn);

    // Build leg details using real distances when available
    const legs = tour.slice(1).map((pointIdx, legIdx) => ({
      deliveryId: points[pointIdx].id,
      order: legIdx + 1,
      distanceKm:
        Math.round((routeData.legDistances[legIdx] / 1000) * 10) / 10,
      timeMinutes: Math.round(routeData.legDurations[legIdx] / 60),
    }));

    // Return leg (last delivery → origin)
    const returnLegIdx = tour.length - 1;
    legs.push({
      deliveryId: "return-origin",
      order: legs.length + 1,
      distanceKm:
        Math.round((routeData.legDistances[returnLegIdx] / 1000) * 10) / 10,
      timeMinutes: Math.round(routeData.legDurations[returnLegIdx] / 60),
    });

    const totalDistanceKm = Math.round((routeData.totalDistance / 1000) * 10) / 10;
    const totalTimeMinutes = Math.round(routeData.totalDuration / 60);
    const fuelLiters = Math.round((totalDistanceKm / consumption) * 10) / 10;
    const fuelCost = Math.round(fuelLiters * fuelPrice * 100) / 100;

    return NextResponse.json({
      order: tour.map((i) => points[i].id),
      legs,
      totalDistanceKm,
      totalTimeMinutes,
      fuelLiters,
      fuelCost,
      geometry: routeData.geometry,
      approximate: !routeData.isReal,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro na otimização: " + (err as Error).message },
      { status: 500 }
    );
  }
}
