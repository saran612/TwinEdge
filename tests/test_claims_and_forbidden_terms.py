import os
import re
import pytest

FORBIDDEN_PATTERNS = [
    (r"\b0\.139\s*ms\b", "0.139 ms"),
    (r"\b4\.28\s*ms\b", "4.28 ms"),
    (r"zero false alarms", "zero false alarms"),
    (r"accurate near end of life", "accurate near end of life"),
    (r"sub-millisecond API", "sub-millisecond API"),
]

# Files and directories to inspect
CHECK_PATHS = [
    "frontend/src/pages/MethodLimitsPage.jsx",
    "frontend/src/components/layout/GlobalShell.jsx",
    "docs/results.md",
    "CLAIMS.md",
]

# Allowable exceptions in documents (e.g. explicitly explaining WHY a claim is forbidden)
ALLOWED_EXPLANATION_SNIPPETS = [
    "Forbidden statement",
    "Reason for prohibition",
    "Prior references to",
    "Why You May NOT Quote It",
    "Historical Note",
    "Forbidden Claims",
    "Forbidden claims",
    "Forbidden",
    "forbidden",
    "text-status-critical-text",
]

def test_forbidden_marketing_terms_and_numbers():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    violations = []

    for rel_path in CHECK_PATHS:
        full_path = os.path.join(repo_root, rel_path)
        if not os.path.exists(full_path):
            continue

        with open(full_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        is_in_forbidden_section = False
        for idx, line in enumerate(lines, 1):
            if "## 2. Forbidden Claims" in line:
                is_in_forbidden_section = True
            if is_in_forbidden_section:
                continue

            # If line is explicitly in a "Forbidden" table row or explanation, skip
            if any(allowed in line for allowed in ALLOWED_EXPLANATION_SNIPPETS):
                continue
            
            # Check forbidden patterns
            for pattern, name in FORBIDDEN_PATTERNS:
                if re.search(pattern, line, re.IGNORECASE):
                    violations.append(f"{rel_path}:{idx}: contains forbidden claim '{name}': {line.strip()}")

    assert not violations, "Found forbidden marketing terms in user-facing UI and documentation:\n" + "\n".join(violations)
