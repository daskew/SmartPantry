'use client';

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, PlusCircle, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type PantryItem = {
  id: string;
  name: string;
  quantity: number;
  expiration_date: string; // YYYY-MM-DD
  location?: string;
  user_id?: string;
  created_at: string;
};

type ParsedInput = {
  name: string;
  quantity: number;
  expiration_date: string;
  location?: string;
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDisplayDate(iso: string) {
  // Handle YYYY-MM-DD format from Supabase
  const date = new Date(iso + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getExpirationMeta(expiration_date: string) {
  const today = startOfDay(new Date());
  const expiry = startOfDay(new Date(expiration_date + 'T00:00:00'));
  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Number.isNaN(diffDays)) {
    return { label: "Unknown", tone: "muted" as const };
  }

  if (diffDays < 0) {
    return { label: `Expired ${Math.abs(diffDays)}d ago`, tone: "danger" as const };
  }

  if (diffDays === 0) {
    return { label: "Expires today", tone: "warning" as const };
  }

  if (diffDays === 1) {
    return { label: "Expires tomorrow", tone: "warning" as const };
  }

  if (diffDays <= 7) {
    return { label: `In ${diffDays} days`, tone: "warning" as const };
  }

  return { label: `In ${diffDays} days`, tone: "safe" as const };
}

function parseNaturalLanguageInput(raw: string): ParsedInput | null {
  const input = raw.trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  const now = new Date();

  // Default quantity
  let quantity = 1;
  
  // Check for quantity at start: "3 avocados" or "2 yogurts"
  const qtyMatch = input.match(/^(\d+)\s+/);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10);
  }

  // Explicit ISO-like date: 2026-02-09
  const dateMatch = input.match(/(\d{4}-\d{2}-\d{2})/);
  let expiresAt: Date | null = null;

  if (dateMatch?.[1]) {
    const parsed = new Date(`${dateMatch[1]}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      expiresAt = parsed;
    }
  }

  // "in 3 days", "in two months", etc.
  if (!expiresAt) {
    const quantityWordToNumber: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
    };

    const relMatch = lower.match(
      /in\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months)\b/,
    );

    const qtyRaw = relMatch?.[1];
    const unit = relMatch?.[2];

    if (qtyRaw && unit) {
      const numeric =
        qtyRaw in quantityWordToNumber
          ? quantityWordToNumber[qtyRaw]
          : Number.parseInt(qtyRaw, 10);

      if (!Number.isNaN(numeric) && numeric > 0) {
        if (unit.startsWith("day")) {
          expiresAt = addDays(now, numeric);
        } else if (unit.startsWith("week")) {
          expiresAt = addWeeks(now, numeric);
        } else if (unit.startsWith("month")) {
          expiresAt = addMonths(now, numeric);
        }
      }
    }
  }

  if (!expiresAt && lower.includes("tomorrow")) {
    expiresAt = addDays(now, 1);
  }

  if (!expiresAt && lower.includes("today")) {
    expiresAt = now;
  }

  const hasExpiryLanguage = /expires?|exp\.?|use[-\s]?by|best[-\s]?by/.test(lower);

  // If the user clearly talks about expiration/best-by but we couldn't
  // understand the timing, surface an error instead of guessing.
  if (!expiresAt && hasExpiryLanguage) {
    return null;
  }

  // Default to a one-week horizon only when no expiry wording is present.
  if (!expiresAt && !hasExpiryLanguage) {
    expiresAt = addDays(now, 7);
  }

  // Derive a clean item name, without any of the date / expiry wording
  // that we used to compute the expiration.
  let cutoffIndex: number | null = null;

  if (dateMatch && typeof dateMatch.index === "number") {
    cutoffIndex = dateMatch.index;
  }

  const relativePattern =
    /in\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months)\b/;
  const relativeIndex = lower.search(relativePattern);
  if (relativeIndex !== -1 && (cutoffIndex === null || relativeIndex < cutoffIndex)) {
    cutoffIndex = relativeIndex;
  }

  const connectorExpiryPattern =
    /\b(?:that|which)\s+(?:expires?|exp\.?|use[-\s]?by|best[-\s]?by)\b/;
  const connectorIndex = lower.search(connectorExpiryPattern);
  if (connectorIndex !== -1 && (cutoffIndex === null || connectorIndex < cutoffIndex)) {
    cutoffIndex = connectorIndex;
  }

  const expiryWordPattern = /\b(expires?|exp\.?|use[-\s]?by|best[-\s]?by)\b/;
  const expiryIndex = lower.search(expiryWordPattern);
  if (expiryIndex !== -1 && (cutoffIndex === null || expiryIndex < cutoffIndex)) {
    cutoffIndex = expiryIndex;
  }

  const todayTomorrowPattern = /\b(today|tomorrow)\b/;
  const todayTomorrowIndex = lower.search(todayTomorrowPattern);
  if (
    todayTomorrowIndex !== -1 &&
    (cutoffIndex === null || todayTomorrowIndex < cutoffIndex)
  ) {
    cutoffIndex = todayTomorrowIndex;
  }

  // Also cut out leading quantity
  if (qtyMatch && typeof qtyMatch.index === "number") {
    if (cutoffIndex === null || qtyMatch.index < cutoffIndex) {
      cutoffIndex = qtyMatch.index;
    }
  }

  let name = cutoffIndex !== null && cutoffIndex > 0 ? input.slice(0, cutoffIndex) : input;

  // Strip the date / hints out of the visible name
  if (dateMatch?.[1]) {
    name = name.replace(dateMatch[1], "");
  }

  name = name.replace(/expires?|exp\.?|use[-\s]?by|best[-\s]?by/gi, "");
  name = name.replace(
    /in\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months)\b/gi,
    "",
  );
  name = name.replace(/\b(today|tomorrow)\b/gi, "");
  name = name.replace(/\s+/g, " ").trim();

  // Extract a simple trailing location, e.g. "in the fridge", "in freezer", "on pantry shelf"
  let location: string | undefined;
  const locationMatch = name.match(
    /\b(?:in|on|at)\s+(?:the\s+)?([a-z0-9\s\-]+)$/i,
  );
  if (locationMatch && typeof locationMatch.index === "number") {
    location = locationMatch[1].trim();
    name = name.slice(0, locationMatch.index).trim();
  }

  if (!name) {
    name = "Pantry item";
  }

  // Format as YYYY-MM-DD for Supabase
  const expiration_date = startOfDay(expiresAt as Date).toISOString().split('T')[0];

  return {
    name,
    quantity,
    expiration_date,
    location,
  };
}

export default function Page() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [nlInput, setNlInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch from Supabase on mount
  useEffect(() => {
    async function fetchItems() {
      const { data, error } = await supabase
        .from('pantry')
        .select('*')
        .order('expiration_date', { ascending: true });
      
      if (error) {
        console.error('Error fetching items:', error);
      } else if (data) {
        setItems(data as PantryItem[]);
      }
      setLoading(false);
    }
    
    fetchItems();
  }, []);

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime(),
      ),
    [items],
  );

  function handleDeleteFromNaturalLanguage(raw: string): boolean {
    const text = raw.trim();
    if (!text) return false;

    const lower = text.toLowerCase();
    const deleteIndex = lower.indexOf("delete");
    const removeIndex = lower.indexOf("remove");

    let keywordIndex = -1;
    let keywordLength = 0;

    if (deleteIndex !== -1 && (removeIndex === -1 || deleteIndex < removeIndex)) {
      keywordIndex = deleteIndex;
      keywordLength = "delete".length;
    } else if (removeIndex !== -1) {
      keywordIndex = removeIndex;
      keywordLength = "remove".length;
    }

    if (keywordIndex === -1) return false;

    let phrase = text.slice(keywordIndex + keywordLength).trim();

    // Strip some common leading filler words
    phrase = phrase.replace(/^(the|this|that|item|the item|my)\s+/i, "");
    // Drop trailing punctuation
    phrase = phrase.replace(/[.!?]+$/, "").trim();

    const phraseLower = phrase.toLowerCase();
    if (!phraseLower) {
      setParseError('Tell me which item to delete, e.g. "delete the shaved steak".');
      return true;
    }

    const candidates = items.filter((item) => {
      const nameLower = item.name.toLowerCase();
      const locationLower = item.location?.toLowerCase() ?? "";

      const nameMatch =
        nameLower.includes(phraseLower) || phraseLower.includes(nameLower);
      const locationMatch =
        locationLower &&
        (phraseLower.includes(locationLower) || locationLower.includes(phraseLower));

      return nameMatch || locationMatch;
    });

    if (candidates.length === 0) {
      setParseError("I couldn't find an item that matches that description to delete.");
      return true;
    }

    // If multiple match, prefer the one expiring soonest.
    const itemToDelete = candidates.reduce((best, item) => {
      const bestTime = new Date(best.expiration_date).getTime();
      const currentTime = new Date(item.expiration_date).getTime();
      return currentTime < bestTime ? item : best;
    }, candidates[0]);

    setItems((current) => current.filter((item) => item.id !== itemToDelete.id));
    return true;
  }

  async function handleAddFromNaturalLanguage() {
    setParseError(null);

    const trimmed = nlInput.trim();
    if (!trimmed) return;

    const lower = trimmed.toLowerCase();
    if (/\b(delete|remove)\b/.test(lower)) {
      const handled = handleDeleteFromNaturalLanguage(trimmed);
      if (handled) {
        setNlInput("");
      }
      return;
    }

    const parsed = parseNaturalLanguageInput(trimmed);
    if (!parsed) {
      setParseError("I couldn't quite understand that. Try including the item and when it expires.");
      return;
    }

    // Add to Supabase
    const { data, error } = await supabase
      .from('pantry')
      .insert({
        name: parsed.name,
        quantity: parsed.quantity,
        expiration_date: parsed.expiration_date,
        location: parsed.location || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding item:', error);
      setParseError("Failed to add item. Please try again.");
      return;
    }

    if (data) {
      setItems((current) => [...current, data as PantryItem]);
    }
    setNlInput("");
  }

  async function handleDelete(id: string) {
    // Remove from Supabase
    const { error } = await supabase
      .from('pantry')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting item:', error);
      return;
    }

    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-5xl">
        <motion.section
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/10 px-6 py-7 shadow-[0_20px_80px_rgba(15,23,42,0.85)] backdrop-blur-2xl md:px-10 md:py-9"
        >
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute -left-20 -top-24 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-10 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
          </div>

          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100 shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Live · Smart Pantry
              </div>
              <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                High-end Smart Pantry
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-200/80 md:text-base">
                Ask in natural language, and keep a calm, always-ahead view of what&apos;s about to expire.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-200/70 md:text-sm">
              <div className="rounded-full border border-white/10 bg-slate-900/30 px-3 py-1.5 backdrop-blur">
                <span className="font-medium text-emerald-200">Today</span>{" "}
                <span className="text-slate-300/70">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Natural language input */}
          <div className="relative z-10 mt-7 grid gap-3 md:mt-8 md:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] md:items-start md:gap-4">
            <div className="group rounded-2xl border border-white/10 bg-slate-950/40 p-3.5 shadow-inner shadow-slate-900/70 backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Natural language
                </span>
                <span className="rounded-full bg-slate-800/70 px-2 py-0.5 text-[10px] font-medium text-slate-300/80">
                  Try: &quot;3 avocados, exp in 3 days&quot;
                </span>
              </div>
              <textarea
                value={nlInput}
                onChange={(event) => setNlInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (nlInput.trim()) {
                      handleAddFromNaturalLanguage();
                    }
                  }
                }}
                rows={3}
                spellCheck="false"
                placeholder='e.g. "2 yogurts exp 2026-03-01" or "bag of salad expires tomorrow"'
                className="min-h-[72px] w-full resize-none rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-400/80 focus:border-emerald-400/40 focus:bg-slate-900/30"
              />
              {parseError && (
                <p className="mt-2 text-xs text-rose-300/90">{parseError}</p>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3.5 text-xs text-emerald-50 shadow-inner shadow-emerald-900/50 backdrop-blur">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em]">
                <CalendarDays className="h-3.5 w-3.5" />
                Smart expiry hints
              </div>
              <ul className="mt-1 space-y-1.5 leading-relaxed text-emerald-50/90">
                <li>Understands simple phrases like &quot;in 3 days&quot;, &quot;tomorrow&quot;, or a YYYY-MM-DD date.</li>
                <li>If you don&apos;t mention timing, it gently assumes about a week from now.</li>
                <li>Items are saved to the cloud and sync across devices.</li>
              </ul>
              <motion.button
                type="button"
                onClick={handleAddFromNaturalLanguage}
                disabled={!nlInput.trim()}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: nlInput.trim() ? 1.01 : 1 }}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/40 bg-emerald-400/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-md shadow-emerald-900/50 transition disabled:cursor-not-allowed disabled:border-emerald-300/20 disabled:bg-emerald-400/40 disabled:text-emerald-950/60"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Add to pantry
              </motion.button>
            </div>
          </div>

          {/* Items list */}
          <div className="relative z-10 mt-7 rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-inner shadow-slate-900/80 backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-[11px] font-semibold text-slate-200">
                  {loading ? '...' : sortedItems.length}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    Expiration radar
                  </p>
                  <p className="text-xs text-slate-300/80">
                    Items are ordered with the most urgent at the top.
                  </p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-600/60 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-300/80">
                <p className="font-medium text-slate-100/90">Loading...</p>
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-600/60 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-300/80">
                <p className="font-medium text-slate-100/90">
                  No items yet.
                </p>
                <p className="max-w-xs text-[11px] text-slate-300/80">
                  Start by telling me what&apos;s in your fridge and roughly when it should be used.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                <AnimatePresence initial={false}>
                  {sortedItems.map((item) => {
                    const meta = getExpirationMeta(item.expiration_date);

                    const toneClasses =
                      meta.tone === "danger"
                        ? "border-rose-500/40 bg-rose-500/10"
                        : meta.tone === "warning"
                          ? "border-amber-400/40 bg-amber-400/10"
                          : meta.tone === "safe"
                            ? "border-emerald-400/40 bg-emerald-400/10"
                            : "border-slate-500/40 bg-slate-500/10";

                    const labelTextColor =
                      meta.tone === "danger"
                        ? "text-rose-50"
                        : meta.tone === "warning"
                          ? "text-amber-50"
                          : meta.tone === "safe"
                            ? "text-emerald-50"
                            : "text-slate-100";

                    return (
                      <motion.li
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-3.5 py-3 text-xs shadow-sm shadow-black/40 backdrop-blur"
                      >
                        <div className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-full bg-slate-800/80 ring-1 ring-slate-500/60 ring-offset-2 ring-offset-slate-950/80">
                          <div className="flex h-full w-full items-center justify-center">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-200" />
                          </div>
                        </div>

                        <div className="flex flex-1 flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-50">
                              {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="inline-flex items-center justify-center rounded-full border border-transparent bg-transparent p-1 text-slate-400 opacity-0 transition hover:border-rose-500/60 hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
                              aria-label={`Remove ${item.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300/90">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClasses} ${labelTextColor}`}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {meta.label}
                            </span>
                            <span className="text-slate-300/80">
                              Best by <span className="font-medium text-slate-50/90">{formatDisplayDate(item.expiration_date)}</span>
                            </span>
                            {item.location && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/60 bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-100/90">
                                <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
                                {item.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </motion.section>
      </main>
    </div>
  );
}
