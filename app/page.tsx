"use client";

import "regenerator-runtime/runtime";
import React, { useState, useEffect, JSX } from "react";
import Editor from "@monaco-editor/react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Mic, StopCircle, Wand2, Activity, Terminal, ChevronRight, Play, Bug, Volume2, Zap } from "lucide-react";

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
  const [editorHeight, setEditorHeight] = useState(70); // Percentage
  const isDraggingRef = React.useRef(false);
  const [breakpoints, setBreakpoints] = useState<number[]>([]); // Line numbers with breakpoints
  const editorRef = React.useRef<any>(null);
  const monacoRef = React.useRef<any>(null);

  // Hooks
  const { transcript, listening, browserSupportsSpeechRecognition, resetTranscript } = useSpeechRecognition();

  // Fix hydration issues
  useEffect(() => { setIsClient(true); }, []);

  // Resize handler for editor/terminal divider
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      const container = document.querySelector('[data-editor-container]') as HTMLElement;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const newHeight = ((e.clientY - rect.top) / rect.height) * 100;
      
      // Constrain between 30% and 70%
      if (newHeight >= 30 && newHeight <= 70) {
        setEditorHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    if (isDraggingRef.current) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Update breakpoint decorations
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const decorations = breakpoints.map(lineNum => ({
        range: new monacoRef.current.Range(lineNum, 1, lineNum, 1),
        options: {
          isWholeLine: true,
          className: 'breakpoint-line',
          glyphMarginClassName: 'codicon codicon-debug-breakpoint',
          glyphMarginHoverMessage: { value: `Breakpoint - Click to remove` },
        },
      }));
      editorRef.current.deltaDecorations([], decorations);
    }
  }, [breakpoints]);

  if (!isClient) return null;
  if (!browserSupportsSpeechRecognition) {
    return <div className="h-screen flex items-center justify-center bg-black text-white">Browser not supported. Please use Chrome.</div>;
  }

  // --- API HANDLER ---
  const handleAIRequest = async (mode: string, inputData: string) => {
    setIsProcessing(true);
    setConsoleOutput(mode === "execute_code" ? "Executing..." : `Processing...`);
    
    // Clear previous terminal output for new executions
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
        if (mode === "generate") {
          setCode(code + "\n" + data.result);
        } else {
          setCode(data.result);
        }
        setConsoleOutput("Success.");
      } 
      else if (mode === "explain_error" || mode === "debug") {
         const label = mode === "debug" ? "AI Debug Analysis" : "AI Explanation";
         setConsoleOutput(label + " received.");
         setTerminalOutput(`>> ${label}:\n${data.result}`);
         
         // Auto-speak debug output if there are breakpoints hit
         if (mode === "debug" && data.result.includes("Breakpoint") && breakpoints.length > 0) {
           const breakpointMsg = `Debug breakpoint hit. ${data.result.replace(/\n/g, '. ')}`;
           speakText(breakpointMsg);
         } else if (mode === "debug") {
           speakText(data.result);
         } else {
           speakText(data.result);
         }
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

  // --- BREAKPOINT MANAGER ---
  const toggleBreakpoint = (lineNumber: number) => {
    if (breakpoints.includes(lineNumber)) {
      setBreakpoints(breakpoints.filter(bp => bp !== lineNumber));
      setConsoleOutput(`Breakpoint removed at line ${lineNumber}`);
    } else {
      setBreakpoints([...breakpoints, lineNumber].sort((a, b) => a - b));
      setConsoleOutput(`Breakpoint set at line ${lineNumber}`);
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
          // Enhanced haptic feedback based on indentation
          if (navigator.vibrate) {
            if (indentLevel === 0) {
              // No indent: Single short buzz
              navigator.vibrate(30);
            } else if (indentLevel === 1) {
              // Level 1: Medium buzz
              navigator.vibrate(60);
            } else if (indentLevel === 2) {
              // Level 2: Double pulse
              navigator.vibrate([50, 50, 50]);
            } else if (indentLevel === 3) {
              // Level 3: Triple pulse
              navigator.vibrate([40, 30, 40, 30, 40]);
            } else {
              // Level 4+: Long pattern
              navigator.vibrate([30, 20, 30, 20, 30, 20, 30]);
            }
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
        // Convert special characters to their spoken equivalents
        let spokenText = text
          .replace(/"/g, " quote ")
          .replace(/'/g, " apostrophe ")
          .replace(/`/g, " backtick ")
          .replace(/</g, " less than ")
          .replace(/>/g, " greater than ")
          .replace(/~/g, " tilde ")
          .replace(/\^/g, " caret ")
          .replace(/\$/g, " dollar ")
          .replace(/%/g, " percent ")
          .replace(/&/g, " ampersand ")
          .replace(/\*/g, " asterisk ")
          .replace(/\+/g, " plus ")
          .replace(/=/g, " equals ")
          .replace(/-/g, " dash ")
          .replace(/_/g, " underscore ")
          .replace(/\{/g, " open brace ")
          .replace(/\}/g, " close brace ")
          .replace(/\[/g, " open bracket ")
          .replace(/\]/g, " close bracket ")
          .replace(/\(/g, " open paren ")
          .replace(/\)/g, " close paren ")
          .replace(/\//g, " slash ")
          .replace(/\\/g, " backslash ")
          .replace(/\|/g, " pipe ")
          .replace(/:/g, " colon ")
          .replace(/;/g, " semicolon ")
          .replace(/,/g, " comma ")
          .replace(/\./g, " dot ")
          .replace(/\?/g, " question mark ")
          .replace(/!/g, " exclamation ");
        
        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    } 
  };

  return (
    <main className={`flex h-screen w-full overflow-hidden transition-colors ${highContrast ? 'bg-gray-900 text-white' : 'bg-[#1e1e1e] text-[#cccccc]'}`}>
      
      {/* --- SIDEBAR --- */}
      <div className={`w-[300px] flex flex-col border-r overflow-hidden ${highContrast ? 'border-blue-500 bg-gray-900' : 'border-[#2b2b2b] bg-[#252526]'}`}>
        
        {/* Header */}
        <div className={`p-4 border-b flex items-center gap-2 ${highContrast ? 'border-blue-500 bg-gray-900' : 'border-[#2b2b2b] bg-[#252526]'}`}>
          <div className={`w-3 h-3 rounded-full ${highContrast ? 'bg-blue-400' : 'bg-blue-500'}`}></div>
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
                <ToolsButton label="Debug Code" icon={<Zap size={14} />} onClick={() => handleAIRequest("debug", "")} />
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
        <div className={`p-2 text-[10px] flex justify-between items-center ${highContrast ? 'bg-blue-600 text-white' : 'bg-[#007acc] text-white'}`}>
            <span className="truncate max-w-[150px]">{isProcessing ? "Thinking..." : consoleOutput}</span>
            <span className="flex items-center gap-1"><Volume2 size={10} /> Ready</span>
        </div>
      </div>

      {/* --- EDITOR PANEL --- */}
      <div className={`flex-1 flex flex-col ${highContrast ? 'bg-gray-900' : 'bg-[#1e1e1e]'}`} data-editor-container>
        
        {/* Accessibility Settings Bar */}
        <div className={`flex items-center gap-4 px-4 py-3 border-b ${highContrast ? 'bg-gray-900 border-blue-500' : 'bg-[#252526] border-[#2b2b2b]'}`}>
          <div className="flex items-center gap-2">
            <label className={`text-[10px] font-bold uppercase ${highContrast ? 'text-blue-400' : 'text-[#6b6b6b]'}`}>Theme</label>
            <button 
              onClick={() => setHighContrast(!highContrast)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${highContrast ? 'bg-blue-600 text-white' : 'bg-[#333] text-white hover:bg-[#444]'}`}
            >
              {highContrast ? "High Contrast" : "Normal"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className={`text-[10px] font-bold uppercase ${highContrast ? 'text-blue-400' : 'text-[#6b6b6b]'}`}>Size</label>
            <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className={`px-2 py-1 rounded text-xs ${highContrast ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-[#333] hover:bg-[#444]'}`}>−</button>
            <span className={`w-12 text-center text-xs rounded py-1 ${highContrast ? 'bg-gray-800 text-white border border-blue-500' : 'bg-[#1e1e1e] text-white border border-[#3e3e42]'}`}>{fontSize}px</span>
            <button onClick={() => setFontSize(Math.min(24, fontSize + 2))} className={`px-2 py-1 rounded text-xs ${highContrast ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-[#333] hover:bg-[#444]'}`}>+</button>
          </div>

          <div className="flex items-center gap-2">
            <label className={`text-[10px] font-bold uppercase ${highContrast ? 'text-blue-400' : 'text-[#6b6b6b]'}`}>Font</label>
            <select 
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className={`px-2 py-1 rounded text-xs focus:outline-none ${highContrast ? 'bg-blue-600 text-white' : 'bg-[#333] text-white border border-[#3e3e42]'}`}
            >
              <option value="menlo">Menlo</option>
              <option value="courier">Courier New</option>
            </select>
          </div>
        </div>
        
        <Editor
            key={`editor-${fontFamily}-${fontSize}`}
            height={`${editorHeight}vh`}
            defaultLanguage="python"
            theme={highContrast ? "vs-light" : "vs-dark"}
            value={code}
            onChange={(val) => setCode(val || "")}
            onMount={(editor: any, monaco: any) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
              
              // Add gutter click handler for breakpoints
              editor.onMouseDown((e: any) => {
                if (e.target?.type === 2) { // 2 = gutter/line numbers
                  const lineNumber = e.target.position?.lineNumber;
                  if (lineNumber) {
                    toggleBreakpoint(lineNumber);
                  }
                }
              });
            }}
            beforeMount={(monaco) => {
              // Define custom syntax highlighting theme
              monaco.editor.defineTheme('hapticode-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: 'comment', foreground: '6A9955', fontStyle: 'italic' }, // Green comments
                  { token: 'string', foreground: 'CE9178' }, // Orange strings
                  { token: 'number', foreground: 'B5CEA8' }, // Light green numbers
                  { token: 'keyword', foreground: '569CD6' }, // Blue keywords
                  { token: 'type', foreground: '4EC9B0' }, // Teal types
                  { token: 'function', foreground: 'DCDCAA' }, // Yellow functions
                  { token: 'variable', foreground: '9CDCFE' }, // Light blue variables
                  { token: 'operator', foreground: 'D4D4D4' }, // White operators
                ],
                colors: {
                  'editor.background': '#1e1e1e',
                  'editor.foreground': '#D4D4D4',
                  'editor.lineNumbersBackground': '#1e1e1e',
                  'editor.lineNumbersForeground': '#858585',
                  'editor.selectionBackground': '#264f78',
                  'editorCursor.foreground': '#AEAFAD',
                },
              });
            }}
            options={{
                fontSize: fontSize,
                fontFamily: fontFamily === "menlo" ? "'Menlo', monospace" : "'Courier New', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 20, bottom: 20 },
                lineNumbers: "on",
                renderWhitespace: "selection"
            }}
        />
        
        {/* Resizable Divider */}
        <div
          onMouseDown={() => { isDraggingRef.current = true; }}
          className={`h-1 cursor-row-resize transition-colors ${highContrast ? 'bg-blue-400 hover:bg-blue-300' : 'bg-[#3e3e42] hover:bg-[#569CD6]'}`}
          style={{ userSelect: 'none' }}
          title="Drag to resize editor and console"
        />
        
        {/* Terminal Panel */}
        <div className={`flex flex-col ${highContrast ? 'border-blue-500 bg-gray-900' : 'border-[#2b2b2b] bg-[#1e1e1e]'}`} style={{ height: `${100 - editorHeight}vh` }}>
            <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs uppercase tracking-wider ${highContrast ? 'border-blue-500 bg-gray-900 text-white' : 'border-[#2b2b2b] bg-[#252526] text-[#cccccc]'}`}>
                <Terminal size={12} /> Console / Output
            </div>
            <div className={`flex-1 p-4 font-mono text-sm overflow-auto ${highContrast ? 'text-blue-300 bg-gray-950' : 'text-green-400'}`} style={{ fontSize: `${fontSize * 0.9}px` }}>
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