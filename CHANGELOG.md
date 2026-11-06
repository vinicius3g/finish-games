# Changelog

All notable changes to this project are documented here, following Keep a Changelog.
Versions follow Semantic Versioning (MAJOR.MINOR.PATCH).

## [Unreleased]

## [0.1.0] - 2026-11-06

First recorded version, consolidating existing features and fixes.

### Added

- Game catalog with creation, editing, search, and deletion.
- Status, platform, playtime, achievements, ratings, notes, cover images, and completion dates.
- Counters for completed games, playtime, and yearly progress.
- Supabase persistence and private access through an app password.
- Steam library synchronization in batches of up to 50 games.
- Title and cover image search through IGDB.
- Tests for game validation, Steam responses, and Supabase diagnostics.
- Package version and commands to increment patch, minor, and major versions.

### Fixed

- Steam synchronization starts at index zero without skipping the first game.
- Distinction between empty Steam libraries, unavailable library data, and invalid responses.
- HTTP 422 with guidance when Steam does not provide library data, instead of HTTP 404.
- Specific messages for Supabase authentication, permission, and schema failures.
- Write diagnostics for UNIQUE, NOT NULL, and CHECK constraints, and duplicate records.
