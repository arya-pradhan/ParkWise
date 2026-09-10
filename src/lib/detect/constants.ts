/**
 * The shipped model. The filename is content-hashed, so it can be cached
 * immutably (see the /models header rule in next.config.ts) — which also means
 * this string must change whenever the model is re-exported.
 */
export const MODEL_URL = '/models/parkwise-416.47903169.onnx';

/** Roughly what the fp32 graph weighs, for the loading progress readout. */
export const MODEL_BYTES = 28_289_798;
