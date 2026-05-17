"use client";

import { BuntingFlag, INK } from "./BuntingFlag";

interface Props {
  total: number;
  recordedSet: Set<number>;
  noteSet: Set<number>;
  onSelect: (n: number) => void;
}

export function BuntingGallery({ total, recordedSet, noteSet, onSelect }: Props) {
  const perRow = 10;
  const rows: number[][] = [];
  for (let i = 0; i < total; i += perRow) {
    rows.push(Array.from({ length: Math.min(perRow, total - i) }, (_, k) => i + k + 1));
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8 md:gap-10">
      {rows.map((row, idx) => (
        <div key={idx} className="relative">
          <div className="absolute left-0 right-0 top-0 h-px" style={{ background: INK }} aria-hidden />
          <div className="flex justify-between gap-1 sm:gap-2 px-1 pt-px">
            {row.map((n) => (
              <BuntingFlag
                key={n}
                number={n}
                hasRecording={recordedSet.has(n)}
                hasNote={noteSet.has(n)}
                onClick={() => onSelect(n)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
