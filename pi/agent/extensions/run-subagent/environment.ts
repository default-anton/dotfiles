const PANE_ENVIRONMENT = [
  "HERDR_BIN_PATH",
  "HERDR_CONFIG_PATH",
  "HERDR_ENV",
  "HERDR_PANE_ID",
  "HERDR_SESSION",
  "HERDR_SOCKET_PATH",
  "HERDR_TAB_ID",
  "HERDR_WORKSPACE_ID",
  "COLORTERM",
  "COLUMNS",
  "LINES",
  "PWD",
  "TERM",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
];

const SESSION_ENVIRONMENT = new Set([
  "PI_SESSION_ID",
  "PI_SESSION_FILE",
  "PI_PROVIDER",
  "PI_MODEL",
  "PI_REASONING_LEVEL",
  "SHLVL",
  "_",
]);

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function isolatedEnvironmentArgs(env: NodeJS.ProcessEnv): string[] {
  const assignments = Object.entries(env)
    .filter(([key, value]) =>
      value !== undefined &&
      !key.startsWith("HERDR_") &&
      !PANE_ENVIRONMENT.includes(key) &&
      !SESSION_ENVIRONMENT.has(key)
    )
    .map(([key, value]) => shellEscape(`${key}=${value}`));
  return [
    "env",
    "-i",
    ...assignments,
    ...PANE_ENVIRONMENT.map((key) => `\${${key}+"${key}=$${key}"}`),
  ];
}
