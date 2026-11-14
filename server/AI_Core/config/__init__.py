"""
Configuration settings
"""

# Imports singleton settings holding system configurations and API credentials.
# Exposes typed application parameters loaded from environment variables.
# Connects internal agent packages with centralized infrastructure settings.
from .settings import settings

# Public module export manifest exposing the global configuration singleton.
# Limits module namespace to the validated settings instance for imports.
# Ensures standard access pattern across all core services and modules.
__all__ = ["settings"]