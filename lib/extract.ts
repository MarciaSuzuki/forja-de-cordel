function levelHeading(level: 1 | 2 | 3) {
  const spacing = "[\\t \\u00a0]";
  const sectionNumber = `(?:\\d+(?:\\.\\d+)*[.)]?${spacing}+)?`;

  return new RegExp(
    `^${spacing}*(?:#{1,6}${spacing}*)?${sectionNumber}(?:Level|N[ií]vel)${spacing}*${level}\\b[^\\r\\n]*$`,
    "im"
  );
}

function flagsHeading() {
  const spacing = "[\\t \\u00a0]";
  const sectionNumber = `(?:\\d+(?:\\.\\d+)*[.)]?${spacing}+)?`;

  return new RegExp(
    `^${spacing}*(?:#{1,6}${spacing}*)?${sectionNumber}(?:Flags?|Sinalizadores?)\\b[^\\r\\n]*$`,
    "im"
  );
}

export function compactMeaningMap(text: string): string {
  return text
    .replace(/\[ask\]\([^\r\n)]*\)/gi, "")
    .replace(/\[([^\]\r\n]+)\]\([^\r\n)]*\)/g, "$1")
    .replace(/[ \t]+ask[ \t]*$/gim, "")
    .replace(/[\t ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractLevel(text: string, level: 1 | 2 | 3): string {
  const markers: Record<1 | 2 | 3, [RegExp, RegExp | null]> = {
    1: [levelHeading(1), levelHeading(2)],
    2: [levelHeading(2), levelHeading(3)],
    3: [levelHeading(3), flagsHeading()],
  };

  const [startRe, endRe] = markers[level];
  const startMatch = text.match(startRe);
  if (!startMatch || startMatch.index === undefined) return "";

  const startIdx = startMatch.index;

  if (endRe) {
    const rest = text.slice(startIdx + startMatch[0].length);
    const endMatch = rest.match(endRe);
    if (endMatch && endMatch.index !== undefined) {
      return text.slice(startIdx, startIdx + startMatch[0].length + endMatch.index).trim();
    }
  }

  return text.slice(startIdx).trim();
}

function withoutFirstLine(text: string) {
  const lineBreak = text.search(/\r?\n/);
  return lineBreak < 0 ? "" : text.slice(lineBreak).trim();
}

function extractMetadata(text: string) {
  const labels = [
    "Pericope title",
    "BCV",
    "Genre Group",
    "Genre",
    "Register",
    "Versification",
  ];
  return labels.flatMap((label) => {
    const match = text.match(new RegExp(`^${label}:\\s*.+$`, "im"));
    return match ? [match[0].trim()] : [];
  });
}

function extractLabeledBlock(
  block: string,
  start: RegExp,
  endings: RegExp[]
) {
  const startMatch = block.match(start);
  if (!startMatch || startMatch.index === undefined) return "";
  const contentStart = startMatch.index + startMatch[0].length;
  const rest = block.slice(contentStart);
  const endingIndexes = endings.flatMap((ending) => {
    const match = rest.match(ending);
    return match?.index === undefined ? [] : [match.index];
  });
  const contentEnd = endingIndexes.length ? Math.min(...endingIndexes) : rest.length;
  return block.slice(startMatch.index, contentStart + contentEnd).trim();
}

function simplifyScenes(level2: string) {
  const content = withoutFirstLine(level2);
  const scenePattern = /^(?:Scene|Cena)\s+\d+[^\r\n]*$/gim;
  const matches = Array.from(content.matchAll(scenePattern));
  if (!matches.length) return content;

  return matches
    .map((match, index) => {
      const start = match.index || 0;
      const end = matches[index + 1]?.index ?? content.length;
      const block = content.slice(start, end).trim();
      const heading = match[0].trim();
      const happenings = extractLabeledBlock(
        block,
        /^(?:#{1,6}\s*)?3E\s*[—-]\s*(?:What Happens|O que acontece)\b/im,
        [
          /^(?:#{1,6}\s*)?3F\s*[—-]\s*(?:Communicative Purpose|Função comunicativa)\b/im,
          /^(?:#{1,6}\s*)?(?:Significant Absence|Ausência significativa)\b/im,
        ]
      );
      const purpose = extractLabeledBlock(
        block,
        /^(?:#{1,6}\s*)?3F\s*[—-]\s*(?:Communicative Purpose|Função comunicativa)\b/im,
        [/^(?:#{1,6}\s*)?(?:Significant Absence|Ausência significativa)\b/im]
      );
      const absence = extractLabeledBlock(
        block,
        /^(?:#{1,6}\s*)?(?:Significant Absence|Ausência significativa)\b/im,
        []
      );
      const sections = [
        heading,
        happenings,
        purpose,
        absence,
      ].filter(Boolean);
      return sections.length > 1 ? sections.join("\n\n") : block;
    })
    .join("\n\n");
}

function simplifyPropositions(level3: string) {
  return level3.trim();
}

export function simplifyMeaningMapForCordel(text: string) {
  const compact = compactMeaningMap(text);
  const level1 = extractLevel(compact, 1);
  const level2 = extractLevel(compact, 2);
  const level3 = extractLevel(compact, 3);
  const missing = [
    !level1 ? "Nível 1" : null,
    !level2 ? "Nível 2" : null,
    !level3 ? "Nível 3" : null,
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Não foi possível localizar ${missing.join(", ")} no Mapa de Significado.`
    );
  }

  const title = compact.split(/\r?\n/).find((line) => line.trim())?.trim() || "Mapa";
  const metadata = extractMetadata(compact);
  const level2Heading = level2.split(/\r?\n/)[0]?.trim() || "";
  const simplified = [
    title,
    metadata.join("\n"),
    level1,
    [level2Heading, simplifyScenes(level2)].filter(Boolean).join("\n\n"),
    simplifyPropositions(level3),
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const sourcePropositions = Array.from(
    level3.matchAll(/Proposition\s+(\d+)\b/gi),
    (match) => Number(match[1])
  );
  const simplifiedPropositions = Array.from(
    simplified.matchAll(/Proposition\s+(\d+)\b/gi),
    (match) => Number(match[1])
  );
  if (
    sourcePropositions.length === 0 ||
    sourcePropositions.join(",") !== simplifiedPropositions.join(",")
  ) {
    throw new Error(
      "A preparação do Mapa não conseguiu preservar a sequência completa de proposições."
    );
  }

  return simplified;
}
