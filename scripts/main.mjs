/**
 * Chat Attention — always yank chat to brand-new messages; never on history loads.
 * Loud ping when Foundry is unfocused.
 */

const MODULE_ID = "chat-attention";

/** Tracked window focus — more reliable than hasFocus() alone (Electron + browsers). */
let windowFocused = true;

/** Message ids we already scrolled for (avoids repeat yanks on re-render). */
const scrolledMessageIds = new Set();

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

/** Attention-grabbing triple ping via Web Audio. */
let sharedAudioCtx = null;

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

async function playAttentionPing(volume = 0.75) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    return;
  }

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(Math.max(0, Math.min(1, volume)) * 0.9, now);
  master.connect(ctx.destination);

  const tones = [
    { freq: 880, start: 0.0, dur: 0.11 },
    { freq: 1175, start: 0.14, dur: 0.11 },
    { freq: 1568, start: 0.28, dur: 0.16 },
  ];

  for (const tone of tones) {
    for (const [type, level] of [
      ["square", 0.55],
      ["triangle", 0.35],
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(tone.freq, now + tone.start);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(level, now + tone.start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.dur + 0.03);
    }
  }
}

function getChatLogClass() {
  return (
    foundry?.applications?.sidebar?.tabs?.ChatLog ??
    ui.chat?.constructor ??
    null
  );
}

function rootElementsForChat(chat = ui.chat) {
  const roots = [];
  if (!chat) return roots;
  if (chat.element) roots.push(chat.element?.[0] ?? chat.element);
  if (chat.popout?.element) roots.push(chat.popout.element?.[0] ?? chat.popout.element);
  return roots.filter(Boolean);
}

function overflowParents(start) {
  const found = [];
  let node = start;
  while (node && node !== document.body) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node);
      const oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight + 1) {
        found.push(node);
      }
    }
    node = node.parentElement;
  }
  return found;
}

function chatScrollTargets(chat = ui.chat) {
  const targets = new Set();

  for (const root of rootElementsForChat(chat)) {
    if (!root?.querySelectorAll) continue;
    const candidates = root.querySelectorAll(
      "#chat-log, .chat-log, .chat-scroll, [data-application-part='log'], ol.chat-log, .scrollable"
    );
    for (const el of candidates) {
      targets.add(el);
      for (const parent of overflowParents(el)) targets.add(parent);
    }

    const lastMsg = root.querySelector(".chat-message:last-child, li.chat-message:last-child");
    if (lastMsg) {
      targets.add(lastMsg);
      for (const parent of overflowParents(lastMsg)) targets.add(parent);
    }
  }

  if (!targets.size) {
    document
      .querySelectorAll("#chat-log, .chat-log, .chat-scroll, [data-application-part='log']")
      .forEach((el) => targets.add(el));
  }

  return [...targets];
}

function forceScrollToNewest(chat = ui.chat) {
  if (chat && typeof chat.scrollBottom === "function") {
    void chat.scrollBottom({
      popout: true,
      waitImages: false,
      scrollOptions: { behavior: "instant", block: "end" },
    });
  }
  if (chat?.popout && typeof chat.popout.scrollBottom === "function") {
    void chat.popout.scrollBottom({
      waitImages: false,
      scrollOptions: { behavior: "instant", block: "end" },
    });
  }

  for (const el of chatScrollTargets(chat)) {
    if ("scrollTop" in el) el.scrollTop = el.scrollHeight;
    if (typeof el.scrollIntoView === "function" && el.classList?.contains("chat-message")) {
      el.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" });
    }
  }
}

/** Yank to bottom for a newly created message only. */
function scheduleScrollForNewMessage(messageId) {
  if (!game.settings.get(MODULE_ID, "alwaysScrollNew")) return;
  if (messageId && scrolledMessageIds.has(messageId)) return;
  if (messageId) {
    scrolledMessageIds.add(messageId);
    // Bound memory for long sessions
    if (scrolledMessageIds.size > 200) {
      const first = scrolledMessageIds.values().next().value;
      scrolledMessageIds.delete(first);
    }
  }

  const run = () => forceScrollToNewest();
  run();
  requestAnimationFrame(() => {
    run();
    setTimeout(run, 0);
    setTimeout(run, 50);
    setTimeout(run, 150);
    setTimeout(run, 400);
  });
}

/**
 * Patch ChatLog#postOne for brand-new posts only.
 * History batch loads use renderBatch / prepend — not this path — so scrolling
 * up to read old messages will not yank you back down.
 */
function patchChatLogPostOne() {
  const ChatLog = getChatLogClass();
  if (!ChatLog?.prototype?.postOne || ChatLog.prototype.postOne.__chatAttentionPatched) return;

  const original = ChatLog.prototype.postOne;
  async function patchedPostOne(message, options = {}) {
    const opts = { ...options };
    const forceNew = game.settings.get(MODULE_ID, "alwaysScrollNew");
    // Only force when appending a new message (default postOne path), not when
    // prepending history via `before`.
    if (forceNew && !opts.before) opts.scroll = true;
    const result = await original.call(this, message, opts);
    if (forceNew && !opts.before) {
      forceScrollToNewest(this);
      scheduleScrollForNewMessage(message?.id);
    }
    return result;
  }
  patchedPostOne.__chatAttentionPatched = true;
  ChatLog.prototype.postOne = patchedPostOne;
}

function registerSettings() {
  game.settings.register(MODULE_ID, "alwaysScrollNew", {
    name: "Always scroll to new messages",
    hint: "Jump chat to the bottom whenever a brand-new message arrives. Scrolling up through older history will not yank you down.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "notifyWhenUnfocused", {
    name: "Ping when unfocused",
    hint: "Play a loud attention ping when a new chat message arrives and Foundry is not the focused window/tab.",
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
    default: 0.75,
  });
}

function onChatMessage(message, _options, userId) {
  // createChatMessage = brand new only (not history batch renders).
  scheduleScrollForNewMessage(message?.id);

  if (isGameFocused()) return;
  if (!game.settings.get(MODULE_ID, "notifyWhenUnfocused")) return;

  const own = isOwnMessage(message, userId);
  if (own && !game.settings.get(MODULE_ID, "notifyOwnMessages")) return;

  const volume = Number(game.settings.get(MODULE_ID, "notifyVolume") ?? 0.75);
  if (volume <= 0) return;
  void playAttentionPing(volume);
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("setup", () => {
  patchChatLogPostOne();
});

Hooks.once("ready", () => {
  trackFocus();
  patchChatLogPostOne();

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") void ctx.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  console.log(`${MODULE_ID} | ready — yank on new messages only + unfocused ping`);
});

// Intentionally NOT hooked to renderChatMessage / renderChatMessageHTML:
// those also fire when Foundry loads older messages while you scroll up.
Hooks.on("createChatMessage", onChatMessage);
