import { Monitor, Moon, Sun } from "lucide-react";
import { type Theme, useTheme } from "#components/theme-provider.tsx";
import { Button } from "#components/ui/button.tsx";

const NEXT: Record<Theme, Theme> = {
	system: "light",
	light: "dark",
	dark: "system",
};
const ICON = { light: Sun, dark: Moon, system: Monitor };

// One button that cycles system → light → dark. The label names the current choice for screen readers.
export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const Icon = ICON[theme];
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={`Theme: ${theme}. Change theme`}
			title={`Theme: ${theme}`}
			onClick={() => setTheme(NEXT[theme])}
		>
			<Icon />
		</Button>
	);
}
