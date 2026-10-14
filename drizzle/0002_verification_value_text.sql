CREATE TABLE `deal_alert_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`keywords` text,
	`categories` text,
	`email_enabled` boolean NOT NULL DEFAULT true,
	`sms_enabled` boolean NOT NULL DEFAULT false,
	`phone_number` varchar(32),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deal_alert_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `deal_alert_preferences_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `deal_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deal_id` int NOT NULL,
	`type` varchar(10) NOT NULL,
	`url` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `deal_media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `verification` MODIFY COLUMN `value` text NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `editor_note` text;--> statement-breakpoint
ALTER TABLE `deal_alert_preferences` ADD CONSTRAINT `deal_alert_preferences_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_media` ADD CONSTRAINT `deal_media_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_media_deal` ON `deal_media` (`deal_id`);