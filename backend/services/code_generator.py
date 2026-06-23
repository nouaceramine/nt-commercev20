"""
Auto Code Generation Service
Generates unique codes for all entities
"""
from datetime import datetime, timezone

async def generate_code(db, collection: str, prefix: str, digits: int = 5, with_year: bool = True) -> dict:
    """
    Generate unique code for any entity
    
    Args:
        db: Database connection
        collection: Collection name
        prefix: Code prefix (e.g., 'AR', 'CL', 'BV')
        digits: Number of digits (default 5)
        with_year: Add year suffix (default True)
    
    Returns:
        Generated code string
    """
    year = datetime.now(timezone.utc).strftime("%y") if with_year else ""
    
    # Find the highest existing code
    pattern = f"^{prefix}\\d{{{digits}}}"
    if with_year:
        pattern += f"/{year}$"
    
    pipeline = [
        {"$match": {"code": {"$regex": pattern}}},
        {"$sort": {"code": -1}},
        {"$limit": 1}
    ]
    
    result = await db[collection].aggregate(pipeline).to_list(1)
    
    if result:
        last_code = result[0].get("code", "")
        # Extract number part
        num_part = last_code.replace(prefix, "").split("/")[0]
        next_num = int(num_part) + 1
    else:
        next_num = 1
    
    code = f"{prefix}{str(next_num).zfill(digits)}"
    if with_year:
        code += f"/{year}"
    
    return code

# Specific code generators
async def generate_product_code(db) -> dict:
    """Generate product article code: AR00001"""
    return await generate_code(db, "products", "AR", 5, False)

async def generate_customer_code(db) -> dict:
    """Generate customer code: CL00001"""
    return await generate_code(db, "customers", "CL", 5, False)

async def generate_supplier_code(db) -> dict:
    """Generate supplier code: FR00001/26"""
    return await generate_code(db, "suppliers", "FR", 5, True)

async def generate_sale_code(db) -> dict:
    """Generate sale code: BV00001/26"""
    return await generate_code(db, "sales", "BV", 5, True)

async def generate_purchase_code(db) -> dict:
    """Generate purchase code: AC00001/26"""
    return await generate_code(db, "purchases", "AC", 5, True)

async def generate_expense_code(db) -> dict:
    """Generate expense code: CH00001/26"""
    return await generate_code(db, "expenses", "CH", 5, True)

async def generate_inventory_code(db) -> dict:
    """Generate inventory session code: IN00001/26"""
    return await generate_code(db, "inventory_sessions", "IN", 5, True)

async def generate_session_code(db) -> dict:
    """Generate daily session code: S0001/26"""
    return await generate_code(db, "daily_sessions", "S", 4, True)

async def generate_repair_code(db) -> dict:
    """Generate repair ticket code: RP00001/26"""
    return await generate_code(db, "repair_tickets", "RP", 5, True)
