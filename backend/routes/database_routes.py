"""
Database Import/Export Routes
Handles database backup, restore, and data import from external sources
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel
import os
import json
import gzip
import shutil
import uuid
import subprocess
import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/database", tags=["Database Management"])

security = HTTPBearer()

# Import from main server
from config.database import main_db, client, get_tenant_db

# JWT Settings
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'nt_commerce_super_secure_jwt_secret_key_2024_v3_hardened')
ALGORITHM = "HS256"
import jwt

# Exports directory (use backend-relative path for Replit compatibility)
_BASE_DIR = Path(__file__).parent.parent
EXPORTS_DIR = _BASE_DIR / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Uploads directory for imports
IMPORTS_DIR = _BASE_DIR / "imports"
IMPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ============ PYDANTIC MODELS ============

class ImportStatus(BaseModel):
    status: str
    message: str
    statistics: dict = {}

class ExportInfo(BaseModel):
    filename: str
    created_at: str
    size_mb: float
    statistics: dict = {}
    download_url: str

# ============ HELPER FUNCTIONS ============

async def verify_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify JWT token and return super admin user"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        user_role = payload.get("role", "")
        
        # Allow super_admin role
        if user_role not in ["super_admin", "saas_admin"]:
            raise HTTPException(status_code=403, detail="Super admin access required")
        
        # Check in users collection
        user = await main_db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============ EXPORT ENDPOINTS ============

@router.get("/exports")
async def list_exports(admin: dict = Depends(verify_super_admin)):
    """List all available export files"""
    exports = []
    for file in EXPORTS_DIR.glob("*.json*"):
        stat = file.stat()
        exports.append({
            "filename": file.name,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "size_mb": round(stat.st_size / (1024 * 1024), 2)
        })
    
    # Sort by creation time, newest first
    exports.sort(key=lambda x: x["created_at"], reverse=True)
    return {"exports": exports}

@router.get("/download/{filename}")
async def download_export(filename: str, admin: dict = Depends(verify_super_admin)):
    """Download an export file"""
    file_path = EXPORTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Security check - ensure file is within exports directory
    try:
        file_path.resolve().relative_to(EXPORTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Determine media type
    media_type = "application/gzip" if filename.endswith(".gz") else "application/json"
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type=media_type
    )

@router.delete("/exports/{filename}")
async def delete_export(filename: str, admin: dict = Depends(verify_super_admin)):
    """Delete an export file"""
    file_path = EXPORTS_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Security check
    try:
        file_path.resolve().relative_to(EXPORTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    file_path.unlink()
    return {"message": "File deleted successfully"}

# ============ IMPORT ENDPOINTS ============

@router.post("/import/{tenant_id}")
async def import_to_tenant(
    tenant_id: str,
    file: UploadFile = File(...),
    clear_existing: bool = False,
    admin: dict = Depends(verify_super_admin)
):
    """
    Import data from JSON file to a tenant's database
    
    - tenant_id: The tenant to import data to
    - file: JSON or JSON.GZ file with the export data
    - clear_existing: If True, clears existing data before import
    """
    # Verify tenant exists
    tenant = await main_db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Save uploaded file temporarily
    temp_path = IMPORTS_DIR / f"temp_{uuid.uuid4()}.json"
    
    try:
        # Read and decompress if needed
        content = await file.read()
        
        if file.filename.endswith(".gz"):
            content = gzip.decompress(content)
        
        # Parse JSON
        try:
            data = json.loads(content.decode('utf-8'))
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}")
        
        # Get tenant database
        tenant_db = get_tenant_db(tenant_id)
        
        # Clear existing data if requested
        if clear_existing:
            await tenant_db.categories.delete_many({})
            await tenant_db.products.delete_many({})
            await tenant_db.customers.delete_many({})
            await tenant_db.suppliers.delete_many({})
            logger.info(f"Cleared existing data for tenant {tenant_id}")
        
        statistics = {
            "categories": {"imported": 0, "errors": 0},
            "products": {"imported": 0, "errors": 0},
            "customers": {"imported": 0, "errors": 0},
            "suppliers": {"imported": 0, "errors": 0}
        }
        
        # Build category mapping (original_id -> new_id)
        category_map = {}
        
        # Import categories
        if "categories" in data:
            for cat in data["categories"]:
                try:
                    new_id = str(uuid.uuid4())
                    category_doc = {
                        "id": new_id,
                        "name": cat.get("name", ""),
                        "description": "",
                        "parent_id": None,
                        "image_url": "",
                        "is_active": True,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Check if category with same name exists
                    existing = await tenant_db.categories.find_one({"name": cat.get("name", "")})
                    if existing:
                        category_map[cat.get("original_id")] = existing.get("id")
                        statistics["categories"]["imported"] += 1
                        continue
                    
                    await tenant_db.categories.insert_one(category_doc)
                    category_map[cat.get("original_id")] = new_id
                    statistics["categories"]["imported"] += 1
                except Exception as e:
                    logger.error(f"Error importing category: {e}")
                    statistics["categories"]["errors"] += 1
        
        # Import products
        if "products" in data:
            for prod in data["products"]:
                try:
                    new_id = str(uuid.uuid4())
                    
                    # Get category ID from mapping
                    original_cat_id = prod.get("original_category_id")
                    category_id = category_map.get(original_cat_id)
                    
                    product_doc = {
                        "id": new_id,
                        "name": prod.get("name", ""),
                        "sku": prod.get("sku", ""),
                        "barcode": prod.get("barcode", ""),
                        "category_id": category_id,
                        "category": prod.get("category", ""),
                        "description": prod.get("description", ""),
                        "cost_price": prod.get("cost_price", 0),
                        "selling_price": prod.get("selling_price", 0),
                        "wholesale_price": prod.get("price_a", 0),
                        "min_price": prod.get("price_c", 0),
                        "purchase_price": prod.get("purchase_price", 0),
                        "stock": prod.get("stock", 0),
                        "low_stock_threshold": prod.get("stock_alert", 5),
                        "unit": "قطعة",
                        "warehouse_id": "main",
                        "is_active": prod.get("is_active", True),
                        "notes": prod.get("notes", ""),
                        "compatible_models": "",
                        "image_url": "",
                        "created_at": prod.get("created_at") or datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Check if product with same SKU or barcode exists
                    if prod.get("sku"):
                        existing = await tenant_db.products.find_one({"sku": prod.get("sku")})
                        if existing:
                            # Update existing product
                            await tenant_db.products.update_one(
                                {"id": existing["id"]},
                                {"$set": {
                                    "stock": existing.get("stock", 0) + prod.get("stock", 0),
                                    "updated_at": datetime.now(timezone.utc).isoformat()
                                }}
                            )
                            statistics["products"]["imported"] += 1
                            continue
                    
                    await tenant_db.products.insert_one(product_doc)
                    statistics["products"]["imported"] += 1
                except Exception as e:
                    logger.error(f"Error importing product: {e}")
                    statistics["products"]["errors"] += 1
        
        # Import customers
        if "customers" in data:
            for cust in data["customers"]:
                try:
                    new_id = str(uuid.uuid4())
                    customer_doc = {
                        "id": new_id,
                        "name": cust.get("name", ""),
                        "phone": cust.get("phone", "") or cust.get("mobile", ""),
                        "email": cust.get("email", ""),
                        "address": cust.get("address", ""),
                        "city": cust.get("city", ""),
                        "notes": cust.get("notes", ""),
                        "debt_balance": cust.get("account_balance", 0),
                        "total_purchases": cust.get("total_purchased", 0),
                        "is_active": cust.get("is_active", True),
                        "created_at": cust.get("created_at") or datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Check if customer with same phone exists
                    if cust.get("phone"):
                        existing = await tenant_db.customers.find_one({"phone": cust.get("phone")})
                        if existing:
                            statistics["customers"]["imported"] += 1
                            continue
                    
                    await tenant_db.customers.insert_one(customer_doc)
                    statistics["customers"]["imported"] += 1
                except Exception as e:
                    logger.error(f"Error importing customer: {e}")
                    statistics["customers"]["errors"] += 1
        
        # Import suppliers
        if "suppliers" in data:
            for sup in data["suppliers"]:
                try:
                    new_id = str(uuid.uuid4())
                    supplier_doc = {
                        "id": new_id,
                        "name": sup.get("name", ""),
                        "contact_name": sup.get("contact", ""),
                        "phone": sup.get("phone", ""),
                        "email": sup.get("email", ""),
                        "address": sup.get("address", ""),
                        "city": sup.get("city", ""),
                        "notes": sup.get("notes", ""),
                        "debt_balance": sup.get("account_balance", 0),
                        "total_purchases": sup.get("total_purchased", 0),
                        "is_active": sup.get("is_active", True),
                        "created_at": sup.get("created_at") or datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Check if supplier with same name exists
                    existing = await tenant_db.suppliers.find_one({"name": sup.get("name", "")})
                    if existing:
                        statistics["suppliers"]["imported"] += 1
                        continue
                    
                    await tenant_db.suppliers.insert_one(supplier_doc)
                    statistics["suppliers"]["imported"] += 1
                except Exception as e:
                    logger.error(f"Error importing supplier: {e}")
                    statistics["suppliers"]["errors"] += 1
        
        # Log the import
        await main_db.import_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "tenant_name": tenant.get("company_name", ""),
            "filename": file.filename,
            "statistics": statistics,
            "clear_existing": clear_existing,
            "imported_by": admin.get("id"),
            "imported_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {
            "status": "success",
            "message": "Data imported successfully",
            "statistics": statistics
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Import error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        # Cleanup temp file
        if temp_path.exists():
            temp_path.unlink()

@router.get("/import-logs")
async def get_import_logs(
    limit: int = 50,
    admin: dict = Depends(verify_super_admin)
):
    """Get import history logs"""
    logs = await main_db.import_logs.find(
        {},
        {"_id": 0}
    ).sort("imported_at", -1).limit(limit).to_list(length=limit)
    
    return {"logs": logs}

# ============ ACCESS DATABASE CONVERSION ============

@router.post("/convert-access")
async def convert_access_database(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    admin: dict = Depends(verify_super_admin)
):
    """
    Convert Microsoft Access database (.mdb, .accdb, .dblx) to JSON format
    Returns the converted file for download
    """
    # Validate file extension
    valid_extensions = ['.mdb', '.accdb', '.dblx']
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in valid_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Supported: {', '.join(valid_extensions)}"
        )
    
    # Save uploaded file
    temp_db_path = IMPORTS_DIR / f"temp_{uuid.uuid4()}{file_ext}"
    
    try:
        # Save uploaded file
        content = await file.read()
        with open(temp_db_path, 'wb') as f:
            f.write(content)
        
        # Generate output filename - sanitize base_name to prevent path traversal
        import re as _re
        base_name = _re.sub(r'[^\w\-.]', '_', os.path.splitext(file.filename)[0])[:100]
        output_filename = f"{base_name}_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        output_path = EXPORTS_DIR / output_filename
        
        # Verify paths stay within expected directories
        if not str(temp_db_path.resolve()).startswith(str(IMPORTS_DIR.resolve())):
            raise HTTPException(status_code=400, detail="Invalid file path")
        if not str(output_path.resolve()).startswith(str(EXPORTS_DIR.resolve())):
            raise HTTPException(status_code=400, detail="Invalid output path")
        
        # Run conversion script with safe arguments (no shell=True)
        result = subprocess.run(
            ['python', '/app/backend/scripts/convert_access_db.py', str(temp_db_path), str(output_path)],
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )
        
        if result.returncode != 0:
            logger.error(f"Conversion error: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Conversion failed: {result.stderr}")
        
        # Compress the output
        gzip_path = str(output_path) + ".gz"
        with open(output_path, 'rb') as f_in:
            with gzip.open(gzip_path, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        # Get file stats
        json_size = output_path.stat().st_size
        gz_size = Path(gzip_path).stat().st_size
        
        # Read statistics from the output
        with open(output_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            statistics = data.get('metadata', {}).get('statistics', {})
        
        return {
            "status": "success",
            "message": "Database converted successfully",
            "filename": output_filename,
            "compressed_filename": output_filename + ".gz",
            "size_mb": round(json_size / (1024 * 1024), 2),
            "compressed_size_mb": round(gz_size / (1024 * 1024), 2),
            "statistics": statistics,
            "download_url": f"/api/saas/database/download/{output_filename}.gz"
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Conversion timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Conversion error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        # Cleanup temp file
        if temp_db_path.exists():
            temp_db_path.unlink()
