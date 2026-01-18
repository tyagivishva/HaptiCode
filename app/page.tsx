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

  // Theme & Accessibility Settings
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("menlo");
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutIdsRef = React.useRef<NodeJS.Timeout[]>([]);

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
        if (mode === "generate") {
          setCode(code + "\n" + data.result);
        } else {
          setCode(data.result);
        }
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
    if (isReading) {
      // Pause
      window.speechSynthesis.pause();
      setIsPaused(true);
      setConsoleOutput("Paused.");
    } else if (isPaused) {
      // Resume from pause
      window.speechSynthesis.resume();
      setIsPaused(false);
      setConsoleOutput("Resuming...")
    } else {
      // Start fresh
      window.speechSynthesis.cancel();
      setConsoleOutput("Playing Haptics...");
      const lines = code.split("\n");
      let accumulatedDelay = 0;
      timeoutIdsRef.current = [];

      lines.forEach((line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return;

        const leadingSpaces = line.search(/\S|$/);
        const indentLevel = Math.floor(leadingSpaces / 4);

        const timeoutId = setTimeout(() => {
          if (navigator.vibrate) {
            if (indentLevel === 1) navigator.vibrate(50);
            if (indentLevel >= 2) navigator.vibrate([50, 50, 50]);
          }
          speakText(cleanLine);
        }, accumulatedDelay);
        
        timeoutIdsRef.current.push(timeoutId);
        accumulatedDelay += (cleanLine.length * 80) + 1200; 
      });
      setIsPaused(false);
    }
    setIsReading(true);
  };

  const stopReading = () => {
    window.speechSynthesis.cancel();
    timeoutIdsRef.current.forEach(id => clearTimeout(id));
    timeoutIdsRef.current = [];
    setIsReading(false);
    setIsPaused(false);
    setConsoleOutput("Stopped.");
  };

  const speakText = (text: string) => { 
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    } 
  };

  return (
    <main className={`flex h-screen w-full overflow-hidden transition-colors ${highContrast ? 'bg-slate-900 text-white' : 'bg-[#1e1e1e] text-[#cccccc]'}`}>
      
      {/* --- SIDEBAR --- */}
      <div className={`w-[300px] flex flex-col border-r overflow-hidden ${highContrast ? 'border-cyan-400 bg-slate-900' : 'border-[#2b2b2b] bg-[#252526]'}`}>
        
        {/* Header */}
        <div className={`p-4 border-b flex items-center gap-2 ${highContrast ? 'border-cyan-400 bg-slate-900' : 'border-[#2b2b2b] bg-[#252526]'}`}>
          <div className={`w-3 h-3 rounded-full ${highContrast ? 'bg-cyan-400' : 'bg-blue-500'}`}></div>
          <h1 className={`text-sm font-bold tracking-wider ${highContrast ? 'text-white' : 'text-white'}`}>HAPTICODE</h1>
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
                <div className="flex gap-2">
                  <button 
                    onClick={readAndVibrateCode}
                    className="flex-1 flex items-center gap-2 p-2 rounded hover:bg-[#37373d] text-[#cccccc] transition-all text-xs text-left group border border-transparent hover:border-[#454545]"
                  >
                    <div className="text-[#858585] group-hover:text-white"><Activity size={14} /></div>
                    <span className="flex-1">{isPaused ? "Resume" : isReading ? "Pause" : "Read"}</span>
                  </button>
                  {isReading && (
                    <button 
                      onClick={stopReading}
                      className="flex-1 p-2 rounded hover:bg-[#37373d] text-[#cccccc] transition-all text-xs border border-transparent hover:border-[#454545]"
                    >
                      Stop
                    </button>
                  )}
                </div>
                <ToolsButton label="Explain Error" icon={<Bug size={14} />} onClick={() => handleAIRequest("explain_error", terminalOutput)} />
            </div>
        </div>so 

        {/* Footer Status */}
        <div className={`p-2 text-[10px] flex justify-between items-center ${highContrast ? 'bg-cyan-400 text-slate-900' : 'bg-[#007acc] text-white'}`}>
            <span className="truncate max-w-[150px]">{isProcessing ? "Thinking..." : consoleOutput}</span>
            <span className="flex items-center gap-1"><Volume2 size={10} /> Ready</span>
        </div>
      </div>

      {/* --- EDITOR PANEL --- */}
      <div className={`flex-1 flex flex-col ${highContrast ? 'bg-slate-900' : 'bg-[#1e1e1e]'}`}>
        
        {/* Accessibility Settings Bar */}
        <div className={`flex items-center gap-4 px-4 py-3 border-b ${highContrast ? 'bg-slate-900 border-cyan-400' : 'bg-[#252526] border-[#2b2b2b]'}`}>
          <div className="flex items-center gap-2">
            <label className={`text-[10px] font-bold uppercase ${highContrast ? 'text-cyan-400' : 'text-[#6b6b6b]'}`}>Theme</label>
            <button 
              onClick={() => setHighContrast(!highContrast)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${highContrast ? 'bg-cyan-400 text-slate-900' : 'bg-[#333] text-white hover:bg-[#444]'}`}
            >
              {highContrast ? "High Contrast" : "Normal"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className={`text-[10px] font-bold uppercase ${highContrast ? 'text-cyan-400' : 'text-[#6b6b6b]'}`}>Size</label>
            <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className={`px-2 py-1 rounded text-xs ${highContrast ? 'bg-cyan-400 text-slate-900 hover:bg-cyan-300' : 'bg-[#333] hover:bg-[#444]'}`}>−</button>
            <span className={`w-12 text-center text-xs rounded py-1 ${highContrast ? 'bg-slate-800 text-white border border-cyan-400' : 'bg-[#1e1e1e] text-white border border-[#3e3e42]'}`}>{fontSize}px</span>
            <button onClick={() => setFontSize(Math.min(24, fontSize + 2))} className={`px-2 py-1 rounded text-xs ${highContrast ? 'bg-cyan-400 text-slate-900 hover:bg-cyan-300' : 'bg-[#333] hover:bg-[#444]'}`}>+</button>
          </div>

          <div className="flex items-center gap-2">
            <label className={`text-[10px] font-bold uppercase ${highContrast ? 'text-cyan-400' : 'text-[#6b6b6b]'}`}>Font</label>
            <select 
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className={`px-2 py-1 rounded text-xs focus:outline-none ${highContrast ? 'bg-cyan-400 text-slate-900' : 'bg-[#333] text-white border border-[#3e3e42]'}`}
            >
              <option value="menlo">Menlo</option>
              <option value="courier">Courier New</option>
              <option value="sourcecodepro">Source Code Pro</option>
              <option value="inconsolata">Inconsolata</option>
              <option value="fira">Fira Code</option>
            </select>
          </div>
        </div>
        
        <Editor
            key={`editor-${fontFamily}-${fontSize}`}
            height="70vh"
            defaultLanguage="python"
            theme={highContrast ? "vs-light" : "vs-dark"}
            value={code}
            onChange={(val) => setCode(val || "")}
            options={{
                fontSize: fontSize,
                fontFamily: fontFamily === "menlo" ? "'Menlo', monospace" : 
                           fontFamily === "courier" ? "'Courier New', monospace" :
                           fontFamily === "sourcecodepro" ? "'Source Code Pro', monospace" :
                           fontFamily === "inconsolata" ? "'Inconsolata', monospace" :
                           "'Fira Code', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 20, bottom: 20 },
                lineNumbers: "on",
                renderWhitespace: "selection"
            }}
        />
        
        {/* Terminal Panel */}
        <div className={`h-[30vh] border-t flex flex-col ${highContrast ? 'border-cyan-400 bg-slate-900' : 'border-[#2b2b2b] bg-[#1e1e1e]'}`}>
            <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs uppercase tracking-wider ${highContrast ? 'border-cyan-400 bg-slate-900 text-white' : 'border-[#2b2b2b] bg-[#252526] text-[#cccccc]'}`}>
                <Terminal size={12} /> Console / Output
            </div>
            <div className={`flex-1 p-4 font-mono text-sm overflow-auto ${highContrast ? 'text-cyan-400 bg-slate-950' : 'text-green-400'}`} style={{ fontSize: `${fontSize * 0.9}px` }}>
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