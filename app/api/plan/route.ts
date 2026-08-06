import { NextRequest, NextResponse } from "next/server";
import { PLAN_SCHEMA } from "@/lib/ai-schemas";
import { compactMeaningMap, extractLevel } from "@/lib/extract";
import { callOpenAIJSON } from "@/lib/openai";
import { PLAN_SYSTEM } from "@/lib/prompts";
import { requireMeaningMap } from "@/lib/request-validation";

export const maxDuration = 300;

interface PlanData extends Record<string, unknown> {
  estrofes?: Array<Record<string, unknown> & { proposicoes?: number[] }>;
  cobertura?: Array<
    Record<string, unknown> & {
      proposicao?: number;
      cena?: number;
      versos_minimos?: number;
    }
  >;
}

function deriveSourceConstraints(level3: string) {
  const minimumLines = new Map<number, number>();
  const scenes = new Map<number, number>();
  const propositionPattern =
    /Proposition\s+(\d+)([^\n]*)\n([\s\S]*?)(?=\nProposition\s+\d+\s|$)/gi;

  for (const match of Array.from(level3.matchAll(propositionPattern))) {
    const proposition = Number(match[1]);
    const scene = Number(match[2].match(/\[Scene\s+(\d+)\]/i)?.[1]);
    const block = match[3] || "";
    const numberedVoicings = block.match(
      /(?:First|Second|Third|Primeira|Segunda|Terceira)\s+voicing\s*\(kept\)/gi
    )?.length || 0;
    const genericVoicings =
      block.match(/^(?:Q:\s*)?-?\s*Voicing\s*\(kept\)[?:]/gim)?.length || 0;
    const coreVoicings = Math.max(1, numberedVoicings + genericVoicings);
    const hasCry = /With what cry[?:]/i.test(block) ? 1 : 0;
    const hasPivot = /Opening pivot\s*\(kept\)[?:]/i.test(block) ? 1 : 0;
    const hasDivineTitle = /Called what[?:]/i.test(block) ? 1 : 0;

    minimumLines.set(
      proposition,
      Math.min(6, coreVoicings + hasCry + hasPivot + hasDivineTitle)
    );
    if (Number.isInteger(scene) && scene > 0) scenes.set(proposition, scene);
  }

  return { minimumLines, scenes };
}

function describeSourceConstraints(
  minimumLines: Map<number, number>,
  scenes: Map<number, number>
) {
  const rows = Array.from(minimumLines.entries())
    .sort(([a], [b]) => a - b)
    .map(
      ([proposition, lines]) =>
        `- Proposição ${proposition}: cena ${scenes.get(proposition) || "não identificada"}, mínimo imutável de ${lines} verso(s)`
    );
  const sceneLoads = new Map<number, number>();
  for (const [proposition, lines] of Array.from(minimumLines.entries())) {
    const scene = scenes.get(proposition);
    if (!scene) continue;
    sceneLoads.set(scene, (sceneLoads.get(scene) || 0) + lines);
  }
  const minimumStanzas = Array.from(sceneLoads.values()).reduce(
    (sum, lines) => sum + Math.ceil(lines / 6),
    0
  );

  return `RESTRIÇÕES DE CAPACIDADE CALCULADAS PELO SERVIDOR\n${rows.join(
    "\n"
  )}\nMínimo total pelas fronteiras de cena: ${minimumStanzas} sextilhas. Estes números são pisos: não os reduza no JSON.`;
}

function getPlanIssue(
  plan: PlanData,
  sourceMinimumLines: Map<number, number>,
  sourceScenes: Map<number, number>
) {
  const stanzas = Array.isArray(plan.estrofes) ? plan.estrofes : [];
  const coverage = Array.isArray(plan.cobertura) ? plan.cobertura : [];
  const minimumLines = new Map(
    coverage
      .filter(
        (item) =>
          Number.isInteger(item.proposicao) && Number.isInteger(item.versos_minimos)
      )
      .map((item) => [item.proposicao as number, item.versos_minimos as number])
  );
  for (const [proposition, lines] of Array.from(sourceMinimumLines.entries())) {
    minimumLines.set(proposition, lines);
  }
  const scenes = new Map(
    coverage
      .filter((item) => Number.isInteger(item.proposicao) && Number.isInteger(item.cena))
      .map((item) => [item.proposicao as number, item.cena as number])
  );
  for (const [proposition, scene] of Array.from(sourceScenes.entries())) {
    scenes.set(proposition, scene);
  }

  const sceneLoads = new Map<number, number>();
  for (const item of coverage) {
    if (!Number.isInteger(item.proposicao)) continue;
    const proposition = item.proposicao as number;
    const scene = scenes.get(proposition);
    if (!scene) continue;
    sceneLoads.set(scene, (sceneLoads.get(scene) || 0) + (minimumLines.get(proposition) || 1));
  }
  const minimumStanzas = Array.from(sceneLoads.values()).reduce(
    (sum, lineCount) => sum + Math.ceil(lineCount / 6),
    0
  );
  if (stanzas.length < minimumStanzas) {
    return `O projeto tem ${stanzas.length} sextilhas, mas as cargas semânticas e as fronteiras de cena exigem no mínimo ${minimumStanzas}. Acrescente sextilhas sem reduzir as estimativas de versos.`;
  }
  const mixedScenes = stanzas
    .map((stanza, index) => ({
      number: Number(stanza.numero) || index + 1,
      scenes: new Set(
        Array.isArray(stanza.proposicoes)
          ? stanza.proposicoes.map((proposition) => scenes.get(proposition)).filter(Boolean)
          : []
      ),
    }))
    .filter((stanza) => stanza.scenes.size > 1);

  if (mixedScenes.length) {
    return `O projeto misturou cenas diferentes ${mixedScenes
      .map((stanza) => `na estrofe ${stanza.number}`)
      .join(", ")}. Preserve cada mudança de cena como fronteira entre sextilhas.`;
  }

  const overloaded = stanzas
    .map((stanza, index) => ({
      number: Number(stanza.numero) || index + 1,
      propositionCount: Array.isArray(stanza.proposicoes)
        ? stanza.proposicoes.length
        : 0,
      lines: Array.isArray(stanza.proposicoes)
        ? stanza.proposicoes.reduce(
            (sum, proposition) => sum + (minimumLines.get(proposition) || 1),
            0
          )
        : 0,
    }))
    .filter(
      (stanza) => stanza.lines > 6 || (stanza.lines === 6 && stanza.propositionCount <= 2)
    );

  if (overloaded.length) {
    return `O projeto sobrecarregou ${overloaded
      .map((stanza) => `a estrofe ${stanza.number} (${stanza.lines} versos mínimos)`)
      .join(", ")}. Redistribua as proposições: nenhuma sextilha pode ultrapassar seis versos mínimos.`;
  }

  if (stanzas.length >= 4) {
    const stanzaLoads = stanzas.map((stanza) => {
      const propositions = Array.isArray(stanza.proposicoes) ? stanza.proposicoes : [];
      return {
        propositions,
        lines: propositions.reduce(
          (sum, proposition) => sum + (minimumLines.get(proposition) || 1),
          0
        ),
        scene: propositions.length ? scenes.get(propositions[0]) : undefined,
      };
    });
    const mergeableThinStanzas = stanzaLoads.filter((stanza, index) => {
      if (stanza.lines >= 3 || !stanza.scene) return false;
      return [stanzaLoads[index - 1], stanzaLoads[index + 1]].some((neighbor) => {
        if (!neighbor || neighbor.scene !== stanza.scene) return false;
        const combinedLines = stanza.lines + neighbor.lines;
        const combinedPropositions =
          stanza.propositions.length + neighbor.propositions.length;
        return (
          combinedLines <= 6 &&
          !(combinedLines === 6 && combinedPropositions <= 2)
        );
      });
    });
    const thinStanzas = stanzaLoads.filter((stanza) => stanza.lines < 3);
    if (mergeableThinStanzas.length) {
      return "O projeto deixou uma estrofe semanticamente curta que cabe com segurança numa estrofe vizinha da mesma cena. Faça essa fusão sem atravessar a fronteira de cena.";
    }
    if (thinStanzas.length > Math.max(1, Math.floor(stanzas.length / 4))) {
      return "O projeto ficou esparso e forçaria repetição poética. Combine estrofes com menos de duas proposições quando a fonte não oferecer seis movimentos semânticos distintos.";
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const meaningMap = requireMeaningMap(body?.meaningMap);
    const compactMap = compactMeaningMap(meaningMap);
    const level1 = extractLevel(compactMap, 1);
    const level2 = extractLevel(compactMap, 2);
    const level3 = extractLevel(compactMap, 3);

    const missing = [
      !level1 ? "Nível 1" : null,
      !level2 ? "Nível 2" : null,
      !level3 ? "Nível 3" : null,
    ].filter(Boolean);

    if (missing.length) {
      return NextResponse.json(
        {
          error: `Não foi possível localizar ${missing.join(", ")} no Mapa de Significado. Use títulos como "Level 1" ou "Nível 1".`,
        },
        { status: 400 }
      );
    }

    const sourceConstraints = deriveSourceConstraints(level3 as string);
    const constraintDescription = describeSourceConstraints(
      sourceConstraints.minimumLines,
      sourceConstraints.scenes
    );
    const planningInput = `${constraintDescription}\n\nNÍVEL 1 — FORMA\n${level1}\n\nNÍVEL 2 — CENAS\n${level2}\n\nNÍVEL 3 — PROPOSIÇÕES\n${level3}`;
    let result = await callOpenAIJSON<PlanData>({
      role: "planner",
      instructions: PLAN_SYSTEM,
      input: planningInput,
      schemaName: "projeto_de_cordel",
      schema: PLAN_SCHEMA,
      maxOutputTokens: 12000,
      reasoningEffort: "medium",
    });

    for (let revision = 1; revision <= 2; revision += 1) {
      const issue = getPlanIssue(
        result.data,
        sourceConstraints.minimumLines,
        sourceConstraints.scenes
      );
      if (!issue) break;
      result = await callOpenAIJSON<PlanData>({
        role: "planner",
        instructions: PLAN_SYSTEM,
        input: `O PROJETO ANTERIOR NÃO CABE NATURALMENTE EM SEXTILHAS. ${issue} Refaça a distribuição, preserve toda a cobertura e o arco e recalcule versos_minimos.\n\nPROJETO ANTERIOR\n${JSON.stringify(
          result.data,
          null,
          2
        )}\n\n${planningInput}`,
        schemaName: `projeto_de_cordel_rebalanceado_${revision}`,
        schema: PLAN_SCHEMA,
        maxOutputTokens: 12000,
        reasoningEffort: "medium",
      });
    }

    const remainingIssue = getPlanIssue(
      result.data,
      sourceConstraints.minimumLines,
      sourceConstraints.scenes
    );
    if (remainingIssue) {
      throw new Error(`O planejamento não conseguiu equilibrar as sextilhas. ${remainingIssue}`);
    }

    return NextResponse.json({ plan: result.data, model: result.model });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno no planejamento.";
    console.error("Plan error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
