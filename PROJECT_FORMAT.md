# Project Format Compatibility

Scrivus projects are stored as `.scrivus` project folders. The main project metadata lives in `project.json`, with companion files for scenes, notes, lore, backups, Canvas, Atlas, and other project data.

Older Scrivus projects may exist as ordinary folders without the `.scrivus` suffix. Scrivus should continue opening those folder-based projects.

## Version Metadata

Current Scrivus projects include these fields in `project.json`:

- `scrivusVersion`: the Scrivus app version that last saved the project.
- `projectFormatVersion`: the project file format version.

Older projects that do not include `projectFormatVersion` are treated as legacy format `0`.

## Opening Older Projects

Scrivus is expected to open older project formats whenever possible. Missing fields may be filled with defaults during load, and project data may be normalized before being saved again.

Before opening a project, Scrivus creates a local safety backup. This gives the user a recovery point before the current version of Scrivus reads, normalizes, or later saves the project.

## Opening Newer Projects

If a project was saved by a newer unsupported project format, Scrivus blocks the open attempt and warns the user to update Scrivus first.

This prevents an older Scrivus build from damaging project data it does not understand.

## Future Migrations

For small additive changes, Scrivus can usually rely on defaults and normalizers. For structural changes, Scrivus should add explicit versioned migrations that move projects from older `projectFormatVersion` values to the current format.

Project migrations should preserve user content, create or rely on a pre-open backup, and avoid deleting unknown data unless the migration is intentionally removing an obsolete field.
