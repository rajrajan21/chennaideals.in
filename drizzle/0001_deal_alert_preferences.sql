CREATE TABLE IF NOT EXISTS `deal_alert_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(36) NOT NULL,
  `keywords` text,
  `categories` text,
  `email_enabled` boolean NOT NULL DEFAULT true,
  `sms_enabled` boolean NOT NULL DEFAULT false,
  `phone_number` varchar(32),
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `deal_alert_preferences_user_id_unique` (`user_id`),
  CONSTRAINT `deal_alert_preferences_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
