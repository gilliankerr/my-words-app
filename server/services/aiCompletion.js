/**
 * Shared OpenRouter completion configuration.
 *
 * Gemini 3.8 Flash does not support legacy sampling parameters such as
 * temperature, top_p, or top_k. Keep request normalization here so every
 * text-generation path uses the shared default unless it explicitly selects a
 * task-specific model and reasoning level. Overrides do not change AI_MODEL.
 */

const DEFAULT_AI_MODEL = 'google/gemini-3.8-flash';
const AI_REASONING = Object.freeze({ effort: 'medium' });

function getAIModel({ online = false, model } = {}) {
  const configuredModel = model || process.env.AI_MODEL || DEFAULT_AI_MODEL;
  const baseModel = configuredModel.replace(/:online$/, '');
  return online ? `${baseModel}:online` : baseModel;
}

function buildAIRequest(request, options = {}) {
  const {
    model: _model,
    reasoning: _reasoning,
    reasoning_effort: _legacyReasoningEffort,
    temperature: _temperature,
    top_p: _topP,
    top_k: _topK,
    provider: requestProvider,
    plugins: requestPlugins,
    ...supportedRequest
  } = request;

  const provider = {
    sort: 'throughput',
    ...(requestProvider || {})
  };

  const normalizedRequest = {
    model: getAIModel(options),
    reasoning: { effort: options.reasoningEffort || AI_REASONING.effort },
    ...supportedRequest,
    provider
  };

  if (options.json) {
    // Only route to providers that honour JSON mode, then repair common JSON
    // syntax mistakes before the response reaches application parsing.
    provider.require_parameters = true;
    normalizedRequest.response_format = supportedRequest.response_format || { type: 'json_object' };

    const plugins = Array.isArray(requestPlugins) ? [...requestPlugins] : [];
    if (!plugins.some(plugin => plugin?.id === 'response-healing')) {
      plugins.push({ id: 'response-healing' });
    }
    normalizedRequest.plugins = plugins;
  } else if (requestPlugins !== undefined) {
    normalizedRequest.plugins = requestPlugins;
  }

  return normalizedRequest;
}

function createAICompletion(client, request, options = {}, transportOptions) {
  return client.chat.completions.create(buildAIRequest(request, options), transportOptions);
}

module.exports = {
  DEFAULT_AI_MODEL,
  AI_REASONING,
  getAIModel,
  buildAIRequest,
  createAICompletion
};
