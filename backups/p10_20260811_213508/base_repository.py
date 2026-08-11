
"""BaseRepository - Generic CRUD operations for MongoDB"""
from motor.motor_asyncio import AsyncIOMotorCollection
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

class BaseRepository:
    def __init__(self, collection: AsyncIOMotorCollection):
        self.collection = collection

    async def find_all(self, skip: int = 0, limit: int = 100, sort_field: str = None, sort_dir: int = -1) -> List[Dict[str, Any]]:
        cursor = self.collection.find()
        if sort_field:
            cursor = cursor.sort(sort_field, sort_dir)
        items = await cursor.skip(skip).limit(limit).to_list(limit)
        for item in items:
            item["_id"] = str(item.get("_id", ""))
        return items

    async def find_by_id(self, entity_id: str, id_field: str = "id") -> Optional[Dict[str, Any]]:
        item = await self.collection.find_one({id_field: entity_id})
        if item:
            item["_id"] = str(item.get("_id", ""))
        return item

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        item = await self.collection.find_one(query)
        if item:
            item["_id"] = str(item.get("_id", ""))
        return item

    async def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        if "id" not in data:
            data["id"] = str(uuid.uuid4())
        data["created_at"] = datetime.now(timezone.utc)
        result = await self.collection.insert_one(data)
        data["_id"] = str(result.inserted_id)
        return data

    async def update(self, entity_id: str, data: Dict[str, Any], id_field: str = "id") -> bool:
        data["updated_at"] = datetime.now(timezone.utc)
        result = await self.collection.update_one({id_field: entity_id}, {"$set": data})
        return result.modified_count > 0

    async def delete(self, entity_id: str, id_field: str = "id") -> bool:
        result = await self.collection.delete_one({id_field: entity_id})
        return result.deleted_count > 0

    async def count(self, query: Dict[str, Any] = None) -> int:
        return await self.collection.count_documents(query or {})

    async def search(self, search_field: str, search_term: str, limit: int = 100) -> List[Dict[str, Any]]:
        query = {search_field: {"$regex": search_term, "$options": "i"}}
        items = await self.collection.find(query).limit(limit).to_list(limit)
        for item in items:
            item["_id"] = str(item.get("_id", ""))
        return items
