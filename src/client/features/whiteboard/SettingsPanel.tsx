import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@/client/components/ui/input";
import { Switch } from "@/client/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import {
  NUMERIC_SETTINGS,
  QUALITIES,
  SHAPES,
  clampSetting,
  shapeLabel,
  type NumericSetting,
  type RenderSettings,
  type SettingsPatch,
} from "@/lib/video";

export function SettingsPanel({
  settings,
  hasAudio,
  onChange,
}: {
  settings: RenderSettings;
  hasAudio: boolean;
  onChange: (patch: SettingsPatch) => void;
}) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs">
      <Row label="Quality">
        <Choice
          name="quality"
          options={QUALITIES.map((q) => ({ value: q, label: q }))}
          value={settings.quality}
          onChange={(quality) => onChange({ quality })}
        />
      </Row>
      <Row label="Frame">
        <Choice
          name="shape"
          options={SHAPES.map((s) => ({ value: s, label: shapeLabel(s) }))}
          value={settings.shape}
          onChange={(shape) => onChange({ shape })}
        />
      </Row>
      <Row label="Sync scenes to audio" hint={hasAudio ? undefined : "Needs a voiceover"}>
        <Switch
          data-testid="toggle-sync"
          aria-label="Sync scenes to audio"
          checked={settings.syncToAudio}
          onCheckedChange={(syncToAudio) => onChange({ syncToAudio })}
        />
      </Row>
      <Row label="Colour reveal">
        <Switch
          data-testid="toggle-color"
          aria-label="Colour reveal"
          checked={settings.colorReveal}
          onCheckedChange={(colorReveal) => onChange({ colorReveal })}
        />
      </Row>
      <Row label="Drawing hand">
        <Switch
          data-testid="toggle-hand"
          aria-label="Drawing hand"
          checked={settings.hand}
          onCheckedChange={(hand) => onChange({ hand })}
        />
      </Row>
      <details className="group">
        <summary
          data-testid="advanced"
          className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        >
          Advanced
          <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" />
        </summary>
        <div className="divide-y divide-border border-t border-border">
          {(Object.keys(NUMERIC_SETTINGS) as NumericSetting[]).map((key) => (
            <Row key={key} label={NUMERIC_SETTINGS[key].label}>
              <NumberSetting
                name={key}
                value={settings[key]}
                onCommit={(value) => onChange({ [key]: value })}
              />
            </Row>
          ))}
        </div>
      </details>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      size="sm"
      spacing={0.5}
      value={[value]}
      onValueChange={(next) => {
        const picked = options.find((o) => o.value === next[0]);
        if (picked) onChange(picked.value);
      }}
      className="rounded-lg border border-border bg-muted p-0.5 data-[size=sm]:rounded-lg"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          data-testid={`${name}-${o.value}`}
          className="h-[22px] px-2 text-xs text-muted-foreground aria-pressed:bg-primary/15 aria-pressed:text-primary"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function NumberSetting({
  name,
  value,
  onCommit,
}: {
  name: NumericSetting;
  value: number;
  onCommit: (value: number) => void;
}) {
  const spec = NUMERIC_SETTINGS[name];
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const next = clampSetting(name, parsed);
    setText(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Input
        type="number"
        inputMode="decimal"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        aria-label={spec.label}
        data-testid={`setting-${name}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className="h-8 w-20 bg-card text-right tabular-nums"
      />
      <span className="w-8 text-xs text-muted-foreground">{spec.unit}</span>
    </div>
  );
}
