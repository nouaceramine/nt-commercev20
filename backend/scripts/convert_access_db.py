#!/usr/bin/env python3
"""
Script to convert Microsoft Access database (.dblx/.mdb/.accdb) to JSON format
compatible with the NT Commerce system for import into tenant databases.
"""

import subprocess
import json
import csv
import io
import os
from datetime import datetime
from pathlib import Path

def run_mdb_export(db_path: str, table_name: str) -> list:
    """Export a table from Access database to list of dictionaries."""
    try:
        result = subprocess.run(
            ['mdb-export', db_path, table_name],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode != 0:
            print(f"Error exporting {table_name}: {result.stderr}")
            return []
        
        # Parse CSV output
        csv_data = result.stdout
        if not csv_data.strip():
            return []
        
        reader = csv.DictReader(io.StringIO(csv_data))
        return list(reader)
    except Exception as e:
        print(f"Exception exporting {table_name}: {e}")
        return []

def parse_date(date_str: str) -> str:
    """Convert Access date format to ISO format."""
    if not date_str or date_str.strip() == '':
        return None
    try:
        # Format: "04/18/23 14:23:54" or "04/18/23 00:00:00"
        dt = datetime.strptime(date_str, "%m/%d/%y %H:%M:%S")
        return dt.isoformat()
    except:
        try:
            dt = datetime.strptime(date_str, "%m/%d/%Y %H:%M:%S")
            return dt.isoformat()
        except:
            return None

def safe_float(value: str, default=0.0) -> float:
    """Safely convert string to float."""
    try:
        return float(value) if value and value.strip() else default
    except:
        return default

def safe_int(value: str, default=0) -> int:
    """Safely convert string to int."""
    try:
        return int(float(value)) if value and value.strip() else default
    except:
        return default

def safe_bool(value: str) -> bool:
    """Safely convert string to boolean."""
    return value in ['1', 'True', 'true', '1.0']

def convert_categories(raw_categories: list) -> list:
    """Convert ItemFamily to categories format."""
    categories = []
    for cat in raw_categories:
        categories.append({
            "original_id": safe_int(cat.get('ID')),
            "name": cat.get('FamilyName', '').strip(),
            "created_at": parse_date(cat.get('DateCreated')) or datetime.now().isoformat(),
            "updated_at": parse_date(cat.get('DateLastUpdated'))
        })
    return categories

def convert_products(raw_items: list, category_map: dict) -> list:
    """Convert Item to products format."""
    products = []
    for item in raw_items:
        category_id = safe_int(item.get('ItemFamilyID'))
        category_name = category_map.get(category_id, "غير مصنف")
        
        # Build product object matching NT Commerce schema
        product = {
            "original_id": safe_int(item.get('ID')),
            "sku": item.get('ItemNo', '').strip(),
            "name": item.get('ItemName', '').strip(),
            "description": item.get('Description', '').strip() or "",
            "barcode": item.get('BarCode', '').strip() or "",
            "category": category_name,
            "original_category_id": category_id,
            "cost_price": safe_float(item.get('Cost')),
            "last_cost": safe_float(item.get('LastCost')),
            "purchase_price": safe_float(item.get('LastPurchasePrice')),
            "selling_price": safe_float(item.get('Price')),
            "price_a": safe_float(item.get('PriceA')),
            "price_b": safe_float(item.get('PriceB')),
            "price_c": safe_float(item.get('PriceC')),
            "price_d": safe_float(item.get('PriceD')),
            "stock": safe_int(item.get('Stock')),
            "stock_alert": safe_int(item.get('StockAlert'), 5),
            "unit_of_measure_id": safe_int(item.get('UnitOfMeasureID'), 1),
            "is_active": not safe_bool(item.get('Inactive')),
            "non_stock_item": safe_bool(item.get('NonStockItem')),
            "reference": item.get('Reference', '').strip() or "",
            "notes": item.get('Notes', '').strip() or "",
            "bin_location": item.get('BinLocation', '').strip() or "",
            "created_at": parse_date(item.get('DateCreated')) or datetime.now().isoformat(),
            "updated_at": parse_date(item.get('DateLastUpdated')),
            "last_sold": parse_date(item.get('LastSold')),
            "last_purchased": parse_date(item.get('LastPurchased')),
            # Additional barcodes
            "barcodes": [b for b in [
                item.get('BarCodeEx01', '').strip(),
                item.get('BarCodeEx02', '').strip(),
                item.get('BarCodeEx03', '').strip(),
                item.get('BarCodeEx04', '').strip(),
                item.get('BarCodeEx05', '').strip(),
            ] if b]
        }
        products.append(product)
    return products

def convert_customers(raw_customers: list) -> list:
    """Convert Customer to customers format."""
    customers = []
    for cust in raw_customers:
        customer = {
            "original_id": safe_int(cust.get('ID')),
            "customer_no": cust.get('CustomerNo', '').strip(),
            "name": cust.get('CustomerName', '').strip() or "عميل",
            "company": cust.get('Company', '').strip() or "",
            "phone": cust.get('Phone', '').strip() or "",
            "mobile": cust.get('Mobile', '').strip() or "",
            "email": cust.get('Email', '').strip() or "",
            "address": cust.get('Address1', '').strip() or "",
            "address2": cust.get('Address2', '').strip() or "",
            "city": cust.get('City', '').strip() or "",
            "notes": cust.get('Notes', '').strip() or "",
            "account_balance": safe_float(cust.get('Account')),
            "initial_account": safe_float(cust.get('InitialAccount')),
            "total_purchased": safe_float(cust.get('TotalPurchased')),
            "is_active": not safe_bool(cust.get('Inactive')),
            "price_level_id": safe_int(cust.get('PriceLevelID'), 1),
            "created_at": parse_date(cust.get('DateCreated')) or datetime.now().isoformat(),
            "updated_at": parse_date(cust.get('DateLastUpdated'))
        }
        customers.append(customer)
    return customers

def convert_suppliers(raw_suppliers: list) -> list:
    """Convert Supplier to suppliers format."""
    suppliers = []
    for sup in raw_suppliers:
        supplier = {
            "original_id": safe_int(sup.get('ID')),
            "supplier_no": sup.get('SupplierNo', '').strip(),
            "name": sup.get('SupplierName', '').strip() or "مورد",
            "contact": sup.get('Contact', '').strip() or "",
            "phone": sup.get('Phone', '').strip() or "",
            "fax": sup.get('Fax', '').strip() or "",
            "email": sup.get('Email', '').strip() or "",
            "address": sup.get('Address1', '').strip() or "",
            "address2": sup.get('Address2', '').strip() or "",
            "city": sup.get('City', '').strip() or "",
            "notes": sup.get('Notes', '').strip() or "",
            "account_balance": safe_float(sup.get('Account')),
            "initial_account": safe_float(sup.get('InitialAccount')),
            "total_purchased": safe_float(sup.get('TotalPurchased')),
            "is_active": not safe_bool(sup.get('Inactive')),
            "created_at": parse_date(sup.get('DateCreated')) or datetime.now().isoformat(),
            "updated_at": parse_date(sup.get('DateLastUpdated'))
        }
        suppliers.append(supplier)
    return suppliers

def convert_sales(raw_receipts: list, raw_entries: list, customer_map: dict) -> list:
    """Convert Receipt and ReceiptEntry to sales format."""
    # Build entries map by receipt ID
    entries_map = {}
    for entry in raw_entries:
        receipt_id = safe_int(entry.get('ReceiptID'))
        if receipt_id not in entries_map:
            entries_map[receipt_id] = []
        entries_map[receipt_id].append({
            "original_item_id": safe_int(entry.get('ItemID')),
            "item_name": entry.get('ItemName', '').strip(),
            "quantity": safe_float(entry.get('Qty')),
            "unit_price": safe_float(entry.get('UnitPrice')),
            "cost_price": safe_float(entry.get('UnitCost')),
            "discount": safe_float(entry.get('Discount')),
            "total": safe_float(entry.get('Total'))
        })
    
    sales = []
    for receipt in raw_receipts:
        receipt_id = safe_int(receipt.get('ID'))
        customer_id = safe_int(receipt.get('CustomerID'))
        
        sale = {
            "original_id": receipt_id,
            "receipt_no": receipt.get('ReceiptNo', '').strip(),
            "receipt_type": safe_int(receipt.get('ReceiptType')),
            "customer_name": customer_map.get(customer_id, "عميل نقدي"),
            "original_customer_id": customer_id,
            "employee_id": safe_int(receipt.get('EmployeeID')),
            "subtotal": safe_float(receipt.get('SubTotal')),
            "discount": safe_float(receipt.get('Discount')),
            "discount_rate": safe_float(receipt.get('DiscountRate')),
            "vat": safe_float(receipt.get('VAT')),
            "total": safe_float(receipt.get('Total')),
            "total_cost": safe_float(receipt.get('TotalCost')),
            "margin": safe_float(receipt.get('Margin')),
            "cash": safe_float(receipt.get('Cash')),
            "payment_total": safe_float(receipt.get('PaymentTotal')),
            "total_qty": safe_float(receipt.get('TotalQty')),
            "comment": receipt.get('Comment', '').strip() or "",
            "items": entries_map.get(receipt_id, []),
            "created_at": parse_date(receipt.get('Time')) or parse_date(receipt.get('DateCreated')),
            "updated_at": parse_date(receipt.get('DateLastUpdated'))
        }
        sales.append(sale)
    return sales

def convert_database(db_path: str, output_path: str = None) -> dict:
    """Main function to convert Access database to JSON."""
    print(f"Converting database: {db_path}")
    
    # Get all tables
    result = subprocess.run(['mdb-tables', '-1', db_path], capture_output=True, text=True)
    tables = result.stdout.strip().split('\n')
    print(f"Found {len(tables)} tables: {tables}")
    
    # Export required tables
    print("Exporting ItemFamily (categories)...")
    raw_categories = run_mdb_export(db_path, 'ItemFamily')
    
    print("Exporting Item (products)...")
    raw_items = run_mdb_export(db_path, 'Item')
    
    print("Exporting Customer...")
    raw_customers = run_mdb_export(db_path, 'Customer')
    
    print("Exporting Supplier...")
    raw_suppliers = run_mdb_export(db_path, 'Supplier')
    
    print("Exporting Receipt (sales)...")
    raw_receipts = run_mdb_export(db_path, 'Receipt')
    
    print("Exporting ReceiptEntry (sale items)...")
    raw_entries = run_mdb_export(db_path, 'ReceiptEntry')
    
    # Build lookup maps
    category_map = {safe_int(c['ID']): c['FamilyName'] for c in raw_categories}
    customer_map = {safe_int(c['ID']): c.get('CustomerName', 'عميل') for c in raw_customers}
    
    # Convert to target format
    print("Converting categories...")
    categories = convert_categories(raw_categories)
    
    print("Converting products...")
    products = convert_products(raw_items, category_map)
    
    print("Converting customers...")
    customers = convert_customers(raw_customers)
    
    print("Converting suppliers...")
    suppliers = convert_suppliers(raw_suppliers)
    
    print("Converting sales...")
    sales = convert_sales(raw_receipts, raw_entries, customer_map)
    
    # Build final export object
    export_data = {
        "metadata": {
            "source_file": os.path.basename(db_path),
            "export_date": datetime.now().isoformat(),
            "format_version": "1.0",
            "source_type": "Microsoft Access Database",
            "statistics": {
                "categories": len(categories),
                "products": len(products),
                "customers": len(customers),
                "suppliers": len(suppliers),
                "sales": len(sales)
            }
        },
        "categories": categories,
        "products": products,
        "customers": customers,
        "suppliers": suppliers,
        "sales": sales
    }
    
    # Save to file if output path provided
    if output_path:
        print(f"Saving to {output_path}...")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)
        
        # Get file size
        file_size = os.path.getsize(output_path)
        print(f"Export complete! File size: {file_size / (1024*1024):.2f} MB")
    
    return export_data

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python convert_access_db.py <database_file> [output_file]")
        sys.exit(1)
    
    db_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not output_file:
        base_name = os.path.splitext(os.path.basename(db_file))[0]
        output_file = f"/app/exports/{base_name}_export.json"
        os.makedirs("/app/exports", exist_ok=True)
    
    result = convert_database(db_file, output_file)
    print(f"\nSummary:")
    print(f"  Categories: {len(result['categories'])}")
    print(f"  Products: {len(result['products'])}")
    print(f"  Customers: {len(result['customers'])}")
    print(f"  Suppliers: {len(result['suppliers'])}")
    print(f"  Sales: {len(result['sales'])}")
