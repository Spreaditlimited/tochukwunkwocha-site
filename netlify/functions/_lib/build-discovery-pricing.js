function vatPercentFromEnv() {
  const raw = Number(process.env.SITE_VAT_PERCENT);
  if (!Number.isFinite(raw) || raw < 0) return 7.5;
  return raw;
}

function paystackFeeForMinor(amountMinor) {
  const amount = Math.max(0, Math.round(Number(amountMinor || 0)));
  if (amount <= 0) return 0;
  let fee = Math.round(amount * 0.015);
  if (amount >= 250000) fee += 10000;
  if (fee > 200000) fee = 200000;
  return Math.max(0, fee);
}

function buildDiscoveryPricing() {
  const baseMinor = 10000000; // N100,000.00
  const vatPercent = vatPercentFromEnv();
  const vatMinor = Math.round((baseMinor * vatPercent) / 100);
  const subtotalWithVatMinor = baseMinor + vatMinor;
  const paystackFeeMinor = paystackFeeForMinor(subtotalWithVatMinor);
  const payableMinor = subtotalWithVatMinor + paystackFeeMinor;
  return {
    currency: "NGN",
    baseMinor,
    vatPercent,
    vatMinor,
    paystackFeeMinor,
    payableMinor,
  };
}

module.exports = {
  buildDiscoveryPricing,
  paystackFeeForMinor,
};
