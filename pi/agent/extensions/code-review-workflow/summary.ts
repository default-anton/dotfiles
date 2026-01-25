interface Message {
	role: string;
	content: Array<{
		type: string;
		text?: string;
		toolName?: string;
	}>;
}

interface Entry {
	type: string;
	message?: Message;
}

export function extractAssistantSummary(entries: Entry[]): string {
	const assistantTexts: string[] = [];

	for (const entry of entries) {
		if (entry.type !== "message" || entry.message?.role !== "assistant") continue;

		const hasToolCalls = entry.message.content.some(
			(part) => part.type === "toolCall" || part.toolName,
		);

    if (hasToolCalls) continue;

		const textParts = entry.message.content
			.filter((part) => part.type === "text" && part.text)
			.map((part) => part.text)
			.join("\n");

		if (textParts.trim()) {
			assistantTexts.push(textParts);
		}
	}

	return assistantTexts.join("\n\n---\n\n");
}

export function formatConversationForExtraction(entries: Entry[]): string {
	const lines: string[] = [];

	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message) continue;

		const role = entry.message.role;
		const content = entry.message.content
			.filter((part) => part.type === "text" && part.text)
			.map((part) => part.text)
			.join("\n");

		if (content.trim()) {
			lines.push(`${role.toUpperCase()}:`);
			lines.push(content);
			lines.push("");
		}
	}

	return lines.join("\n");
}
