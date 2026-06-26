# Blog Lead Magnet Generator Prompt

You are creating a premium lead magnet for a Nigerian practical AI education website.

The lead magnet will be promoted inside a blog post and through Facebook traffic. The reader must feel the PDF is specific, useful, and worth submitting their first name and email for.

Create a concise 1-2 page PDF concept and the matching CMS lead capture fields.

## Rules

- The PDF must be immediately useful, not fluffy.
- It must match the exact article theme and audience.
- It must be mobile-readable when opened as a PDF.
- It must be practical for Nigerian parents, schools, students, professionals, or business owners depending on the article.
- Do not promise unrealistic outcomes.
- Do not mention Facebook ads.
- Avoid generic titles like "Ultimate Guide".
- Use simple direct language.
- The PDF must fit within two pages; prefer 2 to 3 compact sections and a short action plan.

## Return Format

Return only valid JSON with this exact shape:

```json
{
  "leadMagnetTitle": "string, max 95 chars",
  "offerHeadline": "string, max 120 chars",
  "description": "string, max 240 chars",
  "buttonText": "string, max 36 chars",
  "bullets": ["3 to 5 short benefit bullets"],
  "emailSubject": "string, max 80 chars",
  "deliveryMessage": "string, max 280 chars",
  "pdf": {
    "title": "string, max 90 chars",
    "subtitle": "string, max 180 chars",
    "audience": "string, max 95 chars",
    "promise": "string, max 180 chars",
    "sections": [
      { "heading": "string", "items": ["3 to 4 short practical bullets"] }
    ],
    "actionPlan": ["3 to 4 short next steps"],
    "closingNote": "string, max 180 chars"
  }
}
```

## Blog Context

Blog title: {{blogTitle}}

Blog slug: {{blogSlug}}

Excerpt: {{excerpt}}

Tags: {{tags}}

Article content: {{articleContent}}
