-- Replace the willingness-to-pay field with the diagnostic problem areas requested for field visits.
SET @has_problem_areas = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'field_visit_diagnostic_submissions'
      AND column_name = 'problem_areas'
);

SET @add_problem_areas = IF(
    @has_problem_areas = 0,
    'ALTER TABLE field_visit_diagnostic_submissions ADD COLUMN problem_areas JSON NULL AFTER biggest_operational_pain',
    'SELECT 1'
);
PREPARE add_problem_areas_stmt FROM @add_problem_areas;
EXECUTE add_problem_areas_stmt;
DEALLOCATE PREPARE add_problem_areas_stmt;

UPDATE field_visit_diagnostic_submissions
SET problem_areas = JSON_ARRAY('other')
WHERE problem_areas IS NULL;

-- Keep the previous field as nullable historical data. New submissions use
-- problem_areas, but dropping this column would erase answers already stored.
SET @has_willingness = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'field_visit_diagnostic_submissions'
      AND column_name = 'willingness_to_pay'
);
SET @drop_willingness = IF(
    @has_willingness > 0,
    'ALTER TABLE field_visit_diagnostic_submissions MODIFY COLUMN willingness_to_pay ENUM(''yes'', ''maybe'', ''no'') CHARACTER SET ascii COLLATE ascii_bin NULL',
    'SELECT 1'
);
PREPARE drop_willingness_stmt FROM @drop_willingness;
EXECUTE drop_willingness_stmt;
DEALLOCATE PREPARE drop_willingness_stmt;

ALTER TABLE field_visit_diagnostic_submissions
    MODIFY COLUMN problem_areas JSON NOT NULL;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('016_field_visit_problem_areas', 'Add operational problem areas and retain historical willingness answers');
