// shadcn/ui's Button (ui.shadcn.com/docs/components/button), copied in so we own it and can change it.
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#lib/utils.ts";

export const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90",
				destructive:
					"bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30",
				outline:
					"border bg-background hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			// 44px (h-11 / size-11) is the smallest comfortable touch target. `sm` is for dense desktop UI only.
			size: {
				default: "h-11 px-4",
				sm: "h-9 px-3",
				lg: "h-12 px-6",
				icon: "size-11",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

export function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
	// asChild: render the child element (e.g. a router <Link>) with the button's styles instead of a <button>.
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}
