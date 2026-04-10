import { NextRequest, NextResponse } from "next/server";

interface GeoResult {
  cep: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
}

// Cache in-memory to avoid redundant API calls
const geoCache = new Map<string, GeoResult>();

async function geocodeCEP(cep: string): Promise<GeoResult | null> {
  const cleanCEP = cep.replace(/\D/g, "");

  if (geoCache.has(cleanCEP)) {
    return geoCache.get(cleanCEP)!;
  }

  // Step 1: Get address info from ViaCEP (free, no key needed)
  const viaCepRes = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
  if (!viaCepRes.ok) return null;

  const viaCep = await viaCepRes.json();
  if (viaCep.erro) return null;

  const searchQuery = [viaCep.logradouro, viaCep.bairro, viaCep.localidade, viaCep.uf]
    .filter(Boolean)
    .join(", ");

  // Step 2: Geocode with Nominatim (OpenStreetMap - free, no key needed)
  const nominatimRes = await fetch(
    `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q: searchQuery,
        format: "json",
        limit: "1",
        countrycodes: "br",
      }),
    {
      headers: { "User-Agent": "FrotaFJP/1.0" },
    }
  );

  let lat: number;
  let lng: number;

  if (nominatimRes.ok) {
    const nominatimData = await nominatimRes.json();
    if (nominatimData.length > 0) {
      lat = parseFloat(nominatimData[0].lat);
      lng = parseFloat(nominatimData[0].lon);
    } else {
      // Fallback: search just the city
      const cityRes = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({
            q: `${viaCep.localidade}, ${viaCep.uf}, Brasil`,
            format: "json",
            limit: "1",
            countrycodes: "br",
          }),
        {
          headers: { "User-Agent": "FrotaFJP/1.0" },
        }
      );
      const cityData = await cityRes.json();
      if (cityData.length > 0) {
        lat = parseFloat(cityData[0].lat);
        lng = parseFloat(cityData[0].lon);
      } else {
        return null;
      }
    }
  } else {
    return null;
  }

  const result: GeoResult = {
    cep: `${cleanCEP.slice(0, 5)}-${cleanCEP.slice(5)}`,
    lat,
    lng,
    address: searchQuery,
    city: viaCep.localidade,
    state: viaCep.uf,
  };

  geoCache.set(cleanCEP, result);
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ceps: string[] = body.ceps;

    if (!ceps || !Array.isArray(ceps) || ceps.length === 0) {
      return NextResponse.json({ error: "Lista de CEPs vazia" }, { status: 400 });
    }

    const results: (GeoResult | null)[] = [];

    // Process sequentially with small delay to respect Nominatim rate limits
    for (const cep of ceps) {
      const result = await geocodeCEP(cep);
      results.push(result);
      // Nominatim asks for max 1 request/second
      await new Promise((r) => setTimeout(r, 1100));
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro na geocodificação: " + (err as Error).message },
      { status: 500 }
    );
  }
}
