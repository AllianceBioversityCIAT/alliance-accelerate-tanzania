-- CreateTable
CREATE TABLE `EmailSendBudget` (
    `email` VARCHAR(191) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `sends` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`email`, `windowStart`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
