-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('WEEKLY', 'MONTHLY_INTEREST');

-- CreateEnum
CREATE TYPE "LoanFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'OVERDUE', 'PAID', 'RENEWED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('INSTALLMENT', 'INTEREST', 'PRINCIPAL', 'PAYOFF', 'RENEWAL_ENTRY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CASH', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('LOAN_DISBURSEMENT', 'PAYMENT', 'RENEWAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cpf" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LoanType" NOT NULL,
    "frequency" "LoanFrequency" DEFAULT 'WEEKLY',
    "principalAmount" DECIMAL(15,2) NOT NULL,
    "principalBalance" DECIMAL(15,2) NOT NULL,
    "releasedAmount" DECIMAL(15,2) NOT NULL,
    "totalContracted" DECIMAL(15,2) NOT NULL,
    "installmentCount" INTEGER,
    "installmentAmount" DECIMAL(15,2),
    "monthlyInterestRate" DECIMAL(7,4),
    "monthlyInterestAmount" DECIMAL(15,2),
    "lateFeePerDay" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "loanDate" TIMESTAMP(3) NOT NULL,
    "firstDueDate" TIMESTAMP(3),
    "monthlyDueDay" INTEGER,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "previousLoanId" TEXT,
    "previousBalance" DECIMAL(15,2),
    "renewalEntryAmount" DECIMAL(15,2),
    "newMoneyReleased" DECIMAL(15,2),
    "refinancedAmount" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyCharge" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "referenceMonth" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "interestAmount" DECIMAL(15,2) NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentId" TEXT,
    "monthlyChargeId" TEXT,
    "customerId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "lateFeeAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paymentId" TEXT,
    "kind" "ReceiptKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptStorageState" (
    "id" TEXT NOT NULL,
    "lastAlertLevel" TEXT NOT NULL DEFAULT 'NORMAL',
    "lastAlertAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptStorageState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "type" "CashTransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "loanId" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Customer_ownerId_name_idx" ON "Customer"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_ownerId_cpf_key" ON "Customer"("ownerId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_previousLoanId_key" ON "Loan"("previousLoanId");

-- CreateIndex
CREATE INDEX "Loan_customerId_status_idx" ON "Loan"("customerId", "status");

-- CreateIndex
CREATE INDEX "Loan_status_type_idx" ON "Loan"("status", "type");

-- CreateIndex
CREATE INDEX "Loan_loanDate_idx" ON "Loan"("loanDate");

-- CreateIndex
CREATE INDEX "Installment_dueDate_status_idx" ON "Installment"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_loanId_number_key" ON "Installment"("loanId", "number");

-- CreateIndex
CREATE INDEX "MonthlyCharge_dueDate_status_idx" ON "MonthlyCharge"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyCharge_loanId_referenceMonth_key" ON "MonthlyCharge"("loanId", "referenceMonth");

-- CreateIndex
CREATE INDEX "Payment_loanId_paymentDate_idx" ON "Payment"("loanId", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_customerId_paymentDate_idx" ON "Payment"("customerId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_objectKey_key" ON "Receipt"("objectKey");

-- CreateIndex
CREATE INDEX "Receipt_ownerId_createdAt_idx" ON "Receipt"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_loanId_createdAt_idx" ON "Receipt"("loanId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_paymentId_key" ON "CashTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "CashTransaction_createdAt_type_idx" ON "CashTransaction"("createdAt", "type");

-- CreateIndex
CREATE INDEX "CashTransaction_ownerId_createdAt_idx" ON "CashTransaction"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "CashTransaction_loanId_idx" ON "CashTransaction"("loanId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_previousLoanId_fkey" FOREIGN KEY ("previousLoanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyCharge" ADD CONSTRAINT "MonthlyCharge_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_monthlyChargeId_fkey" FOREIGN KEY ("monthlyChargeId") REFERENCES "MonthlyCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
