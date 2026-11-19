import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "#components/theme-provider.tsx";
import { Button } from "#components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#components/ui/dropdown-menu.tsx";

// shadcn/ui's Vite dark-mode pattern: a menu of Light / Dark / System. The icon follows the applied theme
// through CSS (`dark:`), so it's right from the first paint.
export function ModeToggle() {
	const { theme, setTheme } = useTheme();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				{/* size-11: a 44px touch target. */}
				<Button variant="ghost" size="icon" className="size-11">
					<Sun className="dark:hidden" />
					<Moon className="hidden dark:block" />
					<span className="sr-only">Change theme</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem
					data-active={theme === "light"}
					onSelect={() => setTheme("light")}
				>
					<Sun /> Light
				</DropdownMenuItem>
				<DropdownMenuItem
					data-active={theme === "dark"}
					onSelect={() => setTheme("dark")}
				>
					<Moon /> Dark
				</DropdownMenuItem>
				<DropdownMenuItem
					data-active={theme === "system"}
					onSelect={() => setTheme("system")}
				>
					<Monitor /> System
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
