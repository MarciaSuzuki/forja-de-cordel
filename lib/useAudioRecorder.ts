"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const tickRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setState("requesting");
    setElapsedMs(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 44100 },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      startTimeRef.current = Date.now();
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 250);
      setState("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao acessar microfone";
      setError(msg);
      setState("error");
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const mr = mediaRecorderRef.current;
    if (!mr) return null;
    return new Promise<Blob | null>((resolve) => {
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setState("stopped");
        if (tickRef.current) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        resolve(blob);
      };
      mr.stop();
    });
  }, []);

  const reset = useCallback(() => {
    chunksRef.current = [];
    setElapsedMs(0);
    setState("idle");
    setError(null);
  }, []);

  return { state, error, elapsedMs, start, stop, reset };
}
