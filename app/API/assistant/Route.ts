import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { GoogleGenerativeAI } from "@google/generative-ai";

const execAsync = promisify(exec);

// --- TYPES ---
type GeminiModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

// --- HELPER FUNCTIONS ---

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
Return ONLY Python code. No Markdown.

Input:
${text ?? ""}`;
  }

  if (mode === "simplify_code") {
    return `You are an accessibility expert.
Rewrite the code to be beginner-friendly and easy to read. Add comments.
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

// Helper to fetch data safely
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

// 🔎 AUTO-DISCOVERY: Finds a model that works in your region
async function listWorkingModel(apiKey: string): Promise<string | null> {
  const versions = ["v1beta", "v1"];

  for (const v of versions) {
    const url = `https://generativelanguage.googleapis.com/${v}/models`;
    const { ok, data } = await fetchJson(url, apiKey, { method: "GET" });

    if (!ok) continue;

    const models: GeminiModel[] = data.models || [];
    
    const candidates = models
      .map((m) => m.name || "")
      .filter((name) => name.toLowerCase().includes("gemini"))
      .filter((name) => !name.includes("embedding"))
      .filter((name) => !name.includes("vision"));

    if (candidates.length > 0) {
      return candidates[0].replace(/^models\//, "");
    }
  }

  return null;
}

// 🚀 GENERATE: Tries to call the API
async function generateWithModel(apiKey: string, model: string, prompt: string) {
  const versions = ["v1beta", "v1"];
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
  }

  return { ok: false, data: lastErr };
}

// --- MAIN API ROUTE ---

export async function POST(req: Request) {
  try {
    const { mode, text, code, breakpoints } = await req.json();

    console.log("✅ API HIT:", mode);

    // --- 1. HANDLE CODE EXECUTION (Windows Compatible) ---
    if (mode === "execute_code") {
      try {
        // FIX: Use 'python' for Windows
        const pythonCommand = process.platform === "win32" ? "python" : "python3";
        
        // FIX: Added '-u' flag for unbuffered output so it shows up immediately
        const { stdout, stderr } = await execAsync(
            `${pythonCommand} -u -c "${code.replace(/"/g, '\\"')}"`, 
            { timeout: 5000, maxBuffer: 1024 * 1024 }
        );

        const output = stdout || stderr || "Code executed successfully.";
        return NextResponse.json({ result: output });
      } catch (err: any) {
        const errorOutput = err.stderr || err.message || "Unknown error";
        return NextResponse.json({ result: `Error:\n${errorOutput}` });
      }
    }

    // --- 2. HANDLE DEBUGGING (Breakpoints) ---
    if (mode === "debug") {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `debug_${Date.now()}.py`);
        const scriptFile = path.join(tempDir, `analyzer_${Date.now()}.py`);
        
        const breakpointLines = breakpoints && Array.isArray(breakpoints) ? breakpoints : [];
        
        const debuggedCode = `
import sys

__line__ = 0
def trace_calls(frame, event, arg):
    global __line__
    if event == 'line':
        __line__ = frame.f_lineno
        ${breakpointLines.length > 0 ? `if __line__ in ${JSON.stringify(breakpointLines)}:
            print(f"Breakpoint hit at line {__line__}")` : '# No breakpoints'}
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
          const pythonCommand = process.platform === "win32" ? "python" : "python3";
          
          const { stdout, stderr } = await execAsync(`${pythonCommand} -u "${scriptFile}"`, {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
          });
          
          const output = stdout || stderr || "✓ No issues detected";
          return NextResponse.json({ result: output });
        } catch (err: any) {
          const output = err.stdout || err.stderr || "✓ No issues detected";
          return NextResponse.json({ result: output });
        } finally {
            try { fs.unlinkSync(tempFile); } catch {}
            try { fs.unlinkSync(scriptFile); } catch {}
        }
      } catch (err: any) {
        return NextResponse.json({ result: `Debug error: ${err.message}` });
      }
    }

    // --- 3. HANDLE AI GENERATION ---
    const apiKey = process.env.GOOGLE_API_KEY; 
    
    if (!apiKey) {
      return NextResponse.json(
        { result: "Error: Missing GOOGLE_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const prompt = buildPrompt(mode, text, code);
    let model = "gemini-1.5-flash"; 
    
    console.log(`🤖 Requesting AI model: ${model}`);
    let attempt = await generateWithModel(apiKey, model, prompt);

    if (!attempt.ok) {
      console.log("⚠️ Standard model failed. Auto-discovering...");
      const discovered = await listWorkingModel(apiKey);
      
      if (discovered) {
        console.log(`✅ Switched to model: ${discovered}`);
        attempt = await generateWithModel(apiKey, discovered, prompt);
      } else {
        throw new Error("No working Gemini models found.");
      }
    }

    if (!attempt.ok) {
      throw new Error(attempt.data?.error?.message || "Gemini API error.");
    }

    let resultText = attempt.data?.candidates?.[0]?.content?.parts?.[0]?.text || "# No result";
    return NextResponse.json({ result: cleanMarkdown(resultText) });

  } catch (err: any) {
    console.error("❌ API ERROR:", err?.message || err);
    return NextResponse.json({ result: `Error: ${err?.message || "Unknown error"}` }, { status: 500 });
  }
}