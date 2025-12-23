import type { HookAPI } from "@mariozechner/pi-coding-agent/hooks"

const TOKEN_ENV = "VERTEX_OPENAI_TOKEN"
// Token lives for 60 minutes, refresh every 30 minutes
const REFRESH_MS = 30 * 60 * 1000

async function refresh(ctx: any) {
  const { stdout, code } = await ctx.exec("gcloud", [
    "auth",
    "application-default",
    "print-access-token",
  ])

  if (code === 0) {
    const token = stdout.trim()
    if (token) {
      process.env[TOKEN_ENV] = token
      if (ctx.hasUI) ctx.ui?.notify("Vertex AI token refreshed successfully", "info")
    } else if (ctx.hasUI) {
      ctx.ui.notify("Vertex AI token refresh returned empty output", "warning")
    }
    return
  }

  if (ctx.hasUI) ctx.ui.notify("Failed to refresh Vertex AI token", "error")
}

export default function(pi: HookAPI) {
  let timer: NodeJS.Timeout | null = null

  const stop = () => {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  const start = async (ctx: any) => {
    if (!process.env[TOKEN_ENV]) return
    stop()
    timer = setInterval(() => {
      refresh(ctx).catch(() => { })
    }, REFRESH_MS)
  }

  pi.on("session", async (event, ctx) => {
    if (
      event.reason === "before_switch" ||
      event.reason === "before_branch" ||
      event.reason === "before_clear" ||
      event.reason === "shutdown"
    ) {
      stop()
      return
    }

    if (
      event.reason === "start" ||
      event.reason === "switch" ||
      event.reason === "branch" ||
      event.reason === "clear"
    ) {
      await start(ctx)
    }
  })
}
