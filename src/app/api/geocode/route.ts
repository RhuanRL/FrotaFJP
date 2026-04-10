import { NextRequest, NextResponse } from "next/server";

interface GeoResult {
  cep: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
}

async function geocodeCEP(cep: string): Promise<GeoResult | null> {
  const cleanCEP = cep.replace(/\D/g, "");

  try {
    // Step 1: Get address info from ViaCEP
    const viaCepRes = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!viaCepRes.ok) return null;

    const viaCep = await viaCepRes.json();
    if (viaCep.erro) return null;

    const searchQuery = [viaCep.logradouro, viaCep.bairro, viaCep.localidade, viaCep.uf]
      .filter(Boolean)
      .join(", ");

    // Step 2: Geocode with Nominatim
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
        signal: AbortSignal.timeout(5000),
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
            signal: AbortSignal.timeout(5000),
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

    return {
      cep: `${cleanCEP.slice(0, 5)}-${cleanCEP.slice(5)}`,
      lat,
      lng,
      address: searchQuery,
      city: viaCep.localidade,
      state: viaCep.uf,
    };
  } catch {
    return null;
  }
}

// Process a small batch (max 3 CEPs at once to respect Nominatim)
async function processBatch(ceps: string[]): Promise<(GeoResult | null)[]> {
  return Promise.all(ceps.map((cep) => geocodeCEP(cep)));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ceps: string[] = body.ceps;

    if (!ceps || !Array.isArray(ceps) || ceps.length === 0) {
      return NextResponse.json({ error: "Lista de CEPs vazia" }, { status: 400 });
    }

    // Deduplicate CEPs
    const uniqueCeps = [...new Set(ceps.map((c) => c.replace(/\D/g, "")))].map(
      (c) => `${c.slice(0, 5)}-${c.slice(5)}`
    );

    const results: (GeoResult | null)[] = [];

    // Process in batches of 3 with 300ms delay between batches
    const BATCH_SIZE = 3;
    for (let i = 0; i < uniqueCeps.length; i += BATCH_SIZE) {
      const batch = uniqueCeps.slice(i, i + BATCH_SIZE);
      const batchResults = await processBatch(batch);
      results.push(...batchResults);

      // Small delay between batches
      if (i + BATCH_SIZE < uniqueCeps.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro na geocodificação: " + (err as Error).message },
      { status: 500 }
    );
  }
}
