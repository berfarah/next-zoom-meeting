# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An Elgato Stream Deck plugin (macOS only) that displays your next calendar meeting and provides one-click joining for Zoom and Google Meet. It reads from Apple Calendar via a JXA (JavaScript for Automation) script and polls every 10 seconds for updates.

## Build Commands

```bash
npm run build    # One-time build via Rollup
npm run watch    # Build + auto-restart Stream Deck plugin on changes
```

There are no automated tests. Manual testing requires the Stream Deck software running with the plugin installed.

## Architecture

**Entry point**: `src/plugin.ts` registers the `JoinMeeting` action with the Stream Deck SDK and connects.

**Action handler**: `src/actions/join-meeting.ts` — `JoinMeeting` extends `SingletonAction`. It:
- Polls every 10 seconds by spawning `osascript` to run the JXA calendar script
- Parses the JSON response to find upcoming events (within 5 minutes)
- When multiple events exist, prioritizes those with meeting links
- Updates the Stream Deck button title/state (Active=meeting found, Inactive=none)
- On key press, opens meeting links via macOS `open` command; for interviews, opens scorecard/guide first

**Calendar script**: `src/calendar.jxa.js` — Runs via `osascript`, not Node.js. It:
- Uses EventKit to access Apple Calendar (requires user permission grant)
- Fetches events from 3 hours ago through tomorrow, filters to relevant window
- Detects meeting links: Zoom URLs → `zoommtg://` deep links, Google Meet URLs
- Detects interview providers: Greenhouse (`*.greenhouse.io`) and Ashby (`app.ashbyhq.com`), extracting scorecard and guide links

## Build Pipeline (rollup.config.mjs)

Rollup bundles `src/plugin.ts` → `com.bernardo-farah.next-zoom-meeting.sdPlugin/bin/plugin.js`. The `@rollup/plugin-url` copies `.jxa.js` files into the plugin directory. Terser minification runs only in production builds. Watch mode generates sourcemaps and auto-restarts the plugin via `streamdeck restart`.

## Key Conventions

- The `.sdPlugin/bin/` directory and `.sdPlugin/*.jxa.js` are generated outputs (gitignored)
- The JXA script outputs JSON to stdout; the TypeScript code parses it from the child process
- Plugin manifest lives at `com.bernardo-farah.next-zoom-meeting.sdPlugin/manifest.json`
- Plugin UUID: `com.bernardo-farah.next-zoom-meeting`
