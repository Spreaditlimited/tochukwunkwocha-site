const { json, badMethod } = require("./_lib/http");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const bankName = String(process.env.MANUAL_BANK_NAME || "").trim();
  const accountName = String(process.env.MANUAL_BANK_ACCOUNT_NAME || "").trim();
  const accountNumber = String(process.env.MANUAL_BANK_ACCOUNT_NUMBER || "").trim();
  const note = String(process.env.MANUAL_BANK_NOTE || "").trim();

  return json(200, {
    ok: true,
    details: {
      bankName,
      accountName,
      accountNumber,
      note,
      currency: "NGN",
      amountLabel: "N10,750",
    },
  });
};
