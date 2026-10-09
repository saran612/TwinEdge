import re
from typing import Any, Dict, List, Union

REDACT_PATTERNS = [
    (re.compile(r'(?i)(?:bearer\s+[A-Za-z0-9_\-\.]{10,})'), 'Bearer [REDACTED]'),
    (re.compile(r'(?i)(?:authorization[\'":\s]+(?:bearer\s+)?[A-Za-z0-9_\-\.]{10,})'), 'Authorization: [REDACTED]'),
    (re.compile(r'(?i)(?:token[\'":\s=]+)([A-Za-z0-9_\-\.]{8,})'), 'token=[REDACTED]'),
    (re.compile(r'(?i)(?:password[\'":\s=]+)([^\s,;"]+)'), 'password=[REDACTED]'),
    (re.compile(r'(?i)(?:secret[\'":\s=]+)([^\s,;"]+)'), 'secret=[REDACTED]'),
    (re.compile(r'(?i)(?:api[_-]?key[\'":\s=]+)([^\s,;"]+)'), 'api_key=[REDACTED]'),
    (re.compile(r'(?i)(?:hmac[\'":\s=]+)([^\s,;"]+)'), 'hmac=[REDACTED]'),
]

SENSITIVE_KEYS = {
    'password', 'secret', 'token', 'auth', 'authorization',
    'api_key', 'apikey', 'device_key', 'hmac_secret', 'private_key'
}

def redact_text(text: str) -> str:
    if not isinstance(text, str):
        return text
    result = text
    for pattern, repl in REDACT_PATTERNS:
        result = pattern.sub(repl, result)
    return result

def redact_object(obj: Any) -> Any:
    if isinstance(obj, dict):
        clean = {}
        for k, v in obj.items():
            if any(s in k.lower() for s in SENSITIVE_KEYS):
                clean[k] = '[REDACTED]'
            else:
                clean[k] = redact_object(v)
        return clean
    elif isinstance(obj, list):
        return [redact_object(item) for item in obj]
    elif isinstance(obj, str):
        return redact_text(obj)
    return obj
