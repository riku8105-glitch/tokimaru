import EventClient from "./EventClient";
import type { Metadata } from "next";
import { db, ensureSchema } from "../../../lib/db";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await ensureSchema();
  const { id } = await params;
  const event = await db().prepare("SELECT title, duration_minutes FROM schedule_events WHERE id = ?").bind(id).first<{ title: string; duration_minutes: number }>();
  const title = event ? `${event.title} | ときまる` : "日程調整 | ときまる";
  const description = event ? `${event.title}の参加可能な時間帯を回答してください。所要時間は${event.duration_minutes}分です。` : "参加可能な時間帯を回答してください。";
  return { title, description, openGraph: { title, description, images: [] }, twitter: { title, description, images: [] } };
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  return <EventClient eventId={(await params).id} />;
}
