-- Add logo_url column to settings table for custom branding
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.settings.logo_url IS 'URL or path to custom business logo';