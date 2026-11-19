import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "#components/theme-provider.tsx";
import { Button } from "#components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#components/ui/dropdown-menu.tsx";

// shadcn/ui's dark-mode pattern: a menu of Light / Dark / System. The icon follows the applied theme through
// CSS (`dark:`), so it's right from the first paint. Base UI's `render` puts the trigger's behavior on our Button.
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
