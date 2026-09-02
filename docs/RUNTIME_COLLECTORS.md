# Runtime collectors

No dashboard metric is inferred from a configured target, a host-wide counter, or a mod filename.

## Tick performance

DarkCraft sends the read-only console query `spark tps` once after readiness.
Only complete, prefixed Spark responses during a 5-second response window are accepted.
Successful discovery enables subsequent queries at most every 30 seconds, independent
of browser polling. Unsupported commands are not retried until the next server start.
No remote profiling/upload command is used.

- TPS: Spark's measured last-5-second value, not configured tick rate.
- MSPT: Spark's last-10-second **median**, explicitly labelled in Overview.
- Values expire after 75 seconds; caches are discarded at process exit/restart.
- Known empty-server pause messages invalidate tick readings. Collection resumes
  after a player join/resume message; gameplay pause settings are not changed.
- In `DASHBOARD_READ_ONLY` mode, no collector console commands are sent.
- Spark is a separately installed, exact Minecraft/loader-compatible server mod or
  plugin. It is not automatically installed/upgraded and its JAR is not committed.
  Paper/Purpur with built-in Spark can answer the same probe.

## Network

Linux uses unprivileged `ss` TCP_INFO counters and socket inodes verified against
`/proc/<java-pid>/fd`. It samples every 10 seconds; API reads only use the cache.
Process start identity prevents PID reuse from joining unrelated samples.
The API units remain KiB/s, calculated from byte-counter differences over monotonic time.

These are **sampled Java TCP socket rates**, not a full interface/packet capture:
they exclude UDP, retransmission/packet overhead and sockets that open and close
entirely between samples. Observable socket-set changes, counter resets, unsupported
counter formats, missing permissions/tools, and gaps return null while a new baseline
is established. Stable observed idle sockets can legitimately report zero.
Other operating systems remain N/A until they have an equivalent reliable collector.
Host-network values are never substituted.

Commands have bounded output and timeouts, no shell evaluation, no root privilege,
and no new listening port. Stale network readings expire after 25 seconds.
Real values and null gaps both persist through the existing bounded metric history.

## References

- [Spark TPS/MSPT](https://spark.lucko.me/docs/guides/TPS-and-MSPT)
- [Spark console report format](https://github.com/lucko/spark/blob/master/spark-common/src/main/java/me/lucko/spark/common/command/modules/HealthModule.java)
- [Linux ss counters](https://man7.org/linux/man-pages/man8/ss.8.html)
