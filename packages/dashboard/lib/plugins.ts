// Plugin nav registry — the dashboard's extension point.
//
// When you add a capability plugin (`graphed plugins add <name>`), its
// dashboard pages live under app/<route>/ and get one entry appended here.
// Disabled entries stay in the codebase but are hidden from nav.

export interface PluginNavEntry {
  key: string;
  label: string;
  href: string;
  group: string;
  enabled: boolean;
}

export const pluginNavEntries: PluginNavEntry[] = [
  {
    key: "seo",
    label: "SEO",
    href: "/seo",
    group: "Channels",
    enabled: true,
  },
  {
    key: "email",
    label: "Cold Email",
    href: "/email",
    group: "Channels",
    enabled: true,
  },
  {
    key: "aeo",
    label: "AI Search",
    href: "/aeo",
    group: "Channels",
    enabled: true,
  },
];
