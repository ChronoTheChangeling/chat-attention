# Chat Attention

Standalone Foundry VTT module for text RP:

1. **New messages** always yank chat to the bottom (focused or not)
2. **Old history** does not — scrolling up to read won’t get yanked when Foundry loads older cards
3. Loud ping when a message arrives while Foundry is **unfocused**

Compatible with Foundry **12–14**.

## Install

In Foundry: **Add-on Modules → Install Module → Manifest URL**

```text
https://github.com/ChronoTheChangeling/chat-attention/releases/latest/download/module.json
```

Enable **Chat Attention** for the world and reload.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Always scroll to new messages | on | Jump to bottom on brand-new messages only |
| Ping when unfocused | on | Loud ping when a message arrives and Foundry isn’t focused |
| Ping for my own messages | off | Also ping for messages you send |
| Ping volume | 0.75 | 0–1 |
