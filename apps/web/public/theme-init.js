// Sets the light/dark class before the first paint, so a dark-mode visitor never sees a white flash.
// A file, not an inline <script>: the CSP (script-src 'self') blocks inline scripts. Keep the "theme" key
// and values in sync with src/components/theme-provider.tsx, which takes over once React loads.
try {
	const theme = localStorage.getItem("theme");
	const dark =
		theme === "dark" ||
		(theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.add(dark ? "dark" : "light");
} catch {
	// Storage blocked (private mode, strict settings): the CSS falls back to light.
}
