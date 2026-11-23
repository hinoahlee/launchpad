// "Chrome on macOS". Rough on purpose. Order matters: Edge and Chrome headers also contain "Safari".
const browsers: [RegExp, string][] = [
	[/Edg\//, "Edge"],
	[/Firefox\//, "Firefox"],
	[/Chrome\//, "Chrome"],
	[/Safari\//, "Safari"],
];
const systems: [RegExp, string][] = [
	[/iPhone/, "iPhone"],
	[/iPad/, "iPad"],
	[/Android/, "Android"],
	[/Windows/, "Windows"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/Linux/, "Linux"],
];

const match = (ua: string, list: [RegExp, string][]) =>
	list.find(([pattern]) => pattern.test(ua))?.[1];

export function describeDevice(userAgent: string | null): string {
	if (!userAgent) return "Unknown device";
	const browser = match(userAgent, browsers);
	const system = match(userAgent, systems);
	if (browser && system) return `${browser} on ${system}`;
	return browser ?? system ?? "Unknown device";
}
