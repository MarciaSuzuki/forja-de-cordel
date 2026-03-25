import { neon } from "@neondatabase/serverless";

interface StoredPsalmRecordInput {
  salmo: number;
  modo: "compose" | "analyze-existing";
  status: string;
  salvoEm?: string;
  analysisDirty: boolean;
  meaningMapText: string;
  cordelData: unknown;
  analysisData: unknown | null;
  historyEntries: unknown[];
  revisionCount: number;
  audioUrl: string | null;
  audioFileName: string | null;
  audioPathname?: string | null;
  reportText?: string;
}

interface StoredPsalmRecord extends StoredPsalmRecordInput {
  salvoEm: string;
  reportText: string;
}

interface PsalmCatalogItem {
  salmo: number;
  status: string;
  salvoEm: string;
  analysisDirty: boolean;
  revisionCount: number;
}

let schemaReadyPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!value) {
    throw new Error(
      "Banco compartilhado não configurado. Defina DATABASE_URL no ambiente."
    );
  }
  return value;
}

function getSql() {
  return neon(getDatabaseUrl());
}

function normalizeTimestamp(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sanitizeNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function sanitizePublicUrl(value: unknown) {
  if (typeof value !== "string") return null;
  if (value.startsWith("https://") || value.startsWith("http://")) {
    return value;
  }
  return null;
}

function mapCatalogRow(row: Record<string, unknown>): PsalmCatalogItem {
  return {
    salmo: Number(row.salmo),
    status: sanitizeText(row.status) || "rascunho",
    salvoEm: normalizeTimestamp(row.salvoEm),
    analysisDirty: Boolean(row.analysisDirty),
    revisionCount: Number(row.revisionCount) || 0,
  };
}

function mapRecordRow(row: Record<string, unknown>): StoredPsalmRecord {
  return {
    salmo: Number(row.salmo),
    modo: row.modo === "analyze-existing" ? "analyze-existing" : "compose",
    status: sanitizeText(row.status) || "rascunho",
    salvoEm: normalizeTimestamp(row.salvoEm),
    analysisDirty: Boolean(row.analysisDirty),
    meaningMapText: sanitizeText(row.meaningMapText),
    cordelData: row.cordelData || { estrofes: [] },
    analysisData: row.analysisData ?? null,
    historyEntries: Array.isArray(row.historyEntries) ? row.historyEntries : [],
    revisionCount: Number(row.revisionCount) || 0,
    audioUrl: sanitizePublicUrl(row.audioUrl),
    audioFileName: sanitizeNullableText(row.audioFileName),
    audioPathname: sanitizeNullableText(row.audioPathname),
    reportText: sanitizeText(row.reportText),
  };
}

function normalizeRecord(
  psalmNumber: number,
  record: StoredPsalmRecordInput
): StoredPsalmRecord {
  return {
    salmo: psalmNumber,
    modo: record.modo === "analyze-existing" ? "analyze-existing" : "compose",
    status: sanitizeText(record.status) || "rascunho",
    salvoEm: normalizeTimestamp(record.salvoEm),
    analysisDirty: Boolean(record.analysisDirty),
    meaningMapText: sanitizeText(record.meaningMapText),
    cordelData: record.cordelData || { estrofes: [] },
    analysisData: record.analysisData ?? null,
    historyEntries: Array.isArray(record.historyEntries) ? record.historyEntries : [],
    revisionCount: Number.isFinite(record.revisionCount)
      ? Math.max(0, Math.trunc(record.revisionCount))
      : 0,
    audioUrl: sanitizePublicUrl(record.audioUrl),
    audioFileName: sanitizeNullableText(record.audioFileName),
    audioPathname: sanitizeNullableText(record.audioPathname),
    reportText: sanitizeText(record.reportText),
  };
}

export function toCatalogItem(record: StoredPsalmRecord): PsalmCatalogItem {
  return {
    salmo: record.salmo,
    status: record.status,
    salvoEm: record.salvoEm,
    analysisDirty: record.analysisDirty,
    revisionCount: record.revisionCount,
  };
}

export async function ensurePsalmSchema() {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    const sql = getSql();
    await sql.transaction([
      sql`
        CREATE TABLE IF NOT EXISTS psalm_entries (
          psalm_number INTEGER PRIMARY KEY,
          input_mode TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'rascunho',
          analysis_dirty BOOLEAN NOT NULL DEFAULT FALSE,
          meaning_map_text TEXT NOT NULL DEFAULT '',
          cordel_data JSONB NOT NULL,
          analysis_data JSONB,
          history_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
          revision_count INTEGER NOT NULL DEFAULT 0,
          audio_url TEXT,
          audio_file_name TEXT,
          audio_pathname TEXT,
          report_text TEXT NOT NULL DEFAULT '',
          saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS psalm_versions (
          id BIGSERIAL PRIMARY KEY,
          psalm_number INTEGER NOT NULL,
          input_mode TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'rascunho',
          analysis_dirty BOOLEAN NOT NULL DEFAULT FALSE,
          meaning_map_text TEXT NOT NULL DEFAULT '',
          cordel_data JSONB NOT NULL,
          analysis_data JSONB,
          history_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
          revision_count INTEGER NOT NULL DEFAULT 0,
          audio_url TEXT,
          audio_file_name TEXT,
          audio_pathname TEXT,
          report_text TEXT NOT NULL DEFAULT '',
          saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`
        CREATE INDEX IF NOT EXISTS psalm_versions_psalm_number_saved_at_idx
        ON psalm_versions (psalm_number, saved_at DESC)
      `,
    ]);
  })().catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });

  return schemaReadyPromise;
}

export async function listPsalmCatalog() {
  await ensurePsalmSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      psalm_number AS "salmo",
      status,
      saved_at AS "salvoEm",
      analysis_dirty AS "analysisDirty",
      revision_count AS "revisionCount"
    FROM psalm_entries
    ORDER BY psalm_number ASC
  `;
  return rows.map((row) => mapCatalogRow(row as Record<string, unknown>));
}

export async function getPsalmRecord(psalmNumber: number) {
  await ensurePsalmSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      psalm_number AS "salmo",
      input_mode AS "modo",
      status,
      saved_at AS "salvoEm",
      analysis_dirty AS "analysisDirty",
      meaning_map_text AS "meaningMapText",
      cordel_data AS "cordelData",
      analysis_data AS "analysisData",
      history_entries AS "historyEntries",
      revision_count AS "revisionCount",
      audio_url AS "audioUrl",
      audio_file_name AS "audioFileName",
      audio_pathname AS "audioPathname",
      report_text AS "reportText"
    FROM psalm_entries
    WHERE psalm_number = ${psalmNumber}
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  return mapRecordRow(rows[0] as Record<string, unknown>);
}

export async function savePsalmRecord(
  psalmNumber: number,
  record: StoredPsalmRecordInput
) {
  await ensurePsalmSchema();
  const sql = getSql();
  const normalized = normalizeRecord(psalmNumber, record);
  const analysisJson =
    normalized.analysisData == null ? null : JSON.stringify(normalized.analysisData);

  await sql.transaction([
    sql`
      INSERT INTO psalm_entries (
        psalm_number,
        input_mode,
        status,
        analysis_dirty,
        meaning_map_text,
        cordel_data,
        analysis_data,
        history_entries,
        revision_count,
        audio_url,
        audio_file_name,
        audio_pathname,
        report_text,
        saved_at,
        updated_at
      )
      VALUES (
        ${psalmNumber},
        ${normalized.modo},
        ${normalized.status},
        ${normalized.analysisDirty},
        ${normalized.meaningMapText},
        ${JSON.stringify(normalized.cordelData)}::jsonb,
        ${analysisJson}::jsonb,
        ${JSON.stringify(normalized.historyEntries)}::jsonb,
        ${normalized.revisionCount},
        ${normalized.audioUrl},
        ${normalized.audioFileName},
        ${normalized.audioPathname},
        ${normalized.reportText},
        ${normalized.salvoEm}::timestamptz,
        NOW()
      )
      ON CONFLICT (psalm_number)
      DO UPDATE SET
        input_mode = EXCLUDED.input_mode,
        status = EXCLUDED.status,
        analysis_dirty = EXCLUDED.analysis_dirty,
        meaning_map_text = EXCLUDED.meaning_map_text,
        cordel_data = EXCLUDED.cordel_data,
        analysis_data = EXCLUDED.analysis_data,
        history_entries = EXCLUDED.history_entries,
        revision_count = EXCLUDED.revision_count,
        audio_url = EXCLUDED.audio_url,
        audio_file_name = EXCLUDED.audio_file_name,
        audio_pathname = EXCLUDED.audio_pathname,
        report_text = EXCLUDED.report_text,
        saved_at = EXCLUDED.saved_at,
        updated_at = NOW()
    `,
    sql`
      INSERT INTO psalm_versions (
        psalm_number,
        input_mode,
        status,
        analysis_dirty,
        meaning_map_text,
        cordel_data,
        analysis_data,
        history_entries,
        revision_count,
        audio_url,
        audio_file_name,
        audio_pathname,
        report_text,
        saved_at
      )
      VALUES (
        ${psalmNumber},
        ${normalized.modo},
        ${normalized.status},
        ${normalized.analysisDirty},
        ${normalized.meaningMapText},
        ${JSON.stringify(normalized.cordelData)}::jsonb,
        ${analysisJson}::jsonb,
        ${JSON.stringify(normalized.historyEntries)}::jsonb,
        ${normalized.revisionCount},
        ${normalized.audioUrl},
        ${normalized.audioFileName},
        ${normalized.audioPathname},
        ${normalized.reportText},
        ${normalized.salvoEm}::timestamptz
      )
    `,
  ]);

  return getPsalmRecord(psalmNumber);
}
