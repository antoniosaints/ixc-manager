-- IXC installations may expose descriptive fidelity values, not just a
-- one-character flag. Preserve the source value without truncation.
ALTER TABLE retention_contracts MODIFY COLUMN fidelity VARCHAR(255) NULL;
