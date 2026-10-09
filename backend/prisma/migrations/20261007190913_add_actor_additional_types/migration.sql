-- CreateTable
CREATE TABLE `ActorAdditionalType` (
    `actorId` VARCHAR(191) NOT NULL,
    `traderType` VARCHAR(191) NOT NULL,

    INDEX `ActorAdditionalType_traderType_idx`(`traderType`),
    PRIMARY KEY (`actorId`, `traderType`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ActorAdditionalType` ADD CONSTRAINT `ActorAdditionalType_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
