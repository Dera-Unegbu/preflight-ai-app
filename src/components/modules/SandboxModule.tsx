import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send, Mic, MicOff, Phone, Gauge, Wrench, AlertTriangle,
  Volume2, MessageSquare, ScrollText, Zap, Radio,
} from "lucide-react";
import type { Report, Channel } from "@/lib/synthesis";
import {
  answerQueryAsync, SUGGESTED_QUESTIONS,
  type SandboxAnswer, type ConversationTurn,
} from "@/lib/sandboxEngine";
import { logEvent } from "@/lib/telemetry";

interface Msg {
  role: "user" | "agent";
  text: string;
  answer?: SandboxAnswer;
}

interface Props {
  report: Report;
  prospectId: string;
  isOwnView: boolean;
}

type Mode = Channel | "voice";

// ─── SpeechRecognition type shim ─────────────────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionInstance) | null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SandboxModule({ report, prospectId, isOwnView }: Props) {
  const [mode, setMode] = useState<Mode>("web");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "agent",
      text: `Hi, I'm ${report.name}'s AI assistant. Ask me anything about our policies — orders, returns, billing, appointments — or try one of the suggestions below.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [inspector, setInspector] = useState<SandboxAnswer | null>(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ConversationTurn[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // Call timer
  useEffect(() => {
    if (inCall && mode === "voice") {
      timerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [inCall, mode]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || typing) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setTyping(true);
    logEvent("sandbox_message", { question: q, mode, prospectId });

    // Update history for context
    historyRef.current = [
      ...historyRef.current,
      { role: "user" as const, content: q },
    ].slice(-12);

    // Speak user query in voice mode
    if (mode === "voice" && !voiceMuted && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    try {
      const answer = await answerQueryAsync(q, historyRef.current, report);

      setMessages((m) => [...m, { role: "agent", text: answer.reply, answer }]);
      setInspector(answer);
      setTyping(false);

      // Update history with agent reply
      historyRef.current = [
        ...historyRef.current,
        { role: "assistant" as const, content: answer.reply },
      ].slice(-12);

      // TTS in voice mode
      if (mode === "voice" && !voiceMuted && window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(
          answer.reply.length > 300 ? answer.reply.slice(0, 300) + "…" : answer.reply,
        );
        utter.rate = 1.05;
        utter.pitch = 0.95;
        window.speechSynthesis.speak(utter);
      }

      if (answer.escalated) logEvent("escalation", { question: q });
      if (answer.toolCall) logEvent("tool_call", { tool: answer.toolCall.name, question: q });
      logEvent("sandbox_reply", {
        latencyMs: answer.latencyMs,
        confidence: answer.confidence,
        isLive: answer.isLive,
      });
    } catch {
      setTyping(false);
    }
  }, [typing, mode, voiceMuted, report, prospectId]);

  const modes: { id: Mode; label: string; icon: typeof MessageSquare }[] = [
    { id: "web", label: "Web Chat", icon: MessageSquare },
    ...(report.channels.includes("whatsapp")
      ? [{ id: "whatsapp" as Mode, label: "WhatsApp", icon: MessageSquare }]
      : []),
    ...(report.channels.includes("voice")
      ? [{ id: "voice" as Mode, label: "Voice Call", icon: Mic }]
      : []),
  ];

  const isVoice = mode === "voice";
  const containerBg = isVoice
    ? "bg-gradient-to-b from-neutral-900 to-neutral-950"
    : mode === "whatsapp"
      ? "bg-[#0B141A]"
      : "bg-white";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="overflow-hidden rounded-2xl border border-white/10">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 border-b border-white/10 bg-black/30 px-3 py-2">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setMode(id);
                if (id === "voice") setInCall(true);
                if (id !== "voice" && inCall) {
                  setInCall(false);
                  window.speechSynthesis?.cancel();
                }
              }}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === id ? "bg-[var(--brand-primary)] text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          {report.isLive && (
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
              <Radio className="h-3 w-3 animate-pulse" />
              Live AI
            </span>
          )}
          {isVoice && inCall && (
            <span className="ml-auto flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live call · {formatTime(callSeconds)}
            </span>
          )}
        </div>

        <div className={`${containerBg} min-h-[420px] flex flex-col`}>
          {isVoice ? (
            <VoiceSim
              report={report}
              messages={messages}
              typing={typing}
              muted={voiceMuted}
              setMuted={setVoiceMuted}
              onEnd={() => { setInCall(false); window.speechSynthesis?.cancel(); }}
              onSpeak={(t) => void send(t)}
            />
          ) : (
            <ChatSim
              mode={mode}
              report={report}
              messages={messages}
              typing={typing}
              onSend={(t) => void send(t)}
              input={input}
              setInput={setInput}
            />
          )}
          <div ref={endRef} />
        </div>

        {!isVoice && (
          <div className="flex flex-wrap gap-2 border-t border-white/10 bg-black/20 px-3 py-2.5">
            {SUGGESTED_QUESTIONS.slice(0, 4).map((q) => (
              <button
                key={q}
                onClick={() => void send(q)}
                className="cursor-pointer rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400 transition-colors hover:border-[var(--brand-primary)] hover:text-white"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inspector drawer */}
      <div className="rounded-2xl border border-white/10 bg-black/40 lg:max-h-[520px] lg:overflow-y-auto">
        <div className="sticky top-0 flex items-center gap-2 border-b border-white/10 bg-neutral-900/90 px-4 py-3 backdrop-blur">
          <Gauge className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-300">Inspector</span>
          {inspector?.isLive && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400">
              <Zap className="h-3 w-3" /> Groq
            </span>
          )}
        </div>
        {inspector ? (
          <Inspector answer={inspector} />
        ) : (
          <p className="px-4 py-6 text-sm text-neutral-500">
            Send a message to see retrieved policy chunks, tool-call payloads and live latency here.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Inspector ────────────────────────────────────────────────────────────────
function Inspector({ answer }: { answer: SandboxAnswer }) {
  return (
    <div className="space-y-4 p-4 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-neutral-500">Latency</span>
        <span className={`font-mono ${answer.latencyMs < 500 ? "text-emerald-400" : answer.latencyMs < 1500 ? "text-amber-400" : "text-red-400"}`}>
          {answer.latencyMs} ms
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-500">Confidence</span>
        <span className={`font-mono ${answer.confidence >= 0.65 ? "text-emerald-400" : answer.confidence >= 0.4 ? "text-amber-400" : "text-red-400"}`}>
          {Math.round(answer.confidence * 100)}%
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-500">Model</span>
        <span className="font-mono text-neutral-400">{answer.isLive ? "Groq (live)" : "Local fallback"}</span>
      </div>

      {answer.escalated && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Escalated to human agent with full context summary.
        </div>
      )}

      {answer.toolCall && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-neutral-400">
            <Wrench className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Tool call</span>
            <span className="ml-auto font-mono text-neutral-500">{answer.toolCall.latencyMs}ms</span>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-300">
{`${answer.toolCall.name}(${JSON.stringify(answer.toolCall.args)})\n→ ${JSON.stringify(answer.toolCall.result, null, 2)}`}
          </pre>
        </div>
      )}

      {answer.sourceUrl && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-neutral-400">
            <ScrollText className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Source cited</span>
          </div>
          <a
            href={answer.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-mono text-[10px] text-sky-400/70 hover:text-sky-400"
          >
            {answer.sourceUrl}
          </a>
          {answer.sourceSnippet && (
            <p className="mt-1 leading-relaxed text-neutral-500 line-clamp-3">{answer.sourceSnippet}</p>
          )}
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-neutral-400">
          <ScrollText className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Retrieved chunks ({answer.chunks.length})</span>
        </div>
        {answer.chunks.length === 0 ? (
          <p className="text-neutral-600">No policy chunks retrieved.</p>
        ) : (
          <div className="space-y-2">
            {answer.chunks.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-neutral-300">{c.topic}</span>
                  <span className="font-mono text-neutral-500">{Math.round(c.score * 100)}%</span>
                </div>
                <p className="line-clamp-3 leading-relaxed text-neutral-500">{c.snippet}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-sky-400/70">{c.url}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ChatSim ──────────────────────────────────────────────────────────────────
function ChatSim({
  mode, report, messages, typing, onSend, input, setInput,
}: {
  mode: Mode;
  report: Report;
  messages: Msg[];
  typing: boolean;
  onSend: (t: string) => void;
  input: string;
  setInput: (v: string) => void;
}) {
  const isWhatsApp = mode === "whatsapp";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`flex items-center gap-3 px-4 py-3 ${isWhatsApp ? "bg-[#1F2C34]" : "bg-[var(--brand-dark)]"}`}>
        {report.brand.logoUrl ? (
          <img src={report.brand.logoUrl} alt="" className="h-9 w-9 rounded-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-primary)] font-bold text-white">
            {report.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{report.name} Support</p>
          <p className="text-xs text-neutral-400">{report.isLive ? "AI agent (Groq) · online" : "AI agent · online"}</p>
        </div>
      </div>

      <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto p-4 ${isWhatsApp ? "bg-[#0B141A]" : "bg-neutral-50"}`}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-[var(--brand-primary)] text-white"
                  : isWhatsApp
                    ? "rounded-bl-md bg-[#1F2C34] text-neutral-100"
                    : "rounded-bl-md bg-white text-neutral-800 shadow-sm border border-neutral-200"
              }`}
            >
              {m.text}
              {m.answer && (m.answer.chunks.length > 0 || m.answer.sourceUrl) && (
                <div className={`mt-2 border-t pt-1.5 text-[10px] ${m.role === "user" ? "border-white/20 text-white/60" : "border-neutral-200 text-neutral-500"}`}>
                  {m.answer.sourceUrl
                    ? <a href={m.answer.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">Source: {m.answer.chunks[0]?.topic ?? "Policy"}</a>
                    : `Source: ${m.answer.chunks[0]?.topic}`}
                  {m.answer.isLive && <span className="ml-2 text-emerald-500">· live</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className={`flex gap-1 rounded-2xl rounded-bl-md px-4 py-3 ${isWhatsApp ? "bg-[#1F2C34]" : "bg-white border border-neutral-200 shadow-sm"}`}>
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={`flex items-center gap-2 px-4 py-3 ${isWhatsApp ? "bg-[#1F2C34]" : "bg-white border-t border-neutral-200"}`}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSend(input); }}
          placeholder={`Message ${report.name}…`}
          className="h-10 flex-1 rounded-full border border-neutral-300 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[var(--brand-primary)] focus:outline-none"
        />
        <button
          onClick={() => onSend(input)}
          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[var(--brand-primary)] text-white transition-transform hover:scale-105 ${!input.trim() ? "opacity-40" : ""}`}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── VoiceSim ─────────────────────────────────────────────────────────────────
function VoiceSim({
  report, messages, typing, muted, setMuted, onEnd, onSpeak,
}: {
  report: Report;
  messages: Msg[];
  typing: boolean;
  muted: boolean;
  setMuted: (v: boolean) => void;
  onEnd: () => void;
  onSpeak: (t: string) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef<SpeechRecognitionInstance | null>(null);
  const SpeechRecognition = getSpeechRecognition();

  const startListening = () => {
    if (!SpeechRecognition || muted) return;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      if (said.trim()) { setTranscript(said); }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognizerRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopListening = () => {
    recognizerRef.current?.stop();
    setListening(false);
  };

  const agentLines = messages.filter((m) => m.role === "agent").slice(-3);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-between p-6">
      <div className="w-full space-y-2">
        {agentLines.map((m, i) => (
          <div key={i} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm text-neutral-300">
            <Volume2 className="mr-2 inline h-3.5 w-3.5 text-[var(--brand-light)]" />
            {m.text.length > 220 ? m.text.slice(0, 220) + "…" : m.text}
          </div>
        ))}
        {typing && <p className="text-center text-xs text-neutral-500">Agent is responding…</p>}
      </div>

      <div className="flex flex-col items-center gap-4 py-6">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div className={`absolute inset-0 rounded-full bg-[var(--brand-primary)]/30 ${listening ? "animate-ping" : ""}`} style={{ animationDuration: "1.2s" }} />
          <div className={`absolute inset-0 rounded-full bg-[var(--brand-primary)]/15 ${typing ? "animate-pulse" : ""}`} />
          <div className="absolute inset-2 rounded-full bg-[var(--brand-primary)]/20" />
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand-primary)] font-bold text-xl text-white">
            {report.name.charAt(0)}
          </div>
        </div>
        <p className="text-sm text-neutral-400">
          {listening ? "Listening…" : "Voice agent ready"}
        </p>
      </div>

      <div className="w-full space-y-3">
        <div className="flex gap-2">
          <input
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && transcript.trim()) {
                onSpeak(transcript);
                setTranscript("");
              }
            }}
            placeholder="Type what the caller says…"
            className="h-11 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder:text-neutral-600 focus:border-[var(--brand-primary)] focus:outline-none"
          />
          <button
            onClick={() => {
              if (transcript.trim()) { onSpeak(transcript); setTranscript(""); }
            }}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white transition-opacity hover:opacity-90"
          >
            <Phone className="h-4 w-4" />
          </button>
          {SpeechRecognition ? (
            <button
              onClick={listening ? stopListening : startListening}
              className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                listening
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/20 text-[var(--brand-light)]"
                  : muted
                    ? "border-red-500/40 bg-red-500/10 text-red-400"
                    : "border-white/10 text-neutral-400 hover:text-white"
              }`}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          ) : (
            <button
              onClick={() => setMuted(!muted)}
              className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border ${muted ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-white/10 text-neutral-400"}`}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={onEnd}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
          >
            <Phone className="h-4 w-4 rotate-[135deg]" />
          </button>
        </div>
        {SpeechRecognition ? (
          <p className="text-center text-[11px] text-neutral-500">
            {listening ? "Listening via microphone…" : "Click the mic to speak or type below."}
          </p>
        ) : (
          <p className="text-center text-[11px] text-neutral-600">
            Microphone not available in this browser. Type to simulate the caller.
          </p>
        )}
      </div>
    </div>
  );
}
