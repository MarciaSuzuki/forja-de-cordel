"use client";

import { CSSProperties } from "react";

const PALETTE = ["#D62828", "#F77F00", "#FCBF49", "#06A77D", "#0066CC", "#C71585"] as const;

export function flagColor(n: number): string {
  return PALETTE[(n - 1) % PALETTE.length];
}

interface Props {
  number: number;
  hasRecording: boolean;
  hasNote: boolean;
  onClick: () => void;
}

export function BuntingFlag({ number, hasRecording, hasNote, onClick }: Props) {
  const fill = flagColor(number);
  const flagStyle: CSSProperties = {
    background: fill,
    clipPath: "polygon(0 0, 100% 0, 50% 100%)",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir estrofe ${number}`}
      className="group relative flex flex-col items-center cursor-pointer focus:outline-none"
    >
      <span aria-hidden className="block w-px h-3 bg-[#8B7355]" />
      <span
        style={flagStyle}
        className="relative w-12 h-14 sm:w-14 sm:h-16 md:w-16 md:h-20 shadow-[2px_2px_0_rgba(44,24,16,0.35)] transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110 group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-[#2C1810]"
      >
        <span
          className="absolute inset-0 flex items-start justify-center pt-1 sm:pt-1.5 text-white font-bold text-base sm:text-lg md:text-xl"
          style={{ fontFamily: "Fraunces, Georgia, serif", textShadow: "1px 1px 0 rgba(0,0,0,0.4)" }}
        >
          {number}
        </span>
      </span>
      {(hasRecording || hasNote) && (
        <span className="absolute -top-1 -right-1 flex gap-0.5">
          {hasRecording && (
            <span
              aria-label="Tem gravação"
              title="Tem gravação"
              className="block w-2.5 h-2.5 rounded-full bg-[#D62828] border border-white"
            />
          )}
          {hasNote && (
            <span
              aria-label="Tem anotação"
              title="Tem anotação"
              className="block w-2.5 h-2.5 rounded-full bg-[#FCBF49] border border-white"
            />
          )}
        </span>
      )}
    </button>
  );
}
