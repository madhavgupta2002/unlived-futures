import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMuseumPrompt,
  ModelResponseError,
  parseMuseumResponse,
  UserInputError,
  validateRequest,
} from "../lib/futures.mjs";

const validExhibit = {
  exhibitTitle: "The Borrowed Compass",
  curatorNote: "A real tension. A second sentence.",
  questionBehindQuestion: "Which uncertainty deserves you?",
  timelines: [0, 1, 2].map((index) => ({
    id: `path-${index}`,
    name: `Path ${index}`,
    symbol: "◇",
    choice: "Choose a door.",
    world: "A detailed future unfolds from the choice.",
    artifact: {
      year: 2030 + index,
      name: `Artifact ${index}`,
      label: "A label describing its historical importance.",
    },
    transmission: "A message from the future.",
    hiddenCost: "Certainty.",
    unexpectedGift: "Range.",
    firstMove: "Write one paragraph.",
    probability: 40 + index,
  })),
  convergence: {
    invariant: "Attention compounds.",
    avoidance: "You already know the first move.",
    experiment: "Keep a decision journal for seven days.",
  },
  wildcard: "The side project becomes the map.",
};

test("validateRequest trims input and applies safe defaults", () => {
  assert.deepEqual(validateRequest({ seed: "  Build a memory garden  " }), {
    seed: "Build a memory garden",
    tone: "luminous",
    horizon: 5,
  });
});

test("validateRequest rejects an underspecified seed", () => {
  assert.throws(() => validateRequest({ seed: "Maybe" }), UserInputError);
});

test("buildMuseumPrompt includes visitor parameters and JSON constraint", () => {
  const prompt = buildMuseumPrompt({
    seed: "Create a school for impossible questions",
    tone: "strange",
    horizon: 10,
  });

  assert.match(prompt, /school for impossible questions/);
  assert.match(prompt, /Exhibit horizon: 10 years/);
  assert.match(prompt, /Return only valid JSON/);
});

test("parseMuseumResponse accepts fenced JSON and normalizes probability", () => {
  const exhibit = structuredClone(validExhibit);
  exhibit.timelines[0].probability = 140;
  const parsed = parseMuseumResponse(`\`\`\`json\n${JSON.stringify(exhibit)}\n\`\`\``);

  assert.equal(parsed.exhibitTitle, validExhibit.exhibitTitle);
  assert.equal(parsed.timelines[0].probability, 99);
});

test("parseMuseumResponse rejects incomplete catalogs", () => {
  const exhibit = structuredClone(validExhibit);
  exhibit.timelines.pop();
  assert.throws(() => parseMuseumResponse(JSON.stringify(exhibit)), ModelResponseError);
});
