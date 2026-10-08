-- AlterTable: every actor stored so far is Tanzanian. The default only
-- backfills them; it is dropped so no later write can omit the country.
ALTER TABLE `Actor` ADD COLUMN `country` VARCHAR(2) NOT NULL DEFAULT 'TZ';
ALTER TABLE `Actor` ALTER COLUMN `country` DROP DEFAULT;

-- CreateIndex
CREATE INDEX `Actor_country_region_idx` ON `Actor`(`country`, `region`);

-- Registrations keep the applicant's fields in `payload`; give the ones
-- submitted so far their (Tanzanian) country too.
UPDATE `Registration` SET `payload` = JSON_SET(`payload`, '$.country', 'TZ')
WHERE JSON_EXTRACT(`payload`, '$.country') IS NULL;
