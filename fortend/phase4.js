/* ==========================================================================
   WEB / LAB — PHASE 04
   Independent AI Development & Application Security Workspace

   Workflow:
   1. User pastes a master prompt.
   2. Gemini analyses the requirements through the Phase 4 backend.
   3. Phase 4 creates a project manifest.
   4. User reviews and confirms the manifest.
   5. Gemini generates project files.
   6. Phase 4 validates generated files.
   7. Security assessment evaluates the saved source.
   8. User reviews findings and requests remediation proposals.

   This application has no Phase 3 dependency and no CENTRAL integration.

   Backend requirement:
   POST /api/phase4/projects/analyze
   must accept:
   {
       "master_prompt": "...",
       "provider_consent": true
   }

   The endpoint must return a Phase 4 project_id and analysed project
   specification/manifest. The remaining endpoints are listed below.

   ========================================================================== */

(() => {
  "use strict";

  // =========================================================================
  // 1. CONFIGURATION
  // =========================================================================

  /*
   * Configure your existing backend URL before loading this script:
   *
   * window.WEBLAB_CONFIG = {
   *     API_BASE_URL: "https://YOUR-BACKEND.onrender.com"
   * };
   *
   * Alternatively:
   * window.PHASE4_API_BASE_URL = "https://YOUR-BACKEND.onrender.com";
   *
   * If neither is configured, the current page origin is used.
   */

  const API_BASE_URL = String(
    window.WEBLAB_CONFIG?.API_BASE_URL ||
    window.PHASE4_API_BASE_URL ||
    window.location.origin
  ).replace(/\/+$/, "");

  const API = {
    analyze: "/api/phase4/projects/analyze",

    project: (id) =>
      `/api/phase4/projects/${encodeURIComponent(id)}`,

    generate: (id) =>
      `/api/phase4/projects/${encodeURIComponent(id)}/generate`,

    securityScan: (id) =>
      `/api/phase4/projects/${encodeURIComponent(id)}/security-scan`,

    securityReport: (id) =>
      `/api/phase4/projects/${encodeURIComponent(id)}/security-report`,

    job: (id) =>
      `/api/phase4/jobs/${encodeURIComponent(id)}`,

    cancelJob: (id) =>
      `/api/phase4/jobs/${encodeURIComponent(id)}/cancel`,

    fix: (projectId, findingId) =>
      `/api/phase4/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/fix`,

    export: (id) =>
      `/api/phase4/projects/${encodeURIComponent(id)}/export`
  };

  const CONFIG = {
    maxMasterPromptLength: 50000,
    minMasterPromptLength: 40,
    maxTaskPromptLength: 12000,

    pollInterval: 2500,
    maxPollAttempts: 144,

    maxPollRetryDelay: 30000,

    activityLimit: 30
  };

  const STORAGE_KEYS = {
    currentProject: "weblab.phase4.currentProject.v1",
    activeJob: "weblab.phase4.activeJob.v1",
    activityPrefix: "weblab.phase4.activity.v1:"
  };

  // =========================================================================
  // 2. APPLICATION STATE
  // =========================================================================

  const state = {
    projectId: "",

    project: null,

    manifest: [],

    tree: null,

    files: new Map(),

    report: null,

    findings: [],

    coverage: [],

    activity: [],

    activeJob: null,

    activeView: "build",

    selectedFile: "",

    currentFinding: null,

    previousModalFocus: null,

    pollTimer: null,

    pollController: null,

    pollCount: 0,

    retryCount: 0,

    pollingPaused: false,

    projectLoaded: false,

    busy: false
  };

  // =========================================================================
  // 3. DOM REFERENCES
  // =========================================================================

  const $ = (id) => document.getElementById(id);

  const els = {
    empty: $("emptyProjectState"),
    emptyError: $("emptyError"),
    workspace: $("workspaceContent"),

    connection: $("connectionStatus"),

    refresh: $("refreshProjectBtn"),
    retryLoad: $("retryLoadBtn"),
    newProject: $("newProjectBtn"),

    masterPrompt: $("masterPromptInput"),
    masterPromptCount: $("masterPromptCount"),
    masterPromptConsent: $("masterPromptConsent"),
    analyzeButton: $("analyzeProjectBtn"),

    sidebarProjectName: $("sidebarProjectName"),
    sidebarProjectStack: $("sidebarProjectStack"),
    projectMonogram: $("projectMonogram"),
    projectLoadBadge: $("projectLoadBadge"),

    sidebarProjectSpecStatus: $("sidebarProjectSpecStatus"),
    sidebarBuildStatus: $("sidebarBuildStatus"),
    sidebarScanStatus: $("sidebarScanStatus"),

    projectName: $("projectName"),
    projectDescription: $("projectDescription"),

    projectFramework: $("projectFramework"),
    projectDatabase: $("projectDatabase"),
    projectFileCount: $("projectFileCount"),

    projectOrigin: $("projectOrigin"),

    projectStateDot: $("projectStateDot"),
    projectStateText: $("projectStateText"),

    summaryProjectIcon: $("summaryProjectIcon"),
    projectAnalysisContext: $("projectAnalysisContext"),

    contextIdea: $("contextIdea"),
    contextStack: $("contextStack"),
    contextStructure: $("contextStructure"),

    manifestReviewed: $("manifestReviewed"),

    developerPrompt: $("developerPrompt"),
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
    fileLanguage: $("fileLanguageBadge"),

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

    activityTimeline: $("activityTimeline"),

    downloadReport: $("downloadReportBtn"),

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

  // =========================================================================
  // 4. GENERAL UTILITIES
  // =========================================================================

  function safeText(value, fallback = "—") {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return fallback;
    }

    return String(value);
  }

  function truncate(value, maximum = 200) {
    const result = safeText(value, "");

    return result.length > maximum
      ? `${result.slice(0, maximum).trimEnd()}…`
      : result;
  }

  function makeElement(tag, className = "", content = null) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (content !== null && content !== undefined) {
      element.textContent = String(content);
    }

    return element;
  }

  function setText(element, value, fallback = "—") {
    if (element) {
      element.textContent = safeText(value, fallback);
    }
  }

  function setError(element, message = "") {
    if (!element) return;

    element.textContent = message;
    element.hidden = !message;
  }

  function announce(message) {
    if (!els.live) return;

    els.live.textContent = "";

    window.requestAnimationFrame(() => {
      els.live.textContent = message;
    });
  }

  function showToast(message, type = "info") {
    if (!els.toast) return;

    const toast = makeElement(
      "div",
      `toast ${type}`,
      message
    );

    els.toast.append(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 4500);
  }

  function normalizePath(path) {
    if (typeof path !== "string") return "";

    let value = path.trim().replace(/\\/g, "/");

    if (
      !value ||
      value.startsWith("/") ||
      /^[A-Za-z]:/.test(value) ||
      value.includes("\0") ||
      /[\u0000-\u001F]/.test(value)
    ) {
      return "";
    }

    value = value.replace(/\/+/g, "/");

    const parts = value.split("/").filter(Boolean);

    if (
      !parts.length ||
      parts.some((part) =>
        part === "." ||
        part === ".." ||
        part.includes(":")
      )
    ) {
      return "";
    }

    return parts.join("/");
  }

  function languageForPath(path) {
    const extension = String(path)
      .split(".")
      .pop()
      .toLowerCase();

    const types = {
      py: "PYTHON",
      html: "HTML",
      htm: "HTML",
      css: "CSS",
      js: "JAVASCRIPT",
      mjs: "JAVASCRIPT",
      cjs: "JAVASCRIPT",
      jsx: "JSX",
      ts: "TYPESCRIPT",
      tsx: "TSX",
      json: "JSON",
      sql: "SQL",
      java: "JAVA",
      php: "PHP",
      md: "MARKDOWN",
      yml: "YAML",
      yaml: "YAML",
      xml: "XML",
      sh: "SHELL",
      txt: "TEXT",
      toml: "TOML",
      env: "ENV"
    };

    return types[extension] || "TEXT";
  }

  function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function safeFileName(value) {
    return String(value || "phase4-project")
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/\.+$/g, "")
      .slice(0, 90) || "phase4-project";
  }

  // =========================================================================
  // 5. SESSION STORAGE
  // =========================================================================

  function storageGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function storageRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Storage might be disabled by browser policy.
    }
  }

  function getAuthToken() {
    /*
     * Prefer the site's existing authenticated-token provider.
     * Do not generate or expose a Gemini API key in this script.
     */
    if (
      typeof window.WEBLAB_AUTH?.getToken === "function"
    ) {
      const value = window.WEBLAB_AUTH.getToken();

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    const keys = [
      "google_id_token",
      "googleIdToken",
      "id_token"
    ];

    for (const key of keys) {
      const sessionValue = storageGet(key);

      if (sessionValue) return sessionValue;

      try {
        const localValue = localStorage.getItem(key);

        if (localValue) return localValue;
      } catch {
        // Local storage may be blocked.
      }
    }

    return "";
  }

  function saveCurrentProject() {
    if (state.projectId) {
      storageSet(
        STORAGE_KEYS.currentProject,
        state.projectId
      );
    }
  }

  function saveCurrentJob() {
    if (!state.activeJob || !state.projectId) return;

    storageSet(
      STORAGE_KEYS.activeJob,
      JSON.stringify({
        ...state.activeJob,
        projectId: state.projectId,
        savedAt: new Date().toISOString()
      })
    );
  }

  function clearSavedJob() {
    storageRemove(STORAGE_KEYS.activeJob);
  }

  function restoreSavedJob() {
    if (!state.projectId) return false;

    try {
      const saved = JSON.parse(
        storageGet(STORAGE_KEYS.activeJob) || "null"
      );

      if (
        !saved?.id ||
        saved.projectId !== state.projectId ||
        !["build", "security"].includes(saved.kind)
      ) {
        return false;
      }

      state.activeJob = {
        id: String(saved.id),
        kind: saved.kind,
        projectId: state.projectId
      };

      state.pollCount = 0;
      state.retryCount = 0;
      state.pollingPaused = false;

      return true;

    } catch {
      clearSavedJob();
      return false;
    }
  }

  // =========================================================================
  // 6. AUTHENTICATED API CLIENT
  // =========================================================================

  async function parseResponse(response) {
    const contentType =
      response.headers.get("content-type") || "";

    if (
      contentType.includes("application/json") ||
      contentType.includes("+json")
    ) {
      return response.json().catch(() => ({}));
    }

    const message = await response.text().catch(() => "");

    return message
      ? { message: message.slice(0, 1000) }
      : {};
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

    const headers = new Headers(
      options.headers || {}
    );

    headers.set("Accept", "application/json");

    headers.set(
      "Authorization",
      `Bearer ${token}`
    );

    if (
      options.body !== undefined &&
      !(options.body instanceof FormData)
    ) {
      headers.set(
        "Content-Type",
        "application/json"
      );
    }

    let response;

    try {
      response = await fetch(
        `${API_BASE_URL}${path}`,
        {
          ...options,
          headers,
          credentials: "omit",

          body:
            options.body === undefined ||
            options.body instanceof FormData
              ? options.body
              : JSON.stringify(options.body)
        }
      );

    } catch (cause) {
      const error = new Error(
        "Could not reach the Phase 4 backend. Check the configured backend URL and your internet connection."
      );

      error.cause = cause;

      throw error;
    }

    const data = await parseResponse(response);

    if (!response.ok) {
      const error = new Error(
        typeof data?.error === "string"
          ? data.error
          : typeof data?.message === "string"
            ? data.message
            : `The Phase 4 API returned HTTP ${response.status}.`
      );

      error.status = response.status;
      error.data = data;

      const retryAfter = Number(
        response.headers.get("Retry-After")
      );

      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        error.retryAfterMs = retryAfter * 1000;
      }

      throw error;
    }

    return { response, data };
  }

  function friendlyError(error) {
    switch (Number(error?.status)) {
      case 400:
        return error.message || "The request is invalid.";

      case 401:
        return "Your sign-in session has expired. Sign in again and reload Phase 4.";

      case 403:
        return "Your account is not authorised to use this Phase 4 feature.";

      case 404:
        return error.message || "The Phase 4 endpoint or project was not found. Check that the matching backend route is deployed.";

      case 409:
        return error.message || "The project is currently busy or its state has changed.";

      case 413:
        return "The submitted project or prompt exceeds the configured size limit.";

      case 429:
        return error.message || "The request limit has been reached. Please wait before retrying.";

      case 502:
        return error.message || "The AI provider request failed. Try again.";

      case 503:
        return error.message || "The Phase 4 backend is temporarily unavailable.";

      default:
        return error?.message || "An unexpected error occurred.";
    }
  }

  // =========================================================================
  // 7. NORMALIZE MASTER-PROMPT ANALYSIS RESPONSE
  // =========================================================================

  function normalizeProject(payload) {
    const source =
      payload?.project && typeof payload.project === "object"
        ? payload.project
        : payload || {};

    const structure =
      source.structure ||
      payload?.structure ||
      {};

    const folders =
      Array.isArray(structure.folders)
        ? structure.folders
        : Array.isArray(source.folders)
          ? source.folders
          : Array.isArray(payload?.folders)
            ? payload.folders
            : [];

    return {
      id: String(
        source.project_id ||
        source.id ||
        payload?.project_id ||
        payload?.id ||
        state.projectId ||
        ""
      ),

      name: safeText(
        source.name ||
        source.project_name ||
        source.root_name ||
        payload?.root_name,
        "New project"
      ),

      rootName: safeText(
        source.root_name ||
        structure.root_name ||
        payload?.root_name,
        "project"
      ),

      idea: safeText(
        source.original_idea ||
        source.idea ||
        source.project_idea,
        ""
      ),

      summary: safeText(
        source.project_summary ||
        source.summary ||
        source.description,
        "No project summary was provided."
      ),

      framework: safeText(
        source.framework ||
        source.stack ||
        source.technology_stack,
        "Not specified"
      ),

      database: safeText(
        source.database_name ||
        source.database ||
        source.db,
        "Not specified"
      ),

      masterPrompt: safeText(
        source.master_prompt ||
        source.coding_prompt ||
        payload?.master_prompt,
        ""
      ),

      languages: Array.isArray(source.languages)
        ? source.languages
        : [],

      features: Array.isArray(source.features)
        ? source.features
        : [],

      userRoles: Array.isArray(source.user_roles)
        ? source.user_roles
        : [],

      entryPoints: Array.isArray(source.entry_points)
        ? source.entry_points
        : [],

      endpoints: Array.isArray(source.routes_endpoints)
        ? source.routes_endpoints
        : Array.isArray(source.endpoints)
          ? source.endpoints
          : [],

      dependencies: Array.isArray(source.dependencies)
        ? source.dependencies
        : [],

      integrations: Array.isArray(source.external_integrations)
        ? source.external_integrations
        : [],

      folders,

      generatedFiles: normalizeFileList(
        source.generated_files ||
        payload?.generated_files ||
        []
      ),

      report:
        source.security_report ||
        payload?.security_report ||
        null,

      createdAt:
        source.created_at ||
        payload?.created_at ||
        null,

      raw: payload
    };
  }

  function normalizeFileList(value) {
    if (Array.isArray(value)) return value;

    if (value && typeof value === "object") {
      return Object.entries(value).map(
        ([path, content]) => ({
          path,
          content
        })
      );
    }

    return [];
  }

  function getFileContent(file) {
    if (typeof file?.content === "string") {
      return file.content;
    }

    if (typeof file?.code === "string") {
      return file.code;
    }

    if (typeof file?.source === "string") {
      return file.source;
    }

    if (typeof file?.text === "string") {
      return file.text;
    }

    return "";
  }

  // =========================================================================
  // 8. PROJECT FILE TREE
  // =========================================================================

  function createTreeNode(name, type, path) {
    return {
      name,
      type,
      path,
      children: new Map()
    };
  }

  function buildProjectTree(entries, rootName) {
    const root = createTreeNode(
      rootName,
      "folder",
      ""
    );

    for (const item of entries || []) {
      const rawPath =
        typeof item === "string"
          ? item
          : item?.path || item?.name || "";

      const path = normalizePath(rawPath);

      if (!path) continue;

      let segments = path.split("/");

      if (
        segments[0]?.toLowerCase() ===
        String(rootName).toLowerCase()
      ) {
        segments = segments.slice(1);
      }

      if (!segments.length) continue;

      const typeValue =
        typeof item === "object"
          ? String(item.type || "").toLowerCase()
          : "";

      const isFolder = [
        "folder",
        "directory",
        "dir"
      ].includes(typeValue) || String(rawPath).endsWith("/");

      let current = root;
      let currentPath = "";

      for (let index = 0; index < segments.length; index += 1) {
        const name = segments[index];

        currentPath = currentPath
          ? `${currentPath}/${name}`
          : name;

        const last = index === segments.length - 1;

        const nodeType =
          !last || isFolder
            ? "folder"
            : "file";

        if (!current.children.has(name)) {
          current.children.set(
            name,
            createTreeNode(
              name,
              nodeType,
              currentPath
            )
          );

        } else if (nodeType === "folder") {
          current.children.get(name).type = "folder";
        }

        current = current.children.get(name);
      }
    }

    function sortTree(node) {
      return [...node.children.values()]
        .sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
          }

          return a.name.localeCompare(b.name);
        })
        .map((child) => ({
          ...child,
          children: sortTree(child)
        }));
    }

    const sorted = sortTree(root);

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

    count(sorted);

    return {
      root: {
        ...root,
        children: sorted
      },
      folderCount,
      fileCount
    };
  }

  // =========================================================================
  // 9. PROJECT SUMMARY
  // =========================================================================

  function initials(value) {
    return String(value || "P")
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "P";
  }

  function renderProjectSummary() {
    const p = state.project;

    if (!p) return;

    const name = p.name;

    setText(els.sidebarProjectName, name);
    setText(
      els.sidebarProjectStack,
      `${p.framework} · ${p.database}`
    );

    setText(els.projectMonogram, initials(name));
    setText(els.projectLoadBadge, "LOADED");

    setText(els.projectName, name);
    setText(els.projectDescription, p.summary);

    setText(els.projectFramework, p.framework);
    setText(els.projectDatabase, p.database);

    setText(
      els.projectFileCount,
      `${state.tree?.fileCount || 0} planned`
    );

    setText(
      els.summaryProjectIcon,
      initials(name)
    );

    setText(
      els.contextIdea,
      [
        p.idea,
        p.features.length
          ? `Features: ${p.features.slice(0, 10).join(" · ")}`
          : ""
      ].filter(Boolean).join("\n\n") ||
      "No project description was extracted."
    );

    setText(
      els.contextStack,
      [
        p.framework,
        p.database,
        p.languages.length
          ? `Languages: ${p.languages.join(", ")}`
          : ""
      ].filter(Boolean).join(" · ")
    );

    setText(
      els.contextStructure,
      `${state.tree?.folderCount || 0} folders · ${state.tree?.fileCount || 0} files · ${p.entryPoints.length} entry points · ${p.endpoints.length} routes/endpoints`
    );

    setText(
      els.projectAnalysisContext,
      `${p.framework} · ${p.database} · ${state.tree?.fileCount || 0} manifest files`
    );

    setText(
      els.projectOrigin,
      "INDEPENDENT MASTER PROMPT"
    );

    setText(
      els.projectStateText,
      "Project analysed"
    );

    if (els.projectStateDot) {
      els.projectStateDot.className = "status-dot";
    }

    setText(
      els.sidebarProjectSpecStatus,
      "Loaded"
    );

    setText(
      els.sidebarBuildStatus,
      state.files.size
        ? "Generated"
        : "Not started"
    );

    setText(
      els.sidebarScanStatus,
      state.report
        ? "Available"
        : "Not tested"
    );

    setText(
      els.fileRootLabel,
      p.rootName.toUpperCase()
    );

    setText(
      els.filesCountBadge,
      `${state.tree?.fileCount || 0} FILES IN MANIFEST`
    );

    if (els.exportProject) {
      els.exportProject.disabled = state.files.size === 0;
    }

    if (els.footerStatus) {
      els.footerStatus.textContent =
        `Independent project · ${p.id}`;
    }

    syncControls();
  }

  // =========================================================================
  // 10. FILE STORAGE AND PREVIEW
  // =========================================================================

  function loadGeneratedFiles(items) {
    state.files.clear();

    for (const item of normalizeFileList(items)) {
      if (!item || typeof item !== "object") continue;

      const path = normalizePath(
        item.path ||
        item.filename ||
        item.name ||
        ""
      );

      if (!path) continue;

      state.files.set(path, {
        path,
        content: getFileContent(item),
        language: safeText(
          item.language,
          languageForPath(path)
        ),
        status: safeText(item.status, "Generated"),
        generated: true
      });
    }
  }

  function addGeneratedFiles(items) {
    for (const item of normalizeFileList(items)) {
      if (!item || typeof item !== "object") continue;

      const path = normalizePath(
        item.path ||
        item.filename ||
        item.name ||
        ""
      );

      if (!path) continue;

      state.files.set(path, {
        path,
        content: getFileContent(item),
        language: safeText(
          item.language,
          languageForPath(path)
        ),
        status: safeText(item.status, "Generated"),
        generated: true
      });

      if (
        !state.manifest.some(
          (entry) =>
            String(entry.path || entry).replace(/\/$/, "").toLowerCase() === path.toLowerCase()
        )
      ) {
        state.manifest.push({
          path,
          type: "file",
          purpose: "Generated project file."
        });
      }
    }

    state.tree = buildProjectTree(
      state.manifest,
      state.project.rootName
    );

    renderFileTree(els.fileSearch?.value || "");

    setText(
      els.projectFileCount,
      `${state.tree.fileCount} files`
    );

    if (state.files.size > 0) {
      const selected =
        state.selectedFile &&
        state.files.has(state.selectedFile)
          ? state.selectedFile
          : state.files.keys().next().value;

      selectFile(selected);
    }

    if (els.exportProject) {
      els.exportProject.disabled = state.files.size === 0;
    }
  }

  // =========================================================================
  // 11. FILE EXPLORER RENDERING
  // =========================================================================

  function makeFileMark(name) {
    const extension = String(name)
      .split(".")
      .pop()
      .toLowerCase();

    const marks = {
      py: "Py",
      html: "<>",
      css: "#",
      js: "JS",
      ts: "TS",
      json: "{}",
      sql: "DB",
      md: "M",
      yml: "Y",
      yaml: "Y",
      env: "•"
    };

    return marks[extension] || "·";
  }

  function renderTreeNode(node, container, depth = 0) {
    if (node.type === "folder") {
      const wrapper = makeElement("div", "tree-node");

      const button = makeElement("button", "tree-folder");

      button.type = "button";

      button.style.paddingLeft =
        `${7 + depth * 8}px`;

      button.setAttribute("aria-expanded", "true");

      const caret = makeElement(
        "span",
        "folder-caret",
        "⌄"
      );

      const mark = makeElement(
        "span",
        "file-type-mark",
        "▰"
      );

      const label = makeElement(
        "span",
        "tree-folder-label",
        node.name
      );

      button.append(caret, mark, label);

      const children = makeElement(
        "div",
        "tree-indent"
      );

      node.children.forEach((child) => {
        renderTreeNode(
          child,
          children,
          depth + 1
        );
      });

      button.addEventListener("click", () => {
        const open =
          button.getAttribute("aria-expanded") === "true";

        button.setAttribute(
          "aria-expanded",
          String(!open)
        );

        children.hidden = open;
      });

      wrapper.append(button, children);

      container.append(wrapper);

      return;
    }

    const button = makeElement("button", "tree-file");

    button.type = "button";
    button.dataset.path = node.path;

    button.style.paddingLeft =
      `${7 + depth * 8}px`;

    const mark = makeElement(
      "span",
      "file-type-mark",
      makeFileMark(node.name)
    );

    const label = makeElement(
      "span",
      "tree-folder-label",
      node.name
    );

    button.append(mark, label);

    button.addEventListener("click", () => {
      selectFile(node.path);
    });

    container.append(button);
  }

  function renderFileTree(filter = "") {
    if (!els.fileTree) return;

    els.fileTree.replaceChildren();

    if (!state.tree?.root) {
      els.fileTree.append(
        makeElement(
          "p",
          "muted-empty",
          "No project manifest is available."
        )
      );

      setText(els.fileTreeCount, "0 ITEMS");

      return;
    }

    const query = String(filter).trim().toLowerCase();

    let fileCount = 0;
    let folderCount = 0;

    function filterNode(node) {
      if (node.type === "file") {
        const matches =
          !query ||
          node.path.toLowerCase().includes(query);

        if (matches) fileCount += 1;

        return matches ? node : null;
      }

      const children = node.children
        .map(filterNode)
        .filter(Boolean);

      const matches =
        !query ||
        node.name.toLowerCase().includes(query) ||
        children.length > 0;

      if (
        matches &&
        node.name !== state.project?.rootName
      ) {
        folderCount += 1;
      }

      return matches
        ? {
            ...node,
            children
          }
        : null;
    }

    const nodes = state.tree.root.children
      .map(filterNode)
      .filter(Boolean);

    if (nodes.length === 0) {
      els.fileTree.append(
        makeElement(
          "p",
          "muted-empty",
          query
            ? "No files match your search."
            : "No files are present in the project manifest."
        )
      );
    } else {
      nodes.forEach((node) => {
        renderTreeNode(
          node,
          els.fileTree
        );
      });
    }

    setText(
      els.fileTreeCount,
      `${fileCount} FILES · ${folderCount} FOLDERS`
    );

    updateSelectedFile();
  }

  function updateSelectedFile() {
    document.querySelectorAll(".tree-file").forEach((button) => {
      const selected =
        button.dataset.path === state.selectedFile;

      button.classList.toggle(
        "is-selected",
        selected
      );

      if (selected) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function selectFile(path) {
    const safePath = normalizePath(path);

    if (!safePath) return;

    state.selectedFile = safePath;

    const file = state.files.get(safePath);

    const generated = Boolean(
      file && file.generated
    );

    setText(
      els.selectedFileName,
      safePath.split("/").pop()
    );

    setText(
      els.fileLanguage,
      file?.language || languageForPath(safePath)
    );

    if (els.filePreviewEmpty) {
      els.filePreviewEmpty.hidden = generated;
    }

    if (els.fileCodePreview) {
      els.fileCodePreview.hidden = !generated;
    }

    if (els.fileCodeContent) {
      els.fileCodeContent.textContent =
        generated ? file.content : "";
    }

    setText(
      els.filePreviewStatus,
      generated
        ? `${file.status.toUpperCase()} · ${file.content.length.toLocaleString()} CHARACTERS`
        : "Manifest entry only — source code not generated yet"
    );

    if (els.copyFile) {
      els.copyFile.disabled = !generated;
    }

    if (!generated && els.filePreviewEmpty) {
      const title =
        els.filePreviewEmpty.querySelector("strong");

      const description =
        els.filePreviewEmpty.querySelector("p");

      if (title) {
        title.textContent = "Source not generated yet";
      }

      if (description) {
        description.textContent =
          "This file is in the project manifest. Its source content will appear after the code-generation job completes.";
      }
    }

    updateSelectedFile();
  }

  // =========================================================================
  // 12. ACTIVITY TIMELINE
  // =========================================================================

  function getActivityStorageKey() {
    return STORAGE_KEYS.activityPrefix + state.projectId;
  }

  function loadActivity() {
    try {
      const value = JSON.parse(
        storageGet(getActivityStorageKey()) || "[]"
      );

      state.activity = Array.isArray(value)
        ? value.slice(0, CONFIG.activityLimit)
        : [];

    } catch {
      state.activity = [];
    }
  }

  function saveActivity() {
    if (!state.projectId) return;

    storageSet(
      getActivityStorageKey(),
      JSON.stringify(
        state.activity.slice(0, CONFIG.activityLimit)
      )
    );
  }

  function addActivity(title, description, icon = "•", time = new Date().toISOString()) {
    state.activity.unshift({
      title,
      description,
      icon,
      timestamp: time
    });

    state.activity =
      state.activity.slice(0, CONFIG.activityLimit);

    saveActivity();

    renderActivity();
  }

  function renderActivity() {
    if (!els.activityTimeline) return;

    els.activityTimeline.replaceChildren();

    if (!state.activity.length) {
      els.activityTimeline.append(
        makeElement(
          "li",
          "activity-empty",
          "No activity yet. Analyse your master prompt, generate code or run a security assessment."
        )
      );

      return;
    }

    state.activity.forEach((item) => {
      const row = makeElement(
        "li",
        "activity-item"
      );

      const marker = makeElement(
        "span",
        "activity-marker",
        item.icon || "•"
      );

      const copy = makeElement(
        "div",
        "activity-copy"
      );

      copy.append(
        makeElement("strong", "", item.title),
        makeElement("p", "", item.description)
      );

      const time = makeElement(
        "time",
        "",
        formatDate(item.timestamp)
      );

      row.append(marker, copy, time);

      els.activityTimeline.append(row);
    });
  }

  // =========================================================================
  // 13. NAVIGATION
  // =========================================================================

  const VIEWS = [
    "build",
    "files",
    "security",
    "reports"
  ];

  function setActiveView(view) {
    if (!VIEWS.includes(view)) return;

    state.activeView = view;

    document.querySelectorAll("[data-view]").forEach((button) => {
      const active =
        button.dataset.view === view;

      button.classList.toggle(
        "is-active",
        active
      );

      if (button.classList.contains("workspace-tab")) {
        button.setAttribute(
          "aria-selected",
          String(active)
        );

        button.tabIndex = active ? 0 : -1;
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
      const active =
        panel.dataset.panel === view;

      panel.hidden = !active;

      panel.classList.toggle(
        "is-visible",
        active
      );
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
        if (
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        ) {
          return;
        }

        const tabs = [
          ...document.querySelectorAll(".workspace-tab[role='tab']")
        ];

        const current = tabs.indexOf(tab);

        let next = current;

        if (event.key === "ArrowRight") {
          next = (current + 1) % tabs.length;
        }

        if (event.key === "ArrowLeft") {
          next = (current - 1 + tabs.length) % tabs.length;
        }

        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;

        event.preventDefault();

        tabs[next].focus();

        setActiveView(tabs[next].dataset.view);
      });
    });

    $("openSecurityBtn")?.addEventListener("click", () => {
      setActiveView("security");
    });
  }

  // =========================================================================
  // 14. MASTER PROMPT INPUT
  // =========================================================================

  function updateAnalyzeButton() {
    if (!els.analyzeButton) return;

    const validPrompt =
      els.masterPrompt.value.trim().length >=
      CONFIG.minMasterPromptLength;

    const consent =
      Boolean(els.masterPromptConsent.checked);

    els.analyzeButton.disabled =
      !validPrompt ||
      !consent ||
      state.busy;
  }

  function updateMasterPromptCounter() {
    const length = els.masterPrompt.value.length;

    setText(
      els.masterPromptCount,
      `${length.toLocaleString()} / ${CONFIG.maxMasterPromptLength.toLocaleString()}`
    );

    updateAnalyzeButton();
  }

  // =========================================================================
  // 15. PROJECT ANALYSIS
  // =========================================================================

  async function analyzeMasterPrompt() {
    if (state.busy) return;

    const masterPrompt =
      els.masterPrompt.value.trim();

    if (masterPrompt.length < CONFIG.minMasterPromptLength) {
      setError(
        els.emptyError,
        "Paste the complete master prompt. A short project name or summary is not sufficient."
      );

      return;
    }

    if (masterPrompt.length > CONFIG.maxMasterPromptLength) {
      setError(
        els.emptyError,
        "Your master prompt exceeds the 50,000-character limit."
      );

      return;
    }

    if (!els.masterPromptConsent.checked) {
      setError(
        els.emptyError,
        "Confirm the project-data disclosure before sending the prompt to Google Gemini."
      );

      return;
    }

    if (!getAuthToken()) {
      setError(
        els.emptyError,
        "Your Google sign-in session is missing. Sign in before creating a Phase 4 project."
      );

      return;
    }

    setError(els.emptyError, "");

    state.busy = true;

    els.analyzeButton.classList.add("is-loading");

    els.analyzeButton.disabled = true;

    const buttonLabel =
      els.analyzeButton.querySelector(".button-label");

    if (buttonLabel) {
      buttonLabel.textContent = "Analysing specification…";
    }

    setConnection("Analysing project", "neutral");

    announce("Master prompt submitted for analysis.");

    try {
      const { data } = await apiRequest(
        API.analyze,
        {
          method: "POST",

          body: {
            master_prompt: masterPrompt,
            provider_consent: true
          }
        }
      );

      const projectId = String(
        data?.project_id ||
        data?.project?.project_id ||
        data?.id ||
        ""
      );

      if (!projectId) {
        throw new Error(
          "The analysis endpoint did not return a project_id. The backend must create and persist a Phase 4 project after analysing the master prompt."
        );
      }

      // A new master prompt creates a new, independent Phase 4 project.
      state.projectId = projectId;

      saveCurrentProject();

      state.activeJob = null;

      clearSavedJob();

      stopPolling();

      state.project = normalizeProject(data);

      state.manifest = state.project.folders;

      state.tree = buildProjectTree(
        state.manifest,
        state.project.rootName
      );

      loadGeneratedFiles(
        state.project.generatedFiles
      );

      state.report = state.project.report
        ? normalizeReport(state.project.report)
        : null;

      state.projectLoaded = true;

      loadActivity();

      els.manifestReviewed.checked = false;

      setConnection("Project created", "online");

      showWorkspace();

      renderProjectSummary();

      renderFileTree();

      renderActivity();

      if (state.files.size) {
        selectFile(state.files.keys().next().value);
      }

      if (state.report) {
        renderSecurityReport();
      }

      addActivity(
        "Master prompt analysed",
        `${state.project.name} · ${state.project.framework} · ${state.tree.fileCount} planned files.`,
        "✦"
      );

      setAgentState(
        "Analysis complete",
        "success",
        "The master prompt was analysed and a project manifest was created. Review the project files before generation."
      );

      showToast(
        "Project analysis completed. Review the proposed manifest.",
        "success"
      );

      setActiveView("build");

      announce(
        "Project analysis completed. Review the manifest before generating code."
      );

    } catch (error) {
      setConnection("Analysis failed", "offline");

      setError(
        els.emptyError,
        friendlyError(error)
      );

      announce("Master prompt analysis failed.");

    } finally {
      state.busy = false;

      els.analyzeButton.classList.remove("is-loading");

      if (buttonLabel) {
        buttonLabel.textContent = "Analyse project";
      }

      updateAnalyzeButton();
    }
  }

  // =========================================================================
  // 16. PROJECT EMPTY STATE AND NEW PROJECT
  // =========================================================================

  function showEmptyState(message = "") {
    els.empty.hidden = false;

    els.workspace.hidden = true;

    setError(els.emptyError, message);
  }

  function showWorkspace() {
    els.empty.hidden = true;

    els.workspace.hidden = false;
  }

  function stopPolling() {
    if (state.pollTimer) {
      window.clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }

    if (state.pollController) {
      state.pollController.abort();
      state.pollController = null;
    }
  }

  function startNewProject() {
    if (state.activeJob) {
      showToast(
        "A job is still active. Cancel or finish it before starting another project.",
        "warning"
      );

      return;
    }

    stopPolling();

    clearSavedJob();

    storageRemove(STORAGE_KEYS.currentProject);

    state.projectId = "";
    state.project = null;
    state.manifest = [];
    state.tree = null;

    state.files.clear();

    state.report = null;
    state.findings = [];
    state.coverage = [];
    state.activity = [];

    state.activeJob = null;

    state.selectedFile = "";
    state.projectLoaded = false;

    els.masterPrompt.value = "";

    els.masterPromptConsent.checked = false;

    els.masterPromptCount.textContent =
      "0 / 50,000";

    els.manifestReviewed.checked = false;

    els.developerPrompt.value = "";

    els.promptCount.textContent =
      "0 / 12,000";

    setError(els.emptyError, "");

    setConnection(
      "Ready for a master prompt",
      "neutral"
    );

    renderAgentSteps("idle", 0);

    setAgentState(
      "Idle",
      "neutral",
      "Paste a project master prompt to start an independent Phase 4 project."
    );

    renderActivity();

    renderFileTree();

    syncControls();

    showEmptyState();

    updateAnalyzeButton();

    announce("New independent project intake opened.");
  }

  // =========================================================================
  // 17. LOAD EXISTING PROJECT
  // =========================================================================

  function getRequestedProjectId() {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get("project_id") ||
      params.get("projectId") ||
      params.get("id") ||
      storageGet(STORAGE_KEYS.currentProject) ||
      ""
    );
  }

  async function loadProject() {
    if (state.busy) return;

    stopPolling();

    state.projectLoaded = false;

    const id = state.projectId || getRequestedProjectId();

    if (!id) {
      showEmptyState();

      setConnection(
        "Ready for a master prompt",
        "neutral"
      );

      updateAnalyzeButton();

      return;
    }

    state.projectId = id;

    saveCurrentProject();

    setConnection("Loading project", "neutral");

    showEmptyState("Loading your saved Phase 4 project…");

    try {
      const { data } = await apiRequest(
        API.project(state.projectId),
        {
          method: "GET"
        }
      );

      state.project = normalizeProject(data);

      if (!state.project.id) {
        state.project.id = state.projectId;
      }

      state.manifest = state.project.folders;

      if (!state.manifest.length) {
        throw new Error(
          "The saved Phase 4 project has no manifest. Re-create it using the complete master prompt."
        );
      }

      state.tree = buildProjectTree(
        state.manifest,
        state.project.rootName
      );

      loadGeneratedFiles(
        state.project.generatedFiles
      );

      state.report = state.project.report
        ? normalizeReport(state.project.report)
        : null;

      state.projectLoaded = true;

      loadActivity();

      showWorkspace();

      setConnection("Connected", "online");

      renderProjectSummary();

      renderFileTree();

      renderActivity();

      if (state.files.size) {
        selectFile(state.files.keys().next().value);
      }

      if (state.report) {
        renderSecurityReport();
      }

      await refreshSecurityReport(false);

      if (restoreJob()) {
        syncControls();

        setAgentState(
          "Resuming",
          "running",
          "An active backend job was recovered from this browser session."
        );

        pollJob();
      } else {
        syncControls();
      }

      announce(
        `${state.project.name} loaded successfully.`
      );

    } catch (error) {
      state.projectLoaded = false;

      setConnection("Cannot load project", "offline");

      showEmptyState(friendlyError(error));
    }
  }

  // =========================================================================
  // 18. BUILD CONTROLS
  // =========================================================================

  function syncControls() {
    const active = Boolean(state.activeJob);

    const busy = state.busy || active;

    const reviewed =
      Boolean(els.manifestReviewed?.checked);

    if (els.buildButton) {
      els.buildButton.disabled =
        busy ||
        !state.projectLoaded ||
        !reviewed;

      els.buildButton.classList.toggle(
        "is-loading",
        state.activeJob?.kind === "build"
      );

      const label =
        els.buildButton.querySelector(".button-label");

      if (label) {
        label.textContent =
          state.activeJob?.kind === "build"
            ? "Generating…"
            : "Generate code";
      }
    }

    if (els.scanButton) {
      els.scanButton.disabled =
        busy ||
        !state.projectLoaded ||
        state.files.size === 0;

      els.scanButton.classList.toggle(
        "is-loading",
        state.activeJob?.kind === "security"
      );

      const label =
        els.scanButton.querySelector(".button-label");

      if (label) {
        label.textContent =
          state.activeJob?.kind === "security"
            ? "Assessment running…"
            : "Run security assessment";
      }
    }

    els.cancelJob.hidden =
      !(active && state.activeJob.kind === "build");

    els.cancelSecurityJob.hidden =
      !(active && state.activeJob.kind === "security");

    els.exportProject.disabled =
      !state.projectLoaded ||
      state.files.size === 0;

    els.downloadReport.disabled =
      !state.report;
  }

  // =========================================================================
  // 19. AGENT PROGRESS
  // =========================================================================

  const AGENT_STEPS = [
    {
      key: "reading",
      title: "Read project specification",
      detail: "Load requirements and approved manifest"
    },
    {
      key: "planning",
      title: "Plan implementation",
      detail: "Select files and dependencies"
    },
    {
      key: "generating",
      title: "Generate source code",
      detail: "Generate approved files"
    },
    {
      key: "validating",
      title: "Validate project",
      detail: "Check syntax and project consistency"
    }
  ];

  function agentStepIndex(stage) {
    const map = {
      queued: 0,
      starting: 0,
      reading: 0,
      planning: 1,
      inspecting: 1,
      generating: 2,
      writing: 2,
      validating: 3,
      testing: 3,
      completed: 4,
      failed: 4,
      cancelled: 4
    };

    return map[String(stage).toLowerCase()] ?? 0;
  }

  function renderAgentSteps(stage = "queued", progress = 0) {
    if (!els.agentSteps) return;

    els.agentSteps.replaceChildren();

    const current = agentStepIndex(stage);

    AGENT_STEPS.forEach((step, index) => {
      const stateClass =
        index < current
          ? "is-done"
          : index === current
            ? "is-active"
            : "is-idle";

      const item = makeElement(
        "li",
        `agent-step ${stateClass}`
      );

      const marker = makeElement(
        "span",
        "step-marker",
        index < current
          ? "✓"
          : `0${index + 1}`
      );

      const copy = makeElement("div", "");

      copy.append(
        makeElement("strong", "", step.title),
        makeElement("small", "", step.detail)
      );

      const status = makeElement(
        "span",
        "step-state",
        index < current
          ? "DONE"
          : index === current
            ? "ACTIVE"
            : "WAITING"
      );

      item.append(marker, copy, status);

      els.agentSteps.append(item);
    });

    const percentage = Math.min(
      100,
      Math.max(0, Number(progress) || 0)
    );

    els.agentProgressFill.style.width =
      `${percentage}%`;

    setText(
      els.agentProgressText,
      `${Math.round(percentage)}%`
    );
  }

  function setAgentState(
    label,
    mode = "neutral",
    message = ""
  ) {
    if (els.agentBadge) {
      const dot = makeElement(
        "span",
        `status-dot ${
          mode === "running"
            ? "warning"
            : mode === "neutral"
              ? "muted"
              : ""
        }`
      );

      els.agentBadge.className =
        `state-pill ${mode}`;

      els.agentBadge.replaceChildren(
        dot,
        document.createTextNode(
          ` ${String(label).toUpperCase()}`
        )
      );
    }

    if (message) {
      setText(els.agentMessage, message);
    }
  }

  // =========================================================================
  // 20. START CODE GENERATION
  // =========================================================================

  async function generateCode() {
    if (
      state.busy ||
      state.activeJob ||
      !state.projectLoaded
    ) {
      return;
    }

    if (!els.manifestReviewed.checked) {
      showToast(
        "Review and confirm the project manifest before generating code.",
        "warning"
      );

      setActiveView("files");

      return;
    }

    const prompt =
      els.developerPrompt.value.trim();

    if (prompt.length < 8) {
      setError(
        els.buildError,
        "Describe the implementation task. You can use the complete-project suggestion to generate the full application."
      );

      els.developerPrompt.focus();

      return;
    }

    if (prompt.length > CONFIG.maxTaskPromptLength) {
      setError(
        els.buildError,
        "The implementation instruction exceeds the 12,000-character limit."
      );

      return;
    }

    setError(els.buildError, "");

    await startJob(
      "build",
      API.generate(state.projectId),
      {
        prompt
      }
    );
  }

  // =========================================================================
  // 21. START SECURITY SCAN
  // =========================================================================

  async function runSecurityScan() {
    if (
      state.busy ||
      state.activeJob ||
      !state.projectLoaded
    ) {
      return;
    }

    if (!state.files.size) {
      showToast(
        "Generate project source files before running a security assessment.",
        "warning"
      );

      setActiveView("files");

      return;
    }

    await startJob(
      "security",
      API.securityScan(state.projectId),
      {
        scope: "project",
        profile: "baseline"
      }
    );
  }

  // =========================================================================
  // 22. BACKGROUND JOB MANAGEMENT
  // =========================================================================

  function unwrapResult(data) {
    return (
      data?.result ??
      data?.output ??
      data?.data ??
      data
    );
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
    const raw = data?.progress;

    if (
      raw !== null &&
      raw !== undefined &&
      Number.isFinite(Number(raw))
    ) {
      return Math.min(
        100,
        Math.max(0, Number(raw))
      );
    }

    const defaults = {
      queued: 4,
      starting: 6,
      reading: 15,
      planning: 28,
      generating: 55,
      writing: 70,
      inspecting: 35,
      validating: 90,
      completed: 100
    };

    return defaults[jobStage(data)] ?? 10;
  }

  function jobStatus(data) {
    return String(
      data?.status ||
      data?.state ||
      ""
    ).toLowerCase();
  }

  function isComplete(data) {
    return [
      "completed",
      "complete",
      "success",
      "succeeded",
      "done"
    ].includes(jobStatus(data));
  }

  function isCancelled(data) {
    return [
      "cancelled",
      "canceled",
      "stopped"
    ].includes(jobStatus(data));
  }

  function isFailed(data) {
    return [
      "failed",
      "error",
      "rejected"
    ].includes(jobStatus(data));
  }

  function isPermanentPollError(error) {
    return [
      400,
      401,
      403,
      404,
      410,
      422
    ].includes(Number(error?.status));
  }

  function nextRetryDelay(error) {
    if (
      Number.isFinite(Number(error?.retryAfterMs)) &&
      Number(error.retryAfterMs) > 0
    ) {
      return Math.min(
        Number(error.retryAfterMs),
        CONFIG.maxPollRetryDelay
      );
    }

    return Math.min(
      CONFIG.maxPollRetryDelay,
      CONFIG.pollInterval * (2 ** Math.min(state.retryCount, 4))
    );
  }

  function schedulePoll(delay = CONFIG.pollInterval) {
    if (
      !state.activeJob ||
      state.pollingPaused
    ) {
      return;
    }

    if (state.pollTimer) {
      window.clearTimeout(state.pollTimer);
    }

    state.pollTimer = window.setTimeout(() => {
      state.pollTimer = null;
      pollJob();
    }, delay);
  }

  async function startJob(kind, path, body) {
    if (state.activeJob || state.busy) return;

    state.busy = true;

    syncControls();

    setConnection("Working", "neutral");

    setAgentState(
      "Starting",
      "running",
      kind === "build"
        ? "Submitting the project implementation task."
        : "Submitting the security assessment request."
    );

    if (kind === "build") {
      setText(els.sidebarBuildStatus, "Starting");
    } else {
      setText(els.sidebarScanStatus, "Starting");
    }

    try {
      const { data } = await apiRequest(
        path,
        {
          method: "POST",
          body
        }
      );

      const result = unwrapResult(data);

      const jobId =
        data?.job_id ||
        data?.jobId ||
        result?.job_id ||
        result?.jobId;

      // Support an endpoint that returns a complete result immediately.
      if (!jobId && isImmediateResult(kind, result)) {
        await finishJob(kind, result);
        return;
      }

      if (!jobId) {
        throw new Error(
          "The backend did not return a job_id or a complete result."
        );
      }

      state.activeJob = {
        id: String(jobId),
        kind,
        projectId: state.projectId
      };

      state.pollCount = 0;
      state.retryCount = 0;
      state.pollingPaused = false;

      saveCurrentJob();

      setConnection("Job accepted", "online");

      setAgentState(
        "Working",
        "running",
        safeText(data?.message, "The Phase 4 backend accepted the task.")
      );

      addActivity(
        kind === "build"
          ? "Code generation started"
          : "Security assessment started",

        `Backend job ${jobId} was accepted.`,

        kind === "build" ? "⌘" : "◇"
      );

      syncControls();

      pollJob();

    } catch (error) {
      state.activeJob = null;

      clearSavedJob();

      setConnection("Request failed", "offline");

      setAgentState(
        "Failed",
        "neutral",
        friendlyError(error)
      );

      if (kind === "build") {
        setText(els.sidebarBuildStatus, "Failed");
        setError(els.buildError, friendlyError(error));
      } else {
        setText(els.sidebarScanStatus, "Failed");
        showToast(friendlyError(error), "error");
      }

      syncControls();

    } finally {
      state.busy = false;
      syncControls();
    }
  }

  function isImmediateResult(kind, result) {
    if (kind === "build") {
      return Boolean(
        result?.generated_files ||
        result?.files ||
        result?.output_files ||
        result?.artifacts
      );
    }

    return Boolean(
      result?.security_report ||
      result?.report ||
      result?.findings ||
      result?.coverage
    );
  }

  async function pollJob() {
    if (!state.activeJob || state.pollingPaused) return;

    if (state.pollCount >= CONFIG.maxPollAttempts) {
      state.pollingPaused = true;

      setAgentState(
        "Polling paused",
        "neutral",
        "Status checks paused after six minutes. The server job may still be running. Reload project to resume."
      );

      setConnection("Waiting for job", "neutral");

      showToast(
        "Status polling paused; the active job ID was retained.",
        "info"
      );

      syncControls();

      return;
    }

    state.pollCount += 1;

    const job = {
      ...state.activeJob
    };

    const controller = new AbortController();

    state.pollController = controller;

    try {
      const { data } = await apiRequest(
        API.job(job.id),
        {
          method: "GET",
          signal: controller.signal
        }
      );

      if (
        !state.activeJob ||
        state.activeJob.id !== job.id
      ) {
        return;
      }

      state.retryCount = 0;

      const stage = jobStage(data);
      const progress = jobProgress(data);

      renderAgentSteps(stage, progress);

      setText(
        els.agentMessage,
        safeText(data?.message, `Job status: ${jobStatus(data)}.`)
      );

      if (isComplete(data)) {
        const result = unwrapResult(data);

        state.activeJob = null;

        clearSavedJob();

        stopPolling();

        await finishJob(job.kind, result);

        return;
      }

      if (isCancelled(data)) {
        state.activeJob = null;

        clearSavedJob();

        stopPolling();

        setAgentState(
          "Cancelled",
          "neutral",
          "The backend confirmed that the task was cancelled."
        );

        setConnection("Ready", "online");

        if (job.kind === "build") {
          setText(els.sidebarBuildStatus, "Cancelled");
        } else {
          setText(els.sidebarScanStatus, "Cancelled");
        }

        addActivity(
          "Job cancelled",
          `Job ${job.id} was cancelled.`,
          "Ⅱ"
        );

        syncControls();

        return;
      }

      if (isFailed(data)) {
        state.activeJob = null;

        clearSavedJob();

        stopPolling();

        const message = safeText(
          data?.error || data?.message,
          "The backend job failed."
        );

        setAgentState(
          "Failed",
          "neutral",
          message
        );

        setConnection("Job failed", "offline");

        if (job.kind === "build") {
          setText(els.sidebarBuildStatus, "Failed");
          setError(els.buildError, message);
        } else {
          setText(els.sidebarScanStatus, "Failed");
          showToast(message, "error");
        }

        addActivity(
          "Job failed",
          message,
          "!"
        );

        syncControls();

        return;
      }

      schedulePoll(CONFIG.pollInterval);

    } catch (error) {
      if (error.name === "AbortError") return;

      if (
        !state.activeJob ||
        state.activeJob.id !== job.id
      ) {
        return;
      }

      if (isPermanentPollError(error)) {
        state.pollingPaused = true;

        setAgentState(
          "Status check blocked",
          "neutral",
          friendlyError(error)
        );

        setConnection("Job status unavailable", "offline");

        syncControls();

        return;
      }

      state.retryCount += 1;

      schedulePoll(nextRetryDelay(error));

      setText(
        els.agentMessage,
        `Temporary status-check error. Retrying: ${friendlyError(error)}`
      );

    } finally {
      if (state.pollController === controller) {
        state.pollController = null;
      }
    }
  }

  // =========================================================================
  // 23. JOB RECOVERY
  // =========================================================================

  function restoreJob() {
    try {
      const saved = JSON.parse(
        storageGet(STORAGE_KEYS.activeJob) || "null"
      );

      if (
        !saved?.id ||
        saved.projectId !== state.projectId ||
        !["build", "security"].includes(saved.kind)
      ) {
        return false;
      }

      state.activeJob = {
        id: String(saved.id),
        kind: saved.kind,
        projectId: state.projectId
      };

      state.pollCount = 0;
      state.retryCount = 0;
      state.pollingPaused = false;

      return true;

    } catch {
      clearSavedJob();
      return false;
    }
  }

  // =========================================================================
  // 24. CANCEL JOB
  // =========================================================================

  async function cancelCurrentJob() {
    if (!state.activeJob) return;

    const job = { ...state.activeJob };

    els.cancelJob.disabled = true;
    els.cancelSecurityJob.disabled = true;

    setText(
      els.agentMessage,
      "Sending cancellation request to the backend…"
    );

    try {
      const { data } = await apiRequest(
        API.cancelJob(job.id),
        {
          method: "POST",
          body: {}
        }
      );

      const status = String(data?.status || "").toLowerCase();

      const confirmed =
        data?.cancelled === true ||
        data?.canceled === true ||
        [
          "cancelled",
          "canceled",
          "stopped"
        ].includes(status);

      const accepted =
        data?.cancel_requested === true;

      if (confirmed) {
        state.activeJob = null;

        clearSavedJob();

        stopPolling();

        setAgentState(
          "Cancelled",
          "neutral",
          "The backend confirmed that this job was cancelled."
        );

        addActivity(
          "Job cancelled",
          `Job ${job.id} was cancelled.`,
          "Ⅱ"
        );

        showToast(
          "Job cancellation confirmed.",
          "success"
        );

        syncControls();

        return;
      }

      if (accepted) {
        /*
         * HTTP 202 means the cancellation request was accepted.
         * It does NOT prove that a Gemini call or scanner stopped.
         * Keep the job active and continue checking its status.
         */

        state.pollingPaused = false;

        setText(
          els.agentMessage,
          "Cancellation accepted. Waiting for the worker to reach its next safe checkpoint."
        );

        showToast(
          "Cancellation request accepted. Waiting for confirmation.",
          "info"
        );

        schedulePoll(CONFIG.pollInterval);

        return;
      }

      if (data?.status === "completed" || data?.status === "failed") {
        state.pollingPaused = false;
        schedulePoll(500);

        return;
      }

      throw new Error(
        "The backend did not confirm cancellation or accept a cancellation request."
      );

    } catch (error) {
      setText(
        els.agentMessage,
        `Cancellation not confirmed: ${friendlyError(error)}`
      );

      showToast(
        friendlyError(error),
        "error"
      );

      state.pollingPaused = false;

      schedulePoll(CONFIG.pollInterval);

    } finally {
      els.cancelJob.disabled = false;
      els.cancelSecurityJob.disabled = false;
      syncControls();
    }
  }

  // =========================================================================
  // 25. PROCESS COMPLETED JOB
  // =========================================================================

  async function finishJob(kind, result) {
    if (kind === "build") {
      const files =
        result?.generated_files ||
        result?.files ||
        result?.output_files ||
        result?.artifacts ||
        [];

      if (files.length) {
        addGeneratedFiles(files);
      }

      const validation =
        result?.build_validation ||
        result?.validation ||
        null;

      setText(els.sidebarBuildStatus, "Completed");

      setAgentState(
        "Build complete",
        "success",
        result?.message ||
        "Code generation completed. Review the generated source and validation results."
      );

      renderAgentSteps("completed", 100);

      if (validation) {
        const validationMessage =
          `${validation.status || "Validation finished"} · ` +
          `${(validation.errors || []).length} errors · ` +
          `${(validation.skipped || []).length} skipped checks.`;

        setText(
          els.agentMessage,
          `${safeText(result?.message, "Generation completed.")} ${validationMessage}`
        );
      }

      addActivity(
        "Code generation completed",
        `${state.files.size} generated project files are available for review.`,
        "⌘"
      );

      showToast(
        "Code generation completed. Review your files.",
        "success"
      );

      setActiveView("files");

      syncControls();

      return;
    }

    const candidate =
      result?.security_report ||
      result?.report ||
      result;

    state.report = normalizeReport(candidate);

    renderSecurityReport();

    setText(els.sidebarScanStatus, "Completed");

    setAgentState(
      "Assessment complete",
      "success",
      "Security assessment completed. Review findings and coverage gaps before deployment."
    );

    renderAgentSteps("completed", 100);

    addActivity(
      "Security assessment completed",
      `${state.findings.length} findings returned by the backend.`,
      "◇",
      state.report.generatedAt
    );

    showToast(
      "Security assessment completed.",
      "success"
    );

    setActiveView("security");

    syncControls();
  }

  // =========================================================================
  // 26. SECURITY REPORT NORMALISATION
  // =========================================================================

  function normalizeReport(raw) {
    const report =
      raw && typeof raw === "object"
        ? raw
        : {};

    return {
      status: safeText(
        report.status,
        "completed"
      ),

      generatedAt:
        report.generated_at ||
        report.created_at ||
        report.timestamp ||
        null,

      sourceHash:
        report.source_hash ||
        null,

      findings:
        Array.isArray(report.findings)
          ? report.findings
          : Array.isArray(report.issues)
            ? report.issues
            : [],

      coverage: normalizeCoverage(
        report.coverage ||
        report.checks ||
        report.coverage_summary ||
        []
      ),

      summary:
        report.summary &&
        typeof report.summary === "object"
          ? report.summary
          : {},

      tools:
        Array.isArray(report.tools)
          ? report.tools
          : [],

      platformChecks:
        Array.isArray(report.platform_checks)
          ? report.platform_checks
          : [],

      limitations:
        Array.isArray(report.limitations)
          ? report.limitations
          : [],

      raw: report
    };
  }

  function normalizeCoverage(value) {
    if (Array.isArray(value)) return value;

    if (value && typeof value === "object") {
      return Object.entries(value).map(
        ([key, item]) => {
          if (item && typeof item === "object") {
            return {
              id: key,
              ...item
            };
          }

          return {
            id: key,
            category: key,
            status: item
          };
        }
      );
    }

    return [];
  }

  function normalizeSeverity(value) {
    const severity = String(
      value || "informational"
    ).toLowerCase();

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

  function normalizeCoverageStatus(value) {
    const raw = String(value || "not_tested")
      .trim()
      .toLowerCase()
      .replace(/[ -]+/g, "_");

    const aliases = {
      pass: "passed",
      success: "passed",
      ok: "passed",

      fail: "failed",
      failure: "failed",

      finding: "findings",
      potential: "findings",

      not_run: "not-tested",
      not_checked: "not-tested",
      not_tested: "not-tested",

      not_applicable: "not-applicable",

      tool_error: "tool-error",
      error: "tool-error",

      skipped: "skipped",
      unsupported: "unsupported"
    };

    const result = aliases[raw] || raw.replace(/_/g, "-");

    const valid = [
      "passed",
      "failed",
      "findings",
      "not-tested",
      "not-applicable",
      "tool-error",
      "skipped",
      "unsupported"
    ];

    return valid.includes(result)
      ? result
      : "unknown";
  }

  // =========================================================================
  // 27. RENDER SECURITY REPORT
  // =========================================================================

  function renderSecurityReport() {
    const report = state.report;

    if (!report) return;

    state.findings = report.findings.map(
      (finding, index) => ({
        id: safeText(
          finding.id ||
          finding.finding_id,
          `finding-${index + 1}`
        ),

        checkId: safeText(
          finding.check_id,
          ""
        ),

        title: safeText(
          finding.title ||
          finding.name,
          "Untitled security finding"
        ),

        severity: normalizeSeverity(
          finding.severity
        ),

        confidence: safeText(
          finding.confidence,
          "Not provided"
        ),

        status: safeText(
          finding.status,
          "open"
        ).toLowerCase(),

        file: safeText(
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

        description: safeText(
          finding.description ||
          finding.evidence,
          "No description was returned."
        ),

        evidence: safeText(
          finding.evidence ||
          finding.description,
          "No specific source evidence was returned."
        ),

        attack: safeText(
          finding.attack_scenario ||
          finding.impact,
          "No attack scenario was provided."
        ),

        recommendation: safeText(
          finding.recommendation ||
          finding.remediation ||
          finding.fix,
          "No recommendation was provided."
        ),

        cwe: safeText(
          finding.cwe || finding.cwe_id,
          ""
        ),

        owasp: safeText(
          finding.owasp ||
          finding.owasp_category,
          ""
        ),

        tool: safeText(
          finding.tool,
          ""
        ),

        raw: finding
      })
    );

    state.coverage = report.coverage;

    const criticalHigh = state.findings.filter(
      (finding) =>
        ["critical", "high"].includes(finding.severity)
    ).length;

    const mediumLow = state.findings.filter(
      (finding) =>
        ["medium", "low"].includes(finding.severity)
    ).length;

    const notTested = state.coverage.filter(
      (item) =>
        normalizeCoverageStatus(item.status || item.result) === "not-tested"
    ).length;

    setText(els.criticalHigh, criticalHigh);
    setText(els.mediumLow, mediumLow);
    setText(els.notTested, notTested);

    setText(
      els.findingsSummary,
      `${state.findings.length} findings · ${state.coverage.length} coverage records`
    );

    setText(
      els.lastScan,
      `Last scan: ${formatDate(report.generatedAt)}`
    );

    const passed = state.coverage.filter(
      (item) =>
        normalizeCoverageStatus(item.status || item.result) === "passed"
    ).length;

    const failed = state.coverage.filter(
      (item) =>
        normalizeCoverageStatus(item.status || item.result) === "failed"
    ).length;

    const findings = state.coverage.filter(
      (item) =>
        normalizeCoverageStatus(item.status || item.result) === "findings"
    ).length;

    const notApplicable = state.coverage.filter(
      (item) =>
        normalizeCoverageStatus(item.status || item.result) === "not-applicable"
    ).length;

    setText(
      els.coverageText,
      `Passed: ${passed} · Findings: ${findings + failed} · Not tested: ${notTested} · N/A: ${notApplicable}`
    );

    setText(
      els.assessmentStatus,
      report.status === "completed"
        ? "Assessment complete"
        : report.status
    );

    setText(
      els.assessmentSubtext,
      "Review evidence, severity and coverage before deployment."
    );

    if (els.assessmentIcon) {
      els.assessmentIcon.classList.toggle(
        "is-success",
        state.findings.length === 0
      );

      els.assessmentIcon.classList.toggle(
        "is-warning",
        state.findings.length > 0 || notTested > 0
      );
    }

    setText(
      els.reportSummaryTitle,
      "Security report ready"
    );

    setText(
      els.reportSummaryText,
      `${state.findings.length} findings were returned. This assessment does not prove that the application is secure.`
    );

    setText(
      els.reportDate,
      `DATE ${formatDate(report.generatedAt)}`
    );

    setText(
      els.reportFindings,
      `${state.findings.length} FINDINGS`
    );

    renderFindings();

    renderCoverage();

    els.downloadReport.disabled = false;

    setText(
      els.sidebarScanStatus,
      "Available"
    );
  }

  // =========================================================================
  // 28. FINDINGS RENDERER
  // =========================================================================

  function renderFindings() {
    if (!els.findingsList) return;

    els.findingsList.replaceChildren();

    const severity =
      els.severityFilter?.value || "all";

    const requestedStatus =
      els.findingStatusFilter?.value || "all";

    const filtered = state.findings.filter(
      (finding) => {
        const severityMatch =
          severity === "all" ||
          finding.severity === severity;

        const statusMatch =
          requestedStatus === "all" ||
          finding.status.replace(/[_-]/g, " ") === requestedStatus;

        return severityMatch && statusMatch;
      }
    );

    if (!filtered.length) {
      const empty = makeElement(
        "div",
        "findings-empty"
      );

      empty.append(
        makeElement("span", "empty-shield", "◇"),

        makeElement(
          "strong",
          "",
          state.findings.length
            ? "No findings match these filters"
            : "No findings returned"
        ),

        makeElement(
          "p",
          "",
          state.findings.length
            ? "Change the selected filters to see the remaining findings."
            : "No findings were returned by the checks that ran. Review coverage and Not tested areas before treating the result as clean."
        )
      );

      els.findingsList.append(empty);

      return;
    }

    filtered.forEach((finding) => {
      const row = makeElement(
        "article",
        "finding-row"
      );

      const main = makeElement(
        "div",
        "finding-main"
      );

      const marker = makeElement(
        "span",
        `finding-severity-mark ${finding.severity}`
      );

      const copy = makeElement(
        "div",
        "finding-copy"
      );

      const titleLine = makeElement(
        "div",
        "finding-title-line"
      );

      titleLine.append(
        makeElement(
          "strong",
          "",
          finding.title
        ),

        makeElement(
          "span",
          `severity-badge ${finding.severity}`,
          finding.severity
        )
      );

      const description = makeElement(
        "p",
        "",
        truncate(finding.description, 230)
      );

      const meta = makeElement(
        "div",
        "finding-meta"
      );

      meta.append(
        makeElement("span", "", finding.id),
        makeElement(
          "span",
          "",
          `${finding.file}${finding.line ? `:${finding.line}` : ""}`
        ),
        makeElement(
          "span",
          "",
          `CONFIDENCE ${finding.confidence.toUpperCase()}`
        )
      );

      copy.append(
        titleLine,
        description,
        meta
      );

      main.append(marker, copy);

      const actions = makeElement(
        "div",
        "finding-actions"
      );

      const button = makeElement(
        "button",
        "finding-action",
        "View details"
      );

      button.type = "button";

      button.addEventListener("click", () => {
        openFinding(finding);
      });

      actions.append(button);

      row.append(main, actions);

      els.findingsList.append(row);
    });
  }

  // =========================================================================
  // 29. COVERAGE RENDERER
  // =========================================================================

  function renderCoverage() {
    els.coverageList.replaceChildren();

    if (!state.coverage.length) {
      els.coverageList.append(
        makeElement(
          "div",
          "coverage-placeholder",
          "No coverage details were returned. Unreported checks must not be assumed to have passed."
        )
      );

      return;
    }

    state.coverage.forEach((item) => {
      const status = normalizeCoverageStatus(
        item.status || item.result
      );

      const name = safeText(
        item.category ||
        item.check ||
        item.name ||
        item.id,
        "Security check"
      );

      const row = makeElement(
        "div",
        "coverage-item"
      );

      const copy = makeElement(
        "div",
        "coverage-copy"
      );

      copy.append(
        makeElement("strong", "", name),

        makeElement(
          "small",
          "coverage-evidence",
          safeText(
            item.evidence || item.note,
            "No evidence detail was returned."
          )
        )
      );

      row.append(copy);

      row.append(
        makeElement(
          "span",
          `coverage-status ${status}`,
          status === "findings"
            ? "Finding"
            : status.replace(/-/g, " ")
        )
      );

      els.coverageList.append(row);
    });
  }

  // =========================================================================
  // 30. SECURITY REPORT REFRESH
  // =========================================================================

  async function refreshSecurityReport(showErrors = false) {
    if (!state.projectId) return;

    try {
      const { data } = await apiRequest(
        API.securityReport(state.projectId),
        {
          method: "GET"
        }
      );

      const report =
        data?.security_report ||
        data?.report ||
        data;

      if (!report || typeof report !== "object") {
        return;
      }

      state.report = normalizeReport(report);

      renderSecurityReport();

    } catch (error) {
      // A not-yet-created report is a normal state.
      if (error.status === 404) return;

      if (error.status === 409 && error.data?.stale) {
        setText(
          els.assessmentStatus,
          "Report outdated"
        );

        setText(
          els.assessmentSubtext,
          "Project source changed. Run a fresh assessment."
        );

        if (showErrors) {
          showToast(error.message, "warning");
        }

        return;
      }

      if (showErrors) {
        showToast(friendlyError(error), "error");
      }
    }
  }

  // =========================================================================
  // 31. FINDING DETAIL MODAL
  // =========================================================================

  function openFinding(finding) {
    state.currentFinding = finding;

    state.previousModalFocus =
      document.activeElement;

    setText(
      els.findingModalTitle,
      finding.title
    );

    els.modalSeverity.className =
      `severity-badge ${finding.severity}`;

    setText(
      els.modalSeverity,
      finding.severity
    );

    setText(
      els.modalLocation,
      `${finding.file}${finding.line ? `:${finding.line}` : ""} · ${finding.id} · Confidence: ${finding.confidence}`
    );

    setText(
      els.modalEvidence,
      finding.evidence
    );

    setText(
      els.modalImpact,
      finding.attack
    );

    setText(
      els.modalFix,
      finding.recommendation
    );

    els.patchPreview.hidden = true;

    els.patchPreviewText.textContent = "";

    setText(
      els.fixMessage,
      "A remediation proposal can be generated for review. It will not be applied automatically."
    );

    els.requestFix.disabled = false;

    setText(
      els.requestFix,
      "Request fix proposal"
    );

    els.findingModal.hidden = false;

    document.body.classList.add("modal-open");

    els.closeFindingModal.focus();
  }

  function closeFinding() {
    els.findingModal.hidden = true;

    document.body.classList.remove("modal-open");

    if (
      state.previousModalFocus &&
      typeof state.previousModalFocus.focus === "function"
    ) {
      state.previousModalFocus.focus();
    }

    state.currentFinding = null;
  }

  // =========================================================================
  // 32. REMEDIATION PROPOSAL
  // =========================================================================

  async function requestFixProposal() {
    const finding = state.currentFinding;

    if (!finding || !state.projectId) return;

    els.requestFix.disabled = true;

    setText(
      els.requestFix,
      "Preparing proposal…"
    );

    setText(
      els.fixMessage,
      "Requesting a source-specific remediation proposal from the backend."
    );

    try {
      const { data } = await apiRequest(
        API.fix(
          state.projectId,
          finding.id
        ),
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

      const diff = safeText(
        proposal?.diff ||
        proposal?.patch ||
        proposal?.proposed_content ||
        proposal?.code ||
        proposal?.content ||
        (typeof proposal === "string" ? proposal : ""),
        "The backend returned no diff text."
      );

      els.patchPreviewText.textContent = diff;

      els.patchPreview.hidden = false;

      setText(
        els.fixMessage,
        data?.message ||
        "Proposal prepared. Review it carefully. No original project source was modified."
      );

      setText(
        els.requestFix,
        "Proposal prepared"
      );

      addActivity(
        "Fix proposal prepared",
        `A proposed fix was generated for ${finding.id}. No source file was changed.`,
        "✎"
      );

      showToast(
        "Fix proposal received. It has not been applied.",
        "success"
      );

    } catch (error) {
      setText(
        els.fixMessage,
        friendlyError(error)
      );

      setText(
        els.requestFix,
        "Request fix proposal"
      );

      showToast(
        friendlyError(error),
        "error"
      );

    } finally {
      els.requestFix.disabled = false;
    }
  }

  // =========================================================================
  // 33. COPY FILE CONTENTS
  // =========================================================================

  async function copySelectedFile() {
    const file = state.files.get(
      state.selectedFile
    );

    if (!file || typeof file.content !== "string") {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        file.content
      );

      showToast(
        "File contents copied.",
        "success"
      );

    } catch {
      showToast(
        "Clipboard permission was blocked. Copy the code from the preview manually.",
        "error"
      );
    }
  }

  // =========================================================================
  // 34. EXPORT PROJECT ZIP
  // =========================================================================

  async function exportProject() {
    if (
      !state.projectId ||
      !state.files.size
    ) {
      return;
    }

    els.exportProject.disabled = true;

    try {
      const token = getAuthToken();

      if (!token) {
        throw new Error(
          "Your sign-in session is missing."
        );
      }

      const response = await fetch(
        `${API_BASE_URL}${API.export(state.projectId)}`,
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

        const error = new Error(
          data?.error ||
          data?.message ||
          `Project export failed with HTTP ${response.status}.`
        );

        error.status = response.status;

        throw error;
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;

      link.download =
        `${safeFileName(state.project?.rootName)}.zip`;

      document.body.append(link);

      link.click();

      link.remove();

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        1500
      );

      addActivity(
        "Project exported",
        "The project ZIP archive was downloaded.",
        "↓"
      );

      showToast(
        "Project export downloaded.",
        "success"
      );

    } catch (error) {
      showToast(
        friendlyError(error),
        "error"
      );

    } finally {
      els.exportProject.disabled = false;
    }
  }

  // =========================================================================
  // 35. EXPORT SECURITY REPORT JSON
  // =========================================================================

  function exportSecurityReport() {
    if (!state.report) return;

    const payload = {
      schema_version: "phase4.security-report.v1",

      project_id: state.projectId,

      project_name: state.project?.name || "",

      generated_at: state.report.generatedAt,

      status: state.report.status,

      source_hash: state.report.sourceHash,

      summary: state.report.summary,

      findings: state.findings.map((finding) => ({
        id: finding.id,
        check_id: finding.checkId,
        title: finding.title,
        severity: finding.severity,
        confidence: finding.confidence,
        status: finding.status,
        file: finding.file,
        line: finding.line,
        description: finding.description,
        evidence: finding.evidence,
        attack_scenario: finding.attack,
        recommendation: finding.recommendation,
        cwe: finding.cwe,
        owasp: finding.owasp,
        tool: finding.tool
      })),

      coverage: state.coverage,

      tools: state.report.tools,

      platform_checks: state.report.platformChecks,

      limitations: state.report.limitations
    };

    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `${safeFileName(state.project?.rootName)}-security-report.json`;

    document.body.append(link);

    link.click();

    link.remove();

    window.setTimeout(
      () => URL.revokeObjectURL(url),
      1500
    );

    showToast(
      "Security report exported.",
      "success"
    );
  }

  // =========================================================================
  // 36. EVENT BINDING
  // =========================================================================

  function bindEvents() {
    bindNavigation();

    // Master prompt.
    els.masterPrompt?.addEventListener(
      "input",
      () => {
        setText(
          els.masterPromptCount,
          `${els.masterPrompt.value.length.toLocaleString()} / ${CONFIG.maxMasterPromptLength.toLocaleString()}`
        );

        updateAnalyzeButton();

        if (!els.emptyError.hidden) {
          setError(els.emptyError, "");
        }
      }
    );

    els.masterPromptConsent?.addEventListener(
      "change",
      updateAnalyzeButton
    );

    els.analyzeButton?.addEventListener(
      "click",
      analyzeMasterPrompt
    );

    // New project and reload.
    els.newProject?.addEventListener(
      "click",
      startNewProject
    );

    els.refresh?.addEventListener(
      "click",
      loadProject
    );

    els.retryLoad?.addEventListener(
      "click",
      loadProject
    );

    // Manifest review gate.
    els.manifestReviewed?.addEventListener(
      "change",
      syncControls
    );

    // Development prompt.
    els.developerPrompt?.addEventListener(
      "input",
      () => {
        setText(
          els.promptCount,
          `${els.developerPrompt.value.length.toLocaleString()} / ${CONFIG.maxTaskPromptLength.toLocaleString()}`
        );

        if (!els.buildError.hidden) {
          setError(els.buildError, "");
        }
      }
    );

    // Suggested task buttons.
    document.querySelectorAll("[data-prompt]").forEach((button) => {
      button.addEventListener("click", () => {
        els.developerPrompt.value =
          button.dataset.prompt || "";

        els.developerPrompt.dispatchEvent(
          new Event("input", { bubbles: true })
        );

        els.developerPrompt.focus();
      });
    });

    // Build, security scan and cancellation.
    els.buildButton?.addEventListener(
      "click",
      generateCode
    );

    els.scanButton?.addEventListener(
      "click",
      runSecurityScan
    );

    els.cancelJob?.addEventListener(
      "click",
      cancelCurrentJob
    );

    els.cancelSecurityJob?.addEventListener(
      "click",
      cancelCurrentJob
    );

    // File explorer.
    els.fileSearch?.addEventListener(
      "input",
      () => {
        renderFileTree(els.fileSearch.value);
      }
    );

    els.copyFile?.addEventListener(
      "click",
      copySelectedFile
    );

    // Exports.
    els.exportProject?.addEventListener(
      "click",
      exportProject
    );

    els.downloadReport?.addEventListener(
      "click",
      exportSecurityReport
    );

    // Security filters.
    els.severityFilter?.addEventListener(
      "change",
      renderFindings
    );

    els.findingStatusFilter?.addEventListener(
      "change",
      renderFindings
    );

    // Remediation modal.
    els.requestFix?.addEventListener(
      "click",
      requestFixProposal
    );

    els.closeFindingModal?.addEventListener(
      "click",
      closeFinding
    );

    els.closeFindingModalSecondary?.addEventListener(
      "click",
      closeFinding
    );

    els.findingModal?.addEventListener(
      "click",
      (event) => {
        if (event.target === els.findingModal) {
          closeFinding();
        }
      }
    );

    // Keyboard handling for the modal.
    document.addEventListener(
      "keydown",
      (event) => {
        if (!els.findingModal || els.findingModal.hidden) {
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          closeFinding();
          return;
        }

        if (event.key !== "Tab") return;

        const focusable = [
          ...els.findingModal.querySelectorAll(
            "button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1'])"
          )
        ].filter(
          (item) =>
            !item.hidden &&
            item.offsetParent !== null
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
    );

    // Stop browser polling on unload. This does not cancel the server job.
    window.addEventListener(
      "beforeunload",
      stopPolling
    );
  }

  // =========================================================================
  // 37. INITIALIZATION
  // =========================================================================

  function initialize() {
    bindEvents();

    setText(
      els.masterPromptCount,
      "0 / 50,000"
    );

    setText(
      els.promptCount,
      "0 / 12,000"
    );

    renderAgentSteps("queued", 0);

    setAgentState(
      "Idle",
      "neutral",
      "Paste a master prompt to create an independent Phase 4 project."
    );

    renderActivity();

    syncControls();

    showEmptyState();

    loadProject();

    updateAnalyzeButton();
  }

  // =========================================================================
  // 38. START
  // =========================================================================

  initialize();

})();