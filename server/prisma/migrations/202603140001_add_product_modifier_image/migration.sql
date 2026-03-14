-- Add optional image for modifier cards in product customizer UI
ALTER TABLE "product_modifiers"
ADD COLUMN "image" TEXT;
