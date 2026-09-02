# Modrinth compatible-mod discovery

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

The list links to the exact matching Modrinth release, never an unfiltered
latest-version download. Required dependency counts and client requirements
are shown. Publisher-declared support does not guarantee compatibility with
every installed mod or loader build. Review the release dependencies before
using Upload Mod. This integration does not install, activate, or upgrade mods.

Metadata uses a bounded five-minute in-memory cache. Searches are submitted
explicitly, not on each keystroke or dashboard poll. Requests have a timeout,
response-size limit, bounded fan-out, a shared request budget and 429 backoff.
No Modrinth token, new dependency, JAR storage, or backend URL configuration is required.
Mock mode does not call Modrinth or fabricate suggestions.

References:
- https://docs.modrinth.com/api/operations/searchprojects/
- https://docs.modrinth.com/api/operations/getprojectversions/

Deployment requires the updated backend and frontend together. Restarting
the current dashboard process stops its managed Minecraft processes; schedule
a maintenance window before activating this backend change.
