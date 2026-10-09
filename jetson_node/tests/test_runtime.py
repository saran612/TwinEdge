import os
import unittest
import numpy as np

from jetson_node.node.runtime import (
    select_runtime,
    NumpyPureRuntime,
    OnnxruntimeRuntime,
    run_canary
)

class TestRuntimeLadder(unittest.TestCase):
    def setUp(self):
        self.repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.model_dir = os.path.join(self.repo_root, "jetson_node", "model")
        self.npz_path = os.path.join(self.model_dir, "edge_model.npz")
        self.json_path = os.path.join(self.model_dir, "edge_model.json")
        self.canary_path = os.path.join(self.model_dir, "canary_fixtures.json")
        self.onnx_path = os.path.join(self.repo_root, "backend", "model", "twinedge_rul.onnx")

    def test_numpy_pure_runtime_canary(self):
        rt = NumpyPureRuntime(self.npz_path, self.json_path)
        self.assertEqual(rt.name, "numpy_pure")
        self.assertTrue(run_canary(rt, self.canary_path))

    def test_onnxruntime_canary(self):
        try:
            import onnxruntime
        except ImportError:
            self.skipTest("onnxruntime not installed in environment")
        rt = OnnxruntimeRuntime(self.onnx_path)
        self.assertEqual(rt.name, "onnxruntime_cpu")
        self.assertTrue(run_canary(rt, self.canary_path))

    def test_ladder_selection_auto(self):
        rt = select_runtime(self.model_dir)
        self.assertIn(rt.name, ["onnxruntime_cpu", "numpy_pure", "tflite_cpu"])

    def test_ladder_selection_forced_numpy(self):
        rt = select_runtime(self.model_dir, force_runtime="numpy_pure")
        self.assertEqual(rt.name, "numpy_pure")

if __name__ == "__main__":
    unittest.main()
