"""
Task Management & Internal Chat Routes
Collections: tasks, task_comments, chat_rooms, chat_messages
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def create_task_routes(db, get_current_user, get_tenant_admin) -> dict:
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
    async def create_task(data: TaskCreate, user: dict = Depends(get_current_user)):
        count = await db.tasks.count_documents({}) + 1
        task = {
            "id": str(uuid.uuid4()),
            "task_number": f"TASK-{count:04d}",
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
        user: dict = Depends(get_current_user)
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
    async def get_task(task_id: str, user: dict = Depends(get_current_user)):
        task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
        if not task:
            raise HTTPException(status_code=404, detail="المهمة غير موجودة")
        comments = await db.task_comments.find({"task_id": task_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
        task["comments"] = comments
        return task

    @router.put("/{task_id}")
    async def update_task(task_id: str, data: dict, user: dict = Depends(get_current_user)):
        data.pop("id", None)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.tasks.update_one({"id": task_id}, {"$set": data})
        return await db.tasks.find_one({"id": task_id}, {"_id": 0})

    @router.delete("/{task_id}")
    async def delete_task(task_id: str, admin: dict = Depends(get_tenant_admin)):
        await db.tasks.delete_one({"id": task_id})
        await db.task_comments.delete_many({"task_id": task_id})
        return {"message": "تم حذف المهمة"}

    @router.post("/{task_id}/comments")
    async def add_comment(task_id: str, data: dict, user: dict = Depends(get_current_user)):
        comment = {
            "id": str(uuid.uuid4()),
            "task_id": task_id,
            "user_id": user.get("id", ""),
            "user_name": user.get("name", user.get("email", "")),
            "content": data.get("content", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.task_comments.insert_one(comment)
        comment.pop("_id", None)
        return comment

    @router.get("/stats/summary")
    async def get_task_stats(user: dict = Depends(get_current_user)):
        total = await db.tasks.count_documents({})
        pending = await db.tasks.count_documents({"status": "pending"})
        in_progress = await db.tasks.count_documents({"status": "in_progress"})
        completed = await db.tasks.count_documents({"status": "completed"})
        return {"total": total, "pending": pending, "in_progress": in_progress, "completed": completed}

    return router


def create_chat_routes(db, get_current_user) -> dict:
    router = APIRouter(prefix="/chat", tags=["chat"])

    @router.post("/rooms")
    async def create_room(data: dict, user: dict = Depends(get_current_user)):
        room = {
            "id": str(uuid.uuid4()),
            "name_ar": data.get("name_ar", "غرفة جديدة"),
            "name_fr": data.get("name_fr", ""),
            "members": data.get("members", [user.get("id")]),
            "created_by": user.get("id", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.chat_rooms.insert_one(room)
        room.pop("_id", None)
        return room

    @router.get("/rooms")
    async def get_rooms(user: dict = Depends(get_current_user)):
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
    async def get_messages(room_id: str, limit: int = 50, user: dict = Depends(get_current_user)):
        return await db.chat_messages.find(
            {"room_id": room_id}, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)

    @router.post("/rooms/{room_id}/messages")
    async def send_message(room_id: str, data: dict, user: dict = Depends(get_current_user)):
        msg = {
            "id": str(uuid.uuid4()),
            "room_id": room_id,
            "user_id": user.get("id", ""),
            "user_name": user.get("name", user.get("email", "")),
            "content": data.get("content", ""),
            "read_by": [user.get("id", "")],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.chat_messages.insert_one(msg)
        msg.pop("_id", None)
        return msg

    return router
