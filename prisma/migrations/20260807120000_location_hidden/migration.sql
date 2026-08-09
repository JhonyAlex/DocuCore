-- Las ubicaciones "de ficha" (p. ej. "Planta 1 · Sala compresores", "CPD · Rack 3 · U24")
-- conservan el texto largo que muestra la tabla de Activos, pero no deben
-- aparecer como nodos del árbol de Ubicaciones del prototipo. `hidden` las
-- excluye del render sin dejar de sumar sus activos al contador del padre.
ALTER TABLE "Location" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
