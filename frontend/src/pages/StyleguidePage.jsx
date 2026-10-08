import React from 'react';
import {
  Card,
  CardHeader,
  MetricCard,
  Chip,
  ProvenanceTag,
  Button,
  IconButton,
  Input,
  Select,
  TableShell,
  Drawer,
  Modal,
  Banner,
  Toggle
} from '../components/ui';
import { Activity, ShieldAlert, CheckCircle, Terminal, HelpCircle } from 'lucide-react';

export default function StyleguidePage() {
  const [toggleVal, setToggleVal] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const sampleColumns = [
    { field: 'id', header: 'ID', width: '20%' },
    { field: 'name', header: 'COMPONENT', width: '40%' },
    { field: 'status', header: 'STATUS', width: '40%', render: (row) => <Chip status={row.status} /> },
  ];

  const sampleData = [
    { id: 'DS-01', name: 'Inter Typography', status: 'healthy' },
    { id: 'DS-02', name: 'Token Color Matrix', status: 'healthy' },
    { id: 'DS-03', name: 'Border Radii Consistency', status: 'neutral' },
  ];

  return (
    <div className="p-6 space-y-8 bg-app min-h-screen text-text">
      <div>
        <h1 className="text-xl font-semibold text-text">Design System Styleguide</h1>
        <p className="text-sm text-text-muted mt-1">Live interactive showcase for primitives and token adherence</p>
      </div>

      {/* Typography Scale */}
      <Card className="p-5 space-y-4">
        <CardHeader title="Typography Scale & Fonts" subtitle="Inter variable for UI, JetBrains Mono strictly for code/data" />
        <div className="space-y-3">
          <div className="flex items-baseline gap-4">
            <span className="text-xs font-mono text-text-muted w-24">metric 32/36:</span>
            <span className="text-metric font-semibold text-text tabular-nums">142 cycles</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-xs font-mono text-text-muted w-24">xl 20/28:</span>
            <span className="text-xl font-semibold text-text">Page Title Heading</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-xs font-mono text-text-muted w-24">base 16/24:</span>
            <span className="text-base font-semibold text-text">Card Title Heading</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-xs font-mono text-text-muted w-24">sm 14/20:</span>
            <span className="text-sm text-text">Body text, table cells, form inputs, navigation items</span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-xs font-mono text-text-muted w-24">xs 12/16:</span>
            <span className="text-xs text-text-muted">Badges, table headers, captions, chart ticks</span>
          </div>
        </div>
      </Card>

      {/* Metric Cards */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-text">MetricCard Grid (Fixed Height 120px)</h3>
        <div className="grid grid-cols-5 gap-4">
          <MetricCard label="Predicted RUL" value="84 cycles" provenance="MODEL" tooltip="Remaining useful life" />
          <MetricCard label="EOL cycle" value="184" provenance="DERIVED" delta="+12 cycles" deltaType="positive" />
          <MetricCard label="Health index" value="0.94" provenance="LIVE" delta="-0.02" deltaType="negative" />
          <MetricCard label="Status" value="Nominal" provenance="SIMULATED" />
          <MetricCard label="Latency" value="12 ms" provenance="STATIC" />
        </div>
      </div>

      {/* Chips and Provenance Tags */}
      <Card className="p-5 space-y-4">
        <CardHeader title="Status Chips & Provenance Tags" subtitle="Theme-tested status states & neutral provenance chips" />
        <div className="space-y-4">
          <div>
            <div className="text-xs text-text-muted mb-2 font-medium">Status Chips (Icon + Text + Background):</div>
            <div className="flex flex-wrap gap-3">
              <Chip status="healthy" label="Healthy" />
              <Chip status="degrading" label="Degrading" />
              <Chip status="critical" label="Critical" />
              <Chip status="neutral" label="Standby" />
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-2 font-medium">Provenance Tags (Unified Neutral Outlined Style):</div>
            <div className="flex flex-wrap gap-2">
              {['MODEL', 'LIVE', 'REPLAY', 'DERIVED', 'SIMULATED', 'STATIC', 'ASSUMED'].map((tag) => (
                <ProvenanceTag key={tag} type={tag} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Buttons & Form Controls */}
      <Card className="p-5 space-y-4">
        <CardHeader title="Buttons & Controls" subtitle="Radius md, height 40px/32px" />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="md">Primary Button</Button>
          <Button variant="secondary" size="md">Secondary Button</Button>
          <Button variant="danger" size="md">Danger Button</Button>
          <Button variant="outline" size="md">Outline Button</Button>
          <Button variant="primary" size="sm">Small (32px)</Button>
          <IconButton icon={Activity} size="md" title="Activity" />
          <IconButton icon={HelpCircle} size="sm" title="Help" />
        </div>
        <div className="grid grid-cols-3 gap-4 pt-3">
          <Input placeholder="Sample text input (40px)..." />
          <Select
            options={[
              { value: '1', label: 'Option 1' },
              { value: '2', label: 'Option 2' },
            ]}
          />
          <div className="flex items-center gap-3">
            <Toggle checked={toggleVal} onChange={setToggleVal} label="Toggle switch" />
            <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>Open Modal</Button>
            <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>Open Drawer</Button>
          </div>
        </div>
      </Card>

      {/* TableShell */}
      <Card className="flex flex-col">
        <CardHeader title="TableShell Standard" subtitle="Row height 48px, header 40px, selected row 3px left bar" />
        <div className="p-5 pt-0">
          <TableShell
            columns={sampleColumns}
            data={sampleData}
            keyField="id"
            selectedKey="DS-01"
          />
        </div>
      </Card>

      {/* Banner */}
      <div className="space-y-3">
        <Banner variant="info" title="System Notice" message="Inter and JetBrains Mono are self-hosted via Fontsource with no external CDN dependency." />
        <Banner variant="warning" title="Advisory Warning" message="Telemetry stream operates within normal baseline tolerances." />
      </div>

      {/* Modal & Drawer examples */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Sample Design System Modal">
        <p className="text-sm text-text-2">
          Modals use border-radius lg (12px), background surface, and standard backdrop styling.
        </p>
      </Modal>

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="Sample Design System Drawer">
        <p className="text-sm text-text-2">
          Drawers use border-radius lg (12px), background surface, and header border separator.
        </p>
      </Drawer>
    </div>
  );
}
