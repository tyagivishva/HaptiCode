"use client";

import "regenerator-runtime/runtime";
import React, { useState, useEffect, JSX } from "react";
import Editor from "@monaco-editor/react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Mic, StopCircle, Wand2, Activity, Terminal, ChevronRight, Play, Bug, Volume2 } from "lucide-react";

export default function Home() {
  // State
  const [code, setCode] = useState("# HaptiCode: Press 'Record' and speak...\n");
  const [consoleOutput, setConsoleOutput] = useState("Ready...");
  const [terminalOutput, setTerminalOutput] = useState(">> Terminal Ready");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Hooks
  const { transcript, listening, browserSupportsSpeechRecognition, resetTranscript } = useSpeechRecognition();

  // Fix hydration issues
  useEffect(() => { setIsClient(true); }, []);

  if (!isClient) return null;
  if (!browserSupportsSpeechRecognition) {
    return <div className="h-screen flex items-center justify-center bg-black text-white">Browser not supported. Please use Chrome.</div>;
  }

  // --- API HANDLER ---
  const handleAIRequest = async (mode: string, inputData: string) => {
    setIsProcessing(true);
    setConsoleOutput(mode === "execute_code" ? "Executing..." : `Processing...`);
    
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text: inputData, code: code }),
      });
      
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.result);

      if (mode === "generate" || mode === "simplify_code") {
        setCode(data.result);
        setConsoleOutput("Success.");
      } 
      else if (mode === "explain_error") {
         setConsoleOutput("Explanation received.");
         setTerminalOutput(`>> AI Explanation:\n${data.result}`);
         speakText(data.result);
      }
      else if (mode === "execute_code") {
        setTerminalOutput(`>> Output:\n${data.result}`);
        setConsoleOutput("Execution finished.");
      }
    } catch (e: any) { 
      setConsoleOutput("Error."); 
      setTerminalOutput(`>> Error: ${e.message}`);
    } 
    finally { 
      setIsProcessing(false); 
      if (mode === "generate") resetTranscript();
    }
  };

  // --- HAPTIC & VOICE ENGINE ---
  const readAndVibrateCode = () => {
    setConsoleOutput("Playing Haptics...");
    window.speechSynthesis.cancel(); // Critical: Stop previous speech

    const lines = code.split("\n");
    let accumulatedDelay = 0;

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // 1. Calculate Indentation Depth
      const leadingSpaces = line.search(/\S|$/);
      const indentLevel = Math.floor(leadingSpaces / 4);

      // 2. Schedule Action
      setTimeout(() => {
        // Vibrate (Android Only)
        if (navigator.vibrate) {
            // Level 1 Indent: Short Buzz (50ms)
            if (indentLevel === 1) navigator.vibrate(50);
            // Level 2+ Indent: Double Pulse
            if (indentLevel >= 2) navigator.vibrate([50, 50, 50]);
        }
        
        // Speak
        speakText(cleanLine);
      }, accumulatedDelay);
      
      // Add dynamic delay based on text length
      accumulatedDelay += (cleanLine.length * 80) + 1200; 
    });
  };

  const speakText = (text: string) => { 
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    } 
  };

  return (
    <main className="flex h-screen w-full bg-[#1e1e1e] text-[#cccccc] font-sans overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <div className="w-[300px] flex flex-col border-r border-[#2b2b2b] bg-[#252526]">
        
        {/* Header */}
        <div className="p-4 border-b border-[#2b2b2b] flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <h1 className="text-sm font-bold tracking-wider text-white">HAPTICODE</h1>
        </div>

        {/* Controls Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            {/* 1. Voice Input */}
            <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-[#6b6b6b]">Voice Command</label>
                <div className={`p-3 rounded border text-xs min-h-[60px] font-mono transition-colors ${listening ? 'border-red-500 bg-red-900/10' : 'border-[#3e3e42] bg-[#1e1e1e]'}`}>
                    {transcript || <span className="opacity-30">e.g., "Create a function to add numbers..."</span>}
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => SpeechRecognition.startListening()} 
                        className={`flex-1 p-2 rounded text-xs font-bold flex items-center justify-center gap-2 transition-all ${listening ? 'bg-red-600 text-white' : 'bg-[#333] hover:bg-[#444]'}`}
                    >
                        <Mic size={14} /> {listening ? "Rec" : "Record"}
                    </button>
                    <button 
                        onClick={() => { SpeechRecognition.stopListening(); handleAIRequest("generate", transcript); }} 
                        disabled={isProcessing}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white p-2 rounded text-xs font-bold flex items-center justify-center gap-2"
                    >
                        <StopCircle size={14} /> Process
                    </button>
                </div>
            </div>

            {/* 2. Execution */}
            <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-[#6b6b6b]">Runtime</label>
                 <button 
                    onClick={() => handleAIRequest("execute_code", "")} 
                    disabled={isProcessing}
                    className="w-full bg-green-700 hover:bg-green-600 text-white p-2 rounded flex items-center justify-center gap-2 font-bold text-xs"
                 >
                    <Play size={14} /> Run Code
                 </button>
            </div>

            {/* 3. Accessibility Tools */}
            <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-[#6b6b6b]">Assistive Tools</label>
                <ToolsButton label="Simplify Syntax" icon={<Wand2 size={14} />} onClick={() => handleAIRequest("simplify_code", "")} />
                <ToolsButton label="Read & Vibrate" icon={<Activity size={14} />} onClick={readAndVibrateCode} />
                <ToolsButton label="Explain Error" icon={<Bug size={14} />} onClick={() => handleAIRequest("explain_error", terminalOutput)} />
            </div>
        </div>

        {/* Footer Status */}
        <div className="p-2 bg-[#007acc] text-white text-[10px] flex justify-between items-center">
            <span className="truncate max-w-[150px]">{isProcessing ? "Thinking..." : consoleOutput}</span>
            <span className="flex items-center gap-1"><Volume2 size={10} /> Ready</span>
        </div>
      </div>

      {/* --- EDITOR PANEL --- */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e]">
        <Editor
            height="70vh"
            defaultLanguage="python"
            theme="vs-dark"
            value={code}
            onChange={(val) => setCode(val || "")}
            options={{
                fontSize: 16,
                fontFamily: "'Fira Code', 'Consolas', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 20, bottom: 20 },
                lineNumbers: "on",
                renderWhitespace: "selection"
            }}
        />
        
        {/* Terminal Panel */}
        <div className="h-[30vh] border-t border-[#2b2b2b] bg-[#1e1e1e] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2b2b2b] bg-[#252526] text-[#cccccc] text-xs uppercase tracking-wider">
                <Terminal size={12} /> Console / Output
            </div>
            <div className="flex-1 p-4 font-mono text-sm overflow-auto text-green-400">
                <pre className="whitespace-pre-wrap">{terminalOutput}</pre>
            </div>
        </div>
      </div>
    </main>
  );
}

// Reusable Button
function ToolsButton({ label, icon, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-2 rounded hover:bg-[#37373d] text-[#cccccc] transition-all text-xs text-left group border border-transparent hover:border-[#454545]">
      <div className="text-[#858585] group-hover:text-white">{icon}</div>
      <span className="flex-1">{label}</span>
      <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}