// app/api/revise/route.ts
import { NextRequest, NextResponse } from "next/server";
import { callClaude, safeParseJSON } from "@/lib/claude";
import { REVISE_SYSTEM } from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { cordel, issues, propositions } = await req.json();
    if (!cordel || !issues || !propositions) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const cordelText = cordel.estrofes
      .map((e: any) => `Estrofe ${e.numero}:\n${e.versos.join("\n")}`)
      .join("\n\n");

    const input = `CORDEL:\n${cordelText}\n\nPROBLEMAS:\n${issues.join("\n")}\n\nPROPOSIÇÕES:\n${propositions}`;
    const raw = await callClaude(REVISE_SYSTEM, input, 4096);
    const revised = safeParseJSON(raw);

    return NextResponse.json({ cordel: revised });
  } catch (error: any) {
    console.error("Revise error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
