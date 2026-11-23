# GalgoChef

Aplicación web adaptable para encontrar recetas con ingredientes disponibles, considerar alergias e intolerancias, guardar recetas en una cuenta y seguir la preparación paso a paso.

## Ejecutar en local

Requisitos: Node.js 20 o superior y npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Completa `.env.local` con las variables de los servicios indicados abajo. Abre [http://localhost:3000](http://localhost:3000). Para validar el proyecto:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Supabase: cuentas y guardados

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. Copia la URL y la clave publicable (o `anon`) del proyecto a `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
3. En **Project Settings → API Keys**, copia la clave `service_role` a `SUPABASE_SERVICE_ROLE_KEY`. Se usa solo en el servidor para operaciones administrativas, como eliminar una cuenta y guardar imágenes en Storage. Es un secreto: nunca la pongas en el navegador, en una variable `NEXT_PUBLIC_*` ni en el repositorio.
4. Aplica las migraciones de `supabase/migrations` en orden. Con el CLI enlazado al proyecto remoto: `npx supabase db push --remote`. Esto prepara cuentas, recetas, ingredientes, preferencias alimentarias y el bucket público `recipe-images` de Storage.
5. En **Authentication → Providers → Email**, desactiva la confirmación de email para que el registro permita iniciar sesión sin verificar el correo. Esto es adecuado solo para este proyecto escolar; para un producto real, activa la confirmación.

La aplicación permite registro con usuario, correo y contraseña; acceso con usuario o correo; alergias e intolerancias personalizadas; exclusión de ingredientes que no gustan; y recetas guardadas asociadas a la cuenta. Las sesiones se almacenan en cookies SSR y las tablas tienen Row Level Security. Sin sesión, las preferencias se aplican solo a la visita actual y los guardados no se sincronizan. Las propuestas de nuevas alergias o intolerancias se clasifican en grupos de diez con Gemini.

## IA: generación de recetas

La app usa exclusivamente Google Gemini. Configura `AI_PROVIDER=gemini`, `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta` y `AI_MODEL=gemini-3.6-flash` (o uno de los modelos alternativos en `AI_MODELS`), junto con `AI_MODEL_API_KEY` del proyecto de Google AI Studio. Cada solicitud genera tres recetas distintas en una sola llamada y permite elegir entre ellas. La llamada se realiza exclusivamente desde el servidor; la clave no se envía al navegador. El endpoint valida las recetas estructuradas y vuelve a comprobar que no coincidan con las restricciones alimentarias configuradas.

La nutrición generada es una estimación, no consejo médico. La detección de alérgenos es conservadora pero no puede garantizar que un alimento sea seguro: revisa etiquetas, ingredientes y riesgo de contaminación cruzada. Configura límites de uso y presupuesto en el proveedor antes de desplegar públicamente.

## Fotos de recetas (opcional)

Para buscar fotos automáticamente, crea una API key de [Pixabay](https://pixabay.com/api/docs/) y configura `PIXABAY_API_KEY`. El servidor copia las imágenes al bucket público `recipe-images` de Supabase Storage y conserva el crédito del fotógrafo y su fuente, evitando depender del enlace temporal de Pixabay. Las recetas antiguas con enlaces Pixabay aún activos se migran al bucket al consultarse. También puedes ejecutar `npm run migrate:recipe-images` para migrar en lote las imágenes disponibles de las tablas `recipes` y `saved_recipes`; el comando carga `.env`, requiere `SUPABASE_URL` (o `NEXT_PUBLIC_SUPABASE_URL`) y `SUPABASE_SERVICE_ROLE_KEY`, y conserva la URL original si la imagen ya no está disponible. Sin esta variable, la app conserva la ilustración de respaldo y no requiere imágenes externas.

## Despliegue

Puedes importar el repositorio a Vercel y configurar allí las mismas variables de servidor. Nunca configures `SUPABASE_SERVICE_ROLE_KEY` o `AI_MODEL_API_KEY` como variables públicas.
