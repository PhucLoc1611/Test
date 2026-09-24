import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { LineItem, Refusal } from "@/src/domain/extraction";
import { PublicError } from "@/src/lib/errors";

const GeminiItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().finite(),
  unit: z.string().min(1).optional(),
  page: z.number().int().positive(),
  sourceText: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const GeminiRefusalSchema = z.object({
  page: z.number().int().positive().optional(),
  sourceText: z.string().min(1).optional(),
  reason: z.string().min(1),
  userMessage: z.string().min(1),
});

const GeminiResponseSchema = z.object({
  items: z.array(GeminiItemSchema),
  refusals: z.array(GeminiRefusalSchema),
});

const GEMINI_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          page: { type: "integer" },
          sourceText: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["description", "quantity", "page", "sourceText", "confidence"],
      },
    },
    refusals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          page: { type: "integer" },
          sourceText: { type: "string" },
          reason: { type: "string" },
          userMessage: { type: "string" },
        },
        required: ["reason", "userMessage"],
      },
    },
  },
  required: ["items", "refusals"],
};

const EXTRACTION_PROMPT = `You are an evidence-first document extraction system.

Read the supplied PDF pages visually. Extract only line-item quantities that are visibly present.

Hard rules:
- Never calculate, estimate, infer, combine, or repair a number.
- Never use a subtotal, total, date, invoice number, page number, or product code as a quantity unless it is clearly a line-item quantity.
- For every item, copy an exact visible sourceText quote from the same page and give its 1-based page number.
- If text is blurry, cropped, contradictory, or the quantity is uncertain, do not output an item. Add a refusal instead.
- confidence must describe how certain you are that the quantity and quote are visibly correct. Use a value below 0.9 when uncertain.
- If there are no safe items, return an empty items array and explain the refusal.

Return only JSON matching the requested schema.`;

function quantityAppearsInQuote(quantity: number, sourceText: string): boolean {
  const numberText = String(quantity);
  const commaText = numberText.replace(".", ",");
  return sourceText.includes(numberText) || sourceText.includes(commaText);
}

function isTemporaryModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /503|UNAVAILABLE|high demand|overloaded|temporar/i.test(message);
}

export async function extractImageDocument(buffer: Buffer): Promise<{
  items: LineItem[];
  refusals: Refusal[];
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new PublicError(
      "GEMINI_CONFIG_MISSING",
      "Image extraction is not configured. Add GEMINI_API_KEY on the server.",
      503,
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const primaryModel = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.5-flash-lite,gemini-3.6-flash")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const contents = [
    { text: EXTRACTION_PROMPT },
    {
      inlineData: {
        mimeType: "application/pdf",
        data: buffer.toString("base64"),
      },
    },
  ];
  const config = {
    temperature: 0,
    responseMimeType: "application/json",
    responseSchema: GEMINI_JSON_SCHEMA,
  };

  let response;
  let lastError: unknown;
  for (const model of [primaryModel, ...fallbackModels]) {
    if (model !== primaryModel && !isTemporaryModelError(lastError)) break;

    try {
      response = await ai.models.generateContent({ model, contents, config });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response) {
    const temporary = isTemporaryModelError(lastError);
    throw new PublicError(
      temporary ? "GEMINI_UNAVAILABLE" : "GEMINI_REQUEST_FAILED",
      temporary
        ? "Gemini is temporarily unavailable. Both configured AI models are busy; please try again shortly. No quantities were saved."
        : "The AI extraction service could not read this document. No quantities were saved from the AI response.",
      temporary ? 503 : 502,
      lastError instanceof Error ? lastError.message : undefined,
    );
  }

  let parsed: z.infer<typeof GeminiResponseSchema>;
  try {
    parsed = GeminiResponseSchema.parse(JSON.parse(response.text ?? ""));
  } catch {
    throw new PublicError(
      "GEMINI_RESPONSE_INVALID",
      "The image extraction service returned an unusable result. No quantities were saved from it.",
      502,
    );
  }

  const refusals: Refusal[] = [...parsed.refusals];
  const items: LineItem[] = [];

  for (const candidate of parsed.items) {
    if (candidate.confidence < 0.9) {
      refusals.push({
        page: candidate.page,
        sourceText: candidate.sourceText,
        reason: "AI_CONFIDENCE_TOO_LOW",
        userMessage: "The image was not clear enough to verify this quantity safely.",
      });
      continue;
    }

    if (!quantityAppearsInQuote(candidate.quantity, candidate.sourceText)) {
      refusals.push({
        page: candidate.page,
        sourceText: candidate.sourceText,
        reason: "AI_EVIDENCE_UNVERIFIED",
        userMessage: "The AI returned a quantity, but it could not be verified in the quoted source text.",
      });
      continue;
    }

    items.push({
      description: candidate.description,
      quantity: candidate.quantity,
      ...(candidate.unit ? { unit: candidate.unit } : {}),
      evidence: {
        page: candidate.page,
        sourceText: candidate.sourceText,
        sourceType: "gemini_vision",
        confidence: candidate.confidence,
      },
    });
  }

  return { items, refusals };
}
