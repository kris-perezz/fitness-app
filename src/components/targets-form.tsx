"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { saveTargets, signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/eyebrow";
import { toast } from "sonner";

type Settings = {
  phase_label: string | null;
  cal_daily_equiv: number;
  protein_floor_g: number;
  protein_stretch_g: number | null;
  fat_floor_g: number;
} | null;

const fieldLabel = "text-[10px] uppercase tracking-[0.16em] text-muted-foreground";
const numberField =
  "mt-2 h-14 border-0 border-b border-border px-0 font-mono text-3xl tabular-nums shadow-none focus-visible:border-foreground focus-visible:ring-0";

export function TargetsForm({ settings }: { settings: Settings }) {
  const [form, setForm] = useState({
    phase_label: settings?.phase_label ?? "",
    cal_daily_equiv: String(settings?.cal_daily_equiv ?? 2000),
    protein_floor_g: String(settings?.protein_floor_g ?? 155),
    protein_stretch_g: String(settings?.protein_stretch_g ?? ""),
    fat_floor_g: String(settings?.fat_floor_g ?? 55),
  });
  const [pending, startTransition] = useTransition();

  const numbers: [keyof typeof form, string, string][] = [
    ["cal_daily_equiv", "Daily calories", "The ceiling you spend down."],
    ["protein_floor_g", "Protein floor", "Flagged only below this."],
    ["protein_stretch_g", "Protein stretch", "A goal, never a miss. Optional."],
    ["fat_floor_g", "Fat floor", ""],
  ];

  function save() {
    startTransition(async () => {
      const res = await saveTargets({
        phase_label: form.phase_label || null,
        cal_daily_equiv: Number(form.cal_daily_equiv),
        protein_floor_g: Number(form.protein_floor_g),
        protein_stretch_g: form.protein_stretch_g ? Number(form.protein_stretch_g) : null,
        fat_floor_g: Number(form.fat_floor_g),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Targets saved");
    });
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        href="/log"
        className="-ml-1 mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Today
      </Link>

      <Eyebrow>Targets</Eyebrow>
      <p className="mt-1 text-sm text-muted-foreground">
        Prescribed values only. Nothing measured belongs here.
      </p>

      <div className="mt-8 space-y-8">
        <div>
          <Label htmlFor="phase_label" className={fieldLabel}>
            Phase
          </Label>
          <Input
            id="phase_label"
            value={form.phase_label}
            onChange={(e) => setForm({ ...form, phase_label: e.target.value })}
            placeholder="Phase 1 part 2"
            className="mt-2 h-12 text-base"
          />
        </div>

        {numbers.map(([key, label, hint]) => (
          <div key={key}>
            <Label htmlFor={key} className={fieldLabel}>
              {label}
            </Label>
            <Input
              id={key}
              type="number"
              inputMode="decimal"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={numberField}
              placeholder="0"
            />
            {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
        ))}
      </div>

      <Button className="mt-10 h-12 w-full text-base" onClick={save} disabled={pending}>
        {pending ? "Saving" : "Save targets"}
      </Button>

      <form action={signOut} className="mt-4">
        <Button type="submit" variant="ghost" className="w-full text-muted-foreground">
          Sign out
        </Button>
      </form>
    </main>
  );
}
