# Installer Notes

Scrivus uses the Tauri Windows NSIS installer.

## Metadata

- Product name: Scrivus
- Publisher: ObsydianX
- Identifier: `com.obsydianx.scrivus`
- Homepage: <https://github.com/ObsydianX/Scrivus>
- License: MIT, bundled from `LICENSE.txt`
- Category: Productivity

## Windows Installer Assets

The NSIS installer uses the custom assets in `src-tauri/icons`:

- `installer-header.bmp`
- `installer-sidebar.bmp`
- `icon.ico`

The same header and icon are used for the uninstaller.

## Uninstall Policy

Uninstalling Scrivus should remove the installed application files and shortcuts.

Uninstalling Scrivus should not delete user-created projects, local backups, recent project metadata, preferences, dictionaries, or other app data. Those files may contain user writing or recovery data and should remain available unless the user removes them manually.

## Release Verification

Before publishing a Windows installer:

- Build the NSIS installer from a clean working tree.
- Confirm the license page displays the MIT license text.
- Confirm the installer shows the Scrivus name, ObsydianX publisher, custom header, custom sidebar, and Scrivus icon.
- Confirm the Start Menu shortcut is placed under Scrivus.
- Confirm uninstall removes the app and shortcuts.
- Confirm uninstall does not delete project folders, app data settings, or local backups.

## GitHub Actions Release Builds

The release workflow in `.github/workflows/release.yml` builds Scrivus on Windows, Linux, and macOS using Node.js 24 and Tauri's official GitHub Action.

To start a release build, update the app version in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, then push a matching version tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The workflow creates a draft GitHub Release and attaches the generated installers. Review the draft release assets before publishing.
