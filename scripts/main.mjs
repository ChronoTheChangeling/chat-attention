/**
 * Chat Attention — always force-scroll chat to newest; ping when unfocused.
 */

const MODULE_ID = "chat-attention";

/** Tracked window focus — more reliable than hasFocus() alone (Electron + browsers). */
let windowFocused = true;

function trackFocus() {
  const sync = () => {
    windowFocused = !document.hidden && document.hasFocus();
  };
  window.addEventListener("focus", () => {
    windowFocused = true;
  });
  window.addEventListener("blur", () => {
    windowFocused = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) windowFocused = false;
    else sync();
  });
  sync();
}

function isGameFocused() {
  if (document.hidden) return false;
  return windowFocused;
}

function isOwnMessage(message, userId) {
  const me = game.user?.id;
  if (!me) return false;
  if (userId && userId === me) return true;
  if (message?.user?.id === me) return true;
  if (message?.author?.id === me) return true;
  return false;
}

/** Soft two-tone ping via Web Audio (no asset file required). */
let sharedAudioCtx = null;

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

async function playAttentionPing(volume = 0.35) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    return;
  }

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
}

function chatLogElements() {
  const els = [];
  const chat = ui.chat;
  const roots = [];

  if (chat?.element) roots.push(chat.element?.[0] ?? chat.element);
  if (chat?.popout?.element) roots.push(chat.popout.element?.[0] ?? chat.popout.element);

  for (const root of roots) {
    if (!root?.querySelectorAll) continue;
    const found = root.querySelectorAll(
      "#chat-log, .chat-log, .chat-scroll, [data-application-part='log'], ol.chat-log"
    );
    for (const el of found) els.push(el);
  }

  if (!els.length) {
    document
      .querySelectorAll("#chat-log, .chat-log, .chat-scroll, [data-application-part='log']")
      .forEach((el) => els.push(el));
  }

  return els;
}

function forceScrollToNewest() {
  const chat = ui.chat;
  if (chat && typeof chat.scrollBottom === "function") {
    void chat.scrollBottom({ popout: true, waitImages: false });
  }

  for (const log of chatLogElements()) {
    log.scrollTop = log.scrollHeight;
  }
}

/** Always jump to newest after Foundry posts the card into the DOM. */
function scheduleScrollToNewest() {
  if (!game.settings.get(MODULE_ID, "alwaysScroll")) return;

  const run = () => forceScrollToNewest();

  requestAnimationFrame(() => {
    run();
    setTimeout(run, 0);
    setTimeout(run, 50);
    setTimeout(run, 150);
    setTimeout(run, 400);
  });
}

function registerSettings() {
  game.settings.register(MODULE_ID, "alwaysScroll", {
    name: "Always scroll to newest",
    hint: "Jump chat to the bottom on every new message — for text RP where everyone should see the latest line.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "notifyWhenUnfocused", {
    name: "Ping when unfocused",
    hint: "Play a soft sound when a new chat message arrives and Foundry is not the focused window/tab. Each player only hears it on their own client.",
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
  scheduleScrollToNewest();

  if (isGameFocused()) return;
  if (!game.settings.get(MODULE_ID, "notifyWhenUnfocused")) return;

  const own = isOwnMessage(message, userId);
  if (own && !game.settings.get(MODULE_ID, "notifyOwnMessages")) return;

  const volume = Number(game.settings.get(MODULE_ID, "notifyVolume") ?? 0.35);
  if (volume <= 0) return;
  void playAttentionPing(volume);
}

function onMessageRendered() {
  scheduleScrollToNewest();
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  trackFocus();
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") void ctx.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  console.log(`${MODULE_ID} | ready — always scroll + unfocused ping`);
});

Hooks.on("createChatMessage", onChatMessage);
Hooks.on("renderChatMessageHTML", onMessageRendered);
Hooks.on("renderChatMessage", onMessageRendered);
