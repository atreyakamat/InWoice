// Shapes returned by the InWoice API (see backend/prisma/schema.prisma).

export type Role = 'ADMIN' | 'STAFF' | 'SALES' | 'STORES' | 'ACCOUNTANT';
export type Area = 'sales' | 'catalog' | 'inventory' | 'procurement' | 'payables' | 'accounts' | 'insights';
export type Access = 'none' | 'read' | 'write';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  totpEnabled: boolean;
  recoveryCodesLeft?: number | null;
  permissions: Record<Area, Access>;
}

export interface Settings {
  id: string;
  businessName: string;
  logoUrl: string | null;
  address: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  gstNumber: string | null;
  upiId: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  currency: string;
  currencySymbol: string;
  defaultTaxRate: number;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  creditNotePrefix: string;
  nextCreditNoteNumber: number;
  paymentTermsDays: number;
  remindersEnabled: boolean;
  reminderDays: string;
  invoiceFooter: string | null;
  termsConditions: string | null;
  thankYouMessage: string | null;
  smtpHost: string | null;
  smtpPort: string | null;
  smtpUsername: string | null;
  smtpFrom: string | null;
  smtpPasswordSet: boolean;
  aiProvider: 'NONE' | 'ANTHROPIC' | 'OLLAMA';
  aiModel: string | null;
  aiApiKeySet: boolean;
  ollamaUrl: string | null;
  quotePrefix: string;
  nextQuoteNumber: number;
  debitNotePrefix: string;
  nextDebitNoteNumber: number;
  quoteValidityDays: number;
  statementsEnabled: boolean;
  ownerDigestEnabled: boolean;
  appUrl: string | null;
  lockedUntil: string | null;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3Prefix: string | null;
  s3AccessKey: string | null;
  s3SecretKeySet: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  gstin: string | null;
  notes: string | null;
  segment: string | null;
  createdAt: string;
  totalSpent?: number;
  outstanding?: number;
  invoiceCount?: number;
  lastOrder?: string | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  price: number;
  costPrice: number;
  hsnCode: string | null;
  taxRate: number | null;
  stock: number;
  lowStockThreshold: number;
  status: 'ACTIVE' | 'ARCHIVED';
  bom?: { id: string; _count: { items: number } } | null;
}

export interface PackItem {
  id: string;
  productId: string;
  quantity: number;
  product: { id: string; name: string; price: number; stock: number };
}

export interface Pack {
  id: string;
  name: string;
  description: string | null;
  price: number;
  hsnCode: string | null;
  taxRate: number | null;
  status: string;
  items: PackItem[];
  availableStock?: number;
  componentValue?: number;
}

export type InvoiceStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface InvoiceItem {
  id: string;
  type: 'PRODUCT' | 'PACK' | 'CUSTOM';
  itemId: string | null;
  name: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface Payment {
  id: string;
  amount: number;
  tdsAmount: number;
  tdsSection?: string | null;
  reconciled?: boolean;
  paymentDate: string;
  paymentMethod: string;
  referenceId: string | null;
  notes: string | null;
}

export interface Fulfillment {
  id: string;
  invoiceId: string;
  status: string;
  trackingNumber: string | null;
  courier: string | null;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  notes: string | null;
  createdAt: string;
  shipmentRecords?: { id: string; status: string; notes: string | null; timestamp: string }[];
  invoice?: {
    id: string;
    invoiceNumber: string;
    grandTotal: number;
    status: string;
    customer: { name: string; phone: string | null; address: string | null; city: string | null };
  };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer: Customer;
  date: string;
  dueDate: string | null;
  placeOfSupply: string | null;
  subtotal: number;
  discount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  shippingCost: number;
  grandTotal: number;
  amountPaid: number;
  amountCredited: number;
  remindersSent: number;
  lastReminderAt: string | null;
  balanceDue: number;
  status: InvoiceStatus;
  displayStatus: InvoiceStatus | 'OVERDUE' | 'CREDITED';
  notes: string | null;
  items?: InvoiceItem[];
  payments?: Payment[];
  fulfillment?: Fulfillment | null;
  creditNotes?: CreditNote[];
}

export type CreditReason = 'RETURN' | 'DISCOUNT' | 'DEFICIENCY' | 'CORRECTION' | 'OTHER';

export interface CreditNoteItem {
  id: string;
  invoiceItemId: string;
  name: string;
  hsnCode: string | null;
  quantity: number;
  taxableValue: number;
  taxRate: number;
  taxAmount: number;
}

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  invoiceId: string;
  customerId: string;
  date: string;
  reason: CreditReason;
  taxableValue: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  shippingAmount: number;
  total: number;
  refundAmount: number;
  restock: boolean;
  status: 'ISSUED' | 'CANCELLED';
  notes: string | null;
  items: CreditNoteItem[];
  invoice?: { id: string; invoiceNumber: string; date: string };
  customer?: Customer;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst: string | null;
  state: string | null;
  paymentTerms: string | null;
  leadTime: number | null;
  notes: string | null;
  status: string;
  _count?: { inventoryItems: number; purchaseOrders: number; bills?: number };
  balanceDue?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  reorderLevel: number;
  costPerUnit: number;
  supplierId: string | null;
  supplier?: { id: string; name: string } | null;
  location: string | null;
  notes: string | null;
}

export interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  referenceType: string | null;
  notes: string | null;
  createdAt: string;
  inventoryItem?: { id: string; name: string; unit: string };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: { id: string; name: string };
  status: 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  totalAmount: number;
  expectedAt: string | null;
  notes: string | null;
  createdAt: string;
  items: {
    id: string;
    inventoryItemId: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitPrice: number;
    totalPrice: number;
    inventoryItem: { id: string; name: string; unit: string };
  }[];
  bills?: { id: string; billNumber: string; grandTotal: number; status: string }[];
}

export interface ProductionBatch {
  id: string;
  batchNumber: string;
  status: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
  endDate: string | null;
  outputs: { id: string; productId: string; quantityProduced: number; product: { id: string; name: string } }[];
  usages: { id: string; quantityConsumed: number; inventoryItem: { id: string; name: string; unit: string } }[];
}

export interface EventRow {
  id: string;
  name: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  inventory: {
    id: string;
    inventoryItemId: string;
    quantityAllocated: number;
    quantitySold: number;
    quantityReturned: number;
    inventoryItem: { id: string; name: string; unit: string; currentStock: number };
  }[];
}

export type BillStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface BillItem {
  id: string;
  inventoryItemId: string | null;
  inventoryItem?: { id: string; name: string; unit: string } | null;
  description: string;
  category: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface Bill {
  id: string;
  billNumber: string;
  supplierId: string;
  supplier: { id: string; name: string; gst?: string | null; state?: string | null; email?: string | null; phone?: string | null };
  purchaseOrderId: string | null;
  purchaseOrder?: { id: string; poNumber: string } | null;
  date: string;
  dueDate: string | null;
  subtotal: number;
  discount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  shippingCost: number;
  grandTotal: number;
  amountPaid: number;
  amountDebited: number;
  itcEligible: boolean;
  addToStock: boolean;
  status: BillStatus;
  displayStatus: string;
  balanceDue: number;
  notes: string | null;
  createdAt: string;
  items?: BillItem[];
  payments?: Payment[];
  debitNotes?: DebitNote[];
}

export interface DebitNote {
  id: string;
  debitNoteNumber: string;
  billId: string;
  date: string;
  reason: string;
  taxableValue: number;
  taxAmount: number;
  total: number;
  refundAmount: number;
  restock: boolean;
  status: 'ISSUED' | 'CANCELLED';
  notes: string | null;
  items: { id: string; billItemId: string; description: string; quantity: number; taxableValue: number; taxRate: number; taxAmount: number }[];
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  vendor: string | null;
  vendorGstin: string | null;
  amount: number;
  taxRate: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  itcEligible: boolean;
  paymentMethod: string;
  referenceId: string | null;
  notes: string | null;
}

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'CONVERTED';

export interface QuoteItem {
  id: string;
  type: 'PRODUCT' | 'PACK' | 'CUSTOM';
  itemId: string | null;
  name: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customer: Customer;
  date: string;
  validUntil: string | null;
  placeOfSupply: string | null;
  subtotal: number;
  discount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  shippingCost: number;
  grandTotal: number;
  status: QuoteStatus;
  displayStatus: string;
  notes: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  invoiceId: string | null;
  invoice?: { id: string; invoiceNumber: string; status?: string } | null;
  items?: QuoteItem[];
}

export type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface RecurringInvoice {
  id: string;
  name: string;
  customerId: string;
  customer: { id: string; name: string; email?: string | null; state?: string | null };
  frequency: Frequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  paymentTermsDays: number | null;
  autoIssue: boolean;
  autoEmail: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  placeOfSupply: string | null;
  discount: number;
  shippingCost: number;
  notes: string | null;
  runCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  items: { type: string; itemId: string | null; name: string | null; hsnCode: string | null; quantity: number; unitPrice: number | null; taxRate: number | null }[];
  invoices?: { id: string; invoiceNumber: string; date: string; grandTotal: number; status: string; displayStatus: string; balanceDue: number }[];
  _count?: { invoices: number };
}

export interface Statement {
  customer: { id: string; name: string; email: string | null };
  period: { label: string; from: string; to: string };
  opening: number;
  lines: { date: string; kind: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE'; reference: string; details: string; debit: number; credit: number; balance: number }[];
  totals: { invoiced: number; received: number; credited: number };
  closing: number;
  openInvoices: { id: string; invoiceNumber: string; date: string; dueDate: string | null; balance: number; status: string }[];
  amountDue: number;
  overdue: number;
}
