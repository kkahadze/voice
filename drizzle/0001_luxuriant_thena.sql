CREATE TABLE `lesson_directors` (
	`user_id` text NOT NULL,
	`live_id` text NOT NULL,
	`agent_id` text,
	`instructions` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`delegation_id` text,
	`result` text,
	`calls` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `live_id`)
);
