import { NextRequest, NextResponse } from "next/server";
import {
  getPsalmRecord,
  savePsalmRecord,
  toCatalogItem,
} from "@/lib/psalm-store";

export const maxDuration = 30;

function normalizePsalmNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 150) {
    return null;
  }
  return parsed;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { psalmNumber: string } }
) {
  try {
    const psalmNumber = normalizePsalmNumber(params.psalmNumber);
    if (psalmNumber == null) {
      return NextResponse.json(
        { error: "Número de salmo inválido." },
        { status: 400 }
      );
    }

    const record = await getPsalmRecord(psalmNumber);
    if (!record) {
      return NextResponse.json(
        { error: `Salmo ${psalmNumber} ainda não salvo.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ record });
  } catch (error: any) {
    const message = error?.message || "Erro interno ao carregar o salmo.";
    if (!/não configurado/i.test(message)) {
      console.error("Get psalm error:", error);
    }
    const status = /não configurado/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { psalmNumber: string } }
) {
  try {
    const psalmNumber = normalizePsalmNumber(params.psalmNumber);
    if (psalmNumber == null) {
      return NextResponse.json(
        { error: "Número de salmo inválido." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const record = body?.record;
    if (!record?.cordelData) {
      return NextResponse.json(
        { error: "Registro inválido para salvar." },
        { status: 400 }
      );
    }

    const savedRecord = await savePsalmRecord(psalmNumber, {
      ...record,
      salmo: psalmNumber,
    });

    if (!savedRecord) {
      throw new Error("Não foi possível confirmar o salvamento do salmo.");
    }

    return NextResponse.json({
      record: savedRecord,
      catalogItem: toCatalogItem(savedRecord),
    });
  } catch (error: any) {
    const message = error?.message || "Erro interno ao salvar o salmo.";
    if (!/não configurado/i.test(message)) {
      console.error("Save psalm error:", error);
    }
    const status = /não configurado/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
