import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./app.tsx";
import { config } from "./config.ts";
import {
	initSentry,
	reactErrorOptions,
	throwTestErrorIfAsked,
} from "./lib/sentry.ts";

// First, so errors during startup are reported too.
initSentry(config);

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root, reactErrorOptions).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

throwTestErrorIfAsked();
