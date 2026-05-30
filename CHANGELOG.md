# Changelog

All notable Scrivus changes are tracked here.

## 0.1.9

- Added project metadata with Scrivus version and project format version.
- Added compatibility checks that block projects created by newer unsupported Scrivus formats.
- Added a safety backup before opening projects.
- Added Help menu entries for About and Check for Updates.
- Added a real GitHub Releases update check with update-available, up-to-date, and failure states.
- Added an About dialog with creator credit, GitHub link, MIT license note, release notes, and third-party licenses.
- Added MIT licensing metadata and installer license configuration.
- Added `.scrivus` project-folder packages for newly created projects while preserving support for older folder-based projects.
- Added default Canvas, Atlas, and Lorebook starter content for newly created projects.
- Renamed the Mind Map workspace to Canvas.
- Added an Atlas workspace for importing map images, panning and zooming, and placing map markers.
- Added Atlas safeguards for image dimensions, megapixel warnings, and map replacement checks.
- Added per-project Atlas persistence with copied map assets.
- Improved save status handling across project loads and workspace changes.
- Disabled TipTap StarterKit's built-in underline extension to avoid duplicate underline warnings.

## 0.1.7

- Added the Canvas planning board with typed nodes, colors, connections, labels, pan/zoom, and per-project persistence.
- Added Canvas scene integration for linking to scenes, opening linked scenes, and creating scenes from planning nodes.
- Optimized Outline refreshes by caching scene word counts.
- Added binder multi-select actions for bulk duplicate, bulk move to trash, and numbered bulk rename.
- Added expand-all and collapse-all controls to the binder.
- Improved spellcheck handling for compounds, possessives, plurals, curly apostrophes, and capitalization.
- Switched spellcheck to bundled ESDB large English dictionary files.
- Expanded lore linking to match possessive and plural keyword variants.

## 0.1.6

- Added scene metadata editing for status, POV, location, timeline, tags, and synopsis.
- Added status indicators in the binder and editable scene statuses in Outline.
- Added the Outline workspace with chapter rows, scene rows, word counts, metadata columns, and scene navigation.
- Added automatic project backups with configurable interval, retention, manual backup, and restore flows.
- Added the Backups tab in Project Settings.
- Added lore/editor linking with keyword highlights and Ctrl-click navigation.
