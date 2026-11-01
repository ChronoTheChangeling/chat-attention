# Chat Attention

Standalone Foundry VTT module. When Foundry is **unfocused** and a new chat message arrives:

1. Scrolls the chat log to the newest message
2. Plays a soft ping

While you are focused on Foundry, normal chat scroll behavior is unchanged.

Compatible with Foundry **12–14**.

## Install (friend / table)

In Foundry: **Add-on Modules → Install Module → Manifest URL**

```text
https://github.com/ChronoTheChangeling/chat-attention/releases/latest/download/module.json
```

Enable **Chat Attention** for the world and reload.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Scroll to newest when unfocused | on | Jump chat to bottom only when Foundry isn’t focused |
| Ping when unfocused | on | Soft sound when a message arrives and Foundry isn’t focused |
| Ping for my own messages | off | Also ping for messages you send |
| Ping volume | 0.35 | 0–1 |
