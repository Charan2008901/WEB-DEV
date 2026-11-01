"use strict";

/*
 * Phase 2: AI Technology Stack Recommendation
 * This page recommends a stack from the user's project description.
 * It does not generate folders or code. Phase 3 remains a separate feature.
 */

const API_BASE_URL = "https://web-dev-backend-g976.onrender.com";

const ideaForm = document.getElementById("ideaForm");
const websiteIdea = document.getElementById("websiteIdea");
const characterCount = document.getElementById("characterCount");
const recommendButton = document.getElementById("recommendButton");
const buttonText = document.getElementById("buttonText");
const errorMessage = document.getElementById("errorMessage");
const resultSection = document.getElementById("resultSection");

const STACK_NAMES = {
  mern: "MERN Stack",
  mean: "MEAN Stack",
  django: "Python + Django",
  lamp: "LAMP Stack",
  flask: "Python + Flask",
  spring: "Java + Spring Boot"
};

const COMPLEXITY_LABELS = {
  beginner: "Beginner-friendly",
  intermediate: "Intermediate",
  advanced: "Advanced"
};

function setText(id, value, fallback = "Not specified") {
  const element = document.getElementById(id);

  if (element) {
    element.textContent =
      typeof value === "string" && value.trim()
        ? value.trim()
        : fallback;
  }
}

function setList(id, values) {
  const list = document.getElementById(id);

  if (!list) return;

  list.replaceChildren();

  if (!Array.isArray(values) || values.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No additional details provided.";
    list.append(item);
    return;
  }

  values.forEach((value) => {
    if (typeof value !== "string" || !value.trim()) return;

    const item = document.createElement("li");
    item.textContent = value.trim();
    list.append(item);
  });
}

function validateRecommendation(data) {
  const supportedStacks = new Set(Object.keys(STACK_NAMES));

  if (!data || typeof data !== "object") {
    throw new Error(
      "The server returned an invalid recommendation."
    );
  }

  if (!supportedStacks.has(data.recommended_stack)) {
    throw new Error(
      "The AI returned an unsupported technology stack. Please try again."
    );
  }

  if (!supportedStacks.has(data.alternative_stack)) {
    throw new Error(
      "The AI returned an invalid alternative stack. Please try again."
    );
  }

  const requiredTextFields = [
    "project_summary",
    "stack_full_name",
    "frontend",
    "backend",
    "database_name",
    "database_reason",
    "why_recommended",
    "alternative_reason"
  ];

  for (const field of requiredTextFields) {
    if (
      typeof data[field] !== "string" ||
      !data[field].trim()
    ) {
      throw new Error(
        "The AI returned an incomplete recommendation. Please try again."
      );
    }
  }

  const allowedComplexity = new Set([
    "beginner",
    "intermediate",
    "advanced"
  ]);

  if (!allowedComplexity.has(data.complexity)) {
    data.complexity = "intermediate";
  }

  for (const field of [
    "strengths",
    "tradeoffs",
    "next_steps"
  ]) {
    if (!Array.isArray(data[field])) {
      data[field] = [];
    }

    data[field] = data[field]
      .filter(
        (item) =>
          typeof item === "string" && item.trim()
      )
      .slice(0, 6);
  }

  return data;
}

function renderRecommendation(data) {
  setText(
    "recommendedStackTitle",
    `Recommended: ${STACK_NAMES[data.recommended_stack]}`
  );

  setText("resultSummary", data.project_summary);

  setText(
    "stackName",
    data.stack_name || STACK_NAMES[data.recommended_stack]
  );

  setText("stackFullName", data.stack_full_name);

  setText("whyRecommended", data.why_recommended);

  setText("frontendTechnology", data.frontend);

  setText("backendTechnology", data.backend);

  setText("databaseTechnology", data.database_name);

  setText(
    "databaseReason",
    data.database_reason,
    ""
  );

  setText(
    "complexityLevel",
    COMPLEXITY_LABELS[data.complexity]
  );

  setList("strengthsList", data.strengths);

  setList("tradeoffsList", data.tradeoffs);

  setText(
    "alternativeStackName",
    data.alternative_stack_name ||
      STACK_NAMES[data.alternative_stack]
  );

  setText(
    "alternativeReason",
    data.alternative_reason
  );

  setList("nextStepsList", data.next_steps);
}


// Character counter

websiteIdea.addEventListener("input", () => {
  characterCount.textContent =
    `${websiteIdea.value.length} / 3000`;
});


// Submit project idea and request a stack recommendation

ideaForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const idea = websiteIdea.value.trim();

  if (idea.length < 10) {
    errorMessage.textContent =
      "Please describe your idea in at least 10 characters.";

    errorMessage.hidden = false;

    websiteIdea.focus();

    return;
  }

  if (idea.length > 3000) {
    errorMessage.textContent =
      "Please keep your description within 3000 characters.";

    errorMessage.hidden = false;

    return;
  }

  recommendButton.disabled = true;

  buttonText.textContent = "Analysing your idea...";

  errorMessage.hidden = true;

  resultSection.hidden = true;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/recommend-stack`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          idea: idea
        })
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error ||
        `The server returned error ${response.status}.`
      );
    }

    const recommendation =
      validateRecommendation(data);

    renderRecommendation(recommendation);

    resultSection.hidden = false;

    resultSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  } catch (error) {
    console.error(
      "Technology stack recommendation failed:",
      error
    );

    errorMessage.textContent =
      error.message ||
      "Unable to recommend a stack. Check your internet connection and backend API.";

    errorMessage.hidden = false;

  } finally {
    recommendButton.disabled = false;

    buttonText.textContent =
      "Recommend a Technology Stack";
  }
});