import { PaymentMethod, PurchaseReceiptStatus } from '@prisma/client';

export type PurchaseReceiptActor = {
  id: number;
  name: string;
};

export type PurchaseReceiptSupplierDto = {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
};

export type PurchaseReceiptLineDto = {
  id: number;
  ingredientId: number;
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  discountAmount: number;
  lineAmount: number;
  note: string | null;
};

export type PurchaseReceiptDto = {
  id: number;
  receiptCode: string;
  supplierId: number | null;
  supplier: PurchaseReceiptSupplierDto | null;
  receivedAt: Date;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  status: PurchaseReceiptStatus;
  subtotalAmount: number;
  discountAmount: number;
  payableAmount: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  financialAccountId: number | null;
  outstandingAmount: number;
  note: string | null;
  createdByUserId: number | null;
  postedByUserId: number | null;
  postedAt: Date | null;
  cancelledByUserId: number | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: PurchaseReceiptLineDto[];
};

export type PurchaseReceiptListDataDto = {
  items: PurchaseReceiptDto[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  totalPayableAmount: number;
};

export type PurchaseReceiptImportValidRowDto = {
  rowNumber: number;
  ingredientId: number;
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  discountAmount: 0;
  note: string | null;
};

export type PurchaseReceiptImportErrorRowDto = {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  quantity: number;
  costPerUnit: number;
  error: string;
};

export type PurchaseReceiptImportPreviewDto = {
  fileName: string;
  totalRows: number;
  validRows: PurchaseReceiptImportValidRowDto[];
  errorRows: PurchaseReceiptImportErrorRowDto[];
};
