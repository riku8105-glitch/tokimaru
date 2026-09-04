import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type QueryFunction = NeonQueryFunction<false, false>;

class Statement {
  values: unknown[] = [];

  constructor(public readonly text: string, private readonly sql: QueryFunction) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    return this.sql.query(toPostgresParams(this.text), this.values);
  }

  async all<T = Record<string, unknown>>() {
    const results = await this.sql.query(toPostgresParams(this.text), this.values) as T[];
    return { results };
  }

  async first<T = Record<string, unknown>>() {
    const results = await this.sql.query(toPostgresParams(this.text), this.values) as T[];
    return results[0] ?? null;
  }
}

function toPostgresParams(text: string) {
  let index = 0;
  return text.replace(/\?/g, () => `$${++index}`);
}

export function db() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  const sql = neon(connectionString);
  return {
    prepare: (text: string) => new Statement(text, sql),
    batch: (statements: Statement[]) =>
      sql.transaction((transaction) =>
        statements.map((statement) =>
          transaction.query(toPostgresParams(statement.text), statement.values),
        ),
      ),
  };
}

let initialized = false;
export async function ensureSchema() {
  if (initialized) return;
  const database = db();
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS slots (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, sort_order INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_slots_event_id ON slots(event_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_responses_event_id ON responses(event_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS answers (response_id TEXT NOT NULL, slot_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('yes','maybe','no')), PRIMARY KEY(response_id, slot_id))"),
    database.prepare("CREATE TABLE IF NOT EXISTS schedule_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, duration_minutes INTEGER NOT NULL, step_minutes INTEGER NOT NULL, created_at TEXT NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS schedule_windows (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, sort_order INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_schedule_windows_event_id ON schedule_windows(event_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS schedule_responses (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT NOT NULL, normalized_name TEXT, created_at TEXT NOT NULL, edit_token_hash TEXT)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_schedule_responses_event_id ON schedule_responses(event_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS schedule_response_days (id TEXT PRIMARY KEY, response_id TEXT NOT NULL, window_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('full','custom','unavailable')))"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_schedule_response_days_response_id ON schedule_response_days(response_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_schedule_response_days_window_id ON schedule_response_days(window_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS schedule_availability_ranges (id TEXT PRIMARY KEY, response_day_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_schedule_ranges_response_day_id ON schedule_availability_ranges(response_day_id)"),
  ]);
  await database.prepare("ALTER TABLE schedule_responses ADD COLUMN IF NOT EXISTS edit_token_hash TEXT").run();
  await database.prepare("ALTER TABLE schedule_responses ADD COLUMN IF NOT EXISTS normalized_name TEXT").run();
  await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_responses_event_normalized_name ON schedule_responses(event_id, normalized_name)").run();
  initialized = true;
}
