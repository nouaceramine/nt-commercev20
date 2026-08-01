"""
NT Commerce v16 - Enhanced Modules Indexes
Creates ALL indexes for Sections 1 (Products), 2 (Orders), and 3 (Customers)
"""
from utils.enhanced_products_indexes import create_enhanced_products_indexes
from utils.enhanced_orders_indexes import create_enhanced_orders_indexes
from utils.enhanced_shipping_indexes import create_enhanced_shipping_indexes
from utils.enhanced_channels_indexes import create_enhanced_channels_indexes
from utils.enhanced_customers_indexes import create_enhanced_customers_indexes


async def create_all_enhanced_indexes(db):
    """Create all indexes for enhanced modules."""
    products_results = await create_enhanced_products_indexes(db)
    orders_results = await create_enhanced_orders_indexes(db)
    shipping_results = await create_enhanced_shipping_indexes(db)
    channels_results = await create_enhanced_channels_indexes(db)
    customers_results = await create_enhanced_customers_indexes(db)
    return {"products": products_results, "orders": orders_results, "customers": customers_results, "shipping": shipping_results, "channels": channels_results}
