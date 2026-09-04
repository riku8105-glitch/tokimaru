CREATE TABLE `answers` (
	`response_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`status` text NOT NULL,
	PRIMARY KEY(`response_id`, `slot_id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_responses_event_id` ON `responses` (`event_id`);--> statement-breakpoint
CREATE TABLE `schedule_availability_ranges` (
	`id` text PRIMARY KEY NOT NULL,
	`response_day_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_ranges_response_day_id` ON `schedule_availability_ranges` (`response_day_id`);--> statement-breakpoint
CREATE TABLE `schedule_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`step_minutes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_response_days` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`window_id` text NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_response_days_response_id` ON `schedule_response_days` (`response_id`);--> statement-breakpoint
CREATE INDEX `idx_schedule_response_days_window_id` ON `schedule_response_days` (`window_id`);--> statement-breakpoint
CREATE TABLE `schedule_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_responses_event_id` ON `schedule_responses` (`event_id`);--> statement-breakpoint
CREATE TABLE `schedule_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_windows_event_id` ON `schedule_windows` (`event_id`);--> statement-breakpoint
CREATE TABLE `slots` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_slots_event_id` ON `slots` (`event_id`);