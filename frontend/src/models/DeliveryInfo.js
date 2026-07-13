/**
 * DeliveryInfo - Delivery Information Value Object
 * Extracted from POSPage.js (Refactoring: Replace Data Value with Object)
 * Addresses: Primitive Obsession, Data Clumps
 */
export class DeliveryInfo {
  constructor(data = {}) {
    this.enabled = data.enabled || false;
    this.wilayaCode = data.wilayaCode || '';
    this.wilayaName = data.wilayaName || '';
    this.deliveryType = data.deliveryType || 'desk';
    this.address = data.address || '';
    this.city = data.city || '';
    this.fee = data.fee || 0;
  }

  static fromWilaya(wilaya, deliveryType) {
    if (!wilaya) return new DeliveryInfo();
    return new DeliveryInfo({
      enabled: true,
      wilayaCode: wilaya.code,
      wilayaName: wilaya.name,
      deliveryType,
      fee: deliveryType === 'home' ? wilaya.home_fee : wilaya.desk_fee,
    });
  }

  toggle() {
    return new DeliveryInfo({ ...this, enabled: !this.enabled });
  }

  updateWilaya(wilaya, deliveryType) {
    return DeliveryInfo.fromWilaya(wilaya, deliveryType);
  }

  updateAddress(address) {
    return new DeliveryInfo({ ...this, address });
  }

  updateCity(city) {
    return new DeliveryInfo({ ...this, city });
  }

  toJSON() {
    return {
      enabled: this.enabled,
      wilaya_code: this.wilayaCode,
      wilaya_name: this.wilayaName,
      city: this.city,
      address: this.address,
      delivery_type: this.deliveryType,
      fee: this.fee,
    };
  }

  toApiPayload(language) {
    if (!this.enabled) return null;
    return {
      enabled: true,
      wilaya_code: this.wilayaCode,
      wilaya_name: this.wilayaName,
      city: this.city,
      address: this.address,
      delivery_type: this.deliveryType,
      fee: this.fee,
    };
  }
}
