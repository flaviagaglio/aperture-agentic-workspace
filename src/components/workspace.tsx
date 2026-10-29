"use client";

import {
  Activity,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  FileText,
  Globe2,
  Layers3,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";

type ActivityItem = { stage: string; message: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  activity?: ActivityItem[];
  activityComplete?: boolean;
  web?: boolean;
};

const suggestions = [
  { icon: BookOpen, label: "Summarize my documents", prompt: "Summarize the key ideas in my documents." },
  { icon: Search, label: "Find a specific detail", prompt: "Find the most important details in my uploaded documents." },
  { icon: Globe2, label: "Research a current topic", prompt: "What are the latest developments in agentic AI?" },
];

const initialMessages: Message[] = [];

export function Workspace() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentCount, setDocumentCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const endOfMessages = useRef<HTMLDivElement>(null);

  async function sendMessage(value = input) {
    const message = value.trim();
    if (!message || sending) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: message };
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      activity: [],
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setNotice("");
    setSending(true);

    const updateLast = (updater: (last: Message) => Message) => {
      setMessages((current) => current.map((item, index) =>
        index === current.length - 1 ? updater(item) : item,
      ));
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "The request could not be completed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const rawEvent of events) {
          const line = rawEvent.split("\n").find((part) => part.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
          if (event.type === "status") {
            updateLast((last) => ({
              ...last,
              activity: [...(last.activity ?? []), { stage: String(event.stage), message: String(event.message) }],
            }));
          } else if (event.type === "token") {
            updateLast((last) => ({ ...last, content: last.content + String(event.content) }));
          } else if (event.type === "complete") {
            updateLast((last) => ({
              ...last,
              sources: event.sources as string[],
              web: Boolean(event.usedWebSearch),
              activityComplete: true,
            }));
          } else if (event.type === "error") {
            throw new Error(String(event.message));
          }
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setMessages((current) => current.filter((item) => item.id !== assistantMessage.id));
    } finally {
      setSending(false);
      requestAnimationFrame(() => endOfMessages.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice("");
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const result = await response.json() as { error?: string; filename?: string; chunks?: number };
      if (!response.ok) throw new Error(result.error ?? "Could not upload this file.");
      setDocumentCount((count) => count + 1);
      setNotice(`${result.filename} added · ${result.chunks} searchable chunks`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload this file.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <main className="workspace-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="#home" aria-label="Aperture home">
            <span className="brand-mark"><Layers3 size={19} strokeWidth={2.2} /></span>
            <span>aperture<span className="brand-period">.</span></span>
          </a>
          <button className="icon-button mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation"><X size={19} /></button>
          <button className="new-chat-button" onClick={() => { setMessages([]); setNotice(""); setMobileMenuOpen(false); }}>
            <Plus size={16} /> <span>New conversation</span> <kbd>⌘ K</kbd>
          </button>
        </div>

        <div className="sidebar-section">
          <p className="section-label">Workspace</p>
          <button className="workspace-switcher">
            <span className="workspace-avatar">N</span>
            <span className="workspace-copy"><strong>Northstar Studio</strong><small>Free plan</small></span>
            <ChevronDown size={15} className="muted-icon" />
          </button>
          <nav className="nav-links" aria-label="Main navigation">
            <button className="nav-link active"><MessageSquareText size={17} /> Chat <span className="nav-current-dot" /></button>
            <button className="nav-link" onClick={() => fileInput.current?.click()}><BookOpen size={17} /> Knowledge base <span className="nav-count">{documentCount}</span></button>
            <button className="nav-link"><Activity size={17} /> Activity</button>
          </nav>
        </div>

        <div className="sidebar-section recent-section">
          <div className="section-heading"><p className="section-label">Recent</p><button className="subtle-icon" aria-label="Search conversations"><Search size={15} /></button></div>
          {hasMessages ? (
            <button className="recent-item"><MessageSquareText size={15} /><span>{messages.find((item) => item.role === "user")?.content ?? "New conversation"}</span></button>
          ) : (
            <p className="empty-recent">Your conversations will appear here.</p>
          )}
        </div>

        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-title"><span>Workspace usage</span><span>12%</span></div>
            <div className="usage-track"><span /></div>
            <p>1.2k of 10k monthly credits</p>
            <button>Explore plans <ArrowUp size={13} /></button>
          </div>
          <button className="profile-button">
            <span className="profile-avatar">FG</span>
            <span className="profile-copy"><strong>Flavia Gaglio</strong><small>Personal workspace</small></span>
            <MoreDots />
          </button>
        </div>
      </aside>

      {mobileMenuOpen && <button className="mobile-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" />}

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Chat</strong></div>
          </div>
          <div className="topbar-actions">
            <span className="connection-state"><span /> All systems operational</span>
            <button className="help-button"><CircleHelp size={16} /> Help center</button>
            <button className="icon-button topbar-avatar" aria-label="Account settings">FG</button>
          </div>
        </header>

        <div className={`conversation-area ${hasMessages ? "conversation-active" : ""}`}>
          {!hasMessages ? (
            <div className="welcome-content">
              <div className="welcome-eyebrow"><span className="eyebrow-line" /> YOUR KNOWLEDGE, IN MOTION <span className="eyebrow-line" /></div>
              <div className="welcome-orbit"><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-core"><Sparkles size={25} /></div><span className="orbit-node node-one" /><span className="orbit-node node-two" /><span className="orbit-node node-three" /></div>
              <h1>Good morning, Flavia<span>.</span></h1>
              <p className="welcome-subtitle">Your ideas are connected. What would you like to explore?</p>

              <div className="suggestion-grid">
                {suggestions.map(({ icon: Icon, label, prompt }) => (
                  <button className="suggestion-card" key={label} onClick={() => void sendMessage(prompt)}>
                    <span className="suggestion-icon"><Icon size={17} /></span>
                    <span>{label}</span>
                    <ArrowUp size={14} className="suggestion-arrow" />
                  </button>
                ))}
              </div>

              <div className="empty-state-note"><span className="note-icon"><FileText size={16} /></span><span><strong>Start with your knowledge base</strong><small>Upload a PDF or TXT file to get answers grounded in your own sources.</small></span><button onClick={() => fileInput.current?.click()}><Upload size={14} /> Add files</button></div>
            </div>
          ) : (
            <div className="message-list">
              <div className="conversation-date"><span /> TODAY <span /></div>
              {messages.map((message) => (
                <article className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"}`} key={message.id}>
                  {message.role === "assistant" && <div className="assistant-avatar"><Sparkles size={15} /></div>}
                  <div className="message-body">
                    {message.role === "assistant" && (
                      <div className="message-author">Aperture <span>·</span> <small>Agent</small></div>
                    )}
                    {message.activity && message.activity.length > 0 && (
                      <div className="activity-card">
                        <div className="activity-heading"><span className={`activity-live-dot ${message.activityComplete ? "activity-done" : ""}`} /> Agent workflow <span className="activity-run">{message.activityComplete ? "COMPLETE" : "RUNNING"}</span></div>
                        {message.activity.map((item, index) => (
                          <div className="activity-step" key={`${item.stage}-${index}`}>
                            <span className={`step-icon ${item.stage === "quality" ? "step-done" : ""}`}>{item.stage === "quality" ? <Check size={11} /> : <span />}</span>
                            <span>{item.message}</span>
                            {index === message.activity!.length - 1 && sending && <LoaderCircle size={13} className="spin" />}
                          </div>
                        ))}
                      </div>
                    )}
                    {message.content && <div className="message-content">{message.content}</div>}
                    {message.role === "assistant" && !message.content && sending && message.activity?.length === 0 && <div className="typing-indicator"><i /><i /><i /></div>}
                    {message.sources && message.sources.length > 0 && (
                      <div className="source-list"><span className="source-label">SOURCES</span>{message.sources.map((source) => <span className="source-chip" key={source}><FileText size={12} />{source}</span>)}</div>
                    )}
                    {message.web && <div className="web-source-note"><Globe2 size={13} /> Web research included</div>}
                  </div>
                  {message.role === "user" && <div className="user-avatar">FG</div>}
                </article>
              ))}
              <div ref={endOfMessages} />
            </div>
          )}
        </div>

        <div className="composer-wrap">
          {notice && <div className="notice-bar"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
          <form className="composer" onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask anything about your knowledge..."
              rows={1}
              maxLength={8_000}
              aria-label="Your message"
              disabled={sending}
            />
            <div className="composer-toolbar">
              <div className="composer-tools">
                <button type="button" className="tool-button" onClick={() => fileInput.current?.click()} disabled={uploading}>
                  {uploading ? <LoaderCircle size={15} className="spin" /> : <Paperclip size={15} />}<span>{uploading ? "Adding file" : "Attach"}</span>
                </button>
                <span className="composer-divider" />
                <button type="button" className="model-selector"><span className="model-dot" /> Aperture Agent <ChevronDown size={13} /></button>
              </div>
              <div className="composer-submit-group"><span className="composer-hint"><Command size={11} /> Enter</span><button className="send-button" type="submit" disabled={!input.trim() || sending} aria-label="Send message">{sending ? <LoaderCircle size={16} className="spin" /> : <ArrowDown size={16} />}</button></div>
            </div>
          </form>
          <div className="composer-footer"><span><ShieldCheck size={12} /> Your data stays yours</span><span>Powered by agentic reasoning</span></div>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={uploadFile} />
        </div>
      </section>
    </main>
  );
}

function MoreDots() {
  return <span className="more-dots" aria-hidden="true"><i /><i /><i /></span>;
}