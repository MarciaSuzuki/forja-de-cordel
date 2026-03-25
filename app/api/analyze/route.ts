// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { callClaude, safeParseJSON } from "@/lib/claude";
import { ANALYZE_SYSTEM } from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { cordel, propositions } = await req.json();
    if (!cordel || !propositions) {
      return NextResponse.json({ error: "Missing cordel or propositions" }, { status: 400 });
    }

    const cordelText = cordel.estrofes
      .map((e: any) => `Estrofe ${e.numero}:\n${e.versos.join("\n")}`)
      .join("\n\n");

    const input = `CORDEL:\n${cordelText}\n\n---\n\nPROPOSIÇÕES:\n${propositions}`;
    const raw = await callClaude(ANALYZE_SYSTEM, input, 4096);
    const analysis = safeParseJSON(raw);

    return NextResponse.json({ analysis });
  } catch (error: any) {
    console.error("Analyze error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
