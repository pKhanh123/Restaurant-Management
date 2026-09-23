ALTER TABLE `Order`
  MODIFY paymentMethod ENUM('CASH','BANK_TRANSFER','CREDIT_CARD','E_WALLET') NULL;

ALTER TABLE OrderReturn
  MODIFY refundMethod ENUM('CASH','BANK_TRANSFER','CREDIT_CARD','E_WALLET') NOT NULL DEFAULT 'CASH';

CREATE TABLE FinancialAccount (
  id INTEGER NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  type ENUM('CASH','BANK','E_WALLET') NOT NULL,
  openingBalance INTEGER NOT NULL DEFAULT 0,
  openingAt DATETIME(3) NULL,
  bankName VARCHAR(150) NULL,
  accountNumber VARCHAR(100) NULL,
  walletProvider VARCHAR(150) NULL,
  walletIdentifier VARCHAR(100) NULL,
  isDefault BOOLEAN NOT NULL DEFAULT false,
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX FinancialAccount_code_key(code),
  INDEX FinancialAccount_type_isActive_idx(type, isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE CashFlowCategory (
  id INTEGER NOT NULL AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(150) NOT NULL,
  direction ENUM('RECEIPT','PAYMENT') NOT NULL,
  affectsBusinessResultDefault BOOLEAN NOT NULL DEFAULT true,
  isSystem BOOLEAN NOT NULL DEFAULT false,
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX CashFlowCategory_code_key(code),
  INDEX CashFlowCategory_direction_isActive_idx(direction, isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE FinancialParty (
  id INTEGER NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NULL,
  note VARCHAR(1000) NULL,
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  INDEX FinancialParty_name_idx(name),
  INDEX FinancialParty_isActive_idx(isActive)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE CashbookSetting (
  id INTEGER NOT NULL DEFAULT 1,
  activatedAt DATETIME(3) NULL,
  activatedByUserId INTEGER NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE CashVoucher (
  id INTEGER NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  direction ENUM('RECEIPT','PAYMENT') NOT NULL,
  status ENUM('POSTED','CANCELLED') NOT NULL DEFAULT 'POSTED',
  occurredAt DATETIME(3) NOT NULL,
  amount INTEGER NOT NULL,
  accountId INTEGER NOT NULL,
  categoryId INTEGER NOT NULL,
  paymentMethod ENUM('CASH','BANK_TRANSFER','CREDIT_CARD','E_WALLET') NULL,
  handlerUserId INTEGER NULL,
  handlerName VARCHAR(120) NULL,
  counterpartyType VARCHAR(50) NULL,
  counterpartyId INTEGER NULL,
  counterpartyName VARCHAR(200) NULL,
  note VARCHAR(1000) NULL,
  affectsBusinessResult BOOLEAN NOT NULL DEFAULT true,
  sourceType ENUM('MANUAL','ORDER_PAYMENT','SALES_RETURN','PURCHASE_RECEIPT','PURCHASE_RETURN','REVERSAL') NOT NULL,
  sourceId INTEGER NULL,
  sourceCode VARCHAR(100) NULL,
  sourceKey VARCHAR(191) NOT NULL,
  linkedPurchaseReceiptId INTEGER NULL,
  sourceInvoiceNumber VARCHAR(100) NULL,
  sourceInvoiceDate DATETIME(3) NULL,
  reversalOfId INTEGER NULL,
  cancelledAt DATETIME(3) NULL,
  cancelledByUserId INTEGER NULL,
  cancelReason VARCHAR(500) NULL,
  createdByUserId INTEGER NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX CashVoucher_code_key(code),
  UNIQUE INDEX CashVoucher_sourceKey_key(sourceKey),
  UNIQUE INDEX CashVoucher_reversalOfId_key(reversalOfId),
  INDEX CashVoucher_accountId_occurredAt_idx(accountId, occurredAt),
  INDEX CashVoucher_direction_status_occurredAt_idx(direction, status, occurredAt),
  INDEX CashVoucher_categoryId_idx(categoryId),
  INDEX CashVoucher_linkedPurchaseReceiptId_idx(linkedPurchaseReceiptId),
  CONSTRAINT CashVoucher_accountId_fkey FOREIGN KEY(accountId) REFERENCES FinancialAccount(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT CashVoucher_categoryId_fkey FOREIGN KEY(categoryId) REFERENCES CashFlowCategory(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT CashVoucher_linkedPurchaseReceiptId_fkey FOREIGN KEY(linkedPurchaseReceiptId) REFERENCES PurchaseReceipt(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT CashVoucher_reversalOfId_fkey FOREIGN KEY(reversalOfId) REFERENCES CashVoucher(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO FinancialAccount (
  code, name, type, openingBalance, isDefault, isActive, createdAt, updatedAt
) VALUES (
  'CASH-DEFAULT', 'Tiền mặt', 'CASH', 0, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
);

INSERT INTO CashFlowCategory (
  code, name, direction, affectsBusinessResultDefault, isSystem, isActive, createdAt, updatedAt
) VALUES
  ('CUSTOMER_PAYMENT', 'Khách thanh toán', 'RECEIPT', false, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('SUPPLIER_REFUND', 'Nhà cung cấp hoàn tiền', 'RECEIPT', false, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('OTHER_RECEIPT', 'Thu khác', 'RECEIPT', true, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('SUPPLIER_PAYMENT', 'Trả nhà cung cấp', 'PAYMENT', false, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('CUSTOMER_REFUND', 'Hoàn tiền khách', 'PAYMENT', false, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('OPERATING_EXPENSE', 'Chi phí vận hành', 'PAYMENT', true, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('OTHER_PAYMENT', 'Chi khác', 'PAYMENT', true, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO CashbookSetting (id, activatedAt, activatedByUserId, createdAt, updatedAt)
VALUES (1, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
