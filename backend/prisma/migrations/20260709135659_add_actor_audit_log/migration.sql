-- CreateTable
CREATE TABLE `ActorAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `traderId` VARCHAR(191) NOT NULL,
    `traderName` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'BULK_CONSENT', 'BULK_DELETE') NOT NULL,
    `actingSub` VARCHAR(191) NOT NULL,
    `actingEmail` VARCHAR(191) NULL,
    `changes` JSON NOT NULL,
    `acknowledged` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActorAuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
