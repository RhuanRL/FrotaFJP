import { NextRequest, NextResponse } from "next/server";

interface RoutePoint {
  lat: number;
  lng: number;
  id: string;
}

interface OSRMRoute {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][];
  };
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

// Build distance matrix using Haversine (fallback, no API needed)
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
        // Multiply by 1.3 to approximate road distance vs straight line
        distances[i][j] = dist * 1.3;
        // Assume average speed of 40 km/h in urban areas
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
      console.error(`OSRM table API returned ${res.status}`);
      const fallback = buildHaversineMatrix(points);
      return { ...fallback, usedFallback: true };
    }

    const data = await res.json();

    if (data.code !== "Ok" || !data.distances || !data.durations) {
      console.error(`OSRM table API error: ${data.code} - ${data.message || "unknown"}`);
      const fallback = buildHaversineMatrix(points);
      return { ...fallback, usedFallback: true };
    }

    // Check for null values in the matrix (unreachable points)
    let hasNull = false;
    for (const row of data.distances) {
      if (row.some((v: number | null) => v === null)) {
        hasNull = true;
        break;
      }
    }

    if (hasNull) {
      console.error("OSRM returned null distances (unreachable points)");
      const fallback = buildHaversineMatrix(points);
      return { ...fallback, usedFallback: true };
    }

    return {
      distances: data.distances,
      durations: data.durations,
      usedFallback: false,
    };
  } catch (err) {
    console.error("OSRM table API failed:", (err as Error).message);
    const fallback = buildHaversineMatrix(points);
    return { ...fallback, usedFallback: true };
  }
}

// Nearest Neighbor heuristic for TSP
function nearestNeighborTSP(
  distances: number[][],
  startIndex: number
): number[] {
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

// 2-opt improvement
function twoOptImprove(tour: number[], distances: number[][]): number[] {
  let improved = true;
  let best = [...tour];

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const currentDist =
          distances[best[i - 1]][best[i]] + distances[best[j]][best[(j + 1) % best.length]];
        const newDist =
          distances[best[i - 1]][best[j]] + distances[best[i]][best[(j + 1) % best.length]];

        if (newDist < currentDist) {
          const reversed = best.slice(i, j + 1).reverse();
          best = [...best.slice(0, i), ...reversed, ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }

  return best;
}

// Get actual route geometry from OSRM (in chunks if needed)
async function getRouteGeometry(
  points: RoutePoint[],
  order: number[]
): Promise<OSRMRoute | null> {
  const orderedCoords = order
    .map((i) => `${points[i].lng},${points[i].lat}`)
    .join(";");

  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${orderedCoords}?overview=full&geometries=geojson&steps=false`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) return null;

    return data.routes[0] as OSRMRoute;
  } catch {
    return null;
  }
}

// Build a simple geometry from points (straight lines as fallback)
function buildSimpleGeometry(
  points: RoutePoint[],
  order: number[]
): [number, number][] {
  return order.map((i) => [points[i].lat, points[i].lng] as [number, number]);
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
    const { distances, durations, usedFallback } = await getDistanceMatrix(points);

    // Solve TSP with nearest neighbor + 2-opt
    let tour = nearestNeighborTSP(distances, 0);
    tour = twoOptImprove(tour, distances);

    // Add return to origin at the end
    const tourWithReturn = [...tour, 0];

    // Try to get real route geometry from OSRM
    const route = await getRouteGeometry(points, tourWithReturn);

    // Build leg details
    const legs = tour.slice(1).map((pointIdx, legIdx) => ({
      deliveryId: points[pointIdx].id,
      order: legIdx + 1,
      distanceKm: Math.round((distances[tour[legIdx]][pointIdx] / 1000) * 10) / 10,
      timeMinutes: Math.round(durations[tour[legIdx]][pointIdx] / 60),
    }));

    // Add return leg
    const lastStop = tour[tour.length - 1];
    legs.push({
      deliveryId: "return-origin",
      order: legs.length + 1,
      distanceKm: Math.round((distances[lastStop][0] / 1000) * 10) / 10,
      timeMinutes: Math.round(durations[lastStop][0] / 60),
    });

    let totalDistanceKm: number;
    let totalTimeMinutes: number;
    let geometry: [number, number][];

    if (route) {
      // Use OSRM real route data
      totalDistanceKm = Math.round((route.distance / 1000) * 10) / 10;
      totalTimeMinutes = Math.round(route.duration / 60);
      geometry = route.geometry.coordinates.map(
        (coord) => [coord[1], coord[0]] as [number, number]
      );
    } else {
      // Fallback: sum leg distances and use straight lines
      totalDistanceKm = legs.reduce((sum, l) => sum + l.distanceKm, 0);
      totalTimeMinutes = legs.reduce((sum, l) => sum + l.timeMinutes, 0);
      geometry = buildSimpleGeometry(points, tourWithReturn);
    }

    const fuelLiters = Math.round((totalDistanceKm / consumption) * 10) / 10;
    const fuelCost = Math.round(fuelLiters * fuelPrice * 100) / 100;

    return NextResponse.json({
      order: tour.map((i) => points[i].id),
      legs,
      totalDistanceKm,
      totalTimeMinutes,
      fuelLiters,
      fuelCost,
      geometry,
      approximate: usedFallback || !route,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro na otimização: " + (err as Error).message },
      { status: 500 }
    );
  }
}
