// app.js
(() => {
  const STORAGE_KEY = "kids_todos_v2";
  const DEFAULT_PROJECTS = ["Home", "School", "Chores"];

  /** @type {{id:string, text:string, done:boolean, createdAt:number, project:string, due:string|null, priority:"low"|"med"|"high"}[]} */
  let todos = load().todos;
  /** @type {string[]} */
  let projects = load().projects;

  let activeProject = projects[0] || "Home";
  let filter = "all"; // all|active|done
  let search = "";
  let sort = "newest"; // newest|due|priority

  const $form = document.getElementById("todoForm");
  const $input = document.getElementById("todoInput");
  const $due = document.getElementById("dueInput");
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

  // ---- events ----
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $input.value.trim();
    if (!text) return;

    todos.unshift({
      id: uid(),
      text,
      done: false,
      createdAt: Date.now(),
      project: activeProject,
      due: $due.value ? $due.value : null,
      priority: /** @type any */ ($priority.value)
    });

    $input.value = "";
    $due.value = "";
    $priority.value = "med";
    persist();
    render();
  });

  $list.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
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
    search = $search.value.trim().toLowerCase();
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

  // ---- UI ----
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
      return `<button type="button" class="${active}" data-project="${esc(p)}">${esc(p)}</button>`;
    }).join("");

    // tab click handler (rebind safely)
    Array.from($tabs.querySelectorAll("button[data-project]")).forEach(btn => {
      btn.addEventListener("click", () => {
        activeProject = btn.getAttribute("data-project") || activeProject;
        render();
      });
    });
  }

  function renderItem(t) {
    const checkClass = t.done ? "check done" : "check";
    const textClass = t.done ? "text done" : "text";
    const due = t.due ? `Due: ${formatDate(t.due)}` : "No due date";
    const badgeClass = `badge ${t.priority}`;
    const priLabel = t.priority === "high" ? "High" : t.priority === "low" ? "Low" : "Med";

    return `
      <li class="item" data-id="${esc(t.id)}">
        <div class="${checkClass}" data-action="toggle" title="Mark done">${t.done ? "✓" : ""}</div>

        <div>
          <div class="${textClass}">${esc(t.text)}</div>
          <div class="meta">
            <span class="${badgeClass}">Priority: ${priLabel}</span>
            <span class="badge">${esc(due)}</span>
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

    const newPri = prompt("Priority (low / med / high):", t.priority);
    const pri = (newPri || "").trim().toLowerCase();
    const priority = (pri === "low" || pri === "med" || pri === "high") ? /** @type any */(pri) : t.priority;

    t.text = clean.slice(0, 120);
    t.due = due;
    t.priority = priority;
    persist();
    render();
  }

  function getVisibleTodos() {
    let list = todos.filter(t => t.project === activeProject);

    if (filter === "active") list = list.filter(t => !t.done);
    if (filter === "done") list = list.filter(t => t.done);

    if (search) list = list.filter(t => t.text.toLowerCase().includes(search));

    if (sort === "newest") {
      list = [...list].sort((a,b) => b.createdAt - a.createdAt);
    } else if (sort === "due") {
      // tasks with due date first, then earliest due
      list = [...list].sort((a,b) => {
        const ad = a.due ? a.due : "9999-12-31";
        const bd = b.due ? b.due : "9999-12-31";
        return ad.localeCompare(bd);
      });
    } else if (sort === "priority") {
      const w = (p) => p === "high" ? 0 : p === "med" ? 1 : 2;
      list = [...list].sort((a,b) => w(a.priority) - w(b.priority));
    }

    return list;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, todos }));
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { projects: [...DEFAULT_PROJECTS], todos: [] };
      const parsed = JSON.parse(raw);

      const loadedProjects = Array.isArray(parsed.projects) ? parsed.projects.filter(Boolean).map(String) : [...DEFAULT_PROJECTS];
      const loadedTodos = Array.isArray(parsed.todos) ? parsed.todos : [];

      return {
        projects: loadedProjects.length ? loadedProjects : [...DEFAULT_PROJECTS],
        todos: loadedTodos.map(x => ({
          id: String(x.id ?? uid()),
          text: String(x.text ?? "").slice(0, 120),
          done: Boolean(x.done),
          createdAt: Number(x.createdAt ?? Date.now()),
          project: String(x.project ?? (loadedProjects[0] || "Home")),
          due: x.due ? String(x.due) : null,
          priority: (x.priority === "low" || x.priority === "med" || x.priority === "high") ? x.priority : "med"
        }))
      };
    } catch {
      return { projects: [...DEFAULT_PROJECTS], todos: [] };
    }
  }

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  }

  function formatDate(yyyyMmDd) {
    // Keep it simple and consistent across browsers
    return yyyyMmDd;
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // initial render
  render();
})();
