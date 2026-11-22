"""
Task Management & Internal Chat Routes
Collections: tasks, task_comments, chat_rooms, chat_messages
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid


def create_task_routes(db, get_current_user, get_tenant_admin) -> dict:
    from utils.permissions import create_cashier_block
    block_cashier = create_cashier_block(get_current_user)  # p531: /task-management hidden from cashier in UI
    router = APIRouter(prefix="/tasks", tags=["tasks"])

    class TaskCreate(BaseModel):
        title_ar: str
        title_fr: str = ""
        description_ar: str = ""
        description_fr: str = ""
        task_type: str = "general"
        priority: str = "medium"
        due_date: Optional[str] = None
        assigned_to: Optional[str] = None

    @router.post("")
    async def create_task(data: TaskCreate, user: dict = Depends(block_cashier)):  # p531
        if not (data.title_ar or "").strip():
            raise HTTPException(status_code=400, detail="عنوان المهمة مطلوب")
        from services.code_generator import next_code
        task_number = await next_code(db, "tasks", "TASK-", 4, False, field="task_number")
        task = {
            "id": str(uuid.uuid4()),
            "task_number": task_number,
            **data.dict(),
            "status": "pending",
            "progress": 0,
            "created_by": user.get("name", user.get("email", "")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tasks.insert_one(task)
        task.pop("_id", None)
        return task

    @router.get("")
    async def get_tasks(
        status: Optional[str] = None,
        priority: Optional[str] = None,
        assigned_to: Optional[str] = None,
        user: dict = Depends(block_cashier)  # p531
    ):
        query = {}
        if status:
            query["status"] = status
        if priority:
            query["priority"] = priority
        if assigned_to:
            query["assigned_to"] = assigned_to
        return await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.get("/{task_id}")
    async def get_task(task_id: str, user: dict = Depends(block_cashier)):  # p531
        task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
        if not task:
            raise HTTPException(status_code=404, detail="المهمة غير موجودة")
        comments = await db.task_comments.find({"task_id": task_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
        task["comments"] = comments
        return task

    @router.put("/{task_id}")
    async def update_task(task_id: str, data: dict, user: dict = Depends(block_cashier)):  # p531
        data.pop("id", None)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.tasks.update_one({"id": task_id}, {"$set": data})
        if res.matched_count == 0:  # p531: no phantom-200 on unknown task id
            raise HTTPException(status_code=404, detail="المهمة غير موجودة")
        return await db.tasks.find_one({"id": task_id}, {"_id": 0})

    @router.delete("/{task_id}")
    async def delete_task(task_id: str, admin: dict = Depends(get_tenant_admin)):
        res = await db.tasks.delete_one({"id": task_id})
        if res.deleted_count == 0:  # p531
            raise HTTPException(status_code=404, detail="المهمة غير موجودة")
        await db.task_comments.delete_many({"task_id": task_id})
        return {"message": "تم حذف المهمة"}

    @router.post("/{task_id}/comments")
    async def add_comment(task_id: str, data: dict, user: dict = Depends(block_cashier)):  # p531
        task = await db.tasks.find_one({"id": task_id}, {"_id": 0, "id": 1})
        if not task:
            raise HTTPException(status_code=404, detail="المهمة غير موجودة")
        content = (data.get("content") or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="التعليق فارغ")
        comment = {
            "id": str(uuid.uuid4()),
            "task_id": task_id,
            "user_id": user.get("id", ""),
            "user_name": user.get("name", user.get("email", "")),
            "content": content,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.task_comments.insert_one(comment)
        comment.pop("_id", None)
        return comment

    @router.get("/stats/summary")
    async def get_task_stats(user: dict = Depends(block_cashier)):  # p531
        total = await db.tasks.count_documents({})
        pending = await db.tasks.count_documents({"status": "pending"})
        in_progress = await db.tasks.count_documents({"status": "in_progress"})
        completed = await db.tasks.count_documents({"status": "completed"})
        return {"total": total, "pending": pending, "in_progress": in_progress, "completed": completed}

    return router


def create_chat_routes(db, get_current_user) -> dict:
    from utils.permissions import create_cashier_block
    block_cashier = create_cashier_block(get_current_user)  # p531: /internal-chat hidden from cashier in UI
    router = APIRouter(prefix="/chat", tags=["chat"])

    async def _member_room(room_id: str, uid: str) -> dict:
        """Room must exist and the caller must be a member/creator."""
        room = await db.chat_rooms.find_one({"id": room_id}, {"_id": 0})
        members = room.get("members") or [] if room else []
        if not room or (uid not in members and uid != room.get("created_by")):
            raise HTTPException(status_code=404, detail="الغرفة غير موجودة")
        return room

    @router.post("/rooms")
    async def create_room(data: dict, user: dict = Depends(block_cashier)):  # p531
        raw_members = data.get("members") if isinstance(data.get("members"), list) else []
        members = list(dict.fromkeys([user.get("id")] + raw_members))
        others = [m for m in members if m != user.get("id")]
        if others:  # p550: rooms may only contain real active users of THIS tenant
            valid = await db.users.find(
                {"id": {"$in": others}, "is_active": {"$ne": False}}, {"_id": 0, "id": 1}
            ).to_list(None)
            valid_ids = {u.get("id") for u in valid}
            if any(m not in valid_ids for m in others):
                raise HTTPException(status_code=400, detail="عضو الغرفة غير موجود")
        room = {
            "id": str(uuid.uuid4()),
            "name_ar": data.get("name_ar", "غرفة جديدة"),
            "name_fr": data.get("name_fr", ""),
            "members": members,
            "created_by": user.get("id", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.chat_rooms.insert_one(room)
        room.pop("_id", None)
        return room

    @router.get("/rooms")
    async def get_rooms(user: dict = Depends(block_cashier)):  # p531
        uid = user.get("id", "")
        rooms = await db.chat_rooms.find(
            {"$or": [{"members": uid}, {"created_by": uid}]}, {"_id": 0}
        ).to_list(50)
        for room in rooms:
            last = await db.chat_messages.find({"room_id": room["id"]}, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
            room["last_message"] = last[0] if last else None
            room["unread"] = await db.chat_messages.count_documents({
                "room_id": room["id"],
                "read_by": {"$nin": [uid]},
            })
        return rooms

    @router.get("/rooms/{room_id}/messages")
    async def get_messages(room_id: str, limit: int = 50, user: dict = Depends(block_cashier)):  # p531
        uid = user.get("id", "")
        await _member_room(room_id, uid)
        # p550: fetching the thread IS the read receipt — the unread badge used
        # to stay >0 forever because nothing ever added the reader to read_by.
        await db.chat_messages.update_many(
            {"room_id": room_id, "read_by": {"$nin": [uid]}},
            {"$addToSet": {"read_by": uid}}
        )
        return await db.chat_messages.find(
            {"room_id": room_id}, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)

    @router.post("/rooms/{room_id}/messages")
    async def send_message(room_id: str, data: dict, user: dict = Depends(block_cashier)):  # p531
        await _member_room(room_id, user.get("id", ""))
        content = (data.get("content") or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="الرسالة فارغة")
        msg = {
            "id": str(uuid.uuid4()),
            "room_id": room_id,
            "user_id": user.get("id", ""),
            "user_name": user.get("name", user.get("email", "")),
            "content": content,
            "read_by": [user.get("id", "")],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.chat_messages.insert_one(msg)
        msg.pop("_id", None)
        return msg

    return router
