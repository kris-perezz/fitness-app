"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { saveGoals, signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MACRO_KEYS,
  balance,
  balanceAround,
  caloriesOf,
  isBalanced,
  type MacroGoals,
  type MacroKey,
} from "@/lib/goals";
import { toast } from "sonner";

type Goals = ({ calorie_goal: number } & MacroGoals) | null;

type Field = "calorie_goal" | MacroKey;

const MACRO_LABELS: Record<MacroKey, string> = {
  protein_goal_g: "Protein (g)",
  carb_goal_g: "Carbs (g)",
  fat_goal_g: "Fat (g)",
};

export function GoalsForm({ goals }: { goals: Goals }) {
  // Goals saved before the split was reconciled -- or edited straight in the
  // database -- arrive out of balance, so correct them on the way in rather
  // than waiting for the user to touch a field.
  const [form, setForm] = useState(() => {
    const stored = {
      calorie_goal: goals?.calorie_goal ?? 2000,
      protein_goal_g: goals?.protein_goal_g ?? 150,
      carb_goal_g: goals?.carb_goal_g ?? 200,
      fat_goal_g: goals?.fat_goal_g ?? 65,
    };
    const macros = isBalanced(stored.calorie_goal, stored)
      ? stored
      : balance(stored.calorie_goal, stored);

    return {
      calorie_goal: String(Math.round(stored.calorie_goal)),
      protein_goal_g: String(macros.protein_goal_g),
      carb_goal_g: String(macros.carb_goal_g),
      fat_goal_g: String(macros.fat_goal_g),
    };
  });
  const [pending, startTransition] = useTransition();

  const numbers = () => ({
    calorie_goal: Number(form.calorie_goal) || 0,
    protein_goal_g: Number(form.protein_goal_g) || 0,
    carb_goal_g: Number(form.carb_goal_g) || 0,
    fat_goal_g: Number(form.fat_goal_g) || 0,
  });

  const current = numbers();

  /**
   * Calories are the anchor, so every edit ends with the macros sitting on the
   * calorie goal: changing calories rescales the whole split, changing one
   * macro keeps that number and moves the other two. Runs on blur rather than
   * on each keystroke so the fields never rewrite themselves mid-type.
   */
  function reconcile(edited: Field) {
    const values = numbers();
    const fixed =
      edited === "calorie_goal"
        ? balance(values.calorie_goal, values)
        : balanceAround(values.calorie_goal, values, edited);

    setForm({
      calorie_goal: String(Math.max(0, Math.round(values.calorie_goal))),
      protein_goal_g: String(fixed.protein_goal_g),
      carb_goal_g: String(fixed.carb_goal_g),
      fat_goal_g: String(fixed.fat_goal_g),
    });
    return { calorie_goal: Math.max(0, Math.round(values.calorie_goal)), ...fixed };
  }

  function save() {
    // Blur usually reconciles first; a keyboard Save on an unbalanced form
    // should not slip a mismatched split into the database.
    const values = isBalanced(current.calorie_goal, current) ? current : reconcile("calorie_goal");

    startTransition(async () => {
      const res = await saveGoals(values);
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
            onBlur={() => reconcile("calorie_goal")}
            className="h-12 text-base tabular-nums"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {MACRO_KEYS.map((key) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="text-xs text-muted-foreground">
                {MACRO_LABELS[key]}
              </Label>
              <Input
                id={key}
                type="number"
                inputMode="decimal"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                onBlur={() => reconcile(key)}
                className="h-12 text-base tabular-nums"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Those macros add up to{" "}
          <span className="tabular-nums text-foreground">{caloriesOf(current)}</span> calories.
          Change any field and the rest follow.
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
