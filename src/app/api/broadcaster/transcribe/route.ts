import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

const candidateModels = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

export async function POST(req: NextRequest) {
  try {
    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is not configured on the server." },
        { status: 500 }
      );
    }

    let audioBase64 = "";
    let mimeType = "audio/webm";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("audio") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No audio file provided in request." },
          { status: 400 }
        );
      }
      mimeType = file.type || "audio/webm";
      const buffer = Buffer.from(await file.arrayBuffer());
      audioBase64 = buffer.toString("base64");
    } else {
      const body = await req.json();
      audioBase64 = body.audio || "";
      mimeType = body.mimeType || "audio/webm";
    }

    if (!audioBase64) {
      return NextResponse.json(
        { error: "Audio data is empty." },
        { status: 400 }
      );
    }

    // Clean up base64 prefix if provided (e.g. data:audio/webm;base64,...)
    if (audioBase64.includes(",")) {
      audioBase64 = audioBase64.split(",")[1];
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    let transcribedText = "";
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          {
            text: "Transcribe the spoken words in this audio into plain English text. Return ONLY the transcribed text. Do NOT add any preamble, explanation, quotation marks, or markdown formatting. If the audio is silent or contains no discernible speech, return an empty string.",
          },
        ]);

        const rawText = result.response.text();
        transcribedText = rawText ? rawText.trim() : "";
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[transcribe] Model ${modelName} failed, falling back:`, err.message || err);
      }
    }

    if (!transcribedText && lastError && !lastError.message?.includes("empty")) {
      console.warn("[transcribe] All candidate models failed:", lastError);
    }

    return NextResponse.json({
      text: transcribedText,
      success: true,
    });
  } catch (error: any) {
    console.error("[broadcaster transcribe route error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to transcribe audio." },
      { status: 500 }
    );
  }
}
