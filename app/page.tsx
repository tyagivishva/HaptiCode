"use client";

import "regenerator-runtime/runtime";
import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Mic, Wand2, Activity, Terminal, ChevronRight, Play, Bug, Volume2, Zap, Code2, ArrowRight, HelpCircle } from "lucide-react";

export default function Home() {
  // --- STATE ---
  const [showLanding, setShowLanding] = useState(true); // <--- NEW: Controls Landing Page vs IDE
  
  const [code, setCode] = useState("# HaptiCode: Speak naturally to code...\n");
  const [consoleOutput, setConsoleOutput] = useState("Ready...");
  const [terminalOutput, setTerminalOutput] = useState(">> Terminal Ready");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Theme & Accessibility
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("menlo");
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isHelpActive, setIsHelpActive] = useState(false);
  const [isHelpPaused, setIsHelpPaused] = useState(false);
  const timeoutIdsRef = React.useRef<NodeJS.Timeout[]>([]);
  const [editorHeight, setEditorHeight] = useState(70); 
  const isDraggingRef = React.useRef(false);
  const [breakpoints, setBreakpoints] = useState<number[]>([]); 
  const editorRef = React.useRef<any>(null);
  const monacoRef = React.useRef<any>(null);
  const silenceTimer = React.useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = React.useRef(false);

  // Hooks
  const { transcript, listening, browserSupportsSpeechRecognition, resetTranscript } = useSpeechRecognition();

  useEffect(() => { setIsClient(true); }, []);

  // --- WELCOME VOICE OVER ---
  useEffect(() => {
    if (isClient && showLanding) {
      // Small delay to ensure speech synthesis is ready
      const timer = setTimeout(() => {
        speakText("Welcome to HaptiCode. Press enter to continue.");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isClient, showLanding]);

  // --- KEYBOARD NAVIGATION ---
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (showLanding && e.key === "Enter") {
        setShowLanding(false);
        SpeechRecognition.startListening({ continuous: true });
      }
      // In IDE, allow Enter or F5 to restart listening
      if (!showLanding && !listening && (e.key === "Enter" || e.key === "F5")) {
        e.preventDefault();
        setConsoleOutput("Listening...");
        SpeechRecognition.startListening({ continuous: true });
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [showLanding, listening]);

  // --- NEW: VOICE COMMAND NAVIGATION (Hands-Free Control) ---
  useEffect(() => {
    // Don't process if already processing
    if (isProcessingRef.current) return;
    
    if (listening && transcript.trim().length > 0) {
      
      const lowerText = transcript.toLowerCase();

      // 1. Check for "Magic Commands" immediately
      if (lowerText.includes("run code") || lowerText.includes("execute code")) {
         SpeechRecognition.stopListening();
         handleAIRequest("execute_code", "");
         resetTranscript();
         return;
      }
      if (lowerText.includes("simplify code") || lowerText.includes("make it simpler")) {
         SpeechRecognition.stopListening();
         handleAIRequest("simplify_code", "");
         resetTranscript();
         return;
      }
      if (lowerText.includes("read code") || lowerText.includes("read it")) {
         SpeechRecognition.stopListening();
         readAndVibrateCode();
         resetTranscript();
         return;
      }
      if (lowerText.includes("stop reading") || lowerText.includes("silence")) {
         SpeechRecognition.stopListening();
         stopReading();
         resetTranscript();
         return;
      }
      if (lowerText.includes("clear") || lowerText.includes("remove") || lowerText.includes("delete all")) {
         SpeechRecognition.stopListening();
         setCode("");
         resetTranscript();
         setConsoleOutput("Code cleared.");
         speakText("Code cleared.");
         return;
      }

      // 2. Normal Coding: Reset silence timer
      if (silenceTimer.current) clearTimeout(silenceTimer.current);

      silenceTimer.current = setTimeout(() => {
        // If silence for 2 seconds AND it wasn't a command, generate code
        if (transcript.trim().length > 0 && !isProcessingRef.current) {
          SpeechRecognition.stopListening();
          handleAIRequest("generate", transcript);
        }
      }, 2000); 
    }

    return () => {
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
    };
  }, [transcript, listening]);

  // --- API HANDLER ---
  const handleAIRequest = async (mode: string, inputData: string) => {
    if (mode === "generate" && (!inputData || inputData.trim() === "")) return;
    
    // Prevent multiple simultaneous requests
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // STOP LISTENING IMMEDIATELY
    SpeechRecognition.stopListening();

    setIsProcessing(true);
    setConsoleOutput(mode === "execute_code" ? "Executing..." : `Processing...`);
    
    if (mode === "execute_code" || mode === "generate") {
      setTerminalOutput(">> Terminal Ready");
    }
    
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text: inputData, code: code, breakpoints: breakpoints }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.result);

      if (mode === "generate" || mode === "simplify_code") {
        if (mode === "generate") setCode(code + "\n" + data.result);
        else setCode(data.result);
        setConsoleOutput("Success.");
      } 
      else if (mode === "explain_error" || mode === "debug") {
         const label = mode === "debug" ? "AI Debug Analysis" : "AI Explanation";
         setConsoleOutput(label + " received.");
         setTerminalOutput(`>> ${label}:\n${data.result}`);
      }
      else if (mode === "execute_code") {
        setTerminalOutput(`>> Output:\n${data.result}`);
        setConsoleOutput("Execution finished.");
      }
    } catch (e: any) { 
      setConsoleOutput("Error."); 
      setTerminalOutput(`>> Error: ${e.message}`);
      speakText("An error occurred.");
    } 
    finally { 
      setIsProcessing(false);
      isProcessingRef.current = false;
      // Reset transcript to prevent retrigger
      if (mode === "generate") resetTranscript();
    }
  };

  // --- HELPERS (Haptics, Breakpoints, Etc.) ---
  // (Keeping these exact same helpers from your previous code)
  const toggleBreakpoint = (lineNumber: number) => {
    if (breakpoints.includes(lineNumber)) {
      setBreakpoints(breakpoints.filter(bp => bp !== lineNumber));
    } else {
      setBreakpoints([...breakpoints, lineNumber].sort((a, b) => a - b));
    }
  };

  const readAndVibrateCode = () => {
    if (isReading) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    } else if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.cancel();
      const lines = code.split("\n");
      let accumulatedDelay = 0;
      timeoutIdsRef.current = [];
      lines.forEach((line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return;
        const indentLevel = Math.floor(line.search(/\S|$/) / 4);
        const timeoutId = setTimeout(() => {
          if (navigator.vibrate) {
            if (indentLevel === 0) navigator.vibrate(30);
            else navigator.vibrate([50, 50]); 
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
  };

  const speakText = (text: string) => { 
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    } 
  };

  const showHelp = () => {
    const helpText = `HaptiCode Help Guide. Here are the main features: 
    
    Voice Commands:
    - Say "run code" or "execute code" to execute your code.
    - Say "debug code" to analyze and debug your code with AI.
    - Say "read code" to have your code read aloud with haptic feedback.
    - Say "simplify code" to simplify your code syntax.
    - Say "clear" or "remove" to delete all your code.
    
    Keyboard Shortcuts:
    - Press Enter or F5 to start listening and recording your voice commands.
    
    UI Buttons:
    - Click the Record button to manually start listening.
    - Click the Play button to run your code immediately.
    - Click the Debug button to analyze your code.
    - Use the Read button in Assistive Tools to hear your code.
    - Use Simplify Syntax to improve code readability.
    - Use Explain Error to get help with errors.
    
    Tips:
    - Speak naturally and pause for 2 seconds to generate code.
    - Use voice commands for hands-free operation.
    - Press Enter or F5 anytime to start listening again.
    - Your code appears in the editor on the right.
    - Output and debug information appear in the console below the editor.`;
    
    setIsHelpActive(true);
    speakText(helpText);
    setConsoleOutput("Help information is being read aloud. Press pause or stop to control playback.");
    setTerminalOutput(`>> Help Guide:\n${helpText}`);
  };

  const pauseHelp = () => {
    window.speechSynthesis.pause();
    setIsHelpPaused(true);
    setConsoleOutput("Help paused.");
  };

  const resumeHelp = () => {
    window.speechSynthesis.resume();
    setIsHelpPaused(false);
    setConsoleOutput("Help resumed.");
  };

  const stopHelp = () => {
    window.speechSynthesis.cancel();
    setIsHelpActive(false);
    setIsHelpPaused(false);
    setConsoleOutput("Help stopped.");
  };

  // --- RENDER ---
  if (!isClient) return null;
  if (!browserSupportsSpeechRecognition) return <div>Browser not supported.</div>;

  // 1. LANDING PAGE VIEW
  if (showLanding) {
    return (
      <main className="h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center text-white p-8 relative overflow-hidden">
        {/* Animated Background Gradient Orbs */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-600/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-purple-600/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>

        <div className="z-10 text-center space-y-8 max-w-3xl">
          {/* Logo */}
          <div className="flex justify-center mb-8 animate-bounce" style={{animationDuration: '3s'}}>
            <div className="p-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-3xl shadow-2xl shadow-blue-500/50 border border-blue-400/50">
              <Code2 size={72} className="text-white" />
            </div>
          </div>
          
          {/* Main Title */}
          <div className="space-y-4">
            <h1 className="text-7xl md:text-8xl font-black tracking-tighter bg-gradient-to-r from-blue-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-lg">
              HaptiCode
            </h1>
            <div className="h-1 w-24 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto rounded-full"></div>
          </div>
          
          {/* Description */}
          <div className="space-y-4">
            <p className="text-lg md:text-xl text-gray-300 leading-relaxed font-light">
              The accessible IDE that lets you
            </p>
            <div className="space-y-3 text-gray-300">
              <div className="flex items-center justify-center gap-3">
                <span className="text-blue-400">🎤</span>
                <span className="text-lg">Code with your <span className="font-semibold text-blue-300">voice</span></span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-purple-400">📳</span>
                <span className="text-lg">Feel logic with <span className="font-semibold text-purple-300">haptics</span></span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-cyan-400">👂</span>
                <span className="text-lg">Debug with your <span className="font-semibold text-cyan-300">ears</span></span>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="pt-6">
            <button 
              onClick={() => {
                setShowLanding(false);
                speakText("Welcome to HaptiCode. I am listening.");
                SpeechRecognition.startListening({ continuous: true });
              }}
              className="group relative inline-flex items-center justify-center px-10 py-4 font-bold text-white text-lg transition-all duration-300 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full hover:from-blue-500 hover:to-purple-500 focus:outline-none ring-offset-2 focus:ring-4 ring-blue-400 shadow-lg shadow-blue-500/50 hover:shadow-blue-500/75 hover:scale-105 active:scale-95"
            >
              <span>Enter Studio</span>
              <ArrowRight className="ml-3 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Keyboard Hint */}
          <p className="text-xs text-gray-500 uppercase tracking-widest pt-4">
            Press <span className="text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded">Enter</span> to start or click the button above
          </p>
          
          {/* Footer */}
          <p className="text-xs text-gray-600 pt-8 uppercase tracking-widest">
            ✨ Hackville 2026 Submission
          </p>
        </div>
      </main>
    );
  }

  // 2. IDE VIEW (Your Existing Nice UI)
  return (
    <main className={`flex h-screen w-full overflow-hidden transition-colors relative ${highContrast ? 'bg-gradient-to-br from-slate-950 via-blue-900 to-slate-950 text-white' : 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-[#cccccc]'}`}>
      {/* Background Gradient Accent */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl"></div>
      </div>
      
      {/* SIDEBAR */}
      <div className={`w-[300px] flex flex-col border-r overflow-hidden relative z-10 ${highContrast ? 'border-blue-500/50 bg-gradient-to-b from-slate-900/90 to-slate-950/90' : 'border-blue-500/30 bg-gradient-to-b from-slate-900/80 to-slate-950/90'}`}>
        <div className={`p-4 border-b flex items-center gap-2 ${highContrast ? 'border-blue-500/50 bg-slate-900/50' : 'border-blue-500/20 bg-slate-900/30'}`}>
          <div className={`w-3 h-3 rounded-full ${highContrast ? 'bg-blue-400' : 'bg-cyan-400'}`}></div>
          <h1 className={`text-sm font-bold tracking-wider bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent`}>HAPTICODE</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-cyan-400/70">Voice Command</label>
                <div className={`p-3 rounded border text-xs min-h-[60px] font-mono transition-colors ${listening ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-blue-500/30 bg-slate-800/40'}`}>
                    {transcript || <span className="opacity-30">Listening... (Say "Run code", "Read code"...)</span>}
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => SpeechRecognition.startListening({ continuous: true })} 
                        className={`flex-1 p-2 rounded text-xs font-bold flex items-center justify-center gap-2 transition-all ${listening ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white animate-pulse' : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white'}`}
                        title="Click or press Enter / F5 to start listening"
                    >
                        <Mic size={14} /> {listening ? "Listening..." : "Record"}
                    </button>
                </div>
                <p className="text-[9px] text-blue-300/60">Tip: Press <span className="font-mono bg-blue-600/30 px-1 rounded">Enter</span> or <span className="font-mono bg-blue-600/30 px-1 rounded">F5</span> to listen again</p>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-cyan-400/70">Assistive Tools</label>
                <ToolsButton label="Simplify Syntax" icon={<Wand2 size={14} />} onClick={() => handleAIRequest("simplify_code", "")} />
                <ToolsButton label="Debug Code" icon={<Zap size={14} />} onClick={() => handleAIRequest("debug", "")} />
                <div className="flex gap-2">
                  <button 
                    onClick={readAndVibrateCode}
                    className="flex-1 flex items-center gap-2 p-2 rounded hover:bg-blue-600/40 text-blue-200 transition-all text-xs text-left group border border-transparent hover:border-blue-500/30"
                  >
                    <div className="text-cyan-400 group-hover:text-cyan-300"><Activity size={14} /></div>
                    <span className="flex-1">{isPaused ? "Resume" : isReading ? "Pause" : "Read"}</span>
                  </button>
                </div>
                <ToolsButton label="Explain Error" icon={<Bug size={14} />} onClick={() => handleAIRequest("explain_error", terminalOutput)} />
                <ToolsButton label="Help" icon={<HelpCircle size={14} />} onClick={showHelp} />
                {isHelpActive && (
                  <div className="flex gap-2">
                    <button 
                      onClick={isHelpPaused ? resumeHelp : pauseHelp}
                      className="flex-1 flex items-center gap-2 p-2 rounded hover:bg-blue-600/40 text-blue-200 transition-all text-xs text-left group border border-transparent hover:border-blue-500/30"
                    >
                      <div className="text-cyan-400 group-hover:text-cyan-300">{isHelpPaused ? '▶' : '⏸'}</div>
                      <span className="flex-1">{isHelpPaused ? 'Resume' : 'Pause'}</span>
                    </button>
                    <button 
                      onClick={stopHelp}
                      className="flex-1 flex items-center gap-2 p-2 rounded hover:bg-red-600/40 text-red-300 transition-all text-xs text-left group border border-transparent hover:border-red-500/30"
                    >
                      <div className="text-red-400 group-hover:text-red-300">⏹</div>
                      <span className="flex-1">Stop</span>
                    </button>
                  </div>
                )}
            </div>
        </div>

        <div className={`p-2 text-[10px] flex justify-between items-center ${highContrast ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' : 'bg-gradient-to-r from-blue-600/80 to-purple-600/80 text-white'}`}>
            <span className="truncate max-w-[150px]">{isProcessing ? "Thinking..." : consoleOutput}</span>
            <span className="flex items-center gap-1"><Volume2 size={10} /> Ready</span>
        </div>
      </div>

      {/* EDITOR */}
      <div className={`flex-1 flex flex-col relative z-10 ${highContrast ? 'bg-slate-950/50' : 'bg-slate-950/50'}`} data-editor-container>
        <div className={`flex items-center justify-between gap-4 px-4 py-3 border-b ${highContrast ? 'bg-slate-900/60 border-blue-500/30' : 'bg-slate-900/40 border-blue-500/20'}`}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setHighContrast(!highContrast)} className={`px-3 py-1 rounded text-xs font-bold transition-all ${highContrast ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500' : 'bg-blue-600/50 text-white hover:bg-blue-500/60'}`}>
                {highContrast ? "High Contrast" : "Normal"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className={`px-2 py-1 rounded text-xs ${highContrast ? 'bg-blue-600/50 text-white hover:bg-blue-500/60' : 'bg-blue-600/30 text-white hover:bg-blue-500/40'}`}>−</button>
              <span className={`w-12 text-center text-xs rounded py-1 ${highContrast ? 'bg-slate-800 text-white border border-blue-500/50' : 'bg-slate-800/50 text-gray-300 border border-blue-500/20'}`}>{fontSize}px</span>
              <button onClick={() => setFontSize(Math.min(24, fontSize + 2))} className={`px-2 py-1 rounded text-xs ${highContrast ? 'bg-blue-600/50 text-white hover:bg-blue-500/60' : 'bg-blue-600/30 text-white hover:bg-blue-500/40'}`}>+</button>
            </div>
          </div>

          {/* Play and Debug Buttons - Top Right */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleAIRequest("execute_code", "")} 
              disabled={isProcessing}
              className={`p-2 rounded flex items-center gap-2 transition-all ${
                highContrast 
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500' 
                  : 'bg-blue-600/50 text-white hover:bg-blue-500/60'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Run Code (Ctrl+Enter)"
            >
              <Play size={16} />
            </button>
            <button 
              onClick={() => handleAIRequest("debug", "")} 
              disabled={isProcessing}
              className={`p-2 rounded flex items-center gap-2 transition-all ${
                highContrast 
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500' 
                  : 'bg-blue-600/50 text-white hover:bg-blue-500/60'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Debug Code"
            >
              <Bug size={16} />
            </button>
          </div>
        </div>
        
        <Editor
            key={`editor-${fontFamily}-${fontSize}`}
            height={`${editorHeight}vh`}
            defaultLanguage="python"
            theme={highContrast ? "vs-light" : "hapticode-dark"}
            value={code}
            onChange={(val) => setCode(val || "")}
            onMount={(editor: any, monaco: any) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
              editor.onMouseDown((e: any) => {
                if (e.target?.type === 2) { 
                  const lineNumber = e.target.position?.lineNumber;
                  if (lineNumber) toggleBreakpoint(lineNumber);
                }
              });
            }}
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('hapticode-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: 'comment', foreground: '6A9955', fontStyle: 'italic' }, 
                  { token: 'string', foreground: 'CE9178' }, 
                  { token: 'keyword', foreground: '569CD6' }, 
                  { token: 'function', foreground: 'DCDCAA' }, 
                ],
                colors: {
                  'editor.background': '#0f172a',
                  'editor.foreground': '#e2e8f0',
                },
              });
            }}
            options={{
                fontSize: fontSize,
                fontFamily: "'Menlo', monospace",
                minimap: { enabled: false },
                automaticLayout: true,
                padding: { top: 20, bottom: 20 },
                lineNumbers: "on",
            }}
        />
        {/* Resizable Divider */}
        <div
          onMouseDown={(e) => { 
            isDraggingRef.current = true;
            const startY = e.clientY;
            const startHeight = editorHeight;
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              if (!isDraggingRef.current) return;
              const delta = moveEvent.clientY - startY;
              const containerHeight = window.innerHeight;
              const newHeight = startHeight + (delta / containerHeight) * 100;
              setEditorHeight(Math.max(30, Math.min(80, newHeight)));
            };
            
            const handleMouseUp = () => {
              isDraggingRef.current = false;
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
          className={`h-1 cursor-row-resize transition-colors ${highContrast ? 'bg-blue-500/50 hover:bg-blue-400' : 'bg-blue-500/30 hover:bg-blue-400/50'}`}
          style={{ userSelect: 'none' }}
          title="Drag to resize editor and console"
        />
        
        {/* Terminal Panel */}
        <div className={`flex flex-col ${highContrast ? 'border-blue-500/30 bg-slate-950/50' : 'border-blue-500/20 bg-slate-950/30'}`} style={{ height: `${100 - editorHeight}vh` }}>
            <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs uppercase tracking-wider ${highContrast ? 'border-blue-500/30 bg-slate-900/60 text-cyan-300' : 'border-blue-500/20 bg-slate-900/40 text-blue-300'}`}>
                <Terminal size={12} /> Console / Output
            </div>
            <div className={`flex-1 p-4 font-mono text-sm overflow-auto ${highContrast ? 'text-cyan-300 bg-slate-950/60' : 'text-cyan-400 bg-slate-950/40'}`}>
                <pre className="whitespace-pre-wrap">{terminalOutput}</pre>
            </div>
        </div>
      </div>
    </main>
  );
}

function ToolsButton({ label, icon, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-2 rounded hover:bg-blue-600/40 text-blue-200 transition-all text-xs text-left group border border-transparent hover:border-blue-500/30">
      <div className="text-cyan-400 group-hover:text-cyan-300">{icon}</div>
      <span className="flex-1">{label}</span>
      <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400" />
    </button>
  );
}