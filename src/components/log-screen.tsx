"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookmarkPlus,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CookingPot,
  Package,
  Pencil,
  Plus,
} from "lucide-react";
import {
  LOG_BUFFER_DAYS,
  LOG_WINDOW_DAYS,
  MEALS,
  shiftDate,
  todayDate,
  type Food,
  type IntakeEntry,
  type Meal,
} from "@/lib/food";
import { deleteEntry, loadIntakeWindow, saveEntryAsFood } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { statusOf, toneOf, type Metric, type Paint, type Tone } from "@/lib/tone";
import { AddSheet } from "@/components/add-sheet";
import { ConfirmAction } from "@/components/confirm-action";
import { EditFoodSheet } from "@/components/edit-food-sheet";
import { FoodSourceBadge } from "@/components/food-source-badge";
import { CalorieRing } from "@/components/calorie-ring";
import { toast } from "sonner";
import { PAGE, SURFACE, SURFACE_PAD } from "@/lib/ui";
import { useSwipe } from "@/lib/swipe";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import type { DayGoal } from "@/lib/goals";

type Entry = IntakeEntry;

const round = (v: number) => Math.round(v);
const withCommas = (v: number) => round(v).toLocaleString();

export function LogScreen({
  date: initialDate,
  loadedFrom,
  loadedTo,
  foods,
  entries: initialEntries,
  dayGoals: initialDayGoals,
  strictMode,
}: {
  /** The day to open on -- today, or whatever `?date=` asked for. */
  date: string;
  /** Oldest and newest day the server sent, inclusive. */
  loadedFrom: string;
  loadedTo: string;
  foods: Food[];
  entries: Entry[];
  /**
   * S60. One row per day that has one, for every day in the loaded window.
   * A day with no row here has no goal -- it is not resolved against an
   * earlier or later day's number, only ever its own.
   */
  dayGoals: DayGoal[];
  /** S75/S77. Read live, never dated -- the tone owns no data. */
  strictMode: boolean;
}) {
  const router = useRouter();
  const [addingTo, setAddingTo] = useState<Meal | null>(null);
  const [detail, setDetail] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<Food | null>(null);

  // The day is state, not a URL parameter and not a server round trip. Every
  // entry in the window is already here, so an arrow is a filter rather than a
  // fetch -- which is the only way it is ever instant.
  const [date, setDate] = useState(initialDate);

  // The window, and everything in it. Grown outwards in place rather than
  // refetched, so a day already held is never asked for twice.
  const [entries, setEntries] = useState(initialEntries);
  // S60. Grown alongside `entries`, by the same fetch -- a day's goal is read
  // from the same window its food is, never fetched or filtered separately.
  const [dayGoals, setDayGoals] = useState(initialDayGoals);
  const [from, setFrom] = useState(loadedFrom);
  const [to, setTo] = useState(loadedTo);
  const loading = useRef(false);

  const today = todayDate();

  /**
   * Extend BEFORE the edge is reached, not when it is hit -- the same contract
   * train-home.tsx keeps, and see the comment there for why.
   *
   * Two directions rather than one, because days page forward as well as back.
   * Forward stops at today: there is nothing after it to hold.
   */
  useEffect(() => {
    if (loading.current) return;

    const back = date < shiftDate(from, LOG_BUFFER_DAYS);
    const forward = to < today && date > shiftDate(to, -LOG_BUFFER_DAYS);
    if (!back && !forward) return;

    const nextFrom = back ? shiftDate(from, -LOG_WINDOW_DAYS) : from;
    const ahead = shiftDate(to, LOG_WINDOW_DAYS);
    const nextTo = forward ? (ahead > today ? today : ahead) : to;

    // Only the stretch not already held. Asking for the whole new window would
    // re-fetch the days on screen and hand back duplicates of them.
    const fetchFrom = back ? nextFrom : shiftDate(to, 1);
    const fetchTo = back ? shiftDate(from, -1) : nextTo;

    loading.current = true;
    void loadIntakeWindow(fetchFrom, fetchTo)
      .then((res) => {
        if (res.error) return; // Silent: nothing is broken, there is just less history on screen.
        setEntries((prev) => [...prev, ...res.entries]);
        setDayGoals((prev) => [...prev, ...res.dayGoals]);
        setFrom(nextFrom);
        setTo(nextTo);
      })
      // In `finally` so a rejected call releases the guard too. Clearing it
      // only on success latches it for the session and every later extension
      // is skipped.
      .finally(() => {
        loading.current = false;
      });
  }, [date, from, to, today]);

  const dayEntries = useMemo(() => entries.filter((e) => e.log_date === date), [entries, date]);

  const totals = dayEntries.reduce(
    (a, e) => ({
      kcal: a.kcal + e.kcal,
      protein_g: a.protein_g + e.protein_g,
      fat_g: a.fat_g + e.fat_g,
      carb_g: a.carb_g + e.carb_g,
    }),
    { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
  );

  // S60. This day's own row, never an earlier or later one's. Undefined
  // before the user's first entry or first goals save under this feature --
  // a day genuinely has no goal, the same state a user with none set is
  // already in, so nothing here invents one.
  const goal = useMemo(() => dayGoals.find((g) => g.log_date === date), [dayGoals, date]);
  // 0 rather than a default: every check downstream already treats a goal
  // `<= 0` as "nothing to grade", which is what CalorieRing's `goal: number`
  // prop uses for the same case, so the ring needs no second, nullable shape.
  const calorieGoal = goal?.calorie_goal ?? 0;
  // S75. Calm unless the user turned it on. Never suggested, never prompted.
  const tone: Tone = strictMode ? "strict" : "calm";

  // S71. A day still being lived is not a day you fell short of: at 2pm, under
  // a floor only means dinner has not happened. Yesterday is finished and can
  // be summarised; today cannot.
  const finished = date < today;
  const label =
    date === today
      ? "Today"
      : date === shiftDate(today, -1)
        ? "Yesterday"
        : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

  // Shared by the swipe on a row and the Delete button in the entry detail --
  // one place decides what a removed entry does to the window on screen.
  const [, startEntryDelete] = useTransition();
  function removeEntry(entry: Entry) {
    startEntryDelete(async () => {
      const res = await deleteEntry(entry.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    });
  }

  // The same step the two arrows in the header take, on the whole page: a day
  // is what this screen is, so paging it should not mean finding a 44px target
  // at the top of it. Forward stops at today, exactly as the arrow does.
  const swipe = useSwipe({
    onLeft: () => date < today && setDate(shiftDate(date, 1)),
    onRight: () => setDate(shiftDate(date, -1)),
  });

  return (
    <>
      <main className={cn(PAGE, "touch-pan-y")} {...swipe}>
        <header className="flex items-center gap-1 px-1 py-1">
          <Button
            size="icon-xl"
            variant="ghost"
            aria-label="Previous day"
            onClick={() => setDate(shiftDate(date, -1))}
          >
            <ChevronLeft className="size-5" />
          </Button>

          {/* S103. The one way into the month view -- a chevron beside the
              date rather than a second calendar icon competing with Recipes
              and Trends for the same row. The date text stays the label; the
              chevron is the whole affordance. */}
          <h1 className="flex-1">
            <Button
              variant="ghost"
              asChild
              className="h-11 w-full justify-center gap-1 text-[17px] font-semibold tracking-[-0.01em]"
            >
              <Link href="/log/month" prefetch>
                {label}
                <ChevronDown className="size-4 text-muted-foreground" />
              </Link>
            </Button>
          </h1>

          <div className="flex items-center gap-0.5">
            <Button
              size="icon-xl"
              variant="ghost"
              aria-label="Next day"
              disabled={date >= today}
              onClick={() => setDate(shiftDate(date, 1))}
            >
              <ChevronRight className="size-5" />
            </Button>
            {/* Foods, Recipes and Trends are Food-section destinations with no
                tab of their own (see bottom-nav.tsx), so this header is the way
                in. They sit after the day arrows because they are not part of
                them -- and Trends sits last because it is the one that leaves
                today behind entirely. */}
            <Button size="icon-xl" variant="ghost" aria-label="Foods" asChild>
              <Link href="/foods" prefetch>
                <Package className="size-5" />
              </Link>
            </Button>
            <Button size="icon-xl" variant="ghost" aria-label="Recipes" asChild>
              <Link href="/recipes">
                <CookingPot className="size-5" />
              </Link>
            </Button>
            <Button size="icon-xl" variant="ghost" aria-label="Trends" asChild>
              <Link href="/trends">
                <ChartNoAxesColumn className="size-5" />
              </Link>
            </Button>
          </div>
        </header>

        <Card className={cn(SURFACE, SURFACE_PAD)}>
          <CalorieRing consumed={totals.kcal} goal={calorieGoal} finished={finished} tone={tone} />

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MacroMeter
              label="Protein"
              metric="protein"
              value={totals.protein_g}
              goal={goal?.protein_goal_g ?? null}
              finished={finished}
              tone={tone}
            />
            <MacroMeter
              label="Carbs"
              metric="carbs"
              value={totals.carb_g}
              goal={goal?.carb_goal_g ?? null}
              finished={finished}
              tone={tone}
            />
            <MacroMeter
              label="Fat"
              metric="fat"
              value={totals.fat_g}
              goal={goal?.fat_goal_g ?? null}
              finished={finished}
              tone={tone}
            />
          </div>
        </Card>

        {MEALS.map((meal) => {
          const items = dayEntries.filter((e) => e.meal === meal);
          const mealKcal = items.reduce((sum, e) => sum + e.kcal, 0);

          return (
            <Card key={meal} className={SURFACE}>
              <div className="flex items-baseline justify-between px-3.5 pb-2 pt-3">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{meal}</h2>
                <span className="text-[15px] tabular-nums text-muted-foreground">
                  {withCommas(mealKcal)}
                </span>
              </div>

              {items.length > 0 && (
                <ul>
                  {items.map((e) => (
                    <li key={e.id}>
                      {/* The entry detail keeps the Delete button it always
                          had; this is the shortcut past it for the entry you
                          only opened to get rid of. */}
                      <SwipeToDelete
                        title={`Delete ${e.name}?`}
                        description={`${round(e.kcal)} calories come off ${e.meal}. This cannot be undone.`}
                        onConfirm={() => removeEntry(e)}
                      >
                        <Item
                          asChild
                          size="sm"
                          className="rounded-none px-3.5 py-2 active:bg-accent"
                        >
                          <button onClick={() => setDetail(e)} className="text-left">
                            <ItemContent className="min-w-0">
                              <ItemTitle className="font-normal">{e.name}</ItemTitle>
                              <ItemDescription className="text-xs">
                                {e.qty} {e.unit}
                                {e.estimate && " · estimate"}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions className="shrink-0 text-sm tabular-nums text-muted-foreground">
                              {withCommas(e.kcal)}
                            </ItemActions>
                          </button>
                        </Item>
                      </SwipeToDelete>
                    </li>
                  ))}
                </ul>
              )}

              {/* Quiet and left-aligned. Four outlined full-width buttons on one
                  screen is four calls to action of equal weight, which leaves the
                  meal headings with no rank of their own -- and an empty day read
                  as a form rather than as a day. */}
              <Button
                variant="ghost"
                className="h-10 w-full justify-start px-3.5 text-sm font-normal text-muted-foreground"
                onClick={() => setAddingTo(meal)}
              >
                <Plus className="size-4" /> Add food
              </Button>
            </Card>
          );
        })}
      </main>

      <AddSheet
        meal={addingTo}
        onOpenChange={(open) => !open && setAddingTo(null)}
        foods={foods}
        date={date}
        // The window is what the screen reads now, so a saved entry has to land
        // in it. A revalidate still runs on the server for whoever loads the
        // page next; it can no longer be what puts the food on this one.
        onAdded={(entry) => setEntries((prev) => [...prev, entry])}
      />
      <EntryDetail
        entry={detail}
        food={detail?.food_id ? (foods.find((f) => f.id === detail.food_id) ?? null) : null}
        onClose={() => setDetail(null)}
        onDeleted={(id) => setEntries((prev) => prev.filter((e) => e.id !== id))}
        onEditFood={(food) => {
          // Close the entry first: two stacked drawers fight over the scroll
          // lock, and the detail has nothing left to say once the form is up.
          setDetail(null);
          setEditing(food);
        }}
        // S99. The new row has to reach the catalog this screen was rendered
        // with, or the food you just saved is missing from the next search.
        onSavedAsFood={() => router.refresh()}
      />
      <EditFoodSheet
        food={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        // The corrected row (or its fork) has to reach the catalog this screen
        // was rendered with, and a fork is a new row entirely -- a refresh is
        // the honest way to get both.
        onSaved={() => router.refresh()}
      />
    </>
  );
}

/**
 * One macro, and in strict mode the goal it is measured against (S72/S74).
 *
 * TAKES THE METRIC, NOT JUST THE GOAL. A goal number cannot say which way is
 * good, and this component used to assume every one of them was a ceiling --
 * so protein went `destructive` at 200 g against a 155 g floor, red at the user
 * for hitting the thing they were aiming at. Direction is declared once in
 * `lib/tone.ts` and asked for here.
 *
 * S79: CALM SHOWS THE NUMBER AND STOPS. No `82 / 155g`, no bar behind it -- a
 * fraction is a score whatever colour it is painted, and three of them under
 * the ring turn a day of eating into three things you are behind on. The goals
 * still exist, still drive the calorie split, and still come back the moment
 * strict is on; the calm screen just does not grade you against them.
 */
/**
 * The hue a macro's figure takes at each status. The number carries it; the
 * fraction beside it is what says how far off the day is.
 */
const PAINT: Record<Paint, string> = {
  none: "",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

function MacroMeter({
  label,
  metric,
  value,
  goal,
  finished,
  tone,
}: {
  label: string;
  metric: Metric;
  value: number;
  goal: number | null;
  /** S71. An unfinished day is never short -- dinner has not happened yet. */
  finished: boolean;
  tone: Tone;
}) {
  // S79. The goal is a strict-mode idea. Resolved HERE rather than at the three
  // call sites so there is one place that can ever decide to grade a macro.
  const against = tone === "strict" ? goal : null;
  const paint = toneOf(metric, statusOf(metric, value, against, finished), tone);
  const paintClass = PAINT[paint];

  return (
    // A TILE, not a line. Label-left value-right across a third of the width
    // puts two 12px words at opposite ends of a cell with nothing between them,
    // and the three of them then read across as one run-on string. Bounds and a
    // stack are what separate them.
    <div className="py-1 text-center">
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-semibold leading-none tabular-nums", paintClass)}>
        {round(value)}
        {against === null ? (
          <span className="text-xs font-normal text-muted-foreground">g</span>
        ) : (
          <span className="text-xs font-normal text-muted-foreground">/{round(against)}g</span>
        )}
      </div>
    </div>
  );
}

function EntryDetail({
  entry,
  food,
  onClose,
  onDeleted,
  onEditFood,
  onSavedAsFood,
}: {
  entry: Entry | null;
  /** The catalog row this entry was logged against, when it still exists. */
  food: Food | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onEditFood: (food: Food) => void;
  onSavedAsFood: () => void;
}) {
  // One transition per action, not one for the sheet: a shared flag makes the
  // Delete button announce "Deleting" while a save is what is actually running.
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const pending = saving || deleting;

  return (
    <Drawer open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader className="sr-only">
          <DrawerTitle>{entry?.name ?? "Entry"}</DrawerTitle>
          <DrawerDescription>Nutrition for this entry.</DrawerDescription>
        </DrawerHeader>

        {entry && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold leading-tight">{entry.name}</h2>
                {food && <FoodSourceBadge source={food.source} />}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {entry.qty} {entry.unit} · {entry.meal}
                {entry.estimate && " · estimate"}
              </p>

              {/* S100. The longer sentence the name was titled from, kept out
                  of the list and shown only here, where there is room to read
                  it. Absent for a catalog food and for anything logged before
                  this existed. */}
              {entry.description && (
                <p className="mt-2 text-sm text-muted-foreground">{entry.description}</p>
              )}

              {/* Hand-rolled: see ingredient-sheet.tsx -- Chart is the only
                  registry option and it would pull recharts in to render six
                  numbers. */}
              <dl className="mt-6 grid grid-cols-3 gap-y-5 border-t border-border pt-5">
                {[
                  ["Calories", withCommas(entry.kcal)],
                  ["Protein", `${round(entry.protein_g)}g`],
                  ["Carbs", `${round(entry.carb_g)}g`],
                  ["Fat", `${round(entry.fat_g)}g`],
                  ["Fibre", `${round(entry.fiber_g)}g`],
                  ["Sodium", `${withCommas(entry.sodium_mg)}mg`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-lg tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

            </div>

            <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
              {/* S7 lives here rather than behind an overflow menu: the entry
                  detail IS this screen's overflow, and a drawer already open
                  under a thumb should not need a second menu inside it.
                  Offered only when there is a catalog row to correct. */}
              <ButtonGroup className="w-full">
                {food && (
                  <Button
                    variant="outline"
                    className="h-11 flex-1"
                    disabled={pending}
                    onClick={() => onEditFood(food)}
                  >
                    <Pencil className="size-4" /> Edit food
                  </Button>
                )}
                {/* S99. The other half of the same slot: an entry with a
                    catalog row behind it can be corrected, and one without can
                    be turned into a row. Only ever one of the two shows, so
                    the group stays at two buttons under a thumb. */}
                {!food && entry.food_id === null && (
                  <Button
                    variant="outline"
                    className="h-11 flex-1"
                    disabled={pending}
                    onClick={() =>
                      startSave(async () => {
                        const res = await saveEntryAsFood(entry.id);
                        if (res.error || !res.food) {
                          toast.error(res.error ?? "Could not save that as a food.");
                          return;
                        }
                        // Says forward-looking out loud. This entry keeps the
                        // numbers and the estimate flag it was logged with.
                        toast.success(`Saved ${res.food.name}. Next time it is in search.`);
                        onSavedAsFood();
                        onClose();
                      })
                    }
                  >
                    <BookmarkPlus className="size-4" /> Save as food
                  </Button>
                )}
                <ConfirmAction
                  title={`Delete ${entry.name}?`}
                  description={`${round(entry.kcal)} calories come off ${entry.meal}. This cannot be undone.`}
                  onConfirm={() =>
                    startDelete(async () => {
                      const res = await deleteEntry(entry.id);
                      if (res.error) {
                        toast.error(res.error);
                        return;
                      }
                      onDeleted(entry.id);
                      onClose();
                    })
                  }
                  trigger={
                    <Button
                      variant="outline"
                      className="h-11 flex-1 text-destructive"
                      disabled={pending}
                    >
                      {deleting ? "Deleting" : "Delete"}
                    </Button>
                  }
                />
              </ButtonGroup>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
