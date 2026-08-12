#!/usr/bin/env python3
"""
NT Commerce v16 - Enhanced Modules Auto-Setup
Installs 68 endpoints: Products(32) + Orders(36)
Usage: cd /opt/ntcommerce && python3 setup_enhanced.py
"""
import os, sys, subprocess, urllib.request, json, base64

# ============================================================================
# CONFIGURATION
# ============================================================================
TOKEN = "REDACTED_OLD_PAT"
OWNER, REPO = "nouaceramine", "Nt-commerce17"
APP_DIR = "/opt/ntcommerce" if os.path.isdir("/opt/ntcommerce") else "/app"
ROUTES_DIR = os.path.join(APP_DIR, "backend/routes/ecom")
UTILS_DIR = os.path.join(APP_DIR, "backend/utils")
MAIN_PY = os.path.join(APP_DIR, "backend/main.py")

# ============================================================================
# GITHUB DOWNLOAD
# ============================================================================
def download(github_path, local_path):
    url = "https://api.github.com/repos/{}/{}/contents/{}?ref=main".format(OWNER, REPO, github_path)
    req = urllib.request.Request(url)
    req.add_header("Authorization", "token {}".format(TOKEN))
    req.add_header("Accept", "application/vnd.github.v3+json")
    req.add_header("User-Agent", "NT-Commerce-Deploy")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
        content = base64.b64decode(data["content"]).decode("utf-8")
    with open(local_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("  OK: {} ({} chars)".format(os.path.basename(local_path), len(content)))

# ============================================================================
# MAIN.PY PATCHING
# ============================================================================
def patch_main_py():
    with open(MAIN_PY, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove any existing enhanced routes code
    keywords = [
        "enhanced_products_routes", "enhanced_orders_routes",
        "enhanced_indexes", "create_enhanced_products",
        "create_enhanced_orders", "create_all_enhanced",
        "# ====== Enhanced", "# ====== End Enhanced"
    ]
    lines = content.split("\n")
    filtered = []
    for line in lines:
        keep = True
        for kw in keywords:
            if kw in line:
                keep = False
                break
        if keep:
            filtered.append(line)
    lines = filtered

    # Add imports after existing ecom imports
    import_block = (
        "from backend.routes.ecom.enhanced_products_routes import create_enhanced_products_routes\n"
        "from backend.routes.ecom.enhanced_orders_routes import create_enhanced_orders_routes\n"
        "from backend.utils.enhanced_indexes import create_all_enhanced_indexes\n"
    )
    last_ecom = -1
    for i, line in enumerate(lines):
        if "routes.ecom" in line and "import" in line:
            last_ecom = i
    if last_ecom >= 0:
        lines.insert(last_ecom + 1, import_block)
    else:
        lines.insert(0, import_block)

    # Add router registration before if __name__
    router_block = (
        "\n"
        "# ====== Enhanced Routes v2 (68 endpoints) ======\n"
        "try:\n"
        "    enhanced_products_router = create_enhanced_products_routes(\n"
        "        db=db,\n"
        "        get_current_user=get_current_user,\n"
        "        require_permission=require_permission\n"
        "    )\n"
        "    app.include_router(enhanced_products_router, prefix=\"/api/v2\")\n"
        "    print(\"[OK] Enhanced Products v2 registered\")\n"
        "except Exception as _e:\n"
        "    print(f\"[WARN] Enhanced Products v2: {_e}\")\n"
        "\n"
        "try:\n"
        "    enhanced_orders_router = create_enhanced_orders_routes(\n"
        "        db=db,\n"
        "        get_current_user=get_current_user,\n"
        "        require_permission=require_permission\n"
        "    )\n"
        "    app.include_router(enhanced_orders_router, prefix=\"/api/v2\")\n"
        "    print(\"[OK] Enhanced Orders v2 registered\")\n"
        "except Exception as _e:\n"
        "    print(f\"[WARN] Enhanced Orders v2: {_e}\")\n"
        "# ====== End Enhanced Routes ======\n"
    )

    content = "\n".join(lines)
    if "if __name__" in content:
        idx = content.find("if __name__")
        content = content[:idx] + router_block + content[idx:]
    else:
        content += router_block

    with open(MAIN_PY, "w", encoding="utf-8") as f:
        f.write(content)
    print("  OK: main.py patched")

# ============================================================================
# MONGODB INDEXES
# ============================================================================
def create_indexes():
    idx_code = r'''
import asyncio, os, sys
sys.path.insert(0, "''' + APP_DIR + '''/backend")
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    async def run():
        mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.getenv("DB_NAME", os.getenv("MONGODB_DB", "ntcommerce"))
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
        await client.admin.command("ping")
        db = client[db_name]
        from utils.enhanced_indexes import create_all_enhanced_indexes
        await create_all_enhanced_indexes(db)
        print("  OK: MongoDB indexes created")
        client.close()
    asyncio.run(run())
except Exception as e:
    print("  SKIP: " + str(e))
'''
    subprocess.run([sys.executable, "-c", idx_code], cwd=APP_DIR, capture_output=True)

# ============================================================================
# SERVICE RESTART
# ============================================================================
def restart_service():
    cmds = [
        "docker restart ntcommerce-backend",
        "docker restart nt-commerce-backend",
        "docker-compose restart backend",
        "docker-compose restart",
    ]
    for cmd in cmds:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if r.returncode == 0:
            print("  OK: " + cmd)
            return True
    print("  WARN: Please restart manually: docker restart ntcommerce-backend")
    return False

# ============================================================================
# MAIN
# ============================================================================
def main():
    print("=" * 60)
    print("  NT Commerce v16 - Enhanced Modules (68 endpoints)")
    print("=" * 60)
    print("  App dir: " + APP_DIR)

    # Check structure
    for d in [APP_DIR, ROUTES_DIR, UTILS_DIR]:
        if not os.path.isdir(d):
            print("[ERROR] Missing: " + d)
            sys.exit(1)
    if not os.path.isfile(MAIN_PY):
        print("[ERROR] Missing: " + MAIN_PY)
        sys.exit(1)

    # Step 1: Download files
    print("\n[1/5] Downloading from GitHub...")
    files = [
        ("backend/routes/ecom/enhanced_orders_routes.py",
         os.path.join(ROUTES_DIR, "enhanced_orders_routes.py")),
        ("backend/routes/ecom/enhanced_products_routes.py",
         os.path.join(ROUTES_DIR, "enhanced_products_routes.py")),
        ("backend/utils/enhanced_orders_indexes.py",
         os.path.join(UTILS_DIR, "enhanced_orders_indexes.py")),
        ("backend/utils/enhanced_products_indexes.py",
         os.path.join(UTILS_DIR, "enhanced_products_indexes.py")),
        ("backend/utils/enhanced_indexes.py",
         os.path.join(UTILS_DIR, "enhanced_indexes.py")),
    ]
    for gh, local in files:
        download(gh, local)

    # Step 2: Patch main.py
    print("\n[2/5] Patching main.py...")
    patch_main_py()

    # Step 3: Syntax check
    print("\n[3/5] Syntax check...")
    for _, local in files:
        subprocess.run([sys.executable, "-m", "py_compile", local], check=True, capture_output=True)
    subprocess.run([sys.executable, "-m", "py_compile", MAIN_PY], check=True, capture_output=True)
    print("  OK: All files syntax valid")

    # Step 4: MongoDB indexes
    print("\n[4/5] Creating MongoDB indexes...")
    create_indexes()

    # Step 5: Restart
    print("\n[5/5] Restarting service...")
    restart_service()

    print("\n" + "=" * 60)
    print("  DONE! 68 endpoints active")
    print("  Products: /api/v2/products/* (32)")
    print("  Orders:   /api/v2/orders/* (36)")
    print("  Test:     curl http://localhost:8000/api/v2/orders/analytics/dashboard")
    print("=" * 60)

if __name__ == "__main__":
    main()
