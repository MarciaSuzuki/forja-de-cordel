import { NextRequest, NextResponse } from "next/server";
import { LOCAL_SUGGESTIONS_SCHEMA } from "@/lib/ai-schemas";
import { compactMeaningMap, extractLevel } from "@/lib/extract";
import { callOpenAIJSON } from "@/lib/openai";
import { LOCAL_SUGGEST_SYSTEM } from "@/lib/prompts";
import { requireCordel, requireMeaningMap } from "@/lib/request-validation";

export const maxDuration = 120;

interface CordelStanza extends Record<string, unknown> {
  numero: number;
  versos: string[];
}

interface CordelShape extends Record<string, unknown> {
  estrofes?: CordelStanza[];
}

interface PlanShape extends Record<string, unknown> {
  estrutura?: Record<string, unknown>;
  guia_de_linguagem?: Record<string, unknown>;
  estrofes?: Array<
    Record<string, unknown> & {
      numero?: number;
      proposicoes?: number[];
    }
  >;
}

interface LocalSuggestion {
  versos: string[];
  justificativa: string;
  observacao_metrica: string;
  observacao_fidelidade: string;
}

interface LocalSuggestionResponse {
  alternativas: LocalSuggestion[];
}

function selectPropositionBlocks(level3: string, targetPropositions: number[]) {
  const targets = new Set(targetPropositions);
  return level3
    .split(/(?=(?:Proposition|Proposição)\s+\d+\s)/i)
    .filter((block) => {
      const proposition = Number(
        block.match(/^(?:Proposition|Proposição)\s+(\d+)/i)?.[1]
      );
      return targets.has(proposition);
    })
    .join("\n\n")
    .trim();
}

function selectedVerseNumbers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map(Number)
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 6)
    )
  ).sort((a, b) => a - b);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cordel = requireCordel(body?.cordel) as CordelShape;
    const meaningMap = requireMeaningMap(body?.meaningMap);
    const stanzaNumber = Number(body?.stanzaNumber);
    const verseNumbers = selectedVerseNumbers(body?.verseNumbers);

    if (!Number.isInteger(stanzaNumber) || stanzaNumber < 1) {
      return NextResponse.json({ error: "Estrofe inválida para as sugestões." }, { status: 400 });
    }
    if (verseNumbers.length < 1 || verseNumbers.length > 2) {
      return NextResponse.json(
        { error: "Selecione um ou dois versos para pedir sugestões." },
        { status: 400 }
      );
    }

    const stanzas = Array.isArray(cordel.estrofes) ? cordel.estrofes : [];
    const stanza = stanzas.find((item) => item.numero === stanzaNumber);
    if (!stanza || !Array.isArray(stanza.versos) || stanza.versos.length !== 6) {
      return NextResponse.json(
        { error: `A estrofe ${stanzaNumber} não foi localizada como sextilha.` },
        { status: 400 }
      );
    }

    const compactMap = compactMeaningMap(meaningMap);
    const level1 = extractLevel(compactMap, 1);
    const level3 = extractLevel(compactMap, 3);
    const plan = body?.plan && typeof body.plan === "object" ? (body.plan as PlanShape) : null;
    const stanzaPlan = (plan?.estrofes || []).find((item) => item.numero === stanzaNumber) || null;
    const targetPropositions = Array.isArray(stanzaPlan?.proposicoes)
      ? stanzaPlan.proposicoes
      : [];
    const targetedSource = level3
      ? selectPropositionBlocks(level3, targetPropositions)
      : "";
    const semanticSource = targetedSource || level3 || compactMap;
    const analysis =
      body?.analysis && typeof body.analysis === "object"
        ? (body.analysis as Record<string, unknown>)
        : {};
    const filterByStanza = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item) => {
            if (!item || typeof item !== "object") return false;
            const number = Number((item as Record<string, unknown>).estrofe);
            return number === 0 || number === stanzaNumber;
          })
        : [];
    const formalReadings = Array.isArray(analysis.estrofes)
      ? analysis.estrofes.filter(
          (item) =>
            item &&
            typeof item === "object" &&
            Number((item as Record<string, unknown>).numero) === stanzaNumber
        )
      : [];
    const translatorGoal =
      typeof body?.translatorGoal === "string"
        ? body.translatorGoal.trim().slice(0, 1000)
        : "";

    const currentSelection = verseNumbers.map((number) => ({
      numero: number,
      texto: stanza.versos[number - 1],
    }));
    const input = `ESTROFE COMPLETA\n${JSON.stringify(
      stanza,
      null,
      2
    )}\n\nVERSOS SELECIONADOS PELO TRADUTOR\n${JSON.stringify(
      currentSelection,
      null,
      2
    )}\n\nMETA ESCRITA PELO TRADUTOR\n${
      translatorGoal || "Nenhuma meta adicional; melhore a solução com base na auditoria."
    }\n\nPLANO DESTA ESTROFE\n${JSON.stringify(
      stanzaPlan,
      null,
      2
    )}\n\nRESTRIÇÕES GLOBAIS\n${JSON.stringify(
      {
        assimetrias: plan?.estrutura?.assimetrias || [],
        evitar: plan?.guia_de_linguagem?.evitar || [],
      },
      null,
      2
    )}\n\nAUDITORIA RELACIONADA\n${JSON.stringify(
      {
        forma: formalReadings,
        fidelidade: filterByStanza(analysis.fidelidade),
        adicoes: filterByStanza(analysis.adicoes),
        problemas: filterByStanza(analysis.problemas),
      },
      null,
      2
    )}\n\nFORMA GLOBAL\n${level1 || "Não informada."}\n\nPROPOSIÇÕES AUTORIZADAS — FONTE EXCLUSIVA\n${semanticSource}`;

    const result = await callOpenAIJSON<LocalSuggestionResponse>({
      role: "reviser",
      instructions: LOCAL_SUGGEST_SYSTEM,
      input,
      schemaName: `sugestoes_estrofe_${stanzaNumber}`,
      schema: LOCAL_SUGGESTIONS_SCHEMA,
      maxOutputTokens: 5_000,
      reasoningEffort: "medium",
      requestTimeoutMs: 90_000,
    });

    const alternatives = Array.isArray(result.data.alternativas)
      ? result.data.alternativas
      : [];
    if (
      alternatives.length !== 3 ||
      alternatives.some(
        (alternative) =>
          !Array.isArray(alternative.versos) ||
          alternative.versos.length !== verseNumbers.length ||
          alternative.versos.some((verse) => !verse.trim())
      )
    ) {
      throw new Error("A IA não retornou três sugestões compatíveis com a seleção.");
    }
    const originalKey = currentSelection
      .map((item) => item.texto.trim().toLocaleLowerCase("pt-BR"))
      .join("\n");
    const alternativeKeys = alternatives.map((alternative) =>
      alternative.versos
        .map((verse) => verse.trim().toLocaleLowerCase("pt-BR"))
        .join("\n")
    );
    if (
      new Set(alternativeKeys).size !== alternatives.length ||
      alternativeKeys.some((key) => key === originalKey)
    ) {
      throw new Error("A IA não produziu três alternativas realmente distintas.");
    }

    return NextResponse.json({
      alternatives,
      stanzaNumber,
      verseNumbers,
      model: result.model,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro interno ao gerar sugestões.";
    console.error("Suggest error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
