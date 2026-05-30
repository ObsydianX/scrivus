# Scrivus TODO

## Refactor Follow-Up

- Continue reviewing project state hydration for possible hook extraction once the service boundaries settle.
- Revisit bundle-size warnings after refactor work settles; consider real code-splitting for heavier workspaces.

## Release Requirements

- Consider a lightweight Help / Command Reference after core release polish.
- Evaluate Windows code signing before public installer distribution.
- Add a simple diagnostic or error log location, with a way to copy useful support details.

## Completed Refactor Slices

- Extracted search and find/replace panels from `App.tsx`.
- Extracted binder and scene tab context menus from `App.tsx`.
- Extracted top File/Edit menus from `App.tsx`.
- Extracted workspace switcher and main editor content shell from `App.tsx`.
- Moved project-wide search scanning into a focused search service.
- Moved core binder tree mutations into a focused binder mutation service.
- Moved trash loading, restore, preview, permanent delete, and empty operations into a focused trash service.
- Moved project creation and project.json reading into a focused project file service.
- Grouped `WorkspaceShell` props into focused view-model objects.

## Feature Ideas

- Add flexible timeline metadata and a timeline view that can sort scenes by story chronology separate from manuscript order.

## Version 0.1.6 Features

- Added scene metadata editing for status, POV, location, timeline, tags, and synopsis.
- Added status indicators in the binder and editable scene status dropdowns in the Outline.
- Added an Outline workspace with chapter summary rows, scene rows, word counts, metadata columns, and scene navigation.
- Added automatic project backups with configurable interval, retention count, manual backup, latest restore, and selected-backup restore.
- Added a Backups tab to Project Settings.
- Added lore/editor linking with lore entry keywords, toggleable editor highlights, and Ctrl-click navigation to linked lore entries.
- Added keyword display to expanded Lore Book entries.

## Version 0.1.7 Features

- Added a Mind Map workspace with a freeform planning canvas, draggable typed nodes, themed node colors, directional connections, centered connection labels, panning/zooming, and per-project `canvas.json` persistence.
- Added Mind Map scene integration so nodes can link to existing scenes, open linked scenes, or create new binder scenes from planning nodes.
- Added Mind Map creation and editing affordances including connected child nodes, node/connection context menus, and type icons for idea, scene, character, location, and note cards.
- Optimized Outline refreshes by caching scene word counts so metadata-only changes avoid rereading every scene file.
- Fixed binder inline rename selection so the full name is selected only when rename mode starts, not while typing.
- Extended binder multi-select actions to support bulk duplicate, bulk move to trash, and numbered bulk rename.
- Added expand-all and collapse-all folder buttons to the binder toolbar.
- Fixed the Empty Trash button so it opens the confirmation instead of toggling the Trash folder.
- Improved spellcheck handling for hyphenated compounds, possessives, simple plurals, curly apostrophes, and capitalization-sensitive dictionary words.
- Switched spellcheck to the bundled ESDB large English dictionary files in `src/dictionaries`.
- Expanded lore linking so keywords and entry names also match possessive and plural variants such as `Adam's` and `Adams`.
- Raised Vite's chunk size warning threshold for the desktop bundle so expected dictionary size does not create noisy build output.

## Version 0.1.8 Features

- Renamed the Mind Map workspace to Canvas to better describe the freeform planning board workflow alongside the new Atlas workspace.
- Added an Atlas workspace for importing custom map images, panning and zooming around them, and placing themed map markers for towns, landmarks, regions, route notes, and notes.
- Added Atlas import safeguards with image dimension and megapixel reporting, an 8192px maximum side length, and a warning flow for maps above 50 megapixels.
- Added per-project Atlas persistence with `atlas.json` metadata and copied map images under `atlas/images`.
- Added support for multiple Atlas maps, map renaming, marker editing, marker visibility by zoom level, and point/smooth image sampling.
- Added Atlas map replacement with exact-dimension safety checks so existing markers remain aligned, plus permanent image cleanup when maps are deleted or replaced.
- Improved Atlas interaction handling for right-click marker creation, marker context menus, pointer-centered wheel zoom, and readable marker labels during zoom.
- Cleaned up save status handling so stale `editing...` and `saved` labels are cleared across project loads and workspace changes, with pending editor saves flushed when leaving the Editor.
- Disabled StarterKit's built-in underline extension so Scrivus's custom underline mark no longer triggers duplicate TipTap extension warnings.

## Version 0.1.9 Features

- Added MIT licensing across app metadata, installer metadata, and `LICENSE.txt`.
- Added About, Check for Updates, and Preferences entries to the app menus.
- Added an About dialog with creator credit, GitHub link, release notes, project compatibility notes, privacy notes, and third-party licenses.
- Added a real GitHub Releases update check with update-available, up-to-date, and failure states.
- Added `CHANGELOG.md`, `PRIVACY.md`, `PROJECT_FORMAT.md`, and `INSTALLER.md` for release documentation.
- Added project version metadata with `scrivusVersion` and `projectFormatVersion` in `project.json`.
- Added compatibility protection that blocks projects created by newer unsupported Scrivus project formats.
- Added a versioned project migration layer, including legacy format `0` to current format migration support.
- Added a pre-open safety backup before project loading and migration.
- Added project recovery options when opening fails, including restore latest backup and open backup folder.
- Added `.scrivus` project-folder packages for newly created projects while preserving support for older folder-based projects.
- Added default Canvas, Atlas, and Lorebook starter content for newly created projects.
- Added bundled starter assets for the sample Atlas map and Lorebook portrait placeholder.
- Added global Preferences with theme selection, and kept backups in project-specific Project Settings.
- Moved theme selection out of Project Settings because theme is global, not per-project.
- Improved startup loading so the saved theme is applied before first paint and recent projects load before the welcome screen renders.
- Added file-safety checks for project package creation collisions.
- Improved Atlas image replacement so new image assets are copied before old managed assets are deleted.
- Improved Lorebook image replacement with unique managed filenames and cleanup of replaced managed images.
- Improved installer metadata, including publisher, homepage, copyright, descriptions, app category, installer icon, uninstaller icon, uninstaller header, and Start Menu folder.
- Changed the Tauri app identifier to `com.obsydianx.scrivus`.
- Fixed Lorebook template hard-delete behavior so canceling or confirming a delete no longer wipes other unsaved fields in the category editor.
- Fixed unnamed Lorebook template fields in delete confirmations by showing fallback labels such as `Unnamed field`, `Unnamed description`, and `Unnamed image`.

## Completed Feature Slices

- Added Project Settings with Book Info, Styles placeholder, and Theme tabs.
- Added compile cover page generation using Project Settings book info.
- Added global themes with high-contrast, pastel, and neon variants.
- Reworked Project Settings Styles into Chapter Title, Prose, and Editor style editors.
- Added multi-select binder nodes for bulk drag/drop reordering.
- Added custom Typo.js spellcheck with per-project dictionary words.
- Added focused manuscript formatting controls: underline, lists, block quotes, scene breaks, and clear formatting.
- Added scene metadata editing for status, POV, location, timeline, tags, and synopsis.
- Added Outline workspace for scanning scene metadata, word counts, and manuscript structure.
- Added automatic project backups with rolling retention and a latest-backup restore flow.
- Added lore/editor linking with entry keywords, toggleable editor highlights, and Ctrl-click navigation to linked lore entries.

## Parked Ideas

- Revisit Corkboard only if a distinct novel-writing use case emerges beyond the binder and Outline view.

## Verification

- Run `npm.cmd run build` after each refactor pass.
- Smoke-test project open/create, scene editing, binder drag/drop, trash/restore, lorebook editing, revision comments, compile/export, and recent projects after larger UI extractions.
