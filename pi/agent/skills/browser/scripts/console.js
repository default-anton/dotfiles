#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: start.js");
	process.exit(1);
});

const p = (await b.pages()).at(-1);

if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

// Retrieve console buffer from the page
const buffer = await p.evaluate(() => {
	if (!window.__consoleBuffer) return null;
	return window.__consoleBuffer;
});

if (!buffer || buffer.length === 0) {
	console.log("(no console entries)");
} else {
	const typeLabels = {
		log: "LOG",
		info: "INFO",
		warn: "WARN",
		error: "ERROR",
		debug: "DEBUG",
	};

	for (const entry of buffer) {
		const label = typeLabels[entry.type] || entry.type.toUpperCase();
		console.log(`[${label}] ${entry.args.join(" ")}`);
	}
}

await b.disconnect();
