import { NextResponse } from "next/server";

type GeminiModel = {
  name?: string; // e.g. "models/gemini-2.0-flash"
  supportedGenerationMethods?: string[];
};

function cleanMarkdown(text: string) {
  return (text || "")
    .replace(/```python/gi, "")
    .replace(/```/g, "")
    .trim();
}

function buildPrompt(mode: string, text?: string, code?: string) {
  if (mode === "generate") {
    return `You are a Python coding assistant.
Convert the user input into valid Python code.
Return ONLY Python code.

Input:
${text ?? ""}`;
  }

  if (mode === "execute_code") {
    return `You are a Python interpreter.
Predict what this code prints to the console.
Return ONLY the console output (no explanations).

Code:
${code ?? ""}`;
  }

  if (mode === "simplify_code") {
    return `You are an accessibility expert.
Rewrite the code to be beginner-friendly and easy to read.
Keep the same behavior.
Return ONLY code.

Code:
${code ?? ""}`;
  }

  if (mode === "explain_error") {
    return `You are a teacher.
Explain this error simply, in short.

Error:
${text ?? ""}`;
  }

  return `Mode not recognized.`;
}

async function fetchJson(url: string, apiKey: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      ...(init?.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function listWorkingModel(apiKey: string): Promise<string | null> {
  // Try v1 first, then v1beta (Google keys vary)
  const versions = ["v1", "v1beta"];

  for (const v of versions) {
    const url = `https://generativelanguage.googleapis.com/${v}/models`;
    const { ok, data } = await fetchJson(url, apiKey, { method: "GET" });

    if (!ok) continue;

    const models: GeminiModel[] = data.models || [];
    const candidates = models
      .map((m) => m.name || "")
      .filter(Boolean)
      .filter((name) => name.startsWith("models/"))
      .filter((name) => name.toLowerCase().includes("gemini"))
      .filter((name) => !name.toLowerCase().includes("embedding"))
      .filter((name) => !name.toLowerCase().includes("imagen"));

    // Prefer models that explicitly support generateContent if available in payload
    const withMethods = models
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name || "")
      .filter(Boolean)
      .filter((name) => name.toLowerCase().includes("gemini"));

    const pick = (withMethods[0] || candidates[0] || "").replace(/^models\//, "");
    if (pick) return pick;
  }

  return null;
}

async function generateWithModel(apiKey: string, model: string, prompt: string) {
  // Try v1 first, then v1beta
  const versions = ["v1", "v1beta"];

  let lastErr: any = null;

  for (const v of versions) {
    const url = `https://generativelanguage.googleapis.com/${v}/models/${model}:generateContent`;

    const { ok, data } = await fetchJson(url, apiKey, {
      method: "POST",
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (ok) return { ok: true, data };

    lastErr = data;
    // If it's NOT_FOUND / model mismatch, try other version next
  }

  return { ok: false, data: lastErr };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { result: "Error: Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const { mode, text, code } = await req.json();

    console.log("✅ API HIT:", mode);

    const prompt = buildPrompt(mode, text, code);

    // Preferred model from env (if you set it), otherwise we'll auto-discover
    let model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    // First attempt
    let attempt = await generateWithModel(apiKey, model, prompt);

    // If fails, auto-discover a working model and retry once
    if (!attempt.ok) {
      console.log("⚠️ Model failed:", model, "→ trying to auto-pick a working model...");

      const discovered = await listWorkingModel(apiKey);
      if (!discovered) {
        const msg =
          attempt.data?.error?.message ||
          "No models available for this API key. Check AI Studio project + key permissions.";
        return NextResponse.json({ result: `Error: ${msg}` }, { status: 500 });
      }

      model = discovered;
      console.log("✅ Auto-picked model:", model);

      attempt = await generateWithModel(apiKey, model, prompt);
    }

    if (!attempt.ok) {
      const msg =
        attempt.data?.error?.message ||
        "Gemini API error (unknown).";
      return NextResponse.json({ result: `Error: ${msg}` }, { status: 500 });
    }

    const data = attempt.data;
    let resultText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "# No result";

    resultText = cleanMarkdown(resultText);

    return NextResponse.json({ result: resultText, modelUsed: model });
  } catch (err: any) {
    console.error("❌ API ERROR:", err?.message || err);
    return NextResponse.json(
      { result: `Error: ${err?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
