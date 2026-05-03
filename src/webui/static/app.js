// MiMo Code Web UI controller (vanilla ES module).
//
// Connects to the local HTTP backend exposed by `mimo-code webui` and renders
// the conversation, sessions, tool calls, approvals, and status.

import { renderMarkdown, escapeHtml } from "./markdown.js";

const state = {
  info: null,
  sessions: [],
  currentSessionId: null,
  currentSession: null,
  activeRunId: null,
  pendingApprovals: new Map(),
  streamingAssistant: null,
  thinkingText: "",
  usage: null,
  cost: null,
  status: "idle",
  mode: "agent",
  sandbox: undefined,
};

const els = {
  app: document.getElementById("app"),
  sidebarList: document.getElementById("session-list"),
  newBtn: document.getElementById("new-session-btn"),
  modelSelect: document.getElementById("model-select"),
  sandboxSelect: document.getElementById("sandbox-select"),
  modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
  footerCwd: document.getElementById("footer-cwd"),
  sessionTitle: document.getElementById("session-title"),
  sessionMeta: document.getElementById("session-meta"),
  modeBadge: document.getElementById("mode-badge"),
  modelBadge: document.getElementById("model-badge"),
  usageBadge: document.getElementById("usage-badge"),
  costBadge: document.getElementById("cost-badge"),
  connBadge: document.getElementById("connection-badge"),
  messages: document.getElementById("messages"),
  emptyState: document.getElementById("empty-state"),
  composerForm: document.getElementById("composer-form"),
  composerInput: document.getElementById("composer-input"),
  composerStatus: document.getElementById("composer-status"),
  statusDot: document.querySelector(".status-dot"),
  statusText: document.getElementById("status-text"),
  cancelBtn: document.getElementById("cancel-btn"),
  sendBtn: document.getElementById("send-btn"),
  approvalDialog: document.getElementById("approval-dialog"),
  approvalTool: document.getElementById("approval-tool"),
  approvalInput: document.getElementById("approval-input"),
  approvalId: document.getElementById("approval-id"),
  approvalDeny: document.getElementById("approval-deny"),
  approvalOnce: document.getElementById("approval-once"),
  approvalAlways: document.getElementById("approval-always"),
  toast: document.getElementById("toast"),
  suggestions: document.getElementById("empty-suggestions"),
};

let eventSource = null;
let toastTimer = null;
let approvalQueue = [];
let approvalActive = false;

async function api(method, path, body) {
  const init = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(path, init);
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && data.error) || res.statusText || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function showToast(message, tone = "info") {
  els.toast.textContent = message;
  els.toast.dataset.tone = tone;
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3500);
}

function setConnection(stateName) {
  els.connBadge.dataset.state = stateName;
  els.connBadge.textContent =
    stateName === "connected" ? "live" : stateName === "error" ? "offline" : "connecting…";
}

function setStatus(text, dotState) {
  state.status = dotState;
  els.statusText.textContent = text;
  els.statusDot.dataset.state = dotState;
  if (dotState === "thinking" || dotState === "streaming") {
    els.cancelBtn.hidden = false;
  } else {
    els.cancelBtn.hidden = true;
  }
}

function selectMode(mode) {
  state.mode = mode;
  for (const btn of els.modeButtons) {
    btn.setAttribute("aria-selected", String(btn.dataset.mode === mode));
  }
  els.modeBadge.textContent = mode.toUpperCase();
  els.modeBadge.dataset.mode = mode;
  // Sandbox default for the mode if user hasn't picked one yet.
  if (mode === "yolo" && state.sandbox === undefined) {
    setSandbox("danger-full-access");
  } else if (mode === "plan" && state.sandbox === undefined) {
    setSandbox("read-only");
  }
}

function setSandbox(level) {
  state.sandbox = level;
  els.sandboxSelect.value = level;
}

function setModel(model) {
  if (state.info) state.info.model = model;
  els.modelBadge.textContent = model;
}

function applyServerInfo(info) {
  state.info = info;
  els.modelSelect.innerHTML = info.models
    .map(
      (m) =>
        `<option value="${escapeHtml(m)}" ${m === info.model ? "selected" : ""}>${escapeHtml(m)}</option>`,
    )
    .join("");
  els.footerCwd.textContent = info.cwd;
  els.footerCwd.title = info.cwd;
  els.modelBadge.textContent = info.model;
  selectMode(info.mode);
  setSandbox(info.sandbox);
}

async function loadInfo() {
  const info = await api("GET", "/api/info");
  applyServerInfo(info);
}

async function loadSessions(activeId) {
  const sessions = await api("GET", "/api/sessions");
  state.sessions = sessions;
  renderSessionList(activeId ?? state.currentSessionId);
}

function renderSessionList(activeId) {
  if (state.sessions.length === 0) {
    els.sidebarList.innerHTML = `<div class="session-empty">No saved sessions yet.</div>`;
    return;
  }
  const items = state.sessions
    .map((session) => {
      const active = session.id === activeId ? "active" : "";
      const time = new Date(session.updatedAt).toLocaleString();
      return `
        <button type="button" class="session-item ${active}" data-id="${session.id}">
          <span class="session-item-title">${escapeHtml(session.title || "Untitled")}</span>
          <span class="session-item-meta">
            <span>${session.messageCount} msg</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(time)}</span>
          </span>
        </button>`;
    })
    .join("");
  els.sidebarList.innerHTML = items;
  for (const btn of els.sidebarList.querySelectorAll(".session-item")) {
    btn.addEventListener("click", () => {
      void openSession(btn.dataset.id);
    });
  }
}

async function createSession() {
  const summary = await api("POST", "/api/sessions", { title: "New chat", cwd: state.info?.cwd });
  await loadSessions(summary.id);
  await openSession(summary.id);
  els.composerInput.focus();
}

async function openSession(id) {
  state.currentSessionId = id;
  els.app.dataset.state = "ready";
  for (const btn of els.sidebarList.querySelectorAll(".session-item")) {
    btn.classList.toggle("active", btn.dataset.id === id);
  }
  try {
    const session = await api("GET", `/api/sessions/${id}`);
    state.currentSession = session;
    renderSessionHeader(session);
    renderMessages(session.messages);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderSessionHeader(session) {
  els.sessionTitle.textContent = session.title || "Untitled";
  const created = new Date(session.createdAt).toLocaleString();
  els.sessionMeta.textContent = `${session.messages.length} messages · created ${created}`;
}

function ensureMessageRoot() {
  if (els.emptyState && els.emptyState.parentElement === els.messages) {
    els.emptyState.remove();
  }
}

function renderMessages(messages) {
  els.messages.innerHTML = "";
  if (!messages || messages.length === 0) {
    els.messages.appendChild(els.emptyState);
    return;
  }
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      // Tool results stand alone; render as collapsed tool block.
      els.messages.appendChild(renderToolBubble(message.name || "tool", "", message.content));
      continue;
    }
    if (message.role === "assistant") {
      if (message.thinking) {
        els.messages.appendChild(renderTextMessage("thinking", "Thinking", message.thinking));
      }
      if (message.toolCalls && message.toolCalls.length) {
        for (const call of message.toolCalls) {
          els.messages.appendChild(renderToolBubble(call.name, JSON.stringify(call.input, null, 2), null));
        }
      }
      if (message.content && message.content.trim().length > 0) {
        els.messages.appendChild(renderTextMessage("assistant", "MiMo", message.content));
      }
      continue;
    }
    if (message.role === "user") {
      els.messages.appendChild(renderTextMessage("user", "You", message.content));
    }
  }
  scrollToBottom();
}

function renderTextMessage(role, author, content) {
  const wrapper = document.createElement("article");
  wrapper.className = "message";
  wrapper.dataset.role = role;
  const initial =
    role === "user" ? "You" : role === "thinking" ? "··" : role === "assistant" ? "Mi" : "Sys";
  wrapper.innerHTML = `
    <div class="message-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
    <div class="message-body">
      <div class="message-header">
        <span class="message-author">${escapeHtml(author)}</span>
      </div>
      <div class="message-content"></div>
    </div>`;
  const contentEl = wrapper.querySelector(".message-content");
  contentEl.innerHTML = role === "thinking" ? escapeHtml(content) : renderMarkdown(content);
  return wrapper;
}

function appendStreamingAssistant() {
  ensureMessageRoot();
  const block = renderTextMessage("assistant", "MiMo", "");
  block.dataset.streaming = "true";
  els.messages.appendChild(block);
  state.streamingAssistant = {
    el: block.querySelector(".message-content"),
    text: "",
  };
  return block;
}

function renderToolBubble(name, input, result) {
  ensureMessageRoot();
  const wrap = document.createElement("article");
  wrap.className = "message";
  wrap.dataset.role = "assistant";
  wrap.innerHTML = `
    <div class="message-avatar" aria-hidden="true">⚙</div>
    <div class="message-body">
      <div class="tool-call" data-open="false">
        <button class="tool-call-header" type="button">
          <span class="tool-call-icon" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 2.5l4 3.5-4 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
          </span>
          <span class="tool-call-name">${escapeHtml(name)}</span>
          <span class="tool-call-summary"></span>
          <span class="tool-call-status" data-state="pending">running</span>
        </button>
        <div class="tool-call-body">
          <div class="tool-call-section">
            <div class="tool-call-section-label">Input</div>
            <pre class="tool-input"></pre>
          </div>
          <div class="tool-call-section tool-result-section" hidden>
            <div class="tool-call-section-label">Result</div>
            <pre class="tool-result-body"></pre>
          </div>
        </div>
      </div>
    </div>`;
  const card = wrap.querySelector(".tool-call");
  const summary = wrap.querySelector(".tool-call-summary");
  const inputEl = wrap.querySelector(".tool-input");
  const status = wrap.querySelector(".tool-call-status");
  inputEl.textContent = input || "";
  summary.textContent = summarizeInput(input);
  if (result !== null && result !== undefined) {
    setToolResult(card, result);
  }
  card.dataset.toolName = name;
  wrap.querySelector(".tool-call-header").addEventListener("click", () => {
    card.dataset.open = card.dataset.open === "true" ? "false" : "true";
  });
  if (status) status.dataset.state = result === null ? "pending" : "ok";
  return wrap;
}

function summarizeInput(input) {
  if (!input) return "";
  const trimmed = input.replace(/\s+/g, " ").trim();
  return trimmed.length > 100 ? `${trimmed.slice(0, 100)}…` : trimmed;
}

function setToolResult(card, content) {
  const section = card.querySelector(".tool-result-section");
  const body = card.querySelector(".tool-result-body");
  section.hidden = false;
  body.innerHTML = "";
  for (const line of String(content).split("\n")) {
    const lineEl = document.createElement("div");
    if (line.startsWith("+") && !line.startsWith("+++")) lineEl.className = "diff-line add";
    else if (line.startsWith("-") && !line.startsWith("---")) lineEl.className = "diff-line del";
    else if (line.startsWith("@@")) lineEl.className = "diff-line hunk";
    else lineEl.className = "diff-line";
    lineEl.textContent = line || " ";
    body.appendChild(lineEl);
  }
}

function findToolCardById(id) {
  for (const card of els.messages.querySelectorAll(".tool-call")) {
    if (card.dataset.toolCallId === id) return card;
  }
  return null;
}

function appendToolCall(event) {
  ensureMessageRoot();
  const inputJson = JSON.stringify(event.input ?? {}, null, 2);
  const block = renderToolBubble(event.name, inputJson, null);
  const card = block.querySelector(".tool-call");
  card.dataset.toolCallId = event.id;
  els.messages.appendChild(block);
  scrollToBottom();
}

function completeToolCall(event) {
  const card = findToolCardById(event.id);
  if (!card) return;
  const status = card.querySelector(".tool-call-status");
  setToolResult(card, event.content);
  if (status) {
    status.dataset.state = event.type === "tool_blocked" ? "blocked" : "ok";
    status.textContent = event.type === "tool_blocked" ? "blocked" : "done";
  }
}

function blockToolCall(event) {
  const card = findToolCardById(event.id);
  if (!card) return;
  const status = card.querySelector(".tool-call-status");
  if (status) {
    status.dataset.state = "blocked";
    status.textContent = "blocked";
  }
}

function scrollToBottom() {
  els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: "smooth" });
}

function appendThinkingMessage(content) {
  ensureMessageRoot();
  const block = renderTextMessage("thinking", "Thinking", content);
  els.messages.appendChild(block);
  scrollToBottom();
}

function flushStreamingAssistant() {
  if (!state.streamingAssistant) return;
  const text = state.streamingAssistant.text;
  state.streamingAssistant.el.innerHTML = renderMarkdown(text);
  state.streamingAssistant = null;
  scrollToBottom();
}

function handleStreamEvent(event) {
  switch (event.type) {
    case "run_started":
      state.activeRunId = event.runId;
      setStatus("Thinking…", "thinking");
      break;
    case "thinking":
      setStatus(`Thinking · iteration ${event.iteration}/${event.maxIterations}`, "thinking");
      break;
    case "workflow_status":
      setStatus(event.message, "thinking");
      break;
    case "assistant_thinking":
      appendThinkingMessage(event.content);
      break;
    case "streaming_delta":
      if (!state.streamingAssistant) appendStreamingAssistant();
      state.streamingAssistant.text += event.content;
      state.streamingAssistant.el.innerHTML = renderMarkdown(state.streamingAssistant.text);
      setStatus("Streaming…", "streaming");
      break;
    case "assistant_message":
      if (state.streamingAssistant) {
        state.streamingAssistant.text = event.content;
        flushStreamingAssistant();
      } else {
        ensureMessageRoot();
        els.messages.appendChild(renderTextMessage("assistant", "MiMo", event.content));
        scrollToBottom();
      }
      break;
    case "tool_call":
      flushStreamingAssistant();
      appendToolCall(event);
      break;
    case "tool_result":
      completeToolCall(event);
      break;
    case "tool_blocked":
      blockToolCall(event);
      showToast(`Tool blocked: ${event.reason}`, "error");
      break;
    case "approval_required":
      enqueueApproval(event);
      break;
    case "hook_result":
      if (event.cancelled) showToast(`hook ${event.hook} blocked the run`, "error");
      break;
    case "error":
      showToast(event.message, "error");
      setStatus("Error", "error");
      break;
    case "done":
      flushStreamingAssistant();
      state.usage = event.result.usage;
      state.cost = event.result.cost;
      updateUsageBadges();
      setStatus("Idle", "idle");
      break;
    case "run_finished":
      state.activeRunId = null;
      flushStreamingAssistant();
      setStatus("Idle", "idle");
      void loadSessions(state.currentSessionId);
      break;
    case "session_updated":
      if (state.currentSessionId === event.sessionId) {
        void api("GET", `/api/sessions/${event.sessionId}`).then((session) => {
          state.currentSession = session;
          renderSessionHeader(session);
        });
      }
      void loadSessions(state.currentSessionId);
      break;
    default:
      break;
  }
}

function updateUsageBadges() {
  if (state.usage && (state.usage.inputTokens || state.usage.outputTokens)) {
    const total = (state.usage.inputTokens || 0) + (state.usage.outputTokens || 0);
    els.usageBadge.textContent = `${total.toLocaleString()} tokens`;
    els.usageBadge.hidden = false;
  } else {
    els.usageBadge.hidden = true;
  }
  if (state.cost && state.cost.totalCost) {
    els.costBadge.textContent = `$${state.cost.totalCost.toFixed(4)}`;
    els.costBadge.hidden = false;
  } else {
    els.costBadge.hidden = true;
  }
}

function enqueueApproval(event) {
  approvalQueue.push(event);
  if (!approvalActive) processNextApproval();
}

function processNextApproval() {
  const next = approvalQueue.shift();
  if (!next) {
    approvalActive = false;
    return;
  }
  approvalActive = true;
  els.approvalTool.textContent = next.toolCall.name;
  els.approvalId.textContent = `id ${next.toolCall.id}`;
  els.approvalInput.textContent = JSON.stringify(next.toolCall.input, null, 2);
  if (typeof els.approvalDialog.showModal === "function") {
    els.approvalDialog.showModal();
  } else {
    els.approvalDialog.setAttribute("open", "");
  }
  const respond = (decision) => {
    void api("POST", `/api/runs/${next.runId}/approval`, {
      approvalId: next.approvalId,
      decision,
    }).catch((error) => showToast(error.message, "error"));
    if (els.approvalDialog.open) els.approvalDialog.close();
    setTimeout(processNextApproval, 0);
  };
  els.approvalDeny.onclick = () => respond("deny");
  els.approvalOnce.onclick = () => respond("approve");
  els.approvalAlways.onclick = () => respond("always");
}

async function sendMessage() {
  const message = els.composerInput.value.trim();
  if (!message) return;
  if (!state.currentSessionId) {
    await createSession();
  }
  ensureMessageRoot();
  els.messages.appendChild(renderTextMessage("user", "You", message));
  scrollToBottom();
  els.composerInput.value = "";
  autosizeComposer();
  setStatus("Sending…", "thinking");
  try {
    await api("POST", `/api/sessions/${state.currentSessionId}/run`, {
      message,
      mode: state.mode,
      sandbox: state.sandbox,
    });
  } catch (error) {
    showToast(error.message, "error");
    setStatus("Idle", "idle");
  }
}

function autosizeComposer() {
  els.composerInput.style.height = "auto";
  els.composerInput.style.height = `${Math.min(els.composerInput.scrollHeight, 280)}px`;
  els.sendBtn.disabled = els.composerInput.value.trim().length === 0;
}

function attachEventStream() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource("/api/events");
  eventSource.addEventListener("open", () => setConnection("connected"));
  eventSource.addEventListener("error", () => setConnection("error"));
  for (const type of [
    "run_started",
    "run_finished",
    "thinking",
    "workflow_status",
    "assistant_thinking",
    "streaming_delta",
    "assistant_message",
    "tool_call",
    "tool_result",
    "tool_blocked",
    "hook_result",
    "approval_required",
    "session_updated",
    "error",
    "done",
  ]) {
    eventSource.addEventListener(type, (e) => {
      try {
        handleStreamEvent(JSON.parse(e.data));
      } catch (error) {
        console.error("Failed to parse event", type, error);
      }
    });
  }
}

function bindUI() {
  els.newBtn.addEventListener("click", () => void createSession());
  for (const btn of els.modeButtons) {
    btn.addEventListener("click", () => selectMode(btn.dataset.mode));
  }
  els.modelSelect.addEventListener("change", (e) => setModel(e.target.value));
  els.sandboxSelect.addEventListener("change", (e) => setSandbox(e.target.value));
  els.composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void sendMessage();
  });
  els.composerInput.addEventListener("input", autosizeComposer);
  els.composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void sendMessage();
    }
  });
  els.cancelBtn.addEventListener("click", () => {
    if (!state.activeRunId) return;
    void api("POST", `/api/runs/${state.activeRunId}/cancel`).catch((error) =>
      showToast(error.message, "error"),
    );
  });
  if (els.suggestions) {
    for (const btn of els.suggestions.querySelectorAll(".suggestion")) {
      btn.addEventListener("click", () => {
        els.composerInput.value = btn.dataset.prompt || "";
        autosizeComposer();
        els.composerInput.focus();
      });
    }
  }
}

async function bootstrap() {
  bindUI();
  setConnection("connecting");
  attachEventStream();
  try {
    await loadInfo();
    await loadSessions();
    if (state.sessions.length > 0) {
      await openSession(state.sessions[0].id);
    } else {
      els.app.dataset.state = "ready";
    }
    autosizeComposer();
    els.composerInput.focus();
  } catch (error) {
    showToast(error.message, "error");
  }
}

window.addEventListener("DOMContentLoaded", () => void bootstrap());
