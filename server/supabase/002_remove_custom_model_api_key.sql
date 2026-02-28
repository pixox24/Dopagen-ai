-- Remove plaintext API key storage from custom_models.
ALTER TABLE IF EXISTS public.custom_models
  DROP COLUMN IF EXISTS api_key;
