
"use strict";

/*
 * Phase 2: AI Backend Folder Structure + Flow Visualizer
 * Supports Express.js and Flask.
 * Includes a customized AI code-generation prompt.
 */

const API_BASE_URL = "https://web-dev-backend-g976.onrender.com";

const frameworkTabs = document.querySelectorAll(".framework-tab");
const sampleTree = document.getElementById("sampleTree");
const sampleDescription = document.getElementById("sampleDescription");
const frameworkBadge = document.getElementById("frameworkBadge");

const ideaForm = document.getElementById("ideaForm");
const websiteIdea = document.getElementById("websiteIdea");
const characterCount = document.getElementById("characterCount");
const generateButton = document.getElementById("generateButton");
const buttonText = document.getElementById("buttonText");
const errorMessage = document.getElementById("errorMessage");

const resultSection = document.getElementById("resultSection");
const resultSummary = document.getElementById("resultSummary");
const generatedTree = document.getElementById("generatedTree");
const copyButton = document.getElementById("copyButton");
const copyStatus = document.getElementById("copyStatus");

let selectedFramework = "express";
let latestFolderText = "";

/* Sample folder structures */
const demoTrees = {
  express: [
    { path: "package.json", type: "file", purpose: "Project dependencies and scripts" },
    { path: "server.js", type: "file", purpose: "Starts the Express server" },
    { path: "src/", type: "folder", purpose: "Application code" },
    { path: "src/routes/", type: "folder", purpose: "API endpoints" },
    { path: "src/controllers/", type: "folder", purpose: "Handles incoming requests" },
    { path: ".env.example", type: "file", purpose: "Example environment settings" }
  ],

  flask: [
    { path: "app.py", type: "file", purpose: "Flask application and API routes" },
    { path: "requirements.txt", type: "file", purpose: "Python dependencies" },
    { path: "routes/", type: "folder", purpose: "API endpoints" },
    { path: "models.py", type: "file", purpose: "Data models" },
    { path: "db.py", type: "file", purpose: "Database connection" },
    { path: ".env.example", type: "file", purpose: "Example environment settings" }
  ]
};

const frameworkNames = {
  express: {
    name: "JavaScript + Express.js",
    shortName: "Express.js",
    description: "A starter structure for a JavaScript + Express.js backend."
  },

  flask: {
    name: "Python + Flask",
    shortName: "Flask",
    description: "A starter structure for a Python + Flask backend."
  }
};

/* Render a folder tree */
function renderTree(container, nodes, rootName = "backend/") {
  container.replaceChildren();

  const rootRow = document.createElement("div");
  rootRow.className = "tree-row root-row";

  const rootIcon = document.createElement("span");
  rootIcon.className = "tree-icon";
  rootIcon.textContent = "📁";

  const rootLabel = document.createElement("span");
  rootLabel.className = "tree-name";
  rootLabel.textContent = rootName;

  const rootPurpose = document.createElement("span");
  rootPurpose.className = "tree-purpose";
  rootPurpose.textContent = "Backend project root";

  rootRow.append(rootIcon, rootLabel, rootPurpose);
  container.append(rootRow);

  nodes.forEach((node) => {
    const row = document.createElement("div");
    row.className = "tree-row";

    const cleanPath = String(node.path || "").trim();
    const segments = cleanPath.split("/").filter(Boolean);
    const depth = Math.max(0, segments.length - 1);

    row.style.paddingLeft = `${depth * 20 + 6}px`;

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = node.type === "folder" ? "📁" : "📄";

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = cleanPath;

    const purpose = document.createElement("span");
    purpose.className = "tree-purpose";
    purpose.textContent = String(node.purpose || "");

    row.append(icon, name, purpose);
    container.append(row);
  });
}

/* Display the example for the selected framework */
function renderSelectedDemo() {
  const info = frameworkNames[selectedFramework];

  frameworkTabs.forEach((tab) => {
    const active = tab.dataset.framework === selectedFramework;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  sampleDescription.textContent = info.description;
  frameworkBadge.textContent = info.shortName;

  renderTree(sampleTree, demoTrees[selectedFramework]);

  resultSection.hidden = true;
  latestFolderText = "";
  copyStatus.textContent = "";
  errorMessage.hidden = true;

  // Remove the previous customized prompt when switching frameworks.
  const codingPromptSection =
    document.getElementById("codingPromptSection");

  if (codingPromptSection) {
    codingPromptSection.remove();
  }
}

/* Framework switching */
frameworkTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const framework = tab.dataset.framework;

    if (!frameworkNames[framework]) return;

    selectedFramework = framework;
    renderSelectedDemo();
  });
});

/* Character counter */
websiteIdea.addEventListener("input", () => {
  characterCount.textContent = `${websiteIdea.value.length} / 3000`;
});

/* Validate the API response */
function validateFolderPlan(data) {
  if (
    !data ||
    typeof data.project_summary !== "string" ||
    !Array.isArray(data.folders)
  ) {
    throw new Error("The AI returned an unexpected folder structure.");
  }

  const allowedTypes = new Set(["folder", "file"]);

  const folders = data.folders.map((item) => {
    if (
      !item ||
      typeof item.path !== "string" ||
      !allowedTypes.has(item.type) ||
      typeof item.purpose !== "string"
    ) {
      throw new Error("The AI returned an invalid folder entry.");
    }

    const path = item.path.trim();

    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").includes("..")
    ) {
      throw new Error("The AI returned an invalid path.");
    }

    return {
      path,
      type: item.type,
      purpose: item.purpose
    };
  });

  if (folders.length === 0) {
    throw new Error("No folders or files were returned.");
  }

  return {
    project_summary: data.project_summary,
    root_name:
      typeof data.root_name === "string" && data.root_name.trim()
        ? data.root_name.trim()
        : "backend/",
    folders
  };
}

/* Create plain-text output for copying */
function createPlainTextTree(plan) {
  const lines = [plan.root_name];

  plan.folders.forEach((item) => {
    const depth = Math.max(
      0,
      item.path.split("/").filter(Boolean).length - 1
    );

    const indent = "  ".repeat(depth);
    const icon = item.type === "folder" ? "[DIR]" : "[FILE]";

    lines.push(`${indent}${icon} ${item.path} — ${item.purpose}`);
  });

  return lines.join("\n");
}

/* Create the backend flow section */
function createFlowSection() {
  let section = document.getElementById("backendFlowSection");

  if (section) return section;

  section = document.createElement("section");
  section.id = "backendFlowSection";

  Object.assign(section.style, {
    marginTop: "30px",
    padding: "24px",
    background: "#fffaf0",
    border: "1px solid #c9c4ad",
    borderRadius: "12px",
    boxShadow: "0 5px 15px rgba(0, 0, 0, 0.08)",
    boxSizing: "border-box"
  });

  const heading = document.createElement("h2");
  heading.textContent = "How Your Backend Works";

  Object.assign(heading.style, {
    textAlign: "left",
    color: "brown"
  });

  const intro = document.createElement("p");
  intro.id = "backendFlowIntro";

  Object.assign(intro.style, {
    textAlign: "left",
    color: "#6b5632",
    lineHeight: "1.6"
  });

  const notice = document.createElement("p");

  notice.textContent =
    "Architecture preview: this flow is inferred from the generated folder structure, not verified against running backend code.";

  Object.assign(notice.style, {
    fontSize: "13px",
    color: "#806f35",
    textAlign: "left",
    lineHeight: "1.6"
  });

  const flowList = document.createElement("div");
  flowList.id = "backendFlowList";

  Object.assign(flowList.style, {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  });

  section.append(heading, intro, notice, flowList);
  resultSection.append(section);

  return section;
}

/* Identify possible backend components from generated paths */
function inferFlowStages(plan, framework) {
  const entries = plan.folders;

  function findEntry(patterns) {
    return entries.find((entry) => {
      const searchable =
        `${entry.path} ${entry.purpose}`.toLowerCase();

      return patterns.some((pattern) =>
        searchable.includes(pattern)
      );
    });
  }

  const routeEntry = findEntry([
    "routes/",
    "route",
    "endpoint",
    "api/",
    "blueprint"
  ]);

  const controllerEntry = findEntry([
    "controller",
    "handler",
    "view function",
    "request handler"
  ]);

  const serviceEntry = findEntry([
    "service",
    "business logic",
    "business rules",
    "use case"
  ]);

  const validationEntry = findEntry([
    "validation",
    "validator",
    "schema",
    "input checking"
  ]);

  const modelEntry = findEntry([
    "models.py",
    "model",
    "entity",
    "schema",
    "database table"
  ]);

  const databaseEntry = findEntry([
    "db.py",
    "database",
    "repository",
    "repositories",
    "database connection",
    "database access"
  ]);

  const authEntry = findEntry([
    "auth",
    "authentication",
    "authorization",
    "middleware",
    "permission"
  ]);

  const stages = [
    {
      title: "Incoming Request",
      file: framework === "express" ? "server.js" : "app.py",
      description:
        framework === "express"
          ? "The Express server receives an HTTP request from the frontend."
          : "The Flask application receives an HTTP request from the frontend."
    }
  ];

  if (authEntry) {
    stages.push({
      title: "Authentication / Middleware",
      file: authEntry.path,
      description:
        "This component may check the user's identity, permissions, or request conditions."
    });
  }

  if (routeEntry) {
    stages.push({
      title: "Find the API Endpoint",
      file: routeEntry.path,
      description:
        "The routing layer matches the request URL and HTTP method to the appropriate endpoint."
    });
  }

  if (validationEntry) {
    stages.push({
      title: "Validate Input",
      file: validationEntry.path,
      description:
        "The input is checked before the application processes it."
    });
  }

  if (controllerEntry) {
    stages.push({
      title: "Handle the Request",
      file: controllerEntry.path,
      description:
        "The controller or handler coordinates the work needed for this request."
    });
  }

  if (serviceEntry) {
    stages.push({
      title: "Apply Business Logic",
      file: serviceEntry.path,
      description:
        "The service layer performs the application's main rules and operations."
    });
  }

  if (modelEntry) {
    stages.push({
      title: "Work With Data Models",
      file: modelEntry.path,
      description:
        "The model layer represents or organizes the data used by the application."
    });
  }

  if (databaseEntry) {
    stages.push({
      title: "Database Operation",
      file: databaseEntry.path,
      description:
        "This component may connect to the database, retrieve records, or save changes."
    });
  }

  stages.push({
    title: "Return the Response",
    file: routeEntry
      ? routeEntry.path
      : framework === "express"
        ? "server.js"
        : "app.py",
    description:
      "The backend returns a response, usually JSON with data or a message, to the frontend."
  });

  return stages;
}

/* Render the flow using beige, brown, and muted gold */
function renderBackendFlow(plan, framework) {
  createFlowSection();

  const flowList = document.getElementById("backendFlowList");
  const intro = document.getElementById("backendFlowIntro");

  flowList.replaceChildren();

  intro.textContent =
    `Proposed request flow for your ${frameworkNames[framework].name} project. ` +
    "The steps below use matching paths from your generated structure where available.";

  const stages = inferFlowStages(plan, framework);

  stages.forEach((stage, index) => {
    const card = document.createElement("article");

    Object.assign(card.style, {
      display: "flex",
      gap: "14px",
      alignItems: "flex-start",
      padding: "16px",
      border: "1px solid #e5e1d5",
      borderRadius: "10px",
      background: index % 2 === 0 ? "#faf9f5" : "#ffffff",
      boxSizing: "border-box"
    });

    const number = document.createElement("div");
    number.textContent = String(index + 1);

    Object.assign(number.style, {
      flex: "0 0 34px",
      height: "34px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      background: "#b9b38c",
      color: "#ffffff",
      fontWeight: "700"
    });

    const content = document.createElement("div");

    Object.assign(content.style, {
      minWidth: "0",
      flex: "1"
    });

    const title = document.createElement("h3");
    title.textContent = stage.title;

    Object.assign(title.style, {
      margin: "0 0 8px",
      fontSize: "16px",
      color: "brown"
    });

    const file = document.createElement("code");
    file.textContent = stage.file;

    Object.assign(file.style, {
      display: "inline-block",
      maxWidth: "100%",
      marginBottom: "8px",
      padding: "5px 8px",
      border: "1px solid #e5e1d5",
      borderRadius: "5px",
      background: "#f1eee3",
      color: "#6b5632",
      overflowWrap: "anywhere",
      whiteSpace: "normal",
      boxSizing: "border-box"
    });

    const description = document.createElement("p");
    description.textContent = stage.description;

    Object.assign(description.style, {
      margin: "0",
      color: "#6b5632",
      lineHeight: "1.6",
      textAlign: "left"
    });

    content.append(title, file, description);
    card.append(number, content);
    flowList.append(card);

    if (index < stages.length - 1) {
      const arrow = document.createElement("div");
      arrow.textContent = "↓";

      Object.assign(arrow.style, {
        textAlign: "center",
        color: "#806f35",
        fontSize: "22px",
        lineHeight: "1"
      });

      flowList.append(arrow);
    }
  });
}

/* ==========================================
   CUSTOM AI CODE GENERATION PROMPT
========================================== */

function renderCodingPrompt(idea, plan, framework) {
  let section = document.getElementById("codingPromptSection");

  if (!section) {
    section = document.createElement("section");
    section.id = "codingPromptSection";

    Object.assign(section.style, {
      marginTop: "30px",
      padding: "24px",
      background: "#fffaf0",
      border: "1px solid #c9c4ad",
      borderRadius: "12px",
      boxShadow: "0 5px 15px rgba(0, 0, 0, 0.08)",
      boxSizing: "border-box"
    });

    const heading = document.createElement("h2");
    heading.textContent = "AI Code Generation Prompt";

    Object.assign(heading.style, {
      color: "brown",
      textAlign: "left",
      marginTop: "0"
    });

    const description = document.createElement("p");
    description.textContent =
      "This prompt is customized to your idea and generated folder structure. Copy it into your preferred AI coding tool to generate your project code.";

    Object.assign(description.style, {
      color: "#6b5632",
      lineHeight: "1.6",
      textAlign: "left"
    });

    const promptBox = document.createElement("textarea");
    promptBox.id = "codingPromptText";
    promptBox.readOnly = true;
    promptBox.rows = 20;
    promptBox.setAttribute(
      "aria-label",
      "Customized AI code generation prompt"
    );

    Object.assign(promptBox.style, {
      display: "block",
      width: "100%",
      minHeight: "360px",
      padding: "16px",
      boxSizing: "border-box",
      resize: "vertical",
      border: "1px solid #c9c4ad",
      borderRadius: "8px",
      background: "#ffffff",
      color: "#263449",
      font: "14px/1.6 Consolas, monospace",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere"
    });

    const actions = document.createElement("div");

    Object.assign(actions.style, {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "14px",
      marginTop: "14px"
    });

    const copyPromptButton = document.createElement("button");
    copyPromptButton.type = "button";
    copyPromptButton.id = "copyPromptButton";
    copyPromptButton.textContent = "Copy Prompt";

    Object.assign(copyPromptButton.style, {
      padding: "11px 20px",
      border: "none",
      borderRadius: "7px",
      background: "brown",
      color: "#ffffff",
      fontWeight: "600",
      cursor: "pointer"
    });

    const status = document.createElement("span");
    status.id = "codingPromptStatus";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.style.color = "#6b5632";

    copyPromptButton.addEventListener("click", async () => {
      const text = promptBox.value;

      if (!text.trim()) {
        status.textContent = "No prompt is available to copy.";
        return;
      }

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          promptBox.focus();
          promptBox.select();

          const copied = document.execCommand("copy");

          if (!copied) {
            throw new Error("Clipboard copy was blocked.");
          }
        }

        status.textContent = "Prompt copied successfully!";
      } catch (error) {
        console.error("Prompt copy failed:", error);
        status.textContent =
          "Copy failed. Select the prompt and press Ctrl+C.";
      }
    });

    actions.append(copyPromptButton, status);
    section.append(heading, description, promptBox, actions);
  }

const promptBox = section.querySelector("#codingPromptText");
const status = section.querySelector("#codingPromptStatus");

if (!promptBox || !status) {
  console.error("Coding prompt textarea or status element is missing.");
  return;
}

  // Build the tree from the actual generated folder plan.
  const folderTree = [
    plan.root_name,
    ...plan.folders.map((item) => {
      const depth = Math.max(
        0,
        item.path.split("/").filter(Boolean).length - 1
      );

      const indent = "  ".repeat(depth);
      const type = item.type === "folder" ? "[FOLDER]" : "[FILE]";

      return `${indent}${type} ${item.path} — ${item.purpose}`;
    })
  ].join("\n");

  const frameworkDetails = {
    express: {
      name: "JavaScript with Node.js and Express.js",
      setup: "Use npm and the package.json scripts."
    },

    flask: {
      name: "Python with Flask",
      setup: "Use Python, a virtual environment, and requirements.txt."
    }
  };

  const selected = frameworkDetails[framework];

  if (!selected) {
    throw new Error("Please select a supported backend framework.");
  }

  promptBox.value = `Act as a senior full-stack software engineer.

PROJECT IDEA:
${idea}

PROJECT SUMMARY:
${plan.project_summary}

SELECTED BACKEND:
${selected.name}

YOUR TASK:
Generate a complete, working implementation based on the user's
actual project idea and the folder structure provided below.

EXACT GENERATED FOLDER STRUCTURE:
${folderTree}

REQUIREMENTS:
1. Follow the project idea and its requested features.
2. Generate complete code for every required file in the structure.
3. Keep file names and paths consistent with the generated structure.
4. Make imports, routes, modules, and file references work together.
5. Implement the frontend-to-backend integration required by the idea.
6. Add database models, schemas, and connections where needed.
7. Validate user input and handle errors appropriately.
8. Use secure authentication and authorization if required.
9. Never hardcode passwords, API keys, or other secrets.
10. Include dependencies and an example environment file when needed.
11. Do not leave essential features as pseudocode or empty placeholders.
12. Do not add unrelated features that the user did not request.
13. If an essential file is missing from the structure, explain why
    it is needed and show the additional file clearly.

OUTPUT FORMAT:
1. Briefly explain the project architecture.
2. Show the final folder structure.
3. Provide the complete code for each file, one file at a time.
4. Label every code block with its exact relative file path.
5. Include dependency installation and environment setup instructions.
6. Include database setup instructions if a database is required.
7. Explain how to start and test the project.
8. Check that imports, API endpoints, and file references are consistent.

SETUP GUIDANCE:
${selected.setup}

IMPORTANT:
Use the user's project idea and the exact generated folder structure.
Do not claim the code has been tested unless it has actually been run.
Generate code that is consistent across all files.`;

  status.textContent = "";

  // Place the prompt directly below the existing flowchart.
  const flowSection = document.getElementById("backendFlowSection");

  if (flowSection) {
    flowSection.insertAdjacentElement("afterend", section);
  } else {
    resultSection.append(section);
  }
}

/* Submit the website idea to the Flask API */
ideaForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const idea = websiteIdea.value.trim();

  if (idea.length < 10) {
    errorMessage.textContent =
      "Please describe your website idea in a little more detail.";

    errorMessage.hidden = false;
    websiteIdea.focus();
    return;
  }

  if (idea.length > 3000) {
    errorMessage.textContent =
      "Please keep your website description within 3000 characters.";

    errorMessage.hidden = false;
    return;
  }

  generateButton.disabled = true;
  buttonText.textContent = "Understanding your idea...";
  errorMessage.hidden = true;
  resultSection.hidden = true;
  copyStatus.textContent = "";

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/generate-folder-structure`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          idea,
          framework: selectedFramework
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `The server returned error ${response.status}.`
      );
    }

    const plan = validateFolderPlan(data);

    renderTree(generatedTree, plan.folders, plan.root_name);

    resultSummary.textContent = plan.project_summary;
    latestFolderText = createPlainTextTree(plan);

    // Keep the existing backend flowchart.
    renderBackendFlow(plan, selectedFramework);

    // NEW: Generate the customized prompt below the flowchart.
    renderCodingPrompt(idea, plan, selectedFramework);

    resultSection.hidden = false;

    resultSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    console.error("Folder structure generation failed:", error);

    errorMessage.textContent =
      error.message ||
      "Unable to generate the folder structure. Check your Flask server and API settings.";

    errorMessage.hidden = false;
  } finally {
    generateButton.disabled = false;
    buttonText.textContent = "Generate Folder Structure";
  }
});

/* Copy the generated folder structure */
copyButton.addEventListener("click", async () => {
  if (!latestFolderText) return;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(latestFolderText);
    } else {
      const temp = document.createElement("textarea");

      temp.value = latestFolderText;
      temp.setAttribute("readonly", "");
      temp.style.position = "fixed";
      temp.style.opacity = "0";

      document.body.append(temp);
      temp.select();
      temp.setSelectionRange(0, temp.value.length);

      const copied = document.execCommand("copy");

      temp.remove();

      if (!copied) {
        throw new Error("Copy was blocked.");
      }
    }

    copyStatus.textContent = "Folder structure copied!";
  } catch (error) {
    console.error("Copy failed:", error);

    copyStatus.textContent =
      "Copy failed. Select the structure and press Ctrl+C.";
  }
});

/* Initial page setup */
renderSelectedDemo();
