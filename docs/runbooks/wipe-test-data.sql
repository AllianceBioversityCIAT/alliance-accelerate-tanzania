-- Wipe all test data from the registry database.
--
-- Keeps: Crop (the 3 reference crops) and _prisma_migrations.
-- Users are not affected: they live in Cognito, not in this database.
--
-- IRREVERSIBLE: TRUNCATE commits implicitly in MySQL. Take an RDS snapshot first
-- if you want a way back.
--
-- DBeaver: run the WHOLE file with "Execute SQL Script" (Alt+X), not Ctrl+Enter,
-- so the FOREIGN_KEY_CHECKS toggle applies to every statement in one session.
--
-- Afterwards: empty the consent-documents S3 bucket (ConsentDocument.storageKey
-- objects are not removed by this script). The deploy-time seed writes only the
-- 3 crops unless SEED_SAMPLE_ACTORS=true, so the wipe survives the next deploy.


-- 2. Wipe.
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE ConsentDocument;
TRUNCATE TABLE ConsentRequest;
TRUNCATE TABLE ActorAuditLog;
TRUNCATE TABLE CropsOnActors;
TRUNCATE TABLE ActorAdditionalType;
TRUNCATE TABLE Actor;
TRUNCATE TABLE Registration;
TRUNCATE TABLE EmailVerification;
TRUNCATE TABLE EmailSendBudget;
TRUNCATE TABLE RegistrationLookupAttempt;
-- Resets Trader ID / REG reference numbering to 0001. Safe only because every
-- row that used those numbers is gone. Comment out to keep numbering going.
TRUNCATE TABLE ActorSequence;
TRUNCATE TABLE RegistrationSequence;

SET FOREIGN_KEY_CHECKS = 1;

-- 3. Verify: expect 0, 0, 3.
SELECT (SELECT COUNT(*) FROM Actor)        AS actors,
       (SELECT COUNT(*) FROM Registration) AS registrations,
       (SELECT COUNT(*) FROM Crop)         AS crops;
