CREATE TABLE IF NOT EXISTS income_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  overview TEXT NOT NULL,
  distribution TEXT NOT NULL,
  income_mechanism TEXT NOT NULL,
  requirements JSON NOT NULL,
  limitations TEXT NOT NULL,
  status ENUM('draft','under_validation','qualified','rejected','archived') NOT NULL DEFAULT 'draft',
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  archived_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_income_methods_slug (slug),
  KEY idx_income_methods_public (is_published, status, archived_at),
  KEY idx_income_methods_category (category, status),
  CONSTRAINT fk_income_methods_creator FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_income_methods_updater FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS income_method_criteria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method_id BIGINT UNSIGNED NOT NULL,
  criterion_code ENUM('phone_and_free_tools','independent_execution','no_credentials_or_preexisting_trust','no_meetings_or_sales_calls') NOT NULL,
  assessment ENUM('pass','conditional','fail','not_verified') NOT NULL DEFAULT 'not_verified',
  explanation TEXT NOT NULL,
  source_ids JSON NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_method_criterion (method_id, criterion_code),
  CONSTRAINT fk_method_criteria_method FOREIGN KEY (method_id) REFERENCES income_methods(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS income_method_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method_id BIGINT UNSIGNED NOT NULL,
  step_number INT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  what_to_do TEXT NOT NULL,
  how_to_do TEXT NOT NULL,
  tool_names VARCHAR(500) NOT NULL DEFAULT '',
  output TEXT NOT NULL,
  success_looks_like TEXT NOT NULL,
  common_problems TEXT NOT NULL,
  alternatives TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_method_step (method_id, step_number),
  CONSTRAINT fk_method_steps_method FOREIGN KEY (method_id) REFERENCES income_methods(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS income_method_tools (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  purpose TEXT NOT NULL,
  official_url VARCHAR(1000) NULL,
  free_conditions TEXT NOT NULL,
  limitations TEXT NOT NULL,
  phone_usable ENUM('yes','limited','no','not_verified') NOT NULL DEFAULT 'not_verified',
  last_verified DATE NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_method_tool_name (method_id, name),
  KEY idx_method_tools_method (method_id),
  CONSTRAINT fk_method_tools_method FOREIGN KEY (method_id) REFERENCES income_methods(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS income_method_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  source_type ENUM('official_policy','pricing','platform_documentation','research','other') NOT NULL DEFAULT 'other',
  accessed_at DATE NULL,
  last_verified_at DATE NULL,
  supports_claim TEXT NOT NULL,
  supports_area ENUM('cost','account_requirement','distribution','payment','monetisation','qualification','other') NOT NULL DEFAULT 'other',
  is_approved TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_method_source_title (method_id, title),
  KEY idx_method_sources_method (method_id, is_approved),
  CONSTRAINT fk_method_sources_method FOREIGN KEY (method_id) REFERENCES income_methods(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS method_validation_experiments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  hypothesis TEXT NOT NULL,
  owner VARCHAR(180) NOT NULL,
  status ENUM('planned','in_progress','completed','paused','rejected') NOT NULL DEFAULT 'planned',
  started_on DATE NULL,
  ended_on DATE NULL,
  tools_used TEXT NOT NULL,
  initial_cost DECIMAL(12,2) NULL,
  initial_cost_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
  actual_spending DECIMAL(12,2) NULL,
  actual_spending_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
  actual_income DECIMAL(12,2) NULL,
  actual_income_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
  tasks_completed TEXT NOT NULL,
  outputs_produced TEXT NOT NULL,
  problems_encountered TEXT NOT NULL,
  final_assessment TEXT NOT NULL,
  is_public_approved TINYINT(1) NOT NULL DEFAULT 0,
  reviewed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_experiments_method (method_id, status),
  KEY idx_validation_experiments_public (method_id, is_public_approved),
  CONSTRAINT fk_validation_experiments_method FOREIGN KEY (method_id) REFERENCES income_methods(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_validation_experiments_creator FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_validation_experiments_updater FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS method_experiment_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  experiment_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  url VARCHAR(1000) NULL,
  description TEXT NOT NULL,
  evidence_type ENUM('source','output','cost_record','income_record','observation','other') NOT NULL DEFAULT 'other',
  recorded_on DATE NULL,
  is_public_approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_experiment_evidence_experiment (experiment_id, is_public_approved),
  CONSTRAINT fk_experiment_evidence_experiment FOREIGN KEY (experiment_id) REFERENCES method_validation_experiments(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO income_methods (slug,title,category,summary,overview,distribution,income_mechanism,requirements,limitations,status,is_published)
VALUES
('phone-made-educational-content','Phone-made educational content','Content creation','Create concise, useful explainers around one topic and test whether people find them useful. This is a candidate experiment; monetisation and eligibility have not been verified.','Create original short explanations, demonstrations or visual notes that answer a specific audience question. The immediate output is a published piece of content; producing content does not itself create income.','A distribution platform and its recommendation or search systems would be needed. The suitable platform, reach conditions and discoverability have not been verified for this candidate.','YouTube documents earlier access to some YPP features at 500 subscribers, 3 public uploads in 90 days and either 3000 valid public watch hours in 365 days or 3 million valid Shorts views in 90 days. Ad revenue sharing requires 1000 subscribers and either 4000 valid public watch hours in 12 months or 10 million valid Shorts views in 90 days. Eligibility varies by feature and country and requires policy compliance, account checks and review. Official thresholds checked 2026-11-03; verify current rules. No income result has been recorded.','{"device":"Smartphone; device sufficiency not independently verified for selected format","internet":"Likely required for publishing; requirements not verified","accounts":"Platform account and eligibility not selected or verified","identity":"Not verified","initial_cost":"Not researched; do not assume zero cost"}','Audience growth may take substantial time. YouTube monetisation has audience thresholds; country availability, policy compliance, two-step verification, advanced features, AdSense linkage and channel review apply. Smartphone production, mobile publishing, internet costs, content rights and distribution have not been independently tested. Rules checked 2026-11-03; verify current requirements. No earnings are claimed.','under_validation',1),
('downloadable-practical-resource','Downloadable practical resource','Digital products','Create a focused worksheet, guide or template and investigate a self-serve way to distribute it. Sales and platform conditions have not been verified.','Make an original downloadable resource that helps someone complete a defined task. The output could be a worksheet, template or short guide; usefulness must be tested with intended users.','A listing, storefront or other distribution channel must be selected and checked for mobile use, discovery, eligibility and fees before this method can be considered ready.','One possible self-serve storefront is Gumroad. As checked 2026-11-03, direct/profile sales are listed at 10% + $0.50 per transaction plus card processing (2.9% + $0.30) and PayPal fees; Discover marketplace sales are listed at 30%. Payout and buyer-discovery suitability still need testing. No sales or revenue evidence is recorded.','{"device":"Smartphone; creation workflow not verified","internet":"Required to distribute online; details not verified","accounts":"Distribution account not selected or verified","identity":"Not verified","initial_cost":"Fees and payout requirements not researched"}','Creating a file does not guarantee demand or discovery. Gumroad fees checked 2026-11-03: 10% + $0.50 plus processor fees for direct/profile sales, or 30% for Discover marketplace sales. Payout routes and identity checks vary by country. Its guardian payout route for sellers aged 13–17 is currently available only in the United States; payouts are unavailable for under-18 sellers in other countries until age 18. Phone-only creation, local eligibility, payment access and discovery remain untested. Verify current terms.','under_validation',1),
('reusable-digital-workflow-kit','Reusable digital workflow kit','Reusable digital assets','Explore whether a reusable workflow checklist or template can be created and distributed as a self-serve download. This is not a client service.','Package a repeatable, clearly explained workflow into a reusable checklist or template. The experiment must test whether an independent user can apply it without custom delivery, client meetings or organisational resources.','A self-serve distribution route must be identified and tested. Personal outreach, client acquisition and sales calls are outside this candidate method.','A self-serve download sale is only a hypothesis. Gumroad is one possible route; its 2026-11-03 fee page lists direct/profile sales at 10% + $0.50 plus processing or PayPal fees, and Discover marketplace sales at 30%. Account, payment and buyer-discovery suitability must be checked. No income is claimed.','{"device":"Smartphone; authoring and delivery workflow not verified","internet":"Likely required; not verified","accounts":"No channel selected; requirements unknown","identity":"Not verified","initial_cost":"Not researched; no zero-cost claim"}','A workflow may not be useful or differentiated. Tool terms, AI usage policies, intellectual property, discovery, fees and buyer demand have not been verified.','under_validation',1);

INSERT IGNORE INTO income_method_criteria (method_id,criterion_code,assessment,explanation)
SELECT m.id,c.code,'not_verified','This candidate has not been independently tested against this requirement. Evidence is not yet recorded.'
FROM income_methods m
CROSS JOIN (SELECT 'phone_and_free_tools' AS code UNION ALL SELECT 'independent_execution' UNION ALL SELECT 'no_credentials_or_preexisting_trust' UNION ALL SELECT 'no_meetings_or_sales_calls') c
WHERE m.slug IN ('phone-made-educational-content','downloadable-practical-resource','reusable-digital-workflow-kit');

INSERT IGNORE INTO income_method_sources (method_id,title,url,source_type,accessed_at,last_verified_at,supports_claim,supports_area,is_approved)
SELECT id,'How to earn money on YouTube','https://support.google.com/youtube/answer/72857?hl=en','official_policy','2026-11-03','2026-11-03','YouTube lists feature-specific monetisation eligibility thresholds and notes that availability can vary by local legal requirements. Thresholds are a barrier to treating content creation as immediate income.','monetisation',1 FROM income_methods WHERE slug='phone-made-educational-content';
INSERT IGNORE INTO income_method_sources (method_id,title,url,source_type,accessed_at,last_verified_at,supports_claim,supports_area,is_approved)
SELECT id,'YouTube Partner Program overview and eligibility','https://support.google.com/youtube/answer/72851?co=GENIE.Platform%3DAndroid','platform_documentation','2026-11-03','2026-11-03','YouTube describes country availability, account and policy requirements, review, and audience thresholds for joining the Partner Program.','account_requirement',1 FROM income_methods WHERE slug='phone-made-educational-content';
INSERT IGNORE INTO income_method_sources (method_id,title,url,source_type,accessed_at,last_verified_at,supports_claim,supports_area,is_approved)
SELECT id,'Gumroad fees','https://gumroad.com/help/article/66-gumroads-fees','pricing','2026-11-03','2026-11-03','Gumroad documents transaction fees for direct and marketplace-discovery sales. These reduce proceeds; no buyer demand is implied.','cost',1 FROM income_methods WHERE slug='downloadable-practical-resource';
INSERT IGNORE INTO income_method_sources (method_id,title,url,source_type,accessed_at,last_verified_at,supports_claim,supports_area,is_approved)
SELECT id,'Filling out payout settings','https://gumroad.com/help/article/260-your-payout-settings-page','platform_documentation','2026-11-03','2026-11-03','Gumroad describes country-dependent payout settings, identity verification and age-related guardian requirements; individual eligibility must be checked for the user’s location.','payment',1 FROM income_methods WHERE slug='downloadable-practical-resource';
INSERT IGNORE INTO income_method_sources (method_id,title,url,source_type,accessed_at,last_verified_at,supports_claim,supports_area,is_approved)
SELECT id,'Payout delays','https://gumroad.com/help/article/281-payout-delays','platform_documentation','2026-11-03','2026-11-03','Gumroad describes payout timing, minimum payout thresholds and verification or account review delays.','payment',1 FROM income_methods WHERE slug='downloadable-practical-resource';
INSERT IGNORE INTO income_method_sources (method_id,title,url,source_type,accessed_at,last_verified_at,supports_claim,supports_area,is_approved)
SELECT id,'Gumroad fees','https://gumroad.com/help/article/66-gumroads-fees','pricing','2026-11-03','2026-11-03','Gumroad documents transaction fees for direct and marketplace-discovery sales; this source only supports the potential distribution cost, not the feasibility of the workflow kit.','cost',1 FROM income_methods WHERE slug='reusable-digital-workflow-kit';

INSERT IGNORE INTO income_method_tools (method_id,name,purpose,official_url,free_conditions,limitations,phone_usable,last_verified)
SELECT id,'YouTube','Candidate publishing and monetisation platform. Mobile creation workflow and all account requirements still need an execution test.','https://www.youtube.com/','No claim about free production or data costs has been verified.','Feature-specific eligibility, audience thresholds, country availability, policy review and AdSense account requirements apply; see linked official sources.','not_verified','2026-11-03' FROM income_methods WHERE slug='phone-made-educational-content';
INSERT IGNORE INTO income_method_tools (method_id,name,purpose,official_url,free_conditions,limitations,phone_usable,last_verified)
SELECT id,'Gumroad','Candidate self-serve storefront for a downloadable resource; phone setup and regional payout access need testing.','https://gumroad.com/','No monthly fee is stated by Gumroad. Direct/profile sales list 10% + $0.50 plus card processing (2.9% + $0.30) and PayPal fees; Discover marketplace sales list 30%. Fees checked 2026-11-03; verify because terms can change.','Country-dependent payout routes, verification, review, minimum thresholds, account eligibility and discovery are material limits. Under-18 payout rules differ by country.','not_verified','2026-11-03' FROM income_methods WHERE slug='downloadable-practical-resource';
INSERT IGNORE INTO income_method_tools (method_id,name,purpose,official_url,free_conditions,limitations,phone_usable,last_verified)
SELECT id,'Gumroad','Candidate self-serve distribution option for a reusable downloadable workflow asset; phone setup remains untested.','https://gumroad.com/','No monthly fee is stated by Gumroad; transaction charges apply. Direct sales list 10% + $0.50 plus processing; discovery marketplace sales list 30%. Verify current conditions.','Payout and identity requirements vary by country. Suitability of this workflow asset and discoverability are unverified.','not_verified','2026-11-03' FROM income_methods WHERE slug='reusable-digital-workflow-kit';


INSERT IGNORE INTO income_method_steps (method_id,step_number,title,what_to_do,how_to_do,tool_names,output,success_looks_like,common_problems,alternatives)
SELECT id,1,'Choose one specific audience need','Identify a narrow question or task that a real person might find useful.','Write down the intended audience, the task they face and what a useful result would look like. Do not assume demand; record the question as a hypothesis to test.','Phone notes app','A one-sentence audience need and testable hypothesis.','The intended user and the problem are specific enough to guide one small output.','The idea is too broad or based only on personal preference.','Choose a smaller task you can explain or demonstrate clearly.' FROM income_methods WHERE slug='phone-made-educational-content'
UNION ALL SELECT id,2,'Create one short original piece','Produce a concise explanation, demonstration or visual note addressing the selected need.','Draft the key points on the phone, check accuracy, then record or assemble a small piece. Avoid unsupported claims and third-party material you do not have rights to use.','Phone camera or built-in notes; specific production tools not yet verified','One complete draft suitable for review.','A person unfamiliar with the topic can understand the main point.','The scope grows, facts are uncertain, or production tools have unverified limits.','Use a text-first format that fits the phone capabilities you already have.' FROM income_methods WHERE slug='phone-made-educational-content'
UNION ALL SELECT id,3,'Verify a distribution and monetisation route','Research a suitable publishing platform before treating the method as income-ready.','Record official platform sources for account eligibility, phone publishing, reach/discovery, monetisation thresholds, geography, fees and payouts. Publish only after reviewing the platform terms and safety requirements.','Official platform documentation (to be selected)','A documented channel assessment; publishing is optional until conditions are known.','The channel and its limitations are documented with dated primary sources.','No qualifying platform, identity requirements, payout restrictions or discoverability limits.','Keep the output as a non-monetised learning experiment or reject the candidate.' FROM income_methods WHERE slug='phone-made-educational-content'
UNION ALL SELECT id,1,'Choose a task worth making easier','Select one specific task for which a worksheet, template or guide may help.','Describe who might use it, what they currently need to do and how the output would help. Treat value and demand as hypotheses.','Phone notes app','A one-sentence user need and product hypothesis.','The intended user can be described without relying on a client relationship.','The proposed resource has no clear use or assumes demand.','Choose a smaller recurring task that can be addressed with a simple file.' FROM income_methods WHERE slug='downloadable-practical-resource'
UNION ALL SELECT id,2,'Make a small original resource','Draft one usable worksheet, template or short guide.','Create the minimum complete version using a phone-accessible authoring option only after checking its current terms, mobile support, export and free limits.','Authoring tool to be researched','One downloadable-resource draft.','The file opens, is readable on a phone and has clear instructions.','Tool access, export or accessibility limits; copied material or unclear instructions.','Use a plain text or other format whose authoring and export conditions you have verified.' FROM income_methods WHERE slug='downloadable-practical-resource'
UNION ALL SELECT id,3,'Check a self-serve route before listing','Find out whether a buyer could discover and receive the resource without a meeting.','Use official sources to verify listing rules, fees, identity checks, payout setup, minimums, geography and discovery. Record what remains uncertain.','Official marketplace or storefront documentation (to be selected)','A dated distribution and payment requirements note.','A viable self-serve route is documented; no sale is assumed.','Fees, payment eligibility, discoverability or identity checks make the route inaccessible.','Revise the format or mark the candidate unsuitable if no accessible route exists.' FROM income_methods WHERE slug='downloadable-practical-resource'
UNION ALL SELECT id,1,'Select one repeatable task','Choose a small workflow that can be explained as a reusable sequence.','Write the input, steps and expected output. Exclude custom client work, sales calls and any dependency on Somos Felices.','Phone notes app','A simple workflow outline and use case.','A person can understand when to use the workflow and what it produces.','The workflow only works with undocumented assumptions or organisation-only access.','Choose a task that can be tested independently with materials the individual controls.' FROM income_methods WHERE slug='reusable-digital-workflow-kit'
UNION ALL SELECT id,2,'Build and document a reusable version','Create a checklist or template that another person could use without custom delivery.','Write clear instructions, example inputs and an output check. Review any tools or AI services for current mobile, privacy, free-use and content terms before relying on them.','Tools to be researched and verified','One documented workflow asset.','The asset is self-contained and can be followed without a meeting.','The resource requires paid features, private data or substantial technical setup.','Remove tool dependencies and provide a manual path where practical.' FROM income_methods WHERE slug='reusable-digital-workflow-kit'
UNION ALL SELECT id,3,'Test distribution and actual use','Investigate whether the asset can be distributed and used self-serve.','Verify the distribution, account, pricing, payout and discovery conditions using dated official sources. Record actual user tests and outcomes separately from assumptions.','Official distribution and tool documentation (to be selected)','A documented test plan and evidence record.','Independent use and a self-serve route are tested; income remains unclaimed until received.','The method depends on custom support, client acquisition or inaccessible payout rules.','Reject or redesign the candidate if independent use cannot be demonstrated.' FROM income_methods WHERE slug='reusable-digital-workflow-kit';
