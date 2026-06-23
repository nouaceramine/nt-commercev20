"""
Safe Wrapper for Emergent Integrations
Provides fallback when library is unavailable (e.g., Cloudflare deployment)
"""
import os
import logging

logger = logging.getLogger(__name__)

EMERGENT_AVAILABLE = False

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    EMERGENT_AVAILABLE = True
    logger.info("Emergent integrations loaded successfully")
except ImportError as e:
    logger.warning(f"Emergent integrations not available: {e}")

    class UserMessage:
        def __init__(self, text="", file_contents=None):
            self.text = text
            self.file_contents = file_contents or []

    class ImageContent:
        def __init__(self, image_base64=""):
            self.image_base64 = image_base64

    class LlmChat:
        def __init__(self, *args, **kwargs):
            pass

        async def send_message(self, *args, **kwargs) -> dict:
            return "AI service unavailable. Please check emergentintegrations installation."

        def with_model(self, *args, **kwargs) -> dict:
            return self


def get_llm_chat(api_key=None, session_id="", system_message="") -> dict:
    """Safe factory for LlmChat with fallback"""
    if not EMERGENT_AVAILABLE:
        logger.warning("Using mock LLM (emergentintegrations not installed)")
        return LlmChat()

    key = api_key or os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        logger.warning("No EMERGENT_LLM_KEY found, using mock LLM")
        return LlmChat()

    return LlmChat(api_key=key, session_id=session_id, system_message=system_message)


def is_available() -> dict:
    """Check if emergent integrations are available"""
    return EMERGENT_AVAILABLE
