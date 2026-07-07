"use client";

import { useEffect, useMemo, useState } from "react";

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

const TRAINEES: { id: string; name: string }[] = [
  { id: "male", name: "Chris" },
  { id: "female", name: "Maryam" },
];

export default function Home() {
  const [tab, setTab] = useState<"log" | "history">("log");
  const [trainee, setTrainee] = useState("male");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [exercise, setExercise] = useState("");

  // form fields
  const [weight, setWeight] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // history
  const [entries, setEntries] = useState<Entry[]>([]);
  const [historyExercise, setHistoryExercise] = useState("");
  const [loadingEntries, setLoadingEntries] = useState(false);

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
    setExercise("");
    setHistoryExercise("");
  }, [trainee]);

  const program = useMemo(
    () => programs.find((p) => p.id === trainee),
    [programs, trainee]
  );
  const days = program?.data.days ?? [];
  const day = days[dayIdx];
  const exercises = day?.exercises ?? [];
  const selected = exercises.find((e) => e[0] === exercise);

  const allExerciseNames = useMemo(() => {
    const fromProgram = days.flatMap((d) => d.exercises.map((e) => e[0]));
    const fromEntries = entries.map((e) => e.data.exercise);
    return Array.from(new Set([...fromProgram, ...fromEntries])).sort();
  }, [days, entries]);

  useEffect(() => {
    if (tab !== "history") return;
    setLoadingEntries(true);
    const params = new URLSearchParams({ logged_by: trainee });
    if (historyExercise) params.set("exercise", historyExercise);
    fetch(`/api/entries?${params}`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false));
  }, [tab, trainee, historyExercise]);

  async function logSet(e: React.FormEvent) {
    e.preventDefault();
    if (!exercise) return;
    setSaving(true);
    setSavedMsg("");
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loggedBy: trainee,
        entryDate: date,
        data: {
          exercise,
          day: day?.name ?? "",
          weight,
          sets,
          reps,
          rir,
          notes,
        },
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedMsg(`Logged ${exercise} ✓`);
      setWeight("");
      setSets("");
      setReps("");
      setRir("");
      setNotes("");
      setTimeout(() => setSavedMsg(""), 3000);
    } else {
      setSavedMsg("Failed to save — try again.");
    }
  }

  const traineeName = TRAINEES.find((t) => t.id === trainee)?.name;

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          Body Workshop{" "}
          <span className="text-sm font-normal text-zinc-400">
            {program?.data.title ?? ""}
          </span>
        </h1>
        <div className="flex rounded-full border border-zinc-700 p-1">
          {TRAINEES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTrainee(t.id)}
              className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                trainee === t.id
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </header>

      <nav className="mb-6 flex gap-2 border-b border-zinc-800">
        {(["log", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-semibold capitalize ${
              tab === t
                ? "border-emerald-500 text-white"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "log" && (
        <form onSubmit={logSet} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-400">Day</span>
              <select
                value={dayIdx}
                onChange={(e) => {
                  setDayIdx(Number(e.target.value));
                  setExercise("");
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
              >
                {days.map((d, i) => (
                  <option key={d.name} value={i}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-400">Exercise</span>
              <select
                value={exercise}
                onChange={(e) => setExercise(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
              >
                <option value="">Pick an exercise…</option>
                {exercises.map((ex) => (
                  <option key={ex[0]} value={ex[0]}>
                    {ex[0]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <p className="text-zinc-300">
                Target: {selected[1]} × {selected[2]} · rest {selected[3]}
              </p>
              <p className="mt-1 text-zinc-500">{selected[4]}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {(
              [
                ["Weight (kg)", weight, setWeight],
                ["Sets", sets, setSets],
                ["Reps", reps, setReps],
                ["RIR", rir, setRir],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="block">
                <span className="mb-1 block text-sm text-zinc-400">{label}</span>
                <input
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
                />
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-400">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-400">Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Felt strong, added 2.5 kg…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!exercise || saving}
              className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : `Log set for ${traineeName}`}
            </button>
            {savedMsg && <span className="text-sm text-emerald-400">{savedMsg}</span>}
          </div>
        </form>
      )}

      {tab === "history" && (
        <div>
          <label className="mb-4 block sm:max-w-xs">
            <span className="mb-1 block text-sm text-zinc-400">
              Filter by exercise
            </span>
            <select
              value={historyExercise}
              onChange={(e) => setHistoryExercise(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
            >
              <option value="">All exercises</option>
              {allExerciseNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {loadingEntries ? (
            <p className="text-zinc-400">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-zinc-400">No entries yet for {traineeName}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Exercise</th>
                    <th className="py-2 pr-3">Weight</th>
                    <th className="py-2 pr-3">Sets</th>
                    <th className="py-2 pr-3">Reps</th>
                    <th className="py-2 pr-3">RIR</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((en) => (
                    <tr key={en.id} className="border-b border-zinc-900">
                      <td className="py-2 pr-3 whitespace-nowrap">{en.entry_date}</td>
                      <td className="py-2 pr-3">{en.data.exercise}</td>
                      <td className="py-2 pr-3">{en.data.weight || "—"}</td>
                      <td className="py-2 pr-3">{en.data.sets || "—"}</td>
                      <td className="py-2 pr-3">{en.data.reps || "—"}</td>
                      <td className="py-2 pr-3">{en.data.rir || "—"}</td>
                      <td className="py-2 text-zinc-400">{en.data.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
