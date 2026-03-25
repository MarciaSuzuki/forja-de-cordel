// lib/extract.ts

export function extractLevel(text: string, level: 1 | 2 | 3): string {
  const markers: Record<number, [RegExp, RegExp | null]> = {
    1: [/##\s*Level\s*1/i, /##\s*Level\s*2/i],
    2: [/##\s*Level\s*2/i, /##\s*Level\s*3/i],
    3: [/##\s*Level\s*3/i, null],
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
