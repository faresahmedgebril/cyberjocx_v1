ALTER TABLE `posts` ADD `postType` enum('post','reel','job') DEFAULT 'post' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `jobDetails` text;