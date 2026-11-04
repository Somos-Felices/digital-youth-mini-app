-- Bridge the three already researched candidates into the new opportunity
-- directory while retaining their original records in income_methods.
INSERT IGNORE INTO earning_opportunities (
  slug,title,provider,description,summary,earning_activity,category,official_url,application_url,
  eligible_countries,supported_languages,minimum_age,smartphone_compatible,device_requirements,
  internet_requirements,free_entry_conditions,identity_requirements,professional_requirements,
  experience_requirements,screening,work_allocation,asynchronous,availability,status,
  last_verified_at,next_review_at,is_published,value_created,intended_audience,
  monetisation_mechanism,distribution_mechanism,startup_costs,platform_restrictions,
  publication_status,qualification_status
)
SELECT m.slug,m.title,'Unverified distribution route',m.overview,m.summary,m.overview,m.category,
  NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),NULL,'unknown',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  'unknown','unknown',m.status,NULL,NULL,m.is_published,m.overview,NULL,m.income_mechanism,
  m.distribution,NULL,m.limitations,IF(m.is_published=1,'published','draft'),
  CASE m.status WHEN 'qualified' THEN 'qualified' WHEN 'under_validation' THEN 'under_validation'
    WHEN 'rejected' THEN 'disqualified' ELSE 'not_verified' END
FROM income_methods m
WHERE m.slug IN ('phone-made-educational-content','downloadable-practical-resource','reusable-digital-workflow-kit');

INSERT IGNORE INTO opportunity_criteria(opportunity_id,criterion_code,assessment,explanation,source_ids)
SELECT o.id,
  CASE c.criterion_code WHEN 'phone_and_free_tools' THEN 'phone_free_tools'
    WHEN 'independent_execution' THEN 'independent'
    WHEN 'no_credentials_or_preexisting_trust' THEN 'no_credentials'
    WHEN 'no_meetings_or_sales_calls' THEN 'no_meetings' END,
  c.assessment,c.explanation,JSON_ARRAY()
FROM income_methods m
JOIN earning_opportunities o ON o.slug=m.slug
JOIN income_method_criteria c ON c.method_id=m.id
WHERE m.slug IN ('phone-made-educational-content','downloadable-practical-resource','reusable-digital-workflow-kit');

INSERT INTO opportunity_sources(opportunity_id,title,url,source_type,claim,evidence_notes,reviewed_at,approval_status,is_approved)
SELECT o.id,s.title,s.url,s.source_type,s.supports_claim,s.supports_claim,s.last_verified_at,
  IF(s.is_approved=1,'approved','pending'),s.is_approved
FROM income_methods m
JOIN earning_opportunities o ON o.slug=m.slug
JOIN income_method_sources s ON s.method_id=m.id
WHERE m.slug IN ('phone-made-educational-content','downloadable-practical-resource','reusable-digital-workflow-kit')
  AND NOT EXISTS(SELECT 1 FROM opportunity_sources existing WHERE existing.opportunity_id=o.id AND existing.title=s.title AND existing.url=s.url);

INSERT IGNORE INTO opportunity_steps(opportunity_id,step_number,title,description,required_tools,expected_outcome)
SELECT o.id,s.step_number,s.title,CONCAT(s.what_to_do,'\n\n',s.how_to_do),
  IF(s.tool_names='',JSON_ARRAY(),JSON_ARRAY(s.tool_names)),s.output
FROM income_methods m
JOIN earning_opportunities o ON o.slug=m.slug
JOIN income_method_steps s ON s.method_id=m.id
WHERE m.slug IN ('phone-made-educational-content','downloadable-practical-resource','reusable-digital-workflow-kit');
