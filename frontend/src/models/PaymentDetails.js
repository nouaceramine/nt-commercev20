/**
 * PaymentDetails - Payment Information Value Object
 * Extracted from POSPage.js (Refactoring: Replace Data Value with Object)
 * Addresses: Primitive Obsession, Data Clumps
 */
export class PaymentDetails {
  static TYPES = {
    CASH: 'cash',
    CREDIT: 'credit',
    INSTALLMENT: 'installment',
    MIXED: 'mixed',
  };

  constructor(data = {}) {
    this.type = data.type || PaymentDetails.TYPES.CASH;
    this.method = data.method || PaymentDetails.TYPES.CASH;
    this.paidAmount = data.paidAmount || 0;
    this.mixedCash = data.mixedCash || 0;
    this.mixedBank = data.mixedBank || 0;
    this.installmentPlan = data.installmentPlan || {
      down_payment: 0,
      installments_count: 3,
      interest_rate: 0,
      frequency: 'monthly',
      first_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };
  }

  static cash(amount) {
    return new PaymentDetails({ type: PaymentDetails.TYPES.CASH, paidAmount: amount });
  }

  static credit() {
    return new PaymentDetails({ type: PaymentDetails.TYPES.CREDIT, paidAmount: 0 });
  }

  static installment(plan) {
    return new PaymentDetails({
      type: PaymentDetails.TYPES.INSTALLMENT,
      paidAmount: plan.down_payment,
      installmentPlan: plan,
    });
  }

  static mixed(cash, bank) {
    return new PaymentDetails({
      type: PaymentDetails.TYPES.MIXED,
      method: 'mixed',
      mixedCash: cash,
      mixedBank: bank,
      paidAmount: cash + bank,
    });
  }

  isCredit() {
    return this.type === PaymentDetails.TYPES.CREDIT;
  }

  isInstallment() {
    return this.type === PaymentDetails.TYPES.INSTALLMENT;
  }

  isMixed() {
    return this.type === PaymentDetails.TYPES.MIXED;
  }

  getPaidAmount() {
    if (this.isCredit()) return 0;
    if (this.isInstallment()) return this.installmentPlan.down_payment;
    if (this.isMixed()) return this.mixedCash + this.mixedBank;
    return this.paidAmount;
  }

  getPaymentDetails() {
    if (this.isMixed()) {
      return { cash: this.mixedCash, bank: this.mixedBank };
    }
    return undefined;
  }

  toJSON() {
    return {
      type: this.type,
      method: this.isMixed() ? 'mixed' : this.method,
      paid_amount: this.getPaidAmount(),
      payment_details: this.getPaymentDetails(),
      payment_type: this.type,
      installment_plan: this.isInstallment() ? this.installmentPlan : undefined,
    };
  }
}
