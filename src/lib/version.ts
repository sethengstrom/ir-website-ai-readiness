import packageJson from "../../package.json";

/** Application version (from package.json). Shown in UI footer. */
export const APP_VERSION = (packageJson as { version?: string }).version ?? "0.0.0";
