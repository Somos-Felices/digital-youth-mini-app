SET @problem_areas_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'business_diagnostic_submissions'
    AND column_name = 'problem_areas'
);

SET @migration_sql = IF(
  @problem_areas_exists = 0,
  'ALTER TABLE business_diagnostic_submissions ADD COLUMN problem_areas JSON NULL AFTER current_tools',
  'SELECT 1'
);

PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
