import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq'; 
import { generateText } from 'ai';
import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

// 1. Initialize Providers with your custom .env names
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY || '',
});

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY || '',
});

// 2. Helper to clean AI output
function cleanMarkdown(text: string) {
  return (text || "").replace(/```python/gi, "").replace(/```/g, "").trim();
}

// 3. Main API Route
export async function POST(req: Request) {
  try {
    const { mode, text, code, breakpoints } = await req.json();

    // --- A. PYTHON EXECUTION (Local Machine Only) ---
    if (mode === "execute_code" || mode === "debug") {
      const tempFile = path.join(os.tmpdir(), `hapti_${Date.now()}.py`);
      fs.writeFileSync(tempFile, mode === "debug" ? wrapDebug(code, breakpoints) : code);
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      
      try {
        const { stdout, stderr } = await execAsync(`${pythonCmd} "${tempFile}"`, { timeout: 5000 });
        return NextResponse.json({ result: (stdout || stderr || "Done").trim() });
      } catch (err: any) {
        return NextResponse.json({ result: err.stdout || err.stderr || "Execution Error" });
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    }

    // --- B. AI GENERATION WITH FALLBACK ---
    const systemPrompt = `You are a Python expert for HaptiCode, an accessible IDE. 
    Mode: ${mode}. 
    Provide ONLY the requested output without conversational filler.`;

    const userPrompt = text || code;
    
    try {
      // Primary attempt: Gemini
      const { text: aiResponse } = await generateText({
        model: google('gemini-1.5-flash'),
        system: systemPrompt,
        prompt: userPrompt,
      });
      return NextResponse.json({ result: cleanMarkdown(aiResponse) });

    } catch (geminiError: any) {
      console.warn("Gemini limit hit or error. Switching to Groq fallback...");
      
      try {
        // Fallback attempt: Groq (Llama 3.3 is very fast and reliable)
        const { text: backupResponse } = await generateText({
          model: groq('llama-3.3-70b-versatile'),
          system: systemPrompt,
          prompt: userPrompt,
        });
        return NextResponse.json({ result: cleanMarkdown(backupResponse) });
      } catch (groqError: any) {
        return NextResponse.json({ 
          result: "Error: Both Gemini and Groq are currently unavailable." 
        }, { status: 503 });
      }
    }

  } catch (err: any) {
    console.error("Critical API Error:", err);
    return NextResponse.json({ result: `System Error: ${err.message}` }, { status: 500 });
  }
}

// Keep your existing debug wrapper
function wrapDebug(code: string, bp: number[]) {
  return `import sys
def trace(f, e, a):
 if e=='line' and f.f_lineno in ${JSON.stringify(bp || [])}:
  print(f'Line {f.f_lineno} hit')
 return trace
sys.settrace(trace)
try:
 exec(${JSON.stringify(code)})
finally:
 sys.settrace(None)`;
}