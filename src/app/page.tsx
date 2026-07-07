"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import guideData from "@/data/guide-data.json";

type Exercise = [string, string, string, string, string]; // name, sets, reps, rest, cue
type Day = { name: string; type: string; exercises: Exercise[] };
type Program = {
  id: string;
  label: string;
  data: { title: string; note: string; days: Day[] };
};
type Entry = {
  id: string;
  logged_by: string;
  entry_date: string;
  data: {
    exercise: string;
    day?: string;
    weight?: string;
    sets?: string;
    reps?: string;
    rir?: string;
    notes?: string;
  };
};
type SummaryRow = { entry_date: string; logged_by: string; n: number };
type GuideItem = { label: string; text: string; who?: string };
type GuideSection = { title: string; intro: string; items: GuideItem[]; accent: string };
type GuideTabData = { id: string; title: string; sections: GuideSection[] };
type FormRow = { weight: string; sets: string; reps: string; rir: string; notes: string };

const LIME = "#DBFF4A";
const CYAN = "#5AD7FF";
const TRAINEES = [
  { id: "male", name: "Chris", color: CYAN },
  { id: "female", name: "Maryam", color: LIME },
] as const;

const SETS_OPTS = Array.from({ length: 8 }, (_, i) => String(i + 1));
const REPS_OPTS = Array.from({ length: 30 }, (_, i) => String(i + 1));
const RIR_OPTS = ["0", "1", "2", "3", "4", "5"];
const EMPTY_ROW: FormRow = { weight: "", sets: "", reps: "", rir: "", notes: "" };

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function todayIso(): string {
  return iso(new Date());
}
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function niceDate(isoStr: string): string {
  const [y, m, dd] = isoStr.split("-").map(Number);
  return `${dd} ${MONTHS[m - 1].slice(0, 3)} ${y !== new Date().getFullYear() ? y : ""}`.trim();
}

export default function Home() {
  const [tab, setTab] = useState<"workout" | "history" | "guide" | "calendar">("workout");
  const [guideTab, setGuideTab] = useState("track");
  const [trainee, setTrainee] = useState<string>("male");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]); // selected trainee, newest first
  const [forms, setForms] = useState<Record<string, FormRow>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [justSaved, setJustSaved] = useState<Record<string, boolean>>({});
  const [weekSummary, setWeekSummary] = useState<SummaryRow[]>([]);

  // history tab
  const [historyExercise, setHistoryExercise] = useState("");

  // calendar tab
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [calSummary, setCalSummary] = useState<SummaryRow[]>([]);
  const [calSelected, setCalSelected] = useState<string>(todayIso());
  const [calEntries, setCalEntries] = useState<Entry[]>([]); // both trainees

  const today = todayIso();
  const weekStart = useMemo(() => mondayOf(new Date()), []);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => iso(addDays(weekStart, i))),
    [weekStart]
  );

  const loadEntries = useCallback(() => {
    fetch(`/api/entries?logged_by=${trainee}`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [trainee]);

  const loadWeekSummary = useCallback(() => {
    fetch(`/api/entries/summary?from=${weekDates[0]}&to=${weekDates[6]}`)
      .then((r) => r.json())
      .then(setWeekSummary)
      .catch(() => setWeekSummary([]));
  }, [weekDates]);

  useEffect(() => {
    const saved = window.localStorage.getItem("bw_trainee");
    if (saved === "male" || saved === "female") setTrainee(saved);
    fetch("/api/programs")
      .then((r) => r.json())
      .then(setPrograms)
      .catch(() => setPrograms([]));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("bw_trainee", trainee);
    setDayIdx(0);
    setForms({});
    setJustSaved({});
    setHistoryExercise("");
    loadEntries();
  }, [trainee, loadEntries]);

  useEffect(() => {
    loadWeekSummary();
  }, [loadWeekSummary]);

  // calendar data
  useEffect(() => {
    if (tab !== "calendar") return;
    const from = iso(calMonth);
    const to = iso(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
    fetch(`/api/entries/summary?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setCalSummary)
      .catch(() => setCalSummary([]));
    fetch(`/api/entries`)
      .then((r) => r.json())
      .then(setCalEntries)
      .catch(() => setCalEntries([]));
  }, [tab, calMonth]);

  const program = useMemo(() => programs.find((p) => p.id === trainee), [programs, trainee]);
  const days = program?.data.days ?? [];
  const day = days[dayIdx];
  const traineeMeta = TRAINEES.find((t) => t.id === trainee)!;

  /** Most recent entry per exercise (entries come newest-first). */
  const prevByExercise = useMemo(() => {
    const map: Record<string, Entry> = {};
    for (const e of entries) {
      if (!map[e.data.exercise]) map[e.data.exercise] = e;
    }
    return map;
  }, [entries]);

  const loggedToday = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) if (e.entry_date === today) s.add(e.data.exercise);
    return s;
  }, [entries, today]);

  const allExerciseNames = useMemo(() => {
    const fromProgram = days.flatMap((d) => d.exercises.map((e) => e[0]));
    const fromEntries = entries.map((e) => e.data.exercise);
    return Array.from(new Set([...fromProgram, ...fromEntries])).sort();
  }, [days, entries]);

  const historyEntries = useMemo(
    () => (historyExercise ? entries.filter((e) => e.data.exercise === historyExercise) : entries),
    [entries, historyExercise]
  );

  function setForm(ex: string, patch: Partial<FormRow>) {
    setForms((f) => ({ ...f, [ex]: { ...(f[ex] ?? EMPTY_ROW), ...patch } }));
  }

  async function logExercise(exName: string) {
    const row = forms[exName] ?? EMPTY_ROW;
    setSaving((s) => ({ ...s, [exName]: true }));
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loggedBy: trainee,
        entryDate: today,
        data: {
          exercise: exName,
          day: day?.name ?? "",
          weight: row.weight,
          sets: row.sets,
          reps: row.reps,
          rir: row.rir,
          notes: row.notes,
        },
      }),
    });
    setSaving((s) => ({ ...s, [exName]: false }));
    if (res.ok) {
      setJustSaved((s) => ({ ...s, [exName]: true }));
      setForms((f) => ({ ...f, [exName]: EMPTY_ROW }));
      loadEntries();
      loadWeekSummary();
      setTimeout(() => setJustSaved((s) => ({ ...s, [exName]: false })), 2500);
    }
  }

  function prevLabel(exName: string): string | null {
    const p = prevByExercise[exName];
    if (!p) return null;
    const d = p.data;
    const bits = [
      d.weight ? `${d.weight} kg` : null,
      d.sets && d.reps ? `${d.sets}×${d.reps}` : d.reps ? `×${d.reps}` : null,
      d.rir ? `RIR ${d.rir}` : null,
    ].filter(Boolean);
    return bits.length ? `${bits.join(" · ")} — ${niceDate(p.entry_date)}` : `logged ${niceDate(p.entry_date)}`;
  }

  const weekDots = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of weekSummary) {
      (m[r.entry_date] ??= new Set()).add(r.logged_by);
    }
    return m;
  }, [weekSummary]);

  // ---- calendar helpers ----
  const calDots = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of calSummary) (m[r.entry_date] ??= new Set()).add(r.logged_by);
    return m;
  }, [calSummary]);

  const monthStats = useMemo(() => {
    const byPerson: Record<string, Set<string>> = { male: new Set(), female: new Set() };
    for (const r of calSummary) byPerson[r.logged_by]?.add(r.entry_date);
    return byPerson;
  }, [calSummary]);

  const calCells = useMemo(() => {
    const first = new Date(calMonth);
    const startOffset = (first.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    const cells: (string | null)[] = Array(startOffset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(iso(new Date(calMonth.getFullYear(), calMonth.getMonth(), d)));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calMonth]);

  const selectedDayEntries = useMemo(
    () => calEntries.filter((e) => e.entry_date === calSelected),
    [calEntries, calSelected]
  );

  const inputCls =
    "w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-[#DBFF4A]/60";
  const selectCls = inputCls + " appearance-none";

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-5">
      {/* header */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black uppercase italic tracking-tight">
          Body<span style={{ color: LIME }}>Workshop</span>
        </h1>
        <div className="flex rounded-full border border-zinc-800 bg-zinc-900 p-1">
          {TRAINEES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTrainee(t.id)}
              className="rounded-full px-4 py-1.5 text-sm font-bold transition"
              style={
                trainee === t.id
                  ? { background: t.color, color: "#0a0a0a" }
                  : { color: "#71717a" }
              }
            >
              {t.name}
            </button>
          ))}
        </div>
      </header>

      {/* week strip */}
      <div className="mb-6 grid grid-cols-7 gap-1.5">
        {weekDates.map((d, i) => {
          const isToday = d === today;
          const dots = weekDots[d];
          return (
            <div
              key={d}
              className={`flex flex-col items-center rounded-2xl border px-1 py-2 ${
                isToday ? "border-[#DBFF4A]/70 bg-zinc-900" : "border-zinc-800/70 bg-zinc-900/40"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase text-zinc-500">
                {WEEKDAYS[i]}
              </span>
              <span className={`text-sm font-bold ${isToday ? "text-white" : "text-zinc-400"}`}>
                {Number(d.slice(8))}
              </span>
              <span className="mt-1 flex h-1.5 gap-0.5">
                {TRAINEES.map((t) =>
                  dots?.has(t.id) ? (
                    <span
                      key={t.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: t.color }}
                    />
                  ) : null
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* ============ WORKOUT TAB ============ */}
      {tab === "workout" && (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            {program?.data.title ?? "Loading program…"}
          </p>

          {/* day cards */}
          <div className="-mx-4 mb-6 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {days.map((d, i) => {
              const [main, sub] = d.name.split("—").map((s) => s.trim());
              const active = i === dayIdx;
              return (
                <button
                  key={d.name}
                  onClick={() => setDayIdx(i)}
                  className={`min-w-[140px] shrink-0 rounded-2xl border p-3 text-left transition ${
                    active ? "bg-zinc-900" : "border-zinc-800/70 bg-zinc-900/40 hover:bg-zinc-900"
                  }`}
                  style={active ? { borderColor: LIME } : undefined}
                >
                  <span
                    className="block text-lg font-black uppercase italic leading-tight tracking-tight"
                    style={{ color: active ? LIME : "#e4e4e7" }}
                  >
                    {main}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-medium text-zinc-500">
                    {sub ?? ""}
                  </span>
                  <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    {d.exercises.length} exercises
                  </span>
                </button>
              );
            })}
          </div>

          {/* exercise cards */}
          <div className="space-y-4">
            {(day?.exercises ?? []).map((ex) => {
              const [name, sets, reps, rest, cue] = ex;
              const row = forms[name] ?? EMPTY_ROW;
              const prev = prevLabel(name);
              const done = loggedToday.has(name);
              const saved = justSaved[name];
              return (
                <section
                  key={name}
                  className={`rounded-3xl border p-4 ${
                    done ? "border-[#DBFF4A]/40 bg-zinc-900/70" : "border-zinc-800 bg-zinc-900/50"
                  }`}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="text-base font-extrabold uppercase leading-snug tracking-tight">
                      {name}
                    </h3>
                    {done && (
                      <span
                        className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase"
                        style={{ background: LIME, color: "#0a0a0a" }}
                      >
                        Logged today
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-zinc-400">
                    {sets} sets × {reps} · rest {rest}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{cue}</p>

                  <p className="mt-3 text-[11px] font-bold uppercase tracking-wider">
                    <span className="text-zinc-500">Last time: </span>
                    <span style={{ color: prev ? traineeMeta.color : "#52525b" }}>
                      {prev ?? "not logged yet"}
                    </span>
                  </p>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <label className="col-span-1 block">
                      <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">
                        Weight
                      </span>
                      <input
                        value={row.weight}
                        onChange={(e) => setForm(name, { weight: e.target.value })}
                        inputMode="decimal"
                        placeholder="kg"
                        className={inputCls}
                      />
                    </label>
                    <label className="col-span-1 block">
                      <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">
                        Sets
                      </span>
                      <select
                        value={row.sets}
                        onChange={(e) => setForm(name, { sets: e.target.value })}
                        className={selectCls}
                      >
                        <option value="">–</option>
                        {SETS_OPTS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-1 block">
                      <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">
                        Reps
                      </span>
                      <select
                        value={row.reps}
                        onChange={(e) => setForm(name, { reps: e.target.value })}
                        className={selectCls}
                      >
                        <option value="">–</option>
                        {REPS_OPTS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-1 block">
                      <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">
                        RIR
                      </span>
                      <select
                        value={row.rir}
                        onChange={(e) => setForm(name, { rir: e.target.value })}
                        className={selectCls}
                      >
                        <option value="">–</option>
                        {RIR_OPTS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <input
                      value={row.notes}
                      onChange={(e) => setForm(name, { notes: e.target.value })}
                      placeholder="Notes…"
                      className={inputCls + " flex-1"}
                    />
                    <button
                      onClick={() => logExercise(name)}
                      disabled={saving[name] || !row.weight}
                      className="shrink-0 rounded-xl px-5 text-sm font-black uppercase tracking-wide transition disabled:opacity-40"
                      style={{ background: saved ? "#22c55e" : LIME, color: "#0a0a0a" }}
                    >
                      {saving[name] ? "…" : saved ? "✓" : "Log"}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* ============ HISTORY TAB ============ */}
      {tab === "history" && (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black uppercase italic tracking-tight">
              {traineeMeta.name}&apos;s History
            </h2>
          </div>
          <select
            value={historyExercise}
            onChange={(e) => setHistoryExercise(e.target.value)}
            className={selectCls + " mb-4"}
          >
            <option value="">All exercises</option>
            {allExerciseNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          {historyEntries.length === 0 ? (
            <p className="text-sm text-zinc-500">No entries yet.</p>
          ) : (
            <div className="space-y-2.5">
              {historyEntries.map((en) => (
                <div
                  key={en.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-extrabold uppercase tracking-tight">
                      {en.data.exercise}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-zinc-500">
                      {niceDate(en.entry_date)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold">
                    {en.data.weight && (
                      <span style={{ color: traineeMeta.color }}>{en.data.weight} kg</span>
                    )}
                    {(en.data.sets || en.data.reps) && (
                      <span className="text-zinc-300">
                        {en.data.sets || "?"}×{en.data.reps || "?"}
                      </span>
                    )}
                    {en.data.rir && (
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                        RIR {en.data.rir}
                      </span>
                    )}
                  </div>
                  {en.data.notes && (
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{en.data.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ GUIDE TAB ============ */}
      {tab === "guide" && (
        <>
          <h2 className="text-xl font-black uppercase italic tracking-tight">Guide</h2>
          <p className="mb-4 mt-0.5 text-xs text-zinc-500">
            {(guideData as { subtitle: string }).subtitle}
          </p>

          <div className="mb-5 flex rounded-full border border-zinc-800 bg-zinc-900 p-1">
            {(guideData.tabs as GuideTabData[]).map((g) => (
              <button
                key={g.id}
                onClick={() => setGuideTab(g.id)}
                className="flex-1 rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide transition"
                style={
                  guideTab === g.id
                    ? { background: LIME, color: "#0a0a0a" }
                    : { color: "#71717a" }
                }
              >
                {g.title}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {(guideData.tabs as GuideTabData[])
              .find((g) => g.id === guideTab)
              ?.sections.map((s, si) =>
                s.title === "Sources" ? (
                  <p key={si} className="text-[11px] leading-relaxed text-zinc-600">
                    {s.intro}
                  </p>
                ) : (
                  <section
                    key={si}
                    className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-4"
                    style={
                      s.accent === "pink"
                        ? { borderColor: "rgba(219,255,74,.35)" }
                        : undefined
                    }
                  >
                    <h3
                      className="text-sm font-extrabold uppercase tracking-tight"
                      style={{ color: s.accent === "pink" ? LIME : "#f4f4f5" }}
                    >
                      {s.title}
                    </h3>
                    {s.intro && (
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{s.intro}</p>
                    )}
                    {s.items.length > 0 && (
                      <div className="mt-3 space-y-3">
                        {s.items.map((it, ii) => (
                          <div
                            key={ii}
                            className="border-l-2 pl-3"
                            style={{
                              borderColor: it.who
                                ? it.who === "female"
                                  ? LIME
                                  : CYAN
                                : "#3f3f46",
                            }}
                          >
                            <p
                              className="text-xs font-bold"
                              style={{
                                color: it.who
                                  ? it.who === "female"
                                    ? LIME
                                    : CYAN
                                  : "#e4e4e7",
                              }}
                            >
                              {it.label}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                              {it.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )
              )}
          </div>
        </>
      )}

      {/* ============ CALENDAR TAB ============ */}
      {tab === "calendar" && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black uppercase italic tracking-tight">
              {MONTHS[calMonth.getMonth()]}{" "}
              <span className="text-zinc-500">{calMonth.getFullYear()}</span>
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                }
                className="h-9 w-9 rounded-full border border-zinc-800 bg-zinc-900 font-bold text-zinc-300"
              >
                ‹
              </button>
              <button
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                }
                className="h-9 w-9 rounded-full border border-zinc-800 bg-zinc-900 font-bold text-zinc-300"
              >
                ›
              </button>
            </div>
          </div>

          {/* month stats for both */}
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            {TRAINEES.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 text-center"
              >
                <span className="block text-2xl font-black" style={{ color: t.color }}>
                  {monthStats[t.id]?.size ?? 0}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  {t.name} · workout days
                </span>
              </div>
            ))}
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <span
                key={w}
                className="text-center text-[10px] font-bold uppercase text-zinc-600"
              >
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calCells.map((d, i) =>
              d === null ? (
                <span key={`x${i}`} />
              ) : (
                <button
                  key={d}
                  onClick={() => setCalSelected(d)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-bold transition ${
                    calSelected === d
                      ? "bg-zinc-800"
                      : d === today
                        ? "border-zinc-600 bg-zinc-900/60"
                        : "border-zinc-800/60 bg-zinc-900/30"
                  }`}
                  style={calSelected === d ? { borderColor: LIME } : undefined}
                >
                  <span className={d === today ? "text-white" : "text-zinc-400"}>
                    {Number(d.slice(8))}
                  </span>
                  <span className="mt-0.5 flex h-1.5 gap-0.5">
                    {TRAINEES.map((t) =>
                      calDots[d]?.has(t.id) ? (
                        <span
                          key={t.id}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: t.color }}
                        />
                      ) : null
                    )}
                  </span>
                </button>
              )
            )}
          </div>

          {/* selected day detail — both trainees */}
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-zinc-300">
              {niceDate(calSelected)}
            </h3>
            {TRAINEES.map((t) => {
              const list = selectedDayEntries.filter((e) => e.logged_by === t.id);
              return (
                <div key={t.id} className="mb-3">
                  <p
                    className="mb-1.5 text-[11px] font-black uppercase tracking-wider"
                    style={{ color: t.color }}
                  >
                    {t.name} · {list.length} set{list.length === 1 ? "" : "s"}
                  </p>
                  {list.length === 0 ? (
                    <p className="text-xs text-zinc-600">Rest day.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {list.map((en) => (
                        <div
                          key={en.id}
                          className="flex items-baseline justify-between rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2"
                        >
                          <span className="text-xs font-bold">{en.data.exercise}</span>
                          <span className="text-xs font-semibold text-zinc-400">
                            {[
                              en.data.weight ? `${en.data.weight}kg` : null,
                              en.data.sets && en.data.reps
                                ? `${en.data.sets}×${en.data.reps}`
                                : null,
                              en.data.rir ? `RIR${en.data.rir}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl">
          {(
            [
              ["workout", "Workout", "M6.5 6.5h11m-11 11h11M4 9v6m16-6v6M2 10.5v3m20-3v3M9 4v16m6-16v16"],
              ["history", "History", "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"],
              ["guide", "Guide", "M12 6.25c-2-1.6-4.6-2-7-1.9v13.4c2.4-.1 5 .3 7 1.9 2-1.6 4.6-2 7-1.9V4.35c-2.4-.1-5 .3-7 1.9zm0 0v13.4"],
              ["calendar", "Calendar", "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"],
            ] as const
          ).map(([id, label, path]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5"
              style={{ color: tab === id ? LIME : "#52525b" }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d={path} />
              </svg>
              <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
