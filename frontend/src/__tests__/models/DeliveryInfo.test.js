/**
 * DeliveryInfo Domain Object Tests
 * Phase 4d: Unit Tests for Value Object
 */
import { DeliveryInfo } from '../../models/DeliveryInfo';

describe('DeliveryInfo', () => {
  // ── Construction ────────────────────────────────────────────────
  describe('Construction', () => {
    it('should create with default values', () => {
      const di = new DeliveryInfo();
      expect(di.enabled).toBe(false);
      expect(di.wilayaCode).toBe('');
      expect(di.wilayaName).toBe('');
      expect(di.deliveryType).toBe('desk');
      expect(di.address).toBe('');
      expect(di.city).toBe('');
      expect(di.fee).toBe(0);
    });

    it('should create with provided values', () => {
      const di = new DeliveryInfo({ enabled: true, wilayaCode: '16', wilayaName: 'Alger', fee: 500 });
      expect(di.enabled).toBe(true);
      expect(di.wilayaCode).toBe('16');
      expect(di.fee).toBe(500);
    });
  });

  // ── Factory methods ─────────────────────────────────────────────
  describe('fromWilaya', () => {
    it('should create from wilaya with desk delivery', () => {
      const wilaya = { code: '16', name: 'Alger', desk_fee: 300, home_fee: 500 };
      const di = DeliveryInfo.fromWilaya(wilaya, 'desk');
      expect(di.enabled).toBe(true);
      expect(di.wilayaCode).toBe('16');
      expect(di.wilayaName).toBe('Alger');
      expect(di.fee).toBe(300);
    });

    it('should create from wilaya with home delivery', () => {
      const wilaya = { code: '16', name: 'Alger', desk_fee: 300, home_fee: 500 };
      const di = DeliveryInfo.fromWilaya(wilaya, 'home');
      expect(di.fee).toBe(500);
    });

    it('should return disabled DeliveryInfo for null wilaya', () => {
      const di = DeliveryInfo.fromWilaya(null, 'home');
      expect(di.enabled).toBe(false);
    });
  });

  // ── Immutable updates ───────────────────────────────────────────
  describe('toggle', () => {
    it('should toggle enabled state', () => {
      const di = new DeliveryInfo({ enabled: false });
      const toggled = di.toggle();
      expect(toggled.enabled).toBe(true);
      expect(di.enabled).toBe(false); // Original unchanged
    });
  });

  describe('updateAddress', () => {
    it('should update address immutably', () => {
      const di = new DeliveryInfo();
      const updated = di.updateAddress('123 Rue Example');
      expect(updated.address).toBe('123 Rue Example');
      expect(di.address).toBe(''); // Original unchanged
    });
  });

  describe('updateCity', () => {
    it('should update city immutably', () => {
      const di = new DeliveryInfo();
      const updated = di.updateCity('Alger Centre');
      expect(updated.city).toBe('Alger Centre');
      expect(di.city).toBe('');
    });
  });

  describe('updateWilaya', () => {
    it('should update wilaya', () => {
      const di = new DeliveryInfo({ enabled: true, wilayaCode: '16' });
      const newWilaya = { code: '31', name: 'Oran', desk_fee: 400, home_fee: 600 };
      const updated = di.updateWilaya(newWilaya, 'home');
      expect(updated.wilayaCode).toBe('31');
      expect(updated.wilayaName).toBe('Oran');
      expect(updated.fee).toBe(600);
    });
  });

  // ── Serialization ───────────────────────────────────────────────
  describe('toJSON', () => {
    it('should serialize to plain object', () => {
      const di = new DeliveryInfo({ enabled: true, wilayaCode: '16', wilayaName: 'Alger', fee: 500 });
      const json = di.toJSON();
      expect(json).toEqual({
        enabled: true,
        wilaya_code: '16',
        wilaya_name: 'Alger',
        city: '',
        address: '',
        delivery_type: 'desk',
        fee: 500,
      });
    });
  });

  describe('toApiPayload', () => {
    it('should return null when disabled', () => {
      const di = new DeliveryInfo({ enabled: false });
      expect(di.toApiPayload('ar')).toBeNull();
    });

    it('should return payload when enabled', () => {
      const di = new DeliveryInfo({ enabled: true, wilayaCode: '16', wilayaName: 'Alger', city: 'Alger Centre', address: '123 Rue', deliveryType: 'home', fee: 500 });
      const payload = di.toApiPayload('ar');
      expect(payload).toEqual({
        enabled: true,
        wilaya_code: '16',
        wilaya_name: 'Alger',
        city: 'Alger Centre',
        address: '123 Rue',
        delivery_type: 'home',
        fee: 500,
      });
    });
  });
});
