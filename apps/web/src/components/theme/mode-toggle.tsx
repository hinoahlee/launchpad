import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "#components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#components/ui/dropdown-menu.tsx";
import { useTheme } from "./provider.tsx";

// The icon follows the applied theme through CSS (`dark:`), so it is right from the first paint.
export function ModeToggle() {
	const { setTheme } = useTheme();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
				<Sun className="dark:hidden" />
				<Moon className="hidden dark:block" />
				<span className="sr-only">Change theme</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => setTheme("light")}>
					<Sun /> Light
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("dark")}>
					<Moon /> Dark
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("system")}>
					<Monitor /> System
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
