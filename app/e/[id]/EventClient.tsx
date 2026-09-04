"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DayState = "full" | "custom" | "unavailable";
type WindowItem = { id: string; starts_at: string; ends_at: string };
type EventData = {
  event: { id: string; title: string; duration_minutes: number; step_minutes: number };
  windows: WindowItem[];
  responses: { id: string; name: string }[];
  responseDays: { id: string; response_id: string; window_id: string; state: DayState }[];
  ranges: { id: string; response_day_id: string; starts_at: string; ends_at: string }[];
};
type DraftDay = { state?: DayState; ranges: { start: string; end: string }[] };
type EditCredentials = { responseId: string; editToken: string };
type Candidate = { windowId: string; start: string; end: string; available: number; availableResponseIds: string[] };

export default function EventClient({ eventId }: { eventId: string }) {
  const [data, setData] = useState<EventData | null>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Record<string, DraftDay>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editCredentials, setEditCredentials] = useState<EditCredentials | null>(null);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/events/${eventId}`);
    const next = await response.json() as EventData & { error?: string };
    if (!response.ok) { setMessage(next.error || "読み込めませんでした。"); return; }
    setData(next);
    const stored = readEditCredentials(eventId);
    const ownResponse = stored ? next.responses.find((item) => item.id === stored.responseId) : undefined;
    if (stored && ownResponse) {
      setEditCredentials(stored); setName(ownResponse.name); setDraft(draftFromResponse(next, stored.responseId));
    } else {
      if (stored) localStorage.removeItem(editStorageKey(eventId));
      setEditCredentials(null); setDraft((current) => Object.keys(current).length ? current : defaultDraft(next.windows));
    }
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);

  const candidates = useMemo(() => data ? buildCandidates(data).slice(0, 12) : [], [data]);

  function chooseState(window: WindowItem, state: DayState) {
    setDraft((current) => ({ ...current, [window.id]: { state, ranges: state === "custom" ? (current[window.id]?.ranges?.length ? current[window.id].ranges : [{ start: formatTime(window.starts_at), end: formatTime(window.ends_at) }]) : [] } }));
  }

  function updateRange(windowId: string, index: number, key: "start" | "end", value: string) {
    setDraft((current) => ({ ...current, [windowId]: { ...current[windowId], ranges: current[windowId].ranges.map((range, rangeIndex) => rangeIndex === index ? { ...range, [key]: value } : range) } }));
  }

  function addRange(window: WindowItem) {
    const duration = data?.event.duration_minutes ?? 60;
    const ranges = draft[window.id]?.ranges ?? [];
    const gap = findGap(formatTime(window.starts_at), formatTime(window.ends_at), ranges, duration);
    if (!gap) { setMessage("所要時間以上の追加可能な空きがありません。"); return; }
    setMessage(""); setDraft((current) => ({ ...current, [window.id]: { state: "custom", ranges: [...current[window.id].ranges, gap].sort((a, b) => a.start.localeCompare(b.start)) } }));
  }

  function removeRange(windowId: string, index: number) {
    setDraft((current) => ({ ...current, [windowId]: { ...current[windowId], ranges: current[windowId].ranges.filter((_, rangeIndex) => rangeIndex !== index) } }));
  }

  async function submit() {
    if (!name.trim() || !data) { setMessage("名前を入力してください。"); return; }
    if (data.windows.some((window) => !draft[window.id]?.state)) { setMessage("すべての日程について回答してください。"); return; }
    const invalid = data.windows.some((window) => draft[window.id].state === "custom" && (!hasNoOverlap(draft[window.id].ranges) || !validRanges(window, mergeAdjacent(draft[window.id].ranges), data.event.duration_minutes)));
    if (invalid) { setMessage(`時間指定は範囲内で重ならないようにし、それぞれ${durationLabel(data.event.duration_minutes)}以上にしてください。`); return; }
    setSaving(true); setMessage("");
    const days = data.windows.map((window) => ({ windowId: window.id, state: draft[window.id].state, ranges: draft[window.id].state === "custom" ? mergeAdjacent(draft[window.id].ranges).map((range) => ({ startsAt: withTime(window.starts_at, range.start), endsAt: withTime(window.starts_at, range.end) })) : [] }));
    const method = editCredentials ? "PATCH" : "POST";
    const response = await fetch(`/api/events/${eventId}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ name, days, ...editCredentials }) });
    const result = await response.json() as { error?: string; responseId?: string; editToken?: string };
    if (!response.ok) { setMessage(result.error || "回答を保存できませんでした。"); setSaving(false); return; }
    if (!editCredentials && result.responseId && result.editToken) localStorage.setItem(editStorageKey(eventId), JSON.stringify({ responseId: result.responseId, editToken: result.editToken }));
    await load(); setSaving(false); setShowResults(true); setMessage(editCredentials ? "回答を更新しました。" : "回答を保存しました。");
  }

  async function copyLink() { await navigator.clipboard.writeText(window.location.href); setMessage("共有リンクをコピーしました。"); }
  if (!data) return <main className="state-page"><p>{message || "調整ページを読み込んでいます…"}</p></main>;

  return <main className="response-shell">
    <header className="topbar"><a className="brand" href="/">ときまる</a><button className="link-button" type="button" onClick={copyLink}>共有リンクをコピー</button></header>
    <section className="response-page">
      <div className="event-heading"><p className="eyebrow">日程調整</p><h1>{data.event.title}</h1><p>{durationLabel(data.event.duration_minutes)}の予定が入る時間を教えてください。</p></div>
      <div className="view-switch"><button type="button" aria-pressed={!showResults} onClick={() => setShowResults(false)}>回答する</button><button type="button" aria-pressed={showResults} onClick={() => setShowResults(true)}>候補を見る（{data.responses.length}人回答）</button></div>
      {!showResults ? <section className="answer-card">
        <div className="google-callout"><div><strong>Googleカレンダーから回答案を作成</strong><small>予定名や内容は保存しません</small></div><button type="button" disabled>Google連携は準備中</button></div>
        <label className="field"><span>あなたの名前</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例：山田 太郎" /></label>
        {editCredentials && <p className="edit-notice">この端末で保存した回答を編集中です。</p>}
        <div className="availability-list">{data.windows.map((window) => {
          const answer = draft[window.id] ?? { ranges: [] };
          return <article className="availability-day" key={window.id}>
            <div className="availability-heading"><div><strong>{formatDate(window.starts_at)}</strong><span>対象 {formatTime(window.starts_at)}〜{formatTime(window.ends_at)}</span></div></div>
            <div className="availability-actions" role="group" aria-label={`${formatDate(window.starts_at)}の参加可否`}>
              <button type="button" aria-pressed={answer.state === "full"} onClick={() => chooseState(window, "full")}>全時間参加可能</button>
              <button type="button" aria-pressed={answer.state === "custom"} onClick={() => chooseState(window, "custom")}>時間を指定</button>
              <button type="button" aria-pressed={answer.state === "unavailable"} onClick={() => chooseState(window, "unavailable")}>参加不可</button>
            </div>
            {answer.state === "custom" && <div className="custom-ranges">{answer.ranges.map((range, index) => <div className="custom-range" key={`${index}-${range.start}`}><input type="time" aria-label="参加可能な開始時刻" min={formatTime(window.starts_at)} max={formatTime(window.ends_at)} step="900" value={range.start} onChange={(event) => updateRange(window.id, index, "start", snapToQuarter(event.target.value))} /><span>〜</span><input type="time" aria-label="参加可能な終了時刻" min={formatTime(window.starts_at)} max={formatTime(window.ends_at)} step="900" value={range.end} onChange={(event) => updateRange(window.id, index, "end", snapToQuarter(event.target.value))} />{answer.ranges.length > 1 && <button type="button" className="remove-range" onClick={() => removeRange(window.id, index)}>削除</button>}</div>)}<button type="button" className="add-range" onClick={() => addRange(window)}>＋ 時間帯を追加</button></div>}
          </article>;
        })}</div>
        {message && <p className="inline-message" role="status">{message}</p>}
        <button className="primary-action submit-answer" type="button" onClick={submit} disabled={saving}>{saving ? "保存中…" : editCredentials ? "回答を更新" : "この内容で回答"}</button>
      </section> : <section className="results-card">
      {!data.responses.length ? <p className="empty-state">まだ回答はありません。共有リンクを参加者に送ってください。</p> : <><p className="result-summary">回答済みの{data.responses.length}人が参加できる順に表示しています。候補を選ぶと参加できる人を確認できます。</p><div className="candidate-list">{candidates.map((candidate, index) => { const key = candidateKey(candidate); const expanded = selectedCandidateKey === key; const names = data.responses.filter((response) => candidate.availableResponseIds.includes(response.id)).map((response) => response.name); return <div className="candidate-block" key={key}><button type="button" className={candidate.available === data.responses.length ? "candidate best-candidate" : "candidate"} aria-expanded={expanded} onClick={() => setSelectedCandidateKey(expanded ? null : key)}><div><small>{index === 0 ? "最有力候補" : formatDate(candidate.start)}</small><strong>{formatDate(candidate.start)} {formatTime(candidate.start)}〜{formatTime(candidate.end)}</strong></div><span>{candidate.available}/{data.responses.length}人</span></button>{expanded && <div className="candidate-details"><strong>参加できる人</strong>{names.length ? <ul>{names.map((person) => <li key={person}>{person}</li>)}</ul> : <p>参加できる人はいません。</p>}</div>}</div>; })}</div></>}
      </section>}
    </section>
  </main>;
}

function buildCandidates(data: EventData) {
  const result: Candidate[] = [];
  data.windows.forEach((window) => {
    const durationMs = data.event.duration_minutes * 60_000; const stepMs = data.event.step_minutes * 60_000; const limit = new Date(window.ends_at).getTime();
    for (let startMs = new Date(window.starts_at).getTime(); startMs + durationMs <= limit; startMs += stepMs) {
      const endMs = startMs + durationMs;
      const availableResponseIds = data.responses.filter((response) => {
        const day = data.responseDays.find((item) => item.response_id === response.id && item.window_id === window.id);
        if (!day || day.state === "unavailable") return false;
        if (day.state === "full") return true;
        return data.ranges.filter((range) => range.response_day_id === day.id).some((range) => new Date(range.starts_at).getTime() <= startMs && new Date(range.ends_at).getTime() >= endMs);
      }).map((response) => response.id);
      result.push({ windowId: window.id, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), available: availableResponseIds.length, availableResponseIds });
    }
  });
  return result.sort((a, b) => b.available - a.available || a.start.localeCompare(b.start));
}

function candidateKey(candidate: Candidate) { return `${candidate.windowId}-${candidate.start}`; }

function editStorageKey(eventId: string) { return `schedule-edit:${eventId}`; }
function readEditCredentials(eventId: string): EditCredentials | null { try { const value = localStorage.getItem(editStorageKey(eventId)); return value ? JSON.parse(value) as EditCredentials : null; } catch { return null; } }
function defaultDraft(windows: WindowItem[]) { return Object.fromEntries(windows.map((window) => [window.id, { ranges: [{ start: formatTime(window.starts_at), end: formatTime(window.ends_at) }] }])); }
function draftFromResponse(data: EventData, responseId: string): Record<string, DraftDay> { return Object.fromEntries(data.windows.map((window) => { const day = data.responseDays.find((item) => item.response_id === responseId && item.window_id === window.id); if (!day) return [window.id, { ranges: [{ start: formatTime(window.starts_at), end: formatTime(window.ends_at) }] }]; const ranges = data.ranges.filter((range) => range.response_day_id === day.id).map((range) => ({ start: formatTime(range.starts_at), end: formatTime(range.ends_at) })); return [window.id, { state: day.state, ranges: ranges.length ? ranges : [{ start: formatTime(window.starts_at), end: formatTime(window.ends_at) }] }]; })); }

function validRanges(window: WindowItem, ranges: { start: string; end: string }[], duration: number) { return Boolean(ranges.length) && ranges.every((range) => range.start >= formatTime(window.starts_at) && range.end <= formatTime(window.ends_at) && toMinutes(range.end) - toMinutes(range.start) >= duration); }
function hasNoOverlap(ranges: { start: string; end: string }[]) { const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start)); return sorted.every((range, index) => !index || sorted[index - 1].end <= range.start); }
function mergeAdjacent(ranges: { start: string; end: string }[]) { return [...ranges].sort((a, b) => a.start.localeCompare(b.start)).reduce<{ start: string; end: string }[]>((result, range) => { const last = result.at(-1); if (last?.end === range.start) last.end = range.end; else result.push({ ...range }); return result; }, []); }
function findGap(windowStart: string, windowEnd: string, ranges: { start: string; end: string }[], duration: number) { let cursor = toMinutes(windowStart); const end = toMinutes(windowEnd); for (const range of [...ranges].sort((a, b) => a.start.localeCompare(b.start))) { if (toMinutes(range.start) - cursor >= duration) return { start: minuteLabel(cursor), end: minuteLabel(cursor + duration) }; cursor = Math.max(cursor, toMinutes(range.end)); } return end - cursor >= duration ? { start: minuteLabel(cursor), end: minuteLabel(cursor + duration) } : null; }
function withTime(source: string, time: string) { return `${source.slice(0, 10)}T${time}:00+09:00`; }
function toMinutes(time: string) { const [hour, minute] = time.split(":").map(Number); return hour * 60 + minute; }
function minuteLabel(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
function snapToQuarter(value: string) { if (!value) return value; return minuteLabel(Math.min(23 * 60 + 45, Math.round(toMinutes(value) / 15) * 15)); }
function durationLabel(minutes: number) { return minutes % 60 ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}時間` : ""}${minutes % 60}分` : `${minutes / 60}時間`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(new Date(value)); }
