-- AlterTable
ALTER TABLE `Actor` MODIFY `consentMethod` ENUM('NOT_RECORDED', 'PORTAL_CHECKBOX', 'SIGNED_FORM', 'EMAIL', 'VERBAL_FIELD', 'EMAIL_LINK') NOT NULL DEFAULT 'NOT_RECORDED';

-- AlterTable
ALTER TABLE `ActorAuditLog` MODIFY `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'BULK_CONSENT', 'BULK_DELETE', 'IMPORT', 'REGISTRATION_APPROVE', 'REGISTRATION_REJECT', 'CONSENT_REQUESTED', 'CONSENT_RESPONDED', 'CONSENT_DOCUMENT_UPLOADED') NOT NULL;

-- CreateTable
CREATE TABLE `ConsentRequest` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `traderId` VARCHAR(191) NOT NULL,
    `traderName` VARCHAR(200) NOT NULL,
    `status` ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED', 'ACCEPTED', 'DECLINED', 'SUPERSEDED') NOT NULL DEFAULT 'QUEUED',
    `batchId` VARCHAR(191) NOT NULL,
    `recipientEmail` VARCHAR(191) NOT NULL,
    `editionVersion` VARCHAR(32) NOT NULL,
    `editionHash` CHAR(64) NOT NULL,
    `requestedBySub` VARCHAR(191) NOT NULL,
    `requestedByEmail` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimedAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `failureReason` VARCHAR(64) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `tokenHash` CHAR(64) NULL,
    `respondedAt` DATETIME(3) NULL,
    `respondentName` VARCHAR(120) NULL,
    `respondentPosition` VARCHAR(120) NULL,
    `respondentEmail` VARCHAR(191) NULL,
    `respondentPhone` VARCHAR(40) NULL,
    `respondentIp` VARCHAR(45) NULL,
    `respondentUserAgent` VARCHAR(512) NULL,
    `supersededAt` DATETIME(3) NULL,

    UNIQUE INDEX `ConsentRequest_tokenHash_key`(`tokenHash`),
    INDEX `ConsentRequest_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `ConsentRequest_status_batchId_idx`(`status`, `batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsentDocument` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `traderId` VARCHAR(191) NOT NULL,
    `traderName` VARCHAR(200) NOT NULL,
    `status` ENUM('PENDING', 'STORED') NOT NULL DEFAULT 'PENDING',
    `fileName` VARCHAR(255) NOT NULL,
    `contentType` VARCHAR(64) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `storageKey` VARCHAR(512) NOT NULL,
    `uploadedBySub` VARCHAR(191) NOT NULL,
    `uploadedByEmail` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `storedAt` DATETIME(3) NULL,

    INDEX `ConsentDocument_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
