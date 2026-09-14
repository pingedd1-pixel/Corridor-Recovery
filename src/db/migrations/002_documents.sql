-- M2 documents: record what a document was generated from (as-of date, parameters such as the consignee for a bucket-B intro).
ALTER TABLE documents ADD COLUMN as_of date;
ALTER TABLE documents ADD COLUMN params jsonb;
ALTER TABLE documents ADD COLUMN title text;
CREATE INDEX documents_client_idx ON documents(client_id, created_at DESC);
