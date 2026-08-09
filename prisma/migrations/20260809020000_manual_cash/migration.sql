ALTER TABLE `CashTransaction`
    ADD COLUMN `ownerId` VARCHAR(191) NULL;

CREATE INDEX `CashTransaction_ownerId_createdAt_idx`
    ON `CashTransaction`(`ownerId`, `createdAt`);

ALTER TABLE `CashTransaction`
    ADD CONSTRAINT `CashTransaction_ownerId_fkey`
    FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
