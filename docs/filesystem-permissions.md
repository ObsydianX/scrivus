# Project folder permissions

Project creation and opening use Tauri's directory picker with `recursive: true`.
Selecting a parent folder grants access to new project packages beneath it;
selecting an existing package grants access to its nested scenes, images, and
other project data. These grants work independently of drive letters and the
user's home directory. The persisted-scope plugin restores grants after restart.
Custom backup folder selection also requires recursive access.

Do not rely on home-directory capability scopes when adding directory pickers:
they can conceal missing recursive grants during development. Windows filesystem
permissions and drive availability still apply.

## Manual regression check on Windows

1. Launch the rebuilt desktop app and choose a writable folder outside the user
   profile on a secondary drive (for example, `F:\Scrivus Tests`).
2. Create a project there. Add a scene and an image, edit the scene, and save.
3. Close the project and use Open Project to select its `.scrivus` folder. Verify
   the scene and image load and edits can be saved.
4. Restart Scrivus and open the same project from Recent Projects. Verify loading
   and saving still work without selecting the folder again.
5. Choose a custom backup folder on a secondary drive, create a backup, restart,
   and verify another backup can be created and restored.
6. Repeat project creation and opening on the main drive. Where available, repeat
   with a removable drive or a writable network share.

For an existing project selected before this fix, use Open Project once to grant
recursive access; subsequent recent-project opens should retain that access.
If its opening safety backup encounters a forbidden-path error, Scrivus distinguishes
the project source from a configured custom backup destination. It offers
Choose Project Folder for source failures or Choose Backup Folder for destination
failures. The latter renews access to the configured backup folder (or its parent)
and retries the original project; it does not treat the backup folder as a project
or change the saved backup location. Both pickers request recursive access.
Verify this recovery by opening a project from Recent Projects with a legacy
non-recursive grant, selecting its folder in the recovery picker, and confirming
the safety backup completes before the project opens. Canceling must leave the
project unopened.

Also test a project whose custom backup destination has an expired or missing
grant on another drive. Confirm Choose Backup Folder opens at that destination,
canceling leaves the project unopened, choosing an unrelated folder does not
change settings, and selecting the correct destination permits the safety backup
and original project to open. Restart and repeat from Recent Projects to check
that the destination grant persists.
