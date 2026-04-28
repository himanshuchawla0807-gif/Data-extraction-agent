# Data Extraction Agent Open Plan

Initial migration target:

- Copy only the backend extraction routes, schemas, service layer, and LangGraph-related orchestration needed for upload/extract/verify/export.
- Copy only the frontend screens/components needed for upload, table review, source viewing, and export.
- Replace hard-coded providers with `DATA_EXTRACTION_PROVIDER` and model env vars.
- Add mock provider tests before using paid APIs.
