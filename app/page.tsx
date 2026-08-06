// app/page.tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  CordelBanner,
  XiloDivider,
} from "@/components/xilogravura";

// ── Types ──

interface Estrofe {
  numero: number;
  versos: string[];
  proposicoes_cobertas?: string;
  alteracao?: string;
}

interface CordelData {
  titulo?: string;
  estrofes: Estrofe[];
}

interface CompositionPlan {
  salmo: number;
  titulo_provisorio: string;
  sintese: string;
  estrutura: {
    total_estrofes: number;
    justificativa: string;
    arco_emocional: string;
    registro_temporal: string;
    contrastes: string[];
    assimetrias: string[];
  };
  guia_de_linguagem: {
    participantes: string[];
    lugares: string[];
    objetos: string[];
    imagens: string[];
    expressoes: string[];
    evitar: string[];
  };
  cobertura: Array<{
    proposicao: number;
    cena: number;
    resumo: string;
    versos_minimos: number;
    estrofes_planejadas: number[];
  }>;
  estrofes: Array<{
    numero: number;
    funcao: string;
    tom: string;
    proposicoes: number[];
    imagens: string[];
    palavras_chave: string[];
    restricoes: string[];
    rima_sugerida: string;
    roteiro_de_versos: string[];
  }>;
}

interface VersoAnalysis {
  texto: string;
  escansao: string;
  silabas: number;
  correto: boolean;
}

interface EstrofeAnalysis {
  numero: number;
  versos: VersoAnalysis[];
  rima_palavras: string[];
  rima_ok: boolean;
  oralidade_ok?: boolean;
  nota_poetica?: string;
}

interface FidelidadeItem {
  proposicao: number;
  status: "PRESENTE" | "PARCIAL" | "AUSENTE";
  estrofe?: number;
  resumo?: string;
  evidencia?: string;
  nota?: string;
}

interface Adicao {
  texto: string;
  estrofe: number;
  verso?: number;
  avaliacao: string;
}

interface AnalysisSummary {
  aprovado: boolean;
  parecer: string;
  versos_corretos: number;
  versos_totais: number;
  estrofes_com_rima: number;
  estrofes_totais: number;
  proposicoes_presentes: number;
  proposicoes_totais: number;
  oralidade_ok: boolean;
  qualidade_poetica_ok: boolean;
}

interface AnalysisProblem {
  tipo: "METRICA" | "RIMA" | "FIDELIDADE" | "ADICAO" | "ORALIDADE" | "QUALIDADE";
  prioridade: "ALTA" | "MEDIA" | "BAIXA";
  estrofe: number;
  verso: number;
  trecho: string;
  descricao: string;
  instrucao_de_correcao: string;
}

interface RecordedAudio {
  url: string;
  fileName: string;
  mimeType: string;
}

interface LocalSuggestionAlternative {
  versos: string[];
  justificativa: string;
  observacao_metrica: string;
  observacao_fidelidade: string;
}

interface StanzaSuggestions {
  verseIndexes: number[];
  alternatives: LocalSuggestionAlternative[];
  model: string;
}

type StanzaUndoHistory = Record<number, string[][]>;
type VerseSelections = Record<number, number[]>;
type StanzaSuggestionResults = Record<number, StanzaSuggestions>;
type StanzaTextState = Record<number, string>;
type StanzaOpenState = Record<number, boolean>;

const UNSPECIFIED_ADDITION_TEXT = "Trecho não especificado pela análise.";

interface AnalysisData {
  resumo?: AnalysisSummary;
  estrofes: EstrofeAnalysis[];
  fidelidade: FidelidadeItem[];
  adicoes: Adicao[];
  problemas: AnalysisProblem[];
}

type HistoryEntryType =
  | "origem"
  | "planejamento"
  | "composicao"
  | "analise"
  | "revisao"
  | "edicao"
  | "audio"
  | "catalogo";

interface HistoryEntry {
  id: number;
  momento: string;
  tipo: HistoryEntryType;
  titulo: string;
  detalhes: string[];
}

interface SavedPsalmRecord {
  salmo: number;
  modo: InputMode;
  status: string;
  salvoEm: string;
  analysisDirty: boolean;
  meaningMapText: string;
  simplifiedMeaningMapText?: string;
  compositionPlan?: CompositionPlan | null;
  workflowModels?: Record<string, string>;
  cordelData: CordelData;
  analysisData: AnalysisData | null;
  historyEntries: HistoryEntry[];
  revisionCount: number;
  audioUrl: string | null;
  audioFileName: string | null;
  audioPathname?: string | null;
  reportText?: string;
}

interface PsalmCatalogItem {
  salmo: number;
  status: string;
  salvoEm: string;
  analysisDirty: boolean;
  revisionCount: number;
}

type InputMode = "compose";

type Phase =
  | "input"
  | "simplifying"
  | "planning"
  | "composing"
  | "analyzing"
  | "revising"
  | "completed"
  | "error";

// ── Timer hook ──

function useTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) {
      setElapsed(0);
      ref.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [running]);
  return elapsed;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m > 0 ? `${m}m ${ss.toString().padStart(2, "0")}s` : `${ss}s`;
}

function fmtDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function normalizePsalmNumber(value: string) {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 150) {
    return null;
  }
  return parsed;
}

function extractPsalmNumber(text: string) {
  const match = text.match(
    /\b(?:salmo|psalm|ps)\s*(?:n[ºo°.]?\s*)?(\d{1,3})\b/i
  );
  if (!match) return null;
  return normalizePsalmNumber(match[1]);
}

function formatStoredMoment(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : fmtDateTime(date);
}

function sanitizeFragment(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function extractQuotedFragment(value: string) {
  const match = value.match(/[“"']([^”"']{2,})[”"']/);
  return match ? match[1].trim() : "";
}

function normalizeAddition(raw: any): Adicao {
  if (typeof raw === "string") {
    const estrofeMatch = raw.match(/estrofe\s*(\d+)/i);
    const trecho = extractQuotedFragment(raw) || raw.replace(/estrofe\s*\d+\s*:?\s*/i, "").trim();
    return {
      estrofe: estrofeMatch ? Number(estrofeMatch[1]) : 0,
      verso: 0,
      texto: trecho || UNSPECIFIED_ADDITION_TEXT,
      avaliacao: raw,
    };
  }

  const texto =
    sanitizeFragment(raw?.texto) ||
    sanitizeFragment(raw?.trecho) ||
    sanitizeFragment(raw?.adicao) ||
    sanitizeFragment(raw?.texto_adicionado) ||
    sanitizeFragment(raw?.fragmento) ||
    extractQuotedFragment(
      sanitizeFragment(raw?.avaliacao) ||
        sanitizeFragment(raw?.motivo) ||
        sanitizeFragment(raw?.nota)
    );

  const avaliacao =
    sanitizeFragment(raw?.avaliacao) ||
    sanitizeFragment(raw?.motivo) ||
    sanitizeFragment(raw?.nota) ||
    sanitizeFragment(raw?.comentario) ||
    (texto ? `Trecho adicional detectado: "${texto}"` : "Adição semântica detectada.");

  const estrofeValue =
    raw?.estrofe ?? raw?.estrofa ?? raw?.strophe ?? raw?.verso ?? raw?.numero;
  const estrofe = Number.isFinite(Number(estrofeValue)) ? Number(estrofeValue) : 0;

  return {
    estrofe,
    verso: Number.isFinite(Number(raw?.verso)) ? Number(raw.verso) : 0,
    texto: texto || UNSPECIFIED_ADDITION_TEXT,
    avaliacao,
  };
}

function normalizeAnalysisData(raw: any): AnalysisData {
  return {
    resumo: raw?.resumo,
    estrofes: Array.isArray(raw?.estrofes) ? raw.estrofes : [],
    fidelidade: Array.isArray(raw?.fidelidade) ? raw.fidelidade : [],
    adicoes: Array.isArray(raw?.adicoes) ? raw.adicoes.map(normalizeAddition) : [],
    problemas: Array.isArray(raw?.problemas) ? raw.problemas : [],
  };
}

function buildCordelFileName(psalmNumber: number | null) {
  const prefix = psalmNumber ? `salmo-${String(psalmNumber).padStart(3, "0")}` : "cordel";
  return `${prefix}-aprovado.txt`;
}

function formatAdditionLocation(estrofe: number, verso?: number) {
  if (estrofe <= 0) return "Trecho sem estrofe identificada";
  return `Estrofe ${estrofe}${verso && verso > 0 ? `, verso ${verso}` : ""}`;
}

function buildReportFileName(psalmNumber: number | null) {
  const prefix = psalmNumber ? `salmo-${String(psalmNumber).padStart(3, "0")}` : "relatorio-cordel";
  return `${prefix}-relatorio-final.md`;
}

function buildMeaningMapFileName(psalmNumber: number | null) {
  return psalmNumber
    ? `salmo-${String(psalmNumber).padStart(3, "0")}-mapa-de-significado.md`
    : "mapa-de-significado.md";
}

function findEstrofeText(cordelData: CordelData | null, estrofeNumero: number) {
  if (!cordelData || estrofeNumero <= 0) return "";
  const estrofe = cordelData.estrofes.find((item) => item.numero === estrofeNumero);
  return estrofe ? estrofe.versos.join(" / ") : "";
}

function formatAdditionText(addition: Adicao, cordelData: CordelData | null) {
  if (addition.texto && addition.texto !== UNSPECIFIED_ADDITION_TEXT) {
    return addition.texto;
  }

  return findEstrofeText(cordelData, addition.estrofe) || addition.texto;
}

function downloadTextFile(contents: string, fileName: string, mimeType: string) {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadRemoteFile(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Não foi possível preparar o download do arquivo.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function readUploadedTextFile(file: File) {
  const lowerName = file.name.toLowerCase();

  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`O arquivo "${file.name}" ultrapassa o limite de 5 MB.`);
  }

  if (lowerName.endsWith(".doc")) {
    throw new Error(
      `O arquivo "${file.name}" está em formato Word antigo (.doc). Converta para .docx e tente novamente.`
    );
  }

  let text = "";

  if (lowerName.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const mammothModule = await import("mammoth");
    const mammoth = "default" in mammothModule ? mammothModule.default : mammothModule;
    const result = await mammoth.extractRawText({ arrayBuffer });
    text = result.value;
  } else {
    text = await file.text();
  }

  if (!text.trim()) {
    throw new Error(`O arquivo "${file.name}" está vazio.`);
  }
  return text;
}

function cordelToPlainText(data: CordelData) {
  const verses = data.estrofes.map((e) => e.versos.join("\n")).join("\n\n");
  return data.titulo?.trim() ? `${data.titulo.trim()}\n\n${verses}` : verses;
}

function summarizeAnalysis(data: AnalysisData | null) {
  if (!data) {
    return {
      totalVerses: 0,
      correctVerses: 0,
      totalRhymes: 0,
      correctRhymes: 0,
      presentes: 0,
      parciais: 0,
      ausentes: 0,
      additions: 0,
    };
  }

  let totalVerses = 0;
  let correctVerses = 0;
  let totalRhymes = 0;
  let correctRhymes = 0;

  data.estrofes.forEach((estrofe) => {
    totalRhymes += 1;
    if (estrofe.rima_ok) correctRhymes += 1;

    estrofe.versos.forEach((verso) => {
      totalVerses += 1;
      if (verso.correto) correctVerses += 1;
    });
  });

  return {
    totalVerses,
    correctVerses,
    totalRhymes,
    correctRhymes,
    presentes: data.fidelidade.filter((item) => item.status === "PRESENTE").length,
    parciais: data.fidelidade.filter((item) => item.status === "PARCIAL").length,
    ausentes: data.fidelidade.filter((item) => item.status === "AUSENTE").length,
    additions: data.adicoes.length,
  };
}

function describeCordelChanges(previous: CordelData, next: CordelData) {
  const changes: string[] = [];
  const maxEstrofes = Math.max(previous.estrofes.length, next.estrofes.length);

  for (let estrofeIndex = 0; estrofeIndex < maxEstrofes; estrofeIndex += 1) {
    const previousEstrofe = previous.estrofes[estrofeIndex];
    const nextEstrofe = next.estrofes[estrofeIndex];

    if (!previousEstrofe && nextEstrofe) {
      changes.push(`Estrofe ${nextEstrofe.numero} adicionada.`);
      continue;
    }

    if (previousEstrofe && !nextEstrofe) {
      changes.push(`Estrofe ${previousEstrofe.numero} removida.`);
      continue;
    }

    if (!previousEstrofe || !nextEstrofe) continue;

    const maxVersos = Math.max(previousEstrofe.versos.length, nextEstrofe.versos.length);
    for (let versoIndex = 0; versoIndex < maxVersos; versoIndex += 1) {
      const previousVerso = previousEstrofe.versos[versoIndex];
      const nextVerso = nextEstrofe.versos[versoIndex];

      if (previousVerso === nextVerso) continue;

      if (typeof previousVerso === "undefined" && typeof nextVerso !== "undefined") {
        changes.push(
          `Est. ${nextEstrofe.numero}, v${versoIndex + 1}: verso adicionado -> "${nextVerso}"`
        );
        continue;
      }

      if (typeof previousVerso !== "undefined" && typeof nextVerso === "undefined") {
        changes.push(
          `Est. ${previousEstrofe.numero}, v${versoIndex + 1}: verso removido -> "${previousVerso}"`
        );
        continue;
      }

      changes.push(
        `Est. ${nextEstrofe.numero}, v${versoIndex + 1}: "${previousVerso}" -> "${nextVerso}"`
      );
    }
  }

  return changes;
}

function hasAnalysisIssues(data: AnalysisData | null) {
  if (!data) return false;
  if (data.resumo && !data.resumo.aprovado) return true;

  return Boolean(
    data.estrofes?.some(
      (estrofe) => estrofe.versos?.some((verso) => !verso.correto) || !estrofe.rima_ok
    ) ||
    data.adicoes?.length > 0 ||
    data.fidelidade?.some((item) => item.status !== "PRESENTE") ||
    data.problemas?.length > 0
  );
}

function derivePsalmStatus({
  analysisData,
  analysisDirty,
}: {
  analysisData: AnalysisData | null;
  analysisDirty: boolean;
}) {
  if (!analysisData) return "rascunho";
  if (analysisDirty) return "revisar";
  return hasAnalysisIssues(analysisData) ? "revisar" : "pronto";
}

function upsertCatalogItem(
  current: PsalmCatalogItem[],
  nextItem: PsalmCatalogItem
) {
  return [...current.filter((item) => item.salmo !== nextItem.salmo), nextItem].sort(
    (a, b) => a.salmo - b.salmo
  );
}

function buildReportText({
  meaningMapText,
  simplifiedMeaningMapText,
  compositionPlan,
  workflowModels,
  cordelData,
  analysisData,
  analysisDirty,
  historyEntries,
  revisionCount,
  audioFileName,
  audioUrl,
  userAudio,
}: {
  meaningMapText: string;
  simplifiedMeaningMapText: string;
  compositionPlan: CompositionPlan | null;
  workflowModels: Record<string, string>;
  cordelData: CordelData | null;
  analysisData: AnalysisData | null;
  analysisDirty: boolean;
  historyEntries: HistoryEntry[];
  revisionCount: number;
  audioFileName: string | null;
  audioUrl: string | null;
  userAudio: RecordedAudio | null;
}) {
  if (!cordelData) return "";

  const summary = summarizeAnalysis(analysisData);
  const lastEvent = historyEntries[historyEntries.length - 1]?.momento || fmtDateTime();
  const analysisStatus = !analysisData
    ? "Análise ainda não executada."
    : analysisDirty
    ? "Existe uma análise registrada, mas o cordel foi editado depois e precisa ser reanalisado."
    : "Análise concluída e atualizada."

  const additionsBlock = analysisData?.adicoes?.length
    ? analysisData.adicoes
        .map(
          (item) =>
            `- ${formatAdditionLocation(item.estrofe, item.verso)}: "${formatAdditionText(
              item,
              cordelData
            )}"\n  Motivo: ${item.avaliacao}`
        )
        .join("\n")
    : "- Nenhuma adição semântica detectada.";

  const fidelityBlock = analysisData?.fidelidade?.length
    ? analysisData.fidelidade
        .map((item) => {
          const estrofe = item.estrofe ? ` | Estrofe ${item.estrofe}` : "";
          const nota = item.nota ? ` | Nota: ${item.nota}` : "";
          const resumo = item.resumo ? ` | ${item.resumo}` : "";
          const evidencia = item.evidencia ? `\n  Evidência: "${item.evidencia}"` : "";
          return `- Proposição ${item.proposicao}: ${item.status}${estrofe}${resumo}${nota}${evidencia}`;
        })
        .join("\n")
    : "- Análise de fidelidade ainda não executada.";

  const historyBlock = historyEntries.length
    ? historyEntries
        .map((entry, index) => {
          const details =
            entry.detalhes.length > 0
              ? `\n${entry.detalhes.map((detail) => `  - ${detail}`).join("\n")}`
              : "";
          return `${index + 1}. [${entry.momento}] ${entry.titulo}${details}`;
        })
        .join("\n")
    : "1. Nenhuma mudança registrada nesta sessão.";

  const modelsBlock = Object.keys(workflowModels).length
    ? Object.entries(workflowModels)
        .map(([role, model]) => `- ${role.replace(/_/g, " ")}: ${model}`)
        .join("\n")
    : "- Modelos ainda não registrados.";

  const planBlock = compositionPlan
    ? [
        `- Título provisório: ${compositionPlan.titulo_provisorio}`,
        `- Síntese: ${compositionPlan.sintese}`,
        `- Estrofes planejadas: ${compositionPlan.estrutura.total_estrofes}`,
        `- Justificativa: ${compositionPlan.estrutura.justificativa}`,
        `- Arco emocional: ${compositionPlan.estrutura.arco_emocional}`,
        `- Registro temporal: ${compositionPlan.estrutura.registro_temporal}`,
        "",
        "### Cobertura Planejada",
        ...compositionPlan.cobertura.map(
          (item) =>
            `- Proposição ${item.proposicao}: ${item.resumo} → estrofe(s) ${item.estrofes_planejadas.join(
              ", "
            )}`
        ),
      ].join("\n")
    : "Projeto de composição não disponível para este registro.";

  return [
    "# Relatório de Análise do Cordel",
    "",
    `- Última atualização: ${lastEvent}`,
    "- Fluxo: preparação determinística do Mapa, composição automática, auditoria independente contra o Mapa original e lapidação humana; revisão por IA opcional.",
    `- Estado da análise: ${analysisStatus}`,
    `- Revisões opcionais por IA realizadas: ${revisionCount}`,
    `- Áudio: ${
      audioUrl
        ? `Disponível${audioFileName ? ` (${audioFileName})` : ""}.`
        : "Ainda não gerado."
    }`,
    audioUrl ? `- Link do áudio: ${audioUrl}` : null,
    `- Declamação do usuário: ${
      userAudio?.fileName ? `Disponível (${userAudio.fileName}).` : "Ainda não gravada."
    }`,
    "",
    "## Resumo Quantitativo",
    `- Estrofes finais: ${cordelData.estrofes.length}`,
    `- Versos finais: ${cordelData.estrofes.reduce(
      (total, estrofe) => total + estrofe.versos.length,
      0
    )}`,
    `- Versos corretos na última análise: ${summary.correctVerses}/${summary.totalVerses}`,
    `- Estrofes com rima correta: ${summary.correctRhymes}/${summary.totalRhymes}`,
    `- Proposições PRESENTE: ${summary.presentes}`,
    `- Proposições PARCIAL: ${summary.parciais}`,
    `- Proposições AUSENTE: ${summary.ausentes}`,
    `- Adições detectadas: ${summary.additions}`,
    analysisData?.resumo ? `- Parecer final: ${analysisData.resumo.parecer}` : null,
    "",
    "## Modelos Utilizados",
    "",
    modelsBlock,
    "",
    "## Projeto de Composição",
    "",
    planBlock,
    "",
    "## Mapa Reduzido — Recorte Literal Usado na Composição",
    "",
    simplifiedMeaningMapText.trim() || "Recorte literal do Mapa não disponível.",
    "",
    "## Mapa Original do Portal — Fonte da Auditoria",
    "",
    meaningMapText.trim() || "Mapa de Significado original não informado.",
    "",
    "## Cordel Final",
    "",
    cordelToPlainText(cordelData),
    "",
    "## Análise de Fidelidade",
    "",
    fidelityBlock,
    "",
    "## Adições Detectadas",
    "",
    "Repetições, reformulações e outros recursos de oralidade podem ser legítimos. Verifique se estas adições estilísticas não introduzem elementos semânticos ausentes do Mapa de Significado.",
    "",
    additionsBlock,
    "",
    "## Histórico das Mudanças",
    "",
    historyBlock,
    "",
  ].join("\n");
}

// ── API helpers ──

async function apiPost(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro da API ${res.status}`);
  return data;
}

async function apiGet(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro da API ${res.status}`);
  return data;
}

// ── Shema Logo ──

function ShemaIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      className={className}
      fill="currentColor"
      aria-label="Shema Bible Translation"
    >
      <path d="M900,451.61V151.07H700a278.79,278.79,0,0,0-83.83,12.66c-71,22.3-116.17,92-116.17,92h0s-45-69.59-116.17-92A278.79,278.79,0,0,0,300,151.07H100V749H300a279.12,279.12,0,0,1,83.83,12.65C455,784,500,848.93,500,848.93h0s39.71-57.16,103.18-82.68c-.33-5.73-.52-11.49-.52-17.31C602.66,585,736.05,451.61,900,451.61Z" />
      <path d="M827.11,748.94H900V675.57C859.81,675.57,827.11,708.49,827.11,748.94Z" />
      <path d="M734.56,748.94h53.22c0-62.14,50.34-112.71,112.22-112.71V583.5C808.77,583.5,734.56,657.72,734.56,748.94Z" />
      <path d="M642,748.94q0,3,.08,6A281.75,281.75,0,0,1,695.22,749v-.1C695.22,636,787.08,544.16,900,544.16V490.94C757.74,490.94,642,606.68,642,748.94Z" />
    </svg>
  );
}

// ── Sub-components ──

function Badge({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full ${
        ok
          ? "bg-preto text-cream border border-preto"
          : "bg-[var(--parchment-dark)] text-preto border border-preto/20"
      }`}
    >
      {children}
    </span>
  );
}

function StepBadge({
  done,
  active,
  label,
  sub,
}: {
  done: boolean;
  active: boolean;
  label: string;
  sub: string;
}) {
  const bg = done
    ? "bg-preto text-cream border border-preto"
    : active
    ? "bg-[var(--parchment-dark)] text-preto border border-preto"
    : "bg-cream text-brown-mid border border-preto/30";
  const icon = done ? "✓" : active ? "◉" : "○";
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-full ${bg}`}>
        {icon} {label}
      </span>
      <span className="font-mono text-[11px] text-brown-light">{sub}</span>
    </div>
  );
}

function PipelineBadges({
  revisionCount,
}: {
  revisionCount: number;
}) {
  const done =
    "font-mono text-[11px] text-cream bg-preto px-2 py-0.5 rounded-full border border-preto";
  const rev =
    "font-mono text-[11px] text-preto bg-[var(--amber-light)] px-2 py-0.5 rounded-full border border-preto/30";

  return (
    <div className="flex flex-wrap gap-2 items-center mb-5">
      <span className={done}>✓ Mapa original</span>
      <span className={done}>✓ Mapa preparado</span>
      <span className={done}>✓ Projeto</span>
      <span className={done}>✓ Composição</span>
      <span className={done}>✓ Auditoria</span>
      {revisionCount > 0 && (
        <span className={rev}>Revisões opcionais por IA: {revisionCount}</span>
      )}
    </div>
  );
}

function PipelineProgress({
  phase,
  revisionCount,
}: {
  phase: Phase;
  revisionCount: number;
}) {
  const isOptionalRevision = phase === "revising" || revisionCount > 0;
  const steps = [
    {
      phase: "simplifying" as Phase,
      label: "Preparação do Mapa",
      sub: "filtragem extrativa",
    },
    { phase: "planning" as Phase, label: "Projeto", sub: "estrutura e cobertura" },
    { phase: "composing" as Phase, label: "Composição", sub: "sextilhas e imagens" },
    ...(isOptionalRevision
      ? [
          {
            phase: "revising" as Phase,
            label: "Revisão por IA",
            sub: `tentativa ${phase === "revising" ? revisionCount + 1 : revisionCount}`,
          },
        ]
      : []),
    { phase: "analyzing" as Phase, label: "Auditoria", sub: "métrica, rima e fidelidade" },
  ];
  const currentIndex = steps.findIndex((step) => step.phase === phase);

  return (
    <div className="mx-auto mt-6 max-w-md text-left">
      {steps.map((step) => {
        const stepIndex = steps.findIndex((item) => item.phase === step.phase);
        return (
          <StepBadge
            key={step.label}
            label={step.label}
            sub={step.sub}
            active={phase === step.phase}
            done={currentIndex > stepIndex}
          />
        );
      })}
    </div>
  );
}

// ── Tab views ──

function CordelView({
  data,
  stanzaUndoHistory,
  verseSelections,
  suggestionResults,
  suggestionNotes,
  suggestionErrors,
  openSuggestionPanels,
  suggestionLoadingStanza,
  audioUrl,
  userAudio,
  audioLoading,
  userAudioRecording,
  audioError,
  userAudioError,
  onVerseChange,
  onVerseCommit,
  onUndoStanza,
  onToggleSuggestionPanel,
  onToggleVerseSelection,
  onSuggestionNoteChange,
  onRequestSuggestions,
  onAcceptSuggestion,
  onRejectSuggestion,
  onDismissSuggestions,
  onListen,
  onRecord,
}: {
  data: CordelData;
  stanzaUndoHistory: StanzaUndoHistory;
  verseSelections: VerseSelections;
  suggestionResults: StanzaSuggestionResults;
  suggestionNotes: StanzaTextState;
  suggestionErrors: StanzaTextState;
  openSuggestionPanels: StanzaOpenState;
  suggestionLoadingStanza: number | null;
  audioUrl: string | null;
  userAudio: RecordedAudio | null;
  audioLoading: boolean;
  userAudioRecording: boolean;
  audioError: string;
  userAudioError: string;
  onVerseChange: (estrofeNumero: number, versoIndex: number, value: string) => void;
  onVerseCommit: (
    estrofeNumero: number,
    versoIndex: number,
    previousValue: string,
    nextValue: string
  ) => void;
  onUndoStanza: (estrofeNumero: number) => void;
  onToggleSuggestionPanel: (estrofeNumero: number) => void;
  onToggleVerseSelection: (estrofeNumero: number, versoIndex: number) => void;
  onSuggestionNoteChange: (estrofeNumero: number, value: string) => void;
  onRequestSuggestions: (estrofeNumero: number) => void;
  onAcceptSuggestion: (estrofeNumero: number, suggestionIndex: number) => void;
  onRejectSuggestion: (estrofeNumero: number, suggestionIndex: number) => void;
  onDismissSuggestions: (estrofeNumero: number) => void;
  onListen: () => void;
  onRecord: () => void;
}) {
  return (
    <div>
      {data.titulo && (
        <div className="mb-5 text-center">
          <div className="font-heading text-2xl font-bold uppercase tracking-[0.06em] text-preto">
            {data.titulo}
          </div>
          <div className="mx-auto mt-2 h-1 w-20 bg-preto" />
        </div>
      )}

      {data.estrofes.map((est) => {
        const undoCount = stanzaUndoHistory[est.numero]?.length || 0;
        const selectedVerseIndexes = verseSelections[est.numero] || [];
        const suggestionResult = suggestionResults[est.numero];
        const suggestionLoading = suggestionLoadingStanza === est.numero;
        const suggestionPanelOpen = Boolean(openSuggestionPanels[est.numero]);
        const selectedLabel = selectedVerseIndexes
          .map((index) => `v${index + 1}`)
          .join(" e ");

        return (
          <div
            key={est.numero}
            className="mb-4 rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="font-heading text-xs font-bold uppercase tracking-widest text-brown-light">
                Estrofe {est.numero}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onUndoStanza(est.numero)}
                  disabled={undoCount === 0 || suggestionLoading}
                  title="Restaurar a versão anterior desta estrofe"
                  className="btn-secondary rounded-full border border-preto bg-cream px-3 py-1.5 font-heading text-xs font-semibold text-preto transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Desfazer tentativa{undoCount > 0 ? ` (${undoCount})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSuggestionPanel(est.numero)}
                  aria-expanded={suggestionPanelOpen}
                  className={`rounded-full border px-3 py-1.5 font-heading text-xs font-semibold transition-all ${
                    suggestionPanelOpen
                      ? "border-preto bg-preto text-cream"
                      : "btn-secondary border-preto bg-cream text-preto"
                  }`}
                >
                  {suggestionPanelOpen ? "Fechar ajuda da IA" : "Sugestões da IA"}
                </button>
              </div>
            </div>

            {est.versos.map((verse, index) => {
              const selected = selectedVerseIndexes.includes(index);
              const selectionDisabled =
                suggestionLoading ||
                (!selected && selectedVerseIndexes.length >= 2);
              return (
                <div
                  key={index}
                  className={suggestionPanelOpen ? "grid grid-cols-[44px_minmax(0,1fr)] gap-2" : ""}
                >
                  {suggestionPanelOpen && (
                    <button
                      type="button"
                      onClick={() => onToggleVerseSelection(est.numero, index)}
                      disabled={selectionDisabled}
                      aria-pressed={selected}
                      aria-label={`Selecionar verso ${index + 1} da estrofe ${est.numero}`}
                      title={
                        selectionDisabled && !selected
                          ? "Você já selecionou dois versos"
                          : `Selecionar verso ${index + 1}`
                      }
                      className={`mb-2 rounded-[12px] border font-mono text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                        selected
                          ? "border-preto bg-preto text-cream"
                          : "border-preto/30 bg-[var(--parchment-dark)] text-preto"
                      }`}
                    >
                      v{index + 1}
                    </button>
                  )}
                  <textarea
                    rows={1}
                    aria-label={`Estrofe ${est.numero}, verso ${index + 1}`}
                    value={verse}
                    onChange={(event) =>
                      onVerseChange(est.numero, index, event.target.value)
                    }
                    onFocus={(event) => {
                      event.currentTarget.dataset.initialValue = verse;
                    }}
                    onBlur={(event) =>
                      onVerseCommit(
                        est.numero,
                        index,
                        event.currentTarget.dataset.initialValue || "",
                        event.currentTarget.value
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.preventDefault();
                    }}
                    className="mb-2 block w-full resize-y rounded-[14px] border border-preto/20 bg-[var(--parchment-dark)] px-3 py-2 font-body text-[17px] leading-[1.7] italic text-preto shadow-[inset_0_0_0_1px_rgba(15,12,8,0.04)]"
                  />
                </div>
              );
            })}

            {est.proposicoes_cobertas && (
              <p className="mt-2.5 font-mono text-[11px] text-brown-light">
                ↳ {est.proposicoes_cobertas}
              </p>
            )}

            {suggestionPanelOpen && (
              <div className="mt-4 rounded-[18px] border-2 border-preto bg-[var(--parchment-dark)] p-4">
                <div className="font-heading text-xs font-bold uppercase tracking-widest text-brown-mid">
                  Ajuda Localizada
                </div>
                <p className="mt-1 font-body text-sm leading-relaxed text-preto">
                  Selecione um ou dois versos pelos botões numerados. A IA apresentará três alternativas sem alterar o cordel.
                </p>
                <label className="mt-3 block font-heading text-[11px] font-semibold uppercase tracking-wide text-brown-mid">
                  O que você quer melhorar? <span className="normal-case">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={suggestionNotes[est.numero] || ""}
                  onChange={(event) =>
                    onSuggestionNoteChange(est.numero, event.target.value)
                  }
                  maxLength={1000}
                  placeholder="Ex.: preservar esta ideia, mas melhorar a rima e a oralidade"
                  className="mt-1.5 w-full rounded-[12px] border border-preto/30 bg-cream px-3 py-2 font-body text-sm text-preto outline-none focus:border-preto"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onRequestSuggestions(est.numero)}
                    disabled={
                      selectedVerseIndexes.length === 0 ||
                      suggestionLoadingStanza !== null
                    }
                    className="btn-primary rounded-full border-2 border-preto bg-preto px-4 py-2 font-heading text-xs font-bold text-cream transition-all disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {suggestionLoading
                      ? "Preparando sugestões..."
                      : `Pedir 3 sugestões${selectedLabel ? ` para ${selectedLabel}` : ""}`}
                  </button>
                  {selectedVerseIndexes.length === 0 && (
                    <span className="font-mono text-[11px] text-brown-mid">
                      Selecione pelo menos um verso.
                    </span>
                  )}
                </div>

                {suggestionErrors[est.numero] && (
                  <div role="alert" className="mt-3 rounded-[12px] border border-preto bg-cream px-3 py-2 font-body text-sm text-preto">
                    {suggestionErrors[est.numero]}
                  </div>
                )}

                {suggestionResult && (
                  <div className="mt-5 border-t-2 border-preto/20 pt-4">
                    <p className="font-body text-sm font-semibold text-preto">
                      O texto atual continua preservado. Escolha uma alternativa ou rejeite as que não ajudam.
                    </p>
                    <div className="mt-3 space-y-3">
                      {suggestionResult.alternatives.map((alternative, suggestionIndex) => (
                        <div
                          key={`${alternative.versos.join("|")}-${suggestionIndex}`}
                          className="rounded-[16px] border-2 border-preto bg-cream p-4"
                        >
                          <div className="font-heading text-xs font-bold uppercase tracking-wider text-brown-mid">
                            Alternativa {suggestionIndex + 1}
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {alternative.versos.map((suggestedVerse, verseOffset) => (
                              <div
                                key={`${suggestedVerse}-${verseOffset}`}
                                className="flex gap-2 font-body text-base italic text-preto"
                              >
                                <span className="font-mono text-xs not-italic text-brown-mid">
                                  v{suggestionResult.verseIndexes[verseOffset] + 1}
                                </span>
                                <span>{suggestedVerse}</span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 font-body text-sm leading-relaxed text-preto">
                            {alternative.justificativa}
                          </p>
                          <div className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed text-brown-mid">
                            <div><strong>Métrica:</strong> {alternative.observacao_metrica}</div>
                            <div><strong>Fidelidade:</strong> {alternative.observacao_fidelidade}</div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onAcceptSuggestion(est.numero, suggestionIndex)
                              }
                              className="btn-primary rounded-full border-2 border-preto bg-preto px-4 py-2 font-heading text-xs font-bold text-cream transition-all"
                            >
                              Usar esta sugestão
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onRejectSuggestion(est.numero, suggestionIndex)
                              }
                              className="btn-secondary rounded-full border-2 border-preto bg-cream px-4 py-2 font-heading text-xs font-bold text-preto transition-all"
                            >
                              Rejeitar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDismissSuggestions(est.numero)}
                      className="btn-secondary mt-3 rounded-full border border-preto bg-[var(--parchment-dark)] px-3 py-1.5 font-heading text-xs font-semibold text-preto transition-all"
                    >
                      Descartar todas as sugestões
                    </button>
                  </div>
                )}
              </div>
            )}

            {est.numero < data.estrofes.length && <XiloDivider />}
          </div>
        );
      })}

      {/* Listen button */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onListen}
          disabled={audioLoading}
          className="btn-secondary flex items-center gap-2 rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {audioLoading ? "Gerando áudio…" : "Ouvir Cordel"}
        </button>
        <button
          onClick={onRecord}
          className={`btn-secondary flex items-center gap-2 rounded-full border-2 border-preto px-5 py-2.5 font-heading text-sm font-bold transition-all ${
            userAudioRecording
              ? "bg-preto text-cream"
              : "bg-cream text-preto"
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <circle cx="12" cy="12" r="7" />
          </svg>
          {userAudioRecording ? "Parar Gravação" : "Gravar Cordel"}
        </button>
        {audioUrl && (
          <audio controls src={audioUrl} className="h-8" />
        )}
        {userAudio?.url && (
          <audio controls src={userAudio.url} className="h-8" />
        )}
        {audioError && (
          <span className="font-mono text-xs text-[var(--red)]">{audioError}</span>
        )}
        {userAudioError && (
          <span className="font-mono text-xs text-[var(--red)]">{userAudioError}</span>
        )}
      </div>
    </div>
  );
}

function ReportView({
  reportText,
  cordelText,
  psalmNumber,
  historyEntries,
  analysisData,
  analysisDirty,
  audioUrl,
  audioFileName,
  userAudio,
  onCopyReport,
  onDownloadReport,
  onDownloadCordel,
  onDownloadElevenLabsAudio,
  onDownloadUserAudio,
}: {
  reportText: string;
  cordelText: string;
  psalmNumber: number | null;
  historyEntries: HistoryEntry[];
  analysisData: AnalysisData | null;
  analysisDirty: boolean;
  audioUrl: string | null;
  audioFileName: string | null;
  userAudio: RecordedAudio | null;
  onCopyReport: () => void;
  onDownloadReport: () => void;
  onDownloadCordel: () => void;
  onDownloadElevenLabsAudio: () => void;
  onDownloadUserAudio: () => void;
}) {
  const summary = summarizeAnalysis(analysisData);

  return (
    <div>
      <div className="mb-5 flex gap-3.5 flex-wrap">
        <div className="min-w-[150px] flex-1 rounded-[18px] border-2 border-preto bg-[var(--parchment-dark)] px-4 py-3 text-center">
          <p className="font-heading text-2xl font-bold m-0 text-preto">
            {historyEntries.length}
          </p>
          <p className="font-heading text-[11px] text-brown-mid uppercase tracking-wide mt-1">
            Eventos no Histórico
          </p>
        </div>
        <div className="min-w-[150px] flex-1 rounded-[18px] border-2 border-preto bg-[var(--parchment-dark)] px-4 py-3 text-center">
          <p className="font-heading text-2xl font-bold m-0 text-preto">
            {summary.correctVerses}/{summary.totalVerses}
          </p>
          <p className="font-heading text-[11px] text-brown-mid uppercase tracking-wide mt-1">
            Versos Corretos
          </p>
        </div>
        <div className="min-w-[150px] flex-1 rounded-[18px] border-2 border-preto bg-[var(--parchment-dark)] px-4 py-3 text-center">
          <p className="font-heading text-2xl font-bold m-0 text-preto">
            {summary.ausentes}
          </p>
          <p className="font-heading text-[11px] text-brown-mid uppercase tracking-wide mt-1">
            Proposições Ausentes
          </p>
        </div>
      </div>

      {analysisDirty ? (
        <div className="mb-4 rounded-[18px] border-2 border-preto bg-[var(--amber-light)] px-4 py-3 font-body text-[13px] leading-relaxed text-preto">
          O relatório inclui a última análise salva, mas o cordel foi editado depois dela. Reanalise antes de documentar a versão final.
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2.5">
        <button
          onClick={onDownloadCordel}
          disabled={!cordelText}
          className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all disabled:opacity-50"
        >
          Baixar Cordel Aprovado
        </button>
        <button
          onClick={onCopyReport}
          className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all"
        >
          Copiar Relatório
        </button>
        <button
          onClick={onDownloadReport}
          className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all"
        >
          Baixar Relatório
        </button>
        <button
          onClick={onDownloadElevenLabsAudio}
          disabled={!audioUrl}
          className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all disabled:opacity-50"
        >
          Baixar Áudio ElevenLabs
        </button>
        <button
          onClick={onDownloadUserAudio}
          disabled={!userAudio?.url}
          className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all disabled:opacity-50"
        >
          Baixar Áudio do Usuário
        </button>
      </div>

      <div className="rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]">
        <div className="font-heading text-xs font-bold text-brown-light uppercase tracking-widest mb-2.5">
          Relatório Final{psalmNumber ? ` · Salmo ${psalmNumber}` : ""}
        </div>
        <textarea
          readOnly
          value={reportText}
          className="min-h-[420px] w-full resize-y rounded-[16px] border-2 border-preto bg-[var(--parchment-dark)] p-4 font-mono text-[12px] leading-[1.6] text-preto shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]"
        />
      </div>
    </div>
  );
}

function CatalogView({
  catalog,
  currentPsalmNumber,
  inferredPsalmNumber,
  psalmNumberInput,
  onPsalmNumberInputChange,
  onSelectPsalm,
  onLoadPsalm,
  onSaveCurrentPsalm,
  canSave,
  saveLabel,
  currentSavedItem,
  loading,
  syncing,
  error,
}: {
  catalog: PsalmCatalogItem[];
  currentPsalmNumber: number | null;
  inferredPsalmNumber: number | null;
  psalmNumberInput: string;
  onPsalmNumberInputChange: (value: string) => void;
  onSelectPsalm: (psalm: number) => void;
  onLoadPsalm: (psalm: number) => void;
  onSaveCurrentPsalm: () => void;
  canSave: boolean;
  saveLabel: string;
  currentSavedItem: PsalmCatalogItem | null;
  loading: boolean;
  syncing: boolean;
  error: string;
}) {
  const catalogByPsalm = new Map(catalog.map((item) => [item.salmo, item]));
  const completed = catalog.filter((item) => item.status === "pronto").length;
  const inProgress = catalog.filter((item) => item.status !== "pronto").length;
  const remaining = 150 - catalog.length;

  const statusLabel: Record<string, string> = {
    pronto: "Pronto",
    revisar: "Revisar",
    rascunho: "Rascunho",
  };

  return (
    <details open className="group mt-8 rounded-[24px] border-[3px] border-preto bg-parchment px-4 py-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.12)] sm:px-6 sm:py-6">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4">
        <span className="font-heading text-lg font-bold uppercase tracking-[0.08em] text-preto">
          Catálogo dos Salmos
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Badge ok={completed > 0}>{completed}/150 prontos</Badge>
          <Badge ok={inProgress === 0}>{inProgress} em andamento</Badge>
          <Badge ok={remaining === 0}>{remaining} faltando</Badge>
          <span aria-hidden="true" className="ml-1 text-lg text-preto transition-transform group-open:rotate-180">
            ⌄
          </span>
        </span>
      </summary>

      <div className="mt-4 border-t border-preto/20 pt-4">
        <p className="max-w-2xl font-body text-sm text-brown-mid">
          Catálogo sincronizado para toda a equipe. O banco compartilhado guarda Mapa, projeto, cordel, auditoria, relatório, histórico e o link do áudio persistido. Clique em um salmo salvo para carregar a versão compartilhada ou marque o próximo salmo a trabalhar.
        </p>

      <div className="mt-5 rounded-[20px] border-2 border-preto bg-cream p-4 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label className="mb-2 block font-heading text-xs font-semibold uppercase tracking-widest text-brown-mid">
              Número do Salmo
            </label>
            <input
              value={psalmNumberInput}
              onChange={(e) => onPsalmNumberInputChange(e.target.value)}
              inputMode="numeric"
              placeholder={inferredPsalmNumber ? `Detectado: ${inferredPsalmNumber}` : "Ex.: 23"}
              className="w-full rounded-[14px] border-2 border-preto bg-[var(--parchment-dark)] px-3 py-2 font-body text-sm text-preto"
            />
          </div>
          <button
            onClick={onSaveCurrentPsalm}
            disabled={!canSave || syncing}
            className="btn-primary cursor-pointer rounded-full border-2 border-preto bg-preto px-5 py-2.5 font-heading text-sm font-bold text-cream transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? "Sincronizando…" : saveLabel}
          </button>
        </div>

        <div className="mt-3 font-body text-[13px] leading-relaxed text-preto">
          {currentPsalmNumber ? (
            <span>
              Salmo atual: {currentPsalmNumber}
              {currentSavedItem
                ? ` · ${statusLabel[currentSavedItem.status] || "Salvo"} em ${formatStoredMoment(
                    currentSavedItem.salvoEm
                  )}`
                : " · ainda não salvo no catálogo"}
            </span>
          ) : inferredPsalmNumber ? (
            <span>O app detectou automaticamente o Salmo {inferredPsalmNumber} no Mapa de Significado.</span>
          ) : (
            <span>Informe o número do salmo para organizar o catálogo e salvar o cordel pronto.</span>
          )}
        </div>
        {loading ? (
          <div className="mt-3 font-mono text-[11px] text-brown-mid">
            Carregando catálogo compartilhado…
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-[14px] border border-preto/20 bg-[var(--parchment-dark)] px-3 py-2 font-body text-[13px] text-preto">
            {error}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {Array.from({ length: 150 }, (_, index) => {
          const psalm = index + 1;
          const item = catalogByPsalm.get(psalm) || null;
          const saved = Boolean(item);
          const current = currentPsalmNumber === psalm;

          const classes = current
            ? saved
              ? "bg-preto text-cream border-preto"
              : "bg-[var(--amber-light)] text-preto border-preto"
            : saved
            ? item?.status === "pronto"
              ? "bg-preto text-cream border-preto"
              : item?.status === "revisar"
              ? "bg-[var(--amber-light)] text-preto border-preto"
              : "bg-[var(--parchment-dark)] text-preto border-preto"
            : "bg-cream text-brown-mid border-preto/30";

          return (
            <button
              key={psalm}
              onClick={() => (item ? onLoadPsalm(psalm) : onSelectPsalm(psalm))}
              disabled={loading || syncing}
              className={`min-w-[44px] rounded-full border px-2.5 py-1 font-mono text-[11px] font-bold transition-all ${classes}`}
            >
              {psalm}
            </button>
          );
        })}
      </div>
      </div>
    </details>
  );
}

function MetricaView({ data }: { data: AnalysisData }) {
  let totalV = 0,
    okV = 0,
    totalR = 0,
    okR = 0;
  data.estrofes.forEach((e) => {
    e.versos?.forEach((v) => {
      totalV++;
      if (v.correto) okV++;
    });
    totalR++;
    if (e.rima_ok) okR++;
  });

  return (
    <details open className="group">
      <summary className="mb-5 flex cursor-pointer list-none items-center justify-between rounded-[16px] border-2 border-preto bg-cream px-4 py-3 font-heading text-xs font-bold uppercase tracking-widest text-preto">
        <span>Métrica e Rima</span>
        <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div>
        <div className="flex gap-3.5 mb-5 flex-wrap">
          {[
            { n: `${okV}/${totalV}`, l: "Versos 7 sílabas", ok: okV === totalV },
            { n: `${okR}/${totalR}`, l: "Rimas ABCBDB", ok: okR === totalR },
          ].map((x) => (
            <div
              key={x.l}
              className="min-w-[130px] flex-1 rounded-[18px] border-2 border-preto bg-[var(--parchment-dark)] px-4 py-3 text-center"
            >
              <p
                className={`font-heading text-2xl font-bold m-0 ${
                  x.ok ? "text-preto" : "text-brown-mid"
                }`}
              >
                {x.n}
              </p>
              <p className="font-heading text-[11px] text-brown-mid uppercase tracking-wide mt-1">
                {x.l}
              </p>
            </div>
          ))}
        </div>

        {data.estrofes.map((est) => (
          <div
            key={est.numero}
            className="mb-4 rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-heading text-xs font-bold text-brown-light uppercase tracking-widest">
                Estrofe {est.numero}
              </span>
              <Badge ok={est.rima_ok}>
                Rima: {est.rima_ok ? "✓" : "✗"}{" "}
                {est.rima_palavras?.join(" / ")}
              </Badge>
            </div>
            {est.versos?.map((v, i) => (
              <div key={i} className="mb-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="font-body text-sm text-preto">
                    <span className="font-mono text-[11px] text-brown-light mr-2">
                      v{i + 1}
                    </span>
                    {v.texto}
                  </span>
                  <Badge ok={v.correto}>{v.silabas}</Badge>
                </div>
                <div
                  className={`font-mono text-[11px] px-1.5 py-0.5 rounded inline-block mt-0.5 ${
                    v.correto
                      ? "bg-[var(--green-light)] text-preto"
                      : "bg-[var(--red-light)] text-preto"
                  }`}
                >
                  {v.escansao}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function FidelidadeView({
  data,
  cordelData,
}: {
  data: AnalysisData;
  cordelData: CordelData;
}) {
  const statusStyle: Record<string, string> = {
    PRESENTE: "bg-preto text-cream border border-preto",
    PARCIAL: "bg-[var(--amber-light)] text-preto border border-preto/20",
    AUSENTE: "bg-[var(--parchment-dark)] text-preto border border-preto/20",
  };

  return (
    <div>
      {data.resumo && (
        <div className={`mb-4 rounded-[20px] border-2 border-preto p-5 ${
          data.resumo.aprovado ? "bg-cream" : "bg-[var(--amber-light)]"
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-heading text-sm font-bold uppercase tracking-wider text-preto">
              {data.resumo.aprovado
                ? "Auditoria Aprovada"
                : "Encaminhar para Lapidação Humana"}
            </div>
            <Badge ok={data.resumo.oralidade_ok && data.resumo.qualidade_poetica_ok}>
              Oralidade e poesia
            </Badge>
          </div>
          <p className="mt-2 font-body text-sm leading-relaxed text-preto">
            {data.resumo.parecer}
          </p>
        </div>
      )}
      <details open className="group mb-4 rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]">
        <summary className="flex cursor-pointer list-none items-center justify-between font-heading text-xs font-bold uppercase tracking-widest text-brown-light">
          <span>Cobertura das Proposições</span>
          <span aria-hidden="true" className="text-lg text-preto transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <div className="mt-2.5 border-t border-parchment-dark pt-1">
          {data.fidelidade.map((p) => (
            <div key={p.proposicao} className="border-b border-parchment-dark py-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    statusStyle[p.status] || statusStyle.PARCIAL
                  }`}
                >
                  {p.status}
                </span>
                <span className="font-body text-sm font-semibold">
                  Proposição {p.proposicao}{p.estrofe ? ` → Est. ${p.estrofe}` : ""}
                </span>
                {p.resumo && <span className="font-body text-sm text-preto">{p.resumo}</span>}
              </div>
              {p.evidencia && (
                <p className="mt-1 font-body text-[13px] italic text-brown-mid">
                  Evidência no cordel: &ldquo;{p.evidencia}&rdquo;
                </p>
              )}
              {p.nota && <p className="mt-1 font-mono text-[11px] text-brown-light">{p.nota}</p>}
            </div>
          ))}
        </div>
      </details>

      <details open className="group mb-4 rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]">
        <summary className="flex cursor-pointer list-none items-center justify-between font-heading text-xs font-bold uppercase tracking-widest text-brown-light">
          <span>Adições Detectadas</span>
          <span aria-hidden="true" className="text-lg text-preto transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <div className="mt-2.5 border-t border-parchment-dark pt-3">
          <p className="mb-3 font-body text-[13px] leading-relaxed text-brown-mid">
            Repetições, reformulações e outros recursos de oralidade podem ser legítimos.
            Verifique se estas adições estilísticas não introduzem elementos semânticos
            ausentes do Mapa de Significado.
          </p>
          {data.adicoes?.length > 0 ? (
            data.adicoes.map((a, i) => (
              <div
                key={i}
                className="border-b border-parchment-dark py-1.5 last:border-b-0"
              >
                <span className="font-body text-sm italic">
                  Adição detectada em {formatAdditionLocation(a.estrofe, a.verso).toLowerCase()}: &ldquo;{formatAdditionText(a, cordelData)}&rdquo;
                </span>
                <br />
                <span className="font-mono text-xs text-brown-mid">
                  Motivo: {a.avaliacao}
                </span>
              </div>
            ))
          ) : (
            <p className="font-body text-sm text-preto">Nenhuma adição foi detectada.</p>
          )}
        </div>
      </details>

      {data.problemas?.length > 0 && (
        <div className="rounded-[20px] border-2 border-preto bg-[var(--parchment-dark)] p-5">
          <div className="mb-2.5 font-heading text-xs font-bold uppercase tracking-widest text-brown-light">
            Orientações da Auditoria
          </div>
          {data.problemas.map((problema, index) => (
            <div key={`${problema.tipo}-${problema.estrofe}-${problema.verso}-${index}`} className="border-b border-preto/10 py-2 last:border-b-0">
              <div className="font-body text-sm font-semibold text-preto">
                {problema.tipo} · {problema.prioridade}
                {problema.estrofe ? ` · Estrofe ${problema.estrofe}` : ""}
                {problema.verso ? `, verso ${problema.verso}` : ""}
              </div>
              {problema.trecho && (
                <div className="mt-1 font-body text-sm italic text-preto">
                  &ldquo;{problema.trecho}&rdquo;
                </div>
              )}
              <div className="mt-1 font-mono text-[11px] text-brown-mid">
                {problema.descricao} Correção: {problema.instrucao_de_correcao}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ──

export default function ForjaDeCordel() {
  const [meaningMapInput, setMeaningMapInput] = useState("");
  const [psalmNumberInput, setPsalmNumberInput] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [cordelData, setCordelData] = useState<CordelData | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [compositionPlan, setCompositionPlan] = useState<CompositionPlan | null>(null);
  const [workflowModels, setWorkflowModels] = useState<Record<string, string>>({});
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [catalog, setCatalog] = useState<PsalmCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [meaningMapText, setMeaningMapText] = useState("");
  const [simplifiedMeaningMapText, setSimplifiedMeaningMapText] = useState("");
  const [activeTab, setActiveTab] = useState<"metrica" | "fidelidade" | "relatorio">(
    "metrica"
  );
  const [error, setError] = useState("");
  const [revisionCount, setRevisionCount] = useState(0);
  const [stanzaUndoHistory, setStanzaUndoHistory] = useState<StanzaUndoHistory>({});
  const [verseSelections, setVerseSelections] = useState<VerseSelections>({});
  const [suggestionResults, setSuggestionResults] =
    useState<StanzaSuggestionResults>({});
  const [suggestionNotes, setSuggestionNotes] = useState<StanzaTextState>({});
  const [suggestionErrors, setSuggestionErrors] = useState<StanzaTextState>({});
  const [openSuggestionPanels, setOpenSuggestionPanels] =
    useState<StanzaOpenState>({});
  const [suggestionLoadingStanza, setSuggestionLoadingStanza] = useState<
    number | null
  >(null);

  // Audio
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioPathname, setAudioPathname] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [userAudio, setUserAudio] = useState<RecordedAudio | null>(null);
  const [userAudioRecording, setUserAudioRecording] = useState(false);
  const [userAudioError, setUserAudioError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const userAudioObjectUrlRef = useRef<string | null>(null);
  const discardRecordedAudioRef = useRef(false);
  const meaningMapFileInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionRequestTokenRef = useRef(0);

  const isLoading = [
    "simplifying",
    "planning",
    "composing",
    "analyzing",
    "revising",
  ].includes(phase);
  const elapsed = useTimer(isLoading);

  const phaseLabels: Record<string, string> = {
    simplifying: "Preparando o Mapa para a composição",
    planning: "Lendo o Mapa e projetando a cobertura",
    composing: "Compondo as sextilhas",
    analyzing: "Auditando métrica, rima, oralidade e fidelidade",
    revising: "Executando uma revisão opcional por IA",
  };

  const appendHistory = useCallback(
    ({
      tipo,
      titulo,
      detalhes = [],
    }: {
      tipo: HistoryEntryType;
      titulo: string;
      detalhes?: string[];
    }) => {
      setHistoryEntries((current) => [
        ...current,
        {
          id: current.length + 1,
          momento: fmtDateTime(),
          tipo,
          titulo,
          detalhes,
        },
      ]);
    },
    []
  );

  const clearUserAudio = useCallback(() => {
    discardRecordedAudioRef.current = true;
    if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    setUserAudioRecording(false);
    if (userAudioObjectUrlRef.current) {
      URL.revokeObjectURL(userAudioObjectUrlRef.current);
      userAudioObjectUrlRef.current = null;
    }
    setUserAudio(null);
    setUserAudioError("");
  }, []);

  const resetLocalEditingState = useCallback(() => {
    suggestionRequestTokenRef.current += 1;
    setStanzaUndoHistory({});
    setVerseSelections({});
    setSuggestionResults({});
    setSuggestionNotes({});
    setSuggestionErrors({});
    setOpenSuggestionPanels({});
    setSuggestionLoadingStanza(null);
  }, []);

  const invalidateSuggestionRequest = useCallback(() => {
    suggestionRequestTokenRef.current += 1;
    setSuggestionLoadingStanza(null);
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      setCatalogLoading(true);
      const data = await apiGet("/api/catalog");
      setCatalog(data.catalog || []);
      setCatalogError("");
    } catch (e: any) {
      setCatalogError(e.message);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    return () => {
      discardRecordedAudioRef.current = true;
      if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (userAudioObjectUrlRef.current) {
        URL.revokeObjectURL(userAudioObjectUrlRef.current);
      }
    };
  }, []);

  const inferredPsalmNumber = extractPsalmNumber(meaningMapInput || meaningMapText);
  const currentPsalmNumber = normalizePsalmNumber(psalmNumberInput) ?? inferredPsalmNumber;
  const currentSavedItem =
    currentPsalmNumber != null
      ? catalog.find((item) => item.salmo === currentPsalmNumber) || null
      : null;

  // ── Handlers ──

  const handleCompose = useCallback(async () => {
    const sourceMap = meaningMapInput.trim();
    if (!sourceMap) return;

    setError("");
    setCordelData(null);
    setAnalysisData(null);
    setCompositionPlan(null);
    setWorkflowModels({});
    setAnalysisDirty(false);
    setHistoryEntries([]);
    setMeaningMapText(sourceMap);
    setSimplifiedMeaningMapText("");
    setActiveTab("metrica");
    setRevisionCount(0);
    setAudioUrl(null);
    setAudioFileName(null);
    setAudioPathname(null);
    setAudioError("");
    clearUserAudio();
    resetLocalEditingState();

    const models: Record<string, string> = {};

    try {
      setPhase("simplifying");
      const simplifyResponse = await apiPost("/api/simplify", {
        meaningMap: sourceMap,
      });
      const processMap = String(simplifyResponse.simplifiedMap || "").trim();
      if (!processMap) {
        throw new Error("A preparação do Mapa não produziu um texto válido.");
      }
      setSimplifiedMeaningMapText(processMap);
      setHistoryEntries([
        {
          id: 1,
          momento: fmtDateTime(),
          tipo: "origem",
          titulo: "Mapa de Significado original recebido",
          detalhes: [
            "O texto integral foi preservado como fonte de autoridade para a auditoria teológica.",
          ],
        },
        {
          id: 2,
          momento: fmtDateTime(),
          tipo: "planejamento",
          titulo: "Mapa preparado para a composição",
          detalhes: [
            "Filtragem extrativa, sem IA, resumo ou paráfrase.",
            `${Number(simplifyResponse.originalCharacters).toLocaleString(
              "pt-BR"
            )} → ${Number(simplifyResponse.simplifiedCharacters).toLocaleString(
              "pt-BR"
            )} caracteres (${Number(simplifyResponse.reduction).toLocaleString(
              "pt-BR"
            )}% de redução).`,
            "Todo o conteúdo das proposições foi preservado literalmente e na ordem original; somente marcas de navegação foram removidas.",
          ],
        },
      ]);

      setPhase("planning");
      const planResponse = await apiPost("/api/plan", { meaningMap: processMap });
      const plan = planResponse.plan as CompositionPlan;
      models.planejamento = planResponse.model;
      setCompositionPlan(plan);
      setWorkflowModels({ ...models });
      if (!psalmNumberInput.trim() && plan.salmo > 0) {
        setPsalmNumberInput(String(plan.salmo));
      }
      appendHistory({
        tipo: "planejamento",
        titulo: "Projeto de composição concluído",
        detalhes: [
          `Modelo: ${planResponse.model}`,
          `Estrofes planejadas: ${plan.estrutura.total_estrofes}`,
          `Proposições mapeadas: ${plan.cobertura.length}`,
          plan.estrutura.justificativa,
        ],
      });

      setPhase("composing");
      const composeResponse = await apiPost("/api/compose", {
        meaningMap: processMap,
        plan,
      });
      const currentCordel = composeResponse.cordel as CordelData;
      models.composicao = composeResponse.model;
      setWorkflowModels({ ...models });
      setCordelData(currentCordel);
      appendHistory({
        tipo: "composicao",
        titulo: "Primeira versão do cordel composta",
        detalhes: [
          `Modelo: ${composeResponse.model}`,
          `Estrofes produzidas: ${currentCordel.estrofes.length}`,
          "A versão seguirá para auditoria independente antes de ser apresentada como resultado.",
        ],
      });

      setPhase("analyzing");
      const analyzeResponse = await apiPost("/api/analyze", {
        cordel: currentCordel,
        meaningMap: sourceMap,
      });
      const analysis = normalizeAnalysisData(analyzeResponse.analysis);
      models.auditoria_1 = analyzeResponse.model;
      setWorkflowModels({ ...models });
      const summary = summarizeAnalysis(analysis);
      appendHistory({
        tipo: "analise",
        titulo: "Auditoria independente concluída",
        detalhes: [
          `Modelo: ${analyzeResponse.model}`,
          `Versos corretos: ${summary.correctVerses}/${summary.totalVerses}`,
          `Rimas corretas: ${summary.correctRhymes}/${summary.totalRhymes}`,
          `Proposições ausentes: ${summary.ausentes}`,
          `Adições detectadas: ${summary.additions}`,
          "Resultado encaminhado para lapidação humana. A revisão por IA permanece disponível como recurso opcional.",
          analysis.resumo?.parecer || "Parecer global não informado.",
        ],
      });

      setCordelData(currentCordel);
      setAnalysisData(analysis);
      setAnalysisDirty(false);
      setWorkflowModels(models);
      setPhase("completed");
      setActiveTab("metrica");
    } catch (e: any) {
      setWorkflowModels(models);
      setError(e.message);
      setPhase("error");
    }
  }, [
    appendHistory,
    clearUserAudio,
    meaningMapInput,
    psalmNumberInput,
    resetLocalEditingState,
  ]);

  const handleAnalyze = useCallback(async () => {
    if (!cordelData || !meaningMapText.trim()) return;
    setPhase("analyzing");
    setError("");

    try {
      const data = await apiPost("/api/analyze", {
        cordel: cordelData,
        meaningMap: meaningMapText,
      });
      const normalizedAnalysis = normalizeAnalysisData(data.analysis);
      setAnalysisData(normalizedAnalysis);
      setAnalysisDirty(false);
      setWorkflowModels((current) => ({
        ...current,
        auditoria_manual: data.model,
      }));
      const summary = summarizeAnalysis(normalizedAnalysis);
      appendHistory({
        tipo: "analise",
        titulo: "Reanálise após edição manual concluída",
        detalhes: [
          `Modelo: ${data.model}`,
          `Versos corretos: ${summary.correctVerses}/${summary.totalVerses}`,
          `Rimas corretas: ${summary.correctRhymes}/${summary.totalRhymes}`,
          normalizedAnalysis.resumo?.parecer || "Parecer global não informado.",
        ],
      });
      setPhase("completed");
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [appendHistory, cordelData, meaningMapText]);

  const handleRevise = useCallback(async () => {
    if (!cordelData || !analysisData || !meaningMapText.trim()) return;
    setPhase("revising");
    setError("");

    try {
      const reviseResponse = await apiPost("/api/revise", {
        cordel: cordelData,
        analysis: analysisData,
        meaningMap: simplifiedMeaningMapText || meaningMapText,
        plan: compositionPlan,
      });
      const revisedCordel = reviseResponse.cordel as CordelData;
      const changes = describeCordelChanges(cordelData, revisedCordel);
      const nextRevision = revisionCount + 1;
      setStanzaUndoHistory((current) => {
        const next = { ...current };
        for (const stanza of cordelData.estrofes) {
          const revisedStanza = revisedCordel.estrofes.find(
            (item) => item.numero === stanza.numero
          );
          if (
            revisedStanza &&
            JSON.stringify(revisedStanza.versos) !== JSON.stringify(stanza.versos)
          ) {
            next[stanza.numero] = [
              ...(next[stanza.numero] || []),
              [...stanza.versos],
            ].slice(-20);
          }
        }
        return next;
      });
      suggestionRequestTokenRef.current += 1;
      setVerseSelections({});
      setSuggestionResults({});
      setSuggestionErrors({});
      setSuggestionLoadingStanza(null);
      setCordelData(revisedCordel);
      setRevisionCount(nextRevision);
      appendHistory({
        tipo: "revisao",
        titulo: `Revisão opcional por IA ${nextRevision} aplicada`,
        detalhes: [
          `Modelo: ${reviseResponse.model}`,
          ...(changes.length ? changes.slice(0, 12) : ["Nenhuma alteração textual detectada."]),
        ],
      });

      setPhase("analyzing");
      const analyzeResponse = await apiPost("/api/analyze", {
        cordel: revisedCordel,
        meaningMap: meaningMapText,
      });
      const normalizedAnalysis = normalizeAnalysisData(analyzeResponse.analysis);
      setAnalysisData(normalizedAnalysis);
      setAnalysisDirty(false);
      setWorkflowModels((current) => ({
        ...current,
        [`lapidacao_${nextRevision}`]: reviseResponse.model,
        [`auditoria_pos_lapidacao_${nextRevision}`]: analyzeResponse.model,
      }));
      appendHistory({
        tipo: "analise",
        titulo: `Auditoria após revisão por IA ${nextRevision} concluída`,
        detalhes: [
          `Modelo: ${analyzeResponse.model}`,
          normalizedAnalysis.resumo?.parecer || "Parecer global não informado.",
        ],
      });
      setAudioUrl(null);
      setAudioFileName(null);
      setAudioPathname(null);
      clearUserAudio();
      setPhase("completed");
      setActiveTab("metrica");
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [
    analysisData,
    appendHistory,
    clearUserAudio,
    compositionPlan,
    cordelData,
    meaningMapText,
    revisionCount,
    simplifiedMeaningMapText,
  ]);

  const handleListen = useCallback(async () => {
    if (!cordelData) return;
    setAudioLoading(true);
    setAudioError("");

    try {
      const text = cordelData.estrofes
        .map((e) => e.versos.join("\n"))
        .join("\n\n");

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, psalmNumber: currentPsalmNumber }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erro ao gerar o áudio");
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await res.json();
        setAudioUrl(data.url);
        setAudioFileName(data.fileName || "cordel-final.mp3");
        setAudioPathname(data.pathname || null);
        appendHistory({
          tipo: "audio",
          titulo: "Áudio do cordel gerado e salvo",
          detalhes: [
            `Arquivo persistido para a equipe: ${data.fileName || "cordel-final.mp3"}`,
          ],
        });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const fileName = `cordel-final-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.mp3`;
      setAudioUrl(url);
      setAudioFileName(fileName);
      setAudioPathname(null);
      appendHistory({
        tipo: "audio",
        titulo: "Áudio do cordel gerado",
        detalhes: [
          `Arquivo preparado para download: ${fileName}`,
          "Sem Blob configurado, então o áudio ficou disponível apenas nesta sessão.",
        ],
      });
    } catch (e: any) {
      setAudioError(e.message);
    } finally {
      setAudioLoading(false);
    }
  }, [appendHistory, cordelData, currentPsalmNumber]);

  const handleRecord = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (userAudioRecording) {
      mediaRecorderRef.current?.stop();
      setUserAudioRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setUserAudioError("Este navegador não suporta gravação de áudio.");
      return;
    }

    try {
      setUserAudioError("");
      clearUserAudio();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
      ];
      const mimeType = mimeTypes.find((candidate) =>
        MediaRecorder.isTypeSupported(candidate)
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      discardRecordedAudioRef.current = false;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setUserAudioError("Não foi possível gravar a declamação.");
      };
      recorder.onstop = () => {
        const shouldDiscard = discardRecordedAudioRef.current;
        discardRecordedAudioRef.current = false;
        const finalMimeType = recorder.mimeType || mimeType || "audio/webm";
        const extension = finalMimeType.includes("mp4")
          ? "m4a"
          : finalMimeType.includes("mpeg")
          ? "mp3"
          : "webm";
        if (!shouldDiscard) {
          const blob = new Blob(recordingChunksRef.current, { type: finalMimeType });
          const url = URL.createObjectURL(blob);
          userAudioObjectUrlRef.current = url;
          const fileName = `declamacao-usuario-${new Date()
            .toISOString()
            .replace(/[:.]/g, "-")}.${extension}`;

          setUserAudio({
            url,
            fileName,
            mimeType: finalMimeType,
          });
          appendHistory({
            tipo: "audio",
            titulo: "Declamação do cordel gravada",
            detalhes: [`Arquivo pronto para download: ${fileName}`],
          });
        }
        setUserAudioRecording(false);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setUserAudioRecording(true);
      appendHistory({
        tipo: "audio",
        titulo: "Gravação da declamação iniciada",
        detalhes: ["O navegador está capturando o áudio do microfone."],
      });
    } catch (e: any) {
      setUserAudioRecording(false);
      setUserAudioError(e?.message || "Não foi possível acessar o microfone.");
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    }
  }, [appendHistory, clearUserAudio, userAudioRecording]);

  const handleCordelVerseChange = useCallback(
    (estrofeNumero: number, versoIndex: number, value: string) => {
      invalidateSuggestionRequest();
      setCordelData((current) => {
        if (!current) return current;
        return {
          ...current,
          estrofes: current.estrofes.map((est) =>
            est.numero === estrofeNumero
              ? {
                  ...est,
                  versos: est.versos.map((verso, index) =>
                    index === versoIndex ? value : verso
                  ),
                }
              : est
          ),
        };
      });

      if (analysisData) {
        setAnalysisDirty(true);
      }
      setSuggestionResults((current) => {
        if (!current[estrofeNumero]) return current;
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      setSuggestionErrors((current) => {
        if (!current[estrofeNumero]) return current;
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      setAudioUrl(null);
      setAudioFileName(null);
      setAudioPathname(null);
      setAudioError("");
      clearUserAudio();
    },
    [analysisData, clearUserAudio, invalidateSuggestionRequest]
  );

  const handleCordelVerseCommit = useCallback(
    (
      estrofeNumero: number,
      versoIndex: number,
      previousValue: string,
      nextValue: string
    ) => {
      if (previousValue === nextValue) return;

      const stanza = cordelData?.estrofes.find(
        (item) => item.numero === estrofeNumero
      );
      if (stanza) {
        const previousVerses = stanza.versos.map((verse, index) =>
          index === versoIndex ? previousValue : verse
        );
        setStanzaUndoHistory((current) => ({
          ...current,
          [estrofeNumero]: [
            ...(current[estrofeNumero] || []),
            previousVerses,
          ].slice(-20),
        }));
      }

      appendHistory({
        tipo: "edicao",
        titulo: `Edição manual na estrofe ${estrofeNumero}, verso ${versoIndex + 1}`,
        detalhes: [`Antes: "${previousValue}"`, `Depois: "${nextValue}"`],
      });
    },
    [appendHistory, cordelData]
  );

  const handleUndoStanza = useCallback(
    (estrofeNumero: number) => {
      const snapshots = stanzaUndoHistory[estrofeNumero] || [];
      const previousVerses = snapshots[snapshots.length - 1];
      if (!previousVerses) return;

      invalidateSuggestionRequest();
      setCordelData((current) => {
        if (!current) return current;
        return {
          ...current,
          estrofes: current.estrofes.map((stanza) =>
            stanza.numero === estrofeNumero
              ? { ...stanza, versos: [...previousVerses] }
              : stanza
          ),
        };
      });
      setStanzaUndoHistory((current) => ({
        ...current,
        [estrofeNumero]: (current[estrofeNumero] || []).slice(0, -1),
      }));
      setSuggestionResults((current) => {
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      setVerseSelections((current) => ({ ...current, [estrofeNumero]: [] }));
      setSuggestionErrors((current) => {
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      if (analysisData) setAnalysisDirty(true);
      setAudioUrl(null);
      setAudioFileName(null);
      setAudioPathname(null);
      setAudioError("");
      clearUserAudio();
      appendHistory({
        tipo: "edicao",
        titulo: `Tentativa desfeita na estrofe ${estrofeNumero}`,
        detalhes: ["A versão imediatamente anterior da sextilha foi restaurada."],
      });
    },
    [
      analysisData,
      appendHistory,
      clearUserAudio,
      invalidateSuggestionRequest,
      stanzaUndoHistory,
    ]
  );

  const handleToggleSuggestionPanel = useCallback((estrofeNumero: number) => {
    setOpenSuggestionPanels((current) => ({
      ...current,
      [estrofeNumero]: !current[estrofeNumero],
    }));
  }, []);

  const handleToggleVerseSelection = useCallback(
    (estrofeNumero: number, versoIndex: number) => {
      setVerseSelections((current) => {
        const selected = current[estrofeNumero] || [];
        const nextSelection = selected.includes(versoIndex)
          ? selected.filter((index) => index !== versoIndex)
          : selected.length < 2
          ? [...selected, versoIndex].sort((a, b) => a - b)
          : selected;
        return { ...current, [estrofeNumero]: nextSelection };
      });
      setSuggestionResults((current) => {
        if (!current[estrofeNumero]) return current;
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      setSuggestionErrors((current) => {
        if (!current[estrofeNumero]) return current;
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
    },
    []
  );

  const handleSuggestionNoteChange = useCallback(
    (estrofeNumero: number, value: string) => {
      invalidateSuggestionRequest();
      setSuggestionNotes((current) => ({
        ...current,
        [estrofeNumero]: value,
      }));
      setSuggestionResults((current) => {
        if (!current[estrofeNumero]) return current;
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      setSuggestionErrors((current) => {
        if (!current[estrofeNumero]) return current;
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
    },
    [invalidateSuggestionRequest]
  );

  const handleRequestSuggestions = useCallback(
    async (estrofeNumero: number) => {
      if (!cordelData || !meaningMapText.trim()) return;
      const selectedIndexes = verseSelections[estrofeNumero] || [];
      if (selectedIndexes.length < 1 || selectedIndexes.length > 2) return;

      const requestToken = suggestionRequestTokenRef.current + 1;
      suggestionRequestTokenRef.current = requestToken;
      setSuggestionLoadingStanza(estrofeNumero);
      setSuggestionErrors((current) => {
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      setSuggestionResults((current) => {
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });

      try {
        const data = await apiPost("/api/suggest", {
          cordel: cordelData,
          meaningMap: simplifiedMeaningMapText || meaningMapText,
          plan: compositionPlan,
          analysis: analysisDirty ? null : analysisData,
          stanzaNumber: estrofeNumero,
          verseNumbers: selectedIndexes.map((index) => index + 1),
          translatorGoal: suggestionNotes[estrofeNumero] || "",
        });
        if (suggestionRequestTokenRef.current !== requestToken) return;

        const responseIndexes = Array.isArray(data.verseNumbers)
          ? data.verseNumbers.map((number: number) => Number(number) - 1)
          : selectedIndexes;
        setSuggestionResults((current) => ({
          ...current,
          [estrofeNumero]: {
            verseIndexes: responseIndexes,
            alternatives: data.alternatives as LocalSuggestionAlternative[],
            model: data.model,
          },
        }));
        setWorkflowModels((current) => ({
          ...current,
          [`sugestoes_estrofe_${estrofeNumero}`]: data.model,
        }));
        appendHistory({
          tipo: "revisao",
          titulo: `Sugestões localizadas solicitadas para a estrofe ${estrofeNumero}`,
          detalhes: [
            `Versos: ${selectedIndexes.map((index) => index + 1).join(", ")}`,
            `Modelo: ${data.model}`,
            "Três alternativas foram apresentadas sem alterar o cordel.",
          ],
        });
      } catch (requestError: any) {
        if (suggestionRequestTokenRef.current !== requestToken) return;
        setSuggestionErrors((current) => ({
          ...current,
          [estrofeNumero]:
            requestError?.message || "Não foi possível gerar sugestões.",
        }));
      } finally {
        if (suggestionRequestTokenRef.current === requestToken) {
          setSuggestionLoadingStanza(null);
        }
      }
    },
    [
      analysisData,
      analysisDirty,
      appendHistory,
      compositionPlan,
      cordelData,
      meaningMapText,
      simplifiedMeaningMapText,
      suggestionNotes,
      verseSelections,
    ]
  );

  const handleAcceptSuggestion = useCallback(
    (estrofeNumero: number, suggestionIndex: number) => {
      const result = suggestionResults[estrofeNumero];
      const alternative = result?.alternatives[suggestionIndex];
      const stanza = cordelData?.estrofes.find(
        (item) => item.numero === estrofeNumero
      );
      if (!result || !alternative || !stanza) return;

      invalidateSuggestionRequest();
      const previousVerses = [...stanza.versos];
      const nextVerses = [...stanza.versos];
      result.verseIndexes.forEach((verseIndex, offset) => {
        nextVerses[verseIndex] = alternative.versos[offset];
      });
      setStanzaUndoHistory((current) => ({
        ...current,
        [estrofeNumero]: [
          ...(current[estrofeNumero] || []),
          previousVerses,
        ].slice(-20),
      }));
      setCordelData((current) => {
        if (!current) return current;
        return {
          ...current,
          estrofes: current.estrofes.map((item) =>
            item.numero === estrofeNumero
              ? { ...item, versos: nextVerses }
              : item
          ),
        };
      });
      setSuggestionResults((current) => {
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      setVerseSelections((current) => ({ ...current, [estrofeNumero]: [] }));
      setSuggestionErrors((current) => {
        const next = { ...current };
        delete next[estrofeNumero];
        return next;
      });
      if (analysisData) setAnalysisDirty(true);
      setAudioUrl(null);
      setAudioFileName(null);
      setAudioPathname(null);
      setAudioError("");
      clearUserAudio();
      appendHistory({
        tipo: "edicao",
        titulo: `Sugestão da IA aceita na estrofe ${estrofeNumero}`,
        detalhes: result.verseIndexes.flatMap((verseIndex, offset) => [
          `Verso ${verseIndex + 1} antes: "${previousVerses[verseIndex]}"`,
          `Verso ${verseIndex + 1} depois: "${alternative.versos[offset]}"`,
        ]),
      });
    },
    [
      analysisData,
      appendHistory,
      clearUserAudio,
      cordelData,
      invalidateSuggestionRequest,
      suggestionResults,
    ]
  );

  const handleRejectSuggestion = useCallback(
    (estrofeNumero: number, suggestionIndex: number) => {
      setSuggestionResults((current) => {
        const result = current[estrofeNumero];
        if (!result) return current;
        const alternatives = result.alternatives.filter(
          (_, index) => index !== suggestionIndex
        );
        const next = { ...current };
        if (alternatives.length) {
          next[estrofeNumero] = { ...result, alternatives };
        } else {
          delete next[estrofeNumero];
        }
        return next;
      });
    },
    []
  );

  const handleDismissSuggestions = useCallback((estrofeNumero: number) => {
    setSuggestionResults((current) => {
      const next = { ...current };
      delete next[estrofeNumero];
      return next;
    });
  }, []);

  const handleSelectPsalm = useCallback((psalm: number) => {
    setPsalmNumberInput(String(psalm));
    setError("");
    setCatalogError("");
  }, []);

  const handleTextUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;

      try {
        const text = await readUploadedTextFile(file);
        setMeaningMapInput(text);
        setError("");
      } catch (e: any) {
        setError(e?.message || "Não foi possível ler o arquivo enviado.");
      }
    },
    []
  );

  const reportText = buildReportText({
    meaningMapText,
    simplifiedMeaningMapText,
    compositionPlan,
    workflowModels,
    cordelData,
    analysisData,
    analysisDirty,
    historyEntries,
    revisionCount,
    audioFileName,
    audioUrl,
    userAudio,
  });

  const cordelText = cordelData ? cordelToPlainText(cordelData) : "";

  const handleLoadPsalm = useCallback(
    async (psalm: number) => {
      if (
        cordelData &&
        !window.confirm(
          `Carregar o Salmo ${psalm} vai substituir o conteúdo atual na tela. Deseja continuar?`
        )
      ) {
        return;
      }

      try {
        setCatalogSyncing(true);
        const data = await apiGet(`/api/psalms/${psalm}`);
        const record: SavedPsalmRecord = data.record;
        const normalizedAnalysis = normalizeAnalysisData(record.analysisData);
        let storedProcessMap = record.simplifiedMeaningMapText || "";
        if (!storedProcessMap && record.meaningMapText.trim()) {
          try {
            const simplifyResponse = await apiPost("/api/simplify", {
              meaningMap: record.meaningMapText,
            });
            storedProcessMap = String(simplifyResponse.simplifiedMap || "");
          } catch {
            storedProcessMap = record.meaningMapText;
          }
        }

        setMeaningMapInput(record.meaningMapText);
        setMeaningMapText(record.meaningMapText);
        setSimplifiedMeaningMapText(storedProcessMap);
        setPsalmNumberInput(String(record.salmo));
        setCordelData(record.cordelData);
        setCompositionPlan(record.compositionPlan || null);
        setWorkflowModels(record.workflowModels || {});
        setAnalysisData(record.analysisData ? normalizedAnalysis : null);
        setAnalysisDirty(record.analysisDirty);
        setHistoryEntries(record.historyEntries);
        setRevisionCount(record.revisionCount);
        setPhase("completed");
        setActiveTab(record.analysisData ? "metrica" : "relatorio");
        setAudioUrl(record.audioUrl);
        setAudioFileName(record.audioFileName);
        setAudioPathname(record.audioPathname || null);
        setAudioError("");
        clearUserAudio();
        resetLocalEditingState();
        setCatalogError("");
        setError("");
      } catch (e: any) {
        setCatalogError(e.message);
        setError(e.message);
      } finally {
        setCatalogSyncing(false);
      }
    },
    [clearUserAudio, cordelData, resetLocalEditingState]
  );

  const handleSaveCurrentPsalm = useCallback(async () => {
    if (!cordelData) {
      setError("Forje um cordel antes de salvá-lo no catálogo.");
      return;
    }

    if (currentPsalmNumber == null) {
      setError("Informe o número do salmo entre 1 e 150 para salvar no catálogo.");
      return;
    }

    const saveMoment = fmtDateTime();
    const saveEntry: HistoryEntry = {
      id: historyEntries.length + 1,
      momento: saveMoment,
      tipo: "catalogo",
      titulo: currentSavedItem
        ? `Salmo ${currentPsalmNumber} atualizado no catálogo`
        : `Salmo ${currentPsalmNumber} salvo no catálogo`,
      detalhes: [
        `Estrofes armazenadas: ${cordelData.estrofes.length}`,
        analysisData
          ? analysisDirty
            ? "A última análise foi salva como desatualizada."
            : "A última análise foi salva como atualizada."
          : "Ainda sem análise registrada.",
      ],
    };

    const nextHistory = [...historyEntries, saveEntry];
    const persistedAudioUrl =
      audioUrl && /^https?:\/\//i.test(audioUrl) ? audioUrl : null;
    const nextRecord: SavedPsalmRecord = {
      salmo: currentPsalmNumber,
      modo: "compose",
      status: derivePsalmStatus({ analysisData, analysisDirty }),
      salvoEm: new Date().toISOString(),
      analysisDirty,
      meaningMapText: meaningMapText || meaningMapInput,
      simplifiedMeaningMapText,
      compositionPlan,
      workflowModels,
      cordelData,
      analysisData,
      historyEntries: nextHistory,
      revisionCount,
      audioUrl: persistedAudioUrl,
      audioFileName: persistedAudioUrl ? audioFileName : null,
      audioPathname: persistedAudioUrl ? audioPathname : null,
      reportText,
    };

    try {
      setCatalogSyncing(true);
      const data = await apiPost(`/api/psalms/${currentPsalmNumber}`, {
        record: nextRecord,
      });
      const savedRecord: SavedPsalmRecord = data.record;

      setHistoryEntries(savedRecord.historyEntries);
      setCatalog((current) => upsertCatalogItem(current, data.catalogItem));
      setAudioUrl(savedRecord.audioUrl || audioUrl);
      setAudioFileName(savedRecord.audioFileName || audioFileName);
      setAudioPathname(savedRecord.audioPathname || null);
      setCatalogError("");
      setError("");
    } catch (e: any) {
      setCatalogError(e.message);
      setError(e.message);
    } finally {
      setCatalogSyncing(false);
    }
  }, [
    analysisData,
    analysisDirty,
    audioFileName,
    audioPathname,
    audioUrl,
    cordelData,
    currentPsalmNumber,
    currentSavedItem,
    historyEntries,
    meaningMapInput,
    meaningMapText,
    simplifiedMeaningMapText,
    compositionPlan,
    reportText,
    revisionCount,
    workflowModels,
  ]);

  const handleCopyReport = useCallback(() => {
    if (!reportText) return;
    navigator.clipboard.writeText(reportText);
  }, [reportText]);

  const handleCopyMeaningMap = useCallback(() => {
    const sourceMap = meaningMapInput.trim() || meaningMapText.trim();
    if (!sourceMap) return;
    navigator.clipboard.writeText(sourceMap);
  }, [meaningMapInput, meaningMapText]);

  const handleDownloadMeaningMap = useCallback(() => {
    const sourceMap = meaningMapInput.trim() || meaningMapText.trim();
    if (!sourceMap) return;
    downloadTextFile(
      sourceMap,
      buildMeaningMapFileName(currentPsalmNumber),
      "text/markdown"
    );
  }, [currentPsalmNumber, meaningMapInput, meaningMapText]);

  const handleDownloadReport = useCallback(() => {
    if (!reportText) return;
    downloadTextFile(reportText, buildReportFileName(currentPsalmNumber), "text/markdown");
  }, [currentPsalmNumber, reportText]);

  const handleDownloadCordel = useCallback(() => {
    if (!cordelText) return;
    downloadTextFile(cordelText, buildCordelFileName(currentPsalmNumber), "text/plain");
  }, [cordelText, currentPsalmNumber]);

  const handleDownloadElevenLabsAudio = useCallback(async () => {
    if (!audioUrl) return;
    try {
      await downloadRemoteFile(audioUrl, audioFileName || "audio-elevenlabs.mp3");
    } catch (e: any) {
      setAudioError(e.message);
    }
  }, [audioFileName, audioUrl]);

  const handleDownloadUserAudio = useCallback(async () => {
    if (!userAudio?.url) return;
    try {
      await downloadRemoteFile(userAudio.url, userAudio.fileName);
    } catch (e: any) {
      setUserAudioError(e.message);
    }
  }, [userAudio]);

  const hasIssues = hasAnalysisIssues(analysisData);

  const showResults = phase === "completed";

  const tabs: { id: "metrica" | "fidelidade" | "relatorio"; label: string; always: boolean }[] = [
    { id: "metrica", label: "Métrica", always: false },
    { id: "fidelidade", label: "Fidelidade", always: false },
    { id: "relatorio", label: "Relatório", always: true },
  ];

  const saveLabel =
    currentPsalmNumber != null
      ? currentSavedItem
        ? `Atualizar Salmo ${currentPsalmNumber}`
        : `Salvar Salmo ${currentPsalmNumber}`
      : "Salvar no Catálogo";
  const canSaveCurrentPsalm = !!cordelData && currentPsalmNumber != null;
  const inputInstruction =
    "Cole ou suba o Mapa de Significado exatamente como saiu do Portal. A Forja fará uma redução extrativa, sem resumir nem reescrever o texto: a composição usará esse recorte literal, e a auditoria teológica continuará comparando o cordel ao Mapa original completo.";

  // ── Render ──

  return (
    <div className="min-h-screen bg-preto px-3 py-4 sm:px-5 md:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border-[5px] border-preto bg-cream shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <header className="border-b-[5px] border-preto bg-parchment">
          <CordelBanner className="w-full border-b-[5px] border-preto" />
          <div className="px-5 py-6 text-center sm:px-8 md:px-10">
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-preto bg-[var(--parchment-dark)] px-4 py-1 font-mono text-[11px] uppercase tracking-[0.32em] text-preto">
              Folheto Digital
            </div>
            <h1 className="mt-5 font-heading text-4xl font-bold uppercase tracking-[0.08em] text-preto sm:text-5xl">
              Forja de Cordel
            </h1>
            <p className="mx-auto mt-3 max-w-3xl font-body text-sm uppercase tracking-[0.18em] text-brown-mid sm:text-base">
              <span className="block">Tradução Oral Performática da Bíblia</span>
              <span className="mt-1 block">Sextilhas em Redondilha Maior</span>
            </p>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 md:px-10 md:py-8">

        {/* INPUT */}
        {(phase === "input" || phase === "error") && (
          <section className="rounded-[24px] border-[3px] border-preto bg-parchment px-4 py-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.12)] sm:px-6 sm:py-6">
            <div className="mb-2 font-heading text-xs font-semibold uppercase tracking-widest text-brown-mid">
              Nova Composição
            </div>
            <h2 className="font-heading text-2xl font-bold uppercase tracking-[0.05em] text-preto sm:text-3xl">
              Do Mapa ao Cordel
            </h2>
            <div className="mb-4 rounded-[18px] border-2 border-preto bg-[var(--parchment-dark)] px-4 py-3 font-body text-[13px] leading-relaxed text-preto">
              {inputInstruction}
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="block font-heading text-xs font-semibold uppercase tracking-widest text-brown-mid">
                  Mapa de Significado Completo
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={meaningMapFileInputRef}
                    type="file"
                    accept=".txt,.md,.text,.docx"
                    className="hidden"
                    onChange={(e) => {
                      void handleTextUpload(e.target.files?.[0] || null);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => meaningMapFileInputRef.current?.click()}
                    className="rounded-full border border-preto bg-[var(--parchment-dark)] px-3 py-1.5 font-heading text-xs font-semibold text-preto transition-all"
                  >
                    Subir Arquivo
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyMeaningMap}
                    disabled={!meaningMapInput.trim()}
                    className="rounded-full border border-preto bg-cream px-3 py-1.5 font-heading text-xs font-semibold text-preto transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Copiar Mapa
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadMeaningMap}
                    disabled={!meaningMapInput.trim()}
                    className="rounded-full border border-preto bg-cream px-3 py-1.5 font-heading text-xs font-semibold text-preto transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Baixar Mapa
                  </button>
                </div>
              </div>
              <textarea
                className="min-h-[360px] w-full resize-y rounded-[18px] border-2 border-preto bg-cream p-4 font-body text-sm leading-relaxed text-preto shadow-[inset_0_0_0_1px_rgba(15,12,8,0.08)]"
                value={meaningMapInput}
                onChange={(e) => setMeaningMapInput(e.target.value)}
                maxLength={120000}
                placeholder="Cole aqui o Mapa de Significado completo, incluindo os Níveis 1, 2 e 3..."
              />
              <div className="mt-3 grid gap-2 font-mono text-[11px] text-brown-mid sm:grid-cols-4">
                <span>01 · Texto direto do Portal</span>
                <span>02 · Redução automática e literal</span>
                <span>03 · .txt, .md ou .docx</span>
                <span>04 · {meaningMapInput.length.toLocaleString("pt-BR")}/120.000 caracteres</span>
              </div>
            </div>
            {error && (
              <div role="alert" className="mt-3 whitespace-pre-wrap rounded-[16px] border-2 border-preto bg-[var(--parchment-dark)] px-4 py-3 font-body text-[13px] text-preto">
                {error}
              </div>
            )}
            <div className="mt-4">
              <button
                onClick={handleCompose}
                disabled={!meaningMapInput.trim()}
                className="btn-primary cursor-pointer rounded-full border-2 border-preto bg-preto px-6 py-2.5 font-heading text-sm font-bold text-cream transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Forjar Cordel
              </button>
              <span className="ml-3 font-body text-xs text-brown-mid">
                Inclui preparação do Mapa, composição e auditoria independente.
              </span>
            </div>
          </section>
        )}

        {/* LOADING */}
        {isLoading && (
          <div aria-live="polite" className="rounded-[24px] border-[3px] border-preto bg-parchment px-6 py-12 text-center">
            <div className="inline-block w-6 h-6 border-[3px] border-parchment-dark border-t-telha rounded-full animate-spin-slow" />
            <p className="font-heading text-[15px] text-brown-mid mt-3 mb-1">
              {phaseLabels[phase] || "Processando"}…
            </p>
            <p className="font-mono text-3xl font-bold text-telha m-0">
              {fmtTime(elapsed)}
            </p>
            <PipelineProgress phase={phase} revisionCount={revisionCount} />
            <p className="mx-auto mt-5 max-w-xl font-body text-xs leading-relaxed text-brown-mid">
              {phase === "simplifying"
                ? "A Forja está apenas removendo links, marcas do Portal e blocos dispensáveis. Nenhuma frase do Mapa é resumida, parafraseada ou regenerada."
                : phase === "revising"
                ? "A revisão por IA é opcional e será seguida por uma nova auditoria independente."
                : "Depois da composição, a Forja executa uma auditoria independente contra o Mapa original completo e entrega o resultado para lapidação humana."}
            </p>
          </div>
        )}

        {/* RESULTS */}
        {showResults && cordelData && (
          <section className="rounded-[24px] border-[3px] border-preto bg-parchment px-4 py-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.12)] sm:px-6 sm:py-6">
            <CordelView
              data={cordelData}
              stanzaUndoHistory={stanzaUndoHistory}
              verseSelections={verseSelections}
              suggestionResults={suggestionResults}
              suggestionNotes={suggestionNotes}
              suggestionErrors={suggestionErrors}
              openSuggestionPanels={openSuggestionPanels}
              suggestionLoadingStanza={suggestionLoadingStanza}
              audioUrl={audioUrl}
              userAudio={userAudio}
              audioLoading={audioLoading}
              userAudioRecording={userAudioRecording}
              audioError={audioError}
              userAudioError={userAudioError}
              onVerseChange={handleCordelVerseChange}
              onVerseCommit={handleCordelVerseCommit}
              onUndoStanza={handleUndoStanza}
              onToggleSuggestionPanel={handleToggleSuggestionPanel}
              onToggleVerseSelection={handleToggleVerseSelection}
              onSuggestionNoteChange={handleSuggestionNoteChange}
              onRequestSuggestions={handleRequestSuggestions}
              onAcceptSuggestion={handleAcceptSuggestion}
              onRejectSuggestion={handleRejectSuggestion}
              onDismissSuggestions={handleDismissSuggestions}
              onListen={handleListen}
              onRecord={handleRecord}
            />

            <div className="mt-10 border-t-[3px] border-preto pt-7">
              <PipelineBadges revisionCount={revisionCount} />
              <div className="mb-4">
                <div className="font-heading text-xs font-semibold uppercase tracking-widest text-brown-mid">
                  Controle de Qualidade
                </div>
                <h2 className="mt-1 font-heading text-2xl font-bold uppercase tracking-[0.05em] text-preto sm:text-3xl">
                  Relatórios da Auditoria
                </h2>
              </div>

              {analysisDirty && analysisData ? (
                <div className="mb-4 rounded-[18px] border-2 border-preto bg-[var(--amber-light)] px-4 py-3 font-body text-[13px] leading-relaxed text-preto">
                  Você editou o cordel após a última análise. Os relatórios podem estar desatualizados até você analisar novamente.
                </div>
              ) : null}

              <div className="mb-5 flex flex-wrap gap-2 border-b-2 border-preto/20 pb-3">
                {tabs.map((tab) => {
                  const enabled = tab.always || !!analysisData;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => enabled && setActiveTab(tab.id)}
                      aria-pressed={activeTab === tab.id}
                      disabled={!enabled}
                      className={`rounded-full border-2 px-4 py-2 font-heading text-sm font-semibold transition-all ${
                        activeTab === tab.id
                          ? "border-preto bg-preto text-cream"
                          : enabled
                          ? "cursor-pointer border-preto bg-cream text-preto"
                          : "cursor-default border-preto/15 bg-cream text-brown-light/60"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === "metrica" && analysisData && (
                <MetricaView data={analysisData} />
              )}
              {activeTab === "fidelidade" && analysisData && (
                <FidelidadeView data={analysisData} cordelData={cordelData} />
              )}
              {activeTab === "relatorio" && (
                <ReportView
                  reportText={reportText}
                  cordelText={cordelText}
                  psalmNumber={currentPsalmNumber}
                  historyEntries={historyEntries}
                  analysisData={analysisData}
                  analysisDirty={analysisDirty}
                  audioUrl={audioUrl}
                  audioFileName={audioFileName}
                  userAudio={userAudio}
                  onCopyReport={handleCopyReport}
                  onDownloadReport={handleDownloadReport}
                  onDownloadCordel={handleDownloadCordel}
                  onDownloadElevenLabsAudio={handleDownloadElevenLabsAudio}
                  onDownloadUserAudio={handleDownloadUserAudio}
                />
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex gap-2.5 flex-wrap">
              {analysisDirty && (
                <button
                  onClick={handleAnalyze}
                  className="btn-primary cursor-pointer rounded-full border-2 border-preto bg-preto px-5 py-2.5 font-heading text-sm font-bold text-cream transition-all"
                >
                  Reanalisar Após Edição
                </button>
              )}
              {!analysisDirty && hasIssues && (
                <button
                  onClick={handleRevise}
                  className="btn-primary cursor-pointer rounded-full border-2 border-preto bg-preto px-5 py-2.5 font-heading text-sm font-bold text-cream transition-all"
                >
                  Revisar todos os problemas com IA
                </button>
              )}
              <button
                onClick={() => {
                  setPhase("input");
                  setError("");
                  setAnalysisDirty(false);
                  setHistoryEntries([]);
                  setSimplifiedMeaningMapText("");
                  setCompositionPlan(null);
                  setWorkflowModels({});
                  setCordelData(null);
                  setAnalysisData(null);
                  setRevisionCount(0);
                  setAudioUrl(null);
                  setAudioFileName(null);
                  setAudioPathname(null);
                  setAudioError("");
                  clearUserAudio();
                  resetLocalEditingState();
                  setActiveTab("metrica");
                }}
                className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all"
              >
                Novo Mapa
              </button>
              <button
                onClick={handleCopyMeaningMap}
                className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all"
              >
                Copiar Mapa
              </button>
              <button
                onClick={handleDownloadMeaningMap}
                className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all"
              >
                Baixar Mapa
              </button>
              {cordelData && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(cordelToPlainText(cordelData));
                  }}
                  className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all"
                >
                  Copiar Cordel
                </button>
              )}
            </div>
          </section>
        )}

        <CatalogView
          catalog={catalog}
          currentPsalmNumber={currentPsalmNumber}
          inferredPsalmNumber={inferredPsalmNumber}
          psalmNumberInput={psalmNumberInput}
          onPsalmNumberInputChange={setPsalmNumberInput}
          onSelectPsalm={handleSelectPsalm}
          onLoadPsalm={handleLoadPsalm}
          onSaveCurrentPsalm={handleSaveCurrentPsalm}
          canSave={canSaveCurrentPsalm}
          saveLabel={saveLabel}
          currentSavedItem={currentSavedItem}
          loading={catalogLoading}
          syncing={catalogSyncing}
          error={catalogError}
        />

        {/* Footer */}
        <footer className="mt-12 text-center">
          <div className="mx-auto h-px w-full max-w-4xl bg-preto/15" />
          <div className="flex justify-center items-center gap-2 mt-4">
            <ShemaIcon className="w-5 h-5 text-preto" />
            <span className="font-mono text-[11px] text-brown-light">
              OBT Lab · Shema Bible Translation · YWAM Kansas City
            </span>
          </div>
        </footer>
        </main>
      </div>
    </div>
  );
}
