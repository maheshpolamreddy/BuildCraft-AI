import { GoogleGenerativeAI } from "@google/generative-ai";

export function getGeminiApiKey(): string | undefined {
  const k = process.env.GEMINI_API_KEY?.trim();
  return k || undefined;
}

export function getGeminiModelId(): string {
  return process.env.GEMINI_MODEL_ID?.trim() || "gemini-2.0-flash";
}

export type GeminiGenerateOpts = {
  maxOutputTokens?: number;
};

/**
 * Non-streaming text generation via Gemini (primary UI brain when configured).
 */
export async function geminiGenerateText(
  systemInstruction: string,
  userText: string,
  genOpts?: GeminiGenerateOpts,
): Promise<string> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: getGeminiModelId(),
    systemInstruction,
  });

  const res = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: genOpts?.maxOutputTokens ?? 8192,
    },
  });

  const text = res.response.text();
  if (!text?.trim()) throw new Error("GEMINI_EMPTY");
  return text;
}
