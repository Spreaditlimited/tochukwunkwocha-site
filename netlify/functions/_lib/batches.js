const PROMPT_TO_PROFIT_BATCHES = [
  {
    batchKey: "ptp-batch-1",
    batchLabel: "Batch 1",
    status: "closed",
    courseSlug: "prompt-to-profit",
    paystackReferencePrefix: "PTP",
    paystackAmountMinor: Number(process.env.PROMPT_TO_PROFIT_PRICE_NGN_MINOR || 1075000),
  },
];

function listPromptToProfitBatches() {
  return PROMPT_TO_PROFIT_BATCHES.slice();
}

function normalizeBatchKey(value) {
  return String(value || "").trim().toLowerCase().slice(0, 64);
}

function getDefaultPromptToProfitBatch() {
  const open = PROMPT_TO_PROFIT_BATCHES.find((item) => item.status === "open");
  return open || PROMPT_TO_PROFIT_BATCHES[0];
}

function getPromptToProfitBatchConfig(batchKey) {
  const normalized = normalizeBatchKey(batchKey);
  if (!normalized) return getDefaultPromptToProfitBatch();
  const exact = PROMPT_TO_PROFIT_BATCHES.find((item) => normalizeBatchKey(item.batchKey) === normalized);
  return exact || getDefaultPromptToProfitBatch();
}

module.exports = {
  listPromptToProfitBatches,
  normalizeBatchKey,
  getDefaultPromptToProfitBatch,
  getPromptToProfitBatchConfig,
};
