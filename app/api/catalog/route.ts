import { NextResponse } from "next/server";
import { listPsalmCatalog } from "@/lib/psalm-store";

export const maxDuration = 30;

export async function GET() {
  try {
    const catalog = await listPsalmCatalog();
    return NextResponse.json({ catalog });
  } catch (error: any) {
    const message = error?.message || "Erro interno ao carregar o catálogo.";
    if (!/não configurado/i.test(message)) {
      console.error("Catalog error:", error);
    }
    const status = /não configurado/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
