# Delivery lifecycle

**Language / Language:** [中文](delivery-lifecycle.md) · [English](../en/architecture/delivery-lifecycle.md)

```text
received
  → processing (parse/download/normalize)
  → ready
  → source checkpoint
      exists → sending → sent
      deleted → cancelled
  failure → failed
```

The current implementation keeps this lifecycle lightweight and event-observable. There is no second durable state database.

## Final checkpoint

Telegram does not reliably notify a bot when a regular user deletes a source message. DeviantDrop therefore does not rely on a deletion event.

Every media delivery replies to the original source message with `allow_sending_without_reply: false`. If Telegram reports that the reply target is gone, the job is recorded as `delivery_cancelled` and the TelePress fallback is not entered.

This gives the practical guarantee:

- media still being downloaded when the user deletes the source link is normally not sent;
- a Telegram deletion-notification gap cannot create an accidental extra message;
- already-sent Telegram media cannot be retroactively deleted by this checkpoint.
