"use client";

import "regenerator-runtime/runtime";
import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Mic, StopCircle, Wand2, Activity, Terminal, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const [code, setCode] = useState("# Python code will appear here...\n");
  const [consoleOutput, setConsoleOutput] = useState("Ready...");
  const [isProcessing, setIsProcessing] = useState(false);

  const { transcript, listening, browserSupportsSpeechRecognition } = useSpeechRecognition();

  if (!browserSupportsSpeechRecognition) return <span>Use Chrome.</span>;

  // --- API HANDLER ---
  const handleAIRequest = async (mode: string, inputData: string) => {
    setIsProcessing(true);
    setConsoleOutput(`Processing: ${mode}...`);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text: inputData, code: code }),
      });
      const data = await response.json();
      if (mode === "generate" || mode === "simplify_code") setCode(data.result);
      if (mode === "explain_error") {
         setConsoleOutput(data.result);
         speakText(data.result);
      }
    } catch (e) { setConsoleOutput("Error connecting to AI."); } 
    finally { setIsProcessing(false); }
  };

  const readAndVibrateCode = () => { /* ... keep previous logic ... */ };
  const speakText = (text: string) => { 
    if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); 
  };

  return (
    <main className="flex h-screen w-full bg-[#0f172a] text-slate-100 font-sans overflow-hidden">
      
      {/* --- SIDEBAR: Clean Slate Design --- */}
      <div className="w-[360px] flex flex-col border-r border-slate-700/50 bg-[#1e293b] shadow-xl z-10">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <h1 className="text-xl font-bold text-white tracking-tight">Hackville IDE</h1>
          </div>
          <p className="text-xs text-slate-400 font-medium">Accessible coding suite</p>
        </div>

        {/* Voice Input Area */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Voice Input</label>
            <div className={`p-4 rounded-xl border-2 transition-colors ${listening ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-800'}`}>
               <p className="text-sm text-slate-300 min-h-[60px]">
                 {transcript || <span className="opacity-50">Press record and speak...</span>}
               </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={SpeechRecognition.startListening}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg font-semibold text-sm transition-all ${listening ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white text-slate-900 hover:bg-slate-200'}`}
              >
                <Mic size={16} /> {listening ? "Listening" : "Record"}
              </button>
              <button
                onClick={() => { SpeechRecognition.stopListening(); handleAIRequest("generate", transcript); }}
                className="flex items-center justify-center gap-2 p-3 rounded-lg font-semibold text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all"
              >
                <StopCircle size={16} /> Process
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-700/50 w-full"></div>

          {/* Tools */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tools</label>
            <ToolsButton label="Simplify Code" icon={<Wand2 size={16} />} onClick={() => handleAIRequest("simplify_code", "")} color="text-purple-400" />
            <ToolsButton label="Read & Vibrate" icon={<Activity size={16} />} onClick={readAndVibrateCode} color="text-emerald-400" />
            <ToolsButton label="Explain Error" icon={<Terminal size={16} />} onClick={() => handleAIRequest("explain_error", "Syntax Error")} color="text-orange-400" />
          </div>
        </div>

        {/* Footer / Console */}
        <div className="p-4 bg-slate-900 border-t border-slate-700/50 text-xs font-mono text-slate-400">
           <div className="flex items-center gap-2 mb-2">
             <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`}></div>
             <span>STATUS</span>
           </div>
           <p className="truncate">{isProcessing ? "Thinking..." : consoleOutput}</p>
        </div>
      </div>

      {/* --- EDITOR AREA --- */}
      <div className="flex-1 bg-[#0f172a] pt-4 pl-2">
        <Editor
          height="100vh"
          defaultLanguage="python"
          theme="vs-dark"
          value={code}
          onChange={(val) => setCode(val || "")}
          options={{
            fontSize: 18,
            fontFamily: "'Inter', sans-serif",
            minimap: { enabled: false },
            lineNumbers: "on",
            roundedSelection: false,
            scrollBeyondLastLine: false,
            padding: { top: 20 },
            overviewRulerBorder: false, // Cleaner look
          }}
        />
      </div>
    </main>
  );
}

// Helper Button Component
function ToolsButton({ label, icon, onClick, color }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all group">
      <div className="flex items-center gap-3">
        <div className={`${color} bg-slate-900 p-2 rounded-md`}>{icon}</div>
        <span className="text-sm font-medium text-slate-200">{label}</span>
      </div>
      <ChevronRight size={14} className="text-slate-500 group-hover:translate-x-1 transition-transform" />
    </button>
  );
}