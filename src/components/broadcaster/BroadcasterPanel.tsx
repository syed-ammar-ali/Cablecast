"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
} from "react";
import {
  X,
  Send,
  Loader2,
  Tv2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  ChevronDown,
  ArrowDown,
  RotateCcw,
  Calendar,
  Film,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { notifyBroadcastMutation } from "@/lib/syncEvents";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface BroadcasterAction {
  type: "schedule" | "navigate" | "tune_in" | "rent_buy";
  target: "broadcast" | "library" | "explore" | "home" | "player";
  payload?: {
    id?: string;
    title?: string;
    timeLabel?: string;
    dayName?: string;
    season?: number;
    episode?: number;
    tmdbId?: number;
    mediaType?: "movie" | "tv";
    action?: "RENT" | "BUY";
    searchQuery?: string;
    campaign?: boolean;
    episodeCount?: number;
    firstDate?: string;
    lastDate?: string;
  };
}

interface Message {
  id: string;
  role: "user" | "broadcaster";
  text: string;
  ts: number;
  action?: BroadcasterAction | null;
}

export interface BroadcasterPanelProps {
  onNavigate?: (view: "home" | "broadcast" | "library" | "explore") => void;
  onRefreshSchedule?: () => void;
  onTuneIn?: (options?: { tmdbId?: number; title?: string }) => void;
  onOpenStoreModal?: (media: {
    id: string | number;
    type: "MOVIE" | "TV";
    title?: string;
    initialAction?: "RENT" | "BUY";
  }) => void;
}

type PanelSize = "minimized" | "open";
type DockSide = "left" | "right";

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const INSPIRATION_CARDS = [
  {
    icon: Calendar,
    title: "Check time & next block",
    desc: "What's on air right now & when is the next open block?",
    prompt: "What is the current time right now and what is the next available block on my broadcast schedule?",
  },
  {
    icon: Calendar,
    title: "Plan episode pacing",
    desc: "1 ep/week for 12 wks, 3 on holiday, 2 thereafter",
    prompt: "Help me pace a 24-episode season: 1 ep/week for the first 12 weeks, 3 on holiday week, then 2/week.",
  },
  {
    icon: Film,
    title: "Check tape library",
    desc: "See what you own & what's on air right now",
    prompt: "What movies and TV shows are in my tape library, and what's currently scheduled?",
  },
  {
    icon: HelpCircle,
    title: "The CD Rule",
    desc: "How broadcasting rights & the VHS Store work",
    prompt: "Explain how the CD rule works and what I can broadcast on my personal channel.",
  },
];

// High-contrast tactile sandblasted matte glass grain
const MATTE_GLASS_GRAIN_URL = `data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='sandblastNoise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.85 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23sandblastNoise)'/%3E%3C/svg%3E`;

/* ─── Broadcaster Panel Component ────────────────────────────────────────── */

export function BroadcasterPanel({
  onNavigate,
  onRefreshSchedule,
  onTuneIn,
  onOpenStoreModal,
}: BroadcasterPanelProps = {}) {
  const [size, setSize] = useState<PanelSize>("minimized");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice Input (Speech-to-Text)
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Voice Output (Speech Synthesis)
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Scroll detection
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // ── Magnetic Edge Docking State ──
  // Icon and panel strictly stay fixed in the viewport, never scrolling away
  const [fabDock, setFabDock] = useState<{ side: DockSide; y: number }>({
    side: "right",
    y: 0, // 0 = default bottom anchor
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);

  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, initialX: 0, initialY: 0 });

  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Initialize Speech Recognition on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as unknown as IWindow;
      const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        };

        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Stop speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Scroll tracking to show/hide the scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceToBottom > 80);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (size === "open") {
      scrollToBottom(true);
    }
  }, [messages, size, scrollToBottom]);

  // Focus input when opened
  useEffect(() => {
    if (size === "open") {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [size]);

  /* ── Text-to-Speech ──────────────────────────────────────────────────────── */

  const speakText = useCallback(
    (text: string, msgId: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      window.speechSynthesis.cancel();
      if (speakingMessageId === msgId) {
        setSpeakingMessageId(null);
        return;
      }

      const cleanText = text
        .replace(/[*#_~`]/g, "")
        .replace(/https?:\/\/\S+/g, "link")
        .slice(0, 450);

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 0.98;

      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);

      setSpeakingMessageId(msgId);
      window.speechSynthesis.speak(utterance);
    },
    [speakingMessageId]
  );

  /* ── Microphone Speech Recognition ───────────────────────────────────────── */

  const toggleListening = useCallback(() => {
    if (!speechSupported || !recognitionRef.current) {
      alert("Voice input is not supported in this browser. Please use Chrome, Safari, or Edge.");
      return;
    }

    triggerHaptic(15);
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  }, [isListening, speechSupported]);

  /* ── Magnetic Edge Dragging (FAB Launcher) ────────────────────────────────── */

  const handleFabPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = fabRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initialX: rect.left,
      initialY: rect.top,
    };
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);
    setDragCoords({ x: rect.left, y: rect.top });
    el.setPointerCapture(e.pointerId);
  }, []);

  const handleFabPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;

    if (!hasMovedRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      hasMovedRef.current = true;
    }

    if (hasMovedRef.current) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const el = fabRef.current;
      const w = el?.offsetWidth ?? 52;
      const h = el?.offsetHeight ?? 52;

      // Always clamp strictly within the viewport
      const currentX = Math.max(8, Math.min(vw - w - 8, dragStartRef.current.initialX + dx));
      const currentY = Math.max(70, Math.min(vh - h - 85, dragStartRef.current.initialY + dy));

      setDragCoords({ x: currentX, y: currentY });
    }
  }, []);

  const handleFabPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      fabRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    // Tap without drag → open panel!
    if (!hasMovedRef.current) {
      triggerHaptic(15);
      setDragCoords(null);
      setSize("open");
      return;
    }

    // Dragged: Magnetically snap to the nearest side edge (AssistiveTouch style)
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fabW = fabRef.current?.offsetWidth ?? 52;
    const fabH = fabRef.current?.offsetHeight ?? 52;

    const finalX = dragCoords?.x ?? e.clientX;
    const finalY = dragCoords?.y ?? e.clientY;

    const side: DockSide = finalX + fabW / 2 < vw / 2 ? "left" : "right";

    const minY = 70; // below top header
    const maxY = vh - fabH - 85; // above bottom navigation bar
    const clampedY = Math.max(minY, Math.min(maxY, finalY));

    setFabDock({ side, y: clampedY });
    setDragCoords(null);
  }, [dragCoords]);

  /* ── Panel Header Dragging (Snaps open panel to side) ─────────────────────── */

  const handlePanelPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, textarea, input, a")) return;

    e.preventDefault();
    e.stopPropagation();
    const el = panelRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initialX: rect.left,
      initialY: rect.top,
    };
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);
    setDragCoords({ x: rect.left, y: rect.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePanelPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;

    if (!hasMovedRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      hasMovedRef.current = true;
    }

    if (hasMovedRef.current) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const el = panelRef.current;
      const w = el?.offsetWidth ?? 360;
      const h = el?.offsetHeight ?? 540;

      const currentX = Math.max(8, Math.min(vw - w - 8, dragStartRef.current.initialX + dx));
      const currentY = Math.max(70, Math.min(vh - h - 85, dragStartRef.current.initialY + dy));

      setDragCoords({ x: currentX, y: currentY });
    }
  }, []);

  const handlePanelPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    if (hasMovedRef.current) {
      const vw = window.innerWidth;
      const panelW = panelRef.current?.offsetWidth ?? 360;
      const finalX = dragCoords?.x ?? e.clientX;

      const side: DockSide = finalX + panelW / 2 < vw / 2 ? "left" : "right";
      setFabDock((prev) => ({ ...prev, side }));
    }

    setDragCoords(null);
  }, [dragCoords]);

  /* ── Send Message ────────────────────────────────────────────────────────── */

  const sendMessage = useCallback(
    async (textToSend?: string) => {
      const text = (textToSend ?? input).trim();
      if (!text || isLoading) return;

      triggerHaptic(10);
      setInput("");
      setError(null);

      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        text,
        ts: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const historyForApi = [...messages, userMsg].slice(-20).map((m) => ({
        role: m.role === "broadcaster" ? "model" : "user",
        text: m.text,
      }));

      const now = new Date();
      const clientTime = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const clientLocalTime = `${now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} at ${clientTime}`;
      const clientDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tzOffset = now.getTimezoneOffset();

      try {
        const res = await fetch("/api/broadcaster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: historyForApi,
            clientTime: now.toISOString(),
            clientLocalTime,
            clientDate,
            timezone,
            tzOffset,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          action?: BroadcasterAction | null;
          error?: string;
        };

        if (!res.ok || data.error) {
          throw new Error(data.error ?? "Broadcaster communication error");
        }

        const replyMsgId = generateId();
        const replyText = data.reply ?? "I received your transmission.";

        if (data.action?.type === "schedule") {
          notifyBroadcastMutation();
          onRefreshSchedule?.();
        }

        setMessages((prev) => [
          ...prev,
          {
            id: replyMsgId,
            role: "broadcaster",
            text: replyText,
            ts: Date.now(),
            action: data.action ?? null,
          },
        ]);

        if (voiceEnabled) {
          speakText(replyText, replyMsgId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Connection error";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, isListening, messages, voiceEnabled, speakText, onRefreshSchedule]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  /* ── Rough Matte Sandblasted Glass Style for Chatbot Body ────────────────── */

  const roughMatteGlassStyle: React.CSSProperties = {
    // Rich frosted matte dark slate/violet background — opaque enough (86%-94%) to completely
    // blur and obscure underlying text and fine details, while allowing ambient colors to diffuse through
    background:
      "linear-gradient(160deg, rgba(32, 28, 48, 0.86) 0%, rgba(18, 16, 26, 0.90) 45%, rgba(10, 9, 15, 0.94) 100%)",
    backdropFilter: "blur(48px) saturate(190%)",
    WebkitBackdropFilter: "blur(48px) saturate(190%)",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    boxShadow:
      "0 28px 70px -12px rgba(0, 0, 0, 0.85), inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.30), inset 0 0 35px 0 rgba(255, 255, 255, 0.03)",
  };

  /* ── Computed FAB Style (Fixed in viewport, snaps to side) ───────────────── */

  function getFabStyle(): React.CSSProperties {
    if (isDragging && dragCoords) {
      return {
        left: `${dragCoords.x}px`,
        top: `${dragCoords.y}px`,
        touchAction: "none",
        transition: "none",
      };
    }

    const isLeft = fabDock.side === "left";

    // If dragged vertically, stay locked at that clamped height in the viewport
    if (fabDock.y > 0) {
      return {
        left: isLeft ? "16px" : "auto",
        right: isLeft ? "auto" : "16px",
        top: `${fabDock.y}px`,
        bottom: "auto",
        touchAction: "none",
        transition:
          "left 0.35s cubic-bezier(0.16, 1, 0.3, 1), right 0.35s cubic-bezier(0.16, 1, 0.3, 1), top 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease",
      };
    }

    // Default resting anchor: viewport bottom edge (respects bottom nav on mobile, bottom-6 on desktop)
    return {
      right: isLeft ? "auto" : "16px",
      left: isLeft ? "16px" : "auto",
      touchAction: "none",
      transition:
        "left 0.35s cubic-bezier(0.16, 1, 0.3, 1), right 0.35s cubic-bezier(0.16, 1, 0.3, 1), bottom 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease",
    };
  }

  /* ── Computed Panel Style (Fixed in viewport, side-docked) ────────────────── */

  function getPanelStyle(): React.CSSProperties {
    if (isDragging && dragCoords) {
      return {
        left: `${dragCoords.x}px`,
        top: `${dragCoords.y}px`,
        bottom: "auto",
        touchAction: "none",
        transition: "none",
      };
    }

    const isLeft = fabDock.side === "left";

    if (fabDock.y > 0) {
      return {
        left: isLeft ? "16px" : "auto",
        right: isLeft ? "auto" : "16px",
        top: `${Math.min(fabDock.y, typeof window !== "undefined" ? Math.max(80, window.innerHeight - 570) : 100)}px`,
        bottom: "auto",
        transition: "left 0.35s cubic-bezier(0.16, 1, 0.3, 1), right 0.35s cubic-bezier(0.16, 1, 0.3, 1), top 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      };
    }

    return {
      left: isLeft ? "16px" : "auto",
      right: isLeft ? "auto" : "16px",
      transition: "left 0.35s cubic-bezier(0.16, 1, 0.3, 1), right 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    };
  }

  /* ── FAB (Minimized State — Cablecast Design System, No Glassmorphism) ───── */

  if (size === "minimized") {
    return (
      <button
        ref={fabRef}
        type="button"
        id="broadcaster-fab"
        aria-label="Open Broadcaster AI"
        title="Broadcaster — Drag to snap to either side, or tap to open"
        style={getFabStyle()}
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        className="fixed z-[70] bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-200 shadow-2xl shadow-black/90 transition-all hover:border-cyan-500/60 hover:bg-neutral-800 hover:text-white hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing select-none group"
      >
        {/* Subtle status LED dot */}
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
        {/* AI Sparkles emblem in Cablecast cyan accent */}
        <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-neutral-300 transition-colors group-hover:text-cyan-300 group-hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
      </button>
    );
  }

  /* ── Open Panel State (Rough Matte Sandblasted Glass) ─────────────────────── */

  return (
    <div
      ref={panelRef}
      id="broadcaster-panel"
      role="dialog"
      aria-label="Broadcaster Assistant"
      aria-modal="false"
      className="fixed z-[75] bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 flex flex-col select-none rounded-[28px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      style={{
        ...getPanelStyle(),
        ...roughMatteGlassStyle,
        width: "min(370px, calc(100vw - 2rem))",
        height: "min(550px, calc(100vh - 7rem))",
      }}
    >
      {/* Microscopic Rough Matte Sandblasted Surface Grain */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.22] mix-blend-overlay z-10"
        style={{ backgroundImage: `url("${MATTE_GLASS_GRAIN_URL}")`, backgroundRepeat: "repeat" }}
      />

      {/* Specular Rough Glass Top Rim */}
      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/45 to-transparent pointer-events-none z-20" />

      {/* ── Header (Draggable handle to switch docked side) ──────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing relative z-20 border-b border-white/[0.08] bg-white/[0.03]"
        style={{ touchAction: "none" }}
        onPointerDown={handlePanelPointerDown}
        onPointerMove={handlePanelPointerMove}
        onPointerUp={handlePanelPointerUp}
        title="Drag to switch docked side"
      >
          {/* Identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.12] border border-white/25 text-neutral-100 shadow-sm">
              <Tv2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-white tracking-tight drop-shadow-sm truncate">
                  Broadcaster
                </span>
                <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
              </div>
              <p className="text-[10px] text-neutral-300/80 tracking-normal font-normal truncate">
                TV Schedule Control
              </p>
            </div>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* New Conversation / Reset */}
            <button
              type="button"
              title="Reset conversation"
              aria-label="New conversation"
              onClick={() => {
                triggerHaptic(8);
                setMessages([]);
                setError(null);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.20] text-neutral-200 hover:text-white transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Voice Readout Toggle */}
            <button
              type="button"
              title={voiceEnabled ? "Voice playback on" : "Voice playback off"}
              aria-label="Toggle voice readout"
              onClick={() => {
                triggerHaptic(8);
                setVoiceEnabled((prev) => !prev);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                voiceEnabled
                  ? "bg-violet-500/40 text-violet-100 border border-violet-300/50"
                  : "bg-white/[0.08] hover:bg-white/[0.20] text-neutral-200 hover:text-white"
              }`}
            >
              {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>

            {/* Minimize */}
            <button
              type="button"
              title="Minimize"
              aria-label="Minimize Broadcaster"
              onClick={() => {
                triggerHaptic(8);
                setSize("minimized");
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.20] text-neutral-200 hover:text-white transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </button>

            {/* Close */}
            <button
              type="button"
              title="Close"
              aria-label="Close Broadcaster"
              onClick={() => {
                triggerHaptic(10);
                setSize("minimized");
                if (typeof window !== "undefined" && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] hover:bg-red-500/30 text-neutral-200 hover:text-red-200 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ─────────────────────────────────────────────── */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3.5 relative z-20 max-w-full"
          style={{
            touchAction: "pan-y",
            scrollbarWidth: "none",
          }}
        >
          {/* Welcome Screen */}
          {messages.length === 0 && (
            <div className="space-y-4 pt-1 animate-in fade-in duration-300">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold tracking-wider text-violet-200/90 uppercase font-mono">
                  Broadcast Programmer & Co-Pilot
                </p>
                <h3 className="text-xl font-bold text-white tracking-tight drop-shadow-sm">
                  What are we airing today?
                </h3>
                <p className="text-[12px] text-neutral-200/90 leading-relaxed">
                  Line up appointments, pace out a season, or talk cinema and TV history.
                </p>
              </div>

              {/* Quick Inspiration Cards */}
              <div className="space-y-2 pt-1">
                <p className="text-[10px] uppercase font-mono tracking-wider text-neutral-300 px-0.5">
                  Suggested inquiries
                </p>
                {INSPIRATION_CARDS.map((card, i) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => void sendMessage(card.prompt)}
                      className="w-full text-left rounded-2xl p-3 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] hover:border-white/25 transition-all flex items-start gap-3 group active:scale-[0.98] shadow-sm"
                    >
                      <div className="p-2 rounded-xl bg-white/[0.08] group-hover:bg-violet-500/30 text-white transition-colors mt-0.5 flex-shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white">
                          {card.title}
                        </p>
                        <p className="text-[11px] text-neutral-300/90 line-clamp-1 mt-0.5">
                          {card.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chat Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-full`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                  msg.role === "user"
                    ? "rounded-tr-sm text-white"
                    : "rounded-tl-sm text-neutral-100"
                }`}
                style={
                  msg.role === "user"
                    ? {
                        background:
                          "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(91,33,182,0.95))",
                        border: "1px solid rgba(255, 255, 255, 0.3)",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                      }
                    : {
                        background: "rgba(255, 255, 255, 0.12)",
                        border: "1px solid rgba(255, 255, 255, 0.18)",
                        backdropFilter: "blur(16px)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                      }
                }
              >
                {msg.text}
              </div>

              {/* Interactive Action Card */}
              {msg.action && (
                <div className="mt-2.5 w-full max-w-[88%] rounded-2xl bg-white/[0.08] border border-white/20 p-3 shadow-lg backdrop-blur-md space-y-2 animate-in fade-in duration-200">
                  {msg.action.type === "schedule" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold tracking-wide uppercase font-mono">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
                        <span>{msg.action.payload?.campaign ? "Season Campaign Locked In" : "Locked Into Broadcast Schedule"}</span>
                      </div>
                      <div className="text-[12.5px] text-white font-medium">
                        {msg.action.payload?.title}
                        {msg.action.payload?.campaign ? (
                          <span className="text-violet-200 ml-1.5 text-[11.5px]">
                            ({msg.action.payload.episodeCount} episodes mapped across calendar)
                          </span>
                        ) : msg.action.payload?.season && msg.action.payload?.episode ? (
                          <span className="text-violet-200 ml-1.5 text-[11.5px]">
                            (S{msg.action.payload.season} E{msg.action.payload.episode})
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-neutral-200 bg-white/[0.06] rounded-lg px-2.5 py-1.5 border border-white/10">
                        <Calendar className="h-3.5 w-3.5 text-violet-300" />
                        <span>
                          {msg.action.payload?.campaign
                            ? `${msg.action.payload?.firstDate} → ${msg.action.payload?.lastDate}`
                            : `${msg.action.payload?.dayName} • ${msg.action.payload?.timeLabel}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(12);
                          onNavigate?.("broadcast");
                        }}
                        className="w-full mt-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-[11.5px] transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                      >
                        <Tv2 className="h-3.5 w-3.5" />
                        <span>{msg.action.payload?.campaign ? "View in Broadcast Studio Calendar" : "View in Broadcast Studio"}</span>
                      </button>
                    </div>
                  )}

                  {msg.action.type === "navigate" && (
                    <div className="space-y-2">
                      <div className="text-[12px] text-neutral-200 font-medium">
                        Ready to open {msg.action.target === "broadcast" ? "Broadcast Studio" : msg.action.target === "library" ? "Tape Vault" : msg.action.target === "explore" ? "VHS Store" : "TV Guide"}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(12);
                          onNavigate?.(msg.action?.target as any);
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-[11.5px] transition-all flex items-center justify-center gap-2 active:scale-[0.98] border border-white/20"
                      >
                        {msg.action.target === "broadcast" && <Tv2 className="h-3.5 w-3.5" />}
                        {msg.action.target === "library" && <Film className="h-3.5 w-3.5" />}
                        {msg.action.target === "explore" && <Sparkles className="h-3.5 w-3.5" />}
                        {msg.action.target === "home" && <Tv2 className="h-3.5 w-3.5" />}
                        <span>
                          Open {msg.action.target === "broadcast" ? "Broadcast Studio" : msg.action.target === "library" ? "Tape Library" : msg.action.target === "explore" ? "VHS Store" : "TV Guide"}
                        </span>
                      </button>
                    </div>
                  )}

                  {msg.action.type === "rent_buy" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-semibold tracking-wide uppercase font-mono">
                        <Film className="h-3.5 w-3.5 text-amber-300" />
                        <span>VHS Store Tape Available</span>
                      </div>
                      <div className="text-[12.5px] text-white font-medium">
                        {msg.action.payload?.title || "Explore VHS Store"}
                      </div>
                      <p className="text-[11px] text-neutral-300 leading-snug">
                        Under the CD Rule, tape ownership or rental is required to put this on your broadcast schedule.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(12);
                          if (msg.action?.payload?.tmdbId && onOpenStoreModal) {
                            onOpenStoreModal({
                              id: msg.action.payload.tmdbId,
                              type: msg.action.payload.mediaType === "movie" ? "MOVIE" : "TV",
                              title: msg.action.payload.title,
                              initialAction: msg.action.payload.action || "RENT",
                            });
                          } else {
                            onNavigate?.("explore");
                          }
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-semibold text-[11.5px] transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Inspect in VHS Store</span>
                      </button>
                    </div>
                  )}

                  {msg.action.type === "tune_in" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold tracking-wide uppercase font-mono">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Live Broadcast Available</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(12);
                          onTuneIn?.({
                            tmdbId: msg.action?.payload?.tmdbId,
                            title: msg.action?.payload?.title,
                          });
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-[11.5px] transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Tune In Now</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Read Aloud Button */}
              {msg.role === "broadcaster" && (
                <div className="flex items-center gap-1.5 mt-1.5 ml-1">
                  <button
                    type="button"
                    onClick={() => speakText(msg.text, msg.id)}
                    title={speakingMessageId === msg.id ? "Stop voice" : "Listen aloud"}
                    className="flex items-center gap-1 text-[10px] text-neutral-300 hover:text-white transition-colors py-0.5 px-1.5 rounded-md hover:bg-white/10"
                  >
                    {speakingMessageId === msg.id ? (
                      <>
                        <Square className="h-2.5 w-2.5 fill-current text-violet-200" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-2.5 w-2.5 fill-current" />
                        <span>Listen</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Thinking / Loading Indicator */}
          {isLoading && (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/[0.10] border border-white/[0.18] backdrop-blur-md w-fit animate-in fade-in">
              <Loader2 className="h-3.5 w-3.5 text-violet-200 animate-spin" />
              <span className="text-[11px] text-neutral-200">
                Planning your broadcast…
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="text-[11.5px] text-red-200 py-2.5 px-3.5 rounded-2xl bg-red-950/70 border border-red-400/40 backdrop-blur-md break-words [overflow-wrap:anywhere] max-w-full">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Floating Scroll-to-Bottom Button ────────────────────────────── */}
        {showScrollBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            aria-label="Scroll to newest messages"
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-white/25 hover:bg-white/35 text-white backdrop-blur-md border border-white/30 shadow-lg transition-all animate-in fade-in active:scale-90"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}

        {/* ── Active Voice Listening Banner ───────────────────────────────── */}
        {isListening && (
          <div className="flex items-center justify-between px-4 py-2 bg-violet-900/80 border-t border-violet-400/40 backdrop-blur-md animate-pulse z-20">
            <div className="flex items-center gap-2 text-[11px] text-violet-100 font-medium">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              <span>Listening… speak your inquiry</span>
            </div>
            <button
              type="button"
              onClick={toggleListening}
              className="text-[10px] uppercase font-bold text-white px-2 py-0.5 rounded bg-violet-800/60 border border-white/20"
            >
              Done
            </button>
          </div>
        )}

        {/* ── Bottom Input Pill (Sandblasted Glass Capsule) ────────────────── */}
        <div className="p-3 border-t border-white/[0.08] bg-black/40 backdrop-blur-xl relative z-20">
          <div
            className="flex items-center gap-2 rounded-full pl-2 pr-2 py-1.5 transition-all duration-300 bg-white/[0.06] border border-white/[0.12] focus-within:border-violet-400/50 focus-within:bg-white/[0.09] focus-within:shadow-[0_0_20px_rgba(139,92,246,0.2)]"
          >
            {/* Mic Toggle Button */}
            <button
              type="button"
              id="broadcaster-mic-btn"
              title={isListening ? "Stop listening" : "Talk to Broadcaster"}
              aria-label="Voice input"
              onClick={toggleListening}
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
                isListening
                  ? "bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.7)] animate-pulse"
                  : "bg-white/[0.08] text-neutral-300 hover:text-white hover:bg-white/[0.16] border border-white/[0.06]"
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            {/* Input Field */}
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder={isListening ? "Listening…" : "Ask Broadcaster or tap mic…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isLoading}
              aria-label="Message Broadcaster"
              style={{
                outline: "none",
                boxShadow: "none",
                border: "none",
                WebkitTapHighlightColor: "transparent",
              }}
              className="flex-1 bg-transparent text-[13px] text-white placeholder-neutral-400 border-0 outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none disabled:opacity-50 min-w-0 font-normal px-1 selection:bg-violet-500/30"
            />

            {/* Circular Send Button */}
            <button
              type="button"
              id="broadcaster-send-btn"
              aria-label="Send message"
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isLoading}
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90 shadow-md ${
                input.trim() && !isLoading
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.45)] hover:brightness-110 cursor-pointer"
                  : "bg-white/[0.06] text-neutral-500 border border-white/[0.06] cursor-not-allowed opacity-40"
              }`}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
              ) : (
                <Send className={`h-3.5 w-3.5 translate-x-0.2 ${input.trim() ? "text-white fill-current/15" : "text-neutral-500"}`} />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }
