"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import guideData from "@/data/guide-data.json";
import variantsData from "@/data/exercise-variants.json";

/** name, sets, reps, rest, cue, and an optional superset tag shared by the block. */
type Exercise = [string, string, string, string, string, string?];
type Block = { ss: string | null; items: Exercise[] };
type Day = { name: string; type: string; exercises: Exercise[] };
type Program = {
  id: string;
  label: string;
  data: { title: string; note: string; days: Day[] };
};
type SetDetail = { weight: string; reps: string };
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
    setsDetail?: SetDetail[];
    base?: string;
  };
};
type SummaryRow = { entry_date: string; logged_by: string; n: number };
type Variant = { name: string; equipment: string; setup: string };
type GuideItem = { label: string; text: string; who?: string };
type GuideSection = { title: string; intro: string; items: GuideItem[]; accent: string };
type GuideTabData = { id: string; title: string; sections: GuideSection[] };

const LIME = "#DBFF4A";
const CYAN = "#5AD7FF";
const TRAINEES = [
  { id: "male", name: "Chris", color: CYAN },
  { id: "female", name: "Maryam", color: LIME },
] as const;

const REPS_OPTS = Array.from({ length: 30 }, (_, i) => String(i + 1));
const RIR_OPTS = ["0", "1", "2", "3", "4", "5"];

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const WEEKDAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Rolling training cycle: program-day index, or "recovery". */
const CYCLE: (number | "recovery")[] = [0, 1, "recovery", 2, 3];

const VMAP = variantsData as Record<string, { variants: Variant[] }>;
const VARIANT_TO_BASE: Record<string, string> = {};
for (const [base, v] of Object.entries(VMAP)) {
  VARIANT_TO_BASE[base] = base;
  for (const x of v.variants) VARIANT_TO_BASE[x.name] = base;
}
function baseOf(exName: string): string {
  return VARIANT_TO_BASE[exName] ?? exName;
}

/** Seconds to move between the halves of a superset — walk over, no real rest. */
const SUPERSET_SWITCH = 15;

/** Consecutive exercises sharing a superset tag become one block. */
function groupBlocks(exercises: Exercise[]): Block[] {
  const blocks: Block[] = [];
  for (const ex of exercises) {
    const ss = ex[5] ?? null;
    const last = blocks[blocks.length - 1];
    if (ss && last && last.ss === ss) last.items.push(ex);
    else blocks.push({ ss, items: [ex] });
  }
  return blocks;
}
const ssLetter = (i: number) => String.fromCharCode(65 + i);

/** "2–3 min" → 180, "90 sec" → 90, "3 min" → 180, "60 sec" → 60 */
function restSeconds(rest: string): number {
  const range = rest.match(/(\d+)\s*[–\-]\s*(\d+)\s*min/i);
  if (range) return Number(range[2]) * 60;
  const min = rest.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (min) return Number(min[1]) * 60;
  const sec = rest.match(/(\d+)\s*sec/i);
  if (sec) return Number(sec[1]);
  return 90;
}
function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1174].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.start(t);
      o.stop(t + 0.55);
    });
  } catch {
    /* audio unavailable */
  }
}

const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ?? "h-3.5 w-3.5"}
  >
    <path d={d} />
  </svg>
);
const ICON_SWAP = "M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4";
const ICON_CLOCK = "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";
const ICON_INFO = "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function todayIso(): string {
  return iso(new Date());
}
function fromIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
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
function diffDays(a: string, b: string): number {
  return Math.round((fromIso(a).getTime() - fromIso(b).getTime()) / 86400000);
}
function niceDate(isoStr: string): string {
  const [y, m, dd] = isoStr.split("-").map(Number);
  return `${dd} ${MONTHS[m - 1].slice(0, 3)}${y !== new Date().getFullYear() ? " " + y : ""}`;
}
function weekLabel(monday: Date): string {
  const sun = addDays(monday, 6);
  const m1 = MONTHS[monday.getMonth()].slice(0, 3);
  const m2 = MONTHS[sun.getMonth()].slice(0, 3);
  return m1 === m2
    ? `Mon ${monday.getDate()} – Sun ${sun.getDate()} ${m2}`
    : `Mon ${monday.getDate()} ${m1} – Sun ${sun.getDate()} ${m2}`;
}

function parseRepRange(reps: string): { lo: number; hi: number } | null {
  const m = reps.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  const single = reps.match(/^(\d+)/);
  if (single && !/s\b|sec/.test(reps)) return { lo: Number(single[1]), hi: Number(single[1]) };
  return null;
}
function isLowerBody(name: string): boolean {
  return /squat|deadlift|lunge|leg|hip|glute|calf|sumo|pull-through|thrust/i.test(name);
}
function loadIncrement(name: string): number {
  if (/db|dumbbell/i.test(name)) return 2;
  return isLowerBody(name) ? 5 : 2.5;
}
function entryTopWeight(e: Entry): number | null {
  const ws = (e.data.setsDetail ?? [])
    .map((s) => parseFloat(s.weight))
    .filter((n) => !isNaN(n));
  if (ws.length) return Math.max(...ws);
  const w = parseFloat(e.data.weight ?? "");
  return isNaN(w) ? null : w;
}
function entryMinReps(e: Entry): number | null {
  const rs = (e.data.setsDetail ?? [])
    .map((s) => parseInt(s.reps))
    .filter((n) => !isNaN(n));
  if (rs.length) return Math.min(...rs);
  const r = parseInt(e.data.reps ?? "");
  return isNaN(r) ? null : r;
}

/** Progressive-overload suggestion from the guide's decision tree. */
function suggestNext(
  ex: Exercise,
  prev: Entry | undefined
): { text: string; fill?: string } | null {
  if (!prev) return null;
  const w = entryTopWeight(prev);
  if (w == null) return null;
  const range = parseRepRange(ex[2]);
  const minReps = entryMinReps(prev);
  const rir = parseInt(prev.data.rir ?? "");
  if (range && minReps != null) {
    if (minReps >= range.hi && (isNaN(rir) || rir >= 1)) {
      const next = Math.round((w + loadIncrement(ex[0])) * 2) / 2;
      return {
        text: `Try ${next} kg — you hit the top of the range last time`,
        fill: String(next),
      };
    }
    if (minReps < range.lo) {
      const next = Math.round(w * 0.9 * 2) / 2;
      return {
        text: `Deload to ~${next} kg — missed the bottom of the range`,
        fill: String(next),
      };
    }
    return {
      text: `Keep ${w} kg — add reps toward ${range.hi}`,
      fill: String(w),
    };
  }
  return { text: `Repeat ${w} kg`, fill: String(w) };
}

export default function Home() {
  const [tab, setTab] = useState<"workout" | "history" | "guide" | "calendar">("workout");
  const [guideTab, setGuideTab] = useState("track");
  const [trainee, setTrainee] = useState<string>("male");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]); // selected trainee, newest first
  const [weekSummary, setWeekSummary] = useState<SummaryRow[]>([]);

  // live "today" — refreshed on focus/visibility/interval so the app never
  // sticks on the date it was opened
  const [today, setToday] = useState(() => todayIso());
  const [selectedDate, setSelectedDate] = useState(() => todayIso());
  const followToday = useRef(true);

  const [dayIdx, setDayIdx] = useState(0);
  const dayManual = useRef(false);

  // per-exercise form state: rows + rir + notes
  const [forms, setForms] = useState<
    Record<string, { rows: SetDetail[]; rir: string; notes: string }>
  >({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [resetting, setResetting] = useState(false);

  const [historyExercise, setHistoryExercise] = useState("");

  // exercise variant selection (remember last used, per trainee)
  const [variantSel, setVariantSel] = useState<Record<string, string>>({});
  function chooseVariant(base: string, variantName: string) {
    setVariantSel((v) => {
      const next = { ...v, [base]: variantName };
      try {
        window.localStorage.setItem(`bw_variants_${trainee}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // rest timer (one active at a time)
  const [timer, setTimer] = useState<{
    ex: string;
    total: number;
    endsAt: number;
    label: string;
  } | null>(null);
  const [, setTick] = useState(0);
  const timerDone = useRef(false);
  useEffect(() => {
    if (!timer) return;
    timerDone.current = false;
    const int = setInterval(() => {
      setTick((t) => t + 1);
      if (Date.now() >= timer.endsAt && !timerDone.current) {
        timerDone.current = true;
        chime();
        setTimeout(() => setTimer((cur) => (cur === timer ? null : cur)), 4000);
      }
    }, 250);
    return () => clearInterval(int);
  }, [timer]);
  function startTimer(ex: string, seconds: number, label = "Rest") {
    setTimer({ ex, total: seconds, endsAt: Date.now() + seconds * 1000, label });
  }

  // daily start screen
  const [showStart, setShowStart] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("bw_start_seen") !== todayIso()) setShowStart(true);
    } catch {}
  }, []);
  function dismissStart() {
    try {
      window.localStorage.setItem("bw_start_seen", today);
    } catch {}
    setShowStart(false);
    setTab("workout");
    pickDate(today);
  }

  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [calSummary, setCalSummary] = useState<SummaryRow[]>([]);
  const [calSelected, setCalSelected] = useState<string>(todayIso());
  const [calEntries, setCalEntries] = useState<Entry[]>([]);

  /* ---------- keep "today" fresh ---------- */
  useEffect(() => {
    const update = () => {
      const t = todayIso();
      setToday((prevToday) => {
        if (t !== prevToday && followToday.current) {
          setSelectedDate(t);
        }
        return t;
      });
    };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const int = setInterval(update, 60_000);
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      clearInterval(int);
    };
  }, []);

  function pickDate(d: string) {
    followToday.current = d === today;
    dayManual.current = false;
    setSelectedDate(d);
    setForms({});
  }

  /* ---------- week strip ---------- */
  const weekStart = useMemo(() => mondayOf(fromIso(selectedDate)), [selectedDate]);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => iso(addDays(weekStart, i))),
    [weekStart]
  );

  // guard against out-of-order responses when the trainee toggles quickly
  const traineeRef = useRef(trainee);
  traineeRef.current = trainee;

  const loadEntries = useCallback(() => {
    const who = trainee;
    fetch(`/api/entries?logged_by=${who}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (traineeRef.current === who && Array.isArray(data)) setEntries(data);
      })
      .catch(() => {
        if (traineeRef.current === who) setEntries([]);
      });
  }, [trainee]);

  const loadWeekSummary = useCallback(() => {
    fetch(`/api/entries/summary?from=${weekDates[0]}&to=${weekDates[6]}`)
      .then((r) => r.json())
      .then(setWeekSummary)
      .catch(() => setWeekSummary([]));
  }, [weekDates]);

  const booted = useRef(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("bw_trainee");
    if (saved === "male" || saved === "female") {
      traineeRef.current = saved; // invalidate any in-flight fetch for the default trainee
      setTrainee(saved);
    }
    booted.current = true;
    fetch("/api/programs")
      .then((r) => r.json())
      .then(setPrograms)
      .catch(() => setPrograms([]));
  }, []);

  useEffect(() => {
    if (!booted.current) return; // wait until the saved trainee is restored
    window.localStorage.setItem("bw_trainee", trainee);
    dayManual.current = false;
    setForms({});
    setHistoryExercise("");
    try {
      setVariantSel(JSON.parse(window.localStorage.getItem(`bw_variants_${trainee}`) ?? "{}"));
    } catch {
      setVariantSel({});
    }
    loadEntries();
  }, [trainee, loadEntries]);

  useEffect(() => {
    loadWeekSummary();
  }, [loadWeekSummary]);

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
  const traineeMeta = TRAINEES.find((t) => t.id === trainee)!;

  /* ---------- derived from entries ---------- */
  // most recent entry BEFORE the selected date, per exact variant name and per base exercise
  const prevByExercise = useMemo(() => {
    const map: Record<string, Entry> = {};
    for (const e of entries) {
      if (e.entry_date < selectedDate && !map[e.data.exercise]) map[e.data.exercise] = e;
    }
    return map;
  }, [entries, selectedDate]);
  const prevByBase = useMemo(() => {
    const map: Record<string, Entry> = {};
    for (const e of entries) {
      const b = baseOf(e.data.exercise);
      if (e.entry_date < selectedDate && !map[b]) map[b] = e;
    }
    return map;
  }, [entries, selectedDate]);

  const selectedDayEntriesMine = useMemo(
    () => entries.filter((e) => e.entry_date === selectedDate),
    [entries, selectedDate]
  );
  const loggedOnSelected = useMemo(() => {
    const s = new Set<string>();
    for (const e of selectedDayEntriesMine) s.add(baseOf(e.data.exercise));
    return s;
  }, [selectedDayEntriesMine]);

  /* ---------- adaptive rolling schedule ---------- */
  const dayIndexByName = useMemo(() => {
    const m: Record<string, number> = {};
    days.forEach((d, i) => (m[d.name] = i));
    return m;
  }, [days]);

  const adaptive = useMemo((): {
    kind: "workout" | "recovery" | "none";
    dayIdx?: number;
    reason: string;
  } => {
    if (!days.length) return { kind: "none", reason: "" };
    // If something is already logged on the selected date, that's the day.
    const loggedDay = selectedDayEntriesMine.find(
      (e) => e.data.day && dayIndexByName[e.data.day] != null
    );
    if (loggedDay) {
      return {
        kind: "workout",
        dayIdx: dayIndexByName[loggedDay.data.day!],
        reason: `Logged on ${niceDate(selectedDate)}`,
      };
    }
    // Latest logged workout before the selected date
    const last = entries.find(
      (e) => e.entry_date < selectedDate && e.data.day && dayIndexByName[e.data.day] != null
    );
    if (!last) {
      return { kind: "workout", dayIdx: 0, reason: "No previous workout — starting the cycle at Push A" };
    }
    const lastProgIdx = dayIndexByName[last.data.day!];
    let pos = CYCLE.findIndex((c) => c === lastProgIdx);
    if (pos === -1) pos = 0;
    let rem = diffDays(selectedDate, last.entry_date);
    let slot: number | "recovery" = CYCLE[pos];
    while (rem > 0) {
      pos = (pos + 1) % CYCLE.length;
      slot = CYCLE[pos];
      rem--;
      if (slot !== "recovery") break; // a lifting day waits until it's done
    }
    const lastName = days[lastProgIdx]?.name.split("—")[0].trim();
    if (slot === "recovery") {
      return {
        kind: "recovery",
        reason: `${lastName} logged ${niceDate(last.entry_date)} — recovery day in the cycle`,
      };
    }
    return {
      kind: "workout",
      dayIdx: slot,
      reason: `Follows ${lastName}, logged ${niceDate(last.entry_date)}`,
    };
  }, [entries, selectedDate, days, dayIndexByName, selectedDayEntriesMine]);

  // auto-select the adaptive day unless the user manually picked one
  useEffect(() => {
    if (!dayManual.current && adaptive.kind === "workout" && adaptive.dayIdx != null) {
      setDayIdx(adaptive.dayIdx);
    }
  }, [adaptive]);

  const day = days[dayIdx];

  /* ---------- form helpers (keyed by chosen variant name) ---------- */
  function formFor(key: string, nSets: number) {
    return (
      forms[key] ?? {
        rows: Array.from({ length: Math.max(1, nSets) }, () => ({ weight: "", reps: "" })),
        rir: "",
        notes: "",
      }
    );
  }
  function setRow(
    key: string,
    nSets: number,
    i: number,
    patch: Partial<SetDetail>,
    restSecs?: number,
    restLabel?: string
  ) {
    const f = formFor(key, nSets);
    const before = f.rows[i];
    const after = { ...before, ...patch };
    const rows = f.rows.map((r, j) => (j === i ? after : r));
    setForms((all) => ({ ...all, [key]: { ...f, rows } }));
    // auto-start the rest timer the moment a set becomes complete
    const wasComplete = !!(before.weight && before.reps);
    const isComplete = !!(after.weight && after.reps);
    if (!wasComplete && isComplete && restSecs) startTimer(key, restSecs, restLabel);
  }
  function setMeta(key: string, nSets: number, patch: Partial<{ rir: string; notes: string }>) {
    const f = formFor(key, nSets);
    setForms((all) => ({ ...all, [key]: { ...f, ...patch } }));
  }
  function prevSetFor(variantName: string, i: number): SetDetail | null {
    const p = prevByExercise[variantName];
    if (!p) return null;
    const det = p.data.setsDetail;
    if (det && det[i]) return det[i];
    if (p.data.weight || p.data.reps)
      return { weight: p.data.weight ?? "", reps: p.data.reps ?? "" };
    return null;
  }

  async function saveExercise(ex: Exercise, variantName: string) {
    const base = ex[0];
    const nSets = parseInt(ex[1]) || 3;
    const f = formFor(variantName, nSets);
    const filled = f.rows.filter((r) => r.weight || r.reps);
    if (!filled.length) return;
    setSaving((s) => ({ ...s, [variantName]: true }));
    const weights = filled.map((r) => parseFloat(r.weight)).filter((n) => !isNaN(n));
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loggedBy: trainee,
        entryDate: selectedDate,
        data: {
          exercise: variantName,
          base,
          day: day?.name ?? "",
          setsDetail: filled,
          weight: weights.length ? String(Math.max(...weights)) : "",
          sets: String(filled.length),
          reps: filled.map((r) => r.reps || "?").join("/"),
          rir: f.rir,
          notes: f.notes,
        },
      }),
    });
    setSaving((s) => ({ ...s, [variantName]: false }));
    if (res.ok) {
      setForms((all) => {
        const cp = { ...all };
        delete cp[variantName];
        return cp;
      });
      loadEntries();
      loadWeekSummary();
    }
  }

  async function resetDay() {
    if (
      !window.confirm(
        `Delete all of ${traineeMeta.name}'s logged sets on ${niceDate(selectedDate)}? This can't be undone.`
      )
    )
      return;
    setResetting(true);
    await fetch(`/api/entries?logged_by=${trainee}&date=${selectedDate}`, { method: "DELETE" });
    setResetting(false);
    setForms({});
    loadEntries();
    loadWeekSummary();
  }

  /* ---------- weekly blocks for history ---------- */
  const weeklyBlocks = useMemo(() => {
    const filtered = historyExercise
      ? entries.filter((e) => e.data.exercise === historyExercise)
      : entries;
    const byWeek = new Map<string, Entry[]>();
    for (const e of filtered) {
      const wk = iso(mondayOf(fromIso(e.entry_date)));
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk)!.push(e);
    }
    const weeks = Array.from(byWeek.keys()).sort().reverse();
    return weeks.map((wk, idx) => {
      const list = byWeek.get(wk)!;
      const prevList = byWeek.get(weeks[idx + 1] ?? "") ?? [];
      const dates = new Set(list.map((e) => e.entry_date));
      const dayTypes = Array.from(
        new Set(
          list
            .map((e) => e.data.day?.split("—")[0].trim())
            .filter((s): s is string => !!s)
        )
      );
      // progression vs previous week: compare top weight per exercise
      const topOf = (arr: Entry[]) => {
        const m: Record<string, number> = {};
        for (const e of arr) {
          const w = entryTopWeight(e);
          if (w != null) m[e.data.exercise] = Math.max(m[e.data.exercise] ?? 0, w);
        }
        return m;
      };
      const cur = topOf(list);
      const prev = topOf(prevList);
      const progressed: string[] = [];
      for (const exn of Object.keys(cur)) {
        if (prev[exn] != null && cur[exn] > prev[exn]) {
          progressed.push(`${exn.replace(/\s*\(.*\)/, "")} +${Math.round((cur[exn] - prev[exn]) * 10) / 10} kg`);
        }
      }
      let summary = `${dates.size} session${dates.size === 1 ? "" : "s"} · ${list.length} exercise log${list.length === 1 ? "" : "s"}`;
      if (dayTypes.length) summary += ` · ${dayTypes.join(", ")}`;
      let focus: string;
      if (!prevList.length) {
        focus = "Baseline week — these numbers are the reference to beat.";
      } else if (progressed.length) {
        focus = `Builds on last week: ${progressed.slice(0, 3).join(" · ")}${progressed.length > 3 ? " …" : ""}.`;
      } else {
        focus = "Consolidation week — same loads as last week; push reps toward the top of each range.";
      }
      return { weekStart: wk, list, summary, focus };
    });
  }, [entries, historyExercise]);

  const allExerciseNames = useMemo(() => {
    const fromProgram = days.flatMap((d) => d.exercises.map((e) => e[0]));
    const fromEntries = entries.map((e) => e.data.exercise);
    return Array.from(new Set([...fromProgram, ...fromEntries])).sort();
  }, [days, entries]);

  const weekDots = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of weekSummary) (m[r.entry_date] ??= new Set()).add(r.logged_by);
    return m;
  }, [weekSummary]);

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
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    const cells: (string | null)[] = Array(startOffset).fill(null);
    for (let d = 1; d <= daysInMonth; d++)
      cells.push(iso(new Date(calMonth.getFullYear(), calMonth.getMonth(), d)));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calMonth]);
  const calSelectedEntries = useMemo(
    () => calEntries.filter((e) => e.entry_date === calSelected),
    [calEntries, calSelected]
  );

  const inputCls =
    "w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-[#DBFF4A]/60";
  const selectCls = inputCls + " appearance-none";

  const selWeekday = WEEKDAYS_FULL[(fromIso(selectedDate).getDay() + 6) % 7];

  /** One exercise card. `ss` positions it inside a superset block. */
  const exerciseCard = (
    ex: Exercise,
    ss?: { pos: number; total: number; nextSets: number }
  ) => {
    const [name, sets, reps, rest, cue] = ex;
    const nSets = parseInt(sets) || 3;
    const restS = restSeconds(rest);
    const vlist: Variant[] = VMAP[name]?.variants ?? [
      { name, equipment: "", setup: cue },
    ];
    const chosen =
      variantSel[name] && vlist.some((v) => v.name === variantSel[name])
        ? variantSel[name]
        : vlist[0].name;
    const cv = vlist.find((v) => v.name === chosen)!;
    const f = formFor(chosen, nSets);
    const done = loggedOnSelected.has(name);
    const loggedEntry = selectedDayEntriesMine.find(
      (e) => baseOf(e.data.exercise) === name
    );
    const prevExact = prevByExercise[chosen];
    const prevFallback = !prevExact ? prevByBase[name] : undefined;
    const suggestion = suggestNext(ex, prevExact);
    const letter = ss ? ssLetter(ss.pos) : null;
    const nextLetter = ss && ss.pos < ss.total - 1 ? ssLetter(ss.pos + 1) : null;
    /**
     * A partner set only exists while the next move still has one. Blocks pair a
     * 3-set move with a 2-set move, so the last round takes the block's rest
     * rather than the 15s switch to a move that is already finished.
     */
    const gapFor = (i: number) =>
      nextLetter && i < (ss?.nextSets ?? 0)
        ? { secs: SUPERSET_SWITCH, label: `Go to ${nextLetter}` }
        : { secs: restS, label: "Rest" };
    const gap0 = gapFor(0);
    return (
      <section
        key={name}
        className={`rounded-3xl border p-4 ${
          done ? "border-[#DBFF4A]/40 bg-zinc-900/70" : "border-zinc-800 bg-zinc-900/50"
        }`}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-extrabold uppercase leading-snug tracking-tight">
            {letter && (
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-black"
                style={{ background: CYAN, color: "#0a0a0a" }}
              >
                {letter}
              </span>
            )}
            {chosen}
          </h3>
          {done && (
            <span
              className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase"
              style={{ background: LIME, color: "#0a0a0a" }}
            >
              Logged ✓
            </span>
          )}
        </div>

        {/* swap + equipment + rest timer row */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {vlist.length > 1 && (
            <label className="relative inline-flex items-center">
              <span
                className="pointer-events-none absolute left-2.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider"
                style={{ color: LIME }}
              >
                <Icon d={ICON_SWAP} className="h-3 w-3" />
                Swap
              </span>
              <select
                value={chosen}
                onChange={(e) => chooseVariant(name, e.target.value)}
                className="appearance-none rounded-full border border-zinc-700 bg-zinc-900 py-1.5 pl-16 pr-3 text-[11px] font-bold text-zinc-200 outline-none focus:border-[#DBFF4A]/60"
              >
                {vlist.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} · {v.equipment}
                  </option>
                ))}
              </select>
            </label>
          )}
          {cv.equipment && (
            <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
              {cv.equipment}
            </span>
          )}
          <button
            onClick={() => startTimer(chosen, gap0.secs, gap0.label)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-[#DBFF4A]/60"
            title={nextLetter ? `No rest — go straight to ${nextLetter}` : "Start rest timer"}
          >
            <Icon d={ICON_CLOCK} className="h-3 w-3" />
            {nextLetter ? gap0.label : `Rest ${rest}`}
          </button>
        </div>

        <p className="text-xs font-semibold text-zinc-400">
          {sets} sets × {reps}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{cue}</p>

        {/* setup mini-guide — follows the selected equipment */}
        <div className="mt-2 flex gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-2.5">
          <span className="mt-0.5 shrink-0 text-zinc-500">
            <Icon d={ICON_INFO} className="h-3.5 w-3.5" />
          </span>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            <span className="font-black uppercase tracking-wider text-zinc-500">
              Setup ·{" "}
            </span>
            {cv.setup}
          </p>
        </div>

        {prevFallback && !done && (
          <p className="mt-2 text-[11px] font-semibold text-zinc-500">
            Last time you did{" "}
            <span style={{ color: traineeMeta.color }}>
              {prevFallback.data.exercise}
            </span>{" "}
            here ({entryTopWeight(prevFallback) ?? "?"} kg,{" "}
            {niceDate(prevFallback.entry_date)}) — no log yet for this variation.
          </p>
        )}

        {suggestion && !done && (
          <button
            onClick={() => {
              if (suggestion.fill) {
                const rows = f.rows.map((r) =>
                  r.weight ? r : { ...r, weight: suggestion.fill! }
                );
                setForms((all) => ({ ...all, [chosen]: { ...f, rows } }));
              }
            }}
            className="mt-2 block w-full rounded-xl border border-dashed px-3 py-2 text-left text-[11px] font-bold"
            style={{ borderColor: "rgba(219,255,74,.4)", color: LIME }}
          >
            ▲ {suggestion.text}
            <span className="block text-[10px] font-medium text-zinc-500">
              tap to fill all sets
            </span>
          </button>
        )}

        {done && loggedEntry ? (
          <div className="mt-3 space-y-1">
            {(loggedEntry.data.setsDetail ?? []).map((s, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between rounded-lg bg-zinc-900 px-3 py-1.5 text-xs"
              >
                <span className="font-bold text-zinc-500">SET {i + 1}</span>
                <span className="font-bold text-zinc-200">
                  {s.weight || "—"} kg × {s.reps || "—"}
                </span>
              </div>
            ))}
            {!loggedEntry.data.setsDetail && (
              <p className="text-xs text-zinc-400">
                {loggedEntry.data.weight} kg · {loggedEntry.data.sets}×
                {loggedEntry.data.reps}
              </p>
            )}
            {loggedEntry.data.rir && (
              <p className="text-[11px] text-zinc-500">RIR {loggedEntry.data.rir}</p>
            )}
            {loggedEntry.data.notes && (
              <p className="text-[11px] text-zinc-500">{loggedEntry.data.notes}</p>
            )}
          </div>
        ) : (
          <>
            {/* per-set rows */}
            <div className="mt-3">
              <div className="mb-1 grid grid-cols-[44px_1fr_1fr_1fr] items-center gap-2 px-1 text-[10px] font-black uppercase tracking-wider text-zinc-600">
                <span>Set</span>
                <span>Previous</span>
                <span>Kg</span>
                <span>Reps</span>
              </div>
              <div className="space-y-1.5">
                {f.rows.map((row, i) => {
                  const prev = prevSetFor(chosen, i);
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[44px_1fr_1fr_1fr] items-center gap-2"
                    >
                      <span
                        className="text-center text-sm font-black"
                        style={{ color: row.weight || row.reps ? LIME : "#52525b" }}
                      >
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          prev &&
                          setRow(chosen, nSets, i, {
                            weight: prev.weight,
                            reps: /^\d+$/.test(prev.reps) ? prev.reps : "",
                          })
                        }
                        className="truncate rounded-lg bg-zinc-900 px-2 py-2 text-left text-[11px] font-semibold text-zinc-500 hover:text-zinc-300"
                      >
                        {prev ? `${prev.weight || "?"} kg × ${prev.reps || "?"}` : "—"}
                      </button>
                      <input
                        value={row.weight}
                        onChange={(e) =>
                          setRow(chosen, nSets, i, { weight: e.target.value }, gapFor(i).secs, gapFor(i).label)
                        }
                        inputMode="decimal"
                        placeholder={prev?.weight || "kg"}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-center text-sm font-bold outline-none focus:border-[#DBFF4A]/60"
                      />
                      <select
                        value={row.reps}
                        onChange={(e) =>
                          setRow(chosen, nSets, i, { reps: e.target.value }, gapFor(i).secs, gapFor(i).label)
                        }
                        className="appearance-none rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-center text-sm font-bold outline-none focus:border-[#DBFF4A]/60"
                      >
                        <option value="">–</option>
                        {REPS_OPTS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-[90px_1fr] gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">
                  RIR (last set)
                </span>
                <select
                  value={f.rir}
                  onChange={(e) => setMeta(chosen, nSets, { rir: e.target.value })}
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
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">
                  Notes
                </span>
                <input
                  value={f.notes}
                  onChange={(e) => setMeta(chosen, nSets, { notes: e.target.value })}
                  placeholder="Went up on set 2…"
                  className={inputCls}
                />
              </label>
            </div>

            <button
              onClick={() => saveExercise(ex, chosen)}
              disabled={saving[chosen] || !f.rows.some((r) => r.weight)}
              className="mt-3 w-full rounded-xl py-2.5 text-sm font-black uppercase tracking-wide transition disabled:opacity-40"
              style={{ background: LIME, color: "#0a0a0a" }}
            >
              {saving[chosen]
                ? "Saving…"
                : `Save ${f.rows.filter((r) => r.weight).length || ""} set${
                    f.rows.filter((r) => r.weight).length === 1 ? "" : "s"
                  } · ${traineeMeta.name}`}
            </button>
          </>
        )}
      </section>
    );
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-5">
      {/* ============ DAILY START SCREEN ============ */}
      {showStart && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black px-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">
            {WEEKDAYS_FULL[(fromIso(today).getDay() + 6) % 7]} · {niceDate(today)}
          </p>
          <h1 className="mt-2 text-4xl font-black uppercase italic tracking-tight">
            Body<span style={{ color: LIME }}>Workshop</span>
          </h1>

          <p className="mt-10 text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
            Who&apos;s training?
          </p>
          <div className="mt-3 flex gap-3">
            {TRAINEES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTrainee(t.id)}
                className="rounded-2xl border-2 px-8 py-3 text-lg font-black uppercase italic tracking-tight transition"
                style={
                  trainee === t.id
                    ? { borderColor: t.color, color: t.color, background: "rgba(255,255,255,.04)" }
                    : { borderColor: "#27272a", color: "#52525b" }
                }
              >
                {t.name}
              </button>
            ))}
          </div>

          <p className="mt-10 text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
            Today&apos;s session
          </p>
          {adaptive.kind === "recovery" ? (
            <p className="mt-2 text-center text-2xl font-black uppercase italic tracking-tight text-zinc-300">
              Active Recovery
              <span className="mt-1 block text-xs font-semibold normal-case not-italic text-zinc-500">
                {adaptive.reason} — or pick a lifting day below.
              </span>
            </p>
          ) : (
            <p className="mt-2 text-center text-3xl font-black uppercase italic tracking-tight" style={{ color: LIME }}>
              {day?.name.split("—")[0].trim() ?? "…"}
              <span className="mt-1 block text-xs font-semibold normal-case not-italic text-zinc-400">
                {day?.name.split("—")[1]?.trim() ?? ""} · {adaptive.reason}
              </span>
            </p>
          )}
          <select
            value={dayIdx}
            onChange={(e) => {
              dayManual.current = true;
              setDayIdx(Number(e.target.value));
            }}
            className="mt-4 appearance-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-center text-xs font-bold text-zinc-300 outline-none"
          >
            {days.map((d, i) => (
              <option key={d.name} value={i}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            onClick={dismissStart}
            className="mt-10 w-full max-w-sm rounded-full py-4 text-base font-black uppercase tracking-wide"
            style={{ background: LIME, color: "#0a0a0a" }}
          >
            Start Workout
          </button>
          <button
            onClick={dismissStart}
            className="mt-3 text-xs font-semibold text-zinc-600 underline-offset-2 hover:underline"
          >
            Just browsing
          </button>
        </div>
      )}

      {/* ============ FLOATING REST TIMER ============ */}
      {timer && (
        <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-2xl px-4">
          <div
            className="flex items-center gap-3 rounded-2xl border bg-zinc-950/95 p-3 backdrop-blur"
            style={{ borderColor: Date.now() >= timer.endsAt ? LIME : "#3f3f46" }}
          >
            <span style={{ color: LIME }}>
              <Icon d={ICON_CLOCK} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-black uppercase tracking-wider text-zinc-500">
                {timer.label} · {timer.ex}
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    background: LIME,
                    width: `${Math.max(0, Math.min(100, ((timer.endsAt - Date.now()) / (timer.total * 1000)) * 100))}%`,
                  }}
                />
              </div>
            </div>
            <span className="text-xl font-black tabular-nums" style={{ color: Date.now() >= timer.endsAt ? LIME : "#e4e4e7" }}>
              {Date.now() >= timer.endsAt
                ? "GO ✓"
                : fmtClock(Math.ceil((timer.endsAt - Date.now()) / 1000))}
            </span>
            <button
              onClick={() => setTimer(null)}
              className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-black uppercase text-zinc-400"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
                trainee === t.id ? { background: t.color, color: "#0a0a0a" } : { color: "#71717a" }
              }
            >
              {t.name}
            </button>
          ))}
        </div>
      </header>

      {/* week navigation + strip (tappable dates) */}
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => pickDate(iso(addDays(weekStart, -7)))}
          className="h-8 w-8 rounded-full border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-300"
          aria-label="Previous week"
        >
          ‹
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {weekLabel(weekStart)}
          </span>
          {selectedDate !== today && (
            <button
              onClick={() => pickDate(today)}
              className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase"
              style={{ background: LIME, color: "#0a0a0a" }}
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={() => pickDate(iso(addDays(weekStart, 7)))}
          className="h-8 w-8 rounded-full border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-300"
          aria-label="Next week"
        >
          ›
        </button>
      </div>
      <div className="mb-6 grid grid-cols-7 gap-1.5">
        {weekDates.map((d, i) => {
          const isToday = d === today;
          const isSel = d === selectedDate;
          const dots = weekDots[d];
          return (
            <button
              key={d}
              onClick={() => pickDate(d)}
              className={`flex flex-col items-center rounded-2xl border px-1 py-2 transition ${
                isSel ? "bg-zinc-800" : "bg-zinc-900/40 hover:bg-zinc-900"
              }`}
              style={{
                borderColor: isSel ? LIME : isToday ? "rgba(219,255,74,.4)" : "#27272a",
              }}
            >
              <span className="text-[10px] font-semibold uppercase text-zinc-500">
                {WEEKDAYS[i]}
              </span>
              <span className={`text-sm font-bold ${isSel || isToday ? "text-white" : "text-zinc-400"}`}>
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
            </button>
          );
        })}
      </div>

      {/* ============ WORKOUT TAB ============ */}
      {tab === "workout" && (
        <>
          {/* adaptive banner */}
          <div
            className="mb-4 rounded-3xl border p-4"
            style={{
              borderColor: adaptive.kind === "recovery" ? "#3f3f46" : "rgba(219,255,74,.45)",
              background:
                adaptive.kind === "recovery" ? "rgba(24,24,27,.5)" : "rgba(219,255,74,.06)",
            }}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              {selWeekday} · {niceDate(selectedDate)}
              {selectedDate === today ? " · Today" : ""}
            </p>
            {adaptive.kind === "recovery" ? (
              <>
                <p className="mt-1 text-lg font-black uppercase italic tracking-tight text-zinc-200">
                  Active Recovery
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {adaptive.reason}. Z2 cardio, walk, or mobility — or pick a day below to lift anyway.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-lg font-black uppercase italic tracking-tight" style={{ color: LIME }}>
                  {loggedOnSelected.size > 0 ? "" : "Up next: "}
                  {day?.name.split("—")[0].trim()}
                  <span className="ml-2 text-xs font-bold normal-case not-italic text-zinc-400">
                    {day?.name.split("—")[1]?.trim()}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{adaptive.reason}</p>
              </>
            )}
            {selectedDayEntriesMine.length > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold" style={{ color: traineeMeta.color }}>
                  {selectedDayEntriesMine.length} exercise
                  {selectedDayEntriesMine.length === 1 ? "" : "s"} logged this day ✓
                </span>
                <button
                  onClick={resetDay}
                  disabled={resetting}
                  className="rounded-full border border-red-900/60 bg-red-950/40 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-400 hover:bg-red-950/70 disabled:opacity-50"
                >
                  {resetting ? "Resetting…" : "Reset day"}
                </button>
              </div>
            )}
          </div>

          {/* day cards */}
          <div className="-mx-4 mb-6 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {days.map((d, i) => {
              const [main, sub] = d.name.split("—").map((s) => s.trim());
              const active = i === dayIdx && adaptive.kind !== "recovery";
              const nSuper = groupBlocks(d.exercises).filter((b) => b.ss).length;
              return (
                <button
                  key={d.name}
                  onClick={() => {
                    dayManual.current = true;
                    setDayIdx(i);
                  }}
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
                  <span className="mt-0.5 block text-[11px] font-medium text-zinc-500">{sub ?? ""}</span>
                  <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    {d.exercises.length} exercises
                    {nSuper > 0 && (
                      <span style={{ color: CYAN }}>
                        {" "}
                        · {nSuper} superset{nSuper === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* exercise cards with per-set rows */}
          <div className="space-y-4">
            {groupBlocks(day?.exercises ?? []).map((b) =>
              b.ss ? (
                <div
                  key={`ss-${day?.name}-${b.ss}`}
                  className="rounded-[28px] border border-dashed p-2.5"
                  style={{ borderColor: "rgba(90,215,255,.45)" }}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1.5 pt-0.5">
                    <span
                      className="text-[10px] font-black uppercase tracking-wider"
                      style={{ color: CYAN }}
                    >
                      Superset · {b.items.map((_, i) => ssLetter(i)).join(" + ")}
                    </span>
                    <span className="text-[10px] font-medium text-zinc-500">
                      alternate — rest only after {ssLetter(b.items.length - 1)}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {b.items.map((ex, i) =>
                      exerciseCard(ex, {
                        pos: i,
                        total: b.items.length,
                        nextSets: parseInt(b.items[i + 1]?.[1] ?? "") || 0,
                      })
                    )}
                  </div>
                </div>
              ) : (
                exerciseCard(b.items[0])
              )
            )}
          </div>
        </>
      )}

      {/* ============ HISTORY TAB (weekly blocks) ============ */}
      {tab === "history" && (
        <>
          <h2 className="mb-4 text-xl font-black uppercase italic tracking-tight">
            {traineeMeta.name}&apos;s Training Weeks
          </h2>
          <select
            value={historyExercise}
            onChange={(e) => setHistoryExercise(e.target.value)}
            className={selectCls + " mb-5"}
          >
            <option value="">All exercises</option>
            {allExerciseNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          {weeklyBlocks.length === 0 ? (
            <p className="text-sm text-zinc-500">No entries yet.</p>
          ) : (
            <div className="space-y-6">
              {weeklyBlocks.map((wk) => (
                <div key={wk.weekStart}>
                  <div className="mb-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <p className="text-sm font-black uppercase tracking-tight" style={{ color: LIME }}>
                      {weekLabel(fromIso(wk.weekStart))}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">{wk.summary}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{wk.focus}</p>
                  </div>
                  <div className="space-y-2">
                    {wk.list.map((en) => (
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
                          {en.data.setsDetail ? (
                            <span style={{ color: traineeMeta.color }}>
                              {en.data.setsDetail
                                .map((s) => `${s.weight || "?"}×${s.reps || "?"}`)
                                .join("  ·  ")}{" "}
                              kg
                            </span>
                          ) : (
                            <>
                              {en.data.weight && (
                                <span style={{ color: traineeMeta.color }}>{en.data.weight} kg</span>
                              )}
                              {(en.data.sets || en.data.reps) && (
                                <span className="text-zinc-300">
                                  {en.data.sets || "?"}×{en.data.reps || "?"}
                                </span>
                              )}
                            </>
                          )}
                          {en.data.rir && (
                            <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                              RIR {en.data.rir}
                            </span>
                          )}
                        </div>
                        {en.data.notes && (
                          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                            {en.data.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
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
            {[
              ...(guideData.tabs as GuideTabData[]).map((g) => ({ id: g.id, title: g.title })),
              { id: "swaps", title: "Swaps" },
            ].map((g) => (
              <button
                key={g.id}
                onClick={() => setGuideTab(g.id)}
                className="flex-1 rounded-full px-2 py-1.5 text-[11px] font-black uppercase tracking-wide transition"
                style={guideTab === g.id ? { background: LIME, color: "#0a0a0a" } : { color: "#71717a" }}
              >
                {g.title}
              </button>
            ))}
          </div>

          {guideTab === "swaps" && (
            <div className="space-y-4">
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-tight">
                  <span style={{ color: LIME }}>
                    <Icon d={ICON_SWAP} className="h-4 w-4" />
                  </span>
                  Equipment Swaps
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  Every exercise in the program can be swapped from the Workout tab when a machine
                  or bar is taken. Each alternative targets the same muscles with the same intent —
                  the log records exactly which variation was performed, and progress is tracked
                  per variation. Setup instructions change automatically with your selection.
                </p>
              </section>
              {Object.entries(VMAP).map(([base, v]) => (
                <section key={base} className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <h3 className="text-sm font-extrabold uppercase tracking-tight">{base}</h3>
                  <div className="mt-3 space-y-3">
                    {v.variants.map((it, ii) => (
                      <div key={ii} className="border-l-2 pl-3" style={{ borderColor: ii === 0 ? LIME : "#3f3f46" }}>
                        <p className="text-xs font-bold" style={{ color: ii === 0 ? LIME : "#e4e4e7" }}>
                          {it.name}
                          <span className="ml-2 rounded-full border border-zinc-700 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-500">
                            {it.equipment}
                          </span>
                          {ii === 0 && (
                            <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-zinc-500">
                              · program default
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{it.setup}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

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
                    style={s.accent === "pink" ? { borderColor: "rgba(219,255,74,.35)" } : undefined}
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
                              borderColor: it.who ? (it.who === "female" ? LIME : CYAN) : "#3f3f46",
                            }}
                          >
                            <p
                              className="text-xs font-bold"
                              style={{
                                color: it.who ? (it.who === "female" ? LIME : CYAN) : "#e4e4e7",
                              }}
                            >
                              {it.label}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{it.text}</p>
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
                onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                className="h-9 w-9 rounded-full border border-zinc-800 bg-zinc-900 font-bold text-zinc-300"
              >
                ‹
              </button>
              <button
                onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                className="h-9 w-9 rounded-full border border-zinc-800 bg-zinc-900 font-bold text-zinc-300"
              >
                ›
              </button>
            </div>
          </div>

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
              <span key={w} className="text-center text-[10px] font-bold uppercase text-zinc-600">
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

          <div className="mt-5">
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-zinc-300">
              {niceDate(calSelected)}
            </h3>
            {TRAINEES.map((t) => {
              const list = calSelectedEntries.filter((e) => e.logged_by === t.id);
              return (
                <div key={t.id} className="mb-3">
                  <p
                    className="mb-1.5 text-[11px] font-black uppercase tracking-wider"
                    style={{ color: t.color }}
                  >
                    {t.name} · {list.length} exercise{list.length === 1 ? "" : "s"}
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
                            {en.data.setsDetail
                              ? en.data.setsDetail
                                  .map((s) => `${s.weight || "?"}×${s.reps || "?"}`)
                                  .join(" · ")
                              : [
                                  en.data.weight ? `${en.data.weight}kg` : null,
                                  en.data.sets && en.data.reps
                                    ? `${en.data.sets}×${en.data.reps}`
                                    : null,
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
