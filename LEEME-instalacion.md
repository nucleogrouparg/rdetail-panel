# Panel RDETAIL: instalación (una sola vez)

Esta carpeta es una plataforma APARTE de la web (rdetail-web). Se sube a su propio sitio de Netlify.

## 1. Planilla de Google donde se guardan los datos
1. Entrá a Google Sheets y creá una planilla nueva, llamada "Panel RDETAIL".
2. Cambiale el nombre a la primera hoja (abajo a la izquierda): tiene que llamarse **datos** (en minúscula).
3. Tocá Compartir y agregá este mail como Editor: `turnos-rdetail@turnos-rdetail.iam.gserviceaccount.com` (sin avisarle).
4. Copiá el ID de la planilla. Es lo que está en el link entre `/d/` y `/edit`.

## 2. Activar Google Sheets API
En console.cloud.google.com, con el proyecto "turnos-rdetail": APIs y servicios, Biblioteca, buscá **Google Sheets API** y tocá Habilitar.

## 3. Sitio nuevo en Netlify
1. Netlify, Add new site, Deploy manually, arrastrá la carpeta `rdetail-panel`.
2. Site configuration, Environment variables. Cargá estas 4 (las dos primeras son las mismas que usa la web):
   - `GOOGLE_SERVICE_ACCOUNT`: el mismo valor que en el sitio de la web
   - `GOOGLE_CALENDAR_ID`: el mismo valor que en el sitio de la web (para traer los turnos reservados)
   - `SHEET_ID`: el ID del paso 1
   - `PANEL_PASSWORD`: la contraseña que va a usar el dueño
3. Volvé a subir la carpeta (Deploys, arrastrar de nuevo) para que tome las variables.
4. Cambiale el nombre al sitio (Site configuration, Change site name), por ejemplo `rdetail-panel`.

## 4. Usarlo
- Abrir la dirección en el celular o la compu y entrar con la contraseña.
- En el celular: "Agregar a pantalla de inicio" y queda como una app.
