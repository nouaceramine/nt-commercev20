"""
Permission Enforcement Middleware
Provides require_permission() and create_cashier_block() dependencies for route-level access control.
"""
from fastapi import Depends, HTTPException
from typing import Callable


def create_cashier_block(get_current_user) -> Callable:
    """
    Factory that returns a FastAPI dependency which raises HTTP 403 if the
    authenticated user has the 'cashier' role.

    Usage inside a route factory:
        block_cashier = create_cashier_block(get_current_user)

        @router.get("/wallet")
        async def get_wallet(user: dict = Depends(block_cashier)):
            ...
    """
    async def _block_cashier(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") == "cashier":
            raise HTTPException(
                status_code=403,
                detail={
                    "message": "غير مصرح — هذا القسم محجوب عن الكاشير",
                    "code": "CASHIER_ACCESS_DENIED",
                }
            )
        return current_user

    return _block_cashier


def create_permission_checker(db, get_current_user) -> Callable:
    """
    Factory that creates a permission checker bound to db and auth.
    Returns a require_permission function that can be used as a FastAPI dependency.
    
    Usage:
        require_permission = create_permission_checker(db, get_current_user)
        
        @router.get("/products", dependencies=[Depends(require_permission("products.view"))])
        async def get_products():
            ...
    """
    
    def require_permission(*permissions: str) -> Callable:
        """
        Create a dependency that checks if the user has ALL required permissions.
        Admin roles (admin, tenant_admin, manager) bypass permission checks.
        
        Args:
            permissions: One or more permission strings like "products.view", "sales.create"
        """
        async def _check(current_user: dict = Depends(get_current_user)) -> dict:
            role = current_user.get("role", "")
            
            # Admin roles always have full access
            if role in ("admin", "tenant_admin", "super_admin", "manager", "owner"):
                return current_user
            
            # Collect user's effective permissions
            effective_perms = set()
            
            # 1. Direct user permissions (from user document)
            user_perms = current_user.get("permissions", {})
            if isinstance(user_perms, dict):
                for module, perms in user_perms.items():
                    if isinstance(perms, list):
                        for p in perms:
                            effective_perms.add(f"{module}.{p}")
            elif isinstance(user_perms, list):
                effective_perms.update(user_perms)
            
            # 2. Role-based permissions (from assigned role)
            role_id = current_user.get("role_id") or current_user.get("custom_role_id")
            if role_id:
                role_doc = await db.roles.find_one({"id": role_id}, {"_id": 0})
                if role_doc:
                    role_perms = role_doc.get("permissions", [])
                    if isinstance(role_perms, list):
                        effective_perms.update(role_perms)
            
            # Check all required permissions
            missing = [p for p in permissions if p not in effective_perms]
            if missing:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "message": "ليس لديك الصلاحية المطلوبة",
                        "missing_permissions": missing,
                        "user_role": role
                    }
                )
            
            return current_user
        
        return _check
    
    return require_permission
