// app/api/compose/route.ts
import { NextRequest, NextResponse } from "next/server";
import { callClaude, safeParseJSON } from "@/lib/claude";
import { PLAN_SYSTEM, VOCAB_SYSTEM, COMPOSE_SYSTEM } from "@/lib/prompts";
import { extractLevel } from "@/lib/extract";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { meaningMap } = await req.json();
    if (!meaningMap) {
      return NextResponse.json({ error: "Missing meaningMap" }, { status: 400 });
    }

    const level1 = extractLevel(meaningMap, 1);
    const level2 = extractLevel(meaningMap, 2);
    const level3 = extractLevel(meaningMap, 3);

    if (!level3) {
      return NextResponse.json(
        { error: "Could not find Level 3 (Propositions) in the Meaning Map." },
        { status: 400 }
      );
    }

    // Agent 1: Planner
    const planRaw = await callClaude(
      PLAN_SYSTEM,
      level1 || "No Level 1 found. Plan a simple cordel structure for a biblical text.",
      1024
    );
    const plan = safeParseJSON(planRaw);

    // Agent 2: Vocabulary
    const vocabRaw = await callClaude(
      VOCAB_SYSTEM,
      level2 || "No Level 2 found. Use generic sertanejo vocabulary for biblical imagery.",
      1024
    );
    const vocab = safeParseJSON(vocabRaw);

    // Agent 3: Composer
    const composerInput = `PLANO ESTRUTURAL:\n${JSON.stringify(plan, null, 2)}\n\nGUIA DE VOCABULÁRIO:\n${JSON.stringify(vocab, null, 2)}\n\nPROPOSIÇÕES:\n${level3}`;
    const cordelRaw = await callClaude(COMPOSE_SYSTEM, composerInput, 4096);
    const cordel = safeParseJSON(cordelRaw);

    return NextResponse.json({ plan, vocab, cordel });
  } catch (error: any) {
    console.error("Compose error:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
