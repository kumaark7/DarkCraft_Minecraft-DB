# Modrinth compatible-mod discovery and installation

The Mods tab includes an authenticated, read-only Modrinth catalog at
`GET /api/v1/servers/:id/modrinth?q=&offset=0`.

The backend derives the target from the managed server, not caller-supplied
version/loader filters. Fabric, Forge and NeoForge are supported. Unknown
versions and other software return an unavailable state without guessing.

Search facets are only candidate discovery. Each suggested release is
independently checked for the exact Minecraft version, exact loader, listed
stable release status, JAR availability and server-side environment support.
Release-level environment metadata takes precedence over project metadata.
Legacy Modrinth v2 responses fall back to explicit project server-side support.
Client-only, singleplayer-only and unknown environments are excluded.

The Install button confirms the exact release and calls
`POST /api/v1/servers/:id/modrinth/install` with only its version ID.
The backend resolves the download itself; it never trusts a caller-supplied URL,
filename, loader or Minecraft version. Authentication, CSRF/origin checks and
DASHBOARD_READ_ONLY enforcement apply.

Required dependencies are resolved recursively for the exact server target.
An already-installed compatible dependency release is reused when Modrinth does
not pin a version. Conflicting pins, unresolved external dependencies, declared
incompatibilities and disabled copies fail safely instead of silently proceeding.
Optional dependencies are not installed.

Downloads must use HTTPS on cdn.modrinth.com, with redirects disabled. Each JAR
has a 128 MiB limit and must match the published size and SHA-512 checksum.
The batch is limited to 16 mods / 512 MiB. JAR loader metadata, mod IDs, duplicate
IDs and filename conflicts are checked before atomic no-overwrite publication.
No archive extraction, shell execution, automatic upgrades or automatic enabling
of disabled mods occurs. Temporary staging files are cleaned on completion/failure.
Existing files are preserved, and partially published new files are rolled back
if a publication fails. Concurrent installs for one server are rejected.

The response lists installed/already-present files and whether a restart is needed.
The installed table refreshes immediately. Installation is not proof of activation:
Minecraft must load the mod on restart before runtime detection can mark it Active.
Publisher-declared support cannot guarantee the absence of all mod conflicts or
compatibility with every loader build. Client-required mods still need installation
on each player's client.

Metadata uses a bounded five-minute in-memory cache. Searches are submitted
explicitly, not on each keystroke or dashboard poll. Requests have a timeout,
response-size limit, bounded fan-out, a shared request budget and 429 backoff.
No Modrinth token, new npm dependency, or backend URL configuration is required.
Downloaded JARs stay in the selected server's ignored runtime mods directory.
Mock mode does not call Modrinth or fabricate suggestions.

References:
- https://docs.modrinth.com/api/operations/searchprojects/
- https://docs.modrinth.com/api/operations/getprojectversions/

Deployment requires the updated backend and frontend together. Restarting
the current dashboard process stops its managed Minecraft processes; schedule
a maintenance window before activating this backend change.
