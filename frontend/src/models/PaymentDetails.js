/**
 * PaymentDetails - Payment Information Value Object
 * Extracted from POSPage.js (Refactoring: Replace Data Value with Object)
 * Addresses: Primitive Obsession, Data Clumps
 */
export const PaymentType = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  INSTALLMENT: 'installment',
  MIXED: 'mixed',
});

export class InstallmentPlan {
  constructor(data = {}) {
    this.down_payment = Number(data.down_payment) || 0;
    this.installments_count = Number(data.installments_count) || 3;
    this.interest_rate = Number(data.interest_rate) || 0;
    this.frequency = data.frequency || 'monthly';
    this.first_due_date = data.first_due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }
}

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

  static fromDict(data = {}) {
    const type = data.payment_type || data.type || PaymentDetails.TYPES.CASH;
    if (type === PaymentDetails.TYPES.CREDIT) return PaymentDetails.credit();
    if (type === PaymentDetails.TYPES.INSTALLMENT) {
      return PaymentDetails.installment(new InstallmentPlan(data.installment_plan || data.installmentPlan || {}));
    }
    if (type === PaymentDetails.TYPES.MIXED) {
      const details = data.payment_details || {};
      return PaymentDetails.mixed(Number(details.cash) || 0, Number(details.bank) || 0);
    }
    return PaymentDetails.cash(Number(data.paid_amount ?? data.paidAmount) || 0);
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

  get payment_type() { return this.type; }
  get payment_method() { return this.isMixed() ? 'mixed' : this.method; }
  get paid_amount() { return this.getPaidAmount(); }
  get payment_details() { return this.getPaymentDetails(); }
  get installment_plan() { return this.isInstallment() ? this.installmentPlan : undefined; }

  toSaleDict() {
    const result = {
      paid_amount: this.getPaidAmount(),
      payment_method: this.payment_method,
      payment_type: this.type,
    };
    if (this.payment_details !== undefined) result.payment_details = this.payment_details;
    if (this.installment_plan !== undefined) result.installment_plan = this.installment_plan;
    return result;
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
