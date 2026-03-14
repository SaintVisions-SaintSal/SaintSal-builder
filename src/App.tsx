import React, { Component, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  MessageCircle, 
  Plus, 
  Layers, 
  Settings, 
  Send, 
  ChevronRight, 
  Smartphone, 
  Monitor, 
  User as UserIcon,
  MoreHorizontal,
  PlusCircle,
  Component as LucideComponent,
  Code,
  Play,
  Terminal,
  Download,
  ShieldCheck,
  LayoutDashboard,
  Network,
  Copy,
  Database,
  CreditCard,
  Eye,
  Folder,
  RefreshCw,
  Github,
  X,
  ChevronDown,
  Link,
  Home,
  Search,
  Mic,
  Sparkles,
  Check,
  Layout,
  Maximize2,
  Minimize2,
  MapPin,
  Image as ImageIcon,
  Video,
  Zap,
  BrainCircuit,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import JSZip from 'jszip';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logOut, 
  onAuthStateChanged, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import type { User } from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp, 
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';

/* ── Error Boundary ────────────────────────────────────────── */
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public props: ErrorBoundaryProps;
  public state: ErrorBoundaryState = { hasError: false, errorInfo: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: '#111', color: '#ff4444', fontFamily: 'monospace', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 10 }}>Something went wrong</h2>
          <pre style={{ background: '#000', padding: 15, borderRadius: 8, maxWidth: '80%', overflow: 'auto', fontSize: 12 }}>{this.state.errorInfo}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '8px 20px', background: '#F59E0B', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Reload Studio</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Stream API (Gemini Implementation) ────────────────────── */
const salStream = async (messages: any[], system: string, onChunk: (text: string) => void, onDone: () => void) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: messages.map(m => {
        const parts: any[] = [{ text: m.content }];
        if (m.attachments && m.attachments.length > 0) {
          m.attachments.forEach((att: any) => {
            parts.push({
              inlineData: {
                mimeType: att.mimeType || "image/png",
                data: att.data.split(",")[1] // Remove data:image/png;base64,
              }
            });
          });
        }
        return { 
          role: m.role === 'assistant' ? 'model' : 'user', 
          parts
        };
      }),
      config: { 
        systemInstruction: system,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) onChunk(text);
    }
    onDone();
  } catch (e: any) {
    onChunk("\n⚠ " + e.message);
    onDone();
  }
};

const generateConcept = async (prompt: string, attachments: any[] = []) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const parts: any[] = [{ text: `A high-fidelity iOS app UI mockup for: ${prompt}. Professional design, clean aesthetic, dark mode, SF Pro typography.` }];
    
    if (attachments && attachments.length > 0) {
      attachments.forEach(att => {
        parts.push({
          inlineData: {
            mimeType: att.mimeType || "image/png",
            data: att.data.split(",")[1]
          }
        });
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts }],
      config: {
        imageConfig: { aspectRatio: "9:16" }
      }
    });
    
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {
    console.error("Image generation failed:", e);
  }
  return null;
};

/* ── Parse code blocks into files ─────────────────────────── */
const parseFiles = (text: string) => {
  const files: Record<string, any> = {};
  
  // Support both Markdown blocks and <file> tags
  const blockRegex = /```(\w+)(?:\s+([^\n]+))?\n([\s\S]*?)(?:```|$)/g;
  const tagRegex = /<file name="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  
  let m;
  while ((m = blockRegex.exec(text)) !== null) {
    const lang = m[1];
    let filename = m[2]?.trim();
    const content = m[3];
    if (!filename) {
      const extMap: Record<string, string> = { jsx:"App.jsx", tsx:"App.tsx", js:"index.js", ts:"index.ts", html:"index.html", css:"styles.css", json:"package.json", md:"README.md" };
      filename = extMap[lang] || `file.${lang}`;
    }
    files[filename] = { name: filename, lang, content };
  }

  while ((m = tagRegex.exec(text)) !== null) {
    const filename = m[1];
    const content = m[2];
    const lang = filename.split(".").pop() || "js";
    files[filename] = { name: filename, lang, content };
  }

  if (!Object.keys(files).length && text.trim()) {
    files["response.md"] = { name: "response.md", lang: "md", content: text };
  }
  return files;
};

/* ── Get icon + color for file type ────────────────────────── */
const fileIcon = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, { icon: string, color: string }> = {
    jsx: { icon: "⚛", color: "#61DAFB" }, tsx: { icon: "⚛", color: "#61DAFB" },
    js: { icon: "JS", color: "#F7DF1E" }, ts: { icon: "TS", color: "#3178C6" },
    html: { icon: "◈", color: "#E34F26" }, css: { icon: "◈", color: "#1572B6" },
    json: { icon: "{}", color: "#F59E0B" }, md: { icon: "✦", color: "#888" },
    sh: { icon: "$", color: "#22C55E" }, bash: { icon: "$", color: "#22C55E" },
    py: { icon: "🐍", color: "#3776AB" }, sql: { icon: "◎", color: "#336791" },
    yaml: { icon: "≡", color: "#CB171E" }, yml: { icon: "≡", color: "#CB171E" },
  };
  return map[ext] || { icon: "◦", color: "#777" };
};

/* ── Build file tree from flat filenames ────────────────────── */
const buildTree = (files: Record<string, any>) => {
  const tree: any = {};
  Object.keys(files).forEach(path => {
    const parts = path.replace(/^\//, "").split("/");
    let node = tree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = { _file: files[path] };
      } else {
        node[part] = node[part] || {};
        node = node[part];
      }
    });
  });
  return tree;
};

/* ── Syntax highlight (lightweight) ────────────────────────── */
const highlight = (code: string, lang: string) => {
  if (!code) return "";
  const esc = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const jsLangs = new Set(["jsx", "tsx", "js", "ts", "javascript", "typescript"]);
  
  let highlighted = esc;
  
  if (jsLangs.has(lang)) {
    highlighted = esc
      .replace(/(\/\/[^\n]*)/g, '<span style="color:#6A9955">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#6A9955">$1</span>')
      .replace(/\b(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|async|await|try|catch|throw|typeof|instanceof|default|null|undefined|true|false|void)\b/g, '<span style="color:#569CD6">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span style="color:#CE9178">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#B5CEA8">$1</span>');
  } else if (lang === "html") {
    highlighted = esc
      .replace(/(&lt;\/?[\w-]+)/g, '<span style="color:#569CD6">$1</span>')
      .replace(/([\w-]+=)("[^"]*")/g, '<span style="color:#9CDCFE">$1</span><span style="color:#CE9178">$2</span>');
  } else if (lang === "css") {
    highlighted = esc
      .replace(/([^{}\n]+)\s*\{/g, '<span style="color:#D7BA7D">$1</span> {')
      .replace(/([\w-]+)\s*:/g, '<span style="color:#9CDCFE">$1</span>:')
      .replace(/:\s*([^;{}]+)/g, ': <span style="color:#CE9178">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#6A9955">$1</span>');
  } else if (lang === "json") {
    highlighted = esc
      .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span style="color:#9CDCFE">$1</span>:')
      .replace(/:\s*("(?:[^"\\]|\\.)*"|true|false|null|\d+\.?\d*)/g, ': <span style="color:#CE9178">$1</span>');
  }

  return highlighted.split("\n").map((line, i) => 
    `<div class="code-line" data-line="${i + 1}">${line || " "}</div>`
  ).join("");
};

/* ── Code Editor Component ─────────────────────────────────── */
const CodeEditor = ({ code, lang, onChange }: { code: string, lang: string, onChange: (val: string) => void }) => {
  const [val, setVal] = useState(code);
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setVal(code);
  }, [code]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setVal(v);
    onChange(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Basic autocompletion/indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newValue = val.substring(0, start) + "  " + val.substring(end);
      setVal(newValue);
      onChange(newValue);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
    
    // Basic bracket completion
    const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]", '"': '"', "'": "'" };
    if (pairs[e.key]) {
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      // Only complete if at end of line or before space
      const nextChar = val[start] || "";
      if (nextChar === "" || /\s|\n|\)|\]|\}/.test(nextChar)) {
        e.preventDefault();
        const newValue = val.substring(0, start) + e.key + pairs[e.key] + val.substring(end);
        setVal(newValue);
        onChange(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
          }
        }, 0);
      }
    }
  };

  return (
    <div style={{ position: "relative", flex: 1, height: "100%", overflow: "hidden", background: "#0A0A0D" }}>
      <textarea
        ref={textareaRef}
        value={val}
        onChange={handleChange}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          padding: "14px 18px 14px 50px",
          fontFamily: "Geist Mono, monospace",
          fontSize: "12.5px",
          lineHeight: "1.7",
          color: "transparent",
          background: "transparent",
          caretColor: "#F59E0B",
          resize: "none",
          border: "none",
          outline: "none",
          whiteSpace: "pre",
          overflow: "auto",
          zIndex: 1,
        }}
      />
      <pre
        ref={preRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          padding: "14px 18px 14px 50px",
          fontFamily: "Geist Mono, monospace",
          fontSize: "12.5px",
          lineHeight: "1.7",
          color: "#C8D3F5",
          background: "#0A0A0D",
          margin: 0,
          pointerEvents: "none",
          whiteSpace: "pre",
          overflow: "hidden",
        }}
        dangerouslySetInnerHTML={{ __html: highlight(val, lang) }}
      />
    </div>
  );
};

/* ── Build preview HTML ─────────────────────────────────────── */
const buildPreviewHTML = (files: Record<string, any>) => {
  const htmlFile = Object.values(files).find(f => f.lang === "html" || f.name === "index.html");
  const cssFiles = Object.values(files).filter(f => f.lang === "css" || f.name.endsWith(".css"));
  const jsFiles = Object.values(files).filter(f => ["js","jsx","ts","tsx"].includes(f.lang) || f.name.endsWith(".js") || f.name.endsWith(".jsx"));

  const cssContent = cssFiles.map(f => f.content).join("\n");
  
  if (htmlFile) {
    let html = htmlFile.content;
    if (cssContent) html = html.replace("</head>", `<style>${cssContent}</style></head>`);
    
    // Simple script injection for the first JS file if not present
    if (jsFiles.length > 0 && !html.includes("<script")) {
      html = html.replace("</body>", `<script>${jsFiles[0].content}</script></body>`);
    }
    return html;
  }

  // React Multi-file Support (Experimental)
  if (jsFiles.length > 0) {
    const mainFile = jsFiles.find(f => f.name.includes("App") || f.name.includes("index")) || jsFiles[0];
    const otherFiles = jsFiles.filter(f => f !== mainFile);
    
    const scripts = otherFiles.map(f => `
      // File: ${f.name}
      (function() {
        const exports = {};
        const module = { exports };
        ${f.content}
        window["${f.name}"] = module.exports;
      })();
    `).join("\n");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://unpkg.com/framer-motion@10.16.4/dist/framer-motion.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #000; color: #fff; margin: 0; font-family: system-ui; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${scripts}
    
    // Main Entry: ${mainFile.name}
    (function() {
      ${mainFile.content}
      const Root = typeof App !== 'undefined' ? App : (typeof default_1 !== 'undefined' ? default_1 : () => <div>Component Ready</div>);
      ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
    })();
  </script>
</body>
</html>`;
  }

  return `<!DOCTYPE html><html><head><style>body{background:#000;color:#F59E0B;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui}</style></head><body><div>Describe your app to start building...</div></body></html>`;
};

/* ── System Prompt for Builder ──────────────────────────────── */
const BUILDER_SYS = `You are SAL (SaintSal AI Labs), a world-class iOS App Engineer specializing in React.
Your goal is to build production-ready, high-fidelity iOS applications using React.
When asked to build an app, you MUST generate a comprehensive structure with multiple screens.

Technical Stack:
- React 19 (Functional components, hooks)
- Tailwind CSS (for styling)
- Lucide React (for icons)
- Framer Motion (for iOS-grade animations)

iOS Aesthetic Guidelines:
- Backgrounds: Use #000 (Pure Black) for OLED-ready dark mode.
- Typography: SF Pro (system-ui) with tight tracking.
- Components: Glassmorphism (backdrop-filter: blur), rounded corners (24px+ for cards, 12px for buttons).
- Interactions: Use Framer Motion for spring-based transitions, haptic-like feedback, and smooth screen entries.

Structure your code into multiple files:
- index.html (entry point, include Tailwind via CDN if needed, but assume standard Vite setup)
- App.jsx (main router/logic using a simple state-based navigation)
- styles.css (global styles, glassmorphism utilities)
- components/*.jsx (reusable UI: Button, Card, Header, TabBar)
- screens/*.jsx (individual app screens: Home, Profile, Chat, Settings, etc.)

Always provide the full code in blocks like:
<file name="screens/HomeView.jsx">
...
</file>

If asked for a "whole build" or "25+ screens", generate a robust App.jsx that handles navigation between at least 5-10 core screens, and provide the code for those screens. Ensure the app feels "dialed in" with premium spacing and animations.
`;

/* ── Render message text ────────────────────────────────────── */
const renderText = (text: string) => {
  const stripped = text.replace(/```[\s\S]*?```/g, (match) => {
    const lines = match.slice(3).split("\n");
    const label = lines[0].trim();
    return `\`📄 ${label || "code"}\``;
  });
  const html = stripped
    .replace(/\*\*(.*?)\*\*/g, "<strong style='color:#E8E6E1'>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code style='font-family:Geist Mono,monospace;font-size:11.5px;background:#0D0D14;color:#C8D3F5;padding:1px 5px;border-radius:4px;border:1px solid #1A1A22'>$1</code>")
    .replace(/^### (.+)$/gm, '<div style="font-size:12.5px;font-weight:700;margin:9px 0 4px;color:#AAA">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-size:14px;font-weight:700;margin:11px 0 5px;color:#D0CEC9">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-size:16px;font-weight:800;margin:13px 0 6px;color:#E8E6E1">$1</div>')
    .replace(/^- (.+)$/gm, '<div style="display:flex;gap:7px;margin:3px 0;padding-left:2px"><span style="color:#F59E0B;margin-top:6px;font-size:7px">●</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="display:flex;gap:8px;margin:3px 0"><span style="color:#F59E0B;font-weight:700;min-width:16px">$1.</span><span>$2</span></div>');
  return <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.78 }} dangerouslySetInnerHTML={{ __html: html }} />;
};

/* ── Chat Message ────────────────────────────────────────────── */
const ChatMsg = ({ msg }: any) => {
  const isUser = msg.role === "user";
  const [cop, setCop] = useState(false);
  return (
    <div className="au" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, padding: "0 4px" }}>
        {!isUser && (
          <div style={{ width: 18, height: 18, borderRadius: 5, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 7, fontWeight: 900, color: "#000" }}>S</span>
          </div>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, color: "#444" }}>{isUser ? "You" : "SAL Builder"}</span>
      </div>
      <div className={`ios-bubble ${isUser ? "ios-bubble-user" : "ios-bubble-assistant"}`} style={{ boxShadow: isUser ? "0 4px 12px rgba(245, 158, 11, 0.2)" : "0 4px 12px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.5 }} className={msg.streaming ? "cursor" : ""}>
          {msg.attachments && msg.attachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {msg.attachments.map((att: any, idx: number) => (
                <img key={idx} src={att.data} alt={att.name} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }} />
              ))}
            </div>
          )}
          {isUser ? <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span> : renderText(msg.content)}
          {msg.streaming && !msg.content && (
            <span style={{ display: "inline-flex", gap: 4 }}>
              {[0,1,2].map(i => <span key={i} className="pulseAnim" style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#F59E0B", animationDelay: `${i * 0.15}s` }} />)}
            </span>
          )}
        </div>
      </div>
      {!isUser && !msg.streaming && msg.content && (
        <button onClick={() => { navigator.clipboard?.writeText(msg.content); setCop(true); setTimeout(() => setCop(false), 1500); }}
          style={{ fontSize: 9, color: "#333", background: "transparent", border: "none", cursor: "pointer", display: "flex", gap: 3, alignItems: "center", marginTop: 2, padding: "0 4px" }}>
          <Copy size={9} color="#333" />{cop ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
};

/* ── File Tree Node ──────────────────────────────────────────── */
const FileNode = ({ name, node, depth = 0, activeFile, onSelect, path = "" }: any) => {
  const [open, setOpen] = useState(true);
  const fullPath = path ? `${path}/${name}` : name;
  const isFile = node._file;
  if (isFile) {
    const fi = fileIcon(name);
    const isActive = activeFile === node._file.name;
    return (
      <button className="file-row" onClick={() => onSelect(node._file)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: `4px 8px 4px ${12 + depth * 14}px`, background: isActive ? "#1C1C26" : "transparent", border: "none", cursor: "pointer", color: isActive ? "#E8E6E1" : "#777", fontSize: 12, textAlign: "left", transition: "all .1s", borderLeft: isActive ? `2px solid ${fi.color}` : "2px solid transparent" }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: fi.color, fontFamily: "Geist Mono, monospace", minWidth: 16, textAlign: "center" }}>{fi.icon}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </button>
    );
  }
  const children = Object.entries(node).filter(([k]) => k !== "_file");
  return (
    <div>
      <button className="file-row" onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 5, padding: `4px 8px 4px ${12 + depth * 14}px`, background: "transparent", border: "none", cursor: "pointer", color: "#555", fontSize: 12, textAlign: "left" }}>
        {open ? <ChevronDown size={10} color="#444" /> : <ChevronRight size={10} color="#444" />}
        <Folder size={12} color="#F59E0B" />
        <span>{name}</span>
      </button>
      {open && children.map(([k, v]) => <FileNode key={k} name={k} node={v} depth={depth + 1} activeFile={activeFile} onSelect={onSelect} path={fullPath} />)}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   BUILDER IDE — main component
══════════════════════════════════════════════════════════════ */
/* ── AI Tools Panel ────────────────────────────────────────── */
const AITools = () => {
  const tools = [
    { id: 'live', name: 'Live Audio', icon: <Mic size={18} />, desc: 'Gemini 2.5 Native Audio conversation', model: 'gemini-2.5-flash-native-audio-preview-09-2025' },
    { id: 'veo', name: 'Veo Video', icon: <Video size={18} />, desc: 'Prompt-based video generation', model: 'veo-3.1-fast-generate-preview' },
    { id: 'search', name: 'Search Grounding', icon: <Search size={18} />, desc: 'Real-time web data integration', model: 'gemini-3-flash-preview' },
    { id: 'maps', name: 'Maps Grounding', icon: <MapPin size={18} />, desc: 'Location and place intelligence', model: 'gemini-2.5-flash' },
    { id: 'image', name: 'Nano Banana Pro', icon: <ImageIcon size={18} />, desc: 'High-fidelity image generation', model: 'gemini-3-pro-image-preview' },
    { id: 'thinking', name: 'Thinking Mode', icon: <BrainCircuit size={18} />, desc: 'Complex reasoning for hard tasks', model: 'gemini-3.1-pro-preview' },
    { id: 'vision', name: 'Image Analysis', icon: <Eye size={18} />, desc: 'Analyze and understand images', model: 'gemini-3.1-pro-preview' },
  ];

  return (
    <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
      {tools.map(tool => (
        <motion.div key={tool.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          style={{ background: "#0D0D10", border: "1px solid #1A1A22", borderRadius: 12, padding: 20, cursor: "pointer", transition: "all 0.2s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#1A1A22", display: "flex", alignItems: "center", justifyContent: "center", color: "#F59E0B" }}>
              {tool.icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#E8E6E1" }}>{tool.name}</div>
              <div style={{ fontSize: 10, color: "#F59E0B", fontWeight: 600 }}>{tool.model}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5, marginBottom: 16 }}>{tool.desc}</div>
          <button style={{ width: "100%", padding: "8px", borderRadius: 6, background: "#1A1A22", color: "#AAA", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            Configure Tool
          </button>
        </motion.div>
      ))}
    </div>
  );
};

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Chat state
  const [msgs, setMsgs] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Sync user profile to Firestore
        setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`));
      }
    });
    return unsub;
  }, []);

  // Load projects from Firestore
  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }
    const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid), orderBy('updatedAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snapshot) => {
      const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(projs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'projects'));
    return unsub;
  }, [user]);

  // WebSocket sync (optional now that we have Firestore, but keeping for real-time chat if needed)
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "chat") {
        const payload = message.payload;
        setMsgs(prev => {
          if (prev.find(m => m.id === payload.id)) return prev;
          return [...prev, {
            role: payload.sender === "user" ? "user" : "assistant",
            content: payload.text,
            timestamp: payload.timestamp,
            id: payload.id
          }];
        });
      }
    };

    return () => socket.close();
  }, []);

  // Editor state
  const [files, setFiles] = useState<Record<string, any>>({});
  const [activeFile, setActiveFile] = useState<any>(null);
  const [rightTab, setRightTab] = useState("simulator"); // preview | code | files | simulator | settings
  const [previewKey, setPreviewKey] = useState(0);
  const [openTabs, setOpenTabs] = useState<any[]>([]); // open file tabs in editor
  const [device, setDevice] = useState("iphone-15"); // iphone-15 | iphone-se | ipad-mini
  const [isAppMode, setIsAppMode] = useState(false); // Toggle between Builder and App view

  // Deploy state
  const [deployStatus, setDeployStatus] = useState("idle"); // idle | deploying | deployed
  const [vercelUrl, setVercelUrl] = useState("");
  const [ghConnected, setGhConnected] = useState(false);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [projects, setProjects] = useState<any[]>([]);
  const [showProjects, setShowProjects] = useState(false);

  // Mobile state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<'chat' | 'ide'>('chat');
  const [showSplash, setShowSplash] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'prep' | 'studio'>('prep');
  const [concepts, setConcepts] = useState<string[]>([]);
  const [isGeneratingConcept, setIsGeneratingConcept] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Smart Keyboard Handling for PWA
  useEffect(() => {
    if (!window.visualViewport) return;
    const handleVisualViewportResize = () => {
      if (containerRef.current) {
        containerRef.current.style.height = `${window.visualViewport!.height}px`;
        window.scrollTo(0, 0);
      }
    };
    window.visualViewport.addEventListener('resize', handleVisualViewportResize);
    return () => window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    const timer = setTimeout(() => setShowSplash(false), 2500);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  const installPWA = () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
    });
  };

  const vibrate = (pattern = [10]) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const startSpeechToText = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      vibrate([30]);
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.start();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments(prev => [...prev, { data: ev.target?.result, name: file.name, mimeType: file.type }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setAttachments(prev => [...prev, { data: ev.target?.result, name: "pasted-image.png", mimeType: "image/png" }]);
          };
          reader.readAsDataURL(blob as Blob);
        }
      }
    }
  };

  // Save project to Firestore
  const saveProject = useCallback(async (name: string, config: any) => {
    if (!user) {
      alert("Please sign in to save your project.");
      return;
    }
    const projectId = projectName === "Untitled Project" ? `proj_${Date.now()}` : projectName.replace(/\s+/g, '-').toLowerCase();
    try {
      await setDoc(doc(db, 'projects', projectId), {
        id: projectId,
        name,
        ownerId: user.uid,
        files: config,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      }, { merge: true });
      setProjectName(name);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `projects/${projectId}`);
    }
  }, [user, projectName]);

  const saveVersion = useCallback(async (projectId: string, files: any, label?: string) => {
    if (!user) return;
    const versionId = `v_${Date.now()}`;
    try {
      await setDoc(doc(db, 'projects', projectId, 'versions', versionId), {
        id: versionId,
        files,
        createdAt: serverTimestamp(),
        label: label || `Auto-save ${new Date().toLocaleTimeString()}`
      });
    } catch (e) {
      console.error("Failed to save version:", e);
    }
  }, [user]);

  const restoreVersion = (version: any) => {
    setFiles(version.files);
    const first = Object.values(version.files)[0];
    setActiveFile(first);
    setOpenTabs(Object.values(version.files).slice(0, 5));
    setPreviewKey(k => k + 1);
    vibrate([30, 10, 30]);
    setBuildLogs(prev => [...prev, `Restored version: ${version.label}`]);
    setBuildStep("Version Restored");
    setTimeout(() => setBuildStep(""), 3000);
  };

  const downloadProject = async () => {
    const zip = new JSZip();
    Object.entries(files).forEach(([path, content]) => {
      zip.file(path, content as string);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "saintsal-project"}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const connectGitHub = async () => {
    const res = await fetch("/api/auth/github");
    const { url } = await res.json();
    window.open(url, "github_auth", "width=600,height=700");
  };

  const pushToGitHub = async () => {
    if (!githubConnected) return connectGitHub();
    setIsPushing(true);
    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoName: projectName.replace(/\s+/g, '-').toLowerCase(),
          files,
          description: "Built with SaintSal™ Studio"
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully pushed to GitHub: ${data.url}`);
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      alert(`Push failed: ${e.message}`);
    } finally {
      setIsPushing(false);
    }
  };

  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === 'GITHUB_AUTH_SUCCESS') {
        setGithubConnected(true);
      }
    };
    window.addEventListener('message', handleMsg);
    
    // Check GitHub status
    fetch("/api/auth/github/status").then(r => r.json()).then(d => setGithubConnected(d.connected));
    
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  useEffect(() => {
    if (!user || !projectName || projectName === "Untitled Project") return;
    const projectId = projectName.replace(/\s+/g, '-').toLowerCase();
    const q = query(collection(db, 'projects', projectId, 'versions'), orderBy('createdAt', 'desc'), limit(20));
    return onSnapshot(q, (snap) => {
      setVersions(snap.docs.map(d => d.data()));
    });
  }, [user, projectName]);

  // Panel width (resizable)
  const [leftWidth, setLeftWidth] = useState(42); // percent
  const resizing = useRef(false);
  
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [showScrollBottom, setShowScrollBottom] = useState(false);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 100;
      setShowScrollBottom(!isAtBottom);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto"
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom(msgs.length > 1);
  }, [msgs, scrollToBottom]);

  // Resizer drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(28, Math.min(60, pct)));
    };
    const onUp = () => { resizing.current = false; document.body.style.cursor = ""; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, []);

  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState("");
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  const send = useCallback(async (text: string) => {
    if ((!text?.trim() && attachments.length === 0) || streaming) return;
    setIsBuilding(true);
    vibrate([20, 10, 20]);
    
    const currentAttachments = [...attachments];
    setAttachments([]);

    if (viewMode === 'prep') {
      setIsGeneratingConcept(true);
      const concept = await generateConcept(text, currentAttachments);
      if (concept) setConcepts(prev => [...prev, concept]);
      setIsGeneratingConcept(false);
    }

    setBuildLogs(["Initializing SaintSal™ Build Engine...", "Connecting to HACP Protocol..."]);
    setBuildStep("Initializing...");
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    
    const uMsg = { role: "user", content: text, attachments: currentAttachments };
    
    // Send to server via WebSocket
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "chat",
        text: text,
        sender: "user",
        attachments: currentAttachments
      }));
    }

    const allMsgs = [...msgs, uMsg];
    setMsgs([...allMsgs, { role: "assistant", content: "Thinking...", streaming: true }]);
    setStreaming(true);
    let fullResp = "";
    let lastParsedCount = 0;

    await salStream(
      allMsgs.map(m => ({ role: m.role, content: m.content, attachments: m.attachments })),
      BUILDER_SYS,
      chunk => {
        if (fullResp === "") {
          // Clear "Thinking..." on first real chunk
          setMsgs(prev => { const c = [...prev]; c[c.length - 1] = { ...c[c.length - 1], content: chunk }; return c; });
        } else {
          setMsgs(prev => { const c = [...prev]; c[c.length - 1] = { ...c[c.length - 1], content: fullResp + chunk }; return c; });
        }
        fullResp += chunk;
        
        // Real-time file parsing - update content of existing files for live typing feel
        const parsed = parseFiles(fullResp);
        setFiles(prev => {
          const updated = { ...prev };
          Object.entries(parsed).forEach(([path, file]) => {
            updated[path] = file;
          });
          return updated;
        });

        const parsedCount = Object.keys(parsed).length;
        if (parsedCount > lastParsedCount) {
          const newFiles = Object.keys(parsed).filter(k => !files[k]);
          newFiles.forEach(f => {
            setBuildLogs(prev => [...prev, `Successfully orchestrated ${f}`]);
          });
          lastParsedCount = parsedCount;
        }

        // Update build step based on content
        if (fullResp.includes("<file") || fullResp.includes("```")) {
          const match = fullResp.match(/<file name="([^"]+)">/g) || fullResp.match(/```\w+\s+([^\n]+)/g);
          if (match) {
            const lastMatch = match[match.length - 1];
            const name = lastMatch.includes("<file") ? lastMatch.match(/"([^"]+)"/)?.[1] : lastMatch.split(" ")[1];
            if (name) setBuildStep(`Building ${name}...`);
          }
        }
      },
      () => {
        setIsBuilding(false);
        setBuildLogs(prev => [...prev, "Build completed successfully.", "App is ready for preview."]);
        setMsgs(prev => { const c = [...prev]; c[c.length - 1] = { ...c[c.length - 1], streaming: false }; return c; });
        
        // Save assistant response to server
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: "chat",
            text: fullResp,
            sender: "assistant"
          }));
        }

        const parsed = parseFiles(fullResp);
        if (Object.keys(parsed).length > 0) {
          setFiles(parsed);
          const first = Object.values(parsed)[0];
          setActiveFile(first);
          setOpenTabs(Object.values(parsed).slice(0, 5));
          setPreviewKey(k => k + 1);
          setRightTab("simulator");
          
          // Auto-save project
          const name = text.slice(0, 30) + (text.length > 30 ? "..." : "");
          setProjectName(name);
          const projectId = name.replace(/\s+/g, '-').toLowerCase();
          saveProject(name, parsed);
          saveVersion(projectId, parsed);
        }
        setStreaming(false);
      }
    );
  }, [msgs, streaming, files, attachments, viewMode, saveVersion, saveProject]);

  const openFile = (file: any) => {
    setActiveFile(file);
    setOpenTabs(prev => prev.find(f => f.name === file.name) ? prev : [...prev.slice(0, 7), file]);
    setRightTab("code");
  };

  const closeTab = (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(f => f.name !== fileName);
    setOpenTabs(newTabs);
    if (activeFile?.name === fileName) setActiveFile(newTabs[newTabs.length - 1] || null);
  };

  const previewHTML = useMemo(() => buildPreviewHTML(files), [files, previewKey]);

  const fileList = Object.values(files);
  const hasFiles = fileList.length > 0;

  const STARTERS = [
    "Build a comprehensive iOS application with 25+ screens including Home, Profile, Settings, Chat, Feed, Search, Notifications, and more. Use a clean, modern iOS aesthetic with glassmorphism and SF Pro typography.",
    "Create a premium e-commerce iOS app with product listings, detailed views, a shopping cart, and a checkout flow.",
    "Design a fintech app with interactive charts, transaction history, and wallet management.",
    "Build a wellness app with audio player, session tracking, and a serene UI.",
  ];

  const handlePublish = async () => {
    setIsPublishing(true);
    await new Promise(r => setTimeout(r, 2000));
    await saveProject(projectName, files);
    setIsPublishing(false);
    alert("Project published to SaintSal™ Cloud!");
  };

  return (
    <div ref={containerRef} style={{ 
      display: "flex", 
      height: "100vh", 
      background: "#000", 
      overflow: "hidden", 
      color: "#E8E6E1", 
      fontFamily: "Geist, sans-serif",
      flexDirection: isMobile ? "column" : "row",
      position: "relative"
    }}>
      <AnimatePresence>
        {showSplash && (
          <motion.div 
            key="splash"
            initial={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            style={{ 
              position: "fixed", 
              inset: 0, 
              background: "#000", 
              zIndex: 9999, 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              justifyContent: "center" 
            }}
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}
            >
              <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 20px 40px rgba(245,158,11,0.2)" }}>
                <Sparkles size={40} color="#000" />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em", color: "#E8E6E1" }}>SaintSal™ <span style={{ color: "#F59E0B" }}>Studio</span></div>
                <div style={{ fontSize: 12, color: "#444", marginTop: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>AI-Powered iOS Builder</div>
              </div>
            </motion.div>
            <div style={{ position: "absolute", bottom: 40, width: 120, height: 2, background: "#111", borderRadius: 1, overflow: "hidden" }}>
              <motion.div 
                initial={{ x: "-100%" }} 
                animate={{ x: "100%" }} 
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} 
                style={{ width: "100%", height: "100%", background: "#F59E0B" }} 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {viewMode === 'prep' ? (
        <PrepView 
          msgs={msgs} 
          input={input} 
          setInput={setInput} 
          send={send} 
          streaming={streaming} 
          concepts={concepts} 
          isGeneratingConcept={isGeneratingConcept} 
          onStartBuild={() => setViewMode('studio')}
          user={user}
          signInWithGoogle={signInWithGoogle}
          logOut={logOut}
          isMobile={isMobile}
          attachments={attachments}
          setAttachments={setAttachments}
          handleFileSelect={handleFileSelect}
          handlePaste={handlePaste}
          startSpeechToText={startSpeechToText}
          isListening={isListening}
        />
      ) : isAppMode ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#000" }}>
          <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid #111", zIndex: 100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: "#000" }}>S</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{projectName}</span>
            </div>
            <button onClick={() => setIsAppMode(false)} style={{ background: "#F59E0B", color: "#000", border: "none", padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Back to Builder
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <iframe key={previewKey} srcDoc={previewHTML} sandbox="allow-scripts allow-same-origin"
              style={{ width: "100%", height: "100%", border: "none", background: "#fff" }} title="App View" />
          </div>
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════════
              LEFT PANEL — SAL Chat
          ══════════════════════════════════════ */}
          <div style={{ 
            width: isMobile ? "100%" : `${leftWidth}%`, 
            display: isMobile && mobileTab !== 'chat' ? "none" : "flex", 
            flexDirection: "column", 
            borderRight: isMobile ? "none" : "1px solid #141420", 
            background: "#0A0A0D",
            height: isMobile ? "calc(100vh - 56px)" : "100%"
          }}>
            {/* History Panel */}
            <AnimatePresence>
              {showHistory && (
            <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              style={{ position: "absolute", top: 56, left: 0, bottom: 0, width: 300, background: "#08080A", borderRight: "1px solid #141420", zIndex: 100, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: 20, borderBottom: "1px solid #141420", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <RefreshCw size={16} color="#F59E0B" />
                  <span style={{ fontWeight: 800, fontSize: 14 }}>Version History</span>
                </div>
                <button onClick={() => setShowHistory(false)} style={{ background: "transparent", border: "none", cursor: "pointer" }}><X size={16} color="#444" /></button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
                {versions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#444", fontSize: 12 }}>No versions yet. Build to save snapshots.</div>
                ) : (
                  versions.map((v, i) => (
                    <div key={v.id} onClick={() => restoreVersion(v)}
                      style={{ padding: 12, borderRadius: 8, background: "#111", border: "1px solid #1A1A22", marginBottom: 8, cursor: "pointer", transition: "all 0.2s" }}
                      className="hover-scale">
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        {v.label.includes("Manual") ? <Save size={10} color="#F59E0B" /> : <RefreshCw size={10} color="#555" />}
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#E8E6E1" }}>{v.label}</div>
                      </div>
                      <div style={{ fontSize: 10, color: "#555" }}>{v.createdAt?.toDate ? v.createdAt.toDate().toLocaleString() : "Just now"}</div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && (
            <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              style={{ position: "absolute", top: 56, left: 0, bottom: 0, width: 300, background: "#08080A", borderRight: "1px solid #141420", zIndex: 100, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: 20, borderBottom: "1px solid #141420", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Settings size={16} color="#F59E0B" />
                  <span style={{ fontWeight: 800, fontSize: 14 }}>Project Settings</span>
                </div>
                <button onClick={() => setShowSettings(false)} style={{ background: "transparent", border: "none", cursor: "pointer" }}><X size={16} color="#444" /></button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>
                {/* GitHub Section */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Deployment</div>
                  <div style={{ background: "#111", borderRadius: 12, border: "1px solid #1A1A22", padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                      <Github size={20} color={githubConnected ? "#F59E0B" : "#444"} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>GitHub</div>
                        <div style={{ fontSize: 11, color: "#555" }}>{githubConnected ? "Connected" : "Not connected"}</div>
                      </div>
                    </div>
                    {!githubConnected ? (
                      <button onClick={connectGitHub} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#1A1A22", color: "#E8E6E1", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Connect GitHub</button>
                    ) : (
                      <button onClick={pushToGitHub} disabled={isPushing}
                        style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#F59E0B", color: "#000", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        {isPushing ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                        Push to GitHub
                      </button>
                    )}
                  </div>
                </div>

                {/* Export Section */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Export</div>
                  <button onClick={downloadProject}
                    style={{ width: "100%", padding: "12px", borderRadius: 12, background: "#111", border: "1px solid #1A1A22", color: "#E8E6E1", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                    <Download size={18} color="#F59E0B" />
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Download ZIP</div>
                      <div style={{ fontSize: 11, color: "#555" }}>Full project source code</div>
                    </div>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

            {/* Header */}
            <div style={{ 
              height: 56, 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              padding: isMobile ? "0 12px" : "0 20px", 
              borderBottom: "1px solid #141420", 
              flexShrink: 0, 
              background: "#08080A", 
              zIndex: 50 
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Sparkles size={16} color="#000" />
                  </div>
                  {!isMobile && <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em", color: "#E8E6E1" }}>SaintSal™ <span style={{ color: "#F59E0B" }}>Studio</span></span>}
                </div>
                {!isMobile && <div style={{ height: 20, width: 1, background: "#1A1A22" }}></div>}
                <button onClick={() => setShowProjects(!showProjects)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <Folder size={14} color="#555" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#AAA", maxWidth: isMobile ? 80 : 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projectName}</span>
                  <ChevronDown size={12} color="#333" />
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 12 }}>
                <button onClick={() => setShowHistory(!showHistory)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: showHistory ? "#F59E0B" : "#555" }}>
                  <RefreshCw size={16} />
                  {!isMobile && <span style={{ fontSize: 12, fontWeight: 600 }}>History</span>}
                </button>
                <button onClick={() => setShowSettings(!showSettings)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: showSettings ? "#F59E0B" : "#555" }}>
                  <Settings size={16} />
                  {!isMobile && <span style={{ fontSize: 12, fontWeight: 600 }}>Project</span>}
                </button>
                {isMobile && (
                  <div style={{ display: "flex", background: "#111", borderRadius: 8, padding: 2, marginRight: 4 }}>
                    <button onClick={() => setMobileTab('chat')} style={{ padding: "4px 10px", borderRadius: 6, background: mobileTab === 'chat' ? "#1A1A22" : "transparent", color: mobileTab === 'chat' ? "#F59E0B" : "#555", border: "none", fontSize: 10, fontWeight: 700 }}>CHAT</button>
                    <button onClick={() => setMobileTab('ide')} style={{ padding: "4px 10px", borderRadius: 6, background: mobileTab === 'ide' ? "#1A1A22" : "transparent", color: mobileTab === 'ide' ? "#F59E0B" : "#555", border: "none", fontSize: 10, fontWeight: 700 }}>IDE</button>
                  </div>
                )}
                {user ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img src={user.photoURL || ""} alt={user.displayName || ""} style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid #1A1A22" }} />
                    {!isMobile && <button onClick={logOut} style={{ background: "transparent", border: "none", color: "#555", fontSize: 11, cursor: "pointer" }}>Sign Out</button>}
                  </div>
                ) : (
                  <button onClick={signInWithGoogle} style={{ background: "#1A1A22", color: "#AAA", border: "none", padding: "6px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                    Sign In
                  </button>
                )}
                {!isMobile && (
                  <>
                    <button onClick={() => setIsAppMode(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "#1A1A22", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                      <Play size={14} fill="currentColor" />
                      Run App
                    </button>
                    <button onClick={handlePublish} disabled={isPublishing} style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#000", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: isPublishing ? 0.7 : 1 }}>
                      {isPublishing ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Publish
                    </button>
                  </>
                )}
                <button onClick={() => { setMsgs([]); setFiles({}); setActiveFile(null); setOpenTabs([]); setDeployStatus("idle"); setProjectName("Untitled Project"); }} style={{ width: 32, height: 32, borderRadius: 8, background: "#1A1A22", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <Plus size={16} color="#AAA" />
                </button>
              </div>

          {/* Projects Dropdown */}
          <AnimatePresence>
            {showProjects && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                style={{ position: "absolute", top: 48, left: 14, width: 240, background: "#0D0D10", border: "1px solid #1A1A22", borderRadius: 10, zHeight: 100, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", padding: 6, zIndex: 1000 }}>
                <div style={{ fontSize: 10, color: "#333", fontWeight: 700, padding: "6px 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Recent Projects</div>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {projects.length === 0 ? (
                    <div style={{ padding: "10px", fontSize: 11, color: "#444", textAlign: "center" }}>No projects yet</div>
                  ) : (
                    projects.map(p => (
                      <button key={p.id} onClick={() => {
                        const config = JSON.parse(p.config);
                        setFiles(config);
                        setProjectName(p.name);
                        setShowProjects(false);
                        const first = Object.values(config)[0];
                        setActiveFile(first);
                        setOpenTabs(Object.values(config).slice(0, 5));
                        setRightTab("preview");
                      }} style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#1A1A22"; e.currentTarget.style.color = "#E8E6E1"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#888"; }}>
                        <Folder size={12} color="#F59E0B" />
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat area */}
        <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0", position: "relative" }}>
          {isBuilding && (
            <div style={{ position: "sticky", top: 0, left: 0, right: 0, zIndex: 10, padding: "8px 0" }}>
              <div style={{ background: "#0D0D10", border: "1px solid #1A1A22", borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                <div className="spinn" style={{ width: 14, height: 14, border: "2px solid #F59E0B22", borderTopColor: "#F59E0B", borderRadius: "50%" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#E8E6E1" }}>{buildStep}</div>
                  <div style={{ width: "100%", height: 2, background: "#111", borderRadius: 1, marginTop: 4, overflow: "hidden" }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 15 }} style={{ height: "100%", background: "#F59E0B" }} />
                  </div>
                </div>
                <div style={{ fontSize: 9, color: "#444", fontFamily: "Geist Mono" }}>ORCHESTRATING...</div>
              </div>
            </div>
          )}
          {msgs.length === 0 && (
            <div className="au">
              <div style={{ textAlign: "center", padding: "24px 0 20px" }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#F59E0B22,#D9770622)", border: "1px solid #F59E0B22", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <Code size={22} color="#F59E0B" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 5 }}>SAL Builder</div>
                <div style={{ fontSize: 12.5, color: "#555", marginBottom: 20, lineHeight: 1.6 }}>Describe what you need.<br />Get complete, deployable code instantly.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {STARTERS.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #1A1A22", background: "#0D0D10", color: "#666", fontSize: 12, cursor: "pointer", textAlign: "left", transition: "all .15s", lineHeight: 1.5, fontFamily: "Geist, sans-serif" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#F59E0B33"; e.currentTarget.style.background = "#F59E0B08"; e.currentTarget.style.color = "#C8A060"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#1A1A22"; e.currentTarget.style.background = "#0D0D10"; e.currentTarget.style.color = "#666"; }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => <ChatMsg key={i} msg={m} />)}
          <div style={{ height: 100 }} />
          <AnimatePresence>
            {showScrollBottom && (
              <motion.button 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={() => scrollToBottom()}
                style={{ 
                  position: "absolute", 
                  bottom: 120, 
                  left: "50%", 
                  transform: "translateX(-50%)", 
                  background: "#1A1A22", 
                  color: "#F59E0B", 
                  border: "1px solid #F59E0B44", 
                  borderRadius: 20, 
                  padding: "6px 12px", 
                  fontSize: 10, 
                  fontWeight: 800, 
                  cursor: "pointer", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 6,
                  zIndex: 20,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
                }}>
                <ChevronDown size={12} /> NEW MESSAGES
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div style={{ 
          padding: isMobile ? "8px 10px 10px" : "10px 12px 12px", 
          borderTop: "1px solid #141420", 
          flexShrink: 0, 
          position: "relative",
          background: "#0A0A0D"
        }}>
          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 4px 8px" }}>
              {attachments.map((att, i) => (
                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                  <img src={att.data} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", border: "1px solid #F59E0B44" }} />
                  <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#F59E0B", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={10} color="#000" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ios-input-container" style={{ 
            borderRadius: 24, 
            padding: isMobile ? "2px 2px 2px 12px" : "4px 4px 4px 16px", 
            display: "flex", 
            alignItems: "flex-end", 
            gap: 8 
          }}>
            <button onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.accept = 'image/*';
              input.onchange = (e: any) => handleFileSelect(e);
              input.click();
            }} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "10px 0", color: "#555" }}>
              <PlusCircle size={20} />
            </button>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              onInput={(e: any) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px"; }}
              placeholder="Message SAL Builder..."
              rows={1} style={{ flex: 1, background: "transparent", border: "none", color: "#E8E6E1", fontSize: 14, outline: "none", resize: "none", padding: "10px 0", lineHeight: 1.4, maxHeight: 110, overflowY: "auto", fontFamily: "Geist, sans-serif" }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <button onClick={startSpeechToText} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: isListening ? "#F59E0B22" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Mic size={14} color={isListening ? "#F59E0B" : "#666"} className={isListening ? "pulseAnim" : ""} />
              </button>
              <button onClick={() => send(input)} disabled={streaming || (!input.trim() && attachments.length === 0)}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: (input.trim() || attachments.length > 0) && !streaming ? "#F59E0B" : "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", cursor: (input.trim() || attachments.length > 0) ? "pointer" : "not-allowed", transition: "all .2s" }}>
                {streaming ? <div className="spinn" style={{ width: 14, height: 14, border: "2px solid #00000033", borderTopColor: "#000", borderRadius: "50%" }} /> : <Send size={14} color={(input.trim() || attachments.length > 0) ? "#000" : "#333"} />}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 9, color: "#222", textAlign: "center", marginTop: 8, letterSpacing: "0.02em" }}>SaintSal™ Builder · HACP Protocol · Patent #10,290,222</div>
        </div>
      </div>

      {/* ── Resizer ── */}
      {!isMobile && (
        <div className="resizer" onMouseDown={() => { resizing.current = true; document.body.style.cursor = "col-resize"; }}
          style={{ width: 3, background: "#141420", cursor: "col-resize", flexShrink: 0, transition: "background .15s" }}
          onMouseEnter={e => e.currentTarget.style.background = "#F59E0B44"}
          onMouseLeave={e => e.currentTarget.style.background = "#141420"} />
      )}

      {/* ══════════════════════════════════════
          RIGHT PANEL — Preview / Code / Files
      ══════════════════════════════════════ */}
      <div style={{ 
        flex: 1, 
        display: isMobile && mobileTab !== 'ide' ? "none" : "flex", 
        flexDirection: "column", 
        background: "#0C0C0F", 
        minWidth: 0,
        height: isMobile ? "calc(100vh - 56px)" : "100%"
      }}>

        {/* Top bar */}
        <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", borderBottom: "1px solid #141420", background: "#090910", flexShrink: 0, gap: 8 }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 1, background: "#0E0E14", borderRadius: 8, padding: "2px", border: "1px solid #181820" }}>
            {[
              ["preview", "Preview", Eye], 
              ["code", "Code", Code], 
              ["files", "Files", Folder],
              ["simulator", "Simulator", Smartphone],
              ["tools", "AI Tools", Zap],
              ["settings", "Settings", Settings]
            ].map(([id, label, Icon]: any) => (
              <button key={id} onClick={() => setRightTab(id)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 6, background: rightTab === id ? "#1C1C26" : "transparent", color: rightTab === id ? "#E8E6E1" : "#555", fontSize: 12, fontWeight: rightTab === id ? 600 : 400, border: "none", cursor: "pointer", transition: "all .12s" }}>
                <Icon size={11} color={rightTab === id ? "#F59E0B" : "#555"} />{label}
              </button>
            ))}
          </div>

          {/* URL bar (preview mode) */}
          {rightTab === "preview" && hasFiles && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, background: "#111118", border: "1px solid #1E1E28", borderRadius: 7, padding: "4px 10px", maxWidth: 320 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: deployStatus === "deployed" ? "#22C55E" : "#F59E0B", flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 11, color: "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {vercelUrl || "localhost:3000 · preview"}
              </span>
              <button onClick={() => setPreviewKey(k => k + 1)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#444" }}>
                <RefreshCw size={11} />
              </button>
            </div>
          )}

          {/* Deploy buttons */}
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button onClick={() => setGhConnected(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 7, border: `1px solid ${ghConnected ? "#22C55E44" : "#1E1E28"}`, background: ghConnected ? "#22C55E12" : "#0E0E14", color: ghConnected ? "#22C55E" : "#666", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "Geist, sans-serif", transition: "all .15s" }}>
              <Github size={12} color={ghConnected ? "#22C55E" : "#666"} />
              {ghConnected ? "Connected" : "GitHub"}
            </button>
            <button onClick={() => {
              if (!hasFiles) return;
              setDeployStatus("deploying");
              setTimeout(() => {
                setDeployStatus("deployed");
                setVercelUrl("saintsallabs-build.vercel.app");
              }, 2200);
            }} disabled={deployStatus === "deploying"}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: "none", background: deployStatus === "deployed" ? "#22C55E" : deployStatus === "deploying" ? "#1E1E28" : "#fff", color: deployStatus === "deployed" ? "#000" : deployStatus === "deploying" ? "#666" : "#000", fontSize: 12, fontWeight: 700, cursor: hasFiles ? "pointer" : "not-allowed", fontFamily: "Geist, sans-serif", transition: "all .2s" }}>
              {deployStatus === "deploying"
                ? <><div className="spinn" style={{ width: 11, height: 11, border: "2px solid #33333333", borderTopColor: "#888", borderRadius: "50%" }} />Deploying...</>
                : deployStatus === "deployed"
                  ? <><Check size={12} color="#000" />Deployed ↗</>
                  : <><Smartphone size={12} color="#000" />Deploy to Vercel</>}
            </button>
          </div>
        </div>

        {/* ── File Tabs (code mode) ── */}
        {rightTab === "code" && openTabs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", background: "#090910", borderBottom: "1px solid #141420", overflowX: "auto", flexShrink: 0 }}>
            {openTabs.map(f => {
              const fi = fileIcon(f.name);
              const isActive = activeFile?.name === f.name;
              return (
                <div key={f.name} onClick={() => { setActiveFile(f); setRightTab("code"); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: isActive ? "#0C0C0F" : "transparent", borderRight: "1px solid #141420", cursor: "pointer", flexShrink: 0, borderBottom: isActive ? `2px solid ${fi.color}` : "2px solid transparent" }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: fi.color, fontFamily: "Geist Mono, monospace" }}>{fi.icon}</span>
                  <span style={{ fontSize: 12, color: isActive ? "#E8E6E1" : "#666" }}>{f.name.split("/").pop()}</span>
                  <button onClick={(e) => closeTab(f.name, e)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#3A3A44", display: "flex", alignItems: "center", marginLeft: 2, padding: 1 }}>
                    <X size={9} color="#444" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Content area ── */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

          {/* PREVIEW */}
          {rightTab === "preview" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {hasFiles ? (
                <iframe key={previewKey} srcDoc={previewHTML} sandbox="allow-scripts allow-same-origin"
                  style={{ flex: 1, border: "none", background: "#fff" }} title="SAL Builder Preview" />
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#333" }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, background: "#111116", border: "1px solid #1C1C24", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    <Eye size={24} color="#2A2A34" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#3A3A44", marginBottom: 7 }}>No preview yet</div>
                  <div style={{ fontSize: 12.5, color: "#2A2A34", maxWidth: 260, textAlign: "center", lineHeight: 1.6 }}>Ask SAL Builder to create something and the live preview will appear here</div>
                </div>
              )}
            </div>
          )}

          {/* SIMULATOR */}
          {rightTab === "simulator" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#09090D", overflow: "hidden" }}>
              {/* Simulator Toolbar */}
              <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid #141420", background: "#0A0A0F" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {["iphone-15", "iphone-se", "ipad-mini"].map(d => (
                    <button key={d} onClick={() => setDevice(d)}
                      style={{ background: "transparent", border: "none", color: device === d ? "#F59E0B" : "#444", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: device === d ? "2px solid #F59E0B" : "2px solid transparent", padding: "14px 0" }}>
                      {d.replace("-", " ")}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setPreviewKey(k => k + 1)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                    <RefreshCw size={14} color="#444" />
                  </button>
                  <button onClick={() => setIsAppMode(true)} style={{ background: "#F59E0B", color: "#000", border: "none", padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Full Screen
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Screens Sidebar */}
                <div style={{ width: 160, background: "#0A0A0F", borderRight: "1px solid #141420", display: "flex", flexDirection: "column", flexShrink: 0 }}>
                  <div style={{ padding: "12px 14px", fontSize: 10, fontWeight: 800, color: "#333", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #141420" }}>Screens</div>
                  <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
                    {fileList.filter((f: any) => f.name.startsWith("screens/")).length > 0 ? (
                      fileList.filter((f: any) => f.name.startsWith("screens/")).map((f: any) => (
                        <button key={f.name} onClick={() => openFile(f)}
                          style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, background: activeFile?.name === f.name ? "#1C1C26" : "transparent", border: "none", cursor: "pointer", color: activeFile?.name === f.name ? "#F59E0B" : "#555", fontSize: 11.5, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                          <Layout size={11} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name.split("/").pop().replace(".jsx", "")}</span>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: 10, fontSize: 10, color: "#222", textAlign: "center" }}>No screens detected</div>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto", background: "#08080A", position: "relative" }}>
                  {/* Build Log Overlay */}
                  {isBuilding && (
                    <div style={{ position: "absolute", top: 20, left: 20, right: 20, bottom: 20, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)", zIndex: 100, borderRadius: 20, border: "1px solid #1A1A22", display: "flex", flexDirection: "column", padding: 30 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                        <div className="pulse" style={{ width: 12, height: 12, borderRadius: "50%", background: "#F59E0B" }}></div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#E8E6E1" }}>{buildStep}</div>
                      </div>
                      <div style={{ flex: 1, overflowY: "auto", fontFamily: "Geist Mono, monospace", fontSize: 12, color: "#555", display: "flex", flexDirection: "column", gap: 8 }}>
                        {buildLogs.map((log, i) => (
                          <div key={i} style={{ display: "flex", gap: 12 }}>
                            <span style={{ color: "#222" }}>[{new Date().toLocaleTimeString()}]</span>
                            <span style={{ color: log.includes("Successfully") ? "#22C55E" : "#555" }}>{log}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={`iphone-frame amber-glow device-${device}`} style={{ 
                    width: device === "iphone-15" ? 320 : device === "iphone-se" ? 280 : 500,
                    height: device === "iphone-15" ? 650 : device === "iphone-se" ? 580 : 700,
                    borderRadius: device === "iphone-se" ? 30 : 40,
                    flexShrink: 0
                  }}>
                    {device !== "iphone-se" && <div className="iphone-notch"></div>}
                    {hasFiles ? (
                      <iframe key={previewKey} srcDoc={previewHTML} sandbox="allow-scripts allow-same-origin"
                        style={{ width: "100%", height: "100%", border: "none", background: "#fff" }} title="SAL iOS Simulator" />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#000", color: "#333", padding: 40 }}>
                        <Smartphone size={48} color="#1A1A22" />
                        <div style={{ marginTop: 20, fontSize: 14, fontWeight: 700, color: "#444" }}>Simulator Offline</div>
                        <div style={{ marginTop: 8, fontSize: 11, color: "#222", textAlign: "center" }}>Build an app to see it in the simulator</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI TOOLS */}
          {rightTab === "tools" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ padding: "20px 24px 0" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#E8E6E1", marginBottom: 4 }}>SaintSal™ AI Suite</div>
                <div style={{ fontSize: 13, color: "#555" }}>Integrate world-class intelligence directly into your HACP builds.</div>
              </div>
              <AITools />
            </div>
          )}

          {/* SETTINGS */}
          {rightTab === "settings" && (
            <div style={{ flex: 1, padding: 30, overflowY: "auto", background: "#08080A" }}>
              <div style={{ maxWidth: 700, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Settings size={24} color="#000" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: "#E8E6E1" }}>Studio Settings</h2>
                    <p style={{ fontSize: 13, color: "#555" }}>Configure your SaintSal™ Studio environment and deployment targets.</p>
                  </div>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                  {/* AI Section */}
                  <section>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <Sparkles size={16} color="#F59E0B" />
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em" }}>AI Orchestration</h3>
                    </div>
                    <div className="glass" style={{ borderRadius: 16, padding: 24, border: "1px solid #1A1A22" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E6E1" }}>Gemini 3 Flash</div>
                          <div style={{ fontSize: 12, color: "#555" }}>High-speed multimodal reasoning engine</div>
                        </div>
                        <div style={{ background: "#F59E0B15", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#F59E0B", border: "1px solid #F59E0B33" }}>ACTIVE</div>
                      </div>
                      <div style={{ borderTop: "1px solid #1A1A22", paddingTop: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#AAA", marginBottom: 10 }}>System Prompt</div>
                        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6, background: "#050507", padding: 16, borderRadius: 12, border: "1px solid #141420", fontFamily: "Geist Mono, monospace" }}>
                          {BUILDER_SYS.slice(0, 200)}...
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Environment Variables */}
                  <section>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <Database size={16} color="#F59E0B" />
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em" }}>Environment Variables</h3>
                    </div>
                    <div className="glass" style={{ borderRadius: 16, padding: 24, border: "1px solid #1A1A22" }}>
                      <p style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>These variables are injected into your app at build time.</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {[
                          { key: "GEMINI_API_KEY", value: "••••••••••••••••", type: "Secret" },
                          { key: "SAINTSAL_STUDIO_ID", value: "SS-90210-X", type: "System" },
                          { key: "HACP_PROTOCOL_VERSION", value: "v4.2.0", type: "System" }
                        ].map(env => (
                          <div key={env.key} style={{ display: "flex", alignItems: "center", gap: 12, background: "#050507", padding: "10px 16px", borderRadius: 10, border: "1px solid #141420" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", fontFamily: "Geist Mono" }}>{env.key}</div>
                              <div style={{ fontSize: 11, color: "#444", fontFamily: "Geist Mono" }}>{env.value}</div>
                            </div>
                            <div style={{ fontSize: 10, color: "#333", fontWeight: 700, textTransform: "uppercase" }}>{env.type}</div>
                          </div>
                        ))}
                        <button style={{ marginTop: 8, width: "100%", padding: "10px", borderRadius: 10, border: "1px dashed #1A1A22", background: "transparent", color: "#444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          + Add Variable
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* Domain & Deployment */}
                  <section>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <Network size={16} color="#F59E0B" />
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em" }}>Domain & Publishing</h3>
                    </div>
                    <div className="glass" style={{ borderRadius: 16, padding: 24, border: "1px solid #1A1A22" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #1A1A22" }}>
                          <Github size={24} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>ryan-hacp / {projectName.toLowerCase().replace(/\s+/g, "-")}</div>
                          <div style={{ fontSize: 12, color: "#22C55E" }}>Connected & Syncing</div>
                        </div>
                        <button style={{ padding: "8px 16px", borderRadius: 8, background: "#1A1A22", color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Manage</button>
                      </div>
                      
                      <div style={{ borderTop: "1px solid #1A1A22", paddingTop: 24 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#AAA", marginBottom: 12 }}>Custom Domain</div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <div style={{ flex: 1, background: "#050507", border: "1px solid #141420", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#666" }}>
                            {projectName.toLowerCase().replace(/\s+/g, "-")}.saintsal.studio
                          </div>
                          <button style={{ padding: "0 16px", borderRadius: 10, background: "#F59E0B", color: "#000", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            Configure
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* PWA & Mobile */}
                  <section>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <Smartphone size={16} color="#F59E0B" />
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em" }}>PWA & Mobile UX</h3>
                    </div>
                    <div className="glass" style={{ borderRadius: 16, padding: 24, border: "1px solid #1A1A22" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E6E1" }}>Install SaintSal™ Studio</div>
                          <div style={{ fontSize: 12, color: "#555" }}>Add to your home screen for a native iOS experience.</div>
                        </div>
                        <button 
                          onClick={installPWA}
                          disabled={!deferredPrompt}
                          style={{ 
                            background: deferredPrompt ? "#F59E0B" : "#1A1A22", 
                            color: deferredPrompt ? "#000" : "#444", 
                            padding: "8px 16px", 
                            borderRadius: 8, 
                            fontSize: 12, 
                            fontWeight: 700, 
                            border: "none", 
                            cursor: deferredPrompt ? "pointer" : "not-allowed" 
                          }}
                        >
                          {deferredPrompt ? "Install App" : "Installed"}
                        </button>
                      </div>
                      <div style={{ borderTop: "1px solid #1A1A22", paddingTop: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#AAA" }}>Haptic Feedback</div>
                            <div style={{ fontSize: 11, color: "#444" }}>Subtle vibrations for key interactions (iOS/Android)</div>
                          </div>
                          <div style={{ width: 40, height: 20, background: "#22C55E", borderRadius: 10, position: "relative", cursor: "pointer" }}>
                            <div style={{ position: "absolute", right: 2, top: 2, width: 16, height: 16, background: "#fff", borderRadius: "50%" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section style={{ paddingBottom: 40 }}>
                    <div className="glass" style={{ borderRadius: 16, padding: 24, border: "1px solid #1A1A22", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#F59E0B", marginBottom: 8 }}>SaintSal™ Studio v4.2.0</div>
                      <div style={{ fontSize: 12, color: "#444", lineHeight: 1.6 }}>
                        HACP Protocol enabled. Patent #10,290,222.<br />
                        Licensed to Ryan @ HACP Global AI.<br />
                        © 2026 SaintSal™ Labs. All rights reserved.
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {/* CODE EDITOR */}
          {rightTab === "code" && (
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {/* File tree */}
              <div style={{ width: 200, background: "#090910", borderRight: "1px solid #141420", overflowY: "auto", flexShrink: 0 }}>
                <div style={{ padding: "8px 10px 6px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #141420" }}>
                  <span style={{ fontSize: 9.5, color: "#333", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase" }}>Files</span>
                  <span style={{ fontSize: 9, color: "#2A2A34", marginLeft: "auto" }}>{fileList.length} files</span>
                </div>
                {hasFiles ? (
                  Object.entries(buildTree(files)).map(([k, v]) => (
                    <FileNode key={k} name={k} node={v} activeFile={activeFile?.name} onSelect={openFile} />
                  ))
                ) : (
                  <div style={{ padding: "20px 12px", fontSize: 11.5, color: "#2A2A34", textAlign: "center", lineHeight: 1.7 }}>No files yet<br />Ask SAL to build something</div>
                )}
              </div>

              {/* Code viewer */}
              <div style={{ flex: 1, overflow: "hidden", background: "#0A0A0D", display: "flex", flexDirection: "column" }}>
                {activeFile ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    {/* File header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid #141420", background: "#090910", zIndex: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: fileIcon(activeFile.name).color, fontFamily: "Geist Mono, monospace" }}>{fileIcon(activeFile.name).icon}</span>
                        <span className="mono" style={{ fontSize: 12.5, color: "#B8B4AC" }}>{activeFile.name}</span>
                        <span style={{ fontSize: 9.5, color: "#2A2A34", background: "#111118", padding: "1px 6px", borderRadius: 4, border: "1px solid #1E1E28" }}>{activeFile.lang}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={() => saveVersion(projectName.replace(/\s+/g, '-').toLowerCase(), files, `Manual Save ${new Date().toLocaleTimeString()}`)}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 5, border: "1px solid #F59E0B33", background: "#F59E0B11", color: "#F59E0B", fontSize: 10.5, cursor: "pointer", fontFamily: "Geist, sans-serif" }}>
                          <Save size={10} color="#F59E0B" />Save Snapshot
                        </button>
                        <button onClick={() => navigator.clipboard?.writeText(activeFile.content)}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 5, border: "1px solid #1E1E28", background: "transparent", color: "#555", fontSize: 10.5, cursor: "pointer", fontFamily: "Geist, sans-serif" }}>
                          <Copy size={10} color="#555" />Copy
                        </button>
                      </div>
                    </div>
                    {/* Code Editor */}
                    <CodeEditor 
                      code={activeFile.content} 
                      lang={activeFile.lang} 
                      onChange={(newVal) => {
                        setFiles(prev => ({
                          ...prev,
                          [activeFile.name]: { ...activeFile, content: newVal }
                        }));
                      }} 
                    />
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#2A2A34", fontSize: 13.5, flexDirection: "column", gap: 8 }}>
                    <Code size={28} color="#1C1C24" />
                    <span>Select a file to view</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FILES OVERVIEW */}
          {rightTab === "files" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
              {!hasFiles ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#2A2A34", flexDirection: "column", gap: 9 }}>
                  <Folder size={30} color="#1C1C24" />
                  <span style={{ fontSize: 13.5 }}>No files generated yet</span>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 3 }}>Project Files</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{fileList.length} files generated</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                    {fileList.map((f: any) => {
                      const fi = fileIcon(f.name);
                      const lines = f.content.split("\n").length;
                      return (
                        <button key={f.name} onClick={() => openFile(f)}
                          style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderRadius: 9, border: `1px solid ${activeFile?.name === f.name ? fi.color + "44" : "#1C1C24"}`, background: activeFile?.name === f.name ? fi.color + "08" : "#0D0D10", cursor: "pointer", textAlign: "left", transition: "all .15s", fontFamily: "Geist, sans-serif" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = fi.color + "44"; e.currentTarget.style.background = fi.color + "08"; }}
                          onMouseLeave={e => { if (activeFile?.name !== f.name) { e.currentTarget.style.borderColor = "#1C1C24"; e.currentTarget.style.background = "#0D0D10"; }}}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <span style={{ fontSize: 16, lineHeight: 1 }}>{fi.icon.length > 2 ? fi.icon : <span style={{ fontSize: 11, fontWeight: 800, color: fi.color, fontFamily: "Geist Mono, monospace" }}>{fi.icon}</span>}</span>
                            <span style={{ fontSize: 9.5, color: "#333", background: "#111118", padding: "1px 5px", borderRadius: 3, border: "1px solid #1E1E28", fontFamily: "Geist Mono, monospace" }}>{f.lang}</span>
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#C8C5BE", wordBreak: "break-all" }}>{f.name.split("/").pop()}</div>
                          <div style={{ fontSize: 11, color: "#3A3A44" }}>{f.name.includes("/") ? f.name.split("/").slice(0, -1).join("/") + "/" : "root"}</div>
                          <div style={{ fontSize: 10.5, color: "#2A2A34" }}>{lines} lines</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Deploy section */}
                  <div style={{ marginTop: 20, background: "#0D0D10", border: "1px solid #1C1C24", borderRadius: 11, padding: "16px 18px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "#E8E6E1" }}>Deploy Project</div>
                    <div style={{ display: "flex", gap: 9 }}>
                      <button onClick={() => { setDeployStatus("deploying"); setTimeout(() => { setDeployStatus("deployed"); setVercelUrl("saintsallabs-build.vercel.app"); }, 2200); }}
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px", borderRadius: 8, border: "none", background: deployStatus === "deployed" ? "#22C55E" : "#fff", color: "#000", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "Geist, sans-serif" }}>
                        {deployStatus === "deploying" ? <><div className="spinn" style={{ width: 12, height: 12, border: "2px solid #33333344", borderTopColor: "#333", borderRadius: "50%" }} />Deploying...</> : deployStatus === "deployed" ? <><Check size={13} color="#000" />Deployed to Vercel</> : <><Smartphone size={13} color="#000" />Deploy to Vercel</>}
                      </button>
                      <button onClick={() => setGhConnected(v => !v)}
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px", borderRadius: 8, border: `1px solid ${ghConnected ? "#22C55E44" : "#1E1E28"}`, background: ghConnected ? "#22C55E12" : "#111116", color: ghConnected ? "#22C55E" : "#777", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "Geist, sans-serif" }}>
                        <Github size={13} color={ghConnected ? "#22C55E" : "#777"} />{ghConnected ? "GitHub Connected" : "Connect GitHub"}
                      </button>
                    </div>
                    {deployStatus === "deployed" && vercelUrl && (
                      <div className="au" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 7, background: "#22C55E10", border: "1px solid #22C55E22", borderRadius: 7, padding: "8px 12px" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                        <span className="mono" style={{ fontSize: 11.5, color: "#22C55E", flex: 1 }}>{vercelUrl}</span>
                        <button onClick={() => navigator.clipboard?.writeText(`https://${vercelUrl}`)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                          <Copy size={11} color="#22C55E" />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Status bar ── */}
        <div style={{ height: 24, background: "#070709", borderTop: "1px solid #141420", display: "flex", alignItems: "center", padding: "0 12px", gap: 16, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: streaming ? "#F59E0B" : "#22C55E", animation: streaming ? "pulseAnim 1s infinite" : "none" }} />
            <span className="mono" style={{ fontSize: 10, color: "#3A3A44" }}>{streaming ? "SAL generating..." : "Ready"}</span>
          </div>
          {hasFiles && <>
            <span className="mono" style={{ fontSize: 10, color: "#2A2A34" }}>{fileList.length} files</span>
            <span className="mono" style={{ fontSize: 10, color: "#2A2A34" }}>{activeFile?.lang?.toUpperCase() || ""}</span>
            {activeFile && <span className="mono" style={{ fontSize: 10, color: "#2A2A34" }}>{activeFile.content.split("\n").length} lines</span>}
          </>}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
            <span className="mono" style={{ fontSize: 10, color: "#1E1E26" }}>SaintSal™ Builder · Vercel · HACP</span>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/* ── Prep View Component ────────────────────────────────────── */
const PrepView = ({ msgs, input, setInput, send, streaming, concepts, isGeneratingConcept, onStartBuild, user, signInWithGoogle, logOut, isMobile, attachments, setAttachments, handleFileSelect, handlePaste, startSpeechToText, isListening }: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, concepts, attachments]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#000", color: "#E8E6E1", position: "relative" }}>
      {/* Hidden File Input */}
      <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileSelect} style={{ display: "none" }} />

      {/* Header */}
      <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid #111", background: "#08080A", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
           <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
             <Sparkles size={18} color="#000" />
           </div>
           <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>SaintSal™ <span style={{ color: "#F59E0B" }}>Prep</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
           {user ? (
             <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
               <img src={user.photoURL || ""} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #1A1A22" }} />
               {!isMobile && <button onClick={logOut} style={{ background: "transparent", border: "none", color: "#555", fontSize: 12, cursor: "pointer" }}>Sign Out</button>}
             </div>
           ) : (
             <button onClick={signInWithGoogle} style={{ background: "#F59E0B", color: "#000", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Sign In</button>
           )}
        </div>
      </div>

      {/* Chat Area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px" : "40px 20px", display: "flex", flexDirection: "column" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", width: "100%" }}>
          {msgs.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg,#F59E0B11,#D9770611)", border: "1px solid #F59E0B22", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                <BrainCircuit size={32} color="#F59E0B" />
              </div>
              <h1 style={{ fontSize: isMobile ? 28 : 42, fontWeight: 900, marginBottom: 12, letterSpacing: "-0.04em" }}>What are we building today?</h1>
              <p style={{ color: "#555", fontSize: isMobile ? 14 : 18, maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>Describe your vision. I'll generate concepts with Nano Banana and then we'll orchestrate the full build.</p>
            </motion.div>
          )}
          
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {msgs.map((m, i) => <ChatMsg key={i} msg={m} />)}
          </div>
          
          {/* Concept Gallery */}
          {concepts.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <ImageIcon size={14} color="#F59E0B" />
                <div style={{ fontSize: 11, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.1em" }}>Nano Banana Concepts</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 16 }}>
                {concepts.map((c, i) => (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ aspectRatio: "9/16", borderRadius: 16, overflow: "hidden", border: "1px solid #1A1A22", background: "#050507", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
                    <img src={c} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </motion.div>
                ))}
                {isGeneratingConcept && (
                  <div style={{ aspectRatio: "9/16", borderRadius: 16, background: "#050507", border: "1px dashed #1A1A22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <RefreshCw size={24} color="#F59E0B" className="animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div style={{ height: 120 }} />
      </div>

      {/* Footer / Input */}
      <div style={{ padding: isMobile ? "16px" : "32px", borderTop: "1px solid #111", background: "rgba(8,8,10,0.9)", backdropFilter: "blur(20px)", position: "sticky", bottom: 0 }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
              {attachments.map((att, i) => (
                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                  <img src={att.data} alt="" style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover", border: "1px solid #F59E0B44" }} />
                  <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#F59E0B", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={12} color="#000" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, background: "#111", borderRadius: 16, padding: "4px 4px 4px 16px", border: "1px solid #1A1A22", alignItems: "flex-end" }}>
            <button onClick={() => fileInputRef.current?.click()} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "12px 0", color: "#555" }}>
              <PlusCircle size={22} />
            </button>
            <textarea 
              value={input} 
              onChange={e => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Describe your app vision..."
              style={{ flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: 15, outline: "none", resize: "none", padding: "12px 0", lineHeight: 1.5, maxHeight: 120, fontFamily: "Geist, sans-serif" }}
            />
            <button onClick={startSpeechToText} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "12px 0", color: isListening ? "#F59E0B" : "#555" }}>
              <Mic size={22} className={isListening ? "pulseAnim" : ""} />
            </button>
            <button onClick={() => send(input)} disabled={streaming || (!input.trim() && attachments.length === 0)}
              style={{ width: 48, height: 48, borderRadius: 12, background: (input.trim() || attachments.length > 0) ? "#F59E0B" : "#1A1A22", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s", marginBottom: 4 }}>
              {streaming ? <RefreshCw size={20} color="#000" className="animate-spin" /> : <Send size={20} color={(input.trim() || attachments.length > 0) ? "#000" : "#444"} />}
            </button>
          </div>
          
          {msgs.length > 0 && (
            <motion.button 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              onClick={onStartBuild}
              style={{ width: "100%", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#000", border: "none", fontSize: 16, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, boxShadow: "0 10px 20px rgba(245,158,11,0.2)" }}>
              <Zap size={20} fill="currentColor" />
              START FULL BUILD
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};


