import { ModelResponseError, parseMuseumResponse } from "./futures.mjs";

const DEFAULT_MODEL_ID =
  "arn:aws:bedrock:us-east-1:322037002015:inference-profile/us.openai.gpt-6-astra";

export function createBedrockClient({
  token = process.env.AWS_BEARER_TOKEN_BEDROCK,
  region = process.env.AWS_REGION || "us-east-1",
  modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("This app requires Node.js 20 or newer.");
  }

  return {
    async createExhibit(prompt, { signal } = {}) {
      if (!token) {
        const error = new Error(
          "The museum is missing AWS_BEARER_TOKEN_BEDROCK. Add it to .env.local and restart.",
        );
        error.statusCode = 503;
        throw error;
      }

      const endpoint = buildConverseEndpoint({ region, modelId });
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          system: [
            {
              text: "Follow the requested JSON schema exactly. Return JSON only, with no markdown.",
            },
          ],
          messages: [
            {
              role: "user",
              content: [{ text: prompt }],
            },
          ],
          inferenceConfig: {
            maxTokens: 5000,
          },
          performanceConfig: {
            latency: "standard",
          },
          additionalModelRequestFields: {},
        }),
        signal,
      });

      const payload = await readPayload(response);

      if (!response.ok) {
        const detail =
          payload?.message ||
          payload?.error?.message ||
          `Bedrock returned HTTP ${response.status}.`;
        const error = new Error(humanizeBedrockError(response.status, detail));
        error.statusCode = response.status === 429 ? 429 : 502;
        throw error;
      }

      const text = extractText(payload);
      return {
        exhibit: parseMuseumResponse(text),
        usage: payload.usage || null,
        stopReason: payload.stopReason || null,
      };
    },
  };
}

export function buildConverseEndpoint({ region, modelId }) {
  const encodedModelId = encodeURIComponent(modelId);
  return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodedModelId}/converse`;
}

export function extractText(payload) {
  const content = payload?.output?.message?.content;
  if (!Array.isArray(content)) {
    throw new ModelResponseError("Bedrock returned no readable transmission.");
  }

  const text = content
    .filter((block) => typeof block?.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new ModelResponseError("Bedrock returned no readable transmission.");
  }

  return text;
}

async function readPayload(response) {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw.slice(0, 500) };
  }
}

function humanizeBedrockError(status, detail) {
  if (status === 401 || status === 403) {
    return "The museum key was rejected or expired. Replace AWS_BEARER_TOKEN_BEDROCK and restart.";
  }

  if (status === 429) {
    return "Too many futures are being opened at once. Wait a moment and try again.";
  }

  return `The future went quiet: ${String(detail).slice(0, 300)}`;
}
