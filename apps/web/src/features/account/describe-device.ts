// "Chrome on macOS" from a User-Agent header, for the session list. Rough on purpose: enough for a person to
// recognise their own devices. Order matters: Edge's and Chrome's headers also contain "Safari".
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
