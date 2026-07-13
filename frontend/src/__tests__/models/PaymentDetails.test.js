/**
 * PaymentDetails Domain Object Tests
 * Phase 4d: Unit Tests for Value Object
 */
import { PaymentDetails, PaymentType, InstallmentPlan } from '../../models/PaymentDetails';

describe('PaymentDetails', () => {
  // ── Factory methods ─────────────────────────────────────────────
  describe('cash', () => {
    it('should create cash payment', () => {
      const pd = PaymentDetails.cash(1500);
      expect(pd.payment_type).toBe(PaymentType.CASH);
      expect(pd.paid_amount).toBe(1500);
      expect(pd.payment_method).toBe('cash');
    });
  });

  describe('credit', () => {
    it('should create credit payment', () => {
      const pd = PaymentDetails.credit();
      expect(pd.payment_type).toBe(PaymentType.CREDIT);
      expect(pd.paid_amount).toBe(0);
      expect(pd.isCredit()).toBe(true);
    });
  });

  describe('installment', () => {
    it('should create installment payment', () => {
      const plan = new InstallmentPlan({ down_payment: 500, installments_count: 6 });
      const pd = PaymentDetails.installment(plan);
      expect(pd.payment_type).toBe(PaymentType.INSTALLMENT);
      expect(pd.paid_amount).toBe(500);
      expect(pd.isInstallment()).toBe(true);
      expect(pd.installment_plan.installments_count).toBe(6);
    });
  });

  describe('mixed', () => {
    it('should create mixed payment', () => {
      const pd = PaymentDetails.mixed(1000, 500);
      expect(pd.payment_type).toBe(PaymentType.MIXED);
      expect(pd.paid_amount).toBe(1500);
      expect(pd.isMixed()).toBe(true);
      expect(pd.payment_details).toEqual({ cash: 1000, bank: 500 });
    });
  });

  // ── fromDict ─────────────────────────────────────────────────────
  describe('fromDict', () => {
    it('should parse cash from dict', () => {
      const pd = PaymentDetails.fromDict({ payment_type: 'cash', paid_amount: 2000 });
      expect(pd.payment_type).toBe(PaymentType.CASH);
      expect(pd.paid_amount).toBe(2000);
    });

    it('should parse credit from dict', () => {
      const pd = PaymentDetails.fromDict({ payment_type: 'credit' });
      expect(pd.isCredit()).toBe(true);
    });

    it('should parse mixed from dict', () => {
      const pd = PaymentDetails.fromDict({ payment_type: 'mixed', payment_details: { cash: 800, bank: 200 } });
      expect(pd.isMixed()).toBe(true);
      expect(pd.paid_amount).toBe(1000);
    });

    it('should parse installment from dict', () => {
      const pd = PaymentDetails.fromDict({
        payment_type: 'installment',
        installment_plan: { down_payment: 300, installments_count: 4 },
      });
      expect(pd.isInstallment()).toBe(true);
      expect(pd.installment_plan.down_payment).toBe(300);
    });
  });

  // ── toSaleDict ───────────────────────────────────────────────────
  describe('toSaleDict', () => {
    it('should serialize cash payment', () => {
      const pd = PaymentDetails.cash(1500);
      const dict = pd.toSaleDict();
      expect(dict).toEqual({
        paid_amount: 1500,
        payment_method: 'cash',
        payment_type: 'cash',
      });
    });

    it('should serialize mixed payment with details', () => {
      const pd = PaymentDetails.mixed(1000, 500);
      const dict = pd.toSaleDict();
      expect(dict.payment_details).toEqual({ cash: 1000, bank: 500 });
    });

    it('should serialize installment with plan', () => {
      const plan = new InstallmentPlan({ down_payment: 400, installments_count: 3 });
      const pd = PaymentDetails.installment(plan);
      const dict = pd.toSaleDict();
      expect(dict.installment_plan).toBeDefined();
      expect(dict.installment_plan.down_payment).toBe(400);
    });
  });

  // ── Type checks ──────────────────────────────────────────────────
  describe('Type predicates', () => {
    it('should correctly identify payment types', () => {
      expect(PaymentDetails.cash(100).isCash?.()).toBeUndefined(); // No isCash method
      expect(PaymentDetails.credit().isCredit()).toBe(true);
      expect(PaymentDetails.credit().isMixed()).toBe(false);
      expect(PaymentDetails.mixed(1, 1).isMixed()).toBe(true);
      expect(PaymentDetails.mixed(1, 1).isInstallment()).toBe(false);
    });
  });
});

describe('InstallmentPlan', () => {
  it('should validate constraints', () => {
    const plan = new InstallmentPlan({ installments_count: 3, interest_rate: 5.5 });
    expect(plan.installments_count).toBe(3);
    expect(plan.interest_rate).toBe(5.5);
    expect(plan.frequency).toBe('monthly');
  });
});
