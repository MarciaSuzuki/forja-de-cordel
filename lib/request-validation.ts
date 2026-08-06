const MAX_MEANING_MAP_CHARS = 120_000;
const MAX_CORDEL_CHARS = 60_000;

export function requireText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} não informado.`);
  }
  if (value.length > maxLength) {
    throw new Error(`${label} excede o limite de ${maxLength.toLocaleString("pt-BR")} caracteres.`);
  }
  return value.trim();
}

export function requireMeaningMap(value: unknown) {
  return requireText(value, "Mapa de Significado", MAX_MEANING_MAP_CHARS);
}

export function requireCordel(value: unknown) {
  const serialized = JSON.stringify(value);
  if (!value || serialized === "null" || serialized === "{}") {
    throw new Error("Cordel não informado.");
  }
  if (serialized.length > MAX_CORDEL_CHARS) {
    throw new Error(
      `Cordel excede o limite de ${MAX_CORDEL_CHARS.toLocaleString("pt-BR")} caracteres.`
    );
  }
  return value;
}
