import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');

const ALLOWED_HEX = new Set([
  // Tokens definitions or approved status colors in Chip/Turbofan
  '#f5f6f8', '#ffffff', '#f0f2f5', '#d7dbe2', '#14181f', '#4a5260', '#5e6674', '#4f46e5', '#eef0ff',
  '#0e1116', '#161b22', '#1d232c', '#2b3340', '#e8ecf2', '#a9b2c0', '#8b95a5', '#8b93ff',
  '#0b6b3a', '#e3f5ea', '#8a4b00', '#fdf0dc', '#a31d1d', '#fce6e6', '#3b4452', '#ebeef2',
  '#6ee7a0', '#12301f', '#ffc46b', '#3a2a0e', '#ff9b9b', '#3a1515', '#c3cbd8', '#262d38',
  '#38bdf8', '#0284c7', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#000000', '#fff', '#000'
]);

// Allowlist files that define tokens, 3D WebGL scenes, or offline data
const ALLOWLISTED_FILES = new Set([
  'tokens.css',
  'index.css',
  'Turbofan3DView.jsx', // exempt WebGL three.js canvas
  'features.json',
  'manifest.json',
  'replay_engines.json',
  'scaler.json',
  'training_stats.json'
]);

let violations = [];

function checkFile(filePath) {
  const fileName = path.basename(filePath);
  if (ALLOWLISTED_FILES.has(fileName)) return;
  if (!/\.(jsx?|tsx?|css)$/.test(fileName)) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // 1. Check for raw hex colors outside allowlist
    const hexMatches = line.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hexMatches) {
      hexMatches.forEach((hex) => {
        if (!ALLOWED_HEX.has(hex.toLowerCase()) && !line.includes('eslint-disable') && !line.includes('allow-hex')) {
          violations.push({
            file: path.relative(SRC_DIR, filePath),
            line: lineNum,
            type: 'RAW_HEX_COLOR',
            detail: `Raw hex color ${hex} found outside tokens`
          });
        }
      });
    }

    // 2. Check for arbitrary Tailwind utilities like text-[...], bg-[...], rounded-[...], w-[...] for cards
    const arbitraryMatches = line.match(/\b(text|bg|rounded|w|h|p|m)-\[[^\]]+\]/g);
    if (arbitraryMatches) {
      arbitraryMatches.forEach((cls) => {
        // Allow arbitrary height for fixed 120px metric cards or chart dimensions if explicitly tokenized
        if (cls === 'h-[120px]' || cls === 'w-[240px]' || cls === 'w-[3px]' || cls === 'h-[64px]') {
          return;
        }
        violations.push({
          file: path.relative(SRC_DIR, filePath),
          line: lineNum,
          type: 'ARBITRARY_TAILWIND_CLASS',
          detail: `Arbitrary utility ${cls} violates design tokens`
        });
      });
    }

    // 3. Check for disallowed font-family styles
    if (/font-family:\s*['"]?(?!var\(--font-)(?!Inter)(?!JetBrains).+['"]?/i.test(line)) {
      violations.push({
        file: path.relative(SRC_DIR, filePath),
        line: lineNum,
        type: 'UNAUTHORIZED_FONT_FAMILY',
        detail: `Unauthorized font family in style`
      });
    }
  });
}

function traverse(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      traverse(full);
    } else {
      checkFile(full);
    }
  }
}

traverse(SRC_DIR);

console.log('='.repeat(60));
console.log('TwinEdge Design System Guard Check (npm run ds:check)');
console.log('='.repeat(60));

if (violations.length === 0) {
  console.log('SUCCESS: 0 design system violations detected across all source files.');
  process.exit(0);
} else {
  console.error(`FAILED: ${violations.length} violations detected:\n`);
  violations.forEach((v) => {
    console.error(`[${v.type}] ${v.file}:${v.line} -> ${v.detail}`);
  });
  process.exit(1);
}
