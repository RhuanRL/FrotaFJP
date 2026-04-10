import { NextRequest, NextResponse } from "next/server";
import { parseStringPromise } from "xml2js";

interface ParsedNF {
  nfNumber: string;
  pedidoNumber: string;
  clientName: string;
  address: string;
  cep: string;
  city: string;
  state: string;
  value: number;
}

/**
 * Parse "Relatório de Pedidos" PDF from Fast Açaí ERP system.
 * Each page has 1ª Via (EMPRESA) and 2ª Via (CLIENTE) of the same order.
 * We split the text by "Pedido:" markers, extract each order, and deduplicate.
 */
function parseRelatorioPedidos(text: string): ParsedNF[] {
  const orders = new Map<string, ParsedNF>();

  // Split by "Pedido:" to find each order block
  // Each order appears twice (1ª Via + 2ª Via), so we deduplicate by pedido number
  const blocks = text.split(/(?=Pedido:\s*\d+)/);

  for (const block of blocks) {
    // Extract Pedido number
    const pedidoMatch = block.match(/Pedido:\s*(\d+)/);
    if (!pedidoMatch) continue;
    const pedidoNumber = pedidoMatch[1];

    // Skip if we already parsed this order
    if (orders.has(pedidoNumber)) continue;

    // Extract NF number
    const nfMatch = block.match(/N\.F\.:\s*(\d+)/);
    const nfNumber = nfMatch ? nfMatch[1] : "N/A";

    // Extract Client name - format: "Cliente: 292 - LUDMILA CRUVINEL G PAULA"
    const clientMatch = block.match(/Cliente:\s*\d+\s*-\s*([^\n\r]+)/);
    let clientName = clientMatch ? clientMatch[1].trim() : "";
    // Clean up: remove Form.Pgto and anything after it
    clientName = clientName.replace(/\s*Form\.?Pgto.*$/i, "").trim();

    // Extract CEP - format: "CEP: 74015-010" or "CEP:74015-010"
    const cepMatch = block.match(/CEP:\s*(\d{5}-?\d{3})/);
    if (!cepMatch) continue; // Skip orders without CEP
    let cep = cepMatch[1];
    if (!cep.includes("-")) {
      cep = `${cep.slice(0, 5)}-${cep.slice(5)}`;
    }

    // Skip the origin CEP (74905-330 = Fast Açaí factory)
    if (cep.replace(/\D/g, "") === "74905330") continue;

    // Extract Address - format: "Endereço: Avenida AV TOCANTINS, Nº303..."
    const addrMatch = block.match(/Endere[çc]o:\s*([^\n\r]+)/i);
    let address = addrMatch ? addrMatch[1].trim() : "";
    // Clean: remove "Bairro:" and everything after
    address = address.replace(/\s*Bairro:.*$/i, "").trim();

    // Extract Bairro
    const bairroMatch = block.match(/Bairro:\s*([^\n\r]+?)(?:\s*CEP:|\s*$)/i);
    const bairro = bairroMatch ? bairroMatch[1].trim() : "";

    // Extract City - format: "Cidade: GOIANIA-GO" or "APARECIDA DE GOIANIA-GO"
    const cityMatch = block.match(/Cidade:\s*([^\n\r]+?)(?:\s*Telefone:|\s*$)/i);
    let city = "";
    let state = "GO";
    if (cityMatch) {
      const cityRaw = cityMatch[1].trim();
      const cityStateMatch = cityRaw.match(/^(.+?)-(\w{2})$/);
      if (cityStateMatch) {
        city = cityStateMatch[1].trim();
        state = cityStateMatch[2].toUpperCase();
      } else {
        city = cityRaw;
      }
    }

    // Extract Total do Pedido value - format: "Total do Pedido: 1.854,00"
    const totalMatch = block.match(/Total\s+do\s+Pedido:\s*([\d.,]+)/i);
    let value = 0;
    if (totalMatch) {
      value = parseFloat(totalMatch[1].replace(/\./g, "").replace(",", ".")) || 0;
    }

    // Build full address string
    const fullAddress = [address, bairro, city, state].filter(Boolean).join(", ");

    orders.set(pedidoNumber, {
      nfNumber,
      pedidoNumber,
      clientName,
      address: fullAddress,
      cep,
      city,
      state,
      value,
    });
  }

  return Array.from(orders.values());
}

async function parsePDF(buffer: Buffer): Promise<ParsedNF[]> {
  // Dynamic import to avoid pdf-parse initialization issues in serverless
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  const text = data.text;

  // Detect if this is a "Relatório de Pedidos" from Fast Açaí
  if (text.includes("Relatório de Pedidos") || text.includes("Pedido:") && text.includes("N.F.:")) {
    return parseRelatorioPedidos(text);
  }

  // Fallback: try generic NF parsing (single NF per file)
  const result = parseGenericNF(text);
  return result ? [result] : [];
}

function parseGenericNF(text: string): ParsedNF | null {
  const cepMatch = text.match(/CEP[:\s]*(\d{5}-?\d{3})/i) || text.match(/(\d{5}-\d{3})/);
  if (!cepMatch) return null;

  let cep = cepMatch[1].replace(/\D/g, "");
  if (cep.length !== 8) return null;
  cep = `${cep.slice(0, 5)}-${cep.slice(5)}`;

  const nfMatch = text.match(/N\.?F\.?[:\s]*(\d+)/i);
  const clientMatch = text.match(/(?:Cliente|DESTINAT[ÁA]RIO|RAZ[ÃA]O\s+SOCIAL)[:\s]*([^\n\r]{5,60})/i);
  const addrMatch = text.match(/(?:ENDERE[ÇC]O|LOGRADOURO)[:\s]*([^\n\r]{5,100})/i);
  const cityMatch = text.match(/(?:MUNIC[ÍI]PIO|CIDADE)[:\s]*([^\n\r\d]{3,40})/i);
  const totalMatch = text.match(/(?:VALOR\s+TOTAL|TOTAL)[:\s]*R?\$?\s*([\d.,]+)/i);

  return {
    nfNumber: nfMatch ? nfMatch[1] : "N/A",
    pedidoNumber: "",
    clientName: clientMatch ? clientMatch[1].trim() : "Cliente",
    address: addrMatch ? addrMatch[1].trim() : "",
    cep,
    city: cityMatch ? cityMatch[1].trim() : "",
    state: "GO",
    value: totalMatch ? parseFloat(totalMatch[1].replace(/\./g, "").replace(",", ".")) || 0 : 0,
  };
}

async function parseXML(content: string): Promise<ParsedNF[]> {
  const result = await parseStringPromise(content, { explicitArray: false });

  const nfe = result?.nfeProc?.NFe?.infNFe || result?.NFe?.infNFe || result;
  const dest = nfe?.dest || {};
  const enderDest = dest?.enderDest || {};
  const ide = nfe?.ide || {};
  const total = nfe?.total?.ICMSTot || {};

  const cep = enderDest?.CEP
    ? `${String(enderDest.CEP).slice(0, 5)}-${String(enderDest.CEP).slice(5)}`
    : "";

  if (!cep) return [];

  return [{
    nfNumber: ide?.nNF || "N/A",
    pedidoNumber: "",
    clientName: dest?.xNome || "Cliente",
    address: [enderDest?.xLgr, enderDest?.nro, enderDest?.xBairro]
      .filter(Boolean)
      .join(", "),
    cep,
    city: enderDest?.xMun || "",
    state: enderDest?.UF || "GO",
    value: parseFloat(total?.vNF) || 0,
  }];
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const allResults: ParsedNF[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = file.name.toLowerCase();

        let parsed: ParsedNF[];

        if (fileName.endsWith(".pdf")) {
          parsed = await parsePDF(buffer);
        } else if (fileName.endsWith(".xml")) {
          const text = buffer.toString("utf-8");
          parsed = await parseXML(text);
        } else {
          errors.push(`${file.name}: formato não suportado (use PDF ou XML)`);
          continue;
        }

        if (parsed.length === 0) {
          errors.push(`${file.name}: nenhum pedido com CEP válido encontrado`);
          continue;
        }

        allResults.push(...parsed);
      } catch (err) {
        errors.push(`${file.name}: erro ao processar - ${(err as Error).message}`);
      }
    }

    // Group by CEP: same CEP = same delivery stop, aggregate orders
    const cepGroups = new Map<string, {
      nfNumbers: string[];
      pedidoNumbers: string[];
      clientNames: string[];
      address: string;
      cep: string;
      city: string;
      state: string;
      totalValue: number;
      orderCount: number;
    }>();

    for (const r of allResults) {
      const cleanCep = r.cep.replace(/\D/g, "");
      const existing = cepGroups.get(cleanCep);
      if (existing) {
        existing.nfNumbers.push(r.nfNumber);
        existing.pedidoNumbers.push(r.pedidoNumber);
        if (!existing.clientNames.includes(r.clientName)) {
          existing.clientNames.push(r.clientName);
        }
        existing.totalValue += r.value;
        existing.orderCount++;
      } else {
        cepGroups.set(cleanCep, {
          nfNumbers: [r.nfNumber],
          pedidoNumbers: [r.pedidoNumber],
          clientNames: [r.clientName],
          address: r.address,
          cep: r.cep,
          city: r.city,
          state: r.state,
          totalValue: r.value,
          orderCount: 1,
        });
      }
    }

    // Convert grouped results back to response format
    const groupedResults = Array.from(cepGroups.values()).map((g) => ({
      nfNumber: g.nfNumbers.join(", "),
      clientName: g.clientNames.join(" | ") + (g.orderCount > 1 ? ` (${g.orderCount} pedidos)` : ""),
      address: g.address,
      cep: g.cep,
      city: g.city,
      state: g.state,
      value: g.totalValue,
    }));

    return NextResponse.json({
      results: groupedResults,
      totalOrders: allResults.length,
      totalStops: groupedResults.length,
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Erro ao processar arquivos: " + (err as Error).message },
      { status: 500 }
    );
  }
}
