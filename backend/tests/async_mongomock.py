import mongomock
from unittest.mock import AsyncMock
import asyncio

class AsyncCollectionWrapper:
    def __init__(self, collection):
        self._collection = collection

    def __getattr__(self, name):
        attr = getattr(self._collection, name)
        if callable(attr):
            async def wrapper(*args, **kwargs):
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, lambda: attr(*args, **kwargs))
            return wrapper
        return attr

    def find(self, *args, **kwargs):
        return AsyncCursorWrapper(self._collection.find(*args, **kwargs))

    def aggregate(self, *args, **kwargs):
        return AsyncCursorWrapper(self._collection.aggregate(*args, **kwargs))

class AsyncCursorWrapper:
    def __init__(self, cursor):
        self._cursor = cursor

    def __getattr__(self, name):
        attr = getattr(self._cursor, name)
        if callable(attr):
            async def wrapper(*args, **kwargs):
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, lambda: attr(*args, **kwargs))
            return wrapper
        return attr

    async def to_list(self, length):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: list(self._cursor)[:length])

class AsyncMongoMockClient:
    def __init__(self):
        self._client = mongomock.MongoClient()

    def __getitem__(self, name):
        db = self._client[name]
        return AsyncDatabaseWrapper(db)

    def __getattr__(self, name):
        return AsyncDatabaseWrapper(getattr(self._client, name))

class AsyncDatabaseWrapper:
    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        attr = getattr(self._db, name)
        if hasattr(attr, 'find_one'):  # It's a collection
            return AsyncCollectionWrapper(attr)
        return attr

    def __getitem__(self, name):
        return AsyncCollectionWrapper(self._db[name])
