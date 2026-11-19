import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Joins class names, letting a later Tailwind class win over a clashing earlier one:
// cn("px-2", isWide && "px-4") → "px-4". Every shadcn/ui component uses it.
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
