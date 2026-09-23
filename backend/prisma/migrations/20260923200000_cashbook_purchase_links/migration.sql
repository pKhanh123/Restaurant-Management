ALTER TABLE PurchaseReceipt
  ADD COLUMN paymentMethod ENUM('CASH','BANK_TRANSFER','CREDIT_CARD','E_WALLET') NOT NULL DEFAULT 'CASH',
  ADD COLUMN financialAccountId INTEGER NULL,
  ADD INDEX PurchaseReceipt_financialAccountId_idx(financialAccountId),
  ADD CONSTRAINT PurchaseReceipt_financialAccountId_fkey FOREIGN KEY(financialAccountId) REFERENCES FinancialAccount(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE PurchaseReturn
  MODIFY refundMethod ENUM('CASH','BANK_TRANSFER','CREDIT_CARD','E_WALLET') NOT NULL DEFAULT 'CASH',
  ADD COLUMN financialAccountId INTEGER NULL,
  ADD INDEX PurchaseReturn_financialAccountId_idx(financialAccountId),
  ADD CONSTRAINT PurchaseReturn_financialAccountId_fkey FOREIGN KEY(financialAccountId) REFERENCES FinancialAccount(id) ON DELETE RESTRICT ON UPDATE CASCADE;
