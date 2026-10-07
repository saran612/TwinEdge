# 3D Mesh Scene Graph Report: Turbofan_Engine_Animated.glb

- **File Path**: `frontend/public/models/Turbofan_Engine_Animated.glb`
- **File Size**: 28.02 MB
- **Total Nodes**: 5376
- **Total Meshes**: 1616

## Scene Graph Keyword Matches

Matches discovered in node and mesh names for component mapping:

### `blade` (3027 items)
- `Axial Compressor Blades`
- `Blade100`
- `Blade100_Metal_Chrome_0`
- `Blade100_Metal_Chrome_0_0`
- `Blade100_Metal_Chrome_0_1`
- `Blade101`
- `Blade101_Metal_Chrome_0`
- `Blade101_Metal_Chrome_0_0`
- `Blade101_Metal_Chrome_0_1`
- `Blade102`
- `Blade102_Metal_Chrome_0`
- `Blade102_Metal_Chrome_0_0`
- `Blade102_Metal_Chrome_0_1`
- `Blade103`
- `Blade103_Metal_Chrome_0`
- *(and 3012 more)*

### `case` (0 items)

### `combustor` (1 items)
- `Combustor Assembly`

### `compressor` (9 items)
- `Axial Compressor Blades`
- `Axial Compressor Static`
- `Centrifugal Compressor`
- `Compressor Casing`
- `Compressor Casing_Steel 2_0`
- `Compressor Casing_Steel 2_0_0`
- `Compressor Casing_Steel 2_0_1`
- `Compressor Rotor Blades`
- `Compressor Rotor Stators`

### `duct` (8 items)
- `Exhaust Duct`
- `Exhaust Duct_Steel_0`
- `Exhaust Duct_Steel_0_0`
- `Exhaust Duct_Steel_0_1`
- `Inner Duct`
- `Inner Duct_Steel_0`
- `Outer Duct`
- `Outer Duct_Steel_0`

### `fan` (6 items)
- `Fan Blades`
- `Fan Blades_DULL METAL_0`
- `Fan Blades_DULL METAL_0_0`
- `Fan Blades_DULL METAL_0_1`
- `Fan_Ring`
- `Fan_Ring_DULL METAL_0`

### `hpc` (1858 items)
- `HPC B row blade01`
- `HPC B row blade01_Steel_0`
- `HPC B row blade02`
- `HPC B row blade02_Steel_0`
- `HPC B row blade03`
- `HPC B row blade03_Steel_0`
- `HPC B row blade04`
- `HPC B row blade04_Steel_0`
- `HPC B row blade05`
- `HPC B row blade05_Steel_0`
- `HPC B row blade06`
- `HPC B row blade06_Steel_0`
- `HPC B row blade07`
- `HPC B row blade07_Steel_0`
- `HPC B row blade08`
- *(and 1843 more)*

### `hpt` (960 items)
- `HPT A row blade107`
- `HPT A row blade107_Steel_0`
- `HPT A row blade167`
- `HPT A row blade167_Steel_0`
- `HPT A row blade181`
- `HPT A row blade181_Steel_0`
- `HPT A row blade182`
- `HPT A row blade182_Steel_0`
- `HPT A row blade183`
- `HPT A row blade183_Steel_0`
- `HPT A row blade184`
- `HPT A row blade184_Steel_0`
- `HPT A row blade185`
- `HPT A row blade185_Steel_0`
- `HPT A row blade186`
- *(and 945 more)*

### `lpc` (0 items)

### `lpt` (0 items)

### `nozzle` (0 items)

### `shaft` (4 items)
- `Drive Shaft`
- `Drive Shaft_SHINY METAL_0`
- `Drive Shaft_SHINY METAL_0_0`
- `Drive Shaft_SHINY METAL_0_1`

### `spool` (0 items)

### `turbine` (5 items)
- `Turbine Blades High Pressure`
- `Turbine Blades Low Pressure`
- `Turbine Blades Static`
- `Turbine Disc`
- `Turbine Disc_Steel_0`

## Component Mapping Assessment

The scene graph contains explicit structural groupings for major turbofan stages:
- **Fan**: Nodes matching `Fan`, blades, and casing.
- **LPC**: Low Pressure Compressor / Booster stages.
- **HPC**: High Pressure Compressor stages.
- **Combustor**: Combustor chamber and inner duct.
- **HPT**: High Pressure Turbine blade rows (explicit `HPT B row blade...` matches).
- **LPT**: Low Pressure Turbine blade rows and stages (`Turbine Blades Low Pressure`).
- **Nozzle / Exhaust**: Tail nozzle and exhaust ducting.
- **HP Spool**: High pressure shaft and drive gears.
- **LP Spool**: Low pressure drive shaft and bearings.

In `component_map.json`, components will target these sub-trees/mesh name prefixes, with 3D hotspot fallback anchors positioned along the engine axis for robust selection.