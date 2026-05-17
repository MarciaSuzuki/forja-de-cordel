"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioRecorder } from "@/lib/useAudioRecorder";
import { deleteRecording, loadRecording, saveRecording } from "@/lib/audioStore";
import { loadNote, saveNote } from "@/lib/notesStore";
import { flagColor } from "./BuntingFlag";

interface Props {
  estrofe: number;
  onClose: () => void;
  onRecordingChange: (estrofe: number, exists: boolean) => void;
  onNoteChange: (estrofe: number, exists: boolean) => void;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function StropheModal({ estrofe, onClose, onRecordingChange, onNoteChange }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const [notes, setNotes] = useState("");
  const [hadExistingRecording, setHadExistingRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [longRecWarning, setLongRecWarning] = useState(false);
  const recorder = useAudioRecorder();
  const color = flagColor(estrofe);

  useEffect(() => {
    setNotes(loadNote(estrofe));
    loadRecording(estrofe).then((blob) => {
      if (blob) {
        setHadExistingRecording(true);
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        setRecordingBlob(blob);
      }
    });
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (recordingPlaybackRef.current) recordingPlaybackRef.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estrofe]);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  useEffect(() => {
    if (recorder.state === "recording" && recorder.elapsedMs > FIVE_MINUTES_MS) {
      setLongRecWarning(true);
    } else if (recorder.state !== "recording") {
      setLongRecWarning(false);
    }
  }, [recorder.state, recorder.elapsedMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleStartRec = useCallback(async () => {
    if (recordingPlaybackRef.current) recordingPlaybackRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
    await recorder.start();
  }, [recorder]);

  const handleStopRec = useCallback(async () => {
    const blob = await recorder.stop();
    if (!blob) return;
    await saveRecording(estrofe, blob);
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    const url = URL.createObjectURL(blob);
    setRecordingUrl(url);
    setRecordingBlob(blob);
    setHadExistingRecording(true);
    onRecordingChange(estrofe, true);
  }, [estrofe, onRecordingChange, recorder, recordingUrl]);

  const handlePlayRecording = useCallback(() => {
    if (!recordingPlaybackRef.current) return;
    if (audioRef.current) audioRef.current.pause();
    recordingPlaybackRef.current.currentTime = 0;
    void recordingPlaybackRef.current.play();
  }, []);

  const handleDeleteRecording = useCallback(async () => {
    await deleteRecording(estrofe);
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(null);
    setRecordingBlob(null);
    setHadExistingRecording(false);
    recorder.reset();
    onRecordingChange(estrofe, false);
  }, [estrofe, onRecordingChange, recorder, recordingUrl]);

  const handleSaveNotes = useCallback(() => {
    saveNote(estrofe, notes);
    onNoteChange(estrofe, notes.trim().length > 0);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }, [estrofe, notes, onNoteChange]);

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setNotes(v);
      saveNote(estrofe, v);
      onNoteChange(estrofe, v.trim().length > 0);
    },
    [estrofe, onNoteChange]
  );

  const stropheAudioUrl = `/anama%20${estrofe}.mp3`;

  const isRecording = recorder.state === "recording";
  const isRequesting = recorder.state === "requesting";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="strophe-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border-2 overflow-hidden"
        style={{ borderColor: color, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ background: color, color: "white" }}
        >
          <h2
            id="strophe-modal-title"
            className="text-xl sm:text-2xl font-bold"
            style={{ fontFamily: "Fraunces, Georgia, serif", textShadow: "1px 1px 0 rgba(0,0,0,0.25)" }}
          >
            Estrofe {estrofe}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-white text-2xl leading-none hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-white rounded px-2"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto" style={{ background: "#F5E6D3", color: "#2C1810" }}>
          <section>
            <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide opacity-70">Áudio da estrofe</h3>
            <audio ref={audioRef} controls preload="none" src={stropheAudioUrl} className="w-full">
              Seu navegador não suporta áudio HTML5.
            </audio>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide opacity-70">Sua gravação</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStartRec}
                disabled={isRecording || isRequesting}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 font-semibold text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "#D62828" }}
              >
                <span aria-hidden className="block w-2.5 h-2.5 rounded-full bg-white" />
                {isRequesting ? "Permitindo..." : isRecording ? "Gravando..." : hadExistingRecording ? "Regravar" : "Gravar"}
              </button>
              <button
                type="button"
                onClick={handleStopRec}
                disabled={!isRecording}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 font-semibold text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "#2C1810" }}
              >
                <span aria-hidden className="block w-2.5 h-2.5 bg-white" />
                Parar
              </button>
              <button
                type="button"
                onClick={handlePlayRecording}
                disabled={!recordingUrl || isRecording}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 font-semibold text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "#06A77D" }}
              >
                ▶ Reproduzir
              </button>
              {recordingUrl && !isRecording && (
                <button
                  type="button"
                  onClick={handleDeleteRecording}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border transition hover:bg-black/5"
                  style={{ borderColor: "#8B7355", color: "#2C1810" }}
                >
                  Apagar
                </button>
              )}
            </div>

            <p className="mt-2 text-sm opacity-80">
              {isRecording && (
                <>
                  ● Gravando — {formatTime(recorder.elapsedMs)}
                </>
              )}
              {!isRecording && recordingUrl && <>✓ Gravação pronta para ouvir.</>}
              {!isRecording && !recordingUrl && recorder.state === "idle" && <>Pronto para gravar.</>}
              {recorder.state === "error" && <span className="text-[#D62828]">Erro: {recorder.error}</span>}
            </p>

            {longRecWarning && (
              <p className="mt-1 text-sm font-medium text-[#D62828]">
                A gravação já passou de 5 minutos. Considere parar.
              </p>
            )}

            {recordingUrl && (
              <audio
                ref={recordingPlaybackRef}
                controls
                src={recordingUrl}
                className="mt-3 w-full"
                preload="metadata"
              />
            )}
            {recordingBlob && (
              <p className="mt-1 text-xs opacity-60">
                Tamanho: {Math.round((recordingBlob.size / 1024) * 10) / 10} KB
              </p>
            )}
          </section>

          <section>
            <label
              htmlFor={`notes-${estrofe}`}
              className="block text-sm font-semibold mb-2 uppercase tracking-wide opacity-70"
            >
              Anotações sobre a estrofe
            </label>
            <textarea
              id={`notes-${estrofe}`}
              value={notes}
              onChange={handleNotesChange}
              placeholder="Escreva suas observações sobre esta estrofe..."
              rows={5}
              className="w-full rounded-md border bg-white p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 transition"
              style={{ borderColor: "#8B7355" }}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveNotes}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 font-semibold text-white shadow-sm transition"
                style={{ background: "#F77F00" }}
              >
                Salvar anotações
              </button>
              {savedFlash && <span className="text-sm font-medium text-[#06A77D]">Salvo ✓</span>}
            </div>
            <p className="mt-1 text-xs opacity-60">As anotações são salvas automaticamente conforme você digita.</p>
          </section>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 font-semibold border transition hover:bg-black/5"
              style={{ borderColor: "#2C1810", color: "#2C1810" }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
