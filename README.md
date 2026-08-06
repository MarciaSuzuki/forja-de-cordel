# Forja de Cordel

**Mapa de Significado → Sextilhas em redondilha maior**

Aplicativo da OBT Lab / Shema Bible Translation para compor, auditar, lapidar e documentar cordéis bíblicos destinados à tradução oral performática.

## Fluxo

O usuário fornece somente o Mapa de Significado completo. O app executa etapas independentes e registra cada uma no histórico:

1. **Preparação do Mapa** — uma filtragem determinística remove links, marcas do Portal e blocos dispensáveis. Não usa IA, não resume e não reescreve: todos os trechos mantidos permanecem literais e todas as proposições são preservadas na ordem original.
2. **Projeto** — o modelo interpreta o recorte literal dos três níveis e planeja estrofes, linguagem e cobertura de cada proposição.
3. **Composição** — o modelo produz sextilhas em redondilha maior com rima ABCBDB a partir do mesmo recorte literal.
4. **Auditoria** — uma chamada independente verifica métrica, rima, fidelidade, adições, oralidade e qualidade poética contra o Mapa original completo, não contra o recorte.
5. **Lapidação humana** — o tradutor edita o cordel, desfaz tentativas por estrofe e pode solicitar três sugestões localizadas da IA para um ou dois versos.
6. **Revisão global opcional** — o modelo pode corrigir os problemas documentados, sempre seguida por uma nova auditoria contra o Mapa original.

O cordel final permanece editável. Qualquer edição manual invalida a auditoria anterior e habilita uma nova análise. O relatório e o catálogo compartilhado armazenam tanto o Mapa original quanto o recorte literal usado na composição.

## Regras Formais

- Sextilha: exatamente seis versos por estrofe.
- Redondilha maior: sete sílabas poéticas por verso.
- Rima ABCBDB: versos 2, 4 e 6 rimam.
- Vocabulário sertanejo concreto, oral e não caricatural.
- Fidelidade integral às proposições do Nível 3, sem adições semânticas.

## Desenvolvimento Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Variáveis de Ambiente

| Variável | Obrigatória | Uso |
|---|---:|---|
| `OPENAI_API_KEY` | Sim | Projeto, composição, auditoria e lapidação |
| `DATABASE_URL` | Sim para equipe | Catálogo compartilhado e histórico dos salmos |
| `OPENAI_PLANNER_MODEL` | Não | Padrão: `gpt-5.6-terra` |
| `OPENAI_COMPOSER_MODEL` | Não | Padrão: `gpt-5.6-sol` |
| `OPENAI_ANALYZER_MODEL` | Não | Padrão: `gpt-5.6-sol` |
| `OPENAI_REVISER_MODEL` | Não | Padrão: `gpt-5.6-sol` |
| `ELEVENLABS_API_KEY` | Não | Geração da declamação sintética |
| `ELEVENLABS_VOICE_ID` | Não | Voz brasileira usada pelo ElevenLabs |
| `BLOB_READ_WRITE_TOKEN` | Recomendável | Persistência do áudio para toda a equipe |

## Formato de Entrada

O Mapa de Significado deve conter títulos identificáveis como `Level 1`, `Level 2`, `Level 3` ou suas formas em português `Nível 1`, `Nível 2`, `Nível 3`. A entrada pode ser colada ou carregada em `.txt`, `.md` ou `.docx`.

## Verificação

```bash
npm run build
```

## Créditos

OBT Lab · Shema Bible Translation · YWAM Kansas City
