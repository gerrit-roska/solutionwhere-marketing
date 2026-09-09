---
name: graphed
description: Deploy and operate software on Graphed with the `graphed` CLI. Use when setting up marketing agents or capabilities (SEO, cold outbound, ads reporting — via `graphed init` + `graphed plugins add`), deploying services, writing or updating a graphed.yaml manifest, managing accounts, projects, or secrets, checking deploy status or logs, or working with Graphed databases, cron jobs, warehouses, or Graphed Tools.
---

# Graphed

Graphed deploys and operates services from a `graphed.yaml` manifest using the
`graphed` CLI.

This skill is a router: the authoritative, version-matched playbook ships inside
the installed CLI. Always load it before doing Graphed work:

```sh
graphed docs agents
```

Load deeper topics as the task requires:

- `graphed docs quickstart` — end-to-end setup and first deploy
- `graphed docs manifest` — `graphed.yaml` reference
- `graphed docs commands` — command reference and examples
- `graphed docs plugins` — capability kits (`graphed init`, `graphed plugins add`)
- `graphed docs feedback` — how to report platform bugs and missing features
- `graphed docs sdk` — TypeScript client for warehouse, Tools, and the OpenRouter LLM proxy
- `graphed docs warehouse` — warehouse query API schema
- `graphed docs tools` — named Graphed Tools and vendor proxies
- `graphed docs storage` — project object storage with S3-compatible clients
- `graphed docs troubleshooting` — common errors and recovery

If `graphed` is not on PATH, install it (`npm i -g @graphed-inc/cli`) or ask the
operator for access before proceeding.

Rules:

- **"Set up an \<X\> agent" (SEO, cold outbound, reporting, ...) is a plugin
  task.** Run `graphed plugins list` / `graphed plugins search "<X>"` and
  integrate the kit with `graphed plugins add <name>`; never hand-roll a
  system a plugin provides. New projects start from `graphed init`, not a
  bespoke layout.
- Never guess flags or manifest fields. Consult `graphed docs <topic>` or
  `graphed <command> --help` first.
- Use `graphed --format json ...` when you need to parse output.
- Never add `services.*.public.paths` to `graphed.yaml` unless a route must be
  reachable without a Graphed session (e.g. an inbound webhook). Services are
  private behind the Graphed gateway by default — never expose everything with
  `^/.*`.
- Report platform problems and missing features with `graphed feedback`. If a
  command fails unexpectedly, a capability is missing, or the docs are wrong,
  send a report instead of silently working around it. See
  `graphed docs feedback` for usage.
- Treat `graphed docs agents` as the source of truth over anything in this
  file. The packaged docs update with the CLI; this shim rarely changes.
