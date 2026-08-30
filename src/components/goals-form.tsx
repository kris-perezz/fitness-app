"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { saveGoals, signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Goals = {
  calorie_goal: number;
  protein_goal_g: number;
  carb_goal_g: number;
  fat_goal_g: number;
} | null;

export function GoalsForm({ goals }: { goals: Goals }) {
  const [form, setForm] = useState({
    calorie_goal: String(goals?.calorie_goal ?? 2000),
    protein_goal_g: String(goals?.protein_goal_g ?? 150),
    carb_goal_g: String(goals?.carb_goal_g ?? 200),
    fat_goal_g: String(goals?.fat_goal_g ?? 65),
  });
  const [pending, startTransition] = useTransition();

  const macros: [keyof typeof form, string][] = [
    ["protein_goal_g", "Protein (g)"],
    ["carb_goal_g", "Carbs (g)"],
    ["fat_goal_g", "Fat (g)"],
  ];

  // Shown so the macro split and the calorie goal can be reconciled by eye,
  // the way every mainstream tracker does it.
  const fromMacros =
    Number(form.protein_goal_g) * 4 + Number(form.carb_goal_g) * 4 + Number(form.fat_goal_g) * 9;

  function save() {
    startTransition(async () => {
      const res = await saveGoals({
        calorie_goal: Number(form.calorie_goal),
        protein_goal_g: Number(form.protein_goal_g),
        carb_goal_g: Number(form.carb_goal_g),
        fat_goal_g: Number(form.fat_goal_g),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Goals saved");
    });
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-16">
      <header className="flex items-center gap-1 border-b border-border px-2 py-2">
        <Button size="icon" variant="ghost" asChild aria-label="Back">
          <Link href="/log">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <span className="text-sm font-medium">Goals</span>
      </header>

      <div className="space-y-6 px-5 py-6">
        <div className="space-y-1.5">
          <Label htmlFor="calorie_goal" className="text-xs text-muted-foreground">
            Daily calories
          </Label>
          <Input
            id="calorie_goal"
            type="number"
            inputMode="decimal"
            value={form.calorie_goal}
            onChange={(e) => setForm({ ...form, calorie_goal: e.target.value })}
            className="h-12 text-base tabular-nums"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {macros.map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="text-xs text-muted-foreground">
                {label}
              </Label>
              <Input
                id={key}
                type="number"
                inputMode="decimal"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="h-12 text-base tabular-nums"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Those macros add up to{" "}
          <span className="tabular-nums text-foreground">{Math.round(fromMacros)}</span> calories.
        </p>

        <Button className="h-11 w-full text-base" onClick={save} disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>

        <form action={signOut}>
          <Button type="submit" variant="ghost" className="w-full text-muted-foreground">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
