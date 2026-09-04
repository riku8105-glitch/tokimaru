"use client";

import { useMemo, useState } from "react";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const initialDates = ["2026-08-20", "2026-08-22", "2026-08-26"];
const durationHours = Array.from({ length: 9 }, (_, hour) => hour);
const durationMinuteOptions = [0, 15, 30, 45];

export default function Home() {
  const [selectedDates, setSelectedDates] = useState<string[]>(initialDates);
  const [viewMonth, setViewMonth] = useState(new Date(2026, 7, 1));
  const [mode, setMode] = useState<"same" | "each">("same");
  const [title, setTitle] = useState("夏の打ち上げ");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [sameStart, setSameStart] = useState("17:00");
  const [sameEnd, setSameEnd] = useState("21:00");
  const [dayTimes, setDayTimes] = useState<Record<string, { start: string; end: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear(); const month = viewMonth.getMonth();
    return [...Array.from({ length: new Date(year, month, 1).getDay() }, () => null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)];
  }, [viewMonth]);

  function toggleDate(day: number) {
    const key = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDates((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key].sort());
  }

  async function createEvent() {
    setSaving(true); setError("");
    const windows = selectedDates.map((date) => {
      const times = mode === "same" ? { start: sameStart, end: sameEnd } : (dayTimes[date] ?? { start: "17:00", end: "21:00" });
      return { startsAt: `${date}T${times.start}:00+09:00`, endsAt: `${date}T${times.end}:00+09:00` };
    });
    try {
      const response = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, durationMinutes, windows }) });
      const data = await response.json() as { eventId?: string; error?: string };
      if (!response.ok || !data.eventId) throw new Error(data.error || "作成できませんでした。");
      window.location.href = `/e/${data.eventId}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "作成できませんでした。"); setSaving(false); }
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#">ときまる</a><span className="step-label">日程調整を作成</span></header>
    <section className="builder">
      <div className="intro"><p className="eyebrow">STEP 1</p><h1>予定を探す範囲を決める</h1><p>候補日と時間帯、必要な所要時間を指定してください。</p></div>
      <div className="builder-grid">
        <section className="calendar-card" aria-labelledby="calendar-heading">
          <div className="calendar-title"><button type="button" aria-label="前の月" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>‹</button><h2 id="calendar-heading">{viewMonth.getFullYear()}年{viewMonth.getMonth() + 1}月</h2><button type="button" aria-label="次の月" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>›</button></div>
          <div className="weekdays" aria-hidden="true">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
          <div className="calendar-grid">{calendarCells.map((day, index) => day === null ? <span key={`blank-${index}`} /> : <button className="date-button" type="button" key={day} aria-label={`${viewMonth.getMonth() + 1}月${day}日`} aria-pressed={selectedDates.includes(dateKey(viewMonth, day))} onClick={() => toggleDate(day)}>{day}</button>)}</div>
        </section>
        <section className="settings-card" aria-labelledby="settings-heading">
          <h2 id="settings-heading">予定の条件</h2>
          <label className="field"><span>予定の名前</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例：夏の打ち上げ" /></label>
          <div className="field"><span>所要時間</span><div className="duration-inputs"><label><span className="sr-only">所要時間の時間</span><select value={Math.floor(durationMinutes / 60)} onChange={(event) => { const hours = Number(event.target.value); const minutes = durationMinutes % 60; setDurationMinutes(hours * 60 + (hours === 0 && minutes === 0 ? 15 : minutes)); }}>{durationHours.map((hours) => <option key={hours} value={hours}>{hours}時間</option>)}</select></label><label><span className="sr-only">所要時間の分</span><select value={durationMinutes % 60} onChange={(event) => setDurationMinutes(Math.floor(durationMinutes / 60) * 60 + Number(event.target.value))}>{durationMinuteOptions.map((minutes) => <option key={minutes} value={minutes} disabled={durationMinutes < 60 && minutes === 0}>{minutes}分</option>)}</select></label></div><small>候補の開始時刻は15分刻みで計算します</small></div>
          <div className="field"><span>選択中の日程</span><div className="date-chips" aria-live="polite">{selectedDates.length ? selectedDates.map((date) => <span key={date}>{shortDate(date)}</span>) : <small>カレンダーから日付を選んでください</small>}</div></div>
          <fieldset><legend>時間帯の設定方法</legend><label className="radio-row"><input type="radio" name="time-mode" checked={mode === "same"} onChange={() => setMode("same")} /><span><strong>すべて同じ時間帯</strong><small>一度の指定ですべてに反映</small></span></label><label className="radio-row"><input type="radio" name="time-mode" checked={mode === "each"} onChange={() => setMode("each")} /><span><strong>日ごとに変える</strong><small>候補日ごとに時間帯を指定</small></span></label></fieldset>
          {mode === "same" ? <TimeRange label="すべての日程" start={sameStart} end={sameEnd} onChange={(start, end) => { setSameStart(start); setSameEnd(end); }} /> : <div className="per-day-times">{selectedDates.map((date) => { const value = dayTimes[date] ?? { start: "17:00", end: "21:00" }; return <TimeRange key={date} label={longDate(date)} start={value.start} end={value.end} onChange={(start, end) => setDayTimes((current) => ({ ...current, [date]: { start, end } }))} />; })}</div>}
        </section>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="page-actions"><p>{selectedDates.length}日を対象に、{mode === "same" ? `${sameStart}〜${sameEnd}の範囲で` : "日ごとの時間帯で"}{durationLabel(durationMinutes)}の日程調整を行います</p><button className="primary-action" type="button" onClick={createEvent} disabled={!title.trim() || !selectedDates.length || saving}>{saving ? "作成中…" : "調整ページを作る"}</button></footer>
    </section>
  </main>;
}

function TimeRange({ label, start, end, onChange }: { label: string; start: string; end: string; onChange: (start: string, end: string) => void }) { return <div className="time-range"><span>{label}</span><div><label><span className="sr-only">開始時刻</span><input type="time" min="07:00" max="23:00" step="900" value={start} onChange={(event) => onChange(snapToQuarter(event.target.value), end)} /></label><b>〜</b><label><span className="sr-only">終了時刻</span><input type="time" min="07:00" max="23:00" step="900" value={end} onChange={(event) => onChange(start, snapToQuarter(event.target.value))} /></label></div></div>; }
function dateKey(month: Date, day: number) { return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function timeLabel(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
function snapToQuarter(value: string) { if (!value) return value; const [hour, minute] = value.split(":").map(Number); return timeLabel(Math.min(23 * 60, hour * 60 + Math.round(minute / 15) * 15)); }
function durationLabel(minutes: number) { return minutes % 60 ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}時間` : ""}${minutes % 60}分` : `${minutes / 60}時間`; }
function shortDate(date: string) { return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(`${date}T00:00:00+09:00`)); }
function longDate(date: string) { return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00+09:00`)); }
