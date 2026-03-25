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
  estrofes: Estrofe[];
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
}

interface FidelidadeItem {
  proposicao: number;
  status: "PRESENTE" | "PARCIAL" | "AUSENTE";
  estrofe?: number;
  nota?: string;
}

interface Adicao {
  texto: string;
  estrofe: number;
  avaliacao: string;
}

interface AnalysisData {
  estrofes: EstrofeAnalysis[];
  fidelidade: FidelidadeItem[];
  adicoes: Adicao[];
}

type HistoryEntryType =
  | "origem"
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

type InputMode = "compose" | "analyze-existing";

type Phase =
  | "input"
  | "composing"
  | "composed"
  | "analyzing"
  | "analyzed"
  | "revising"
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

function cordelToPlainText(data: CordelData) {
  return data.estrofes.map((e) => e.versos.join("\n")).join("\n\n");
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

  return Boolean(
    data.estrofes?.some(
      (estrofe) => estrofe.versos?.some((verso) => !verso.correto) || !estrofe.rima_ok
    ) ||
    data.adicoes?.length > 0 ||
    data.fidelidade?.some((item) => item.status !== "PRESENTE")
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
  inputMode,
  meaningMapText,
  cordelData,
  analysisData,
  analysisDirty,
  historyEntries,
  revisionCount,
  audioFileName,
  audioUrl,
}: {
  inputMode: InputMode;
  meaningMapText: string;
  cordelData: CordelData | null;
  analysisData: AnalysisData | null;
  analysisDirty: boolean;
  historyEntries: HistoryEntry[];
  revisionCount: number;
  audioFileName: string | null;
  audioUrl: string | null;
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
            `- Estrofe ${item.estrofe}: "${item.texto}"\n  Motivo: ${item.avaliacao}`
        )
        .join("\n")
    : "- Nenhuma adição semântica detectada.";

  const fidelityBlock = analysisData?.fidelidade?.length
    ? analysisData.fidelidade
        .map((item) => {
          const estrofe = item.estrofe ? ` | Estrofe ${item.estrofe}` : "";
          const nota = item.nota ? ` | Nota: ${item.nota}` : "";
          return `- Proposição ${item.proposicao}: ${item.status}${estrofe}${nota}`;
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

  return [
    "# Relatório de Análise do Cordel",
    "",
    `- Última atualização: ${lastEvent}`,
    `- Modo de entrada: ${
      inputMode === "compose"
        ? "Compor do Mapa de Significado"
        : "Analisar Cordel Existente"
    }`,
    `- Estado da análise: ${analysisStatus}`,
    `- Revisões automáticas realizadas: ${revisionCount}`,
    `- Áudio: ${
      audioUrl
        ? `Disponível${audioFileName ? ` (${audioFileName})` : ""}.`
        : "Ainda não gerado."
    }`,
    audioUrl ? `- Link do áudio: ${audioUrl}` : null,
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
    `- Adições semânticas detectadas: ${summary.additions}`,
    "",
    "## Mapa de Significado",
    "",
    meaningMapText.trim() || "Mapa de Significado não informado.",
    "",
    "## Cordel Final",
    "",
    cordelToPlainText(cordelData),
    "",
    "## Análise de Fidelidade",
    "",
    fidelityBlock,
    "",
    "## Adições Semânticas Detectadas",
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

function extractPropositionsText(text: string) {
  const level3Match = text.match(/##\s*Level\s*3[\s\S]*/i);
  return (level3Match ? level3Match[0] : text).trim();
}

function parseExistingCordelText(text: string): CordelData {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    throw new Error("Cole o cordel completo para continuar.");
  }

  const estrofes = normalized
    .split(/\n\s*\n/)
    .map((estrofe) =>
      estrofe
        .split("\n")
        .map((verso) => verso.trim())
        .filter(Boolean)
    )
    .filter((versos) => versos.length > 0)
    .map((versos, index) => ({
      numero: index + 1,
      versos,
    }));

  if (!estrofes.length) {
    throw new Error("Não foi possível identificar estrofes no cordel colado.");
  }

  return { estrofes };
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
  phase,
  revisionCount,
}: {
  phase: Phase;
  revisionCount: number;
}) {
  const done =
    "font-mono text-[11px] text-cream bg-preto px-2 py-0.5 rounded-full border border-preto";
  const pending =
    "font-mono text-[11px] text-preto bg-parchment-dark px-2 py-0.5 rounded-full border border-preto/30";
  const rev =
    "font-mono text-[11px] text-preto bg-[var(--amber-light)] px-2 py-0.5 rounded-full border border-preto/30";

  return (
    <div className="flex flex-wrap gap-2 items-center mb-5">
      <span className={done}>✓ Planejador</span>
      <span className={done}>✓ Vocabulário</span>
      <span className={done}>✓ Compositor</span>
      <span className={phase === "analyzed" ? done : pending}>
        {phase === "analyzed" ? "✓" : "○"} Análise
      </span>
      {revisionCount > 0 && (
        <span className={rev}>Rev. {revisionCount}/3</span>
      )}
    </div>
  );
}

// ── Tab views ──

function CordelView({
  data,
  analysisData,
  analysisDirty,
  audioUrl,
  audioLoading,
  audioError,
  onVerseChange,
  onVerseCommit,
  onListen,
}: {
  data: CordelData;
  analysisData: AnalysisData | null;
  analysisDirty: boolean;
  audioUrl: string | null;
  audioLoading: boolean;
  audioError: string;
  onVerseChange: (estrofeNumero: number, versoIndex: number, value: string) => void;
  onVerseCommit: (
    estrofeNumero: number,
    versoIndex: number,
    previousValue: string,
    nextValue: string
  ) => void;
  onListen: () => void;
}) {
  return (
    <div>
      {analysisData?.adicoes?.length ? (
        <div className="mb-4 rounded-[20px] border-2 border-preto bg-[var(--parchment-dark)] p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.08)]">
          <div className="font-heading text-xs font-bold text-brown-light uppercase tracking-widest mb-2.5">
            Adições Semânticas a Ajustar
          </div>
          {analysisData.adicoes.map((a, i) => (
            <div key={`${a.estrofe}-${i}`} className="py-1.5 border-b border-preto/10 last:border-b-0">
              <div className="font-body text-sm text-preto">
                Adição detectada na estrofe {a.estrofe}: <span className="italic">&ldquo;{a.texto}&rdquo;</span>
              </div>
              <div className="font-mono text-[11px] text-brown-mid mt-1">Motivo: {a.avaliacao}</div>
            </div>
          ))}
        </div>
      ) : null}

      {analysisDirty && analysisData ? (
        <div className="mb-4 rounded-[18px] border-2 border-preto bg-[var(--amber-light)] px-4 py-3 font-body text-[13px] leading-relaxed text-preto">
          Você editou o cordel após a última análise. Os avisos de métrica e fidelidade podem estar desatualizados até você analisar novamente.
        </div>
      ) : null}

      {data.estrofes.map((est) => (
        <div
          key={est.numero}
          className="mb-4 rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]"
        >
          <div className="font-heading text-xs font-bold text-brown-light uppercase tracking-widest mb-2.5">
            Estrofe {est.numero}
          </div>
          {est.versos.map((v, i) => (
            <textarea
              key={i}
              rows={1}
              value={v}
              onChange={(e) => onVerseChange(est.numero, i, e.target.value)}
              onFocus={(e) => {
                e.currentTarget.dataset.initialValue = v;
              }}
              onBlur={(e) =>
                onVerseCommit(
                  est.numero,
                  i,
                  e.currentTarget.dataset.initialValue || "",
                  e.currentTarget.value
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              className="mb-2 block w-full resize-y rounded-[14px] border border-preto/20 bg-[var(--parchment-dark)] px-3 py-2 font-body text-[17px] leading-[1.7] italic text-preto shadow-[inset_0_0_0_1px_rgba(15,12,8,0.04)]"
            />
          ))}
          {est.proposicoes_cobertas && (
            <p className="font-mono text-[11px] text-brown-light mt-2.5 mb-0">
              ↳ {est.proposicoes_cobertas}
            </p>
          )}
          {est.numero < data.estrofes.length && <XiloDivider />}
        </div>
      ))}

      {/* Listen button */}
      <div className="mt-4 flex items-center gap-3">
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
        {audioUrl && (
          <audio controls src={audioUrl} className="h-8" />
        )}
        {audioError && (
          <span className="font-mono text-xs text-[var(--red)]">{audioError}</span>
        )}
      </div>
    </div>
  );
}

function ReportView({
  reportText,
  historyEntries,
  analysisData,
  analysisDirty,
  audioUrl,
  audioFileName,
  onCopyReport,
  onDownloadReport,
}: {
  reportText: string;
  historyEntries: HistoryEntry[];
  analysisData: AnalysisData | null;
  analysisDirty: boolean;
  audioUrl: string | null;
  audioFileName: string | null;
  onCopyReport: () => void;
  onDownloadReport: () => void;
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
        {audioUrl ? (
          <a
            href={audioUrl}
            download={audioFileName || "cordel-final.mp3"}
            className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all"
          >
            Baixar Áudio
          </a>
        ) : null}
      </div>

      <div className="rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]">
        <div className="font-heading text-xs font-bold text-brown-light uppercase tracking-widest mb-2.5">
          Relatório Final
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
    <section className="mt-8 rounded-[24px] border-[3px] border-preto bg-parchment px-4 py-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.12)] sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-bold uppercase tracking-[0.08em] text-preto">
            Catálogo dos Salmos
          </h2>
          <p className="mt-1 max-w-2xl font-body text-sm text-brown-mid">
            Catálogo sincronizado para toda a equipe. O banco compartilhado guarda texto, análise, relatório, histórico e o link do áudio persistido. Clique em um salmo salvo para carregar a versão compartilhada ou marque o próximo salmo a trabalhar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge ok={completed > 0}>{completed}/150 prontos</Badge>
          <Badge ok={inProgress === 0}>{inProgress} em andamento</Badge>
          <Badge ok={remaining === 0}>{remaining} faltando</Badge>
        </div>
      </div>

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
    </section>
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
    <div>
      {/* Summary */}
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

      {/* Per-strophe */}
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
  );
}

function FidelidadeView({ data }: { data: AnalysisData }) {
  const statusStyle: Record<string, string> = {
    PRESENTE: "bg-preto text-cream border border-preto",
    PARCIAL: "bg-[var(--amber-light)] text-preto border border-preto/20",
    AUSENTE: "bg-[var(--parchment-dark)] text-preto border border-preto/20",
  };

  return (
    <div>
      <div className="mb-4 rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]">
        <div className="font-heading text-xs font-bold text-brown-light uppercase tracking-widest mb-2.5">
          Cobertura das Proposições
        </div>
        {data.fidelidade.map((p) => (
          <div
            key={p.proposicao}
            className="flex items-center gap-2.5 py-1.5 border-b border-parchment-dark flex-wrap"
          >
            <span
              className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full ${
                statusStyle[p.status] || statusStyle.PARCIAL
              }`}
            >
              {p.status}
            </span>
            <span className="font-body text-sm">
              Proposição {p.proposicao}
              {p.estrofe ? ` → Est. ${p.estrofe}` : ""}
            </span>
            {p.nota && (
              <span className="font-mono text-[11px] text-brown-light">
                — {p.nota}
              </span>
            )}
          </div>
        ))}
      </div>

      {data.adicoes?.length > 0 && (
        <div className="mb-4 rounded-[20px] border-2 border-preto bg-cream p-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.06)]">
          <div className="font-heading text-xs font-bold text-brown-light uppercase tracking-widest mb-2.5">
            Adições Semânticas Detectadas
          </div>
          {data.adicoes.map((a, i) => (
            <div
              key={i}
              className="py-1.5 border-b border-parchment-dark"
            >
              <span className="font-body text-sm italic">
                Adição detectada: &ldquo;{a.texto}&rdquo; (Est. {a.estrofe})
              </span>
              <br />
              <span className="font-mono text-xs text-brown-mid">
                Motivo: {a.avaliacao}
              </span>
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
  const [existingCordelInput, setExistingCordelInput] = useState("");
  const [psalmNumberInput, setPsalmNumberInput] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("compose");
  const [phase, setPhase] = useState<Phase>("input");
  const [cordelData, setCordelData] = useState<CordelData | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [catalog, setCatalog] = useState<PsalmCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [meaningMapText, setMeaningMapText] = useState("");
  const [activeTab, setActiveTab] = useState<"cordel" | "metrica" | "fidelidade" | "relatorio">("cordel");
  const [error, setError] = useState("");
  const [revisionCount, setRevisionCount] = useState(0);

  // Audio
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioPathname, setAudioPathname] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState("");

  const isLoading = ["composing", "analyzing", "revising"].includes(phase);
  const elapsed = useTimer(isLoading);

  const phaseLabels: Record<string, string> = {
    composing: "Forjando sextilhas (3 agentes)",
    analyzing: "Analisando métrica e fidelidade",
    revising: "Revisando estrofes com problemas",
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

  const inferredPsalmNumber = extractPsalmNumber(meaningMapText || meaningMapInput);
  const currentPsalmNumber = normalizePsalmNumber(psalmNumberInput) ?? inferredPsalmNumber;
  const currentSavedItem =
    currentPsalmNumber != null
      ? catalog.find((item) => item.salmo === currentPsalmNumber) || null
      : null;

  // ── Handlers ──

  const handleCompose = useCallback(async () => {
    if (!meaningMapInput.trim()) return;
    setPhase("composing");
    setError("");
    setCordelData(null);
    setAnalysisData(null);
    setAnalysisDirty(false);
    setHistoryEntries([]);
    setMeaningMapText(meaningMapInput);
    setActiveTab("cordel");
    setRevisionCount(0);
    setAudioUrl(null);
    setAudioFileName(null);
    setAudioPathname(null);
    setAudioError("");

    try {
      const data = await apiPost("/api/compose", { meaningMap: meaningMapInput });
      setCordelData(data.cordel);
      setHistoryEntries([
        {
          id: 1,
          momento: fmtDateTime(),
          tipo: "origem",
          titulo: "Cordel composto a partir do Mapa de Significado",
          detalhes: [
            `Estrofes geradas: ${data.cordel.estrofes.length}`,
            "Origem: fluxo de composição automática.",
          ],
        },
      ]);
      setPhase("composed");
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [meaningMapInput]);

  const handleAnalyzeExisting = useCallback(() => {
    if (!existingCordelInput.trim() || !meaningMapInput.trim()) return;
    setError("");
    setCordelData(null);
    setAnalysisData(null);
    setAnalysisDirty(false);
    setHistoryEntries([]);
    setActiveTab("cordel");
    setRevisionCount(0);
    setAudioUrl(null);
    setAudioFileName(null);
    setAudioPathname(null);
    setAudioError("");

    try {
      const cordel = parseExistingCordelText(existingCordelInput);
      setCordelData(cordel);
      setMeaningMapText(meaningMapInput);
      setHistoryEntries([
        {
          id: 1,
          momento: fmtDateTime(),
          tipo: "origem",
          titulo: "Cordel importado para análise",
          detalhes: [
            `Estrofes importadas: ${cordel.estrofes.length}`,
            "Origem: cola de cordel existente.",
          ],
        },
      ]);
      setPhase("composed");
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [existingCordelInput, meaningMapInput]);

  const handleAnalyze = useCallback(async () => {
    const propositions = extractPropositionsText(meaningMapText);
    if (!cordelData || !propositions.trim()) return;
    setPhase("analyzing");
    setError("");
    setAnalysisData(null);
    setAnalysisDirty(false);

    try {
      const data = await apiPost("/api/analyze", {
        cordel: cordelData,
        propositions,
      });
      setAnalysisData(data.analysis);
      setAnalysisDirty(false);
      const summary = summarizeAnalysis(data.analysis);
      appendHistory({
        tipo: "analise",
        titulo: "Análise métrica e de fidelidade concluída",
        detalhes: [
          `Versos corretos: ${summary.correctVerses}/${summary.totalVerses}`,
          `Rimas corretas: ${summary.correctRhymes}/${summary.totalRhymes}`,
          `Proposições ausentes: ${summary.ausentes}`,
          `Adições semânticas detectadas: ${summary.additions}`,
        ],
      });
      setPhase("analyzed");
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [appendHistory, cordelData, meaningMapText]);

  const handleRevise = useCallback(async () => {
    const propositions = extractPropositionsText(meaningMapText);
    if (!cordelData || !analysisData || !propositions.trim()) return;
    setPhase("revising");
    setError("");

    try {
      const issues: string[] = [];
      analysisData.estrofes?.forEach((est) => {
        const bad = est.versos?.filter((v) => !v.correto) || [];
        if (bad.length)
          issues.push(`Estrofe ${est.numero}: ${bad.length} verso(s) métrica errada`);
        if (!est.rima_ok)
          issues.push(`Estrofe ${est.numero}: rima falhou`);
      });
      analysisData.adicoes?.forEach((a) =>
        issues.push(`Estrofe ${a.estrofe}: adição — "${a.texto}"`)
      );
      analysisData.fidelidade
        ?.filter((f) => f.status === "AUSENTE")
        .forEach((f) => issues.push(`Proposição ${f.proposicao} AUSENTE`));

      const data = await apiPost("/api/revise", {
        cordel: cordelData,
        issues,
        propositions,
      });
      const changeDetails = describeCordelChanges(cordelData, data.cordel);
      setCordelData(data.cordel);
      setAnalysisData(null);
      setAnalysisDirty(false);
      setRevisionCount((c) => c + 1);
      appendHistory({
        tipo: "revisao",
        titulo: `Revisão automática ${revisionCount + 1} aplicada`,
        detalhes: [
          ...issues.slice(0, 5),
          ...(changeDetails.length ? changeDetails.slice(0, 8) : ["Nenhuma alteração textual detectada."]),
        ],
      });
      setPhase("composed");
      setActiveTab("cordel");
      setAudioUrl(null);
      setAudioFileName(null);
      setAudioPathname(null);
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  }, [appendHistory, cordelData, analysisData, meaningMapText, revisionCount]);

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

  const handleCordelVerseChange = useCallback(
    (estrofeNumero: number, versoIndex: number, value: string) => {
      setCordelData((current) => {
        if (!current) return current;
        return {
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
      if (phase === "analyzed") {
        setPhase("composed");
      }
      setAudioUrl(null);
      setAudioFileName(null);
      setAudioPathname(null);
      setAudioError("");
    },
    [analysisData, phase]
  );

  const handleCordelVerseCommit = useCallback(
    (
      estrofeNumero: number,
      versoIndex: number,
      previousValue: string,
      nextValue: string
    ) => {
      if (previousValue === nextValue) return;

      appendHistory({
        tipo: "edicao",
        titulo: `Edição manual na estrofe ${estrofeNumero}, verso ${versoIndex + 1}`,
        detalhes: [`Antes: "${previousValue}"`, `Depois: "${nextValue}"`],
      });
    },
    [appendHistory]
  );

  const handleSelectPsalm = useCallback((psalm: number) => {
    setPsalmNumberInput(String(psalm));
    setError("");
    setCatalogError("");
  }, []);

  const reportText = buildReportText({
    inputMode,
    meaningMapText,
    cordelData,
    analysisData,
    analysisDirty,
    historyEntries,
    revisionCount,
    audioFileName,
    audioUrl,
  });

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

        setInputMode(record.modo);
        setMeaningMapInput(record.meaningMapText);
        setMeaningMapText(record.meaningMapText);
        setExistingCordelInput(cordelToPlainText(record.cordelData));
        setPsalmNumberInput(String(record.salmo));
        setCordelData(record.cordelData);
        setAnalysisData(record.analysisData);
        setAnalysisDirty(record.analysisDirty);
        setHistoryEntries(record.historyEntries);
        setRevisionCount(record.revisionCount);
        setPhase(record.analysisData && !record.analysisDirty ? "analyzed" : "composed");
        setActiveTab("cordel");
        setAudioUrl(record.audioUrl);
        setAudioFileName(record.audioFileName);
        setAudioPathname(record.audioPathname || null);
        setAudioError("");
        setCatalogError("");
        setError("");
      } catch (e: any) {
        setCatalogError(e.message);
        setError(e.message);
      } finally {
        setCatalogSyncing(false);
      }
    },
    [cordelData]
  );

  const handleSaveCurrentPsalm = useCallback(async () => {
    if (!cordelData) {
      setError("Gere ou importe um cordel antes de salvá-lo no catálogo.");
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
      modo: inputMode,
      status: derivePsalmStatus({ analysisData, analysisDirty }),
      salvoEm: new Date().toISOString(),
      analysisDirty,
      meaningMapText: meaningMapText || meaningMapInput,
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
    inputMode,
    meaningMapInput,
    meaningMapText,
    reportText,
    revisionCount,
  ]);

  const handleCopyReport = useCallback(() => {
    if (!reportText) return;
    navigator.clipboard.writeText(reportText);
  }, [reportText]);

  const handleDownloadReport = useCallback(() => {
    if (!reportText) return;
    const blob = new Blob([reportText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-cordel-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [reportText]);

  const hasIssues = hasAnalysisIssues(analysisData);

  const showResults = ["composed", "analyzed"].includes(phase);

  const tabs: { id: "cordel" | "metrica" | "fidelidade" | "relatorio"; label: string; always: boolean }[] = [
    { id: "cordel", label: "Cordel", always: true },
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
    inputMode === "compose"
      ? "Cole o Mapa de Significado completo (Níveis 1, 2 e 3). O texto será dividido automaticamente entre três agentes especializados."
      : "Cole o cordel completo e o Mapa de Significado em seus campos separados. O cordel será analisado diretamente, e o mapa servirá para a checagem de fidelidade.";

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
              Tradução Oral Performática da Bíblia - Sextilhas em redondilha maior
            </p>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 md:px-10 md:py-8">

        {/* INPUT */}
        {(phase === "input" || phase === "error") && (
          <section className="rounded-[24px] border-[3px] border-preto bg-parchment px-4 py-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.12)] sm:px-6 sm:py-6">
            <label className="font-heading text-xs font-semibold text-brown-mid uppercase tracking-widest block mb-2">
              Modo de Trabalho
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => {
                  setInputMode("compose");
                  setError("");
                }}
                className={`font-heading text-sm font-bold px-4 py-2 rounded-full border-2 transition-all ${
                  inputMode === "compose"
                    ? "bg-preto text-cream border-preto"
                    : "bg-cream text-preto border-preto"
                }`}
              >
                Compor do Mapa de Significado
              </button>
              <button
                onClick={() => {
                  setInputMode("analyze-existing");
                  setError("");
                }}
                className={`font-heading text-sm font-bold px-4 py-2 rounded-full border-2 transition-all ${
                  inputMode === "analyze-existing"
                    ? "bg-preto text-cream border-preto"
                    : "bg-cream text-preto border-preto"
                }`}
              >
                Analisar Cordel Existente
              </button>
            </div>
            <div className="mb-4 rounded-[18px] border-2 border-preto bg-[var(--parchment-dark)] px-4 py-3 font-body text-[13px] leading-relaxed text-preto">
              {inputInstruction}
            </div>
            {inputMode === "compose" ? (
              <textarea
                className="w-full min-h-[240px] resize-y rounded-[18px] border-2 border-preto bg-cream p-4 font-body text-sm leading-relaxed text-preto shadow-[inset_0_0_0_1px_rgba(15,12,8,0.08)]"
                value={meaningMapInput}
                onChange={(e) => setMeaningMapInput(e.target.value)}
                placeholder="# Exemplo trabalhado: Salmo 1\n## Mapa de Significado completo\n\n## Level 1 — A forma\n...\n\n## Level 2 — Cena 1: Versos 1–3\n...\n\n## Level 3 — Proposições\n..."
              />
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="font-heading text-xs font-semibold text-brown-mid uppercase tracking-widest block mb-2">
                    Cordel
                  </label>
                  <textarea
                    className="w-full min-h-[240px] resize-y rounded-[18px] border-2 border-preto bg-cream p-4 font-body text-sm leading-relaxed text-preto shadow-[inset_0_0_0_1px_rgba(15,12,8,0.08)]"
                    value={existingCordelInput}
                    onChange={(e) => setExistingCordelInput(e.target.value)}
                    placeholder="Cole aqui o cordel completo (sextilhas)..."
                  />
                </div>
                <div>
                  <label className="font-heading text-xs font-semibold text-brown-mid uppercase tracking-widest block mb-2">
                    Mapa de Significado Completo
                  </label>
                  <textarea
                    className="w-full min-h-[240px] resize-y rounded-[18px] border-2 border-preto bg-cream p-4 font-body text-sm leading-relaxed text-preto shadow-[inset_0_0_0_1px_rgba(15,12,8,0.08)]"
                    value={meaningMapInput}
                    onChange={(e) => setMeaningMapInput(e.target.value)}
                    placeholder="Cole aqui o Mapa de Significado completo (Níveis 1, 2 e 3)..."
                  />
                </div>
              </div>
            )}
            {error && (
              <div className="mt-3 whitespace-pre-wrap rounded-[16px] border-2 border-preto bg-[var(--parchment-dark)] px-4 py-3 font-body text-[13px] text-preto">
                {error}
              </div>
            )}
            <div className="mt-4">
              <button
                onClick={
                  inputMode === "compose" ? handleCompose : handleAnalyzeExisting
                }
                disabled={
                  inputMode === "compose"
                    ? !meaningMapInput.trim()
                    : !existingCordelInput.trim() || !meaningMapInput.trim()
                }
                className="btn-primary cursor-pointer rounded-full border-2 border-preto bg-preto px-6 py-2.5 font-heading text-sm font-bold text-cream transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inputMode === "compose" ? "Forjar Cordel" : "Analisar Cordel"}
              </button>
            </div>
          </section>
        )}

        {/* LOADING */}
        {isLoading && (
          <div className="rounded-[24px] border-[3px] border-preto bg-parchment px-6 py-12 text-center">
            {phase === "composing" && (
              <div className="text-left max-w-[350px] mx-auto mb-6 px-5">
                <StepBadge
                  done={elapsed > 15}
                  active={elapsed <= 15}
                  label="Planejador"
                  sub="Nível 1 → estrutura"
                />
                <StepBadge
                  done={elapsed > 30}
                  active={elapsed > 15 && elapsed <= 30}
                  label="Vocabulário"
                  sub="Nível 2 → imagens"
                />
                <StepBadge
                  done={false}
                  active={elapsed > 30}
                  label="Compositor"
                  sub="Nível 3 → sextilhas"
                />
              </div>
            )}

            <div className="inline-block w-6 h-6 border-[3px] border-parchment-dark border-t-telha rounded-full animate-spin-slow" />
            <p className="font-heading text-[15px] text-brown-mid mt-3 mb-1">
              {phaseLabels[phase] || "Processando"}…
            </p>
            <p className="font-mono text-3xl font-bold text-telha m-0">
              {fmtTime(elapsed)}
            </p>
          </div>
        )}

        {/* RESULTS */}
        {showResults && cordelData && (
          <section className="rounded-[24px] border-[3px] border-preto bg-parchment px-4 py-5 shadow-[inset_0_0_0_1px_rgba(15,12,8,0.12)] sm:px-6 sm:py-6">
            <PipelineBadges phase={phase} revisionCount={revisionCount} />

            {/* Tabs */}
            <div className="mb-5 flex gap-2 border-b-2 border-preto/20 pb-3">
              {tabs.map((t) => {
                const enabled = t.always || !!analysisData;
                return (
                  <button
                    key={t.id}
                    onClick={() => enabled && setActiveTab(t.id)}
                    className={`rounded-full border-2 px-4 py-2 font-heading text-sm font-semibold transition-all ${
                      activeTab === t.id
                        ? "border-preto bg-preto text-cream"
                        : enabled
                        ? "cursor-pointer border-preto bg-cream text-preto"
                        : "cursor-default border-preto/15 bg-cream text-brown-light/60"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            {activeTab === "cordel" && (
              <CordelView
                data={cordelData}
                analysisData={analysisData}
                analysisDirty={analysisDirty}
                audioUrl={audioUrl}
                audioLoading={audioLoading}
                audioError={audioError}
                onVerseChange={handleCordelVerseChange}
                onVerseCommit={handleCordelVerseCommit}
                onListen={handleListen}
              />
            )}
            {activeTab === "metrica" && analysisData && (
              <MetricaView data={analysisData} />
            )}
            {activeTab === "fidelidade" && analysisData && (
              <FidelidadeView data={analysisData} />
            )}
            {activeTab === "relatorio" && (
              <ReportView
                reportText={reportText}
                historyEntries={historyEntries}
                analysisData={analysisData}
                analysisDirty={analysisDirty}
                audioUrl={audioUrl}
                audioFileName={audioFileName}
                onCopyReport={handleCopyReport}
                onDownloadReport={handleDownloadReport}
              />
            )}

            {/* Action buttons */}
            <div className="mt-5 flex gap-2.5 flex-wrap">
              {phase === "composed" && (
                <button
                  onClick={handleAnalyze}
                  className="btn-primary cursor-pointer rounded-full border-2 border-preto bg-preto px-5 py-2.5 font-heading text-sm font-bold text-cream transition-all"
                >
                  {analysisDirty ? "Analisar Métrica e Fidelidade Novamente" : "Analisar Métrica e Fidelidade"}
                </button>
              )}
              {phase === "analyzed" && hasIssues && revisionCount < 3 && (
                <button
                  onClick={handleRevise}
                  className="btn-primary cursor-pointer rounded-full border-2 border-preto bg-preto px-5 py-2.5 font-heading text-sm font-bold text-cream transition-all"
                >
                  Revisar ({3 - revisionCount} restantes)
                </button>
              )}
              <button
                onClick={() => {
                  setPhase("input");
                  setError("");
                  setAnalysisDirty(false);
                  setHistoryEntries([]);
                  setAudioUrl(null);
                  setAudioFileName(null);
                  setAudioPathname(null);
                  setAudioError("");
                  setActiveTab("cordel");
                }}
                className="btn-secondary cursor-pointer rounded-full border-2 border-preto bg-cream px-5 py-2.5 font-heading text-sm font-bold text-preto transition-all"
              >
                Novo texto
              </button>
              {cordelData && (
                <button
                  onClick={() => {
                    const text = cordelData.estrofes
                      .map((e) => e.versos.join("\n"))
                      .join("\n\n");
                    navigator.clipboard.writeText(text);
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
