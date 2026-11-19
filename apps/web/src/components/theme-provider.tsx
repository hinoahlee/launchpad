import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type Theme = "light" | "dark" | "system";

// Same key and values as public/theme-init.js, which applies the theme before React loads.
const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function storedTheme(): Theme {
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return value === "light" || value === "dark" ? value : "system";
	} catch {
		return "system";
	}
}

function apply(theme: Theme): void {
	const dark =
		theme === "dark" ||
		(theme === "system" && window.matchMedia(DARK_QUERY).matches);
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.classList.toggle("light", !dark);
}

type ThemeState = { theme: Theme; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeState | undefined>(undefined);

// Light, dark, or "system" (follow the OS, live). Client state: owned by this browser and kept in
// localStorage, unlike server state, which TanStack Query fetches from the API and caches.
export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState(storedTheme);

	const setTheme = useCallback((next: Theme) => {
		try {
			if (next === "system") localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Not saved; still applied for this visit.
		}
		setThemeState(next);
	}, []);

	useEffect(() => {
		apply(theme);
		if (theme !== "system") return;
		const query = window.matchMedia(DARK_QUERY);
		const onChange = () => apply("system");
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, [theme]);

	const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
	return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeState {
	const state = useContext(ThemeContext);
	if (!state) throw new Error("useTheme must be used inside <ThemeProvider>");
	return state;
}
