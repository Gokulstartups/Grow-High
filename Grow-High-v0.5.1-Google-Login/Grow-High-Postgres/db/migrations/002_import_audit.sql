CREATE TABLE import_audit_map(source TEXT NOT NULL REFERENCES import_sources(fingerprint),source_id BIGINT NOT NULL,target_id BIGINT NOT NULL REFERENCES audit(id),PRIMARY KEY(source,source_id));
