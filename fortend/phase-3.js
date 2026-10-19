const API_BASE_URL = "https://web-dev-backend-g976.onrender.com";

const frameworks = {
  mern: {
    name: "MERN",
    label: "MongoDB · Express · React · Node.js",
    recommendedDb: "mongodb"
  },
  mean: {
    name: "MEAN",
    label: "MongoDB · Express · Angular · Node.js",
    recommendedDb: "mongodb"
  },
  django: {
    name: "Django",
    label: "Python · Django",
    recommendedDb: "postgresql"
  },
  lamp: {
    name: "LAMP",
    label: "Linux · Apache · MySQL · PHP",
    recommendedDb: "mysql"
  },
  flask: {
    name: "Flask",
    label: "Python · Flask",
    recommendedDb: "postgresql"
  },
  spring: {
    name: "Spring Boot",
    label: "Java · Spring Boot",
    recommendedDb: "postgresql"
  }
};

const databases = [
  {
    id: "postgresql",
    name: "PostgreSQL",
    type: "Relational SQL",
    summary: "Strong default for production apps with connected data and complex queries.",
    pros: [
      "Reliable transactions and data integrity",
      "Great for relationships, reporting, and complex queries",
      "Suitable for many production workloads"
    ]
  },
  {
    id: "mysql",
    name: "MySQL / MariaDB",
    type: "Relational SQL",
    summary: "A practical fit for classic web apps, CMSs, ecommerce, and LAMP projects.",
    pros: [
      "Widely used in web hosting",
      "Good fit for structured records and relationships",
      "Well supported by PHP and Python stacks"
    ]
  },
  {
    id: "mongodb",
    name: "MongoDB",
    type: "Document NoSQL",
    summary: "Useful when records are naturally document-shaped and the schema may evolve.",
    pros: [
      "Flexible document structure",
      "Natural pairing with MERN and MEAN",
      "Convenient for nested JSON-like data"
    ]
  },
  {
    id: "sqlite",
    name: "SQLite",
    type: "Embedded SQL",
    summary: "Excellent for learning, prototypes, local tools, and smaller apps with modest write concurrency.",
    pros: [
      "No separate database server to run",
      "Simple setup and easy local development",
      "Supported directly by Django and Python"
    ]
  },
  {
    id: "firebase",
    name: "Firebase / Firestore",
    type: "Managed NoSQL",
    summary: "Useful when you want managed hosting and client-friendly realtime features.",
    pros: [
      "Managed infrastructure and quick setup",
      "Realtime features and authentication options",
      "Less database-server administration"
    ]
  }
];

const form = document.getElementById("ideaForm");
const ideaInput = document.getElementById("websiteIdea");
const frameworkInput = document.getElementById("framework");
const charCount = document.getElementById("charCount");
const modal = document.getElementById("databaseModal");
const databaseCards = document.getElementById("databaseCards");
const resultSection = document.getElementById("resultSection");
const generateBtn = document.getElementById("generateBtn");

let selectedDatabase = "postgresql";
let pendingIdea = "";
let pendingFramework = "flask";
let latestTree = "";
let latestPrompt = "";

ideaInput.addEventListener("input", () => {
  charCount.textContent = `${ideaInput.value.length} / 3000`;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  pendingIdea = ideaInput.value.trim();
  pendingFramework = frameworkInput.value;

  if (!pendingIdea) {
    ideaInput.focus();
    return;
  }

  selectedDatabase = frameworks[pendingFramework].recommendedDb;

  renderDatabaseOptions();
  modal.classList.remove("hidden");
});

document.getElementById("closeModalBtn").addEventListener("click", () => {
  modal.classList.add("hidden");
});

modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    modal.classList.add("hidden");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    modal.classList.add("hidden");
  }
});

function renderDatabaseOptions() {
  const recommended = frameworks[pendingFramework].recommendedDb;

  databaseCards.replaceChildren();

  databases.forEach((db) => {
    const label = document.createElement("label");

    label.className =
      "database-option" +
      (db.id === selectedDatabase ? " selected" : "");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "database";
    radio.value = db.id;
    radio.checked = db.id === selectedDatabase;

    radio.addEventListener("change", () => {
      selectedDatabase = db.id;
      renderDatabaseOptions();
    });

    const title = document.createElement("h3");
    title.textContent = db.name;

    const type = document.createElement("p");
    type.textContent = db.type;

    const summary = document.createElement("p");
    summary.textContent = db.summary;

    label.append(radio, title, type);

    if (db.id === recommended) {
      const tag = document.createElement("span");
      tag.className = "recommend-tag";
      tag.textContent =
        "SUGGESTED FOR " +
        frameworks[pendingFramework].name.toUpperCase();

      label.append(tag);
    }

    const list = document.createElement("ul");

    db.pros.forEach((pro) => {
      const li = document.createElement("li");
      li.textContent = pro;
      list.append(li);
    });

    label.append(summary, list);
    databaseCards.append(label);
  });

  document.getElementById("databaseIntro").textContent =
    `Your selected stack is ${frameworks[pendingFramework].name}. ` +
    "Choose a database below; the suggested option is a starting point " +
    "based on common use, not a strict requirement.";
}

generateBtn.addEventListener("click", generateBlueprint);

async function generateBlueprint() {
  if (!pendingIdea) return;

  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";

  document.getElementById("databaseNote").textContent =
    "Building your project blueprint. This can take a moment.";

  try {
    // The backend verifies this Google ID token and checks premium access.
    const googleToken = sessionStorage.getItem("google_id_token");

    if (!googleToken) {
      throw new Error("Please sign in with Google again to use Phase 3.");
    }

    const response = await fetch(
      `${API_BASE_URL}/api/generate-folder-structure`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phase: 3,
          idea: pendingIdea,
          framework: pendingFramework,
          database: selectedDatabase,
          token: googleToken
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(data.error || "Please sign in with Google again.");
      }
      if (response.status === 403) {
        throw new Error(data.error || "Phase 3 is for premium users. Your account is currently on the free plan.");
      }
      throw new Error(
        data.error || `The generator returned HTTP ${response.status}.`
      );
    }

    if (!data || !Array.isArray(data.folders)) {
      throw new Error(
        "The backend response did not include a valid folders array."
      );
    }

    const root =
      data.root_name ||
      slugify(pendingIdea) ||
      "my-project";

    latestTree = buildTree(data.folders, root);

    latestPrompt = buildMasterPrompt({
      idea: pendingIdea,
      framework: frameworks[pendingFramework],
      database: databases.find(
        (db) => db.id === selectedDatabase
      ),
      summary:
        data.project_summary ||
        "A project blueprint based on the idea provided.",
      tree: latestTree
    });

    document.getElementById("projectSummary").textContent =
      data.project_summary ||
      "Folder structure generated from your project idea.";

    document.getElementById("stackBadge").textContent =
      frameworks[pendingFramework].name;

    document.getElementById("databaseResult").textContent =
      databases.find((db) => db.id === selectedDatabase).name;

    document.getElementById("rootName").textContent = root;
    document.getElementById("generatedTree").textContent = latestTree;
    document.getElementById("codingPrompt").value = latestPrompt;

    document.getElementById("resultTitle").textContent =
      root.replace(/[-_]/g, " ") + " — project blueprint";

    document.getElementById("statusMessage").textContent =
      "Blueprint generated. Review the folder layout and adjust the prompt " +
      "to your project before using it.";

    modal.classList.add("hidden");
    resultSection.classList.remove("hidden");

    resultSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    document.getElementById("databaseNote").textContent =
      `${error.message} Check that the project-generation API is online, then try again.`;
  } finally {
    generateBtn.disabled = false;

    generateBtn.innerHTML =
      'Generate project blueprint <span aria-hidden="true">→</span>';
  }
}

function buildTree(folders, root) {
  const lines = [root + "/"];

  const paths = folders
    .map((item) =>
      String(item.path || "").replace(/^\/+|\/+$/g, "")
    )
    .filter(Boolean);

  const unique = [...new Set(paths)].sort(
    (a, b) => a.localeCompare(b)
  );

  unique.forEach((path, index) => {
    const parts = path.split("/");
    const depth = parts.length;
    const isLast = index === unique.length - 1;

    lines.push(
      `${"│   ".repeat(Math.max(0, depth - 1))}` +
      `${isLast ? "└── " : "├── "}` +
      parts[parts.length - 1]
    );
  });

  return lines.join("\n");
}

function buildMasterPrompt({
  idea,
  framework,
  database,
  summary,
  tree
}) {
  return `You are a senior full-stack software architect and implementation engineer.
Build a complete, runnable, maintainable project from the specification below. Do not stop at mockups or pseudocode.

PROJECT IDEA
${idea}

PROJECT SUMMARY
${summary}

TECH STACK
${framework.name}: ${framework.label}
Database: ${database.name} (${database.type})

DATABASE REQUIREMENTS
- Design a data model that fits the project rather than blindly following a generic schema.
- Define entities/collections, fields, types, constraints, relationships or references, and indexes.
- Explain why this database fits the project and mention any trade-offs.
- Include migrations or schema/setup instructions where appropriate.
- Use environment variables for credentials. Never hardcode secrets or commit real .env files.
- Include validation, safe error handling, and appropriate access controls.

SUGGESTED PROJECT STRUCTURE
${tree}

IMPLEMENTATION REQUIREMENTS
1. First inspect the complete specification and propose a concise implementation plan.
2. Implement all essential frontend, backend, and database files required by the chosen stack.
3. Include authentication only if the project needs it; protect private routes and validate authorization on the server.
4. Include input validation, useful loading/empty/error states, and accessible responsive UI.
5. Keep configuration separate from source code. Provide a safe .env.example with placeholder values.
6. Add useful comments only where the reasoning is not obvious. Avoid unnecessary abstractions and placeholder TODOs.
7. Include database initialization/migration or seed instructions where relevant.
8. Add tests for important business logic and API behavior.
9. Include a README with prerequisites, installation, environment setup, database setup, development commands, test commands, and deployment notes.
10. Do not claim a feature works unless you implement it. If a requirement is ambiguous, state a reasonable assumption before proceeding.
11. Before finishing, check imports, routes, dependencies, configuration names, and frontend/backend integration for consistency.

EXPECTED OUTPUT
- Show the final folder/file tree.
- Implement the files in a sensible order, explaining briefly what each group does.
- Provide exact commands to install dependencies and run the project locally.
- Provide example environment variables using placeholders only.
- Explain the database schema and how to initialize it.
- List tests and any remaining limitations.
- Make the project runnable end-to-end; do not omit critical files.

Start by confirming the assumptions and implementation plan, then build the project in small, verifiable steps.`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 45);
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);

    document.getElementById("statusMessage").textContent =
      successMessage;
  } catch {
    document.getElementById("statusMessage").textContent =
      "Clipboard access was blocked. Select the text and copy it manually.";
  }
}

document.getElementById("copyTreeBtn").addEventListener("click", () => {
  copyText(latestTree, "Folder structure copied.");
});

document.getElementById("copyPromptBtn").addEventListener("click", () => {
  copyText(latestPrompt, "Master prompt copied.");
});

document.getElementById("startOverBtn").addEventListener("click", () => {
  resultSection.classList.add("hidden");
  ideaInput.focus();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});