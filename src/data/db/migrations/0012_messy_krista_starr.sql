CREATE TABLE `automation_action_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`action_index` integer NOT NULL,
	`action_type` text NOT NULL,
	`action_params` text NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`execution_duration_ms` integer,
	`result_data` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`execution_id`) REFERENCES `automation_executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automation_action_executions_execution_idx` ON `automation_action_executions` (`execution_id`);--> statement-breakpoint
CREATE INDEX `automation_action_executions_status_idx` ON `automation_action_executions` (`status`);--> statement-breakpoint
CREATE INDEX `automation_action_executions_type_idx` ON `automation_action_executions` (`action_type`);--> statement-breakpoint
CREATE TABLE `automation_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`trigger_timestamp` integer NOT NULL,
	`trigger_event_id` text,
	`trigger_context` text NOT NULL,
	`state_conditions_met` integer,
	`temporal_conditions_met` integer,
	`execution_status` text NOT NULL,
	`execution_duration_ms` integer,
	`total_actions` integer DEFAULT 0 NOT NULL,
	`successful_actions` integer DEFAULT 0 NOT NULL,
	`failed_actions` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automation_executions_automation_idx` ON `automation_executions` (`automation_id`);--> statement-breakpoint
CREATE INDEX `automation_executions_timestamp_idx` ON `automation_executions` (`trigger_timestamp`);--> statement-breakpoint
CREATE INDEX `automation_executions_trigger_event_idx` ON `automation_executions` (`trigger_event_id`);--> statement-breakpoint
CREATE INDEX `automation_executions_status_idx` ON `automation_executions` (`execution_status`);