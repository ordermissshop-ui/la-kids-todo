// app.js — Kids Todo (Projects + search/sort + edit + export) + simple reminders (while app is open)
// Reminders: user sets Date + Time + "Remind before" (e.g. 1 hour / 1 day). Shows toast + optional system notification.

(() => {
  const STORAGE_KEY = "kids_todos_v3";
  const DEFAULT_PROJECTS = ["Home", "School", "Chores"];

  // --- DOM ---
  const $form = document.getElementById("todoForm");
  const $input = document.getElementById("todoInput");
  const $due = document.getElementById("dueInput");

  // NEW reminder inputs (must exist in index.html)
  const $time = document.getElementById("timeInput");
  const $remindBefore = document.getElementById("remindBeforeInput");

  const $priority = document.getElementById("priorityInput");

  const $tabs = document.getElementById("projectTabs");
  const $addProjectBtn = document.getElementById("addProjectBtn");

  const $list = document.getElementById("todoList");
  const $empty = document.getElementById("emptyState");

  const $filterButtons = Array.from(document.querySelectorAll(".chip"));
  const $search = document.getElementById("searchInput");
  const $sort = document.getElementById("sortInput");

  const $clearDone = document.getElementById("clearCompleted");
  const $clearAll = document.getElementById("clearAll");

  const $progressFill = document.getElementById("progressFill");
  const $progressText = document.getElementById("progressText");
  const $statsText = document.getElementById("statsText");
  const $exportBtn = document.getElementById("exportBtn");

  // NEW toast host (must exist in index.html)
  const $toastHost = document.getElementById("toastHost");

  // --- storage helpers (safe) ---
  function safeGetItem(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }

  /**
   * Todo shape:
   * {
   *   id, text, done, createdAt, project,
   *   due: "YYYY-MM-DD" | null,
   *   dueTime: "HH:MM" | null,
   *   remindBeforeMin: number,
   *   remindedAt: number | null,
   *   priority: "low"|"med"|"high"
   * }
   */
  let todos = [];
  let projects = [...DEFAULT_PROJECTS];

  let activeProject = "Home";
  let filter = "all";       // all|active|done
  let search = "";
  let sort = "newest";      // newest|due|priority

  // Notification permission request (only once)
  let notificationTried = false;

  // --- init ---
  loadState();
  render();

  // check reminders periodically (works while app is open)
  setInterval(checkReminders, 30 * 1000);
  setTimeout(checkReminders, 1500);

  // --- events ---
  $form.addEventListener("submit", (e) => {
    e.preventDefault();

    const text = ($input.value || "").trim();
    if (!text) return;

    const dueDate = $due && $due.value ? $due.value : null;              // YYYY-MM-DD
    const dueTime = $time && $time.value ? $time.value : null;           // HH:MM
    const remindBeforeMin = $remindBefore ? Number($remindBefore.value || "0") : 0;

    todos.unshift({
      id: uid(),
      text: text.slice(0, 120),
      done: false,
      createdAt: Date.now(),
      project: activeProject,
      due: dueDate,
      dueTime: dueTime,
      remindBeforeMin: Number.isFinite(remindBeforeMin) ? remindBeforeMin : 0,
      remindedAt: null,
      priority: ($priority && $priority.value) ? $priority.value : "med"
    });

    // reset inputs
    $input.value = "";
    if ($due) $due.value = "";
    if ($time) $time.value = "";
    if ($remindBefore) $remindBefore.value = "0";
    if ($priority) $priority.value = "med";

    persist();
    render();
    checkReminders();
  });

  $tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-project]");
    if (!btn) return;
    activeProject = btn.getAttribute("data-project") || activeProject;
    render();
  });

  $list.addEventListener("click", (e) => {
    const target = e.target;
    const li = target.closest("li[data-id]");
    if (!li) return;

    const id = li.getAttribute("data-id");
    const t = todos.find(x => x.id === id);
    if (!t) return;

    if (target.closest("[data-action='toggle']")) {
      t.done = !t.done;
      persist(); render(); return;
    }

    if (target.closest("[data-action='delete']")) {
      todos = todos.filter(x => x.id !== id);
      persist(); render(); return;
    }

    if (target.closest("[data-action='edit']")) {
      editTask(t);
      return;
    }
  });

  $filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter || "all";
      $filterButtons.forEach(b => b.classList.toggle("active", b === btn));
      render();
    });
  });

  $search.addEventListener("input", () => {
    search = ($search.value || "").trim().toLowerCase();
    render();
  });

  $sort.addEventListener("change", () => {
    sort = $sort.value;
    render();
  });

  $addProjectBtn.addEventListener("click", () => {
    const name = prompt("New project name (e.g. Sports):");
    if (!name) return;

    const clean = name.trim();
    if (!clean) return;

    if (projects.some(p => p.toLowerCase() === clean.toLowerCase())) return;

    projects.push(clean);
    activeProject = clean;
    persist();
    render();
  });

  $clearDone.addEventListener("click", () => {
    todos = todos.filter(t => !(t.project === activeProject && t.done));
    persist(); render();
  });

  $clearAll.addEventListener("click", () => {
    if (!confirm("Clear ALL tasks in ALL projects?")) return;
    todos = [];
    persist(); render();
  });

  $exportBtn.addEventListener("click", () => {
    const data = { projects, todos };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kids-todo-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  // --- UI ---
  function render() {
    renderTabs();

    const visible = getVisibleTodos();
    $list.innerHTML = visible.map(t => renderItem(t)).join("");
    $empty.style.display = visible.length ? "none" : "block";

    // progress + stats (for active project)
    const projTodos = todos.filter(t => t.project === activeProject);
    const done = projTodos.filter(t => t.done).length;
    const total = projTodos.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    $progressFill.style.width = pct + "%";
    $progressText.textContent = `${pct}% done in "${activeProject}"`;
    $statsText.textContent = `${total} tasks • ${done} done`;
  }

  function renderTabs() {
    $tabs.innerHTML = projects.map(p => {
      const active = p === activeProject ? "tab active" : "tab";
      return `<button type="button" class="${active}" data-project="${escAttr(p)}">${escHtml(p)}</button>`;
    }).join("");
  }

  function renderItem(t) {
    const checkClass = t.done ? "check done" : "check";
    const textClass = t.done ? "text done" : "text";

    const dueLabel =
      (t.due && t.dueTime) ? `Due: ${t.due} ${t.dueTime}` :
      (t.due) ? `Due: ${t.due}` :
      "No due date";

    const priLabel = t.priority === "high" ? "High" : t.priority === "low" ? "Low" : "Med";
    const badgeClass = `badge ${t.priority}`;

    // reminder label
    let remindLabel = "";
    if (t.due && t.dueTime && t.remindBeforeMin > 0) {
      remindLabel = `Remind: ${minsToLabel(t.remindBeforeMin)} before`;
    } else {
      remindLabel = "No reminder";
    }

    return `
      <li class="item" data-id="${escAttr(t.id)}">
        <div class="${checkClass}" data-action="toggle" title="Mark done">${t.done ? "✓" : ""}</div>

        <div>
          <div class="${textClass}">${escHtml(t.text)}</div>
          <div class="meta">
            <span class="${badgeClass}">Priority: ${priLabel}</span>
            <span class="badge">${escHtml(dueLabel)}</span>
            <span class="badge">${escHtml(remindLabel)}</span>
          </div>
        </div>

        <div class="itemActions">
          <button class="iconBtn" type="button" data-action="edit" title="Edit">✏️</button>
          <button class="iconBtn" type="button" data-action="delete" title="Delete">🗑️</button>
        </div>
      </li>
    `;
  }

  function editTask(t) {
    const newText = prompt("Edit task text:", t.text);
    if (newText === null) return;
    const clean = newText.trim();
    if (!clean) return;

    const newDue = prompt("Due date (YYYY-MM-DD) or blank:", t.due || "");
    const dueClean = (newDue || "").trim();
    const due = dueClean ? dueClean : null;

    const newTime = prompt("Due time (HH:MM) or blank:", t.dueTime || "");
    const timeClean = (newTime || "").trim();
    const dueTime = timeClean ? timeClean : null;

    const newRem = prompt("Remind before minutes (0 = none, 60 = 1 hour, 1440 = 1 day):", String(t.remindBeforeMin || 0));
    const remMin = Number((newRem || "").trim() || "0");
    const remindBeforeMin = Number.isFinite(remMin) && remMin >= 0 ? remMin : (t.remindBeforeMin || 0);

    const newPri = prompt("Priority (low / med / high):", t.priority);
    const pri = (newPri || "").trim().toLowerCase();
    const priority = (pri === "low" || pri === "med" || pri === "high") ? pri : t.priority;

    t.text = clean.slice(0, 120);
    t.due = due;
    t.dueTime = dueTime;
    t.remindBeforeMin = remindBeforeMin;

    // If due/reminder changed, allow reminding again (only if not done)
    t.remindedAt = null;

    t.priority = priority;

    persist();
    render();
    checkReminders();
  }

  function getVisibleTodos() {
    let list = todos.filter(t => t.project === activeProject);

    if (filter === "active") list = list.filter(t => !t.done);
    if (filter === "done") list = list.filter(t => t.done);

    if (search) list = list.filter(t => (t.text || "").toLowerCase().includes(search));

    if (sort === "newest") {
      list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    } else if (sort === "due") {
      // tasks with due date+time first, then earliest
      list = [...list].sort((a, b) => {
        const ad = (a.due ? a.due : "9999-12-31") + " " + (a.dueTime ? a.dueTime : "23:59");
        const bd = (b.due ? b.due : "9999-12-31") + " " + (b.dueTime ? b.dueTime : "23:59");
        return ad.localeCompare(bd);
      });
    } else if (sort === "priority") {
      const w = (p) => p === "high" ? 0 : p === "med" ? 1 : 2;
      list = [...list].sort((a, b) => w(a.priority) - w(b.priority));
    }

    return list;
  }

  // --- reminders (simple; works while app is open) ---
  function checkReminders() {
    const now = Date.now();

    for (const t of todos) {
      if (t.done) continue;
      if (!t.due || !t.dueTime) continue;
      if (!t.remindBeforeMin || t.remindBeforeMin <= 0) continue;
      if (t.remindedAt) continue;

      const dueMs = toLocalMs(t.due, t.dueTime);
      if (!Number.isFinite(dueMs)) continue;

      const remindMs = dueMs - (t.remindBeforeMin * 60 * 1000);

      // Fire if we passed remind time (and not extremely late; 6-hour grace window)
      if (now >= remindMs && now <= remindMs + (6 * 60 * 60 * 1000)) {
        t.remindedAt = now;
        persist();
        showReminderToast(t);
        maybeSystemNotify(t);
        render();
      }
    }
  }

  function toLocalMs(dateStr, timeStr) {
    // dateStr "YYYY-MM-DD", timeStr "HH:MM"
    const partsD = String(dateStr).split("-").map(Number);
    const partsT = String(timeStr).split(":").map(Number);
    if (partsD.length !== 3 || partsT.length < 2) return NaN;
    const [y, m, d] = partsD;
    const [hh, mm] = partsT;
    if (!y || !m || !d || hh == null || mm == null) return NaN;
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }

  function showReminderToast(t) {
    if (!$toastHost) return;

    const title = "⏰ Reminder";
    const body = `${t.text}\nDue ${t.due} ${t.dueTime}`;

    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `
      <div class="toastTitle">${escHtml(title)}</div>
      <div class="toastBody">${escHtml(body).replaceAll("\n", "<br>")}</div>
      <div class="toastActions">
        <button class="toastBtn" data-action="done">Mark done</button>
        <button class="toastBtn" data-action="close">Close</button>
      </div>
    `;

    el.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "done") {
        t.done = true;
        persist();
        render();
      }
      el.remove();
    });

    $toastHost.appendChild(el);

    // auto close
    setTimeout(() => {
      if (el.isConnected) el.remove();
    }, 12000);
  }

  function maybeSystemNotify(t) {
    // Optional system notification (requires permission; still only while app/browser is open)
    if (!("Notification" in window)) return;

    // Request permission once (only if default)
    if (!notificationTried && Notification.permission === "default") {
      notificationTried = true;
      // this may be blocked unless called from a user gesture in some browsers
      Notification.requestPermission().catch(() => {});
      return;
    }

    if (Notification.permission !== "granted") return;

    try {
      new Notification("Kids Todo Reminder", {
        body: `${t.text}\nDue ${t.due} ${t.dueTime}`,
        silent: false
      });
    } catch {
      // ignore if browser blocks it
    }
  }

  function minsToLabel(mins) {
    if (mins === 15) return "15 minutes";
    if (mins === 60) return "1 hour";
    if (mins === 1440) return "1 day";
    if (mins % 1440 === 0) return `${mins / 1440} days`;
    if (mins % 60 === 0) return `${mins / 60} hours`;
    return `${mins} minutes`;
  }

  // --- persistence ---
  function persist() {
    safeSetItem(STORAGE_KEY, JSON.stringify({ projects, todos }));
  }

  function loadState() {
    try {
      const raw = safeGetItem(STORAGE_KEY);
      if (!raw) {
        projects = [...DEFAULT_PROJECTS];
        todos = [];
        activeProject = projects[0];
        return;
      }

      const parsed = JSON.parse(raw);

      projects = Array.isArray(parsed.projects) && parsed.projects.length
        ? parsed.projects.map(String)
        : [...DEFAULT_PROJECTS];

      todos = Array.isArray(parsed.todos)
        ? parsed.todos.map(x => ({
            id: String(x.id ?? uid()),
            text: String(x.text ?? "").slice(0, 120),
            done: Boolean(x.done),
            createdAt: Number(x.createdAt ?? Date.now()),
            project: String(x.project ?? projects[0]),
            due: x.due ? String(x.due) : null,
            dueTime: x.dueTime ? String(x.dueTime) : null,
            remindBeforeMin: Number.isFinite(Number(x.remindBeforeMin)) ? Number(x.remindBeforeMin) : 0,
            remindedAt: x.remindedAt ? Number(x.remindedAt) : null,
            priority: (x.priority === "low" || x.priority === "med" || x.priority === "high") ? x.priority : "med"
          }))
        : [];

      activeProject = projects[0] || "Home";
    } catch {
      projects = [...DEFAULT_PROJECTS];
      todos = [];
      activeProject = projects[0];
    }
  }

  // --- utils ---
  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  }

  function escHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escAttr(s) {
    return escHtml(s);
  }
})();
