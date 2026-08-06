import { NextRequest, NextResponse } from "next/server";
import { CORDEL_SCHEMA } from "@/lib/ai-schemas";
import { compactMeaningMap, extractLevel } from "@/lib/extract";
import { callOpenAIJSON } from "@/lib/openai";
import { COMPOSE_SYSTEM } from "@/lib/prompts";
import { requireMeaningMap } from "@/lib/request-validation";

export const maxDuration = 300;

interface PlannedStanza extends Record<string, unknown> {
  numero?: number;
  proposicoes?: number[];
}

interface CompositionPlan extends Record<string, unknown> {
  titulo_provisorio?: string;
  estrutura?: Record<string, unknown> & { total_estrofes?: number };
  cobertura?: Array<Record<string, unknown> & { proposicao?: number }>;
  estrofes?: PlannedStanza[];
}

interface ComposedStanza extends Record<string, unknown> {
  numero: number;
  versos: string[];
}

interface ComposedBatch {
  titulo?: string;
  estrofes?: ComposedStanza[];
}

function chunkStanzas(stanzas: PlannedStanza[], size: number) {
  return Array.from({ length: Math.ceil(stanzas.length / size) }, (_, index) =>
    stanzas.slice(index * size, index * size + size)
  );
}

function selectPropositionBlocks(level3: string, targetPropositions: Set<number>) {
  return level3
    .split(/(?=Proposition\s+\d+\s)/i)
    .filter((block) => {
      const proposition = Number(block.match(/^Proposition\s+(\d+)/i)?.[1]);
      return targetPropositions.has(proposition);
    })
    .join("\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const meaningMap = requireMeaningMap(body?.meaningMap);
    const compactMap = compactMeaningMap(meaningMap);
    if (!body?.plan || typeof body.plan !== "object") {
      return NextResponse.json({ error: "Projeto de composição não informado." }, { status: 400 });
    }
    const plan = body.plan as CompositionPlan;
    const plannedStanzas = Array.isArray(plan.estrofes) ? plan.estrofes : [];
    if (
      !plannedStanzas.length ||
      plannedStanzas.some((stanza) => !Number.isInteger(stanza.numero))
    ) {
      return NextResponse.json(
        { error: "O projeto de composição não contém estrofes numeradas válidas." },
        { status: 400 }
      );
    }

    const propositions = extractLevel(compactMap, 3);
    if (!propositions) {
      return NextResponse.json(
        { error: "Não foi possível localizar o Nível 3 no Mapa de Significado." },
        { status: 400 }
      );
    }

    // Two stanzas give the model enough poetic context while parallel batches
    // keep the complete composition below the serverless timeout.
    const batches = chunkStanzas(plannedStanzas, 2);
    const results = await Promise.all(
      batches.map(async (targetStanzas, index) => {
        const targetNumbers = targetStanzas.map((stanza) => stanza.numero as number);
        const targetPropositions = new Set(
          targetStanzas.flatMap((stanza) =>
            Array.isArray(stanza.proposicoes) ? stanza.proposicoes : []
          )
        );
        const batchPlan: CompositionPlan = {
          ...plan,
          estrutura: {
            ...(plan.estrutura || {}),
            total_estrofes: targetStanzas.length,
          },
          cobertura: Array.isArray(plan.cobertura)
            ? plan.cobertura.filter(
                (item) =>
                  typeof item.proposicao === "number" &&
                  targetPropositions.has(item.proposicao)
              )
            : [],
          estrofes: targetStanzas,
        };
        const batchPropositions = selectPropositionBlocks(
          propositions,
          targetPropositions
        );

        const input = `INSTRUÇÃO DE LOTE\nO cordel completo terá ${plannedStanzas.length} estrofes. Componha APENAS as estrofes de número ${targetNumbers.join(
            ", "
          )}, mantendo sua posição no arco global. Não produza nenhuma outra estrofe.\n\nPROJETO DESTE LOTE\n${JSON.stringify(
            batchPlan,
            null,
            2
          )}\n\nPROPOSIÇÕES DESTE LOTE — FONTE EXCLUSIVA\n${batchPropositions}`;
        const request = (reasoningEffort: "medium" | "low", requestTimeoutMs: number) =>
          callOpenAIJSON<ComposedBatch>({
            role: "composer",
            instructions: COMPOSE_SYSTEM,
            input,
            schemaName: `cordel_lote_${index + 1}`,
            schema: CORDEL_SCHEMA,
            maxOutputTokens: 10000,
            reasoningEffort,
            requestTimeoutMs,
          });

        let result;
        try {
          result = await request("medium", 170_000);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!/excedeu|incompleta:\s*max_output_tokens/i.test(message)) throw error;
          console.warn(`[compose:lote-${index + 1}] repetindo com raciocínio baixo`, {
            reason: message,
          });
          result = await request("low", 105_000);
        }

        const composedStanzas = Array.isArray(result.data.estrofes)
          ? result.data.estrofes
          : [];
        const actualNumbers = composedStanzas.map((stanza) => stanza.numero).sort((a, b) => a - b);
        const sortedTargets = [...targetNumbers].sort((a, b) => a - b);
        if (
          actualNumbers.length !== sortedTargets.length ||
          actualNumbers.some((number, stanzaIndex) => number !== sortedTargets[stanzaIndex])
        ) {
          throw new Error(
            `O lote ${index + 1} não retornou exatamente as estrofes ${sortedTargets.join(", ")}.`
          );
        }

        return { ...result, composedStanzas };
      })
    );

    const expectedNumbers = plannedStanzas
      .map((stanza) => stanza.numero as number)
      .sort((a, b) => a - b);
    const composedStanzas = results
      .flatMap((result) => result.composedStanzas)
      .sort((a, b) => a.numero - b.numero);
    const actualNumbers = composedStanzas.map((stanza) => stanza.numero);

    if (
      actualNumbers.length !== expectedNumbers.length ||
      actualNumbers.some((number, index) => number !== expectedNumbers[index])
    ) {
      throw new Error("A composição em lotes terminou sem todas as estrofes planejadas.");
    }

    const cordel = {
      titulo:
        plan.titulo_provisorio ||
        results.find((result) => result.data.titulo)?.data.titulo ||
        "Cordel",
      estrofes: composedStanzas,
    };
    const model = Array.from(new Set(results.map((result) => result.model))).join(" + ");

    return NextResponse.json({ cordel, model });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno na composição.";
    console.error("Compose error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
