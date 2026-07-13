"""
DeliveryInfo - Delivery Information Value Object
Refactoring: Replace Data Value with Object (Martin Fowler)
Addresses: Primitive Obsession, Data Clumps
"""
from pydantic import BaseModel, Field
from typing import Optional


class DeliveryInfo(BaseModel):
    """Value object representing delivery information for a sale."""
    enabled: bool = Field(default=False, description="Whether delivery is enabled")
    wilaya_code: str = Field(default="", description="Wilaya code")
    wilaya_name: str = Field(default="", description="Wilaya name")
    delivery_type: str = Field(default="desk", description="desk or home delivery")
    address: str = Field(default="", description="Delivery address")
    city: str = Field(default="", description="Delivery city")
    fee: float = Field(default=0.0, ge=0, description="Delivery fee")

    @classmethod
    def from_wilaya(cls, wilaya: dict, delivery_type: str) -> "DeliveryInfo":
        """Factory method to create DeliveryInfo from a wilaya dict."""
        if not wilaya:
            return cls()
        fee = wilaya.get("home_fee" if delivery_type == "home" else "desk_fee", 0)
        return cls(
            enabled=True,
            wilaya_code=wilaya.get("code", ""),
            wilaya_name=wilaya.get("name", ""),
            delivery_type=delivery_type,
            fee=fee,
        )

    def update_wilaya(self, wilaya: dict, delivery_type: str) -> "DeliveryInfo":
        """Return a new DeliveryInfo with updated wilaya."""
        return self.from_wilaya(wilaya, delivery_type)

    def update_address(self, address: str) -> "DeliveryInfo":
        return self.model_copy(update={"address": address})

    def update_city(self, city: str) -> "DeliveryInfo":
        return self.model_copy(update={"city": city})

    def toggle(self) -> "DeliveryInfo":
        return self.model_copy(update={"enabled": not self.enabled})

    def to_api_dict(self, language: str = "ar") -> Optional[dict]:
        """Convert to dict for API payload. Returns None if delivery not enabled."""
        if not self.enabled:
            return None
        return {
            "enabled": True,
            "wilaya_code": self.wilaya_code,
            "wilaya_name": self.wilaya_name,
            "city": self.city,
            "address": self.address,
            "delivery_type": self.delivery_type,
            "fee": self.fee,
        }

    class Config:
        json_schema_extra = {
            "example": {
                "enabled": True,
                "wilaya_code": "16",
                "wilaya_name": "Alger",
                "delivery_type": "home",
                "address": "123 Rue Example",
                "city": "Alger Centre",
                "fee": 500.0,
            }
        }
