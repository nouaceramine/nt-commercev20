"""Mother-tree registry (p34, gap 3).

Formalizes the platform's database hierarchy as an explicit tree, stored in
main_db.platform_db_tree and refreshed weekly by the data-integrity robot:

    ntcommerce (MOTHER — super admin / platform)
      └── template_tenant (MODEL — golden template, child provisioner)
      └── tenant_<uuid> (BRANCH per subscriber)
            └── per-tenant collections (leaves, not expanded here)

Every node records its parent, role, size and health, so the motherboard can
render the real topology instead of a flat database list.
"""
import logging
from datetime import datetime, timezone

from config.database import client, main_db
from core.db_naming import resolve_db_name  # p347

logger = logging.getLogger(__name__)

MOTHER_DB = "ntcommerce"
TEMPLATE_DB = "template_tenant"
STORE_TEMPLATE_DB = "store_template"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _db_stats(name: str) -> dict:
    try:
        st = await client[name].command("dbStats")
        return {
            "size_mb": round(st.get("dataSize", 0) / 1048576, 2),
            "collections": st.get("collections", 0),
            "objects": st.get("objects", 0),
        }
    except Exception:
        return {"size_mb": 0, "collections": 0, "objects": 0}


async def rebuild_tree() -> dict:
    """Rescan Mongo and rewrite the whole tree (idempotent, full replace)."""
    now = _now()
    nodes = []

    # Mother node
    mother = {"node_id": MOTHER_DB, "db_name": MOTHER_DB, "role": "mother",
              "parent": None, "label": "قاعدة المنصة الأم (سوبر أدمن)", "updated_at": now}
    mother.update(await _db_stats(MOTHER_DB))
    nodes.append(mother)

    # Template nodes — children of mother
    for tpl_name, label in ((TEMPLATE_DB, "النموذج الذهبي"),
                            (STORE_TEMPLATE_DB, "نموذج المتجر الإلكتروني")):
        tpl = {"node_id": tpl_name, "db_name": tpl_name, "role": "template",
               "parent": MOTHER_DB, "label": label, "updated_at": now}
        tpl.update(await _db_stats(tpl_name))
        nodes.append(tpl)

    # Tenant branches — children of mother, provisioned from the template
    db_names = set(await client.list_database_names())
    async for t in main_db.saas_tenants.find(
        {}, {"_id": 0, "id": 1, "name": 1, "email": 1, "short_id": 1,
             "is_active": 1, "is_demo": 1, "created_at": 1}
    ):
        db_name = resolve_db_name(t['id'])
        node = {
            "node_id": db_name,
            "db_name": db_name,
            "role": "demo" if t.get("is_demo") else "tenant",
            "parent": MOTHER_DB,
            "provisioned_from": TEMPLATE_DB,
            "tenant_id": t["id"],
            "label": t.get("name") or t.get("email"),
            "short_id": t.get("short_id"),
            "is_active": t.get("is_active", True),
            "exists": db_name in db_names,
            "created_at": t.get("created_at"),
            "updated_at": now,
        }
        if node["exists"]:
            node.update(await _db_stats(db_name))
        nodes.append(node)

    # Orphan branches: tenant_* DBs with no saas_tenants record
    registered = {n["db_name"] for n in nodes}
    for name in sorted(db_names):
        if name.startswith("tenant_") and name not in registered:
            orphan = {"node_id": name, "db_name": name, "role": "orphan",
                      "parent": MOTHER_DB, "label": "قاعدة يتيمة (بلا سجل مستأجر)",
                      "exists": True, "updated_at": now}
            orphan.update(await _db_stats(name))
            nodes.append(orphan)

    await main_db.platform_db_tree.delete_many({})
    if nodes:
        await main_db.platform_db_tree.insert_many([dict(n) for n in nodes])
    logger.info(f"db tree rebuilt: {len(nodes)} nodes")
    return {"rebuilt_at": now, "nodes": len(nodes)}


async def get_tree() -> dict:
    """Return the stored tree, newest-first roots then children."""
    nodes = []
    async for n in main_db.platform_db_tree.find({}, {"_id": 0}):
        nodes.append(n)
    if not nodes:
        await rebuild_tree()
        async for n in main_db.platform_db_tree.find({}, {"_id": 0}):
            nodes.append(n)
    by_role = {}
    for n in nodes:
        by_role.setdefault(n["role"], []).append(n)
    return {
        "mother": by_role.get("mother", []),
        "template": by_role.get("template", []),
        "tenants": by_role.get("tenant", []),
        "demo": by_role.get("demo", []),
        "orphans": by_role.get("orphan", []),
        "total_nodes": len(nodes),
    }
