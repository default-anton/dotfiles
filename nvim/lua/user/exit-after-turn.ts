import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function exitAfterTurn(pi: ExtensionAPI) {
	pi.on("agent_end", async (_event, ctx) => {
		ctx.shutdown();
	});
}
