"use client";

import { useState, useTransition } from "react";
import { saveGoals, signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info, LogOut } from "lucide-react";
import {
  MACRO_KEYS,
  balance,
  balanceAround,
  caloriesOf,
  isBalanced,
  type MacroGoals,
  type MacroKey,
} from "@/lib/goals";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { fromDisplay, toDisplay, type DisplayUnit } from "@/lib/weight";
import { toast } from "sonner";

type Goals =
  | ({
      calorie_goal: number;
      goal_weight_lb: number | null;
      goal_rate_lb_per_week: number | null;
      display_weight_unit?: DisplayUnit | null;
      strict_mode?: boolean | null;
    } & MacroGoals)
  | null;

type FieldName = "calorie_goal" | MacroKey;

/** A stored pound goal as the string the field starts with, or "" for no goal. */
function showGoal(lb: number | null | undefined, unit: DisplayUnit): string {
  if (lb == null) return "";
  return String(Math.round(toDisplay(lb, unit) * 10) / 10);
}

/**
 * The explanation for a field, behind a tap rather than under it.
 *
 * A goals screen accumulates prose: every field here had a paragraph beneath it
 * explaining a rule, and four paragraphs of grey text is what a settings screen
 * looks like when nobody has decided what matters. The rules still matter --
 * they are just answers to a question, and an answer only has to be there when
 * the question is asked.
 *
 * POPOVER, NOT TOOLTIP, and the registry has both. A Radix tooltip opens on
 * hover and focus; this app is a phone app, where there is no hover and the
 * only way in is a tap. Popover is the same disclosure with a trigger that
 * exists on touch, and it takes the keyboard and the screen reader with it.
 */
function FieldHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          // Small mark, full-size target: the icon reads as 14px and the button
          // still answers to a thumb.
          className="-my-2 size-8 text-muted-foreground"
          aria-label={label}
        >
          <Info className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverDescription className="text-xs">{children}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

const MACRO_LABELS: Record<MacroKey, string> = {
  protein_goal_g: "Protein (g)",
  carb_goal_g: "Carbs (g)",
  fat_goal_g: "Fat (g)",
};

export function GoalsForm({ goals }: { goals: Goals }) {
  /**
   * S69. The unit every weight on screen is shown in. Storage is always pounds,
   * so this converts at the edges -- here, and on the progress tab.
   *
   * It lives on THIS screen because it is a preference, and it sits with the
   * weight goals because those are the fields it changes under you.
   */
  const [unit, setUnit] = useState<DisplayUnit>(
    goals?.display_weight_unit === "kg" ? "kg" : "lb",
  );

  /**
   * S75. OFF for every account and turned on only here (tone decision 3). The
   * app never suggests it, prompts for it or upsells it -- a calm default is
   * only a default if nothing nags you out of it.
   */
  const [strict, setStrict] = useState(goals?.strict_mode === true);
  // Goals saved before the split was reconciled -- or edited straight in the
  // database -- arrive out of balance, so correct them on the way in rather
  // than waiting for the user to touch a field.
  const [form, setForm] = useState(() => {
    const startUnit: DisplayUnit = goals?.display_weight_unit === "kg" ? "kg" : "lb";
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
      // Held in the DISPLAY unit while being edited, and converted back to
      // pounds on save. The alternative -- holding pounds and converting on
      // every render -- makes the field fight the user's keystrokes.
      goal_weight_lb: showGoal(goals?.goal_weight_lb, startUnit),
      goal_rate_lb_per_week: showGoal(goals?.goal_rate_lb_per_week, startUnit),
    };
  });
  // The pending flag is dropped with the Save button: nothing on this screen
  // waits on a write any more, and a spinner on a field you have already left
  // is a state nobody is looking at.
  const [, startTransition] = useTransition();

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
  const weightGoals = () => {
    const weight = parseGoal(form.goal_weight_lb);
    const rate = parseGoal(form.goal_rate_lb_per_week);
    return {
      // Back to pounds on the way out, unrounded -- the same rule the weigh-in
      // sheet follows, so a kg goal does not drift by a tenth per save.
      goal_weight_lb: weight === null ? null : fromDisplay(weight, unit),
      goal_rate_lb_per_week: rate === null ? null : fromDisplay(rate, unit),
      display_weight_unit: unit,
      strict_mode: strict,
    };
  };

  /**
   * Switching the unit REWRITES THE FIELDS rather than relabelling them.
   * Leaving "180" in the box and changing the suffix to kg would silently
   * restate the goal as 397 lb the next time it was saved.
   */
  function switchUnit(next: DisplayUnit) {
    if (next === unit) return;
    const convert = (text: string) => {
      const n = parseGoal(text);
      return n === null ? "" : String(Math.round(toDisplay(fromDisplay(n, unit), next) * 10) / 10);
    };
    setForm({
      ...form,
      goal_weight_lb: convert(form.goal_weight_lb),
      goal_rate_lb_per_week: convert(form.goal_rate_lb_per_week),
    });
    setUnit(next);
  }

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

  /**
   * Written as it is changed, with no Save button.
   *
   * A preferences screen with two rows on it does not need a commit step, and
   * the button was the loudest object on the tab -- a filled bar sitting between
   * the settings and the account rows, belonging to neither. Failure is the only
   * thing that has to be said out loud: a toast on every keystroke's blur is
   * noise, and a value already on screen does not need confirming.
   */
  function save(announce = false) {
    // Blur usually reconciles first; a commit on an unbalanced form should not
    // slip a mismatched split into the database.
    const values = isBalanced(current.calorie_goal, current) ? current : reconcile("calorie_goal");

    startTransition(async () => {
      const res = await saveGoals({ ...values, ...weightGoals() });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (announce) toast.success("Goals saved");
    });
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2">
      <header className="px-1 pt-1">
        <h1 className="text-[28px] font-semibold leading-none tracking-[-0.02em]">Profile</h1>
      </header>

      <div className="card-surface space-y-6 px-5 py-5">
        {/* S75/S79. FIRST ON THE SCREEN, because it now decides what the rest
            of the screen is for: with it off there are no macro targets to set,
            so a form full of them would be asking for numbers nothing reads.

            A Field with a real description under it, not a bare switch in a row
            of switches -- the registry's own field-switch pattern. The
            disclaimer is shown HERE, where the decision is made, rather than in
            a help page nobody opens. */}
        <FieldGroup className="gap-2">
          {/* Label and hint WRAPPED, like every other hinted row on this
              screen. `orientation="horizontal"` puts `flex-auto` on a direct
              child label, which stretches it and strands the hint against the
              switch -- the one row where the mark sat on the right. */}
          <Field orientation="horizontal" className="justify-between">
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="strict_mode">Strict mode</FieldLabel>
              <FieldHint label="What strict mode does">
                Shows your macro targets on the log and trends tabs, and paints them red when you
                go past. With it off the app logs the same food and shows the same totals, without
                scoring them against anything. If a red number would sour an ordinary day, leave
                this off.
              </FieldHint>
            </div>
            <Switch
              id="strict_mode"
              checked={strict}
              onCheckedChange={(next) => {
                setStrict(next);
                save();
              }}
            />
          </Field>
        </FieldGroup>

        {/* S79. EVERY TARGET ON THIS SCREEN IS A STRICT-MODE IDEA, so in calm
            none of them are here to set. A form of numbers that nothing on any
            other tab will show you reads as a target you are held to somewhere
            off screen, which is the thing we were removing.

            Hidden, not cleared. The values stay in state and stay reconciled,
            so turning strict back on finds the split exactly as it was rather
            than a form full of defaults. */}
        {strict && (
          <>
            <Field>
              <FieldLabel
                htmlFor="calorie_goal"
                className="text-xs font-normal text-muted-foreground"
              >
                Daily calories
              </FieldLabel>
              <Input
                id="calorie_goal"
                type="number"
                inputMode="decimal"
                value={form.calorie_goal}
                onChange={(e) => setForm({ ...form, calorie_goal: e.target.value })}
                onBlur={() => {
                  reconcile("calorie_goal");
                  save();
                }}
                className="h-12 text-base tabular-nums"
              />
            </Field>

            {/* The three fields had no group label at all -- the paragraph
                underneath was doing that job as well as explaining the rule.
                With the prose behind the hint, the group needs a name of its
                own, and the running total rides on it: it describes the macros
                as a whole, which is why it sits here and not on any one field.

                Still not a FieldError. A split that disagrees with the calorie
                goal is a transient state mid-type that `reconcile` fixes on
                blur, not something the user has to correct. */}
            <FieldGroup className="gap-2">
              <div className="mb-1 flex items-center gap-1">
                <FieldLabel className="text-xs font-normal text-muted-foreground">
                  Macros
                </FieldLabel>
                <FieldHint label="How the macro split works">
                  These add up to the calorie goal above. Change any field and the rest follow, so
                  the split always spends exactly the calories you set.
                </FieldHint>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {caloriesOf(current)} cal
                </span>
              </div>
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
                      onBlur={() => {
                        reconcile(key);
                        save();
                      }}
                      className="h-12 text-base tabular-nums"
                    />
                  </Field>
                ))}
              </div>
            </FieldGroup>
          </>
        )}

        {/* S60. On the goals tab with the rest of the prescription, and read on
            the progress tab: one screen holds what you decided, the other holds
            what happened. Both blank is a legitimate state -- with no goal on
            file the progress tab simply states the rate and nothing sits beside
            it. Nothing else degrades. */}
        <FieldGroup className="gap-2">
          {/* S79. The two goal fields go with the rest of the targets; the unit
              toggle below them does NOT. It is not a goal -- it changes how
              every weight in the app reads, including the weigh-in sheet and
              the progress chart, and both of those work identically in calm. */}
          {strict && (
            <>
            <div className="mb-1 flex items-center gap-1">
              <FieldLabel className="text-xs font-normal text-muted-foreground">
                Weight goal
              </FieldLabel>
              <FieldHint label="How the weight goal reads">
                Negative to lose, positive to gain, 0 to maintain. Leave either blank for no goal.
              </FieldHint>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel
                  htmlFor="goal_weight_lb"
                  className="text-xs font-normal text-muted-foreground"
                >
                  Goal weight ({unit})
                </FieldLabel>
                <Input
                  id="goal_weight_lb"
                  type="number"
                  inputMode="decimal"
                  value={form.goal_weight_lb}
                  onChange={(e) => setForm({ ...form, goal_weight_lb: e.target.value })}
                  onBlur={() => save()}
                  placeholder="None"
                  className="h-12 text-base tabular-nums"
                />
              </Field>
              <Field>
                <FieldLabel
                  htmlFor="goal_rate_lb_per_week"
                  className="text-xs font-normal text-muted-foreground"
                >
                  Goal rate ({unit}/week)
                </FieldLabel>
                <Input
                  id="goal_rate_lb_per_week"
                  type="number"
                  inputMode="decimal"
                  value={form.goal_rate_lb_per_week}
                  onChange={(e) => setForm({ ...form, goal_rate_lb_per_week: e.target.value })}
                  onBlur={() => save()}
                  placeholder="None"
                  className="h-12 text-base tabular-nums"
                />
              </Field>
            </div>
            </>
          )}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1">
              <FieldLabel className="text-xs font-normal text-muted-foreground">
                Show weight in
              </FieldLabel>
              {/* The storage rule belongs to the TOGGLE, not to the goal
                  fields above it -- it answers "did switching this change my
                  numbers", and it is the one hint that has to survive into
                  calm, where the goal fields are gone and this row is not. */}
              <FieldHint label="How the weight unit works">
                Weight is always stored in pounds; the unit only changes what you read.
              </FieldHint>
            </div>
            {/* Registry ToggleGroup, the same control the chart window and the
                by-amount switch use -- two states with no default that is right
                for everybody is a toggle, not a dropdown. */}
            <ToggleGroup
              type="single"
              size="sm"
              className="gap-0 rounded-full bg-muted/60 p-0.5"
              value={unit}
              onValueChange={(next) => {
                if (!next) return;
                switchUnit(next as DisplayUnit);
                save();
              }}
              aria-label="Weight unit"
            >
              <ToggleGroupItem
                value="lb"
                className="rounded-full border-0 px-3 text-xs data-[state=on]:bg-card data-[state=on]:shadow-sm"
              >
                lb
              </ToggleGroupItem>
              <ToggleGroupItem
                value="kg"
                className="rounded-full border-0 px-3 text-xs data-[state=on]:bg-card data-[state=on]:shadow-sm"
              >
                kg
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </FieldGroup>

      </div>

      {/* Account, in its own card. Three full-width controls of three different
          weights stacked down the middle was the shape of an unstyled form; two
          list rows with a divider is what a settings screen looks like. */}
      <div className="card-surface divide-y divide-border/60 overflow-hidden">
        <ThemeToggle />
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            className="h-12 w-full justify-start rounded-none px-4 text-[15px] font-normal text-destructive hover:text-destructive"
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </form>
      </div>

      <p className="px-1 pb-2 text-center text-[11px] text-muted-foreground">
        Saved as you change it.
      </p>
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
