-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'ADMIN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `cpf` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_ownerId_name_idx`(`ownerId`, `name`),
    UNIQUE INDEX `Customer_ownerId_cpf_key`(`ownerId`, `cpf`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Loan` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `type` ENUM('WEEKLY', 'MONTHLY_INTEREST') NOT NULL,
    `frequency` ENUM('WEEKLY', 'BIWEEKLY', 'MONTHLY') NULL DEFAULT 'WEEKLY',
    `principalAmount` DECIMAL(15, 2) NOT NULL,
    `principalBalance` DECIMAL(15, 2) NOT NULL,
    `releasedAmount` DECIMAL(15, 2) NOT NULL,
    `totalContracted` DECIMAL(15, 2) NOT NULL,
    `installmentCount` INTEGER NULL,
    `installmentAmount` DECIMAL(15, 2) NULL,
    `monthlyInterestRate` DECIMAL(7, 4) NULL,
    `monthlyInterestAmount` DECIMAL(15, 2) NULL,
    `lateFeePerDay` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `loanDate` DATETIME(3) NOT NULL,
    `firstDueDate` DATETIME(3) NULL,
    `monthlyDueDay` INTEGER NULL,
    `status` ENUM('ACTIVE', 'OVERDUE', 'PAID', 'RENEWED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `previousLoanId` VARCHAR(191) NULL,
    `previousBalance` DECIMAL(15, 2) NULL,
    `renewalEntryAmount` DECIMAL(15, 2) NULL,
    `newMoneyReleased` DECIMAL(15, 2) NULL,
    `refinancedAmount` DECIMAL(15, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Loan_previousLoanId_key`(`previousLoanId`),
    INDEX `Loan_customerId_status_idx`(`customerId`, `status`),
    INDEX `Loan_status_type_idx`(`status`, `type`),
    INDEX `Loan_loanDate_idx`(`loanDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Installment` (
    `id` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'OVERDUE', 'PARTIAL') NOT NULL DEFAULT 'PENDING',
    `paidAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Installment_dueDate_status_idx`(`dueDate`, `status`),
    UNIQUE INDEX `Installment_loanId_number_key`(`loanId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonthlyCharge` (
    `id` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `referenceMonth` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `interestAmount` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'OVERDUE', 'PARTIAL') NOT NULL DEFAULT 'PENDING',
    `paidAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MonthlyCharge_dueDate_status_idx`(`dueDate`, `status`),
    UNIQUE INDEX `MonthlyCharge_loanId_referenceMonth_key`(`loanId`, `referenceMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NOT NULL,
    `installmentId` VARCHAR(191) NULL,
    `monthlyChargeId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `type` ENUM('INSTALLMENT', 'INTEREST', 'PRINCIPAL', 'PAYOFF', 'RENEWAL_ENTRY') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `paymentMethod` ENUM('PIX', 'CASH', 'TRANSFER', 'OTHER') NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_loanId_paymentDate_idx`(`loanId`, `paymentDate`),
    INDEX `Payment_customerId_paymentDate_idx`(`customerId`, `paymentDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CashTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('INCOME', 'EXPENSE') NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `loanId` VARCHAR(191) NULL,
    `paymentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CashTransaction_paymentId_key`(`paymentId`),
    INDEX `CashTransaction_createdAt_type_idx`(`createdAt`, `type`),
    INDEX `CashTransaction_loanId_idx`(`loanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Loan` ADD CONSTRAINT `Loan_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Loan` ADD CONSTRAINT `Loan_previousLoanId_fkey` FOREIGN KEY (`previousLoanId`) REFERENCES `Loan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Installment` ADD CONSTRAINT `Installment_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonthlyCharge` ADD CONSTRAINT `MonthlyCharge_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_installmentId_fkey` FOREIGN KEY (`installmentId`) REFERENCES `Installment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_monthlyChargeId_fkey` FOREIGN KEY (`monthlyChargeId`) REFERENCES `MonthlyCharge`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashTransaction` ADD CONSTRAINT `CashTransaction_loanId_fkey` FOREIGN KEY (`loanId`) REFERENCES `Loan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashTransaction` ADD CONSTRAINT `CashTransaction_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

