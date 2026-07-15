---
name: In-app pip/npm console — removed, do not re-add without RAM safeguards
description: A "console" letting users run pip/npm install from the bot dashboard was built, tried once, and crashed the shared server; feature was reverted at user's request.
---

A restricted console (only `pip install`/`npm install` commands, editing
requirements.txt/package.json in R2 then restarting the bot) was added to let
users add dependencies from the dashboard. On first real use it crashed the
API server, so the user asked to remove it entirely — it was fully reverted
(server route, R2 file editor, frontend "Consola" tab).

**Why:** Render free tier gives ~512MB RAM shared by the API server *and*
every hosted bot child process. Triggering a `pip`/`npm install` + bot restart
from a live request apparently pushed memory over the edge and took the whole
server down, not just the one bot. A global install-serialization queue was
added as a mitigation before the crash, but it was not enough (or the crash
happened before/outside that path) — the queue alone did not prevent it.

**How to apply:** If asked to rebuild this kind of feature, do not just
reuse the existing `spawnBotProcess` reinstall flow inline. Consider running
installs in a queue with a hard memory/timeout ceiling *isolated* from the
main API server process (e.g. a separate worker), or gate it behind an
explicit "this may restart your bot and can fail on low memory" warning with
monitoring, and test it against a real install before considering it done.
