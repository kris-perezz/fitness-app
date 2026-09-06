"use client";

import { useTheme } from "next-themes";
import { Cherry, ChevronRight, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "strawberry-matcha", label: "Strawberry matcha", icon: Cherry },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* A list row, not a bordered control. It sits inside a card with the
            sign-out row under it, and a second bordered box inside a box is the
            shape that made this screen read as a stack of unrelated widgets. */}
        <Button
          variant="ghost"
          className="h-12 w-full justify-start rounded-none px-4 text-[15px] font-normal"
        >
          {/* Both icons render; CSS picks one, so nothing depends on the
              resolved theme being known before hydration. */}
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
          Appearance
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={theme === value ? "font-medium" : undefined}
          >
            <Icon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
