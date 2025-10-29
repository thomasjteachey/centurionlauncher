# Launcher self-update hosting

The launcher looks for updates at the URL configured in **Preferences → Update server**.
If the user never changes it, the value defaults to `http://136.56.187.218/downloads/` (see
`DEFAULT_LAUNCHER_UPDATE_URL`).

To publish a new build:

1. Upload a `centurionlauncher.zip` archive to the root of the update URL. With the default
   configuration this means `http://136.56.187.218/downloads/centurionlauncher.zip`. The
   archive must include the launcher executable and the `.launcher` directory from the
   shipped build.
2. Place a `centurionlauncher.version` text file alongside the archive (for the default URL,
   `http://136.56.187.218/downloads/centurionlauncher.version`). The file should
   contain only the version string that matches the packaged build, for example:

   ```
   1.2.3
   ```

When the launcher sees that the version in `centurionlauncher.version` is newer than its
current `app.getVersion()`, it downloads `centurionlauncher.zip`, extracts just the
executable that matches the running process name, and swaps it in place without touching the
existing `%APPDATA%/.launcher` data directory.

## Failure behaviour

If the version file or archive cannot be downloaded (404, network issue, empty version file,
missing executable in the zip, etc.), the launcher logs the issue, displays a notice in the
client UI, and proceeds with normal file verification so players can continue launching the
game.
