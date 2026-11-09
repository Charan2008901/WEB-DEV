
/* ========================================================================
   WEB / LAB — PHASE 04
   Project workspace, Phase 3 blueprint handoff, Gemini job orchestration,
   file inspection, security findings, remediation proposals and reporting.

   SECURITY NOTES
   - The browser never receives a Gemini API key.
   - Project access is requested from the backend using the authenticated
     Google ID token already used by the current WEB / LAB frontend.
   - All project content is rendered with textContent/createElement.
   - The backend must enforce identity, Premium entitlement, ownership,
     input validation, job quotas and sandbox policy independently.

   EXPECTED HANDOFF
     phase4.html?project_id=<server-saved-blueprint-id>

   OPTIONAL FRONTEND PREVIEW
     phase4.html?demo=1
   Demo mode is clearly labelled and never calls generation or scan APIs.
   ======================================================================== */

(() => {
  "use strict";

  const API_BASE_URL = String(
    window.WEBLAB_CONFIG?.API_BASE_URL ||
    "https://web-dev-backend-g976.onrender.com"
  ).replace(/\/$/, "");

  const API = {
    project: (id) => `/api/phase4/projects/${encodeURIComponent(id)}`,
    generate: (id) => `/api/phase4/projects/${encodeURIComponent(id)}/generate`,
    scan: (id) => `/api/phase4/projects/${encodeURIComponent(id)}/security-scan`,
    report: (id) => `/api/phase4/projects/${encodeURIComponent(id)}/security-report`,
    job: (id) => `/api/phase4/jobs/${encodeURIComponent(id)}`,
    cancelJob: (id) => `/api/phase4/jobs/${encodeURIComponent(id)}/cancel`,
    fix: (projectId, findingId) =>
      `/api/phase4/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/fix`,
    exportProject: (id) => `/api/phase4/projects/${encodeURIComponent(id)}/export`
  };

  const JOB_POLL_INTERVAL_MS = 2500;
  const JOB_MAX_POLLS = 144;
  const TOKEN_KEY = "google_id_token";

  const params = new URLSearchParams(window.location.search);
  const requestedProjectId =
    params.get("project_id") ||
    params.get("projectId") ||
    params.get("id");

  const isDemo = params.get("demo") === "1";

  const state = {
    projectId: requestedProjectId,
    project: null,
    blueprint: null,
    tree: null,
    files: new Map(),
    selectedFilePath: "",
    findings: [],
    report: null,
    coverage: [],
    activity: [],
    activeView: "build",
    activeJob: null,
    pollCount: 0,
    pollTimer: null,
    jobController: null,
    currentFinding: null,
    previousModalFocus: null,
    demo: isDemo,
    projectLoaded: false
  };

  const $ = (id) => document.getElementById(id);
  const views = ["build", "files", "security", "reports"];

  const els = {
    empty: $("emptyProjectState"),
    emptyError: $("emptyError"),
    workspace: $("workspaceContent"),
    connection: $("connectionStatus"),
    refresh: $("refreshProjectBtn"),
    retryLoad: $("retryLoadBtn"),

    sidebarProjectName: $("sidebarProjectName"),
    sidebarProjectStack: $("sidebarProjectStack"),
    projectMonogram: $("projectMonogram"),
    projectLoadBadge: $("projectLoadBadge"),

    projectName: $("projectName"),
    projectDescription: $("projectDescription"),
    projectFramework: $("projectFramework"),
    projectDatabase: $("projectDatabase"),
    projectFileCount: $("projectFileCount"),
    projectOrigin: $("projectOrigin"),
    projectStateDot: $("projectStateDot"),
    projectStateText: $("projectStateText"),
    summaryProjectIcon: $("summaryProjectIcon"),

    blueprintContext: $("blueprintContext"),
    contextIdea: $("contextIdea"),
    contextStack: $("contextStack"),
    contextStructure: $("contextStructure"),

    prompt: $("developerPrompt"),
    promptCount: $("promptCharCount"),
    buildButton: $("generateCodeBtn"),
    buildError: $("buildError"),

    agentBadge: $("agentStatusBadge"),
    agentSteps: $("agentSteps"),
    agentProgressFill: $("agentProgressFill"),
    agentProgressText: $("agentProgressText"),
    agentMessage: $("agentJobMessage"),

    cancelJob: $("cancelJobBtn"),
    cancelSecurityJob: $("cancelSecurityJobBtn"),

    exportProject: $("exportProjectBtn"),

    fileTree: $("fileTree"),
    fileSearch: $("fileSearchInput"),
    fileTreeCount: $("fileTreeCount"),
    filesCountBadge: $("filesCountBadge"),
    fileRootLabel: $("fileRootLabel"),
    selectedFileName: $("selectedFileName"),
    fileLanguageBadge: $("fileLanguageBadge"),
    filePreviewEmpty: $("filePreviewEmpty"),
    fileCodePreview: $("fileCodePreview"),
    fileCodeContent: $("fileCodeContent"),
    filePreviewStatus: $("filePreviewStatus"),
    copyFile: $("copyFileBtn"),

    scanButton: $("runSecurityScanBtn"),
    assessmentIcon: $("assessmentIcon"),
    assessmentStatus: $("assessmentStatus"),
    assessmentSubtext: $("assessmentSubtext"),
    lastScan: $("lastScanText"),
    coverageText: $("coverageText"),

    criticalHigh: $("criticalHighCount"),
    mediumLow: $("mediumLowCount"),
    notTested: $("notTestedCount"),

    findingsSummary: $("findingsSummary"),
    findingsList: $("findingsList"),
    severityFilter: $("severityFilter"),
    findingStatusFilter: $("findingStatusFilter"),
    coverageList: $("coverageList"),

    reportSummaryTitle: $("reportSummaryTitle"),
    reportSummaryText: $("reportSummaryText"),
    reportDate: $("reportDateText"),
    reportFindings: $("reportFindingsText"),
    timeline: $("activityTimeline"),
    downloadReport: $("downloadReportBtn"),
    exportReport: $("downloadReportBtn"),

    findingModal: $("findingModal"),
    closeFindingModal: $("closeFindingModal"),
    closeFindingModalSecondary: $("closeFindingModalSecondary"),
    findingModalTitle: $("findingModalTitle"),
    modalSeverity: $("modalSeverity"),
    modalLocation: $("modalFindingLocation"),
    modalEvidence: $("modalFindingEvidence"),
    modalImpact: $("modalFindingImpact"),
    modalFix: $("modalFindingFix"),
    patchPreview: $("patchPreview"),
    patchPreviewText: $("patchPreviewText"),
    requestFix: $("requestFixBtn"),
    fixMessage: $("fixActionMessage"),

    toast: $("toastRegion"),
    live: $("globalLiveRegion"),
    footerStatus: $("workspaceFooterStatus")
  };

  // ---------- Safe utilities ----------

  function text(value, fallback = "—") {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    return String(value);
  }

  function truncate(value, max = 190) {
    const valueText = text(value, "");

    return valueText.length > max
      ? `${valueText.slice(0, max).trimEnd()}…`
      : valueText;
  }

  function escapePath(path) {
    const raw = String(path || "").replace(/\\/g, "/").trim();

    if (
      !raw ||
      raw.startsWith("/") ||
      /^[a-zA-Z]:/.test(raw) ||
      raw.includes("\0")
    ) {
      return "";
    }

    const segments = raw.split("/").filter(Boolean);

    if (
      !segments.length ||
      segments.some((part) => part === "." || part === "..")
    ) {
      return "";
    }

    return segments.join("/");
  }

  function fileLanguage(path) {
    const ext = String(path).split(".").pop().toLowerCase();

    const map = {
      py: "PYTHON",
      html: "HTML",
      htm: "HTML",
      css: "CSS",
      js: "JAVASCRIPT",
      mjs: "JAVASCRIPT",
      cjs: "JAVASCRIPT",
      ts: "TYPESCRIPT",
      tsx: "TSX",
      jsx: "JSX",
      json: "JSON",
      sql: "SQL",
      md: "MARKDOWN",
      yml: "YAML",
      yaml: "YAML",
      xml: "XML",
      java: "JAVA",
      php: "PHP",
      sh: "SHELL",
      txt: "TEXT",
      env: "ENV",
      toml: "TOML",
      lock: "LOCKFILE"
    };

    return map[ext] || "TEXT";
  }

  function formatTime(value) {
    if (!value) return "JUST NOW";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function makeElement(tag, className, content) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (content !== undefined) {
      node.textContent = String(content);
    }

    return node;
  }

  function showToast(message, type = "info") {
    const toast = makeElement("div", `toast ${type}`, message);

    els.toast.append(toast);

    window.setTimeout(() => toast.remove(), 4200);
  }

  function announce(message) {
    els.live.textContent = "";

    window.requestAnimationFrame(() => {
      els.live.textContent = message;
    });
  }

  function setConnection(label, mode = "neutral") {
    els.connection.classList.remove("is-online", "is-offline");

    if (mode === "online") {
      els.connection.classList.add("is-online");
    }

    if (mode === "offline") {
      els.connection.classList.add("is-offline");
    }

    const dot = els.connection.querySelector(".status-dot");

    if (dot) {
      dot.className = `status-dot ${
        mode === "offline"
          ? "warning"
          : mode === "neutral"
            ? "muted"
            : ""
      }`;
    }

    els.connection.lastChild.textContent = ` ${label}`;
  }

  function setInlineError(element, message) {
    element.textContent = message || "";
    element.hidden = !message;
  }

  function getAuthToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  async function parseResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return response.json().catch(() => ({}));
    }

    const body = await response.text().catch(() => "");

    return body ? { message: body.slice(0, 600) } : {};
  }

  async function apiRequest(path, options = {}) {
    const token = getAuthToken();

    if (!token) {
      const error = new Error(
        "Your Google sign-in session is missing or expired. Please sign in again."
      );

      error.status = 401;
      throw error;
    }

    const headers = new Headers(options.headers || {});

    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);

    if (
      options.body !== undefined &&
      !(options.body instanceof FormData)
    ) {
      headers.set("Content-Type", "application/json");
    }

    let response;

    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: "omit",
        body:
          options.body === undefined || options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body)
      });
    } catch (cause) {
      const error = new Error(
        "Could not reach the Phase 4 backend. Check your connection and confirm that the backend is awake."
      );

      error.cause = cause;
      throw error;
    }

    const data = await parseResponse(response);

    if (!response.ok) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : typeof data?.message === "string"
            ? data.message
            : `The Phase 4 API returned HTTP ${response.status}.`;

      const error = new Error(message);

      error.status = response.status;
      error.data = data;

      throw error;
    }

    return { response, data };
  }

  function friendlyApiError(error) {
    if (error?.status === 401) {
      return "Your sign-in session has expired. Sign in again and reload this project.";
    }

    if (error?.status === 403) {
      return "Your account is not authorised to access this Phase 4 project or feature.";
    }

    if (error?.status === 404) {
      return "This Phase 4 endpoint or project was not found. The frontend is ready, but the matching Flask route may not be implemented or deployed yet.";
    }

    if (error?.status === 429) {
      return "The request limit has been reached. Wait before starting another generation or scan.";
    }

    if (error?.status === 503) {
      return "The Phase 4 service is temporarily unavailable. Try again later.";
    }

    return error?.message || "An unexpected error occurred.";
  }

  // ---------- Demo data (explicitly non-production preview) ----------

  function getDemoProject() {
    return {
      project_id: "demo-project",

      root_name: "commerce-studio",

      project: {
        original_idea:
          "Build an e-commerce platform where customers can browse products, manage a cart, place orders and track order status. Administrators can manage the catalogue and inventory.",

        framework: "flask",
        database: "mysql",

        project_summary:
          "A Flask and MySQL commerce application with a customer storefront, order workflows and an administrative catalogue.",

        name: "Commerce Studio"
      },

      structure: {
        folders: [
          { path: "backend", type: "folder" },
          { path: "backend/app.py", type: "file" },
          { path: "backend/db.py", type: "file" },
          { path: "backend/config.py", type: "file" },
          { path: "backend/routes/products.py", type: "file" },
          { path: "backend/routes/orders.py", type: "file" },
          { path: "backend/services/payment_service.py", type: "file" },
          { path: "backend/models/product.py", type: "file" },
          { path: "backend/models/order.py", type: "file" },
          { path: "frontend", type: "folder" },
          { path: "frontend/index.html", type: "file" },
          { path: "frontend/assets/style.css", type: "file" },
          { path: "frontend/assets/app.js", type: "file" },
          { path: "tests/test_orders.py", type: "file" },
          { path: "requirements.txt", type: "file" },
          { path: ".env.example", type: "file" },
          { path: "README.md", type: "file" }
        ]
      },

      master_prompt:
        "DEMO PREVIEW ONLY — This is sample project context, not a real saved Phase 3 blueprint.",

      generated_files: [
        {
          path: "backend/app.py",
          language: "python",
          content:
            "from flask import Flask\nfrom routes.products import products_bp\nfrom routes.orders import orders_bp\n\napp = Flask(__name__)\napp.register_blueprint(products_bp, url_prefix=\"/api/products\")\napp.register_blueprint(orders_bp, url_prefix=\"/api/orders\")\n\nif __name__ == \"__main__\":\n    app.run(debug=False)\n"
        },
        {
          path: "backend/db.py",
          language: "python",
          content:
            "import os\nimport mysql.connector\n\ndef get_connection():\n    return mysql.connector.connect(\n        host=os.environ[\"DB_HOST\"],\n        user=os.environ[\"DB_USER\"],\n        password=os.environ[\"DB_PASSWORD\"],\n        database=os.environ[\"DB_NAME\"],\n    )\n"
        },
        {
          path: "frontend/index.html",
          language: "html",
          content:
            "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>Commerce Studio</title>\n</head>\n<body>\n  <main id=\"app\">\n    <h1>Commerce Studio</h1>\n  </main>\n</body>\n</html>\n"
        }
      ],

      security_report: {
        status: "demo",
        generated_at: "2026-11-09T10:00:00Z",

        findings: [
          {
            id: "DEMO-001",
            title: "Example: Missing object ownership check",
            severity: "high",
            confidence: "potential",
            status: "potential",
            file: "backend/routes/orders.py",
            line: 28,
            description:
              "Sample finding only. The demo shows how a possible access-control issue may be presented.",
            attack_scenario:
              "A user might attempt to request an order belonging to another account if the route does not check ownership.",
            recommendation:
              "Verify the authenticated user's ownership of the requested order on every read and update operation."
          },
          {
            id: "DEMO-002",
            title: "Example: Overly broad CORS policy",
            severity: "medium",
            confidence: "potential",
            status: "potential",
            file: "backend/app.py",
            line: 6,
            description:
              "Sample finding only. This is not the result of running a scanner.",
            attack_scenario:
              "An overly broad cross-origin policy can expose browser-accessible responses in an unintended origin context.",
            recommendation:
              "Allow only trusted production origins and do not combine wildcard origins with credentials."
          }
        ]
      }
    };
  }

  // ---------- Project normalisation ----------

  function normalizeProject(payload) {
    const project = payload?.project || payload?.blueprint || payload || {};
    const structure = project.structure || payload?.structure || {};

    const root = text(
      project.root_name || payload?.root_name || structure.root_name,
      "project"
    );

    const folders = Array.isArray(structure.folders)
      ? structure.folders
      : Array.isArray(project.folders)
        ? project.folders
        : Array.isArray(payload?.folders)
          ? payload.folders
          : [];

    let generatedFiles =
      project.generated_files ||
      payload?.generated_files ||
      project.files ||
      payload?.files ||
      [];

    if (
      !Array.isArray(generatedFiles) &&
      generatedFiles &&
      typeof generatedFiles === "object"
    ) {
      generatedFiles = Object.entries(generatedFiles).map(
        ([path, content]) => ({ path, content })
      );
    }

    if (!Array.isArray(generatedFiles)) {
      generatedFiles = [];
    }

    return {
      id: text(
        project.project_id ||
        project.id ||
        payload?.project_id ||
        state.projectId,
        ""
      ),

      rootName: root,
      name: text(project.name || project.project_name || root, root),

      idea: text(
        project.original_idea ||
        project.idea ||
        project.project_idea,
        ""
      ),

      framework: text(
        project.framework ||
        project.stack ||
        project.technology_stack,
        "Not specified"
      ),

      database: text(
        project.database_name ||
        project.database ||
        project.db,
        "Not specified"
      ),

      summary: text(
        project.project_summary ||
        project.summary ||
        project.description,
        "No project summary was provided in the Phase 3 blueprint."
      ),

      folders,

      treePreview: text(
        project.tree_preview ||
        structure.tree_preview ||
        project.tree ||
        payload?.tree_preview,
        ""
      ),

      masterPrompt: text(
        project.master_prompt ||
        project.coding_prompt ||
        payload?.master_prompt,
        ""
      ),

      generatedFiles,
      raw: payload,

      report:
        project.security_report ||
        payload?.security_report ||
        null,

      createdAt: project.created_at || payload?.created_at || null
    };
  }

  function buildTreeModel(entries, rootName) {
    const root = {
      name: rootName,
      type: "folder",
      children: new Map(),
      path: ""
    };

    let skipped = 0;

    for (const entry of entries || []) {
      if (entry === null || entry === undefined) {
        skipped += 1;
        continue;
      }

      const rawPath =
        typeof entry === "string"
          ? entry
          : entry?.path || entry?.name || "";

      const rawNormalized = String(rawPath)
        .replace(/\\/g, "/")
        .trim();

      const directoryHint =
        rawNormalized.endsWith("/") ||
        ["folder", "directory", "dir"].includes(
          String(entry?.type || "").toLowerCase()
        );

      const safePath = escapePath(rawPath);

      if (!safePath) {
        skipped += 1;
        continue;
      }

      let segments = safePath.split("/");

      if (
        segments[0]?.toLowerCase() ===
        String(rootName).toLowerCase()
      ) {
        segments = segments.slice(1);
      }

      if (!segments.length) continue;

      let node = root;
      let currentPath = "";

      segments.forEach((segment, index) => {
        currentPath = currentPath
          ? `${currentPath}/${segment}`
          : segment;

        const isLast = index === segments.length - 1;

        const statedType =
          entry && typeof entry === "object"
            ? String(entry.type || "").toLowerCase()
            : "";

        const isFolder =
          !isLast ||
          directoryHint ||
          ["folder", "directory", "dir"].includes(statedType);

        const key = segment.toLowerCase();

        if (!node.children.has(key)) {
          node.children.set(key, {
            name: segment,
            type: isFolder ? "folder" : "file",
            path: currentPath,
            children: new Map()
          });
        } else if (
          isFolder &&
          node.children.get(key).type !== "folder"
        ) {
          node.children.get(key).type = "folder";
        }

        node = node.children.get(key);
      });
    }

    function sortChildren(node) {
      return [...node.children.values()]
        .sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
          }

          return a.name.localeCompare(
            b.name,
            undefined,
            { sensitivity: "base" }
          );
        })
        .map((child) => ({
          ...child,
          children: sortChildren(child)
        }));
    }

    const children = sortChildren(root);

    let folderCount = 0;
    let fileCount = 0;

    function count(nodes) {
      for (const node of nodes) {
        if (node.type === "folder") {
          folderCount += 1;
        } else {
          fileCount += 1;
        }

        count(node.children || []);
      }
    }

    count(children);

    return {
      root: { ...root, children },
      folderCount,
      fileCount,
      skipped
    };
  }

  function loadGeneratedFiles(items) {
    state.files.clear();

    for (const item of items || []) {
      if (!item || typeof item !== "object") continue;

      const path = escapePath(item.path || item.filename || "");

      if (!path) continue;

      const content =
        typeof item.content === "string"
          ? item.content
          : typeof item.code === "string"
            ? item.code
            : typeof item.source === "string"
              ? item.source
              : "";

      state.files.set(path, {
        path,
        content,
        language: text(item.language, fileLanguage(path)),
        status: text(item.status, "Generated")
      });
    }
  }

  function getProjectDisplayName() {
    return state.project?.name ||
      state.project?.rootName ||
      "Project workspace";
  }

  function projectInitials(name) {
    const words = text(name, "P")
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return words.slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "P";
  }

  function renderProjectSummary() {
    const p = state.project;

    if (!p) return;

    const name = getProjectDisplayName();
    const stack = p.framework.toUpperCase();
    const database = p.database.toUpperCase();

    const count = state.tree
      ? `${state.tree.fileCount} planned`
      : `${p.folders.length} entries`;

    els.sidebarProjectName.textContent = name;
    els.sidebarProjectStack.textContent = `${stack} · ${database}`;
    els.projectMonogram.textContent = projectInitials(name);
    els.projectLoadBadge.textContent = state.demo ? "DEMO" : "LOADED";

    els.projectName.textContent = name;
    els.projectDescription.textContent = p.summary;
    els.projectFramework.textContent = p.framework;
    els.projectDatabase.textContent = p.database;
    els.projectFileCount.textContent = count;
    els.summaryProjectIcon.textContent = projectInitials(name);

    els.blueprintContext.textContent =
      `${p.framework} · ${p.database} · ${state.tree?.fileCount || 0} planned files`;

    els.contextIdea.textContent =
      p.idea || "No original idea was included in the saved blueprint.";

    els.contextStack.textContent =
      `${p.framework} with ${p.database}. Backend validation remains authoritative.`;

    els.contextStructure.textContent =
      `${state.tree?.folderCount || 0} folders and ${state.tree?.fileCount || 0} files in the supplied structure.`;

    els.fileRootLabel.textContent = p.rootName.toUpperCase();

    els.filesCountBadge.textContent =
      `${state.tree?.fileCount || 0} FILES IN BLUEPRINT`;

    els.projectOrigin.textContent =
      state.demo ? "DEMO PREVIEW — SAMPLE DATA" : "PHASE 3 BLUEPRINT";

    els.projectStateText.textContent =
      state.demo ? "Demo preview only" : "Blueprint imported";

    els.projectStateDot.className =
      `status-dot ${state.demo ? "warning" : ""}`;

    els.sidebarBlueprintStatus.textContent =
      state.demo ? "Demo" : "Loaded";

    els.sidebarBuildStatus.textContent = "Not started";
    els.sidebarScanStatus.textContent = "Not tested";

    els.exportProject.disabled = state.demo;
    els.buildButton.disabled = state.demo;
    els.scanButton.disabled = state.demo;

    els.projectFileCount.title =
      `${state.tree?.folderCount || 0} folders · ${state.tree?.fileCount || 0} files`;

    els.footerStatus.textContent = state.demo
      ? "Demo preview — no backend actions"
      : `Project ${p.id || state.projectId}`;
  }

  // ---------- Navigation and project views ----------

  function setActiveView(view) {
    if (!views.includes(view)) return;

    state.activeView = view;

    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === view;

      button.classList.toggle("is-active", active);

      if (button.classList.contains("workspace-tab")) {
        button.setAttribute("aria-selected", String(active));
      }

      if (button.classList.contains("nav-item")) {
        if (active) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      }
    });

    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === view;

      panel.hidden = !active;
      panel.classList.toggle("is-visible", active);
    });

    announce(`${view} workspace opened.`);
  }

  function bindNavigation() {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveView(button.dataset.view);
      });
    });

    document.querySelectorAll(".workspace-tab[role='tab']").forEach((tab) => {
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }

        const tabs = [
          ...document.querySelectorAll(".workspace-tab[role='tab']")
        ];

        const currentIndex = tabs.indexOf(tab);
        let nextIndex = currentIndex;

        if (event.key === "ArrowRight") {
          nextIndex = (currentIndex + 1) % tabs.length;
        }

        if (event.key === "ArrowLeft") {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        }

        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;

        event.preventDefault();
        tabs[nextIndex].focus();
        setActiveView(tabs[nextIndex].dataset.view);
      });
    });

    $("openSecurityBtn").addEventListener("click", () => {
      setActiveView("security");
    });
  }

  // ---------- File explorer ----------

  function fileIconText(path) {
    const ext = String(path).split(".").pop().toLowerCase();

    const marks = {
      py: "Py",
      html: "<>",
      css: "#",
      js: "JS",
      ts: "TS",
      json: "{}",
      sql: "DB",
      md: "M",
      env: "•"
    };

    return marks[ext] || "·";
  }

  function renderFileNode(node, container, depth = 0) {
    if (node.type === "folder") {
      const wrapper = makeElement("div", "tree-node");

      const button = makeElement("button", "tree-folder");
      button.type = "button";
      button.style.paddingLeft = `${7 + depth * 8}px`;
      button.setAttribute("aria-expanded", "true");

      const caret = makeElement("span", "folder-caret", "⌄");
      const icon = makeElement("span", "file-type-mark", "▰");
      const label = makeElement("span", "tree-folder-label", node.name);

      button.append(caret, icon, label);

      const childContainer = makeElement("div", "tree-indent");

      node.children.forEach((child) => {
        renderFileNode(child, childContainer, depth + 1);
      });

      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") !== "false";

        button.setAttribute("aria-expanded", String(!expanded));
        childContainer.hidden = expanded;
      });

      wrapper.append(button, childContainer);
      container.append(wrapper);

      return;
    }

    const button = makeElement("button", "tree-file");

    button.type = "button";
    button.dataset.path = node.path;
    button.style.paddingLeft = `${7 + depth * 8}px`;

    const mark = makeElement("span", "file-type-mark", fileIconText(node.name));
    const label = makeElement("span", "tree-folder-label", node.name);

    button.append(mark, label);

    button.addEventListener("click", () => {
      selectFile(node.path);
    });

    container.append(button);
  }

  function renderFileTree(filter = "") {
    els.fileTree.replaceChildren();

    if (!state.tree?.root) {
      els.fileTree.append(
        makeElement("p", "muted-empty", "No project structure is available.")
      );

      els.fileTreeCount.textContent = "0 ITEMS";
      return;
    }

    const query = filter.trim().toLowerCase();

    let visibleFiles = 0;
    let visibleFolders = 0;

    function filteredClone(node) {
      if (node.type === "file") {
        const matches = !query || node.path.toLowerCase().includes(query);

        if (matches) visibleFiles += 1;

        return matches ? node : null;
      }

      const children = node.children
        .map(filteredClone)
        .filter(Boolean);

      const matchesSelf =
        !query ||
        node.name.toLowerCase().includes(query) ||
        children.length > 0;

      if (matchesSelf && node.name !== state.project.rootName) {
        visibleFolders += 1;
      }

      return matchesSelf
        ? { ...node, children }
        : null;
    }

    const filtered = state.tree.root.children
      .map(filteredClone)
      .filter(Boolean);

    if (!filtered.length) {
      els.fileTree.append(
        makeElement(
          "p",
          "muted-empty",
          query
            ? "No files match that filter."
            : "This blueprint has no file entries."
        )
      );
    } else {
      filtered.forEach((node) => {
        renderFileNode(node, els.fileTree);
      });
    }

    els.fileTreeCount.textContent =
      `${visibleFiles} FILES · ${visibleFolders} FOLDERS`;

    updateSelectedFileStyle();
  }

  function updateSelectedFileStyle() {
    document.querySelectorAll(".tree-file").forEach((button) => {
      const selected = button.dataset.path === state.selectedFilePath;

      button.classList.toggle("is-selected", selected);

      if (selected) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function selectFile(path) {
    const safePath = escapePath(path);

    if (!safePath) return;

    state.selectedFilePath = safePath;

    const file = state.files.get(safePath);

    els.selectedFileName.textContent = safePath.split("/").pop();
    els.fileLanguageBadge.textContent = file?.language || fileLanguage(safePath);

    els.filePreviewEmpty.hidden =
      Boolean(file && file.content.length > 0);

    els.fileCodePreview.hidden =
      !(file && file.content.length > 0);

    els.fileCodeContent.textContent = file?.content || "";

    els.filePreviewStatus.textContent = file
      ? (
          file.content
            ? `${file.status.toUpperCase()} · ${file.content.length.toLocaleString()} CHARACTERS`
            : "File is in blueprint; source content not generated yet"
        )
      : "Blueprint entry only — source content not generated yet";

    els.copyFile.disabled = !(file && file.content.length > 0);

    if (!file || !file.content) {
      els.filePreviewEmpty.querySelector("strong").textContent =
        "Source not generated yet";

      els.filePreviewEmpty.querySelector("p").textContent =
        "This path is part of the Phase 3 blueprint. Its contents will appear after the code-generation job returns the file source.";
    } else {
      els.filePreviewEmpty.querySelector("strong").textContent =
        "Select a file to preview";

      els.filePreviewEmpty.querySelector("p").textContent =
        "Blueprint entries show the intended project structure. Source preview becomes available after code generation.";
    }

    updateSelectedFileStyle();
  }

  // ---------- Activity and agent progress ----------

  function addActivity(
    title,
    description,
    icon = "✦",
    timestamp = new Date().toISOString()
  ) {
    state.activity.unshift({
      title,
      description,
      icon,
      timestamp
    });

    state.activity = state.activity.slice(0, 30);

    renderActivity();
  }

  function renderActivity() {
    els.timeline.replaceChildren();

    if (!state.activity.length) {
      els.timeline.append(
        makeElement(
          "li",
          "activity-empty",
          "No activity yet. Build the project or run a security assessment to start the timeline."
        )
      );

      return;
    }

    state.activity.forEach((item) => {
      const row = makeElement("li", "activity-item");
      const marker = makeElement("span", "activity-marker", item.icon || "•");
      const copy = makeElement("div", "activity-copy");

      copy.append(
        makeElement("strong", "", item.title),
        makeElement("p", "", item.description)
      );

      const time = makeElement("time", "", formatTime(item.timestamp));

      row.append(marker, copy, time);
      els.timeline.append(row);
    });
  }

  function renderAgentSteps(stage = "idle", progress = 0) {
    const stages = [
      {
        key: "reading",
        title: "Read project blueprint",
        detail: "Load requirements, stack and project structure"
      },
      {
        key: "planning",
        title: "Plan implementation",
        detail: "Identify files and implementation dependencies"
      },
      {
        key: "generating",
        title: "Generate source code",
        detail: "Create and organise project files"
      },
      {
        key: "validating",
        title: "Validate the project",
        detail: "Check syntax, imports and project consistency"
      }
    ];

    const stageIndexMap = {
      queued: 0,
      reading: 0,
      planning: 1,
      generating: 2,
      writing: 2,
      validating: 3,
      testing: 3,
      completed: 4,
      succeeded: 4
    };

    const current =
      stageIndexMap[stage] ??
      (stage === "idle" ? -1 : 0);

    els.agentSteps.replaceChildren();

    stages.forEach((item, index) => {
      const li = makeElement(
        "li",
        `agent-step ${
          index < current
            ? "is-done"
            : index === current
              ? "is-active"
              : "is-idle"
        }`
      );

      const marker = makeElement(
        "span",
        "step-marker",
        index < current ? "✓" : `0${index + 1}`
      );

      const copy = makeElement("div", "");

      copy.append(
        makeElement("strong", "", item.title),
        makeElement("small", "", item.detail)
      );

      const status = makeElement(
        "span",
        "step-state",
        index < current
          ? "DONE"
          : index === current
            ? "RUNNING"
            : "WAITING"
      );

      li.append(marker, copy, status);
      els.agentSteps.append(li);
    });

    const clamped = Math.max(0, Math.min(100, Number(progress) || 0));

    els.agentProgressFill.style.width = `${clamped}%`;
    els.agentProgressText.textContent = `${Math.round(clamped)}%`;
  }

  function setAgentState(label, mode = "neutral", message = "") {
    els.agentBadge.className = `state-pill ${mode}`;

    const dot = makeElement(
      "span",
      `status-dot ${
        mode === "running"
          ? "warning"
          : mode === "success"
            ? ""
            : "muted"
      }`
    );

    els.agentBadge.replaceChildren(
      dot,
      document.createTextNode(` ${label.toUpperCase()}`)
    );

    if (message) {
      els.agentMessage.textContent = message;
    }
  }

  function setBuildBusy(busy, kind = state.activeJob?.kind || "build") {
    const isBuild = busy && kind === "build";
    const isScan = busy && kind === "security";

    els.buildButton.disabled =
      busy || state.demo || !state.projectLoaded;

    els.buildButton.classList.toggle("is-loading", isBuild);

    els.buildButton.querySelector(".button-label").textContent =
      isBuild ? "Generating…" : "Generate code";

    els.scanButton.disabled =
      busy || state.demo || !state.projectLoaded;

    els.scanButton.classList.toggle("is-loading", isScan);

    els.scanButton.querySelector(".button-label").textContent =
      isScan ? "Assessment running…" : "Run security assessment";

    els.cancelJob.hidden =
      !isBuild || !state.activeJob?.id;

    els.cancelSecurityJob.hidden =
      !isScan || !state.activeJob?.id;

    if (busy) {
      setAgentState(
        isScan ? "Scanning" : "Working",
        "running",
        isScan
          ? "Security checks are running. Findings will be displayed when the backend job completes."
          : "The agent is processing the project. Progress is reported by the backend job status."
      );

      renderAgentSteps("queued", 4);
    }
  }

  function syncJobControls() {
    const kind = state.activeJob?.kind || "";
    const busy = Boolean(state.activeJob);

    els.buildButton.disabled =
      busy || state.demo || !state.projectLoaded;

    els.buildButton.classList.toggle(
      "is-loading",
      kind === "build"
    );

    els.buildButton.querySelector(".button-label").textContent =
      kind === "build" ? "Generating…" : "Generate code";

    els.scanButton.disabled =
      busy || state.demo || !state.projectLoaded;

    els.scanButton.classList.toggle(
      "is-loading",
      kind === "security"
    );

    els.scanButton.querySelector(".button-label").textContent =
      kind === "security"
        ? "Assessment running…"
        : "Run security assessment";

    els.cancelJob.hidden =
      !(kind === "build" && state.activeJob?.id);

    els.cancelSecurityJob.hidden =
      !(kind === "security" && state.activeJob?.id);
  }

  function applyGeneratedFiles(payload) {
    const result =
      payload?.result ||
      payload?.output ||
      payload?.data ||
      payload;

    const files =
      result?.generated_files ||
      result?.files ||
      result?.output_files ||
      result?.artifacts ||
      [];

    if (Array.isArray(files) && files.length) {
      const merged = new Map(state.files);

      files.forEach((item) => {
        if (!item || typeof item !== "object") return;

        const path = escapePath(item.path || item.filename || "");

        if (!path) return;

        merged.set(path, {
          path,
          content:
            typeof item.content === "string"
              ? item.content
              : typeof item.code === "string"
                ? item.code
                : "",
          language: text(item.language, fileLanguage(path)),
          status: text(item.status, "Generated")
        });
      });

      state.files = merged;
    }

    const newStructure =
      result?.structure?.folders ||
      result?.folders;

    if (Array.isArray(newStructure) && newStructure.length) {
      const combined = new Map();

      (state.project?.folders || []).forEach((entry) => {
        const path =
          typeof entry === "string"
            ? entry
            : entry?.path;

        if (path) combined.set(path, entry);
      });

      newStructure.forEach((entry) => {
        const path =
          typeof entry === "string"
            ? entry
            : entry?.path;

        if (path) combined.set(path, entry);
      });

      state.project.folders = [...combined.values()];

      state.tree = buildTreeModel(
        state.project.folders,
        state.project.rootName
      );

      renderFileTree(els.fileSearch.value);
    }

    els.projectFileCount.textContent =
      `${state.tree?.fileCount || state.files.size} files`;

    els.exportProject.disabled =
      state.demo || state.files.size === 0;

    if (state.files.size) {
      const first = state.files.keys().next().value;
      selectFile(first);
    }
  }


  
// ---------- Generic background job handling ----------

function clearJobPolling() {
  if (state.pollTimer) {
    window.clearTimeout(state.pollTimer);
  }

  state.pollTimer = null;

  if (state.jobController) {
    state.jobController.abort();
  }

  state.jobController = null;
}

function jobStage(data) {
  return String(
    data?.stage ||
    data?.step ||
    data?.current_step ||
    data?.status ||
    "queued"
  ).toLowerCase();
}

function jobProgress(data) {
  if (Number.isFinite(Number(data?.progress))) {
    return Number(data.progress);
  }

  const stage = jobStage(data);

  const map = {
    queued: 5,
    reading: 15,
    planning: 30,
    generating: 55,
    writing: 68,
    validating: 82,
    testing: 90,
    completed: 100,
    succeeded: 100
  };

  return map[stage] ?? 12;
}

function jobIsComplete(data) {
  return [
    "completed",
    "complete",
    "succeeded",
    "success",
    "done"
  ].includes(String(data?.status || "").toLowerCase());
}

function jobIsFailed(data) {
  return [
    "failed",
    "error",
    "cancelled",
    "canceled",
    "rejected"
  ].includes(String(data?.status || "").toLowerCase());
}

async function beginJob({ kind, path, body }) {
  clearJobPolling();
  state.pollCount = 0;

  setInlineError(els.buildError, "");
  setBuildBusy(true, kind);

  try {
    const { data } = await apiRequest(path, {
      method: "POST",
      body
    });

    const immediate =
      data?.result ||
      data?.output ||
      data;

    const jobId =
      data?.job_id ||
      data?.jobId ||
      immediate?.job_id;

    if (
      !jobId &&
      (
        kind === "build"
          ? (
              immediate?.generated_files ||
              immediate?.files ||
              immediate?.output_files
            )
          : (
              immediate?.findings ||
              immediate?.security_report
            )
      )
    ) {
      await finishJob(kind, immediate);
      return;
    }

    if (!jobId) {
      throw new Error(
        "The Phase 4 API did not return a job_id or an immediate result. Expected a job-based response."
      );
    }

    state.activeJob = {
      id: String(jobId),
      kind
    };

    syncJobControls();
    state.pollCount = 0;

    addActivity(
      kind === "build"
        ? "Code generation started"
        : "Security assessment started",
      `Job ${jobId} was accepted by the Phase 4 backend.`,
      kind === "build" ? "⌘" : "◇"
    );

    els.agentMessage.textContent = text(
      data?.message,
      "The backend accepted the job. Waiting for progress updates…"
    );

    pollJob();

  } catch (error) {
    setBuildBusy(false);

    setAgentState(
      "Error",
      "neutral",
      friendlyApiError(error)
    );

    if (kind === "build") {
      setInlineError(
        els.buildError,
        friendlyApiError(error)
      );
    } else {
      showToast(friendlyApiError(error), "error");
    }

    addActivity(
      kind === "build"
        ? "Code generation could not start"
        : "Security assessment could not start",
      friendlyApiError(error),
      "!"
    );
  }
}

async function pollJob() {
  if (!state.activeJob) return;

  if (state.pollCount >= JOB_MAX_POLLS) {
    const kind = state.activeJob.kind;

    state.activeJob = null;
    clearJobPolling();

    setBuildBusy(false);
    syncJobControls();

    setAgentState(
      "Timed out",
      "neutral",
      "The browser stopped waiting after six minutes. Check the job on the backend before starting another one."
    );

    if (kind === "build") {
      setInlineError(
        els.buildError,
        "The job did not finish within the browser's polling window. It may still be running on the server; check job status before retrying."
      );
    } else {
      showToast(
        "Security scan polling timed out. Check the backend job status.",
        "error"
      );
    }

    return;
  }

  state.pollCount += 1;

  const job = state.activeJob;

  state.jobController = new AbortController();

  try {
    const { data } = await apiRequest(
      API.job(job.id),
      {
        method: "GET",
        signal: state.jobController.signal
      }
    );

    if (
      !state.activeJob ||
      state.activeJob.id !== job.id
    ) {
      return;
    }

    const progress = jobProgress(data);
    const stage = jobStage(data);

    renderAgentSteps(stage, progress);

    els.agentMessage.textContent = text(
      data?.message || data?.detail,
      `Job status: ${text(data?.status, stage)}.`
    );

    setAgentState(
      text(data?.status, "Running"),
      jobIsComplete(data) ? "success" : "running"
    );

    if (jobIsComplete(data)) {
      state.activeJob = null;
      clearJobPolling();

      await finishJob(
        job.kind,
        data?.result || data?.output || data
      );

      return;
    }

    if (jobIsFailed(data)) {
      state.activeJob = null;

      clearJobPolling();
      setBuildBusy(false);
      syncJobControls();

      setAgentState(
        "Failed",
        "neutral",
        text(
          data?.error || data?.message,
          "The backend job did not complete."
        )
      );

      if (job.kind === "build") {
        setInlineError(
          els.buildError,
          friendlyApiError(
            new Error(
              text(
                data?.error || data?.message,
                "Code generation failed."
              )
            )
          )
        );
      } else {
        showToast(
          text(
            data?.error || data?.message,
            "Security scan failed."
          ),
          "error"
        );
      }

      addActivity(
        job.kind === "build"
          ? "Code generation failed"
          : "Security assessment failed",
        text(
          data?.error || data?.message,
          "The job did not complete."
        ),
        "!"
      );

      return;
    }

    state.pollTimer = window.setTimeout(
      pollJob,
      JOB_POLL_INTERVAL_MS
    );

  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    state.jobController = null;

    state.pollTimer = window.setTimeout(
      pollJob,
      JOB_POLL_INTERVAL_MS
    );

    els.agentMessage.textContent =
      `Temporary status-check error. Retrying: ${friendlyApiError(error)}`;
  }
}

async function finishJob(kind, result) {
  setBuildBusy(false);
  syncJobControls();

  if (kind === "build") {
    applyGeneratedFiles(result);

    renderAgentSteps("completed", 100);

    setAgentState(
      "Completed",
      "success",
      "Code generation completed. Review the generated files before using or deploying them."
    );

    els.sidebarBuildStatus.textContent =
      state.files.size ? "Generated" : "Completed";

    els.projectStateText.textContent = "Code generated";
    els.projectStateDot.className = "status-dot";

    setInlineError(els.buildError, "");

    addActivity(
      "Code generation completed",
      `${state.files.size} source files are available for review.`,
      "⌘"
    );

    showToast(
      "Code generation completed. Review the generated files.",
      "success"
    );

    els.exportProject.disabled =
      state.demo || state.files.size === 0;

    setActiveView("files");
    return;
  }

  const reportCandidate =
    result?.security_report ||
    result?.report ||
    result;

  state.report = normalizeReport(reportCandidate);

  renderSecurityReport();

  setAgentState(
    "Scan complete",
    "success",
    "The assessment completed. Review findings and checks that remain untested."
  );

  els.sidebarScanStatus.textContent = "Completed";
  els.assessmentStatus.textContent = "Assessment complete";
  els.assessmentSubtext.textContent =
    "Review the findings and coverage below.";

  els.assessmentIcon.classList.add("is-success");

  addActivity(
    "Security assessment completed",
    `${state.findings.length} findings were returned by the backend.`,
    "◇",
    state.report.generatedAt
  );

  showToast(
    "Security assessment completed.",
    "success"
  );

  setActiveView("security");
}

async function cancelCurrentJob() {
  if (!state.activeJob) return;

  const job = state.activeJob;

  clearJobPolling();

  state.activeJob = null;

  setBuildBusy(false);
  syncJobControls();

  setAgentState(
    "Cancel requested",
    "neutral",
    "The browser stopped polling. The backend must implement job cancellation to guarantee server-side termination."
  );

  els.agentMessage.textContent =
    "Cancellation requested; server-side termination is not confirmed.";

  try {
    await apiRequest(
      API.cancelJob(job.id),
      {
        method: "POST",
        body: {}
      }
    );

    els.agentMessage.textContent =
      "The backend acknowledged the cancellation request.";

  } catch {
    // The cancel route is optional until implemented.
    // Do not claim the job stopped.
  }

  addActivity(
    "Cancellation requested",
    `The browser stopped waiting for job ${job.id}; server termination may require backend confirmation.`,
    "Ⅱ"
  );

  showToast(
    "Cancellation requested. Server-side termination is not yet confirmed.",
    "info"
  );
}

// ---------- Security report ----------

function normalizeReport(report) {
  const findings = Array.isArray(report?.findings)
    ? report.findings
    : Array.isArray(report?.issues)
      ? report.issues
      : [];

  const coverageRaw =
    report?.coverage ||
    report?.checks ||
    report?.coverage_summary ||
    [];

  const coverage = Array.isArray(coverageRaw)
    ? coverageRaw
    : Object.entries(coverageRaw).map(
        ([category, value]) =>
          typeof value === "object"
            ? { category, ...value }
            : { category, status: value }
      );

  return {
    status: text(report?.status, "completed"),

    generatedAt:
      report?.generated_at ||
      report?.created_at ||
      new Date().toISOString(),

    findings,
    coverage,
    raw: report
  };
}

function severityClass(value) {
  const severity = String(value || "informational").toLowerCase();

  return [
    "critical",
    "high",
    "medium",
    "low",
    "informational"
  ].includes(severity)
    ? severity
    : "informational";
}

function countNotTested(coverage) {
  return coverage.filter((item) =>
    String(item.status || item.result || "")
      .toLowerCase()
      .replace(/[_-]/g, " ") === "not tested"
  ).length;
}

function renderSecurityReport() {
  const report = state.report;

  if (!report) return;

  state.findings = report.findings
    .filter((finding) => finding && typeof finding === "object")
    .map((finding, index) => ({
      id: text(
        finding.id || finding.finding_id,
        `finding-${index + 1}`
      ),

      title: text(
        finding.title || finding.name,
        "Untitled security finding"
      ),

      severity: severityClass(finding.severity),

      confidence: text(
        finding.confidence,
        "Not provided"
      ),

      status: text(
        finding.status,
        "open"
      ).toLowerCase(),

      file: text(
        finding.file ||
        finding.path ||
        finding.affected_asset,
        "Location not provided"
      ),

      line:
        finding.line ||
        finding.line_number ||
        finding.start_line ||
        "",

      description: text(
        finding.description || finding.evidence,
        "The backend did not provide a description."
      ),

      attack: text(
        finding.attack_scenario || finding.impact,
        "No attack scenario was provided."
      ),

      recommendation: text(
        finding.recommendation ||
        finding.remediation ||
        finding.fix,
        "No remediation guidance was provided."
      ),

      cwe: text(
        finding.cwe || finding.cwe_id,
        ""
      ),

      owasp: text(
        finding.owasp || finding.owasp_category,
        ""
      ),

      raw: finding
    }));

  state.coverage = report.coverage;

  const criticalHigh = state.findings.filter(
    (f) => ["critical", "high"].includes(f.severity)
  ).length;

  const mediumLow = state.findings.filter(
    (f) => ["medium", "low"].includes(f.severity)
  ).length;

  els.criticalHigh.textContent = String(criticalHigh);
  els.mediumLow.textContent = String(mediumLow);

  els.notTested.textContent =
    String(countNotTested(state.coverage));

  els.findingsSummary.textContent =
    `${state.findings.length} findings returned · ${state.coverage.length} coverage records received.`;

  els.lastScan.textContent =
    `Last scan: ${formatTime(report.generatedAt)}`;

  const passed = state.coverage.filter(
    (item) =>
      String(item.status || item.result || "").toLowerCase() === "passed"
  ).length;

  els.coverageText.textContent =
    `Coverage: ${passed} checks passed`;

  els.reportSummaryTitle.textContent =
    state.findings.length
      ? "Security report ready"
      : "Assessment completed";

  els.reportSummaryText.textContent =
    state.findings.length
      ? `${state.findings.length} findings were returned. Review evidence, severity and untested areas before deployment.`
      : "No findings were returned by the checks that ran. This is not a guarantee that the application is secure.";

  els.reportDate.textContent =
    `DATE ${formatTime(report.generatedAt)}`;

  els.reportFindings.textContent =
    `${state.findings.length} FINDINGS`;

  els.downloadReport.disabled = false;

  renderFindings();
  renderCoverage();
}

function renderFindings() {
  els.findingsList.replaceChildren();

  const severity = els.severityFilter.value;
  const status = els.findingStatusFilter.value;

  const filtered = state.findings.filter((finding) => {
    const severityMatch =
      severity === "all" ||
      finding.severity === severity;

    const statusMatch =
      status === "all" ||
      finding.status.replace(/[_-]/g, " ") === status;

    return severityMatch && statusMatch;
  });

  if (!filtered.length) {
    const empty = makeElement("div", "findings-empty");

    empty.append(
      makeElement("span", "empty-shield", "◇")
    );

    empty.append(
      makeElement(
        "strong",
        "",
        state.findings.length
          ? "No findings match these filters"
          : "No findings returned"
      )
    );

    empty.append(
      makeElement(
        "p",
        "",
        state.findings.length
          ? "Change the severity or status filters to see more results."
          : "The backend returned no findings. Confirm that the intended checks actually ran and review coverage before treating this as a clean result."
      )
    );

    els.findingsList.append(empty);
    return;
  }

  filtered.forEach((finding) => {
    const row = makeElement("article", "finding-row");

    const main = makeElement("div", "finding-main");

    const marker = makeElement(
      "span",
      `finding-severity-mark ${finding.severity}`
    );

    const copy = makeElement("div", "finding-copy");
    const titleLine = makeElement("div", "finding-title-line");

    titleLine.append(
      makeElement("strong", "", finding.title)
    );

    titleLine.append(
      makeElement(
        "span",
        `severity-badge ${finding.severity}`,
        finding.severity
      )
    );

    copy.append(titleLine);

    copy.append(
      makeElement(
        "p",
        "",
        truncate(finding.description, 210)
      )
    );

    const meta = makeElement("div", "finding-meta");

    meta.append(
      makeElement("span", "", finding.id)
    );

    meta.append(
      makeElement(
        "span",
        "",
        finding.file + (finding.line ? `:${finding.line}` : "")
      )
    );

    meta.append(
      makeElement(
        "span",
        "",
        `CONFIDENCE ${finding.confidence.toUpperCase()}`
      )
    );

    copy.append(meta);
    main.append(marker, copy);

    const actions = makeElement("div", "finding-actions");

    const detailButton = makeElement(
      "button",
      "finding-action",
      "View details"
    );

    detailButton.type = "button";

    detailButton.addEventListener("click", () => {
      openFinding(finding);
    });

    actions.append(detailButton);
    row.append(main, actions);

    els.findingsList.append(row);
  });
}

function renderCoverage() {
  els.coverageList.replaceChildren();

  if (!state.coverage.length) {
    els.coverageList.append(
      makeElement(
        "div",
        "coverage-placeholder",
        "No coverage details were returned. The report should not assume unreported checks passed."
      )
    );

    return;
  }

  state.coverage.forEach((item) => {
    const status = String(
      item.status || item.result || "not tested"
    )
      .toLowerCase()
      .replace(/[_ ]/g, "-");

    const label = text(
      item.category || item.name || item.check,
      "Security check"
    );

    const row = makeElement("div", "coverage-item");

    row.append(
      makeElement("span", "", label)
    );

    row.append(
      makeElement(
        "span",
        `coverage-status ${status}`,
        status.replace(/-/g, " ")
      )
    );

    els.coverageList.append(row);
  });
}

// ---------- Vulnerability detail modal ----------

function openFinding(finding) {
  state.currentFinding = finding;
  state.previousModalFocus = document.activeElement;

  els.findingModalTitle.textContent = finding.title;

  els.modalSeverity.className =
    `severity-badge ${finding.severity}`;

  els.modalSeverity.textContent = finding.severity;

  els.modalLocation.textContent =
    `${finding.file}${finding.line ? `:${finding.line}` : ""} · ${finding.id} · Confidence: ${finding.confidence}`;

  els.modalEvidence.textContent = finding.description;
  els.modalImpact.textContent = finding.attack;
  els.modalFix.textContent = finding.recommendation;

  els.patchPreview.hidden = true;
  els.patchPreviewText.textContent = "";

  els.fixMessage.textContent =
    "The agent can prepare a proposed patch. A proposal is not applied automatically.";

  els.requestFix.disabled =
    state.demo || !state.projectId;

  els.requestFix.textContent =
    state.demo
      ? "Unavailable in demo"
      : "Request fix proposal";

  els.findingModal.hidden = false;

  document.body.classList.add("modal-open");

  els.closeFindingModal.focus();
}

function closeFinding() {
  els.findingModal.hidden = true;

  document.body.classList.remove("modal-open");

  if (state.previousModalFocus?.focus) {
    state.previousModalFocus.focus();
  }

  state.currentFinding = null;
}

async function requestFixProposal() {
  const finding = state.currentFinding;

  if (!finding || state.demo) return;

  els.requestFix.disabled = true;
  els.requestFix.textContent = "Preparing proposal…";

  els.fixMessage.textContent =
    "Requesting a fix proposal from the Phase 4 backend…";

  try {
    const { data } = await apiRequest(
      API.fix(state.projectId, finding.id),
      {
        method: "POST",
        body: {
          action: "propose",
          finding_id: finding.id
        }
      }
    );

    const proposal =
      data?.proposal ||
      data?.patch ||
      data?.result ||
      data;

    const patchText =
      typeof proposal === "string"
        ? proposal
        : text(
            proposal?.diff ||
            proposal?.patch ||
            proposal?.code ||
            proposal?.content,
            "The backend returned a proposal without a textual diff."
          );

    els.patchPreviewText.textContent = patchText;
    els.patchPreview.hidden = false;

    els.fixMessage.textContent = text(
      data?.message,
      "Fix proposal prepared. Review the patch before any approval or application step."
    );

    els.requestFix.textContent = "Proposal prepared";

    showToast(
      "Fix proposal received. It has not been applied.",
      "success"
    );

    addActivity(
      "Fix proposal prepared",
      `A proposal was returned for ${finding.id}. No source files were changed by this action.`,
      "✎"
    );

  } catch (error) {
    els.fixMessage.textContent = friendlyApiError(error);
    els.requestFix.textContent = "Request fix proposal";

    showToast(
      friendlyApiError(error),
      "error"
    );

  } finally {
    els.requestFix.disabled = false;
  }
}


// ---------- User actions ----------

async function generateCode() {
  if (
    !state.projectLoaded ||
    state.demo ||
    state.activeJob
  ) {
    return;
  }

  const prompt = els.prompt.value.trim();

  if (prompt.length < 8) {
    setInlineError(
      els.buildError,
      "Describe the implementation task before generating code, or choose one of the suggested tasks."
    );

    els.prompt.focus();
    return;
  }

  if (prompt.length > 12000) {
    setInlineError(
      els.buildError,
      "The implementation instructions exceed the 12,000-character limit."
    );

    return;
  }

  await beginJob({
    kind: "build",
    path: API.generate(state.projectId),

    body: {
      prompt,
      mode: "build",
      source_phase: 3,
      project_id: state.projectId,

      project_context: {
        original_idea: state.project.idea,
        framework: state.project.framework,
        database: state.project.database,
        root_name: state.project.rootName,
        project_summary: state.project.summary,
        folders: state.project.folders,
        master_prompt: state.project.masterPrompt
      }
    }
  });
}

async function runSecurityScan() {
  if (
    !state.projectLoaded ||
    state.demo ||
    state.activeJob
  ) {
    return;
  }

  els.scanButton.disabled = true;
  els.scanButton.classList.add("is-loading");

  els.scanButton.querySelector(".button-label").textContent =
    "Starting assessment…";

  try {
    await beginJob({
      kind: "security",
      path: API.scan(state.projectId),

      body: {
        scope: "project",
        profile: "baseline",
        source_phase: 4,
        authorization: "user_project"
      }
    });

  } finally {
    syncJobControls();
  }
}

async function refreshSecurityReport() {
  if (!state.projectId || state.demo) return;

  try {
    const { data } = await apiRequest(
      API.report(state.projectId),
      { method: "GET" }
    );

    state.report = normalizeReport(
      data?.security_report ||
      data?.report ||
      data
    );

    renderSecurityReport();

  } catch (error) {
    if (error.status !== 404) {
      showToast(friendlyApiError(error), "error");
    }
  }
}

async function exportProject() {
  if (!state.projectId || state.demo) return;

  els.exportProject.disabled = true;

  try {
    const token = getAuthToken();

    if (!token) {
      throw new Error("Your sign-in session is missing.");
    }

    const response = await fetch(
      `${API_BASE_URL}${API.exportProject(state.projectId)}`,
      {
        method: "GET",

        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/zip, application/octet-stream, application/json"
        },

        credentials: "omit"
      }
    );

    if (!response.ok) {
      const data = await parseResponse(response);

      throw new Error(
        text(
          data.error || data.message,
          `Export failed with HTTP ${response.status}.`
        )
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `${state.project.rootName || "phase4-project"}.zip`;

    document.body.append(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showToast(
      "Project export downloaded.",
      "success"
    );

    addActivity(
      "Project exported",
      "A project archive was downloaded.",
      "↓"
    );

  } catch (error) {
    showToast(
      friendlyApiError(error),
      "error"
    );

  } finally {
    els.exportProject.disabled = false;
  }
}

function exportSecurityReport() {
  if (!state.report) return;

  const payload = {
    schema_version: "phase4.security-report.v1",
    project_id: state.projectId,
    project_name: getProjectDisplayName(),
    generated_at: state.report.generatedAt,
    status: state.report.status,

    findings: state.findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      confidence: finding.confidence,
      status: finding.status,
      file: finding.file,
      line: finding.line,
      evidence: finding.description,
      attack_scenario: finding.attack,
      recommendation: finding.recommendation,
      cwe: finding.cwe,
      owasp: finding.owasp
    })),

    coverage: state.coverage
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;

  link.download =
    `${state.project?.rootName || "project"}-security-report.json`;

  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  showToast(
    "Security report exported as JSON.",
    "success"
  );
}

async function copySelectedFile() {
  const file = state.files.get(state.selectedFilePath);

  if (!file?.content) return;

  try {
    await navigator.clipboard.writeText(file.content);

    showToast(
      "File contents copied.",
      "success"
    );

  } catch {
    showToast(
      "Clipboard access was blocked. Select the file text and copy it manually.",
      "error"
    );
  }
}

// ---------- Project loading ----------

function showEmptyState(message = "", tone = "error") {
  els.empty.hidden = false;
  els.workspace.hidden = true;

  setInlineError(els.emptyError, message);

  els.emptyError.classList.toggle(
    "is-neutral",
    tone === "neutral"
  );
}

function showWorkspace() {
  els.empty.hidden = true;
  els.workspace.hidden = false;
}

async function loadProject() {
  setInlineError(els.emptyError, "");

  // Explicit demo mode: no backend request, no real project data.
  if (state.demo) {
    const sample = getDemoProject();

    state.projectId = sample.project_id;
    state.project = normalizeProject(sample);

    state.tree = buildTreeModel(
      state.project.folders,
      state.project.rootName
    );

    loadGeneratedFiles(state.project.generatedFiles);

    state.projectLoaded = true;

    els.connection.lastChild.textContent = " DEMO MODE";

    setConnection("Demo preview", "neutral");

    showWorkspace();
    renderProjectSummary();
    renderFileTree();

    if (state.files.size) {
      selectFile(state.files.keys().next().value);
    }

    state.report = normalizeReport(
      sample.security_report
    );

    renderSecurityReport();

    els.assessmentStatus.textContent = "Sample report";

    els.assessmentSubtext.textContent =
      "These are illustrative findings, not scan results.";

    els.assessmentIcon.classList.add("is-warning");

    els.lastScan.textContent = "Last scan: DEMO DATA";
    els.sidebarScanStatus.textContent = "Demo only";

    els.findingsSummary.textContent =
      "Sample findings for interface preview only — no scanner was run.";

    els.reportSummaryTitle.textContent =
      "Demo report preview";

    els.reportSummaryText.textContent =
      "Illustrative sample data. This is not a security assessment of a real project.";

    els.projectOrigin.textContent =
      "DEMO PREVIEW — SAMPLE DATA";

    els.footerStatus.textContent =
      "Demo mode · API actions disabled";

    addActivity(
      "Demo workspace opened",
      "Sample project content is displayed for interface preview only.",
      "◈",
      new Date().toISOString()
    );

    return;
  }

  // A real project requires a server-generated project ID.
  if (!state.projectId) {
    showEmptyState();

    setConnection("No project", "neutral");

    return;
  }

  showEmptyState(
    "Loading your saved Phase 3 blueprint…",
    "neutral"
  );

  setConnection("Loading", "neutral");

  try {
    const { data } = await apiRequest(
      API.project(state.projectId),
      { method: "GET" }
    );

    state.project = normalizeProject(data);

    if (!state.project.id) {
      state.project.id = state.projectId;
    }

    if (!state.project.folders.length) {
      throw new Error(
        "The saved blueprint was found, but it did not contain a structured folders array. Phase 4 needs the Phase 3 folder manifest, not only the ASCII tree preview."
      );
    }

    state.tree = buildTreeModel(
      state.project.folders,
      state.project.rootName
    );

    loadGeneratedFiles(
      state.project.generatedFiles
    );

    state.projectLoaded = true;

    state.report = state.project.report
      ? normalizeReport(state.project.report)
      : null;

    showWorkspace();

    setConnection("Connected", "online");

    renderProjectSummary();
    renderFileTree();

    if (state.files.size) {
      selectFile(state.files.keys().next().value);
    }

    renderActivity();

    if (state.report) {
      renderSecurityReport();
    } else {
      els.criticalHigh.textContent = "—";
      els.mediumLow.textContent = "—";
      els.notTested.textContent = "—";
    }

    await refreshSecurityReport();

    addActivity(
      "Phase 3 blueprint imported",
      `${state.project.framework} · ${state.project.database} · ${state.tree.fileCount} planned files.`,
      "↗",
      state.project.createdAt || new Date().toISOString()
    );

    announce(
      `Project ${getProjectDisplayName()} loaded successfully.`
    );

  } catch (error) {
    state.projectLoaded = false;

    setConnection("Backend unavailable", "offline");

    showEmptyState(
      friendlyApiError(error)
    );

    els.emptyError.hidden = false;
  }
}

// ---------- Event wiring ----------

function bindEvents() {
  bindNavigation();

  els.refresh.addEventListener("click", loadProject);
  els.retryLoad.addEventListener("click", loadProject);

  els.prompt.addEventListener("input", () => {
    els.promptCount.textContent =
      `${els.prompt.value.length.toLocaleString()} / 12,000`;

    if (!els.buildError.hidden) {
      setInlineError(els.buildError, "");
    }
  });

  // Suggested implementation prompts.
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      els.prompt.value = button.dataset.prompt || "";

      els.prompt.dispatchEvent(
        new Event("input", { bubbles: true })
      );

      els.prompt.focus();
    });
  });

  els.buildButton.addEventListener(
    "click",
    generateCode
  );

  els.cancelJob.addEventListener(
    "click",
    cancelCurrentJob
  );

  els.cancelSecurityJob.addEventListener(
    "click",
    cancelCurrentJob
  );

  els.scanButton.addEventListener(
    "click",
    runSecurityScan
  );

  els.fileSearch.addEventListener("input", () => {
    renderFileTree(els.fileSearch.value);
  });

  els.copyFile.addEventListener(
    "click",
    copySelectedFile
  );

  els.exportProject.addEventListener(
    "click",
    exportProject
  );

  els.downloadReport.addEventListener(
    "click",
    exportSecurityReport
  );

  els.severityFilter.addEventListener(
    "change",
    renderFindings
  );

  els.findingStatusFilter.addEventListener(
    "change",
    renderFindings
  );

  // Finding details modal.
  els.closeFindingModal.addEventListener(
    "click",
    closeFinding
  );

  els.closeFindingModalSecondary.addEventListener(
    "click",
    closeFinding
  );

  els.findingModal.addEventListener("click", (event) => {
    if (event.target === els.findingModal) {
      closeFinding();
    }
  });

  els.requestFix.addEventListener(
    "click",
    requestFixProposal
  );

  document.addEventListener("keydown", (event) => {
    if (els.findingModal.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeFinding();
    }

    if (event.key === "Tab") {
      const focusable = [
        ...els.findingModal.querySelectorAll(
          "button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1'])"
        )
      ].filter(
        (element) =>
          !element.hidden &&
          element.offsetParent !== null
      );

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();

      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    clearJobPolling();
  });
}

// ---------- Initialisation ----------

function init() {
  bindEvents();

  renderActivity();
  renderAgentSteps("idle", 0);

  setAgentState(
    "Idle",
    "neutral",
    "No active task."
  );

  els.promptCount.textContent = "0 / 12,000";

  showEmptyState();

  loadProject();
}

init();

})();
