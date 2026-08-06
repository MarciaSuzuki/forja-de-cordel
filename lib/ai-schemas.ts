const stringArray = {
  type: "array",
  items: { type: "string" },
} as const;

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    salmo: { type: "integer", minimum: 0, maximum: 150 },
    titulo_provisorio: { type: "string" },
    sintese: { type: "string" },
    estrutura: {
      type: "object",
      additionalProperties: false,
      properties: {
        total_estrofes: { type: "integer", minimum: 1, maximum: 30 },
        justificativa: { type: "string" },
        arco_emocional: { type: "string" },
        registro_temporal: { type: "string" },
        contrastes: stringArray,
        assimetrias: stringArray,
      },
      required: [
        "total_estrofes",
        "justificativa",
        "arco_emocional",
        "registro_temporal",
        "contrastes",
        "assimetrias",
      ],
    },
    guia_de_linguagem: {
      type: "object",
      additionalProperties: false,
      properties: {
        participantes: stringArray,
        lugares: stringArray,
        objetos: stringArray,
        imagens: stringArray,
        expressoes: stringArray,
        evitar: stringArray,
      },
      required: [
        "participantes",
        "lugares",
        "objetos",
        "imagens",
        "expressoes",
        "evitar",
      ],
    },
    cobertura: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          proposicao: { type: "integer", minimum: 1 },
          cena: { type: "integer", minimum: 1 },
          resumo: { type: "string" },
          versos_minimos: { type: "integer", minimum: 1, maximum: 6 },
          estrofes_planejadas: {
            type: "array",
            items: { type: "integer", minimum: 1 },
          },
        },
        required: [
          "proposicao",
          "cena",
          "resumo",
          "versos_minimos",
          "estrofes_planejadas",
        ],
      },
    },
    estrofes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          numero: { type: "integer", minimum: 1 },
          funcao: { type: "string" },
          tom: { type: "string" },
          proposicoes: {
            type: "array",
            items: { type: "integer", minimum: 1 },
          },
          imagens: stringArray,
          palavras_chave: stringArray,
          restricoes: stringArray,
          rima_sugerida: { type: "string" },
          roteiro_de_versos: {
            type: "array",
            minItems: 6,
            maxItems: 6,
            items: { type: "string" },
          },
        },
        required: [
          "numero",
          "funcao",
          "tom",
          "proposicoes",
          "imagens",
          "palavras_chave",
          "restricoes",
          "rima_sugerida",
          "roteiro_de_versos",
        ],
      },
    },
  },
  required: [
    "salmo",
    "titulo_provisorio",
    "sintese",
    "estrutura",
    "guia_de_linguagem",
    "cobertura",
    "estrofes",
  ],
} as const;

export const CORDEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string" },
    estrofes: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          numero: { type: "integer", minimum: 1 },
          versos: {
            type: "array",
            minItems: 6,
            maxItems: 6,
            items: { type: "string", minLength: 1 },
          },
          proposicoes_cobertas: { type: "string" },
          alteracao: { type: "string" },
        },
        required: ["numero", "versos", "proposicoes_cobertas", "alteracao"],
      },
    },
  },
  required: ["titulo", "estrofes"],
} as const;

export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    resumo: {
      type: "object",
      additionalProperties: false,
      properties: {
        aprovado: { type: "boolean" },
        parecer: { type: "string" },
        versos_corretos: { type: "integer", minimum: 0 },
        versos_totais: { type: "integer", minimum: 0 },
        estrofes_com_rima: { type: "integer", minimum: 0 },
        estrofes_totais: { type: "integer", minimum: 0 },
        proposicoes_presentes: { type: "integer", minimum: 0 },
        proposicoes_totais: { type: "integer", minimum: 0 },
        oralidade_ok: { type: "boolean" },
        qualidade_poetica_ok: { type: "boolean" },
      },
      required: [
        "aprovado",
        "parecer",
        "versos_corretos",
        "versos_totais",
        "estrofes_com_rima",
        "estrofes_totais",
        "proposicoes_presentes",
        "proposicoes_totais",
        "oralidade_ok",
        "qualidade_poetica_ok",
      ],
    },
    estrofes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          numero: { type: "integer", minimum: 1 },
          versos: {
            type: "array",
            minItems: 6,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                texto: { type: "string" },
                escansao: { type: "string" },
                silabas: { type: "integer", minimum: 1 },
                correto: { type: "boolean" },
              },
              required: ["texto", "escansao", "silabas", "correto"],
            },
          },
          rima_palavras: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { type: "string" },
          },
          rima_ok: { type: "boolean" },
          oralidade_ok: { type: "boolean" },
          nota_poetica: { type: "string" },
        },
        required: [
          "numero",
          "versos",
          "rima_palavras",
          "rima_ok",
          "oralidade_ok",
          "nota_poetica",
        ],
      },
    },
    fidelidade: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          proposicao: { type: "integer", minimum: 1 },
          resumo: { type: "string" },
          status: { type: "string", enum: ["PRESENTE", "PARCIAL", "AUSENTE"] },
          estrofe: { type: "integer", minimum: 0 },
          evidencia: { type: "string" },
          nota: { type: "string" },
        },
        required: ["proposicao", "resumo", "status", "estrofe", "evidencia", "nota"],
      },
    },
    adicoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          texto: { type: "string", minLength: 1 },
          estrofe: { type: "integer", minimum: 1 },
          verso: { type: "integer", minimum: 1, maximum: 6 },
          avaliacao: { type: "string", minLength: 1 },
        },
        required: ["texto", "estrofe", "verso", "avaliacao"],
      },
    },
    problemas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tipo: {
            type: "string",
            enum: ["METRICA", "RIMA", "FIDELIDADE", "ADICAO", "ORALIDADE", "QUALIDADE"],
          },
          prioridade: { type: "string", enum: ["ALTA", "MEDIA", "BAIXA"] },
          estrofe: { type: "integer", minimum: 0 },
          verso: { type: "integer", minimum: 0, maximum: 6 },
          trecho: { type: "string" },
          descricao: { type: "string" },
          instrucao_de_correcao: { type: "string" },
        },
        required: [
          "tipo",
          "prioridade",
          "estrofe",
          "verso",
          "trecho",
          "descricao",
          "instrucao_de_correcao",
        ],
      },
    },
  },
  required: ["resumo", "estrofes", "fidelidade", "adicoes", "problemas"],
} as const;

export const FORM_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    estrofes: ANALYSIS_SCHEMA.properties.estrofes,
    problemas: ANALYSIS_SCHEMA.properties.problemas,
  },
  required: ["estrofes", "problemas"],
} as const;

export const FIDELITY_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    parecer: { type: "string" },
    fidelidade: ANALYSIS_SCHEMA.properties.fidelidade,
    adicoes: ANALYSIS_SCHEMA.properties.adicoes,
    problemas: ANALYSIS_SCHEMA.properties.problemas,
  },
  required: ["parecer", "fidelidade", "adicoes", "problemas"],
} as const;

export const REVISION_SELECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    escolha: { type: "integer", minimum: 0, maximum: 6 },
    parecer: { type: "string" },
    problemas_restantes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["escolha", "parecer", "problemas_restantes"],
} as const;

export const LOCAL_SUGGESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    alternativas: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          versos: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: { type: "string", minLength: 1 },
          },
          justificativa: { type: "string", minLength: 1 },
          observacao_metrica: { type: "string", minLength: 1 },
          observacao_fidelidade: { type: "string", minLength: 1 },
        },
        required: [
          "versos",
          "justificativa",
          "observacao_metrica",
          "observacao_fidelidade",
        ],
      },
    },
  },
  required: ["alternativas"],
} as const;
