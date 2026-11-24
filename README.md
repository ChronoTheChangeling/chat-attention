# Chat Attention

Standalone Foundry VTT module for text RP:

1. While Foundry is **unfocused**: scrolls chat to new messages and plays a loud ping
2. While Foundry is **focused**: does **not** force-scroll — if you scroll up to read, new messages won’t yank you back down

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
| Scroll to newest when unfocused | on | Jump to bottom only when Foundry isn’t focused |
| Ping when unfocused | on | Loud ping when a message arrives and Foundry isn’t focused |
| Ping for my own messages | off | Also ping for messages you send |
| Ping volume | 0.75 | 0–1 |
