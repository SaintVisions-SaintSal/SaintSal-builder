import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  MessageCircle, 
  Plus, 
  Layers, 
  Settings, 
  Send, 
  ChevronRight, 
  Smartphone, 
  Monitor, 
  User,
  MoreHorizontal,
  PlusCircle,
  Component,
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
  Minimize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

/* ── Stream API (Gemini Implementation) ────────────────────── */
const salStream = async (messages, system, onChunk, onDone) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: messages.map(m => ({ 
        role: m.role === 'assistant' ? 'model' : 'user', 
        parts: [{ text: m.content }] 
      })),
      config: { systemInstruction: system }
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

/* ── Parse code blocks into files ─────────────────────────── */
const parseFiles = (text: string) => {
  const files: Record<string, any> = {};
  const blockRegex = /```(\w+)(?:\s+([^\n]+))?\n([\s\S]*?)```/g;
  let m;
  while ((m = blockRegex.exec(text)) !== null) {
    const lang = m[1];
    let filename = m[2]?.trim();
    const content = m[3];
    if (!filename) {
      const extMap: Record<string, string> = { jsx:"App.jsx", tsx:"App.tsx", js:"index.js", ts:"index.ts", html:"index.html", css:"styles.css", json:"package.json", sh:"setup.sh", bash:"setup.sh", py:"main.py", sql:"schema.sql", yaml:"config.yaml", yml:"config.yml", md:"README.md" };
      filename = extMap[lang] || `file.${lang}`;
    }
    if (files[filename]) {
      let i = 2;
      while (files[`${filename}(${i})`]) i++;
      filename = `${filename}(${i})`;
    }
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
  if (jsLangs.has(lang)) {
    return esc
      .replace(/(\/\/[^\n]*)/g, '<span style="color:#6A9955">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#6A9955">$1</span>')
      .replace(/\b(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|async|await|try|catch|throw|typeof|instanceof|default|null|undefined|true|false|void)\b/g, '<span style="color:#569CD6">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span style="color:#CE9178">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#B5CEA8">$1</span>');
  }
  if (lang === "html") {
    return esc
      .replace(/(&lt;\/?[\w-]+)/g, '<span style="color:#569CD6">$1</span>')
      .replace(/([\w-]+=)("[^"]*")/g, '<span style="color:#9CDCFE">$1</span><span style="color:#CE9178">$2</span>');
  }
  if (lang === "css") {
    return esc
      .replace(/([\w-]+)\s*:/g, '<span style="color:#9CDCFE">$1</span>:')
      .replace(/(#[0-9a-fA-F]{3,8})/g, '<span style="color:#CE9178">$1</span>');
  }
  return esc;
};

/* ── Build preview HTML ─────────────────────────────────────── */
const buildPreviewHTML = (files: Record<string, any>) => {
  const htmlFile = Object.values(files).find(f => f.lang === "html");
  const cssFile = Object.values(files).find(f => f.lang === "css" || f.name.endsWith(".css"));
  const jsFile = Object.values(files).find(f => ["js","jsx","ts","tsx"].includes(f.lang));

  if (htmlFile) {
    let html = htmlFile.content;
    if (cssFile) html = html.replace("</head>", `<style>${cssFile.content}</style></head>`);
    if (jsFile && !htmlFile.content.includes("<script")) {
      html = html.replace("</body>", `<script>${jsFile.content}</script></body>`);
    }
    return html;
  }

  if (jsFile && ["jsx","tsx"].includes(jsFile.lang)) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://unpkg.com/react@18/umd/react.development.js"></script><script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0C0C0F;color:#E8E6E1}</style></head><body><div id="root"></div><script type="text/babel">${jsFile.content.replace(/<\/script>/g,"<\\/script>")}\nconst __RootComponent = typeof App !== 'undefined' ? App : (typeof default_1 !== 'undefined' ? default_1 : () => React.createElement('div',{style:{padding:20,color:'#F59E0B',fontFamily:'system-ui'}},'✅ Component generated — deploy to Vercel for full preview'));\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__RootComponent));</script></body></html>`;
  }

  if (jsFile) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;background:#0C0C0F;color:#E8E6E1;padding:20px}pre{background:#111;padding:16px;border-radius:8px;white-space:pre-wrap;font-size:13px;color:#C8D3F5;border:1px solid #1A1A22}</style></head><body><pre>${jsFile.content.replace(/</g,"&lt;")}</pre></body></html>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;background:#0C0C0F;color:#E8E6E1;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px}</style></head><body><div style="font-size:32px">⚡</div><div style="font-size:16px;font-weight:700;color:#F59E0B">SAL Builder Ready</div><div style="font-size:13px;color:#555">Describe what you want to build in the chat</div></body></html>`;
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
export default function App() {
  // Chat state
  const [msgs, setMsgs] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // Load initial messages and setup WebSocket
  useEffect(() => {
    fetch("/api/messages")
      .then(res => res.json())
      .then(data => {
        setMsgs(data.map((m: any) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
          timestamp: m.timestamp
        })));
      });

    fetch("/api/projects")
      .then(res => res.json())
      .then(data => setProjects(data));

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "chat") {
        const payload = message.payload;
        // Only add if it's from another client or we need to sync
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

  // Save project to DB
  const saveProject = useCallback(async (name: string, config: any) => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, config })
      });
      const newProj = await res.json();
      setProjects(prev => [newProj, ...prev]);
    } catch (e) {
      console.error("Failed to save project", e);
    }
  }, []);

  // Panel width (resizable)
  const [leftWidth, setLeftWidth] = useState(42); // percent
  const resizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [msgs]);

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

  const send = useCallback(async (text: string) => {
    if (!text?.trim() || streaming) return;
    setIsBuilding(true);
    setBuildStep("Initializing build engine...");
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    
    const uMsg = { role: "user", content: text };
    
    // Send to server via WebSocket
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "chat",
        text: text,
        sender: "user"
      }));
    }

    const allMsgs = [...msgs, uMsg];
    setMsgs([...allMsgs, { role: "assistant", content: "", streaming: true }]);
    setStreaming(true);
    let fullResp = "";
    await salStream(
      allMsgs.map(m => ({ role: m.role, content: m.content })),
      BUILDER_SYS,
      chunk => {
        fullResp += chunk;
        setMsgs(prev => { const c = [...prev]; c[c.length - 1] = { ...c[c.length - 1], content: fullResp }; return c; });
        
        // Update build step based on content
        if (fullResp.includes("<file")) {
          const match = fullResp.match(/<file name="([^"]+)">/g);
          if (match) {
            const lastFile = match[match.length - 1].match(/"([^"]+)"/)?.[1];
            setBuildStep(`Generating ${lastFile}...`);
          }
        }
      },
      () => {
        setIsBuilding(false);
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
          setRightTab("preview");
          
          // Auto-save project
          const name = text.slice(0, 30) + (text.length > 30 ? "..." : "");
          setProjectName(name);
          saveProject(name, parsed);
        }
        setStreaming(false);
      }
    );
  }, [msgs, streaming]);

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

  return (
    <div ref={containerRef} style={{ display: "flex", height: "100vh", background: "#000", overflow: "hidden", color: "#E8E6E1", fontFamily: "Geist, sans-serif" }}>
      
      {isAppMode ? (
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
          <div style={{ width: `${leftWidth}%`, display: "flex", flexDirection: "column", borderRight: "1px solid #141420", background: "#0A0A0D" }}>
            {/* Build Progress Overlay */}
        <AnimatePresence>
          {isBuilding && streaming && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <div className="spinn" style={{ width: 40, height: 40, border: "3px solid #F59E0B22", borderTopColor: "#F59E0B", borderRadius: "50%" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#F59E0B", marginBottom: 4 }}>Building SaintSal App</div>
                <div className="mono" style={{ fontSize: 12, color: "#555" }}>{buildStep}</div>
              </div>
              <div style={{ width: 200, height: 4, background: "#111", borderRadius: 2, overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 15, ease: "linear" }} style={{ height: "100%", background: "#F59E0B" }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
            <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", borderBottom: "1px solid #141420", flexShrink: 0, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#F59E0B,#D97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#000" }}>S</span>
                </div>
                <button onClick={() => setShowProjects(!showProjects)} style={{ background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: "#F59E0B" }}>{projectName}</span>
                    <ChevronDown size={12} color="#444" />
                  </div>
                </button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setIsAppMode(true)} style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid #F59E0B", background: "transparent", color: "#F59E0B", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <Play size={11} fill="#F59E0B" /> Run App
                </button>
                <button onClick={() => { setMsgs([]); setFiles({}); setActiveFile(null); setOpenTabs([]); setDeployStatus("idle"); setProjectName("Untitled Project"); }} style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid #1E1E28", background: "transparent", color: "#555", fontSize: 11, cursor: "pointer", fontFamily: "Geist, sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                  <Plus size={11} color="#555" />New
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
        <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0" }}>
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
        </div>

        {/* Input */}
        <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #141420", flexShrink: 0, position: "relative" }}>
          <div className="ios-input-container" style={{ borderRadius: 24, padding: "4px 4px 4px 16px", display: "flex", alignItems: "flex-end", gap: 8 }}>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              onInput={(e: any) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px"; }}
              placeholder="Message SAL Builder..."
              rows={1} style={{ flex: 1, background: "transparent", border: "none", color: "#E8E6E1", fontSize: 14, outline: "none", resize: "none", padding: "10px 0", lineHeight: 1.4, maxHeight: 110, overflowY: "auto", fontFamily: "Geist, sans-serif" }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <button style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Mic size={14} color="#666" />
              </button>
              <button onClick={() => send(input)} disabled={streaming || !input.trim()}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: input.trim() && !streaming ? "#F59E0B" : "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() ? "pointer" : "not-allowed", transition: "all .2s" }}>
                {streaming ? <div className="spinn" style={{ width: 14, height: 14, border: "2px solid #00000033", borderTopColor: "#000", borderRadius: "50%" }} /> : <Send size={14} color={input.trim() ? "#000" : "#333"} />}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 9, color: "#222", textAlign: "center", marginTop: 8, letterSpacing: "0.02em" }}>SaintSal™ Builder · HACP Protocol · Patent #10,290,222</div>
        </div>
      </div>

      {/* ── Resizer ── */}
      <div className="resizer" onMouseDown={() => { resizing.current = true; document.body.style.cursor = "col-resize"; }}
        style={{ width: 3, background: "#141420", cursor: "col-resize", flexShrink: 0, transition: "background .15s" }}
        onMouseEnter={e => e.currentTarget.style.background = "#F59E0B44"}
        onMouseLeave={e => e.currentTarget.style.background = "#141420"} />

      {/* ══════════════════════════════════════
          RIGHT PANEL — Preview / Code / Files
      ══════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0C0C0F", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", borderBottom: "1px solid #141420", background: "#090910", flexShrink: 0, gap: 8 }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 1, background: "#0E0E14", borderRadius: 8, padding: "2px", border: "1px solid #181820" }}>
            {[
              ["preview", "Preview", Eye], 
              ["code", "Code", Code], 
              ["files", "Files", Folder],
              ["simulator", "Simulator", Smartphone],
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

                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto", background: "#08080A" }}>
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

          {/* SETTINGS */}
          {rightTab === "settings" && (
            <div style={{ flex: 1, padding: 30, overflowY: "auto" }}>
              <div style={{ maxWidth: 600, margin: "0 auto" }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, color: "#F59E0B" }}>Settings</h2>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <section>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#AAA", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>AI Configuration</h3>
                    <div className="glass" style={{ borderRadius: 12, padding: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>Gemini Model</div>
                          <div style={{ fontSize: 12, color: "#555" }}>Currently using gemini-2.0-flash-exp</div>
                        </div>
                        <div style={{ background: "#1A1A22", padding: "4px 12px", borderRadius: 6, fontSize: 12, color: "#F59E0B" }}>Active</div>
                      </div>
                      <div style={{ borderTop: "1px solid #1A1A22", paddingTop: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>System Instruction</div>
                        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, background: "#09090D", padding: 12, borderRadius: 8, border: "1px solid #141420" }}>
                          {BUILDER_SYS.slice(0, 150)}...
                        </div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#AAA", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Deployment</h3>
                    <div className="glass" style={{ borderRadius: 12, padding: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #1A1A22" }}>
                          <Github size={20} color="#fff" />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>GitHub Integration</div>
                          <div style={{ fontSize: 12, color: ghConnected ? "#22C55E" : "#555" }}>{ghConnected ? "Connected as ryan-hacp" : "Not connected"}</div>
                        </div>
                        <button onClick={() => setGhConnected(!ghConnected)} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 6, background: ghConnected ? "#1A1A22" : "#fff", color: ghConnected ? "#fff" : "#000", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {ghConnected ? "Disconnect" : "Connect"}
                        </button>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#AAA", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>About SaintSal™ Labs</h3>
                    <div style={{ fontSize: 12, color: "#444", lineHeight: 1.6 }}>
                      SaintSal™ Builder is a proprietary IDE developed by SaintSal™ Labs. 
                      HACP Protocol enabled. Patent #10,290,222.
                      <br /><br />
                      © 2026 SaintSal™ Labs. All rights reserved.
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
              <div style={{ flex: 1, overflow: "auto", background: "#0A0A0D" }}>
                {activeFile ? (
                  <div>
                    {/* File header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid #141420", background: "#090910", position: "sticky", top: 0, zIndex: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: fileIcon(activeFile.name).color, fontFamily: "Geist Mono, monospace" }}>{fileIcon(activeFile.name).icon}</span>
                        <span className="mono" style={{ fontSize: 12.5, color: "#B8B4AC" }}>{activeFile.name}</span>
                        <span style={{ fontSize: 9.5, color: "#2A2A34", background: "#111118", padding: "1px 6px", borderRadius: 4, border: "1px solid #1E1E28" }}>{activeFile.lang}</span>
                      </div>
                      <button onClick={() => navigator.clipboard?.writeText(activeFile.content)}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 5, border: "1px solid #1E1E28", background: "transparent", color: "#555", fontSize: 10.5, cursor: "pointer", fontFamily: "Geist, sans-serif" }}>
                        <Copy size={10} color="#555" />Copy
                      </button>
                    </div>
                    {/* Code */}
                    <pre style={{ padding: "14px 18px", fontFamily: "Geist Mono, monospace", fontSize: 12.5, lineHeight: 1.7, color: "#C8D3F5", counterReset: "line", minHeight: "100%" }}>
                      <code dangerouslySetInnerHTML={{ __html: highlight(activeFile.content, activeFile.lang) }} />
                    </pre>
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


