import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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
    const { mode, text, code, breakpoints } = await req.json();

    console.log("✅ API HIT:", mode);

    // Execute Python code directly
    if (mode === "execute_code") {
      try {
        // Execute Python code and capture output
        const { stdout, stderr } = await execAsync(`python3 -c "${code.replace(/"/g, '\\"')}"`, {
          timeout: 5000, // 5 second timeout
          maxBuffer: 1024 * 1024, // 1MB buffer
        });

        const output = stdout || stderr || "Code executed successfully with no output.";
        return NextResponse.json({ result: output });
      } catch (err: any) {
        const errorOutput = err.stderr || err.message || "Unknown error";
        return NextResponse.json({ result: `Error:\n${errorOutput}` });
      }
    }

    // Run Python static analysis for debug mode (no external deps)
    if (mode === "debug") {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `debug_${Date.now()}.py`);
        const scriptFile = path.join(tempDir, `analyzer_${Date.now()}.py`);
        
        // Parse breakpoints and create debug wrapper
        const breakpointLines = breakpoints && Array.isArray(breakpoints) ? breakpoints : [];
        const breakpointChecks = breakpointLines.map(bp => `
if __line__ == ${bp}:
    print(f"Breakpoint hit at line ${bp}")
    import sys
    frame = sys._getframe()
    print(f"Variables: {frame.f_locals}")`).join('\n');

        // Add sys.settrace for execution debugging with breakpoints
        const debuggedCode = `
import sys

__line__ = 0
def trace_calls(frame, event, arg):
    global __line__
    if event == 'line':
        __line__ = frame.f_lineno
        ${breakpointLines.length > 0 ? `if __line__ in ${JSON.stringify(breakpointLines)}:
            print(f"Breakpoint hit at line {__line__}: {frame.f_code.co_filename}")` : '# No breakpoints set'}
    return trace_calls

${breakpointLines.length > 0 ? 'sys.settrace(trace_calls)' : ''}

try:
    exec("""${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}""")
finally:
    ${breakpointLines.length > 0 ? 'sys.settrace(None)' : 'pass'}
`;

        fs.writeFileSync(tempFile, code);
        fs.writeFileSync(scriptFile, debuggedCode);
        
        try {
          const { stdout, stderr } = await execAsync(`python3 "${scriptFile}"`, {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
          });
          
          const output = stdout || stderr || "✓ No issues detected";
          try { fs.unlinkSync(tempFile); } catch {}
          try { fs.unlinkSync(scriptFile); } catch {}
          return NextResponse.json({ result: output });
        } catch (err: any) {
          const output = err.stdout || err.stderr || "✓ No issues detected";
          try { fs.unlinkSync(tempFile); } catch {}
          try { fs.unlinkSync(scriptFile); } catch {}
          return NextResponse.json({ result: output });
        }
      } catch (err: any) {
        return NextResponse.json({ result: `Debug error: ${err.message}` });
      }
    }

    // Use AI for other modes (generate, simplify, explain_error)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { result: "Error: Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

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
