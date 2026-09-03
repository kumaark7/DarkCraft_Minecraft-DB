# BlueMap

The public map is available at https://darkcraft.projectdarkhope.xyz/map/.
It does not require a dashboard account. Anyone can view rendered world data
and any player markers enabled in BlueMap's configuration.

BlueMap 5.23 for Fabric is installed in the managed Minecraft server's `mods/`
directory. The JAR, downloaded Minecraft resources, generated map tiles and
per-server configuration remain in ignored runtime data, not Git.

## Runtime configuration

In the Minecraft server directory, `config/bluemap/core.conf` enables the
owner-approved Mojang resource download (`accept-download: true`), limits
rendering to one thread, and disables optional BlueMap usage metrics.
`config/bluemap/webserver.conf` binds the web server to `127.0.0.1:8100`.
No public firewall rule for port 8100 is needed.

Nginx redirects `/map` to `/map/` and proxies the `/map/` prefix to
`http://127.0.0.1:8100/`, stripping the prefix. Only GET/HEAD requests are
permitted. Cookies and Authorization headers are not forwarded to BlueMap.
Proxy buffering is disabled and the read timeout is 300 seconds to support
streaming map updates. Existing dashboard `/api/` and `/ws` protections remain
unchanged. HTTPS uses the dashboard's existing certificate.

The embedded map web server runs inside Minecraft, so stopping Minecraft also
makes this route unavailable. Initial rendering takes time; not all dimensions
will have completed tiles immediately. Check Minecraft's console for BlueMap
startup errors and rendering progress.

References:
- https://bluemap.bluecolored.de/wiki/webserver/ReverseProxy.html
- https://bluemap.bluecolored.de/wiki/configs/Webserver.html
- https://bluemap.bluecolored.de/wiki/configs/Core.html
