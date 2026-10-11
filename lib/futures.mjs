export const MAX_SEED_LENGTH = 1200;
export const VALID_TONES = new Set(["luminous", "ruthless", "strange"]);
export const VALID_HORIZONS = new Set([1, 3, 5, 10, 20]);

export function validateRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UserInputError("Send a JSON object describing the future to explore.");
  }

  const seed = typeof value.seed === "string" ? value.seed.trim() : "";
  const tone = VALID_TONES.has(value.tone) ? value.tone : "luminous";
  const numericHorizon = Number(value.horizon);
  const horizon = VALID_HORIZONS.has(numericHorizon) ? numericHorizon : 5;

  if (seed.length < 8) {
    throw new UserInputError("Give the museum at least a full thought to work with.");
  }

  if (seed.length > MAX_SEED_LENGTH) {
    throw new UserInputError(`Keep the idea under ${MAX_SEED_LENGTH} characters.`);
  }

  return { seed, tone, horizon };
}

export function buildMuseumPrompt({ seed, tone, horizon }) {
  const toneGuidance = {
    luminous:
      "Be imaginative and hopeful without becoming sentimental. Preserve real tradeoffs and uncertainty.",
    ruthless:
      "Be candid, strategically sharp, and unsparing about opportunity costs. Avoid empty pessimism.",
    strange:
      "Take one intellectually defensible leap into the surreal. Keep cause and effect coherent.",
  };

  return `You are the curator of FORK/6, a museum containing artifacts from futures that never happened.

Visitor's seed:
${seed}

Exhibit horizon: ${horizon} years
Curatorial lens: ${tone}
Lens direction: ${toneGuidance[tone]}

Construct exactly three radically different but plausible timelines. Each must emerge from a specific choice the visitor could make now. Make the futures concrete, personal, surprising, and causally coherent. Avoid generic self-help language, startup clichés, and vague fortune-telling.

Return only valid JSON matching this schema:
{
  "exhibitTitle": "2-6 vivid words",
  "curatorNote": "A two-sentence synthesis that names the real tension in the seed.",
  "questionBehindQuestion": "The deeper question the visitor is actually asking.",
  "timelines": [
    {
      "id": "short-kebab-case",
      "name": "2-4 evocative words",
      "symbol": "one unicode symbol, not an emoji face",
      "choice": "The concrete choice that opens this future.",
      "world": "A vivid 90-140 word account of how this future unfolds.",
      "artifact": {
        "year": ${new Date().getFullYear()} + integer from 1 to ${horizon},
        "name": "A specific physical or digital object from this future.",
        "label": "A museum placard explaining what the object reveals."
      },
      "transmission": "A candid 35-60 word note written by the visitor's future self.",
      "hiddenCost": "A non-obvious cost.",
      "unexpectedGift": "A non-obvious benefit.",
      "firstMove": "A safe, specific action that takes under 30 minutes today.",
      "probability": integer from 18 to 82
    }
  ],
  "convergence": {
    "invariant": "What remains true across all three futures.",
    "avoidance": "What the visitor may be avoiding admitting.",
    "experiment": "A reversible 7-day experiment that produces useful evidence."
  },
  "wildcard": "One final, delightful possibility none of the timelines expected."
}`;
}

export function parseMuseumResponse(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new ModelResponseError("The model returned an empty exhibit.");
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new ModelResponseError("The model imagined an exhibit the museum could not decode.");
  }

  assertMuseumShape(parsed);
  return parsed;
}

function assertMuseumShape(value) {
  if (!value || typeof value !== "object") {
    throw new ModelResponseError("The exhibit is missing its catalog.");
  }

  const requiredStrings = [
    "exhibitTitle",
    "curatorNote",
    "questionBehindQuestion",
    "wildcard",
  ];

  if (requiredStrings.some((field) => !isText(value[field]))) {
    throw new ModelResponseError("The exhibit catalog is incomplete.");
  }

  if (!Array.isArray(value.timelines) || value.timelines.length !== 3) {
    throw new ModelResponseError("The model must return exactly three timelines.");
  }

  for (const timeline of value.timelines) {
    const fields = [
      "id",
      "name",
      "symbol",
      "choice",
      "world",
      "transmission",
      "hiddenCost",
      "unexpectedGift",
      "firstMove",
    ];

    if (!timeline || fields.some((field) => !isText(timeline[field]))) {
      throw new ModelResponseError("One timeline arrived with missing details.");
    }

    if (
      !timeline.artifact ||
      !Number.isFinite(Number(timeline.artifact.year)) ||
      !isText(timeline.artifact.name) ||
      !isText(timeline.artifact.label)
    ) {
      throw new ModelResponseError("One timeline is missing its future artifact.");
    }

    timeline.probability = clamp(Number(timeline.probability) || 50, 1, 99);
  }

  if (
    !value.convergence ||
    !isText(value.convergence.invariant) ||
    !isText(value.convergence.avoidance) ||
    !isText(value.convergence.experiment)
  ) {
    throw new ModelResponseError("The timelines never reached a convergence.");
  }
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserInputError";
    this.statusCode = 400;
  }
}

export class ModelResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModelResponseError";
    this.statusCode = 502;
  }
}
