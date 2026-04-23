export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const { caseText } = req.body;
  if (!caseText || !caseText.trim()) {
    return res.status(400).json({ error: 'No case text provided.' });
  }

  const SYSTEM_PROMPT = `You are a clinical reasoning assistant for medical education. Your role is to organise patient case information into a structured clinical reasoning report.

IMPORTANT: You do NOT diagnose. You do NOT recommend treatments. You organise, extract, and suggest possible condition CATEGORIES for further clinical investigation.

When given a patient case, respond ONLY with a valid JSON object in this exact structure:
{
  "summary": "One to two sentence plain-language summary of the case",
  "chief_complaint": "The primary concern in the patient's own words or close paraphrase",
  "key_symptoms": ["symptom 1", "symptom 2"],
  "symptom_timeline": "Brief description of onset, duration, progression",
  "relevant_history": "Relevant past medical, social, or lifestyle factors",
  "red_flags": ["any concerning features that warrant urgent attention"],
  "positive_findings": ["notable positive findings from history"],
  "negative_findings": ["relevant negatives mentioned or implied"],
  "condition_categories": [
    {"category": "Category name", "rationale": "Why this category is relevant based on symptoms"}
  ],
  "suggested_workup": ["Suggested investigation types e.g. bloods, imaging — not specific orders"],
  "clinical_narrative": "A 150-200 word structured clinical narrative in SOAP-style prose without diagnosis"
}

Return ONLY the JSON. No preamble, no markdown fences.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Patient case:\n\n${caseText}` }]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      return res.status(anthropicRes.status).json({
        error: err.error?.message || `Anthropic API error ${anthropicRes.status}`
      });
    }

    const data = await anthropicRes.json();
    const raw = data.content.map(b => b.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const report = JSON.parse(clean);

    return res.status(200).json(report);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Unexpected server error.' });
  }
}
