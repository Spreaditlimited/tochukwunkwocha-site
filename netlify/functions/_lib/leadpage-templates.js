const TEMPLATE_VERSION = "v1.0.0";

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function norm(value) {
  return clean(value, 8000).toLowerCase();
}

const TEMPLATES = [
  {
    id: "real_estate_lead",
    name: "Real Estate Lead Capture",
    category: "Real Estate",
    keywords: ["real estate", "property", "realtor", "land", "apartment", "rent", "mortgage"],
    sections: ["hero", "benefits", "listings-proof", "faq", "contact-cta"],
    voiceGuidance: "Trust-first, local market credibility, urgency without hype.",
  },
  {
    id: "legal_consult_lead",
    name: "Legal Consultation Lead Capture",
    category: "Legal",
    keywords: ["legal", "law", "attorney", "lawyer", "litigation", "compliance", "contract"],
    sections: ["hero", "practice-areas", "authority-proof", "faq", "consultation-cta"],
    voiceGuidance: "Clear, reassuring, professional, confidentiality-forward.",
  },
  {
    id: "clinic_booking_lead",
    name: "Clinic / Medical Booking",
    category: "Healthcare",
    keywords: ["clinic", "medical", "dental", "hospital", "health", "doctor", "diagnostic"],
    sections: ["hero", "services", "trust-signals", "faq", "appointment-cta"],
    voiceGuidance: "Empathetic, credibility-focused, safety and outcomes oriented.",
  },
  {
    id: "beauty_booking_lead",
    name: "Beauty / Spa Booking",
    category: "Beauty",
    keywords: ["beauty", "spa", "salon", "skincare", "aesthetic", "lashes", "nails"],
    sections: ["hero", "signature-services", "before-after-proof", "offers", "booking-cta"],
    voiceGuidance: "Confident, premium, visual-outcome-driven.",
  },
  {
    id: "home_services_lead",
    name: "Home Services Lead Capture",
    category: "Home Services",
    keywords: ["plumbing", "electrical", "cleaning", "repairs", "installation", "furniture", "painting"],
    sections: ["hero", "problem-solution", "service-areas", "pricing-trust", "call-cta"],
    voiceGuidance: "Fast-response, reliability, practical value.",
  },
  {
    id: "coaching_consulting_lead",
    name: "Coaching / Consulting",
    category: "Consulting",
    keywords: ["coach", "coaching", "consult", "strategy", "advisory", "mentor", "growth"],
    sections: ["hero", "outcomes", "framework", "case-snippets", "session-cta"],
    voiceGuidance: "Outcome-oriented, authority with warmth.",
  },
  {
    id: "training_course_lead",
    name: "Training / Course Enrollment",
    category: "Education",
    keywords: ["course", "training", "class", "bootcamp", "learn", "academy", "program"],
    sections: ["hero", "curriculum", "who-its-for", "proof", "enroll-cta"],
    voiceGuidance: "Beginner-friendly clarity, transformation focus.",
  },
  {
    id: "event_booking_lead",
    name: "Event Registration",
    category: "Events",
    keywords: ["event", "conference", "summit", "webinar", "workshop", "ticket", "register"],
    sections: ["hero", "agenda-highlights", "speakers-proof", "logistics", "register-cta"],
    voiceGuidance: "Energy + clarity, logistical confidence.",
  },
  {
    id: "b2b_services_lead",
    name: "B2B Services Lead Capture",
    category: "B2B",
    keywords: ["b2b", "enterprise", "saas", "procurement", "operations", "agency", "outsourcing"],
    sections: ["hero", "business-pain", "solution-fit", "roi-proof", "demo-cta"],
    voiceGuidance: "Direct, value-led, ROI and process confidence.",
  },
  {
    id: "general_service_lead",
    name: "General Service Lead Capture",
    category: "General",
    keywords: ["service", "business", "professional", "support", "help", "solution", "offer"],
    sections: ["hero", "benefits", "social-proof", "faq", "contact-cta"],
    voiceGuidance: "Clear, practical, conversion-focused.",
  },
];

function briefToText(brief) {
  return [brief.businessType, brief.serviceOffer, brief.notes, brief.primaryGoal, brief.targetLocation]
    .map(function (v) {
      return norm(v);
    })
    .join(" ");
}

function scoreTemplate(template, text) {
  let score = 0;
  const matchedKeywords = [];

  template.keywords.forEach(function (kw) {
    const needle = norm(kw);
    if (!needle) return;
    if (text.includes(needle)) {
      score += needle.includes(" ") ? 3 : 2;
      matchedKeywords.push(kw);
    }
  });

  return {
    score,
    matchedKeywords,
  };
}

function getTemplateById(id) {
  const key = clean(id, 80);
  return TEMPLATES.find(function (t) {
    return t.id === key;
  }) || null;
}

function selectTemplateForBrief(brief) {
  const text = briefToText(brief);
  let selected = getTemplateById("general_service_lead");
  let selectedScore = -1;
  let selectedMatches = [];

  TEMPLATES.forEach(function (template) {
    const result = scoreTemplate(template, text);
    if (result.score > selectedScore) {
      selected = template;
      selectedScore = result.score;
      selectedMatches = result.matchedKeywords;
      return;
    }

    if (result.score === selectedScore && result.matchedKeywords.length > selectedMatches.length) {
      selected = template;
      selectedScore = result.score;
      selectedMatches = result.matchedKeywords;
    }
  });

  return {
    template: selected,
    score: selectedScore,
    matchedKeywords: selectedMatches,
    version: TEMPLATE_VERSION,
  };
}

function buildTemplatePrompt(input) {
  const template = input && input.template ? input.template : getTemplateById("general_service_lead");
  const brief = input && input.brief ? input.brief : {};

  const lines = [
    `Template ID: ${template.id}`,
    `Template Name: ${template.name}`,
    `Category: ${template.category}`,
    `Voice guidance: ${template.voiceGuidance}`,
    `Required sections to support: ${template.sections.join(", ")}`,
    "Copy constraints:",
    "- Keep headline direct and benefit-first",
    "- Subheadline should reduce friction and clarify next step",
    "- Offer should include specific value and differentiator",
    "- CTA must be action-oriented and short",
    "Business brief:",
    `- Business name: ${clean(brief.businessName, 220)}`,
    `- Business type: ${clean(brief.businessType, 160)}`,
    `- Service offer: ${clean(brief.serviceOffer, 280)}`,
    `- Location: ${clean(brief.targetLocation, 180)}`,
    `- Primary goal: ${clean(brief.primaryGoal, 320)}`,
    `- Tone: ${clean(brief.tone, 80)}`,
    `- Notes: ${clean(brief.notes, 1000)}`,
  ];

  return lines.join("\n");
}

function validateGeneratedContent(content) {
  const c = content && typeof content === "object" ? content : {};
  const issues = [];

  if (!clean(c.headline, 180)) issues.push("headline is required");
  if (!clean(c.subheadline, 500)) issues.push("subheadline is required");
  if (!clean(c.offer, 500)) issues.push("offer is required");
  if (!clean(c.cta, 80)) issues.push("cta is required");

  if (clean(c.headline, 300).length > 110) issues.push("headline too long");
  if (clean(c.cta, 200).length > 36) issues.push("cta too long");

  return {
    ok: issues.length === 0,
    issues,
  };
}

module.exports = {
  TEMPLATE_VERSION,
  TEMPLATES,
  getTemplateById,
  selectTemplateForBrief,
  buildTemplatePrompt,
  validateGeneratedContent,
};
