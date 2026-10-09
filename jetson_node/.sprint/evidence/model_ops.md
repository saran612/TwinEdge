# Model Operator Inventory: twinedge_rul.onnx

- **Source File**: `backend/model/twinedge_rul.onnx`
- **SHA256**: `032c3efa3156470e5ef7a3f31eb574d2830d4ff473625b6be814a05c0f1a1b7b`
- **Model Topology**: 1D-CNN for Remaining Useful Life (RUL) regression
- **Input Signature**: `sensor_window` `[batch, 30, 14]` (float32)
- **Output Signature**: `rul` `[batch, 1]` (float32)

## Operators & Execution Sequence
1. **Unsqueeze**: `[batch, 30, 14]` -> `[batch, 30, 14, 1]`
2. **Transpose**: Permute axes `(0, 2, 3, 1)` -> `[batch, 14, 1, 30]`
3. **Conv**:
   - Kernel: `[32, 14, 1, 5]`
   - Strides: `[1, 1]`
   - Dilations: `[1, 1]`
   - Pads: `[0, 2, 0, 2]` (corresponds to same-length temporal padding `(2, 2)` on cycle dimension)
   - Output: `[batch, 32, 1, 30]`
4. **Squeeze**: Squeeze axis 2 -> `[batch, 32, 30]`
5. **Add** (Bias): Add bias `[1, 32, 1]` -> `[batch, 32, 30]`
6. **Relu**: Activation -> `[batch, 32, 30]`
7. **Unsqueeze**: `[batch, 32, 30]` -> `[batch, 32, 1, 30]`
8. **Conv**:
   - Kernel: `[64, 32, 1, 5]`
   - Strides: `[1, 1]`
   - Dilations: `[1, 1]`
   - Pads: `[0, 2, 0, 2]`
   - Output: `[batch, 64, 1, 30]`
9. **Squeeze**: -> `[batch, 64, 30]`
10. **Add** (Bias): Add bias `[1, 64, 1]` -> `[batch, 64, 30]`
11. **Relu**: Activation -> `[batch, 64, 30]`
12. **GlobalAveragePool**: Average over axis 2 (time cycles 30) -> `[batch, 64, 1]`
13. **Squeeze**: -> `[batch, 64]`
14. **MatMul** (Dense 1): `[batch, 64] x [64, 64]` -> `[batch, 64]`
15. **Add** (Dense 1 Bias): `+ [64]` -> `[batch, 64]`
16. **Relu**: Activation -> `[batch, 64]`
17. **MatMul** (Dense 2 / RUL): `[batch, 64] x [64, 1]` -> `[batch, 1]`
18. **Add** (Dense 2 Bias): `+ [1]` -> `[batch, 1]`

## Preprocessing Requirements
- Standard Scaler applied externally on the 14 sensors:
  - Input features: `['s_2', 's_3', 's_4', 's_7', 's_8', 's_9', 's_11', 's_12', 's_13', 's_14', 's_15', 's_17', 's_20', 's_21']`
  - Scaler Means & Scales extracted into `edge_model.json`.
- Post-processing:
  - Capped at `RUL_CAP = 125.0`.
