// Sets the theme class before first paint (no white flash). A file, because the CSP blocks inline scripts.
// Keep the key and values in sync with src/components/theme/provider.tsx.
try {
	const theme = localStorage.getItem("theme");
	const dark =
		theme === "dark" ||
		(theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.add(dark ? "dark" : "light");
} catch {
	// Storage blocked (private mode, strict settings): the CSS falls back to light.
}
