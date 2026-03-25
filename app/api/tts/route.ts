// app/api/tts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { text, psalmNumber } = await req.json();
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      return NextResponse.json(
        { error: "ElevenLabs not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in your environment." },
        { status: 503 }
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`ElevenLabs error ${response.status}: ${err.slice(0, 200)}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const fileName = `cordel-final-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.mp3`;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

    if (blobToken) {
      const folder =
        Number.isInteger(psalmNumber) && psalmNumber >= 1 && psalmNumber <= 150
          ? `salmos/salmo-${String(psalmNumber).padStart(3, "0")}`
          : "salmos/sem-numero";

      const blob = await put(`${folder}/${fileName}`, Buffer.from(audioBuffer), {
        access: "public",
        contentType: "audio/mpeg",
        addRandomSuffix: false,
      });

      return NextResponse.json({
        url: blob.url,
        pathname: blob.pathname,
        fileName,
        persisted: true,
      });
    }

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
