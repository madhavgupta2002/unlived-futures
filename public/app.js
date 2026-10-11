const $ = (selector) => document.querySelector(selector);
const horizons = [1, 3, 5, 10, 20];
const timelineColors = ["#d9ff57", "#ab8cff", "#62e7ff"];

const elements = {
  form: $("#futureForm"),
  seed: $("#seed"),
  horizon: $("#horizon"),
  characterCount: $("#characterCount"),
  intakeView: $("#intakeView"),
  loadingView: $("#loadingView"),
  museumView: $("#museumView"),
  modelStatus: $("#modelStatus"),
  loadingIndex: $("#loadingIndex"),
  loadingTitle: $("#loadingTitle"),
  loadingDetail: $("#loadingDetail"),
  loadingProgress: $("#loadingProgress"),
  timelineMap: $("#timelineMap"),
  timelineTabs: $("#timelineTabs"),
  timelineExhibit: $("#timelineExhibit"),
  toast: $("#toast"),
};

let currentCatalog = null;
let currentRequestId = null;
let loadingTimer = null;
let toastTimer = null;

const loadingStages = [
  ["Locating the first divergence", "Comparing choices that have not happened yet."],
  ["Scanning abandoned timelines", "Looking for consequences with fingerprints."],
  ["Recovering future artifacts", "Dusting off objects from adjacent realities."],
  ["Contacting your future selves", "Signal quality is strange but improving."],
  ["Cataloging the convergence", "Finding what survives every possible choice."],
];

checkHealth();
restoreLastSeed();

elements.seed.addEventListener("input", () => {
  elements.characterCount.textContent = `${elements.seed.value.length} / 1200`;
  localStorage.setItem("fork6:lastSeed", elements.seed.value);
});

elements.horizon.addEventListener("input", updateHorizonTrack);
updateHorizonTrack();

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.seed.value = button.dataset.example;
    elements.seed.dispatchEvent(new Event("input"));
    elements.seed.focus();
  });
});

elements.form.addEventListener("submit", openTimelines);

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    if (!elements.intakeView.classList.contains("hidden")) {
      elements.form.requestSubmit();
    }
  }
});

$("#newExhibitButton").addEventListener("click", resetMuseum);
$("#downloadButton").addEventListener("click", downloadCatalog);

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    const label = elements.modelStatus.querySelector("span:last-child");
    if (health.configured) {
      elements.modelStatus.classList.add("ready");
      label.textContent = `${health.model} / ONLINE`;
    } else {
      label.textContent = "KEY REQUIRED";
    }
  } catch {
    elements.modelStatus.querySelector("span:last-child").textContent = "MUSEUM OFFLINE";
  }
}

async function openTimelines(event) {
  event.preventDefault();
  const seed = elements.seed.value.trim();
  if (seed.length < 8) {
    showToast("Give the museum at least a full thought to work with.");
    elements.seed.focus();
    return;
  }

  const requestId = crypto.randomUUID();
  currentRequestId = requestId;
  showLoading();

  try {
    const response = await fetch("/api/foresee", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Museum-Request-Id": requestId,
      },
      body: JSON.stringify({
        seed,
        tone: new FormData(elements.form).get("tone"),
        horizon: horizons[Number(elements.horizon.value)],
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The future refused to open.");
    if (currentRequestId !== requestId) return;

    currentCatalog = payload;
    localStorage.setItem("fork6:lastCatalog", JSON.stringify(payload));
    renderMuseum(payload);
  } catch (error) {
    if (currentRequestId !== requestId) return;
    showToast(error.message);
    showView(elements.intakeView);
  } finally {
    stopLoading();
  }
}

function showLoading() {
  showView(elements.loadingView);
  let stage = 0;
  updateLoadingStage(stage);
  loadingTimer = setInterval(() => {
    stage = Math.min(stage + 1, loadingStages.length - 1);
    updateLoadingStage(stage);
  }, 2600);
}

function updateLoadingStage(stage) {
  const [title, detail] = loadingStages[stage];
  elements.loadingIndex.textContent = `${String(stage + 1).padStart(2, "0")} / 05`;
  elements.loadingTitle.textContent = title;
  elements.loadingDetail.textContent = detail;
  elements.loadingProgress.style.width = `${8 + stage * 21}%`;
}

function stopLoading() {
  clearInterval(loadingTimer);
  loadingTimer = null;
}

function renderMuseum(catalog) {
  const { exhibit } = catalog;
  $("#exhibitTitle").textContent = exhibit.exhibitTitle;
  $("#curatorNote").textContent = exhibit.curatorNote;
  $("#deepQuestion").textContent = `“${exhibit.questionBehindQuestion}”`;
  $("#invariant").textContent = exhibit.convergence.invariant;
  $("#avoidance").textContent = exhibit.convergence.avoidance;
  $("#experiment").textContent = exhibit.convergence.experiment;
  $("#wildcard").textContent = exhibit.wildcard;
  $("#accessionNumber").textContent = `ACCESSION F6—${accessionFrom(catalog.generatedAt)}`;

  renderTimelineControls(exhibit.timelines);
  selectTimeline(0);
  showView(elements.museumView);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderTimelineControls(timelines) {
  elements.timelineMap.querySelectorAll(".map-node").forEach((node) => node.remove());
  elements.timelineTabs.replaceChildren();

  timelines.forEach((timeline, index) => {
    const color = timelineColors[index];
    const mapNode = document.createElement("button");
    mapNode.className = "map-node";
    mapNode.type = "button";
    mapNode.style.setProperty("--timeline-color", color);
    mapNode.innerHTML = `
      <span class="map-dot">${escapeHtml(timeline.symbol)}</span>
      <strong>${escapeHtml(timeline.name)}</strong>
      <small>${timeline.probability}% SIGNAL</small>
    `;
    mapNode.addEventListener("click", () => selectTimeline(index));
    elements.timelineMap.append(mapNode);

    const tab = document.createElement("button");
    tab.className = "timeline-tab";
    tab.type = "button";
    tab.style.setProperty("--timeline-color", color);
    tab.innerHTML = `
      <span>0${index + 1}</span>
      <strong>${escapeHtml(timeline.name)}</strong>
    `;
    tab.addEventListener("click", () => selectTimeline(index));
    elements.timelineTabs.append(tab);
  });
}

function selectTimeline(index) {
  if (!currentCatalog) return;
  const timeline = currentCatalog.exhibit.timelines[index];
  const color = timelineColors[index];

  elements.timelineMap.querySelectorAll(".map-node").forEach((node, nodeIndex) => {
    node.classList.toggle("active", nodeIndex === index);
  });
  elements.timelineTabs.querySelectorAll(".timeline-tab").forEach((tab, tabIndex) => {
    tab.classList.toggle("active", tabIndex === index);
  });

  elements.timelineExhibit.style.setProperty("--timeline-color", color);
  $("#exhibitNumber").textContent = `OBJECT 0${index + 1}`;
  $("#timelineChoice").textContent = timeline.choice;
  $("#artifactSymbol").textContent = timeline.symbol;
  $("#artifactYear").textContent = `RECOVERED / ${timeline.artifact.year}`;
  $("#artifactName").textContent = timeline.artifact.name;
  $("#artifactLabel").textContent = timeline.artifact.label;
  $("#worldCopy").textContent = timeline.world;
  $("#transmissionCopy").textContent = `“${timeline.transmission}”`;
  $("#hiddenCost").textContent = timeline.hiddenCost;
  $("#unexpectedGift").textContent = timeline.unexpectedGift;
  $("#firstMove").textContent = timeline.firstMove;

  elements.timelineExhibit.animate(
    [
      { opacity: 0.35, transform: "translateY(7px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 300, easing: "ease-out" },
  );
}

function resetMuseum() {
  currentRequestId = null;
  showView(elements.intakeView);
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => elements.seed.focus(), 350);
}

function downloadCatalog() {
  if (!currentCatalog) return;
  const title = currentCatalog.exhibit.exhibitTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const blob = new Blob([JSON.stringify(currentCatalog, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fork-6-${title || "exhibit"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function showView(view) {
  [elements.intakeView, elements.loadingView, elements.museumView].forEach((item) => {
    item.classList.toggle("hidden", item !== view);
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), 6500);
}

function restoreLastSeed() {
  const seed = localStorage.getItem("fork6:lastSeed");
  if (seed) {
    elements.seed.value = seed;
    elements.seed.dispatchEvent(new Event("input"));
  }
}

function updateHorizonTrack() {
  const percentage = (Number(elements.horizon.value) / 4) * 100;
  elements.horizon.style.background = `linear-gradient(90deg, var(--acid) ${percentage}%, #42433f ${percentage}%)`;
}

function accessionFrom(date) {
  return String(new Date(date).getTime()).slice(-6);
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value);
  return node.innerHTML;
}
