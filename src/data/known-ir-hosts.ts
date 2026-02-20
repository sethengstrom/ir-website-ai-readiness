/**
 * Known IR host domains by vendor. Used when HTML/DNS fingerprinting doesn't detect the platform
 * (e.g. client-rendered sites, bot-blocked, or custom domains). Add domains here as you confirm them.
 *
 * Match: exact hostname or hostname.endsWith("." + entry) for subdomains.
 */

/** Hostnames known to be on Q4 (e.g. "Powered by Q4" not in server HTML, or confirmed manually). */
export const KNOWN_Q4_HOSTS: string[] = [
  "investor.nvidia.com",
  "www.oracle.com",
  "ir.blackrock.com",
];

/** Hostnames known to be on Notified when DNS/HTML detection misses. */
export const KNOWN_NOTIFIED_HOSTS: string[] = [
  "investors.zoom.us",
];

/** Hostnames known to be on Equisolve. */
export const KNOWN_EQUISOLVE_HOSTS: string[] = [];

/** Hostnames known to be on Investis. */
export const KNOWN_INVESTIS_HOSTS: string[] = [];
