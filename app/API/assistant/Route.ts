import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export async function POST(req: Request) {
  try {
    // 2. Parse data from your Frontend
    const { mode, text, code } = await req.json();

    // 3. Select the Model (Flash is fastest for hackathons)
// Try this specific version which is often more stable in Canada
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    let prompt = "";

    // 4. Construct the Prompt based on the button clicked
    if (mode === "generate") {
      prompt = `You are a Python coding assistant. 
      User Request: "${text}"
      
      Instructions:
      - Return ONLY valid Python code.
      - Do not use Markdown backticks.
      - Do not add explanations.`;
    } 
    else if (mode === "simplify_code") {
      prompt = `You are an accessibility expert helper.
      Original Code:
      ${code}
      
      Instructions:
      - Rewrite this code to be extremely readable for beginners.
      - Add simple comments explaining every line.
      - Use descriptive variable names.
      - Return ONLY the code.`;
    } 
    else if (mode === "explain_error") {
      prompt = `You are a supportive teacher.
      Error Message: "${text}"
      
      Instructions:
      - Explain this error in one simple, non-technical sentence.
      - Be encouraging.`;
    }

    // 5. Ask Gemini
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const outputText = response.text();

    // 6. Send the answer back to your UI
    return NextResponse.json({ result: outputText });

  } catch (error) {
    console.error("Google AI Error:", error);
    return NextResponse.json(
      { result: "Error: Could not connect to Google AI. Check API Key." }, 
      { status: 500 }
    );
  }
}