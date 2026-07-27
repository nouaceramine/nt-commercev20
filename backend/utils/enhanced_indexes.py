"""
NT Commerce v16 - Enhanced Modules Indexes
Creates ALL indexes for both Section 1 (Products) and Section 2 (Orders)
"""
from utils.enhanced_products_indexes import create_enhanced_products_indexes
from utils.enhanced_orders_indexes import create_enhanced_orders_indexes


async def create_all_enhanced_indexes(db):
    """Create all indexes for enhanced modules."""
    products_results = await create_enhanced_products_indexes(db)
    orders_results = await create_enhanced_orders_indexes(db)
    return {"products": products_results, "orders": orders_results}
