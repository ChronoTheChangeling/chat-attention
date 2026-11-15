/**
 * Chat Attention — always force-scroll chat to newest; louder ping when unfocused.
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
  // Keep some headroom so stacked oscillators don't clip harshly.
  master.gain.setValueAtTime(Math.max(0, Math.min(1, volume)) * 0.9, now);
  master.connect(ctx.destination);

  // Three rising beeps — short, bright, hard to miss.
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

  // Mark jump-to-bottom UI as satisfied when present.
  for (const root of rootElementsForChat(chat)) {
    root.querySelectorAll?.(".jump-to-bottom")?.forEach((btn) => {
      btn.classList.add("hidden");
      btn.style.display = "none";
    });
  }
}

/** Always jump to newest after Foundry posts the card into the DOM. */
function scheduleScrollToNewest() {
  if (!game.settings.get(MODULE_ID, "alwaysScroll")) return;

  const run = () => forceScrollToNewest();
  run();
  requestAnimationFrame(() => {
    run();
    setTimeout(run, 0);
    setTimeout(run, 50);
    setTimeout(run, 150);
    setTimeout(run, 300);
    setTimeout(run, 600);
  });
}

/**
 * Patch ChatLog#postOne so Foundry itself is told to scroll (v14 scroll:true),
 * then force DOM scroll afterward. This beats the focused "scrolled up" path.
 */
function patchChatLogPostOne() {
  const ChatLog = getChatLogClass();
  if (!ChatLog?.prototype?.postOne || ChatLog.prototype.postOne.__chatAttentionPatched) return;

  const original = ChatLog.prototype.postOne;
  async function patchedPostOne(message, options = {}) {
    const opts = { ...options };
    if (game.settings.get(MODULE_ID, "alwaysScroll")) opts.scroll = true;
    const result = await original.call(this, message, opts);
    if (game.settings.get(MODULE_ID, "alwaysScroll")) {
      forceScrollToNewest(this);
      scheduleScrollToNewest();
    }
    return result;
  }
  patchedPostOne.__chatAttentionPatched = true;
  ChatLog.prototype.postOne = patchedPostOne;
}

function watchChatMutations() {
  const attach = (root) => {
    if (!root || root.__chatAttentionObserved) return;
    const log =
      root.querySelector?.("#chat-log, .chat-log, [data-application-part='log'], ol.chat-log") ?? root;
    if (!log) return;
    const obs = new MutationObserver(() => {
      if (!game.settings.get(MODULE_ID, "alwaysScroll")) return;
      forceScrollToNewest();
    });
    obs.observe(log, { childList: true, subtree: true });
    root.__chatAttentionObserved = true;
  };

  for (const root of rootElementsForChat(ui.chat)) attach(root);
  Hooks.on("renderChatLog", (app, html) => {
    const root = html?.[0] ?? html ?? app?.element?.[0] ?? app?.element;
    attach(root);
    if (game.settings.get(MODULE_ID, "alwaysScroll")) forceScrollToNewest(app);
  });
}

function registerSettings() {
  game.settings.register(MODULE_ID, "alwaysScroll", {
    name: "Always scroll to newest",
    hint: "Jump chat to the bottom on every new message — even while Foundry is focused and you had scrolled up.",
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
  scheduleScrollToNewest();

  if (isGameFocused()) return;
  if (!game.settings.get(MODULE_ID, "notifyWhenUnfocused")) return;

  const own = isOwnMessage(message, userId);
  if (own && !game.settings.get(MODULE_ID, "notifyOwnMessages")) return;

  const volume = Number(game.settings.get(MODULE_ID, "notifyVolume") ?? 0.75);
  if (volume <= 0) return;
  void playAttentionPing(volume);
}

function onMessageRendered() {
  scheduleScrollToNewest();
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
  watchChatMutations();

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") void ctx.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  console.log(`${MODULE_ID} | ready — force always-scroll + loud unfocused ping`);
});

Hooks.on("createChatMessage", onChatMessage);
Hooks.on("renderChatMessageHTML", onMessageRendered);
Hooks.on("renderChatMessage", onMessageRendered);
