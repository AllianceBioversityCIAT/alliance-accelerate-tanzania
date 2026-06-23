-- CreateTable
CREATE TABLE `Actor` (
    `id` VARCHAR(191) NOT NULL,
    `traderId` VARCHAR(191) NOT NULL,
    `traderName` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NOT NULL,
    `district` VARCHAR(191) NULL,
    `traderType` VARCHAR(191) NOT NULL,
    `sex` VARCHAR(191) NULL,
    `position` VARCHAR(191) NULL,
    `marketLocation` VARCHAR(191) NULL,
    `capacityTons` DECIMAL(10, 2) NULL,
    `technicalSupport` TEXT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `gpsLatitude` DECIMAL(10, 7) NULL,
    `gpsLongitude` DECIMAL(10, 7) NULL,
    `gpsAltitude` DECIMAL(10, 2) NULL,
    `gpsAccuracy` DECIMAL(10, 2) NULL,
    `consentStatus` ENUM('GRANTED', 'DENIED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Actor_traderId_key`(`traderId`),
    INDEX `Actor_region_idx`(`region`),
    INDEX `Actor_traderType_idx`(`traderType`),
    INDEX `Actor_consentStatus_idx`(`consentStatus`),
    INDEX `Actor_traderName_idx`(`traderName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Crop` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Crop_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CropsOnActors` (
    `actorId` VARCHAR(191) NOT NULL,
    `cropId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`actorId`, `cropId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CropsOnActors` ADD CONSTRAINT `CropsOnActors_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `Actor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CropsOnActors` ADD CONSTRAINT `CropsOnActors_cropId_fkey` FOREIGN KEY (`cropId`) REFERENCES `Crop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

