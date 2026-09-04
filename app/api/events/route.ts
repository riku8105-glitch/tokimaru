import { db, ensureSchema } from "../../../lib/db";

type WindowInput = { startsAt: string; endsAt: string };

export async function POST(request: Request) {
  await ensureSchema();
  const body = await request.json() as { title?: string; durationMinutes?: number; windows?: WindowInput[] };
  const duration = Number(body.durationMinutes);
  if (!body.title?.trim() || !body.windows?.length || !Number.isInteger(duration) || duration < 15) return Response.json({ error: "予定名・候補日・所要時間を入力してください。" }, { status: 400 });
  if (body.windows.some((window) => !window.startsAt || !window.endsAt || window.startsAt >= window.endsAt || new Date(window.endsAt).getTime() - new Date(window.startsAt).getTime() < duration * 60_000)) return Response.json({ error: "各時間帯は所要時間より長く設定してください。" }, { status: 400 });
  const eventId = crypto.randomUUID().slice(0, 8);
  const database = db();
  await database.batch([
    database.prepare("INSERT INTO schedule_events (id, title, duration_minutes, step_minutes, created_at) VALUES (?, ?, ?, ?, ?)").bind(eventId, body.title.trim(), duration, 15, new Date().toISOString()),
    ...body.windows.map((window, index) => database.prepare("INSERT INTO schedule_windows (id, event_id, starts_at, ends_at, sort_order) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), eventId, window.startsAt, window.endsAt, index)),
  ]);
  return Response.json({ eventId }, { status: 201 });
}
