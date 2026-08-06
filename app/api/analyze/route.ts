import { NextRequest, NextResponse } from "next/server";
import { FIDELITY_ANALYSIS_SCHEMA, FORM_ANALYSIS_SCHEMA } from "@/lib/ai-schemas";
import { compactMeaningMap } from "@/lib/extract";
import { callOpenAIJSON } from "@/lib/openai";
import { FIDELITY_ANALYZE_SYSTEM, FORM_ANALYZE_SYSTEM } from "@/lib/prompts";
import { requireCordel, requireMeaningMap } from "@/lib/request-validation";

export const maxDuration = 300;

interface CordelStanza extends Record<string, unknown> {
  numero: number;
  versos: string[];
}

interface CordelShape extends Record<string, unknown> {
  estrofes?: CordelStanza[];
}

interface VerseAudit {
  texto: string;
  escansao: string;
  silabas: number;
  correto: boolean;
}

interface StanzaAudit {
  numero: number;
  versos: VerseAudit[];
  rima_palavras: string[];
  rima_ok: boolean;
  oralidade_ok: boolean;
  nota_poetica: string;
}

interface AuditProblem {
  tipo: string;
  prioridade: string;
  estrofe: number;
  verso: number;
  trecho: string;
  descricao: string;
  instrucao_de_correcao: string;
}

interface FormalAudit {
  estrofes?: StanzaAudit[];
  problemas?: AuditProblem[];
}

interface FidelityItem {
  proposicao: number;
  resumo: string;
  status: "PRESENTE" | "PARCIAL" | "AUSENTE";
  estrofe: number;
  evidencia: string;
  nota: string;
}

interface SemanticAddition {
  texto: string;
  estrofe: number;
  verso: number;
  avaliacao: string;
}

interface FidelityAudit {
  parecer?: string;
  fidelidade?: FidelityItem[];
  adicoes?: SemanticAddition[];
  problemas?: AuditProblem[];
}

function chunkStanzas(stanzas: CordelStanza[], size: number) {
  return Array.from({ length: Math.ceil(stanzas.length / size) }, (_, index) =>
    stanzas.slice(index * size, index * size + size)
  );
}

function mergeFormalStanzaAudits(audits: StanzaAudit[]) {
  const first = audits[0];
  return {
    ...first,
    versos: first.versos.map((verse, index) => {
      const readings = audits.map((audit) => audit.versos[index]).filter(Boolean);
      return readings.find((reading) => !reading.correto) || verse;
    }),
    rima_palavras: first.rima_palavras,
    rima_ok: audits.every((audit) => audit.rima_ok),
    oralidade_ok: audits.every((audit) => audit.oralidade_ok),
    nota_poetica: Array.from(
      new Set(audits.map((audit) => audit.nota_poetica).filter(Boolean))
    ).join(" "),
  };
}

function mergeFormalProblems(results: FormalAudit[]) {
  return Array.from(
    new Map(
      results
        .flatMap((result) => result.problemas || [])
        .map((problem) => [
          `${problem.tipo}:${problem.estrofe}:${problem.verso}:${problem.trecho
            .trim()
            .toLocaleLowerCase("pt-BR")}`,
          problem,
        ])
    ).values()
  );
}

const FIDELITY_SEVERITY: Record<FidelityItem["status"], number> = {
  PRESENTE: 0,
  PARCIAL: 1,
  AUSENTE: 2,
};

function mergeFidelityAudits(audits: FidelityAudit[]) {
  const byProposition = new Map<number, FidelityItem>();
  for (const item of audits.flatMap((audit) => audit.fidelidade || [])) {
    const current = byProposition.get(item.proposicao);
    if (!current || FIDELITY_SEVERITY[item.status] > FIDELITY_SEVERITY[current.status]) {
      byProposition.set(item.proposicao, item);
    }
  }

  const additions: SemanticAddition[] = [];
  for (const addition of audits.flatMap((audit) => audit.adicoes || [])) {
    const normalized = addition.texto.trim().toLocaleLowerCase("pt-BR");
    const duplicateIndex = additions.findIndex((current) => {
      if (current.estrofe !== addition.estrofe || current.verso !== addition.verso) {
        return false;
      }
      const currentText = current.texto.trim().toLocaleLowerCase("pt-BR");
      return currentText.includes(normalized) || normalized.includes(currentText);
    });
    if (duplicateIndex < 0) {
      additions.push(addition);
    } else if (addition.texto.length > additions[duplicateIndex].texto.length) {
      additions[duplicateIndex] = addition;
    }
  }
  const problems = Array.from(
    new Map(
      audits
        .flatMap((audit) => audit.problemas || [])
        .map((problem) => [
          `${problem.tipo}:${problem.estrofe}:${problem.verso}:${problem.trecho
            .trim()
            .toLocaleLowerCase("pt-BR")}`,
          problem,
        ])
    ).values()
  );
  const fidelity = Array.from(byProposition.values()).sort(
    (a, b) => a.proposicao - b.proposicao
  );
  const present = fidelity.filter((item) => item.status === "PRESENTE").length;
  const partial = fidelity.filter((item) => item.status === "PARCIAL").length;
  const absent = fidelity.filter((item) => item.status === "AUSENTE").length;

  return {
    parecer: `Duas leituras independentes foram combinadas pelo critério mais rigoroso: ${present} proposição(ões) presente(s), ${partial} parcial(is), ${absent} ausente(s) e ${additions.length} adição(ões). Consulte os itens abaixo para os trechos e as correções necessárias.`,
    fidelidade: fidelity,
    adicoes: additions,
    problemas: problems,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cordel = requireCordel(body?.cordel) as CordelShape;
    const meaningMap = requireMeaningMap(body?.meaningMap || body?.propositions);
    const compactMap = compactMeaningMap(meaningMap);
    const stanzas = Array.isArray(cordel.estrofes) ? cordel.estrofes : [];
    if (!stanzas.length) {
      return NextResponse.json({ error: "O cordel não contém estrofes para analisar." }, { status: 400 });
    }

    const formalPromises = chunkStanzas(stanzas, 2).flatMap((batch, index) =>
      [1, 2].map((reading) =>
        callOpenAIJSON<FormalAudit>({
          role: "analyzer",
          instructions: FORM_ANALYZE_SYSTEM,
          input: `ESTROFES PARA AUDITORIA FORMAL\n${JSON.stringify(batch, null, 2)}`,
          schemaName: `auditoria_formal_lote_${index + 1}_leitura_${reading}`,
          schema: FORM_ANALYSIS_SCHEMA,
          maxOutputTokens: 7000,
          reasoningEffort: "medium",
        })
      )
    );
    const fidelityInput = `CORDEL A SER AUDITADO\n${JSON.stringify(
      cordel,
      null,
      2
    )}\n\nMAPA DE SIGNIFICADO COMPLETO\n${compactMap}`;
    const fidelityPromises = [1, 2].map((reading) =>
      callOpenAIJSON<FidelityAudit>({
        role: "analyzer",
        instructions: FIDELITY_ANALYZE_SYSTEM,
        input: fidelityInput,
        schemaName: `auditoria_de_fidelidade_${reading}`,
        schema: FIDELITY_ANALYSIS_SCHEMA,
        maxOutputTokens: 10000,
        reasoningEffort: "medium",
      })
    );

    const [formalResults, fidelityResults] = await Promise.all([
      Promise.all(formalPromises),
      Promise.all(fidelityPromises),
    ]);
    const formalAuditData = formalResults.map((result) => result.data);
    const formalByStanza = new Map<number, StanzaAudit[]>();
    for (const stanzaAudit of formalAuditData.flatMap((result) => result.estrofes || [])) {
      const readings = formalByStanza.get(stanzaAudit.numero) || [];
      readings.push(stanzaAudit);
      formalByStanza.set(stanzaAudit.numero, readings);
    }
    const stanzaAudits = Array.from(formalByStanza.values())
      .map(mergeFormalStanzaAudits)
      .sort((a, b) => a.numero - b.numero);
    const expectedNumbers = stanzas.map((stanza) => stanza.numero).sort((a, b) => a - b);
    const actualNumbers = stanzaAudits.map((stanza) => stanza.numero);
    if (
      actualNumbers.length !== expectedNumbers.length ||
      actualNumbers.some((number, index) => number !== expectedNumbers[index])
    ) {
      throw new Error("A auditoria formal terminou sem analisar todas as estrofes.");
    }

    const formalProblems = mergeFormalProblems(formalAuditData);
    const fidelityAudit = mergeFidelityAudits(fidelityResults.map((result) => result.data));
    const fidelity = fidelityAudit.fidelidade;
    const additions = fidelityAudit.adicoes;
    const problems = [...formalProblems, ...fidelityAudit.problemas];
    const verses = stanzaAudits.flatMap((stanza) => stanza.versos || []);
    const correctVerses = verses.filter((verse) => verse.correto).length;
    const correctRhymes = stanzaAudits.filter((stanza) => stanza.rima_ok).length;
    const presentPropositions = fidelity.filter((item) => item.status === "PRESENTE").length;
    const oralidadeOk = stanzaAudits.every((stanza) => stanza.oralidade_ok);
    const qualidadePoeticaOk = !problems.some((problem) => problem.tipo === "QUALIDADE");
    const approved =
      correctVerses === verses.length &&
      correctRhymes === stanzaAudits.length &&
      presentPropositions === fidelity.length &&
      additions.length === 0 &&
      problems.length === 0 &&
      oralidadeOk &&
      qualidadePoeticaOk;

    const analysis = {
      resumo: {
        aprovado: approved,
        parecer:
          fidelityAudit.parecer ||
          (approved
            ? "O cordel atende aos critérios formais e de fidelidade."
            : "A auditoria encontrou pontos que precisam de lapidação."),
        versos_corretos: correctVerses,
        versos_totais: verses.length,
        estrofes_com_rima: correctRhymes,
        estrofes_totais: stanzaAudits.length,
        proposicoes_presentes: presentPropositions,
        proposicoes_totais: fidelity.length,
        oralidade_ok: oralidadeOk,
        qualidade_poetica_ok: qualidadePoeticaOk,
      },
      estrofes: stanzaAudits,
      fidelidade: fidelity,
      adicoes: additions,
      problemas: problems,
    };
    const model = Array.from(
      new Set([
        ...formalResults.map((result) => result.model),
        ...fidelityResults.map((result) => result.model),
      ])
    ).join(" + ");

    return NextResponse.json({ analysis, model });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno na análise.";
    console.error("Analyze error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
