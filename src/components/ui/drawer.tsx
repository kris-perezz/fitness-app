"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/lib/media-query"
import { useSheetBack } from "@/lib/sheet-back"

/**
 * Set when the drawer renders as a centered modal. Title, Description, Close and
 * Trigger are plain Radix Dialog parts in vaul too, so only Root and Content
 * have to switch.
 */
const ModalContext = React.createContext<{ dismissible: boolean } | null>(null)

/**
 * A bottom sheet on a phone, a floating modal from `md` up. Without a keyboard
 * to lift it, a sheet stays at the bottom of a desktop screen, far from the eye.
 * The registry Dialog was considered: its padded grid and close button would
 * fight the layout every drawer body already has, so the Radix primitive is
 * used directly with the drawer's own surface.
 */
function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  useSheetBack((props.open ?? false) && props.dismissible !== false, () => props.onOpenChange?.(false))
  // `md`, where the bottom nav becomes the side rail.
  const desktop = useMediaQuery("(min-width: 48rem)")
  if (desktop) {
    return (
      <ModalContext value={{ dismissible: props.dismissible !== false }}>
        <DialogPrimitive.Root
          data-slot="drawer"
          open={props.open}
          defaultOpen={props.defaultOpen}
          onOpenChange={props.onOpenChange}
        >
          {props.children}
        </DialogPrimitive.Root>
      </ModalContext>
    )
  }
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

/**
 * Never faded: fading a backdrop blur re-blurs the whole screen every frame,
 * while a still one is drawn once. `!` beats the fade vaul injects itself.
 */
const OVERLAY =
  "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs animate-none! transition-none!"

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        OVERLAY,
        className
      )}
      {...props}
    />
  )
}

/**
 * `snapped` is set by callers that pass `snapPoints` to <Drawer>. Vaul then
 * controls the height, so the fixed max-height has to come off or the sheet
 * cannot be dragged past it -- which is what makes an unsnapped drawer feel
 * like a modal with rounded corners.
 */
function DrawerContent({
  className,
  children,
  snapped = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & { snapped?: boolean }) {
  const modal = React.useContext(ModalContext)
  if (modal) {
    const block = (event: Event) => !modal.dismissible && event.preventDefault()
    return (
      <DialogPrimitive.Portal data-slot="drawer-portal">
        {/* vaul's Overlay reads vaul's context, which a Dialog root lacks. */}
        <DialogPrimitive.Overlay data-slot="drawer-overlay" className={OVERLAY} />
        <DialogPrimitive.Content
          data-slot="drawer-content"
          className={cn(
            "group/drawer-content fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-popover pt-6 text-sm text-popover-foreground shadow-lg duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            // A snapped body is laid out to fill its sheet, so it needs a height to fill.
            snapped && "h-[85dvh]",
            className
          )}
          {...props}
          onInteractOutside={(event) => {
            block(event)
            props.onInteractOutside?.(event)
          }}
          onEscapeKeyDown={(event) => {
            block(event)
            props.onEscapeKeyDown?.(event)
          }}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )
  }
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-popover text-sm text-popover-foreground data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80dvh] data-[vaul-drawer-direction=bottom]:rounded-t-xl data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-xl data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-xl data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80dvh] data-[vaul-drawer-direction=top]:rounded-b-xl data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm data-[vaul-drawer-direction=bottom]:sm:mx-auto data-[vaul-drawer-direction=bottom]:sm:max-w-lg",
          snapped && "h-full data-[vaul-drawer-direction=bottom]:max-h-full",
          className
        )}
        {...props}
      >
        <DrawerPrimitive.Handle className="mx-auto mt-4 mb-2 hidden h-1 w-[100px] shrink-0 cursor-grab rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-0.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
