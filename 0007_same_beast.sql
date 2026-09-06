CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOneId` int NOT NULL,
	`userTwoId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `directMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` varchar(64) NOT NULL,
	`authTag` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `directMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `postComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `postComments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `postReactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`reaction` enum('like','love','angry','laugh','dislike') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `postReactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `postShares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `postShares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `profileAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`assetType` enum('resume','certificate','achievement') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`fileUrl` text,
	`fileKey` text,
	`externalUrl` text,
	`issuedAt` varchar(32),
	`isPublic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profileAssets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userPresence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`countryCode` varchar(8),
	`countryName` varchar(120),
	`timezone` varchar(120),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPresence_id` PRIMARY KEY(`id`),
	CONSTRAINT `userPresence_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `googleGivenName` varchar(120);--> statement-breakpoint
ALTER TABLE `users` ADD `googleFamilyName` varchar(120);--> statement-breakpoint
ALTER TABLE `users` ADD `googleLocale` varchar(32);