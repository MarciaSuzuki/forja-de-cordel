"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { BuntingGallery } from "./BuntingGallery";
import { StropheModal } from "./StropheModal";
import { listRecordedEstrofes } from "@/lib/audioStore";
import { listEstrofesWithNotes } from "@/lib/notesStore";

const TOTAL_ESTROFES = 40;
const FULL_AUDIO_URL = "/os_quatro_de_anama_completo.mp3";
const HEADER_IMAGE = "/forja_de_cordel.jpeg";

export function AnamaPage() {
  const [activeEstrofe, setActiveEstrofe] = useState<number | null>(null);
  const [recordedSet, setRecordedSet] = useState<Set<number>>(new Set());
  const [noteSet, setNoteSet] = useState<Set<number>>(new Set());
  const fullAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void listRecordedEstrofes().then((arr) => setRecordedSet(new Set(arr)));
    setNoteSet(new Set(listEstrofesWithNotes()));
  }, []);

  const handleSelect = useCallback((n: number) => {
    if (fullAudioRef.current) fullAudioRef.current.pause();
    setActiveEstrofe(n);
  }, []);

  const handleRecordingChange = useCallback((n: number, exists: boolean) => {
    setRecordedSet((prev) => {
      const next = new Set(prev);
      if (exists) next.add(n);
      else next.delete(n);
      return next;
    });
  }, []);

  const handleNoteChange = useCallback((n: number, exists: boolean) => {
    setNoteSet((prev) => {
      const next = new Set(prev);
      if (exists) next.add(n);
      else next.delete(n);
      return next;
    });
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#F5E6D3",
        color: "#2C1810",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
      />

      <header className="relative w-full">
        <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full overflow-hidden">
          <Image
            src={HEADER_IMAGE}
            alt="Forja de Cordel — xilogravura"
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-[#F5E6D3]" />
        </div>
        <div className="max-w-4xl mx-auto px-4 -mt-12 sm:-mt-16 relative z-10 text-center">
          <h1
            className="text-3xl sm:text-5xl md:text-6xl font-bold drop-shadow-md"
            style={{ fontFamily: "Fraunces, Georgia, serif", color: "#2C1810" }}
          >
            Os Quatro de Anamá
          </h1>
          <p className="mt-2 text-base sm:text-lg" style={{ color: "#2C1810" }}>
            Cordel de <span className="font-semibold">Marcia Suzuki</span>
          </p>
          <p
            className="mt-1 inline-block px-3 py-1 rounded-full text-xs sm:text-sm font-semibold tracking-wide uppercase"
            style={{ background: "#2C1810", color: "#FCBF49" }}
          >
            Workshop Ready Vessels
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        <section className="mb-8 sm:mb-12">
          <h2
            className="text-xl sm:text-2xl font-bold mb-3"
            style={{ fontFamily: "Fraunces, Georgia, serif" }}
          >
            Ouvir o cordel completo
          </h2>
          <p className="text-sm opacity-80 mb-3">
            Reproduza o cordel inteiro ou clique em uma bandeirinha abaixo para abrir uma estrofe.
          </p>
          <audio
            ref={fullAudioRef}
            controls
            preload="none"
            src={FULL_AUDIO_URL}
            className="w-full"
            aria-label="Cordel completo Os Quatro de Anamá"
          >
            Seu navegador não suporta áudio HTML5.
          </audio>
        </section>

        <section>
          <div className="flex items-end justify-between mb-4 sm:mb-6 flex-wrap gap-2">
            <h2
              className="text-xl sm:text-2xl font-bold"
              style={{ fontFamily: "Fraunces, Georgia, serif" }}
            >
              As 40 estrofes
            </h2>
            <div className="text-xs sm:text-sm flex items-center gap-3 opacity-80">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#D62828] border border-white" />
                gravação
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FCBF49] border border-white" />
                anotação
              </span>
            </div>
          </div>

          <BuntingGallery
            total={TOTAL_ESTROFES}
            recordedSet={recordedSet}
            noteSet={noteSet}
            onSelect={handleSelect}
          />

          <p className="mt-6 text-xs opacity-60 text-center">
            Suas gravações e anotações ficam salvas neste navegador. Use o mesmo dispositivo para retomar o trabalho.
          </p>
        </section>
      </main>

      <footer className="py-8 text-center text-xs opacity-60">
        Os Quatro de Anamá · Workshop Ready Vessels · Shema Bible Translation
      </footer>

      {activeEstrofe !== null && (
        <StropheModal
          estrofe={activeEstrofe}
          onClose={() => setActiveEstrofe(null)}
          onRecordingChange={handleRecordingChange}
          onNoteChange={handleNoteChange}
        />
      )}
    </div>
  );
}
