# Stream Deck+ AI Agent Rate Monitor

This repository is an initial proposal for a public project that displays remaining usage and rate-limit proximity for Claude, xAI, and Codex on an Elgato Stream Deck+.

The scope of this repository is intentionally limited for now. As of March 7, 2026, it contains design notes only. No plugin code has been implemented yet.

## What is Elgato Stream Deck+?

Elgato Stream Deck+ is a desktop control surface with:

- 8 customizable LCD keys
- 4 rotary dials with push support
- a touch strip between the keys and dials

Unlike a normal keyboard shortcut pad, Stream Deck+ can both trigger actions and display live status on its keys. That makes it a strong fit for an always-visible AI quota monitor: each key can act like a small status tile, while the dials and touch strip can switch providers, pages, or alert thresholds.

Official references:

- Product page: <https://www.elgato.com/us/en/p/stream-deck-plus>
- SDK overview: <https://docs.elgato.com/streamdeck/sdk/overview/>

## Problem

Power users often hit provider limits without enough warning. The practical need is not just "how much did I use?" but:

- how close am I to the next rate-limit wall?
- when does the limit reset?
- which provider still has enough headroom for the next heavy task?
- can I see that without opening three separate dashboards?

This project aims to answer those questions from a single Stream Deck+ surface.

## Goal

Build a Stream Deck+ plugin that shows near-real-time usage headroom for:

- Claude
- xAI
- Codex

Target outcomes:

- glanceable remaining capacity
- reset countdowns
- threshold-based warning states
- one-device comparison across providers

## Current Scope

This repository currently stops at:

- feature proposal
- UX proposal
- architecture proposal
- implementation plan
- research notes

This repository does not yet include:

- Stream Deck plugin code
- provider integrations
- credentials handling
- packaging for the Stream Deck marketplace

## Proposed User Experience

### Device-level behavior

Each provider gets a key tile that shows:

- provider name
- remaining percentage or estimated remaining requests/tokens
- time to reset
- status color

Suggested visual states:

- green: healthy headroom
- yellow: approaching limit
- red: close to exhaustion
- gray: data unavailable

### Stream Deck+ specific interactions

- LCD keys: provider summary tiles
- Touch strip: page switch between `overview`, `detail`, and `history-lite`
- Dials: cycle provider, adjust alert thresholds, or change time window
- Dial press: mute alerts or force refresh

## Proposed Architecture

The safest architecture is a two-part design:

1. Stream Deck+ plugin UI
2. local sidecar collector service

### Why split it?

The plugin should stay focused on rendering and interaction. Provider credentials, polling, retries, normalization, and cache logic are better handled in a local sidecar process.

### High-level components

- `stream-deck-plugin`
  - renders key images and status text
  - handles user interactions
  - subscribes to normalized provider status
- `local-collector`
  - polls provider APIs
  - reads rate-limit headers or usage metadata
  - normalizes results into a shared schema
  - stores short-lived cache for fast UI refresh
- `provider-adapters`
  - `anthropic-adapter`
  - `xai-adapter`
  - `codex-openai-adapter`

### Proposed normalized schema

```json
{
  "provider": "xai",
  "status": "ok",
  "remaining_percent": 62,
  "remaining_requests": 124,
  "reset_at": "2026-03-07T15:30:00Z",
  "window_label": "requests/minute",
  "source": "api_headers",
  "fetched_at": "2026-03-07T15:10:05Z"
}
```

## Provider Strategy

### Claude

Primary plan:

- use Anthropic API rate-limit information as the source of truth when available
- normalize request/token windows into a single device-friendly summary

Official reference:

- <https://docs.anthropic.com/en/api/rate-limits>

### xAI

Primary plan:

- actively use the xAI API and its published rate-limit model
- treat xAI as a first-class provider rather than a later add-on

Official reference:

- <https://docs.x.ai/docs/guides/rate-limits>

### Codex

Primary plan:

- use OpenAI rate-limit information where the user's Codex workflow is backed by OpenAI API-accessible usage

Open question:

- if the desired "Codex remaining quota" refers to product-specific limits that are not exposed through a stable public API, the first version may need either:
  - an API-backed approximation
  - local usage log estimation
  - or a user-configured soft budget

Official reference:

- <https://platform.openai.com/docs/guides/rate-limits>

## Design Principles

- one glance should be enough to choose the best provider for the next task
- the plugin should degrade gracefully when one provider is temporarily unavailable
- credentials should stay off the device UI layer whenever possible
- provider-specific complexity should be hidden behind a common schema
- visual density should stay low enough for Stream Deck+ viewing distance

## Similar Projects and Research Notes

This README was informed by official product/API documentation, GitHub survey, and public web/X discovery on March 7, 2026.

### What public research suggests

- There is clear demand for usage-visibility tools around Claude and Codex.
- Public GitHub search shows multiple usage trackers and menu bar dashboards.
- Public web/X discovery shows interest in quota awareness and reset timing, but no clear widely-used Stream Deck+ plugin dedicated to cross-provider AI rate monitoring was found.

### Relevant references

- `steipete/CodexBar`
  - useful for always-visible multi-provider quota status and reset timing
- `xiangz19/codex-ratelimit`
  - useful for non-invasive Codex usage detection and warning-threshold thinking
- `Maciek-roboblog/Claude-Code-Usage-Monitor`
  - useful for burn-rate and "how long will this last?" framing
- `ujjwalm29/tokenator`
  - useful for a common accounting model across multiple providers, including xAI-compatible usage
- `elgatosf/streamdeck-plugin-samples`
  - useful for official Stream Deck plugin structure and device interaction patterns

### What to borrow

- compact glanceable status
- always-visible provider comparison
- non-invasive data collection where possible
- predictive alerts before exhaustion
- threshold warnings before hard failure
- minimal friction for background refresh

### What not to copy

- desktop-only assumptions
- tight coupling to undocumented internal session formats
- provider-specific UI that does not generalize
- designs that depend on a single vendor's terminology

## Implementation Plan

### Phase 0

- finish README
- validate feasible data sources per provider
- confirm whether Codex-specific quota can be exposed directly or must be estimated

### Phase 1

- create plugin skeleton
- create local collector skeleton
- define shared status schema
- render mock tiles with static sample data

### Phase 2

- implement xAI adapter first
- implement Claude adapter second
- implement Codex/OpenAI adapter third
- add refresh scheduler and local cache

### Phase 3

- add device alerts
- add threshold configuration
- add compact history and last-refresh failure states

## Non-Goals for the First Version

- billing analytics
- long-term token accounting
- multi-user team dashboards
- cloud-hosted synchronization
- marketplace publication on day one

## Next Steps

1. Confirm provider-specific source-of-truth endpoints and headers.
2. Choose plugin runtime and local sidecar stack.
3. Build a static Stream Deck+ prototype with fake provider data.
4. Add xAI first, then Claude, then Codex/OpenAI.
