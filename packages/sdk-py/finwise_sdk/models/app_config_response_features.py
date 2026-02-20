from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="AppConfigResponseFeatures")


@_attrs_define
class AppConfigResponseFeatures:
    """
    Attributes:
        tasks_enabled (bool):
        receipts_ocr_enabled (bool):
        journal_enabled (bool):
        monetization_enabled (bool):
        csrf_enabled (bool):
        google_oauth_enabled (bool):
    """

    tasks_enabled: bool
    receipts_ocr_enabled: bool
    journal_enabled: bool
    monetization_enabled: bool
    csrf_enabled: bool
    google_oauth_enabled: bool

    def to_dict(self) -> dict[str, Any]:
        tasks_enabled = self.tasks_enabled

        receipts_ocr_enabled = self.receipts_ocr_enabled

        journal_enabled = self.journal_enabled

        monetization_enabled = self.monetization_enabled

        csrf_enabled = self.csrf_enabled

        google_oauth_enabled = self.google_oauth_enabled

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "tasks_enabled": tasks_enabled,
                "receipts_ocr_enabled": receipts_ocr_enabled,
                "journal_enabled": journal_enabled,
                "monetization_enabled": monetization_enabled,
                "csrf_enabled": csrf_enabled,
                "google_oauth_enabled": google_oauth_enabled,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        tasks_enabled = d.pop("tasks_enabled")

        receipts_ocr_enabled = d.pop("receipts_ocr_enabled")

        journal_enabled = d.pop("journal_enabled")

        monetization_enabled = d.pop("monetization_enabled")

        csrf_enabled = d.pop("csrf_enabled")

        google_oauth_enabled = d.pop("google_oauth_enabled")

        app_config_response_features = cls(
            tasks_enabled=tasks_enabled,
            receipts_ocr_enabled=receipts_ocr_enabled,
            journal_enabled=journal_enabled,
            monetization_enabled=monetization_enabled,
            csrf_enabled=csrf_enabled,
            google_oauth_enabled=google_oauth_enabled,
        )

        return app_config_response_features
