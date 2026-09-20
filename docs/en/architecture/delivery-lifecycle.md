# Delivery Lifecycle

**Language / Language:** [English](delivery-lifecycle.md) · [中文](../../architecture/delivery-lifecycle.md)

See the Chinese canonical document: [../../architecture/delivery-lifecycle.md](../../architecture/delivery-lifecycle.md).


```text
received → processing → ready → source checkpoint → sending → sent
                                      └→ cancelled on deleted source
```

Telegram does not reliably notify a bot about arbitrary source-message deletion.
Media therefore replies to the source with `allow_sending_without_reply: false`;
if the target is gone, the delivery is cancelled and TelePress fallback is not
entered. This is best-effort cancellation plus a strict pre-send checkpoint; it
cannot delete already-sent media.
