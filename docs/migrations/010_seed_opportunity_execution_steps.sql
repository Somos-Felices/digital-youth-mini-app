-- Safely seed missing execution steps for the three opportunity candidates.
-- Existing steps are preserved. Safe to rerun.

INSERT INTO opportunity_steps (
  opportunity_id, step_number, title, description, required_tools, expected_outcome
)
SELECT o.id, s.step_number, s.title, s.description, s.required_tools, s.expected_outcome
FROM earning_opportunities o
JOIN (
  SELECT 'phone-made-educational-content' slug, 1 step_number,
    'Choose one specific audience need' title,
    'Identify a narrow question or task a real person might find useful. Describe the intended audience, the task, and the useful outcome. Treat demand as a hypothesis.' description,
    JSON_ARRAY('Phone notes app') required_tools,
    'A one-sentence audience need and testable content hypothesis.' expected_outcome
  UNION ALL SELECT 'phone-made-educational-content', 2,
    'Create one short original piece',
    'Draft a concise explanation, demonstration, or visual note. Check factual claims and use only material you have rights to use.',
    JSON_ARRAY('Phone camera or built-in notes'),
    'One complete original draft suitable for review.'
  UNION ALL SELECT 'phone-made-educational-content', 3,
    'Verify a distribution and monetisation route',
    'Research publishing eligibility, phone support, discovery, monetisation thresholds, geography, fees, and payouts using official sources. Do not assume views generate income.',
    JSON_ARRAY('Official platform documentation'),
    'A dated platform assessment with unresolved requirements recorded.'

  UNION ALL SELECT 'downloadable-practical-resource', 1,
    'Choose a task worth making easier',
    'Select a specific task for which a worksheet, template, or guide may help. Describe who might use it and how. Treat demand as a hypothesis.',
    JSON_ARRAY('Phone notes app'),
    'A one-sentence user need and product hypothesis.'
  UNION ALL SELECT 'downloadable-practical-resource', 2,
    'Make a small original resource',
    'Create a usable worksheet, template, or short guide. Verify the authoring tool mobile support, export options, free limits, and terms. Test the file on a phone.',
    JSON_ARRAY('Phone-accessible authoring tool to be verified'),
    'One readable resource draft that opens on a phone.'
  UNION ALL SELECT 'downloadable-practical-resource', 3,
    'Check a self-serve route before listing',
    'Verify listing rules, fees, identity checks, payout setup, minimums, geography, and discovery using official sources. Record unknowns.',
    JSON_ARRAY('Official marketplace or storefront documentation'),
    'A dated distribution and payment requirements note; no sale is assumed.'

  UNION ALL SELECT 'reusable-digital-workflow-kit', 1,
    'Select one repeatable task',
    'Choose a small workflow and document its input, steps, and expected output. Exclude custom client work, sales calls, and dependencies on Somos Felices.',
    JSON_ARRAY('Phone notes app'),
    'A simple workflow outline and independent-use hypothesis.'
  UNION ALL SELECT 'reusable-digital-workflow-kit', 2,
    'Build and document a reusable version',
    'Create a checklist or template another person can use without custom delivery. Include instructions, example inputs, and an output check. Verify tool mobile support, privacy, free limits, and terms.',
    JSON_ARRAY('Phone-accessible document or checklist tool to be verified'),
    'One self-contained workflow asset with instructions and an example.'
  UNION ALL SELECT 'reusable-digital-workflow-kit', 3,
    'Test distribution and actual use',
    'Verify distribution, account, pricing, payout, and discovery conditions using dated official sources. Record actual user tests separately from assumptions. Count income only when payment is received.',
    JSON_ARRAY('Official distribution and tool documentation'),
    'A documented test plan and evidence record.'
) s ON s.slug = o.slug
WHERE NOT EXISTS (
  SELECT 1 FROM opportunity_steps existing
  WHERE existing.opportunity_id = o.id
    AND existing.step_number = s.step_number
);