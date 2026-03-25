"use client";

import Image from "next/image";

const INK = "#0f0c08";
const PAPER = "#f7edcf";
const SHADE = "#ab9368";

export function CordelBanner({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <Image
        src="/banner-cordel.jpeg"
        alt="Banner em estilo de xilogravura sertaneja"
        width={3584}
        height={1184}
        priority
        className="h-auto w-full"
      />
    </div>
  );
}

export function XiloBorder() {
  return (
    <svg viewBox="0 0 800 48" className="w-full h-10" aria-hidden="true">
      <rect width="800" height="48" rx="8" fill={INK} />
      <path
        d="M18 24h764"
        stroke={PAPER}
        strokeWidth="2"
        strokeDasharray="16 10"
      />
      <path
        d="M40 14l10 10 10-10 10 10 10-10 10 10 10-10 10 10M240 14l10 10 10-10 10 10 10-10 10 10 10-10 10 10M440 14l10 10 10-10 10 10 10-10 10 10 10-10 10 10M640 14l10 10 10-10 10 10 10-10 10 10 10-10 10 10"
        stroke={PAPER}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="120" cy="24" r="6" fill={PAPER} />
      <circle cx="680" cy="24" r="6" fill={PAPER} />
    </svg>
  );
}

export function XiloDivider() {
  return (
    <svg viewBox="0 0 420 36" className="w-56 h-7 mx-auto my-5" aria-hidden="true">
      <path d="M0 18h150M270 18h150" stroke={INK} strokeWidth="2.5" />
      <circle cx="210" cy="18" r="7" fill={INK} />
      <path d="M172 18h18M230 18h18" stroke={SHADE} strokeWidth="3" strokeLinecap="round" />
      <path
        d="M188 18l4-8 4 16 4-24 4 26 4-18 4 10 4-6 4 4 4-4 4 6 4-10 4 18 4-26 4 24 4-16 4 8"
        fill={INK}
      />
    </svg>
  );
}

export function XiloTreeAndChaff() {
  return <CordelBanner className="w-full rounded-[20px]" />;
}

export function XiloCorner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`w-12 h-12 ${className}`} aria-hidden="true">
      <rect width="64" height="64" rx="12" fill={INK} />
      <circle cx="20" cy="18" r="7" fill={PAPER} />
      <rect x="16" y="32" width="8" height="20" rx="4" fill={PAPER} />
      <rect x="10" y="38" width="5" height="10" rx="2.5" fill={PAPER} />
      <rect x="25" y="36" width="5" height="10" rx="2.5" fill={PAPER} />
      <path d="M36 16h16M42 12l6 8 6-8 6 8" stroke={PAPER} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
