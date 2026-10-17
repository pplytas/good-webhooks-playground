# Playground

Terms specific to the Playground. Webhook terms (endpoint, delivery, attempt, replay, automatic pause, receiver) follow the [good-webhooks glossary](https://github.com/pplytas/good-webhooks/blob/main/GLOSSARY.md).

## Language

**Tick**:
A `clock.ticked` event published once per 5-minute window to every owner with a subscribed endpoint and to the canary. A window gets at most one tick per owner.
_Avoid_: Heartbeat, cron event

**Ping**:
A `ping.requested` event an owner asks for, published to that owner's endpoints only. It carries no text from the owner.
_Avoid_: Test event (good-webhooks reserves that for a single-endpoint check that creates no delivery)

**Canary**:
The Playground's own receiver, registered as an application-scope endpoint. It verifies every event it receives, so its last receipt shows that sending works end to end.
_Avoid_: Health check, monitor

**Chaos receiver**:
One of the Playground's own application-scope endpoints that fails on purpose, sometimes or always, so retries, timeouts, Retry-After, and automatic pauses keep happening without visitors. It verifies every request first.
_Avoid_: Test endpoint, broken endpoint

**Owner**:
A signed-in GitHub user and the personal scope their endpoints belong to.
_Avoid_: Customer, tenant

**Blocked account**:
A GitHub account that may no longer sign in. Blocking also deletes its users, which retires their endpoints.
_Avoid_: Paused account, suspended endpoint
