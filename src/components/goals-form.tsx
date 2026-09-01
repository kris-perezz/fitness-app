"use client";

import { useState, useTransition } from "react";
import { saveGoals, signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  MACRO_KEYS,
  balance,
  balanceAround,
  caloriesOf,
  isBalanced,
  type MacroGoals,
  type MacroKey,
} from "@/lib/goals";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

type Goals =
  | ({
      calorie_goal: number;
      goal_weight_lb: number | null;
      goal_rate_lb_per_week: number | null;
    } & MacroGoals)
  | null;

type FieldName = "calorie_goal" | MacroKey;

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
      // Empty string is the absent goal, and it round-trips as null. `?? ""`
      // rather than `|| ""` so a goal rate of 0 -- maintain, a real answer --
      // survives instead of reading as no goal at all (S60).
      goal_weight_lb: goals?.goal_weight_lb != null ? String(goals.goal_weight_lb) : "",
      goal_rate_lb_per_week:
        goals?.goal_rate_lb_per_week != null ? String(goals.goal_rate_lb_per_week) : "",
    };
  });
  const [pending, startTransition] = useTransition();

  const numbers = () => ({
    calorie_goal: Number(form.calorie_goal) || 0,
    protein_goal_g: Number(form.protein_goal_g) || 0,
    carb_goal_g: Number(form.carb_goal_g) || 0,
    fat_goal_g: Number(form.fat_goal_g) || 0,
  });

  /**
   * S60. Blank means no goal; anything else is parsed. Separate from `numbers`
   * because the weight goals take no part in the calorie reconciliation -- they
   * are a target for the body, not a share of the day's energy, and running
   * them through `balance` would be a category error.
   */
  const weightGoals = () => ({
    goal_weight_lb: parseGoal(form.goal_weight_lb),
    goal_rate_lb_per_week: parseGoal(form.goal_rate_lb_per_week),
  });

  const current = numbers();

  /**
   * Calories are the anchor, so every edit ends with the macros sitting on the
   * calorie goal: changing calories rescales the whole split, changing one
   * macro keeps that number and moves the other two. Runs on blur rather than
   * on each keystroke so the fields never rewrite themselves mid-type.
   */
  function reconcile(edited: FieldName) {
    const values = numbers();
    const fixed =
      edited === "calorie_goal"
        ? balance(values.calorie_goal, values)
        : balanceAround(values.calorie_goal, values, edited);

    setForm((prev) => ({
      ...prev,
      calorie_goal: String(Math.max(0, Math.round(values.calorie_goal))),
      protein_goal_g: String(fixed.protein_goal_g),
      carb_goal_g: String(fixed.carb_goal_g),
      fat_goal_g: String(fixed.fat_goal_g),
    }));
    return { calorie_goal: Math.max(0, Math.round(values.calorie_goal)), ...fixed };
  }

  function save() {
    // Blur usually reconciles first; a keyboard Save on an unbalanced form
    // should not slip a mismatched split into the database.
    const values = isBalanced(current.calorie_goal, current) ? current : reconcile("calorie_goal");

    startTransition(async () => {
      const res = await saveGoals({ ...values, ...weightGoals() });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Goals saved");
    });
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center border-b border-border px-5 py-3">
        <span className="text-sm font-medium">Goals</span>
      </header>

      <div className="space-y-6 px-5 py-6">
        <Field>
          <FieldLabel htmlFor="calorie_goal" className="text-xs font-normal text-muted-foreground">
            Daily calories
          </FieldLabel>
          <Input
            id="calorie_goal"
            type="number"
            inputMode="decimal"
            value={form.calorie_goal}
            onChange={(e) => setForm({ ...form, calorie_goal: e.target.value })}
            onBlur={() => reconcile("calorie_goal")}
            className="h-12 text-base tabular-nums"
          />
        </Field>

        {/* The running total is Field's description slot rather than a loose
            paragraph: it describes the macro group as a whole, which is why it
            sits on the group and not on any one macro. It is not FieldError --
            a split that disagrees with the calorie goal is a transient state
            mid-type that `reconcile` fixes on blur, not something the user has
            to correct. */}
        <FieldGroup className="gap-2">
          <div className="grid grid-cols-3 gap-3">
            {MACRO_KEYS.map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={key} className="text-xs font-normal text-muted-foreground">
                  {MACRO_LABELS[key]}
                </FieldLabel>
                <Input
                  id={key}
                  type="number"
                  inputMode="decimal"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  onBlur={() => reconcile(key)}
                  className="h-12 text-base tabular-nums"
                />
              </Field>
            ))}
          </div>
          <FieldContent>
            <FieldDescription className="text-xs">
              Those macros add up to{" "}
              <span className="tabular-nums text-foreground">{caloriesOf(current)}</span> calories.
              Change any field and the rest follow.
            </FieldDescription>
          </FieldContent>
        </FieldGroup>

        {/* S60. On the goals tab with the rest of the prescription, and read on
            the progress tab: one screen holds what you decided, the other holds
            what happened. Both blank is a legitimate state -- with no goal on
            file the progress tab simply states the rate and nothing sits beside
            it. Nothing else degrades. */}
        <FieldGroup className="gap-2">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel
                htmlFor="goal_weight_lb"
                className="text-xs font-normal text-muted-foreground"
              >
                Goal weight (lb)
              </FieldLabel>
              <Input
                id="goal_weight_lb"
                type="number"
                inputMode="decimal"
                value={form.goal_weight_lb}
                onChange={(e) => setForm({ ...form, goal_weight_lb: e.target.value })}
                placeholder="None"
                className="h-12 text-base tabular-nums"
              />
            </Field>
            <Field>
              <FieldLabel
                htmlFor="goal_rate_lb_per_week"
                className="text-xs font-normal text-muted-foreground"
              >
                Goal rate (lb/week)
              </FieldLabel>
              <Input
                id="goal_rate_lb_per_week"
                type="number"
                inputMode="decimal"
                value={form.goal_rate_lb_per_week}
                onChange={(e) => setForm({ ...form, goal_rate_lb_per_week: e.target.value })}
                placeholder="None"
                className="h-12 text-base tabular-nums"
              />
            </Field>
          </div>
          <FieldContent>
            <FieldDescription className="text-xs">
              Negative to lose, positive to gain, 0 to maintain. Leave either
              blank for no goal.
            </FieldDescription>
          </FieldContent>
        </FieldGroup>

        <Button className="h-11 w-full text-base" onClick={save} disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>

        <ThemeToggle />

        <form action={signOut}>
          <Button type="submit" variant="ghost" className="w-full text-muted-foreground">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}

/**
 * A goal field's string to the number it means. Blank is null -- no goal on
 * file -- and "0" is zero, which for a rate means maintain. `Number("")` is 0,
 * so the empty check has to come first or every cleared field would silently
 * become a commitment to hold weight (S60).
 */
function parseGoal(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
