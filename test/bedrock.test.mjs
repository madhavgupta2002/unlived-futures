import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConverseEndpoint,
  createBedrockClient,
  extractText,
} from "../lib/bedrock.mjs";

test("buildConverseEndpoint safely encodes an inference-profile ARN", () => {
  const endpoint = buildConverseEndpoint({
    region: "us-east-1",
    modelId: "arn:aws:bedrock:us-east-1:123:inference-profile/example/model",
  });

  assert.equal(
    endpoint,
    "https://bedrock-runtime.us-east-1.amazonaws.com/model/arn%3Aaws%3Abedrock%3Aus-east-1%3A123%3Ainference-profile%2Fexample%2Fmodel/converse",
  );
});

test("extractText joins standardized Converse text blocks", () => {
  const text = extractText({
    output: {
      message: {
        content: [{ text: "first" }, { image: {} }, { text: "second" }],
      },
    },
  });

  assert.equal(text, "first\nsecond");
});

test("client reports missing bearer token before network access", async () => {
  const client = createBedrockClient({
    token: "",
    fetchImpl: () => {
      throw new Error("network should not be called");
    },
  });

  await assert.rejects(
    client.createExhibit("prompt"),
    /AWS_BEARER_TOKEN_BEDROCK/,
  );
});

test("client omits unsupported sampling controls for GPT-6 Astra", async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  exhibitTitle: "Possible Machines",
                  curatorNote: "A real tension. A second sentence.",
                  questionBehindQuestion: "What deserves repetition?",
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
                    avoidance: "You know the first move.",
                    experiment: "Keep a decision journal for seven days.",
                  },
                  wildcard: "The side project becomes the map.",
                }),
              },
            ],
          },
        },
      }),
      { status: 200 },
    );
  };

  const client = createBedrockClient({ token: "temporary", fetchImpl });
  await client.createExhibit("prompt");

  assert.equal(requestBody.inferenceConfig.temperature, undefined);
  assert.equal(requestBody.inferenceConfig.topP, undefined);
  assert.deepEqual(requestBody.inferenceConfig, { maxTokens: 5000 });
});
