"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconConciergeFill24 } from "@/_components/ui/icons";
import { Button } from "@/_components/ui/button";
import { Icon } from "@/_components/ui/icon";
import { Input } from "@/_components/ui/input";
import { Typography } from "@/_components/ui/typography";
import { useAnthropicKey } from "@/_lib/use-anthropic-key";
import { cn } from "@/_lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Which of my listings should I tour first?",
  "Compare my favorites and pick a winner",
  "What are the biggest caveats in my shortlist?",
];

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Conversational AI mode: chat with Claude about the apartments already in the
 * dashboard (it reads them server-side) plus live web search. Works with a
 * server-configured ANTHROPIC_API_KEY, or a key the user pastes here — the
 * pasted key lives in localStorage only and is sent per-request.
 */
function AssistantPanel({ open, onClose }: AssistantPanelProps) {
  const { key: apiKey, setKey: setApiKey } = useAnthropicKey();
  const [hasServerKey, setHasServerKey] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || hasServerKey !== null) return;
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((d) => setHasServerKey(Boolean(d.hasServerKey)))
      .catch(() => setHasServerKey(false));
  }, [open, hasServerKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const needsKey = hasServerKey === false && !apiKey;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          messages: next,
        }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        setMessages([
          ...next,
          {
            role: "assistant",
            content: data?.error ?? `The assistant request failed (${response.status}).`,
          },
        ]);
        return;
      }
      // Stream the reply token-by-token into the last message.
      setMessages([...next, { role: "assistant", content: "" }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const snapshot = reply;
        setMessages([...next, { role: "assistant", content: snapshot }]);
      }
    } catch (error) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "The assistant failed.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed bottom-4 right-4 z-50 flex h-[min(600px,calc(100dvh-32px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] bg-card shadow-card-3"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", duration: 0.32, bounce: 0 }}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon glyph={IconConciergeFill24} size={18} />
              <Typography variant="h3" className="text-foreground">
                Assistant
              </Typography>
            </div>
            <Button variant="quiet" onClick={onClose} aria-label="Close assistant">
              Close
            </Button>
          </div>

          {needsKey ? (
            <div className="flex flex-col gap-2 border-b border-border bg-background px-4 py-3">
              <Typography variant="caption" className="text-muted-foreground">
                AI mode needs an Anthropic API key. Paste one below — it is stored
                only in this browser and sent with your requests. Everything else in
                Alcove works without it.
              </Typography>
              <Input
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          ) : null}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-2">
                <Typography variant="caption" className="text-muted-foreground">
                  Ask about the apartments you&apos;ve collected — comparisons,
                  caveats, what to tour, neighborhood questions (it can search the
                  web).
                </Typography>
                <div className="mt-1 flex flex-col items-start gap-1.5">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      disabled={busy || needsKey}
                      onClick={() => void send(starter)}
                      className="rounded-full border border-border px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-button-ghost-hover disabled:opacity-45"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((message, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13.5px] leading-relaxed",
                      message.role === "user"
                        ? "self-end bg-foreground text-background"
                        : "self-start bg-background text-foreground",
                    )}
                  >
                    {message.content ||
                      (busy && i === messages.length - 1 ? "…" : "")}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 border-t border-border px-3 py-3"
          >
            <Input
              placeholder={needsKey ? "Paste an API key above first" : "Ask anything…"}
              value={input}
              disabled={needsKey}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button type="submit" disabled={busy || needsKey || !input.trim()}>
              {busy ? "…" : "Send"}
            </Button>
          </form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export { AssistantPanel };
