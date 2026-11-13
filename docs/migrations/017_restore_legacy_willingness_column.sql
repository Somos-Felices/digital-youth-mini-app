-- The field-visit flow no longer asks about willingness to pay. Retain the
-- nullable column for older records and compatibility with already-migrated
-- isolated databases; new submissions leave it NULL.
SET @has_willingness = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'field_visit_diagnostic_submissions'
      AND column_name = 'willingness_to_pay'
);

SET @add_willingness = IF(
    @has_willingness = 0,
    'ALTER TABLE field_visit_diagnostic_submissions ADD COLUMN willingness_to_pay ENUM(''yes'', ''maybe'', ''no'') NULL AFTER problem_areas',
    'SELECT 1'
);
PREPARE add_willingness_stmt FROM @add_willingness;
EXECUTE add_willingness_stmt;
DEALLOCATE PREPARE add_willingness_stmt;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('017_restore_legacy_willingness_column', 'Retain nullable historical willingness answers');
