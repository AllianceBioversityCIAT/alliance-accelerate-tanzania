-- CreateTable
CREATE TABLE `RegistrationLookupAttempt` (
    `ip` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`ip`, `reference`, `windowStart`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
