"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Package, Plus, Search } from "lucide-react";
import { saveScannedFood } from "@/app/actions";
import { basisLabel, searchFoods, show, type Food } from "@/lib/food";
import { FoodPicker, type PickerStep } from "@/components/food-picker";
import { EditFoodSheet } from "@/components/edit-food-sheet";
import { FoodSourceBadge } from "@/components/food-source-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { liftForKeyboard } from "@/lib/sheet";
import { useSwipe } from "@/lib/swipe";
import { PAGE, SURFACE } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Matches the add sheet: the search field and the first results without
 * burying the shelf, and vaul's keyboard handling comes with the snap points. */
const SNAP_POINTS = [0.6, 1] as const;

/**
 * The foods you have saved, and the way to save one without eating it.
 *
 * Every other path into the catalog runs through logging -- you scan a barcode
 * because you are about to write an entry, and the row lands as a side effect
 * of that entry (S3). Standing in an aisle with a packet you are not eating
 * today had no path at all, and a food saved anyway had nowhere to be seen
 * afterwards. This is both: the shelf, and the scanner pointed at it rather
 * than at a meal.
 */
export function FoodShelf({ foods }: { foods: Food[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<PickerStep | null>(null);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const [editing, setEditing] = useState<Food | null>(null);
  const [, startSave] = useTransition();

  const results = useMemo(() => searchFoods(foods, query), [foods, query]);
  const mine = useMemo(() => new Set(foods.map((f) => f.id)), [foods]);

  function open() {
    setStep({ kind: "search" });
    setSnap(SNAP_POINTS[0]);
  }

  /** Steps that need the whole screen take it -- the camera wants the height. */
  function go(next: PickerStep) {
    setStep(next);
    if (next.kind !== "search") setSnap(1);
  }

  /**
   * The end of the picker, where the log would have asked for a quantity.
   *
   * A row already on the shelf opens for correction instead of being written
   * twice; a Health Canada hit was saved by the lookup that produced it, and a
   * label was saved by the reader. Only an Open Food Facts result arrives here
   * unwritten (S3).
   */
  function keep(food: Food, scanned: boolean) {
    if (mine.has(food.id)) {
      setStep(null);
      setEditing(food);
      return;
    }
    startSave(async () => {
      if (scanned) {
        const res = await saveScannedFood(food);
        if (res.error) {
          toast.error(res.error);
          return;
        }
      }
      setStep(null);
      toast.success(`Saved ${food.name}`);
      router.refresh();
    });
  }

  const back = useSwipe({ onRight: () => router.push("/log") });

  return (
    <>
      <main className={cn(PAGE, "touch-pan-y")} {...back}>
        <header className="flex items-center gap-1 px-1 py-1">
          <Button size="icon-xl" variant="ghost" aria-label="Back to the log" asChild>
            <Link href="/log">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <span className="flex-1 text-sm font-medium">Foods</span>
          <Button size="sm" variant="ghost" className="h-11" onClick={open}>
            <Plus className="size-4" /> Add
          </Button>
        </header>

        {foods.length === 0 && (
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Package />
              </EmptyMedia>
              <EmptyTitle>Nothing saved yet</EmptyTitle>
              <EmptyDescription>
                Scan a barcode or photograph a label and the food is yours to log later —
                today, next week, or never. Nothing here is a meal.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {foods.length > 0 && (
          <>
            <div className="px-1">
              <InputGroup className="h-11">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${foods.length} saved`}
                  autoComplete="off"
                  enterKeyHint="search"
                  className="text-base"
                />
              </InputGroup>
            </div>

            <Card className={cn(SURFACE, "overflow-hidden")}>
              {results.length === 0 && (
                <Empty className="py-6">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-normal text-muted-foreground">
                      No match for &ldquo;{query}&rdquo;.
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
              <ul className="divide-y divide-border">
                {results.map((f) => (
                  <li key={f.id}>
                    <Item asChild size="sm" className="rounded-none px-3.5 py-3 active:bg-accent">
                      {/* Tapping opens the correction sheet: the shelf is where
                          a number read off a crowded packet gets fixed, and
                          that was reachable only mid-log. */}
                      <button onClick={() => setEditing(f)} className="text-left">
                        <ItemContent className="min-w-0">
                          <ItemTitle className="font-normal">{f.name}</ItemTitle>
                          <ItemDescription className="flex items-center gap-1.5 text-xs">
                            <span>
                              {show(f.kcal)} cal per {basisLabel(f)}
                            </span>
                            <FoodSourceBadge source={f.source} />
                          </ItemDescription>
                        </ItemContent>
                      </button>
                    </Item>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </main>

      <Drawer
        open={step !== null}
        onOpenChange={(isOpen) => setStep(isOpen ? { kind: "search" } : null)}
        snapPoints={[...SNAP_POINTS]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
      >
        <DrawerContent snapped onFocusCapture={liftForKeyboard(setSnap)}>
          <DrawerHeader className="px-5 pb-2 pt-0">
            <DrawerTitle className="text-base">Save a food</DrawerTitle>
            <DrawerDescription className="sr-only">
              Scan a barcode or photograph a label to keep the food without logging it.
            </DrawerDescription>
          </DrawerHeader>

          {step && <FoodPicker foods={foods} step={step} onStep={go} onPick={keep} />}
        </DrawerContent>
      </Drawer>

      <EditFoodSheet
        food={editing}
        onOpenChange={(isOpen) => !isOpen && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
        onDeleted={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </>
  );
}
