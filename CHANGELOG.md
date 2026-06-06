# Changelog

All notable Scrivus changes are tracked here.

## 0.2.4

- Added a preference to increment scene, chapter, and act numbers when adding new binder items.
- Added a duplicate tab option for quickly starting a new revision from an existing scene tab.
- Added General and Themes tabs to Preferences, with a custom reading speed setting for status bar estimates.
- Improved the reading speed preference field with digit-only entry and 50-1000 WPM safeguards.
- Added an editor right-click menu with plaintext paste, select all, and selection formatting tools.
- Added a bookmark indicator for the last opened scene in the binder and editor title, reopening parent folders to reveal it when loading a project.
- Collapsed and locked the Binder and Quick Tools panels below 960px wide to prevent cramped editor layouts.
- Remembered collapsed folders when leaving and returning to the Outline workspace.
- Counted only each scene's latest revision tab in scene, chapter, manuscript, and Outline word counts.
- Delayed spellcheck underlines while typing the current word.
- Persisted the Lore links toolbar setting globally across app launches.
- Fixed deleting a scene tab opening split view when split view was closed.
- Fixed duplicated draft tabs showing a garbled title separator while renaming.

## 0.2.3

- Fixed a scene creation save-order bug that could overwrite the previously active scene's content and draft tabs when creating a new scene and dismissing inline rename.

## 0.2.2

- Added horizontal split-screen draft reference in the Editor workspace, including read-only reference tabs, per-scene split restoration, tab swapping, and hoverable comment previews in the reference pane.
- Added Word document project import for `.docx` manuscripts, including Act, Chapter, and Scene splitting plus supported Word formatting for bold, italic, underline, bulleted lists, and numbered lists.
- Added New Project from Word Doc entry points on the welcome screen and File menu.
- Added nested multi-level list import support from Word documents.
- Added human-readable scene file paragraph spacing between stored HTML paragraphs.
- Added Proof Copy as a compile preset with monospaced justified body text, first-line paragraph indents, double spacing, and proof-style act/chapter/scene headings.
- Added an Include scene titles compile option, persisted with other compile settings, exporting scene titles as Heading 2 for Standard Manuscript and proof-style scene headings for Proof Copy.
- Added animated loading modals for opening large projects, creating/importing projects, and preparing the compile screen.

## 0.2.1

- Themed previously missed UI elements including Quick Tools headers, revision tabs, default empty-state text, and revision comment empty states.
- Added revision workspace draft tabs so every draft version can be selected and viewed independently.
- Scoped revision comments to their draft tab so comments on one draft no longer appear on another draft version.
- Added a collapsible comments panel in the revision workspace and aligned it with the Quick Tools panel layout.
- Added status bar support in the revision workspace while keeping it out of the comments panel.
- Fixed scene creation and canvas scene opening selection behavior so the newly opened scene becomes the active highlighted scene.
- Changed canvas-created scenes to be added under Manuscript instead of the current chapter.
- Clarified restore-backup dialogs with a real cancel path.
- Added collapsible folders in the binder and Outline.
- Added nested manuscript folders with explicit folder roles for Act and Chapter, including context-menu role switching.
- Updated the Outline to support nested act/chapter rows, recursive word counts, role badges, folder expand/collapse controls, and act/chapter/scene/word summary stats.
- Updated compile to walk nested folders, respect Act and Chapter roles, and optionally omit act headings from exported manuscripts.
- Persisted compile options for cover page and act-heading inclusion.
- Added a compact menu-bar theme picker with live hover preview, click-to-commit behavior, Escape/outside-click cancellation, and separate dark/light theme columns.
- Added four soft light themes to balance the neon theme set: Soft Paper, Soft Sage, Soft Peach, and Soft Lilac.
- Persisted the window maximized state between app launches while preserving normal close-window behavior.

## 0.2.0

- Initial release

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
