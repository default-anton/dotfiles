#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const url = process.argv[2];
const newTab = process.argv[3] === "--new";

if (!url) {
	console.log("Usage: nav.js <url> [--new]");
	console.log("\nExamples:");
	console.log("  nav.js https://example.com       # Navigate current tab");
	console.log("  nav.js https://example.com --new # Open in new tab");
	process.exit(1);
}

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

// Console capture code to inject
const consoleCapture = () => {
	if (window.__consoleCaptureInstalled) return;
	window.__consoleCaptureInstalled = true;
	window.__consoleBuffer = [];

	const methods = ["log", "warn", "error", "info", "debug"];
	const originals = {};

	for (const method of methods) {
		originals[method] = console[method];
		console[method] = (...args) => {
			window.__consoleBuffer.push({
				type: method,
				args: args.map((a) => {
					if (typeof a === "object") {
						try {
							return JSON.stringify(a);
						} catch {
							return String(a);
						}
					}
					return String(a);
				}),
				timestamp: Date.now(),
			});
			originals[method](...args);
		};
	}
};

if (newTab) {
	const p = await b.newPage();
	await p.evaluateOnNewDocument(consoleCapture);
	await p.goto(url, { waitUntil: "domcontentloaded" });
	console.log("✓ Opened:", url);
} else {
	const p = (await b.pages()).at(-1);
	await p.evaluateOnNewDocument(consoleCapture);
	await p.goto(url, { waitUntil: "domcontentloaded" });
	console.log("✓ Navigated to:", url);
}

await b.disconnect();
