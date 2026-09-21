import { Delivery, haversineKm } from "./types";

interface Point {
  lat: number;
  lng: number;
}

interface SplitResult {
  nelio: Delivery[];
  helton: Delivery[];
}

// Ângulo (graus, 0-360) do ponto em relação à origem (fábrica)
function angleFromOrigin(origin: Point, point: Point): number {
  const deg =
    (Math.atan2(point.lng - origin.lng, point.lat - origin.lat) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Divide as entregas locais do dia entre os dois motoristas (Nélio/Helton)
 * buscando o melhor equilíbrio de rota (tempo/distância), sem abrir mão de
 * cada um receber uma área geograficamente compacta e contígua.
 *
 * Como funciona (variação do algoritmo "sweep" usado em roteirização):
 * 1. Ordena as entregas pelo ângulo em torno da fábrica (como um relógio).
 * 2. Qualquer divisão em 2 grupos contíguos nessa "roda" de entregas equivale
 *    a escolher 2 pontos de corte entre entregas vizinhas na sequência.
 * 3. Entre todas as combinações de corte, mantém apenas as mais "compactas"
 *    (menor soma de distâncias internas em cada grupo) e, dentro dessas,
 *    escolhe a que resulta nas rotas mais equilibradas.
 *
 * Roda inteiramente no navegador (sem chamadas de rede) usando distância em
 * linha reta como aproximação — rápido o suficiente para testar milhares de
 * combinações a cada clique em "Otimizar Rotas". A rota real de cada
 * motorista continua sendo calculada depois, pelo otimizador existente
 * (/api/optimize-route, com dados de rua via OSRM).
 */
export function splitDeliveriesBalanced(
  origin: Point,
  deliveries: Delivery[]
): SplitResult {
  const valid = deliveries.filter((d) => d.lat && d.lng);

  if (valid.length === 0) return { nelio: [], helton: [] };

  if (valid.length === 1) {
    const d = valid[0];
    return d.lng < origin.lng ? { nelio: [d], helton: [] } : { nelio: [], helton: [d] };
  }

  const n = valid.length;

  // Ordena as entregas por ângulo em torno da origem
  const sorted = [...valid].sort(
    (a, b) => angleFromOrigin(origin, a) - angleFromOrigin(origin, b)
  );

  // Distância de cada entrega até a fábrica (aproxima o trecho de ida/volta)
  const radial = sorted.map((d) => haversineKm(origin.lat, origin.lng, d.lat, d.lng));

  // gap[i] = distância entre a entrega i e a próxima na sequência (circular)
  const gap: number[] = sorted.map((d, i) => {
    const next = sorted[(i + 1) % n];
    return haversineKm(d.lat, d.lng, next.lat, next.lng);
  });

  // Prefixos sobre um array "dobrado" para consultar a soma de qualquer arco
  // (inclusive os que dão a volta no índice 0) em tempo O(1)
  const doubledGap = [...gap, ...gap];
  const prefixGap = [0];
  for (let i = 0; i < doubledGap.length; i++) {
    prefixGap.push(prefixGap[i] + doubledGap[i]);
  }
  const gapSum = (from: number, count: number) =>
    count <= 0 ? 0 : prefixGap[from + count] - prefixGap[from];

  const doubledRadial = [...radial, ...radial];

  // Estimativa do "custo" (km) da rota de um grupo: distâncias internas entre
  // paradas vizinhas + ida até a primeira parada + volta da última até a fábrica
  function groupCost(start: number, count: number): number {
    if (count === 0) return 0;
    const internal = gapSum(start, count - 1);
    const first = doubledRadial[start];
    const last = doubledRadial[start + count - 1];
    return internal + first + last;
  }

  type Candidate = { start: number; lenA: number; compactness: number };

  const candidates: Candidate[] = [];
  for (let start = 0; start < n; start++) {
    for (let lenA = 1; lenA < n; lenA++) {
      // "compactness" = soma dos 2 cortes removidos da roda; quanto maior,
      // menores ficam as distâncias internas dentro de cada grupo
      const cutBefore = gap[(start - 1 + n) % n];
      const cutAfter = gap[(start + lenA - 1) % n];
      candidates.push({ start, lenA, compactness: cutBefore + cutAfter });
    }
  }

  // Mantém só as divisões mais compactas (área contígua para cada motorista)
  candidates.sort((a, b) => b.compactness - a.compactness);
  const topCount = Math.max(10, Math.ceil(candidates.length * 0.1));
  const topCandidates = candidates.slice(0, Math.min(topCount, candidates.length));

  // Entre as mais compactas, escolhe a mais equilibrada (custo de rota + nº de paradas)
  let best = topCandidates[0];
  let bestScore = Infinity;

  for (const c of topCandidates) {
    const costA = groupCost(c.start, c.lenA);
    const costB = groupCost(c.start + c.lenA, n - c.lenA);
    const totalCost = costA + costB || 1;
    const costImbalance = Math.abs(costA - costB) / totalCost;

    const countA = c.lenA;
    const countB = n - c.lenA;
    const countImbalance = Math.abs(countA - countB) / n;

    const score = costImbalance * 0.7 + countImbalance * 0.3;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }

  const groupAIdx: number[] = [];
  for (let k = 0; k < best.lenA; k++) groupAIdx.push((best.start + k) % n);
  const groupBIdx: number[] = [];
  for (let k = 0; k < n - best.lenA; k++) groupBIdx.push((best.start + best.lenA + k) % n);

  const groupA = groupAIdx.map((i) => sorted[i]);
  const groupB = groupBIdx.map((i) => sorted[i]);

  // Convenção: o grupo mais a oeste (menor longitude média) fica com o Nélio,
  // o outro com o Helton — mantém a referência que a equipe já usa no dia a dia.
  const avgLng = (group: Delivery[]) =>
    group.reduce((sum, d) => sum + d.lng, 0) / group.length;

  if (avgLng(groupA) <= avgLng(groupB)) {
    return { nelio: groupA, helton: groupB };
  }
  return { nelio: groupB, helton: groupA };
}
