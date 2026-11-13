const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const truncated = {
  status: "incomplete",
  incomplete_details: { reason: "max_output_tokens" },
  output: [{ content: [{ type: "output_text", text: '{"alternativas":[' }] }],
};

function alternatives(lineCount = 2) {
  return Array.from({ length: 3 }, (_, index) => ({
    versos: Array.from({ length: lineCount }, (_, line) => `Opção ${index + 1}, verso ${line + 1}`),
    justificativa: "Teste sintético.",
    observacao_metrica: "Verificar na leitura.",
    observacao_fidelidade: "Mantém a proposição autorizada.",
  }));
}

function completed(items = alternatives()) {
  return {
    status: "completed",
    model: "configured-reviser",
    output: [{ content: [{ type: "output_text", text: JSON.stringify({ alternativas: items }) }] }],
  };
}

function payload(verseNumbers = [2, 4]) {
  return {
    cordel: { estrofes: [{ numero: 1, versos: ["Um", "Dois", "Três", "Quatro", "Cinco", "Seis"] }] },
    meaningMap: "Level 1\nForma sintética.\nLevel 2\nScene 1\nLevel 3\nProposition 1 [Scene 1]\nVoicing (kept): FONTE AUTORIZADA.\nProposition 2 [Scene 2]\nVoicing (kept): FORA DO RECORTE.",
    plan: { estrofes: [{ numero: 1, proposicoes: [1] }] },
    stanzaNumber: 1,
    verseNumbers,
    translatorGoal: "Melhorar a oralidade.",
  };
}

// Load the actual TypeScript route and helpers in isolation, mocking only the
// provider transport, environment and clock. No credentials or network are used.
function harness(replies) {
  const requests = [];
  const timeouts = [];
  const modules = new Map();
  let now = 0;
  class Clock extends Date {
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: Clock,
    Error,
    console: { info() {}, warn() {}, error() {} },
    process: { env: { OPENAI_API_KEY: "synthetic-test-key", OPENAI_REVISER_MODEL: "configured-reviser" } },
    AbortSignal: {
      timeout(milliseconds) {
        timeouts.push(milliseconds);
        return new AbortController().signal;
      },
    },
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      const reply = replies[requests.length - 1];
      assert.notEqual(reply, undefined, "Unexpected provider request");
      if (reply.error) throw reply.error;
      now += reply.elapsedMs || 0;
      return new Response(JSON.stringify(reply.body || reply), { status: reply.httpStatus || 200 });
    },
  });
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const run = new vm.Script(`(function(require, module, exports) {${outputText}\n})`, { filename }).runInContext(context);
    run((specifier) => specifier.startsWith("@/")
      ? load(path.join(root, `${specifier.slice(2)}.ts`))
      : require(specifier), module, module.exports);
    return module.exports;
  }
  const route = load(path.join(root, "app/api/suggest/route.ts"));
  return {
    requests,
    timeouts,
    async post(body = payload()) {
      const response = await route.POST(new Request("http://localhost/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

test("uses low reasoning and retries token exhaustion once with more room, preserving the source and model", async () => {
  const h = harness([truncated, completed()]);
  const response = await h.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.model, "configured-reviser");
  assert.equal(response.body.alternatives.length, 3);
  assert.deepEqual(response.body.verseNumbers, [2, 4]);
  assert.deepEqual(response.body.alternatives.map(item => item.versos.length), [2, 2, 2]);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.timeouts, [60_000, 45_000]);
  assert.equal(h.requests[0].max_output_tokens, 12_000);
  assert.equal(h.requests[0].reasoning.effort, "low");
  assert.equal(h.requests[1].max_output_tokens, 20_000);
  assert.equal(h.requests[1].reasoning.effort, "low");
  const { max_output_tokens: firstTokens, reasoning: firstReasoning, ...first } = h.requests[0];
  const { max_output_tokens: retryTokens, reasoning: retryReasoning, ...retry } = h.requests[1];
  assert.deepEqual(retry, first);
  assert.match(first.input, /FONTE AUTORIZADA/);
  assert.doesNotMatch(first.input, /FORA DO RECORTE/);
  assert.equal(first.store, false);
  assert.equal(first.text.format.strict, true);
});

test("persistent truncation stops after two calls with an actionable Portuguese error", async () => {
  const h = harness([truncated, truncated]);
  const response = await h.post();
  assert.equal(response.status, 500);
  assert.match(response.body.error, /mesmo após uma nova tentativa/);
  assert.equal(h.requests.length, 2);
});

test("retry fits the remaining route budget", async () => {
  const h = harness([{ body: truncated, elapsedMs: 70_000 }, completed()]);
  assert.equal((await h.post()).status, 200);
  assert.deepEqual(h.timeouts, [60_000, 40_000]);
});

test("does not start a retry below the shared helper's 30-second minimum", async () => {
  const h = harness([{ body: truncated, elapsedMs: 80_001 }]);
  const response = await h.post();
  assert.equal(response.status, 500);
  assert.match(response.body.error, /não há tempo/);
  assert.equal(h.requests.length, 1);
});

for (const [name, reply] of [
  ["authentication failure", { httpStatus: 401, body: { error: "Invalid test key" } }],
  ["rate limit", { httpStatus: 429, body: { error: "Rate limited" } }],
  ["content filter", { status: "incomplete", incomplete_details: { reason: "content_filter" } }],
  ["invalid JSON", { status: "completed", output: [{ content: [{ type: "output_text", text: "{" }] }] }],
  ["empty output", { status: "completed", output: [] }],
  ["network error", { error: new Error("Synthetic network failure") }],
  ["timeout", { error: Object.assign(new Error("Synthetic timeout"), { name: "TimeoutError" }) }],
]) {
  test(`does not retry ${name}`, async () => {
    const h = harness([reply]);
    assert.equal((await h.post()).status, 500);
    assert.equal(h.requests.length, 1);
  });
}

test("a failure on the retry is not retried again", async () => {
  const h = harness([truncated, { httpStatus: 429, body: { error: "Rate limited" } }]);
  const response = await h.post();
  assert.equal(response.status, 500);
  assert.match(response.body.error, /429/);
  assert.equal(h.requests.length, 2);
});

test("one selected line still receives three one-line alternatives without a retry", async () => {
  const h = harness([completed(alternatives(1))]);
  const response = await h.post(payload([3]));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.alternatives.map(item => item.versos.length), [1, 1, 1]);
  assert.equal(h.requests.length, 1);
});

test("wrong selected-line counts remain invalid after recovery", async () => {
  const h = harness([truncated, completed(alternatives(1))]);
  const response = await h.post();
  assert.equal(response.status, 500);
  assert.match(response.body.error, /compatíveis com a seleção/);
  assert.equal(h.requests.length, 2);
});

test("three distinct alternatives are still required", async () => {
  const items = alternatives();
  items[2] = { ...items[1] };
  const h = harness([truncated, completed(items)]);
  const response = await h.post();
  assert.equal(response.status, 500);
  assert.match(response.body.error, /realmente distintas/);
  assert.equal(h.requests.length, 2);
});

test("an unchanged selection is still rejected", async () => {
  const items = alternatives();
  items[0].versos = ["Dois", "Quatro"];
  const h = harness([completed(items)]);
  const response = await h.post();
  assert.equal(response.status, 500);
  assert.match(response.body.error, /realmente distintas/);
  assert.equal(h.requests.length, 1);
});

test("invalid selection counts are rejected before using the provider", async () => {
  const h = harness([]);
  assert.equal((await h.post(payload([1, 2, 3]))).status, 400);
  assert.equal(h.requests.length, 0);
});
