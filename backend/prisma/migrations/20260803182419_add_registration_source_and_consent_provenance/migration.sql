-- AlterTable
ALTER TABLE `Actor` ADD COLUMN `consentMethod` ENUM('NOT_RECORDED', 'PORTAL_CHECKBOX', 'SIGNED_FORM', 'EMAIL', 'VERBAL_FIELD') NOT NULL DEFAULT 'NOT_RECORDED',
    ADD COLUMN `consentObtainedAt` DATETIME(3) NULL,
    ADD COLUMN `consentReference` VARCHAR(255) NULL,
    ADD COLUMN `registrationSource` ENUM('TEAM_MANAGED', 'SELF_REGISTERED') NOT NULL DEFAULT 'TEAM_MANAGED';

-- CreateIndex
CREATE INDEX `Actor_registrationSource_idx` ON `Actor`(`registrationSource`);
