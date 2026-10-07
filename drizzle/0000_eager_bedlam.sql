CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(255) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` timestamp,
	`refresh_token_expires_at` timestamp,
	`scope` text,
	`password` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deal_id` int NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`user_name` varchar(255),
	`body` text NOT NULL,
	`parent_id` int,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`url` text,
	`image_url` text,
	`original_price` decimal(10,2),
	`sale_price` decimal(10,2),
	`savings_percent` int,
	`retailer` varchar(100),
	`category` varchar(100),
	`area` varchar(100),
	`status` varchar(20) NOT NULL DEFAULT 'new',
	`score` int NOT NULL DEFAULT 0,
	`upvotes` int NOT NULL DEFAULT 0,
	`downvotes` int NOT NULL DEFAULT 0,
	`comment_count` int NOT NULL DEFAULT 0,
	`view_count` int NOT NULL DEFAULT 0,
	`promoted_to_popular_at` timestamp,
	`promoted_to_frontpage_at` timestamp,
	`submitted_by` varchar(36),
	`submitted_by_name` varchar(255),
	`expires_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saved_deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deal_id` int NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `saved_deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`token` varchar(255) NOT NULL,
	`ip_address` varchar(45),
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255),
	`email` varchar(255) NOT NULL,
	`email_verified` boolean DEFAULT false,
	`image` text,
	`is_admin` boolean DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deal_id` int NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`value` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `votes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_submitted_by_user_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_deals` ADD CONSTRAINT `saved_deals_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_deals` ADD CONSTRAINT `saved_deals_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `votes` ADD CONSTRAINT `votes_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `votes` ADD CONSTRAINT `votes_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_comments_deal` ON `comments` (`deal_id`);--> statement-breakpoint
CREATE INDEX `idx_comments_parent` ON `comments` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_deals_status` ON `deals` (`status`);--> statement-breakpoint
CREATE INDEX `idx_deals_score` ON `deals` (`score`);--> statement-breakpoint
CREATE INDEX `idx_deals_category` ON `deals` (`category`);--> statement-breakpoint
CREATE INDEX `idx_deals_area` ON `deals` (`area`);--> statement-breakpoint
CREATE INDEX `idx_deals_retailer` ON `deals` (`retailer`);--> statement-breakpoint
CREATE INDEX `idx_deals_created` ON `deals` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_saved_user` ON `saved_deals` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_saved_user_deal` ON `saved_deals` (`user_id`,`deal_id`);--> statement-breakpoint
CREATE INDEX `idx_votes_deal` ON `votes` (`deal_id`);--> statement-breakpoint
CREATE INDEX `idx_votes_user_deal` ON `votes` (`user_id`,`deal_id`);
