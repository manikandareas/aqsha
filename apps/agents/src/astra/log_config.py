from __future__ import annotations

import json
import logging
import logging.handlers
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from astra.settings import AstraSettings

_STANDARD_LOG_RECORD_FIELDS = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "thread",
    "threadName",
    "taskName",
}


class JsonLogFormatter(logging.Formatter):
    """Format logs as one JSON object per line for easier debugging."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        for key, value in record.__dict__.items():
            if key in _STANDARD_LOG_RECORD_FIELDS or key.startswith("_"):
                continue
            payload[key] = _json_safe(value)

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        if record.stack_info:
            payload["stack"] = record.stack_info

        return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def configure_file_logging(settings: AstraSettings) -> Path | None:
    """Configure process-wide rotating file logging for Astra."""

    if not settings.enable_file_logging:
        return None

    log_dir = settings.resolved_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / settings.log_file_name

    root_logger = logging.getLogger()
    root_logger.setLevel(_resolve_log_level(settings.log_level))

    existing_handler = _find_astra_file_handler(root_logger, log_path)
    if existing_handler is None:
        handler = logging.handlers.RotatingFileHandler(
            log_path,
            maxBytes=settings.log_max_bytes,
            backupCount=settings.log_backup_count,
            encoding="utf-8",
        )
        handler.set_name("astra_file")
        handler.setFormatter(JsonLogFormatter())
        handler.setLevel(_resolve_log_level(settings.log_level))
        root_logger.addHandler(handler)
    else:
        existing_handler.setLevel(_resolve_log_level(settings.log_level))

    logging.captureWarnings(True)
    for logger_name in ("astra", "uvicorn.error", "uvicorn.access", "pydantic_ai"):
        logging.getLogger(logger_name).setLevel(_resolve_log_level(settings.log_level))

    return log_path


def _find_astra_file_handler(
    logger: logging.Logger,
    log_path: Path,
) -> logging.Handler | None:
    resolved_path = log_path.resolve()
    for handler in logger.handlers:
        if handler.get_name() != "astra_file":
            continue
        if isinstance(handler, logging.FileHandler):
            try:
                if Path(handler.baseFilename).resolve() == resolved_path:
                    return handler
            except OSError:
                continue
    return None


def _resolve_log_level(level: str) -> int:
    return logging.getLevelNamesMapping().get(level.upper(), logging.INFO)


def _json_safe(value: Any) -> Any:
    try:
        json.dumps(value)
    except TypeError:
        return str(value)
    return value
