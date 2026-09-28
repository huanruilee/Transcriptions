# Playlist Index Remap — 2026-09-28

The evidence directory `prototype-44` is an immutable historical run label. At
the time of that run (`retrievedAt: 2026-09-10T21:50:53Z`), video
`lBOiFeGQblw` was recorded at historical playlist index **44**.

The refreshed playlist inventory retrieved on 2026-09-28 records that same
video at current playlist index **42**. The video title remains
「第26講 集諦與滅諦的行相（下）」. A private entry now occupies index 44.

Video ID is the stable identity used to connect these records. Playlist index
is mutable ordering metadata and must not be used by itself to identify a
source. The historical artifacts are intentionally not renamed or rewritten;
their original paths and observations remain auditable.

| Evidence | Observed index | Video ID | Interpretation |
|---|---:|---|---|
| `prototype-44/run_manifest.json` | 44 | `lBOiFeGQblw` | Historical source attempt; silent media, transcript blocked |
| `playlist_inventory.json` | 42 | `lBOiFeGQblw` | Current public playlist position; video available, transcript pending |
| `playlist_inventory.json` | 44 | `C0yhUazs0CU` | Current private/unavailable entry |

This remap resolves the index-name ambiguity without changing either the source
diagnostic result or the current publication state.
