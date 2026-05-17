"use client";

const PALETTE = ["#c5c29f", "#a89669", "#dcc392", "#8b7d5a"] as const;

export const INK = "#0f0c08";
export const PARCHMENT = "#ead9ae";

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

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir estrofe ${number}`}
      className="group relative flex flex-col items-center cursor-pointer focus:outline-none"
    >
      <span aria-hidden className="block w-px h-3" style={{ background: INK }} />
      <span className="relative block w-12 h-16 sm:w-14 sm:h-20 md:w-16 md:h-20 transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110">
        <svg
          viewBox="0 0 60 80"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full drop-shadow-[2px_2px_0_rgba(15,12,8,0.25)]"
          aria-hidden
        >
          <polygon
            points="2,2 58,2 30,76"
            fill={fill}
            stroke={INK}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <line x1="6" y1="8" x2="54" y2="8" stroke={INK} strokeWidth="0.6" opacity="0.55" />
        </svg>
        <span
          className="absolute inset-0 flex items-start justify-center pt-1.5 sm:pt-2 font-bold text-base sm:text-lg md:text-xl"
          style={{ fontFamily: "Fraunces, Georgia, serif", color: INK }}
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
              className="block w-2.5 h-2.5 rounded-full"
              style={{ background: INK, boxShadow: `0 0 0 1.5px ${PARCHMENT}` }}
            />
          )}
          {hasNote && (
            <span
              aria-label="Tem anotação"
              title="Tem anotação"
              className="block w-2.5 h-2.5 rounded-full"
              style={{ background: PARCHMENT, boxShadow: `inset 0 0 0 1.5px ${INK}` }}
            />
          )}
        </span>
      )}
    </button>
  );
}
