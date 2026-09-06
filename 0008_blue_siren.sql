CREATE TABLE `pointOrderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`bookId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unitPoints` int NOT NULL,
	CONSTRAINT `pointOrderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pointOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalPoints` int NOT NULL,
	`status` enum('completed','failed') NOT NULL DEFAULT 'completed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pointOrders_id` PRIMARY KEY(`id`)
);
