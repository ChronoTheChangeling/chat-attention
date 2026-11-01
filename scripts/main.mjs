/**
 * Chat Attention — when Foundry is unfocused: scroll to newest + soft ping.
 */

const MODULE_ID = "chat-attention";

/** Soft two-tone ping via Web Audio (no asset file required). */
function playAttentionPing(volume = 0.35) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), now);
  master.connect(ctx.destination);

  const tones = [
    { freq: 880, start: 0, dur: 0.07 },
    { freq: 1174.66, start: 0.08, dur: 0.1 },
  ];

  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(tone.freq, now + tone.start);
    gain.gain.setValueAtTime(0.0001, now + tone.start);
    gain.gain.exponentialRampToValueAtTime(0.45, now + tone.start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + tone.start);
    osc.stop(now + tone.start + tone.dur + 0.02);
  }

  const closeAt = (tones.at(-1).start + tones.at(-1).dur + 0.05) * 1000;
  setTimeout(() => {
    void ctx.close().catch(() => {});
  }, closeAt + 50);
}

function isGameFocused() {
  if (document.hidden) return false;
  try {
    return document.hasFocus();
  } catch {
    return !document.hidden;
  }
}

function forceScrollToNewest() {
  const chat = ui.chat;
  if (!chat) return;

  // Foundry 12+ ChatLog API
  if (typeof chat.scrollBottom === "function") {
    void chat.scrollBottom({ popout: true, waitImages: true });
    return;
  }

  // Fallback: raw log element
  const root = chat.element?.[0] ?? chat.element;
  const log =
    root?.querySelector?.("#chat-log") ??
    document.querySelector("#chat-log");
  if (log) log.scrollTop = log.scrollHeight;
}

function registerSettings() {
  game.settings.register(MODULE_ID, "scrollWhenUnfocused", {
    name: "Scroll to newest when unfocused",
    hint: "When Foundry is not focused and a new message arrives, jump chat to the bottom. While you are focused, normal Foundry scroll behavior is left alone.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "notifyWhenUnfocused", {
    name: "Ping when unfocused",
    hint: "Play a soft sound when a new chat message arrives and Foundry is not the focused window/tab.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "notifyOwnMessages", {
    name: "Ping for my own messages",
    hint: "Also ping when you post a message while Foundry is unfocused (usually leave off).",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "notifyVolume", {
    name: "Ping volume",
    hint: "0 (silent) to 1 (loud).",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.35,
  });
}

function onChatMessage(message, _options, userId) {
  if (isGameFocused()) return;

  if (game.settings.get(MODULE_ID, "scrollWhenUnfocused")) {
    requestAnimationFrame(() => {
      forceScrollToNewest();
      // Second pass catches late-rendered images / dice cards.
      setTimeout(forceScrollToNewest, 50);
    });
  }

  if (!game.settings.get(MODULE_ID, "notifyWhenUnfocused")) return;

  const fromSelf = userId === game.user?.id || message?.user?.id === game.user?.id;
  if (fromSelf && !game.settings.get(MODULE_ID, "notifyOwnMessages")) return;

  const volume = Number(game.settings.get(MODULE_ID, "notifyVolume") ?? 0.35);
  if (volume <= 0) return;
  playAttentionPing(volume);
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready — unfocused scroll + ping`);
});

// Fires on every client when a ChatMessage document is created.
Hooks.on("createChatMessage", onChatMessage);
