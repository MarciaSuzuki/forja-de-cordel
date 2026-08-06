const OPENAI_RESPONSES_URL =
  process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses";
const DEFAULT_REQUEST_TIMEOUT_MS = 285_000;

export type OpenAIRole = "planner" | "composer" | "analyzer" | "reviser";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

interface StructuredCallOptions<T> {
  role: OpenAIRole;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  reasoningEffort?: ReasoningEffort;
  requestTimeoutMs?: number;
}

interface OpenAIResponseBody {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: Record<string, unknown>;
}

const DEFAULT_MODELS: Record<OpenAIRole, string> = {
  planner: "gpt-5.6-terra",
  composer: "gpt-5.6-sol",
  analyzer: "gpt-5.6-sol",
  reviser: "gpt-5.6-sol",
};

const ROLE_LABELS: Record<OpenAIRole, string> = {
  planner: "planejamento",
  composer: "composição",
  analyzer: "auditoria",
  reviser: "revisão",
};

function getModel(role: OpenAIRole) {
  const envName = `OPENAI_${role.toUpperCase()}_MODEL`;
  return process.env[envName] || DEFAULT_MODELS[role];
}

function getRequestTimeoutMs() {
  const configured = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 30_000) {
    return Math.min(configured, 285_000);
  }
  return DEFAULT_REQUEST_TIMEOUT_MS;
}

function extractOutputText(body: OpenAIResponseBody) {
  return (body.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("")
    .trim();
}

export async function callOpenAIJSON<T>({
  role,
  instructions,
  input,
  schemaName,
  schema,
  maxOutputTokens = 12000,
  reasoningEffort = "medium",
  requestTimeoutMs,
}: StructuredCallOptions<T>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Adicione a chave para executar a composição com GPT-5.6."
    );
  }

  const model = getModel(role);
  const timeoutMs = Math.min(
    getRequestTimeoutMs(),
    requestTimeoutMs && requestTimeoutMs >= 30_000
      ? requestTimeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS
  );
  const startedAt = Date.now();
  console.info(`[openai:${role}] iniciando`, {
    model,
    reasoningEffort,
    inputChars: input.length,
    maxOutputTokens,
    timeoutMs,
  });

  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: maxOutputTokens,
        store: false,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
        metadata: { app: "forja-de-cordel", role },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[openai:${role}] falhou`, { durationMs, error });
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new Error(
        `A etapa de ${ROLE_LABELS[role]} excedeu ${Math.round(
          timeoutMs / 1000
        )} segundos e foi encerrada para evitar uma espera indefinida.`
      );
    }
    throw error;
  }

  console.info(`[openai:${role}] resposta recebida`, {
    durationMs: Date.now() - startedAt,
    status: response.status,
    model,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI API (${role}) respondeu ${response.status}: ${errorText.slice(0, 500)}`
    );
  }

  const body = (await response.json()) as OpenAIResponseBody;
  if (body.status === "incomplete") {
    throw new Error(
      `A etapa ${role} terminou incompleta: ${
        body.incomplete_details?.reason || "motivo não informado"
      }.`
    );
  }

  const outputText = extractOutputText(body);
  if (!outputText) {
    throw new Error(`A etapa ${role} não retornou texto estruturado.`);
  }

  try {
    return {
      data: JSON.parse(outputText) as T,
      model: body.model || model,
      usage: body.usage || null,
    };
  } catch {
    throw new Error(`A etapa ${role} retornou JSON inválido.`);
  }
}
