"use client";

const KEY = "anama_notes_v1";

type NotesMap = Record<string, string>;

function readAll(): NotesMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as NotesMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: NotesMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
}

export function loadNote(estrofe: number): string {
  return readAll()[String(estrofe)] ?? "";
}

export function saveNote(estrofe: number, text: string): void {
  const map = readAll();
  if (text.trim().length === 0) {
    delete map[String(estrofe)];
  } else {
    map[String(estrofe)] = text;
  }
  writeAll(map);
}

export function listEstrofesWithNotes(): number[] {
  return Object.keys(readAll()).map((k) => Number(k));
}
