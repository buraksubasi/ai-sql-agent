"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string[];
  isStreaming?: boolean;
};

type SseChunk = {
  type: "thinking" | "token" | "done" | "error";
  content?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId() {
  return crypto.randomUUID();
}

function createMessage(role: Message["role"], content: string): Message {
  return { id: makeId(), role, content };
}

/**
 * **bold** ve `code` sözdizimini React node'a çevirir.
 * Harici kütüphane gerektirmez.
 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code
          key={i}
          className="rounded bg-amber-100 px-1 font-mono text-[0.7rem] dark:bg-amber-900/40"
        >
          {part.slice(1, -1)}
        </code>
      );
    return <span key={i}>{part}</span>;
  });
}

// ─── ThinkingSection ──────────────────────────────────────────────────────────

function ThinkingSection({
  steps,
  isStreaming,
}: {
  steps: string[];
  isStreaming: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 text-xs dark:border-amber-800/40 dark:bg-amber-950/20">
      {/* Başlık */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-amber-700 transition hover:bg-amber-100/60 dark:text-amber-400 dark:hover:bg-amber-900/20"
      >
        <span className="text-sm">{isStreaming ? "⏳" : "🧠"}</span>
        <span className="flex-1 font-medium">
          Düşünme süreci
          {steps.length > 0 && (
            <span className="ml-1.5 font-normal text-amber-500 dark:text-amber-500">
              · {steps.length} adım
            </span>
          )}
        </span>

        {/* Streaming animasyonu */}
        {isStreaming && (
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" />
          </span>
        )}

        <span className="shrink-0 text-amber-400">{open ? "▲" : "▼"}</span>
      </button>

      {/* Adımlar */}
      {open && steps.length > 0 && (
        <ol className="border-t border-amber-200/70 px-3 py-2 dark:border-amber-800/30">
          {steps.map((step, i) => (
            <li
              key={i}
              className="flex gap-2 py-0.5 text-amber-800 dark:text-amber-300"
            >
              <span className="mt-0.5 shrink-0 text-amber-400">›</span>
              <span className="leading-relaxed">{renderInline(step)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  "Stokta 10'dan az kalan elektronik ürünleri listele",
  "Ürünleri listele",
  "Stokları listele",
];

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    createMessage(
      "assistant",
      "Merhaba! Veritabanınız hakkında doğal dilde soru sorabilirsiniz. Stok, satış veya ürün bilgilerini sorgulayabilirim , sohbet edebilir veya internet araması yapabilirim.",
    ),
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => makeId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Unmount'ta akışı iptal et
  useEffect(() => {
    return () => {
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setIsLoading(true);

    // Kullanıcı mesajını ekle
    setMessages((prev) => [...prev, createMessage("user", trimmed)]);

    // Boş asistan mesajı (streaming hedefi)
    const assistantId = makeId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        thinking: [],
        isStreaming: true,
      },
    ]);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, session_id: sessionId }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const chunk = JSON.parse(raw) as SseChunk;

            if (chunk.type === "thinking" && chunk.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, thinking: [...(m.thinking ?? []), chunk.content!] }
                    : m,
                ),
              );
            } else if (chunk.type === "token" && chunk.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + chunk.content }
                    : m,
                ),
              );
            } else if (chunk.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m,
                ),
              );
            } else if (chunk.type === "error" && chunk.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `Hata: ${chunk.content}`, isStreaming: false }
                    : m,
                ),
              );
            }
          } catch {
            // Hatalı JSON satırını atla
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Bir hata oluştu. Backend servisinin çalıştığından emin olun.",
                isStreaming: false,
              }
            : m,
        ),
      );
    } finally {
      readerRef.current = null;
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(input);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* ── Başlık ── */}
      <header className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white">
            SQL
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              AI SQL Agent
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Doğal dille sor, güvenli SQL ile yanıt al
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 py-4">
        {/* ── Mesajlar ── */}
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" ? (
                <div className="max-w-[88%]">
                  {/* Düşünme kutusu */}
                  {message.thinking && message.thinking.length > 0 && (
                    <ThinkingSection
                      steps={message.thinking}
                      isStreaming={message.isStreaming ?? false}
                    />
                  )}

                  {/* Yanıt balonu */}
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                    {message.content ? (
                      <>
                        <span className="whitespace-pre-wrap">{message.content}</span>
                        {message.isStreaming && (
                          <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-current align-middle" />
                        )}
                      </>
                    ) : message.isStreaming ? (
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl bg-emerald-600 px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-white">
                  {message.content}
                </div>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Örnek sorular ── */}
        {messages.length === 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void handleSubmit(prompt)}
                disabled={isLoading}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-left text-xs text-zinc-600 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* ── Giriş alanı ── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(input);
          }}
          className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Veritabanınıza bir soru sorun..."
            rows={2}
            disabled={isLoading}
            className="w-full resize-none bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Enter ile gönder · Shift+Enter ile yeni satır
            </span>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Gönder
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
