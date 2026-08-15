-- PROJ-01: la lista de proyectos puede mantener el orden de creación del
-- contrato visual sin leer ni ordenar el conjunto completo en la aplicación.
CREATE INDEX "Project_status_createdAt_id_idx" ON "Project"("status", "createdAt", "id");
