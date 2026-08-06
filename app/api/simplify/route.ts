import { NextRequest, NextResponse } from "next/server";
import { simplifyMeaningMapForCordel } from "@/lib/extract";
import { requireMeaningMap } from "@/lib/request-validation";

export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const meaningMap = requireMeaningMap(body?.meaningMap);
    const simplifiedMap = simplifyMeaningMapForCordel(meaningMap);
    const reduction = Math.max(
      0,
      Math.round((1 - simplifiedMap.length / meaningMap.length) * 100)
    );

    return NextResponse.json({
      simplifiedMap,
      originalCharacters: meaningMap.length,
      simplifiedCharacters: simplifiedMap.length,
      reduction,
      method:
        "filtragem extrativa determinística, sem resumo, paráfrase ou regeneração",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro interno ao preparar o Mapa.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
