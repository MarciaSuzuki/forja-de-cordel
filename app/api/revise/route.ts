import { NextRequest, NextResponse } from "next/server";
import {
  CORDEL_SCHEMA,
  FORM_ANALYSIS_SCHEMA,
  REVISION_SELECTION_SCHEMA,
} from "@/lib/ai-schemas";
import { compactMeaningMap, extractLevel } from "@/lib/extract";
import { callOpenAIJSON } from "@/lib/openai";
import {
  FORM_ANALYZE_SYSTEM,
  REVISE_SYSTEM,
  REVISION_JUDGE_SYSTEM,
} from "@/lib/prompts";
import { requireCordel, requireMeaningMap } from "@/lib/request-validation";

export const maxDuration = 300;

interface CordelStanza extends Record<string, unknown> {
  numero: number;
  versos: string[];
}

interface CordelShape extends Record<string, unknown> {
  titulo?: string;
  estrofes?: CordelStanza[];
}

interface AuditProblem extends Record<string, unknown> {
  tipo?: string;
  estrofe?: number;
  verso?: number;
  trecho?: string;
  descricao?: string;
}

interface FidelityItem extends Record<string, unknown> {
  proposicao?: number;
  status?: string;
  estrofe?: number;
  evidencia?: string;
}

interface SemanticAddition extends Record<string, unknown> {
  estrofe?: number;
  verso?: number;
}

interface AnalysisShape extends Record<string, unknown> {
  resumo?: Record<string, unknown> & { aprovado?: boolean };
  estrofes?: Array<Record<string, unknown> & { numero?: number }>;
  fidelidade?: FidelityItem[];
  adicoes?: SemanticAddition[];
  problemas?: AuditProblem[];
}

interface PlanCoverage extends Record<string, unknown> {
  proposicao?: number;
  estrofes_planejadas?: number[];
}

interface PlanShape extends Record<string, unknown> {
  estrutura?: Record<string, unknown>;
  guia_de_linguagem?: Record<string, unknown>;
  cobertura?: PlanCoverage[];
  estrofes?: Array<
    Record<string, unknown> & {
      numero?: number;
      proposicoes?: number[];
    }
  >;
}

interface RevisedBatch {
  estrofes?: CordelStanza[];
}

interface RevisionSelection {
  escolha: number;
  parecer: string;
  problemas_restantes: string[];
}

interface CandidateFormalAudit {
  estrofes?: Array<Record<string, unknown> & { numero?: number }>;
  problemas?: AuditProblem[];
}

function chunkCandidates(candidates: CordelStanza[], size: number) {
  return Array.from({ length: Math.ceil(candidates.length / size) }, (_, index) =>
    candidates.slice(index * size, index * size + size)
  );
}

function formalGateStatus(
  audits: CandidateFormalAudit[],
  optionIndex: number
) {
  const temporaryNumber = optionIndex + 1;
  const readings = audits.flatMap((audit) =>
    (audit.estrofes || []).filter((item) => item.numero === temporaryNumber)
  );
  const problems = audits.flatMap((audit) =>
    (audit.problemas || []).filter((problem) => problem.estrofe === temporaryNumber)
  );
  const approved =
    readings.length >= 2 &&
    problems.length === 0 &&
    readings.every((reading) => {
      const verses = Array.isArray(reading.versos)
        ? (reading.versos as Array<Record<string, unknown>>)
        : [];
      return (
        verses.length === 6 &&
        verses.every((verse) => verse.correto === true) &&
        reading.rima_ok === true &&
        reading.oralidade_ok === true
      );
    });
  return {
    opcao: optionIndex,
    status: approved ? "APROVADA_EM_TODAS_AS_LEITURAS" : "REPROVADA_OU_INCONCLUSIVA",
    leituras_recebidas: readings.length,
    problemas: problems,
  };
}

function plannedTargets(plan: PlanShape | null, proposition: number | undefined) {
  if (!plan || typeof proposition !== "number" || !Array.isArray(plan.cobertura)) return [];
  const coverage = plan.cobertura.find((item) => item.proposicao === proposition);
  return Array.isArray(coverage?.estrofes_planejadas) ? coverage.estrofes_planejadas : [];
}

function problemProposition(problem: AuditProblem) {
  const text = `${problem.trecho || ""} ${problem.descricao || ""}`;
  const match = text.match(/proposi(?:ção|cao)\s*(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function selectPropositionBlocks(level3: string, targetPropositions: number[]) {
  const targets = new Set(targetPropositions);
  return level3
    .split(/(?=Proposition\s+\d+\s)/i)
    .filter((block) => {
      const proposition = Number(block.match(/^Proposition\s+(\d+)/i)?.[1]);
      return targets.has(proposition);
    })
    .join("\n\n")
    .trim();
}

const PROBLEMS_THAT_NEED_CONTEXT = new Set([
  "FIDELIDADE",
  "ADICAO",
  "ORALIDADE",
  "QUALIDADE",
]);

function addVerseWithContext(
  allowedVerses: Set<number>,
  verse: number,
  includePairedVerse: boolean
) {
  allowedVerses.add(verse);
  if (!includePairedVerse) return;
  const pairedVerse = verse % 2 === 0 ? verse - 1 : verse + 1;
  if (pairedVerse >= 1 && pairedVerse <= 6) allowedVerses.add(pairedVerse);
}

function versesQuotedInEvidence(stanza: CordelStanza, evidence: string | undefined) {
  if (!evidence) return [];
  return stanza.versos.flatMap((verse, index) =>
    evidence.includes(verse) ? [index + 1] : []
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cordel = requireCordel(body?.cordel) as CordelShape;
    const meaningMap = requireMeaningMap(body?.meaningMap || body?.propositions);
    const compactMap = compactMeaningMap(meaningMap);
    const level1 = extractLevel(compactMap, 1);
    const level3 = extractLevel(compactMap, 3);
    if (!body?.analysis || typeof body.analysis !== "object") {
      return NextResponse.json({ error: "Auditoria não informada para a revisão." }, { status: 400 });
    }

    const analysis = body.analysis as AnalysisShape;
    const plan = body?.plan && typeof body.plan === "object" ? (body.plan as PlanShape) : null;
    const stanzas = Array.isArray(cordel.estrofes) ? cordel.estrofes : [];
    if (!stanzas.length) {
      return NextResponse.json({ error: "O cordel não contém estrofes para revisar." }, { status: 400 });
    }

    const targetNumbers = new Set<number>();
    for (const problem of analysis.problemas || []) {
      if (typeof problem.estrofe === "number" && problem.estrofe > 0) {
        targetNumbers.add(problem.estrofe);
        continue;
      }
      for (const target of plannedTargets(plan, problemProposition(problem))) {
        targetNumbers.add(target);
      }
    }
    for (const addition of analysis.adicoes || []) {
      if (typeof addition.estrofe === "number" && addition.estrofe > 0) {
        targetNumbers.add(addition.estrofe);
      }
    }
    for (const item of analysis.fidelidade || []) {
      if (item.status === "PRESENTE") continue;
      if (typeof item.estrofe === "number" && item.estrofe > 0) {
        targetNumbers.add(item.estrofe);
      } else {
        for (const target of plannedTargets(plan, item.proposicao)) {
          targetNumbers.add(target);
        }
      }
    }

    if (!targetNumbers.size && analysis.resumo?.aprovado === false) {
      stanzas.forEach((stanza) => targetNumbers.add(stanza.numero));
    }

    const revisionTargets = stanzas.filter((stanza) => targetNumbers.has(stanza.numero));
    if (!revisionTargets.length) {
      return NextResponse.json({ cordel, model: "sem revisão necessária" });
    }

    const results = await Promise.all(
      revisionTargets.map(async (stanza) => {
        const mappedGlobalFidelity = (analysis.fidelidade || []).filter(
          (item) =>
            item.status !== "PRESENTE" &&
            item.estrofe === 0 &&
            plannedTargets(plan, item.proposicao).includes(stanza.numero)
        );
        const stanzaAnalysis = {
          resumo: analysis.resumo || {},
          estrofes: (analysis.estrofes || []).filter((item) => item.numero === stanza.numero),
          fidelidade: [
            ...(analysis.fidelidade || []).filter((item) => item.estrofe === stanza.numero),
            ...mappedGlobalFidelity,
          ],
          adicoes: (analysis.adicoes || []).filter((item) => item.estrofe === stanza.numero),
          problemas: (analysis.problemas || []).filter(
            (problem) =>
              problem.estrofe === stanza.numero ||
              (problem.estrofe === 0 &&
                plannedTargets(plan, problemProposition(problem)).includes(stanza.numero))
          ),
        };
        const stanzaPlan = (plan?.estrofes || []).find((item) => item.numero === stanza.numero) || null;
        const stanzaPropositions =
          level3 && Array.isArray(stanzaPlan?.proposicoes)
            ? selectPropositionBlocks(level3, stanzaPlan.proposicoes)
            : "";
        const semanticSource = stanzaPropositions || compactMap;
        const allowedVerses = new Set<number>();
        let allowWholeStanza = false;
        for (const problem of stanzaAnalysis.problemas) {
          if (!problem.verso || problem.verso < 1) {
            allowWholeStanza = true;
            break;
          }
          const quotedVerses = versesQuotedInEvidence(stanza, problem.trecho);
          if (
            PROBLEMS_THAT_NEED_CONTEXT.has(problem.tipo || "") &&
            quotedVerses.length > 1
          ) {
            quotedVerses.forEach((verse) => allowedVerses.add(verse));
          } else {
            addVerseWithContext(
              allowedVerses,
              problem.verso,
              PROBLEMS_THAT_NEED_CONTEXT.has(problem.tipo || "")
            );
          }
          if (problem.tipo === "RIMA") {
            [2, 4, 6].forEach((verse) =>
              addVerseWithContext(allowedVerses, verse, true)
            );
          }
        }
        for (const addition of stanzaAnalysis.adicoes) {
          if (addition.verso && addition.verso > 0) {
            addVerseWithContext(allowedVerses, addition.verso, true);
          } else {
            allowWholeStanza = true;
          }
        }
        for (const item of stanzaAnalysis.fidelidade) {
          if (item.status === "PRESENTE") continue;
          const evidenceVerses = versesQuotedInEvidence(stanza, item.evidencia);
          if (evidenceVerses.length) {
            evidenceVerses.forEach((verse) => allowedVerses.add(verse));
          }
        }
        if (
          stanzaAnalysis.fidelidade.some(
            (item) => item.status !== "PRESENTE" && item.estrofe === 0
          )
        ) {
          allowWholeStanza = true;
        }
        const editableVerses = allowWholeStanza
          ? [1, 2, 3, 4, 5, 6]
          : Array.from(allowedVerses).sort((a, b) => a - b);
        const revisionContext = `INSTRUÇÃO CIRÚRGICA\nRevise APENAS a estrofe ${stanza.numero}. Retorne somente essa estrofe e preserve literalmente todo verso não implicado nos problemas.\n\nESTROFE ATUAL\n${JSON.stringify(
            stanza,
            null,
            2
          )}\n\nVERSOS QUE PODEM SER REORGANIZADOS\n${editableVerses.join(
            ", "
          )}. Todos os demais devem ser copiados literalmente. Você pode redistribuir uma unidade semântica entre esses versos para obter uma oração completa e natural.\n\nPLANO DA ESTROFE\n${JSON.stringify(
            stanzaPlan,
            null,
            2
          )}\n\nRESTRIÇÕES GLOBAIS DO PROJETO\n${JSON.stringify(
            {
              assimetrias: plan?.estrutura?.assimetrias || [],
              evitar: plan?.guia_de_linguagem?.evitar || [],
            },
            null,
            2
          )}\n\nAUDITORIA DESTA ESTROFE\n${JSON.stringify(
            stanzaAnalysis,
            null,
            2
          )}\n\nFORMA GLOBAL — RESTRIÇÕES QUE PREVALECEM SOBRE RÓTULOS TÉCNICOS\n${
            level1 || "Não informada."
          }\n\nPROPOSIÇÕES DESTA ESTROFE — FONTE EXCLUSIVA\n${semanticSource}`;
        const generateCandidate = async ({
          label,
          reasoningEffort,
          requestTimeoutMs,
          maxOutputTokens,
          candidateCount,
        }: {
          label: string;
          reasoningEffort: "low" | "medium";
          requestTimeoutMs: number;
          maxOutputTokens: number;
          candidateCount: number;
        }) => {
          try {
            const result = await callOpenAIJSON<RevisedBatch>({
              role: "reviser",
              instructions: REVISE_SYSTEM,
              input: `ABORDAGEM DESTE GRUPO: ${label}\nProduza exatamente ${candidateCount} alternativa(s) para a mesma estrofe. ${
                candidateCount > 1
                  ? "Elas devem ser realmente distintas, não apenas trocar pontuação ou uma palavra. Em pelo menos uma, descarte por completo a redação atual dos versos editáveis e reconstrua-os apenas a partir dos átomos semânticos da fonte. Se houver pivô contrastivo, dedique um verso livre somente ao pivô e, se útil, ao vocativo; o verso vizinho deve conter juntos a ação, seu objeto e todos os qualificadores exigidos, sem repetir o sujeito."
                  : "Faça uma correção cirúrgica, alterando apenas o indispensável e sem reutilizar o fragmento explicitamente reprovado."
              }\n\n${revisionContext}`,
              schemaName: `revisao_estrofe_${stanza.numero}_${reasoningEffort}`,
              schema: CORDEL_SCHEMA,
              maxOutputTokens,
              reasoningEffort,
              requestTimeoutMs,
            });
            const revised = Array.isArray(result.data.estrofes)
              ? result.data.estrofes
              : [];
            if (
              revised.length < 1 ||
              revised.length > candidateCount ||
              revised.some((item) => item.numero !== stanza.numero)
            ) {
              throw new Error(
                `A revisão da estrofe ${stanza.numero} retornou uma estrutura inválida.`
              );
            }
            const constrained = revised.map((item) =>
              allowWholeStanza
                ? item
                : {
                    ...item,
                    versos: item.versos.map((verse, index) =>
                      allowedVerses.has(index + 1) ? verse : stanza.versos[index]
                    ),
                  }
            );
            return { stanzas: constrained, model: result.model };
          } catch (error) {
            console.warn(`[revise:estrofe-${stanza.numero}] alternativa descartada`, {
              label,
              error,
            });
            return null;
          }
        };

        const generated = await Promise.all([
          generateCandidate({
            label: "máxima precisão semântica, com alterações mínimas",
            reasoningEffort: "medium",
            requestTimeoutMs: 100_000,
            maxOutputTokens: 10_000,
            candidateCount: 1,
          }),
          generateCandidate({
            label:
              "arquitetura de rima semântica: escolha primeiro três terminações distintas, sonoramente compatíveis e autorizadas pelas proposições para os versos 2, 4 e 6; componha esses versos; só então use os versos livres para completar a sintaxe e a cobertura, sem mudar nenhum fato",
            reasoningEffort: "medium",
            requestTimeoutMs: 110_000,
            maxOutputTokens: 12_000,
            candidateCount: 2,
          }),
        ]);
        const successful = generated.filter(
          (candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)
        );
        const initialCandidates = [
          stanza,
          ...successful.flatMap((candidate) => candidate.stanzas),
        ];
        const models = successful.map((candidate) => candidate.model);
        if (initialCandidates.length === 1) {
          return { stanza, model: models.join(" + ") || "alternativas indisponíveis" };
        }

        const numberedCandidates = initialCandidates.map((candidate, index) => ({
          ...candidate,
          numero: index + 1,
        }));
        const optionMapping = initialCandidates
          .map((_, index) => `${index + 1} = opção ${index}`)
          .join(", ");
        const preAuditResults = await Promise.allSettled(
          chunkCandidates(numberedCandidates, 2).flatMap((batch, batchIndex) =>
            [1, 2].map((reading) =>
              callOpenAIJSON<CandidateFormalAudit>({
                role: "analyzer",
                instructions: FORM_ANALYZE_SYSTEM,
                input: `OPÇÕES PARA PRÉ-AUDITORIA FORMAL\nNumeração temporária desta amostra; consulte o mapeamento global: ${optionMapping}.\n${JSON.stringify(
                  batch,
                  null,
                  2
                )}`,
                schemaName: `pre_auditoria_revisao_estrofe_${stanza.numero}_lote_${
                  batchIndex + 1
                }_leitura_${reading}`,
                schema: FORM_ANALYSIS_SCHEMA,
                maxOutputTokens: 7_000,
                reasoningEffort: "medium",
                requestTimeoutMs: 65_000,
              })
            )
          )
        );
        const formalPreAudits = preAuditResults.flatMap((result) => {
          if (result.status === "fulfilled") {
            models.push(result.value.model);
            return [result.value.data];
          }
          console.warn(`[revise:estrofe-${stanza.numero}] pré-auditoria indisponível`, {
            error: result.reason,
          });
          return [];
        });

        const formalGate = initialCandidates.map((_, index) =>
          formalGateStatus(formalPreAudits, index)
        );
        const eligibleSourceIndexes = formalGate
          .filter(
            (entry) =>
              entry.opcao > 0 && entry.status === "APROVADA_EM_TODAS_AS_LEITURAS"
          )
          .map((entry) => entry.opcao);
        if (!eligibleSourceIndexes.length) {
          return {
            stanza,
            model: Array.from(new Set(models)).join(" + ") ||
              "nenhuma alternativa passou pelo portão formal",
          };
        }
        const candidateSources = [0, ...eligibleSourceIndexes];
        const candidates = candidateSources.map((sourceIndex) =>
          initialCandidates[sourceIndex]
        );

        try {
          const selection = await callOpenAIJSON<RevisionSelection>({
            role: "analyzer",
            instructions: REVISION_JUDGE_SYSTEM,
            input: `ESTROFE ${stanza.numero} — OPÇÕES NUMERADAS\n${candidates
              .map(
                (candidate, index) =>
                  `OPÇÃO ${index} (opção-fonte ${candidateSources[index]})\n${JSON.stringify(
                    candidate,
                    null,
                    2
                  )}`
              )
              .join("\n\n")}\n\nPLANO E RESTRIÇÕES\n${JSON.stringify(
              stanzaPlan,
              null,
              2
            )}\n\nPRÉ-AUDITORIA FORMAL DAS OPÇÕES\n${
              formalPreAudits.length
                ? `Duas leituras foram solicitadas. Os números de estrofe são temporários: ${optionMapping}. Trate qualquer divergência como sinal de métrica frágil e prefira uma opção inequívoca na fala natural.\n${JSON.stringify(
                    formalPreAudits,
                    null,
                    2
                  )}`
                : "Indisponível; faça a escansão completa antes de escolher."
            }\n\nRESULTADO DETERMINÍSTICO DO PORTÃO FORMAL\n${JSON.stringify(
              formalGate,
              null,
              2
            )}\nAs revisões REPROVADA_OU_INCONCLUSIVA já foram excluídas. Escolha somente entre as opções restantes, sem presumir que aprovação formal garante fidelidade semântica.\n\nAUDITORIA A RESOLVER\n${JSON.stringify(
              stanzaAnalysis,
              null,
              2
            )}\n\nFORMA GLOBAL — RESTRIÇÕES QUE PREVALECEM SOBRE RÓTULOS TÉCNICOS\n${
              level1 || "Não informada."
            }\n\nPROPOSIÇÕES — FONTE EXCLUSIVA\n${semanticSource}`,
            schemaName: `selecao_revisao_estrofe_${stanza.numero}`,
            schema: REVISION_SELECTION_SCHEMA,
            maxOutputTokens: 4_000,
            reasoningEffort: "medium",
            requestTimeoutMs: 65_000,
          });
          const selected = candidates[selection.data.escolha] || stanza;
          return {
            stanza: selected,
            model: Array.from(new Set([...models, selection.model].filter(Boolean))).join(
              " + "
            ),
          };
        } catch (error) {
          console.warn(`[revise:estrofe-${stanza.numero}] juiz indisponível`, { error });
          return { stanza, model: models.join(" + ") || "juiz indisponível" };
        }
      })
    );

    const replacements = new Map(results.map((result) => [result.stanza.numero, result.stanza]));
    const revisedCordel = {
      ...cordel,
      titulo: cordel.titulo || "Cordel",
      estrofes: stanzas.map((stanza) => replacements.get(stanza.numero) || stanza),
    };
    const model = Array.from(new Set(results.map((result) => result.model))).join(" + ");

    return NextResponse.json({ cordel: revisedCordel, model });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno na revisão.";
    console.error("Revise error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
