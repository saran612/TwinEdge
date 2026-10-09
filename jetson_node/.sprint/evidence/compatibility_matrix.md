# Hardware & Software Compatibility Matrix

| Platform | JetPack / OS | Python | Arch | NumPy Target | ONNX Runtime | TFLite Runtime | Node Deployment Mode |
|---|---|---|---|---|---|---|---|
| **Original Jetson Nano (Maxwell 128-core)** | JetPack 4.6 (Ubuntu 18.04) | 3.6.9 | aarch64 | `numpy<=1.19.5` (pre-built wheels) | Often unavailable or broken glibc | Optional (`tflite-runtime~=2.5.0`) | **Pure NumPy Interpreter** (Level 2) or TFLite |
| **Jetson Orin Nano / Orin NX (Ampere 1024-core)** | JetPack 6.0+ (Ubuntu 22.04) | 3.10+ | aarch64 | `numpy>=1.22` | `onnxruntime` CPU available | Available | **ONNX Runtime** (Level 1) -> NumPy fallback |
| **Dev Host (Emulation / CI)** | Ubuntu 26.04 / Docker py3.6 | 3.6 / 3.11 | x86_64 | Standard wheels | Available | Optional | **Runtime Ladder Test** |

## Design Constraints for Lowest Common Denominator (Jetson Nano, JetPack 4.6)
1. **Python 3.6 Syntax Strictness**:
   - No `dataclasses` (stdlib introduced in 3.7).
   - No walrus operator `:=` (Python 3.8).
   - No positional-only parameters `/` (Python 3.8).
   - No f-string `=` debug expressions (Python 3.8).
   - No `asyncio.run()` (Python 3.7) -> Use multi-threading via `threading` instead of asyncio.
   - No `from __future__ import annotations` (Python 3.7).
2. **Minimal External Dependencies**:
   - Only `numpy` for inference operations.
   - Standard library for everything else: `urllib.request`, `sqlite3`, `hashlib`, `hmac`, `gzip`, `ssl`, `threading`, `json`, `time`, `http.server`.
   - NumPy operations limited to standard matrix ops supported in NumPy 1.13+ (no `sliding_window_view`).
