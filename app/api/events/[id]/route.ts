import { db, ensureSchema } from "../../../../lib/db";

type State = "full" | "custom" | "unavailable";
type DayInput = { windowId: string; state: State; ranges?: { startsAt: string; endsAt: string }[] };

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await context.params;
  const database = db();
  const event = await database.prepare("SELECT id, title, duration_minutes, step_minutes, created_at FROM schedule_events WHERE id = ?").bind(id).first();
  if (!event) return Response.json({ error: "調整ページが見つかりません。" }, { status: 404 });
  const windows = (await database.prepare("SELECT id, starts_at, ends_at FROM schedule_windows WHERE event_id = ? ORDER BY sort_order").bind(id).all()).results;
  const responses = (await database.prepare("SELECT id, name FROM schedule_responses WHERE event_id = ? ORDER BY created_at").bind(id).all()).results;
  const responseDays = (await database.prepare("SELECT d.id, d.response_id, d.window_id, d.state FROM schedule_response_days d JOIN schedule_responses r ON r.id = d.response_id WHERE r.event_id = ?").bind(id).all()).results;
  const ranges = (await database.prepare("SELECT ar.id, ar.response_day_id, ar.starts_at, ar.ends_at FROM schedule_availability_ranges ar JOIN schedule_response_days d ON d.id = ar.response_day_id JOIN schedule_responses r ON r.id = d.response_id WHERE r.event_id = ?").bind(id).all()).results;
  return Response.json({ event, windows, responses, responseDays, ranges });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await context.params;
  const body = await request.json() as { name?: string; days?: DayInput[] };
  if (!body.name?.trim() || !body.days?.length) return Response.json({ error: "名前と全日程への回答を入力してください。" }, { status: 400 });
  const database = db();
  const event = await database.prepare("SELECT id, duration_minutes FROM schedule_events WHERE id = ?").bind(id).first<{ id: string; duration_minutes: number }>();
  if (!event) return Response.json({ error: "調整ページが見つかりません。" }, { status: 404 });
  const normalizedName = normalizeName(body.name);
  const existingNames = (await database.prepare("SELECT name FROM schedule_responses WHERE event_id = ?").bind(id).all<{ name: string }>()).results;
  if (existingNames.some((response) => normalizeName(response.name) === normalizedName)) return Response.json({ error: "この名前はすでに使われています。別の名前を入力してください。" }, { status: 409 });
  const windows = (await database.prepare("SELECT id, starts_at, ends_at FROM schedule_windows WHERE event_id = ?").bind(id).all<{ id: string; starts_at: string; ends_at: string }>()).results;
  if (body.days.length !== windows.length) return Response.json({ error: "すべての日程に回答してください。" }, { status: 400 });
  const statements = [];
  const responseId = crypto.randomUUID();
  const editToken = createEditToken();
  const editTokenHash = await hashToken(editToken);
  statements.push(database.prepare("INSERT INTO schedule_responses (id, event_id, name, normalized_name, created_at, edit_token_hash) VALUES (?, ?, ?, ?, ?, ?)").bind(responseId, id, body.name.trim(), normalizedName, new Date().toISOString(), editTokenHash));
  for (const day of body.days) {
    const window = windows.find((item) => item.id === day.windowId);
    if (!window || !["full", "custom", "unavailable"].includes(day.state)) return Response.json({ error: "回答内容が正しくありません。" }, { status: 400 });
    const normalized = normalizeRanges(day.ranges ?? []);
    if (day.state === "custom" && (!normalized.length || normalized.some((range) => range.startsAt < window.starts_at || range.endsAt > window.ends_at || new Date(range.endsAt).getTime() - new Date(range.startsAt).getTime() < event.duration_minutes * 60_000))) return Response.json({ error: "指定時間は作成者の範囲内で、所要時間以上にしてください。" }, { status: 400 });
    const dayId = crypto.randomUUID();
    statements.push(database.prepare("INSERT INTO schedule_response_days (id, response_id, window_id, state) VALUES (?, ?, ?, ?)").bind(dayId, responseId, day.windowId, day.state));
    if (day.state === "custom") normalized.forEach((range) => statements.push(database.prepare("INSERT INTO schedule_availability_ranges (id, response_day_id, starts_at, ends_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), dayId, range.startsAt, range.endsAt)));
  }
  try { await database.batch(statements); } catch (cause) { if (isDuplicateNameError(cause)) return Response.json({ error: "この名前はすでに使われています。別の名前を入力してください。" }, { status: 409 }); throw cause; }
  return Response.json({ ok: true, responseId, editToken }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await context.params;
  const body = await request.json() as { responseId?: string; editToken?: string; name?: string; days?: DayInput[] };
  if (!body.responseId || !body.editToken || !body.name?.trim() || !body.days?.length) return Response.json({ error: "回答を更新するための情報が足りません。" }, { status: 400 });
  const database = db();
  const saved = await database.prepare("SELECT edit_token_hash FROM schedule_responses WHERE id = ? AND event_id = ?").bind(body.responseId, id).first<{ edit_token_hash: string | null }>();
  if (!saved?.edit_token_hash || saved.edit_token_hash !== await hashToken(body.editToken)) return Response.json({ error: "この回答を編集する権限を確認できませんでした。" }, { status: 403 });
  const normalizedName = normalizeName(body.name);
  const existingNames = (await database.prepare("SELECT name FROM schedule_responses WHERE event_id = ? AND id != ?").bind(id, body.responseId).all<{ name: string }>()).results;
  if (existingNames.some((response) => normalizeName(response.name) === normalizedName)) return Response.json({ error: "この名前はすでに使われています。別の名前を入力してください。" }, { status: 409 });
  const event = await database.prepare("SELECT duration_minutes FROM schedule_events WHERE id = ?").bind(id).first<{ duration_minutes: number }>();
  const windows = (await database.prepare("SELECT id, starts_at, ends_at FROM schedule_windows WHERE event_id = ?").bind(id).all<{ id: string; starts_at: string; ends_at: string }>()).results;
  if (!event || body.days.length !== windows.length) return Response.json({ error: "すべての日程に回答してください。" }, { status: 400 });
  const statements = [
    database.prepare("DELETE FROM schedule_availability_ranges WHERE response_day_id IN (SELECT id FROM schedule_response_days WHERE response_id = ?)").bind(body.responseId),
    database.prepare("DELETE FROM schedule_response_days WHERE response_id = ?").bind(body.responseId),
    database.prepare("UPDATE schedule_responses SET name = ?, normalized_name = ? WHERE id = ? AND event_id = ?").bind(body.name.trim(), normalizedName, body.responseId, id),
  ];
  for (const day of body.days) {
    const window = windows.find((item) => item.id === day.windowId);
    if (!window || !["full", "custom", "unavailable"].includes(day.state)) return Response.json({ error: "回答内容が正しくありません。" }, { status: 400 });
    const normalized = normalizeRanges(day.ranges ?? []);
    if (day.state === "custom" && (!normalized.length || normalized.some((range) => range.startsAt < window.starts_at || range.endsAt > window.ends_at || new Date(range.endsAt).getTime() - new Date(range.startsAt).getTime() < event.duration_minutes * 60_000))) return Response.json({ error: "指定時間は作成者の範囲内で、所要時間以上にしてください。" }, { status: 400 });
    const dayId = crypto.randomUUID();
    statements.push(database.prepare("INSERT INTO schedule_response_days (id, response_id, window_id, state) VALUES (?, ?, ?, ?)").bind(dayId, body.responseId, day.windowId, day.state));
    if (day.state === "custom") normalized.forEach((range) => statements.push(database.prepare("INSERT INTO schedule_availability_ranges (id, response_day_id, starts_at, ends_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), dayId, range.startsAt, range.endsAt)));
  }
  try { await database.batch(statements); } catch (cause) { if (isDuplicateNameError(cause)) return Response.json({ error: "この名前はすでに使われています。別の名前を入力してください。" }, { status: 409 }); throw cause; }
  return Response.json({ ok: true });
}

function normalizeRanges(ranges: { startsAt: string; endsAt: string }[]) {
  const sorted = ranges.filter((range) => range.startsAt && range.endsAt && range.startsAt < range.endsAt).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return sorted.reduce<{ startsAt: string; endsAt: string }[]>((result, range) => {
    const last = result.at(-1);
    if (last && range.startsAt <= last.endsAt) last.endsAt = last.endsAt > range.endsAt ? last.endsAt : range.endsAt; else result.push({ ...range });
    return result;
  }, []);
}

function createEditToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function hashToken(token: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function normalizeName(name: string) { return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja-JP"); }
function isDuplicateNameError(cause: unknown) { return cause instanceof Error && cause.message.includes("idx_schedule_responses_event_normalized_name"); }
