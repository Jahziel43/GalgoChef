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
3. En **Project Settings → API Keys**, copia la clave `service_role` a `SUPABASE_SERVICE_ROLE_KEY`. Es un secreto de servidor: nunca la pongas en el navegador, en una variable `NEXT_PUBLIC_*` ni en el repositorio.
4. Ejecuta el contenido de [`supabase/migrations/202610250001_galgochef_accounts.sql`](./supabase/migrations/202610250001_galgochef_accounts.sql) en el SQL Editor de Supabase.
5. En **Authentication → Providers → Email**, desactiva la confirmación de email para que el registro permita iniciar sesión sin verificar el correo. Esto es adecuado solo para este proyecto escolar; para un producto real, activa la confirmación.

La aplicación permite registro con usuario, correo y contraseña; acceso con usuario o correo; preferencias alimentarias y recetas guardadas asociadas a la cuenta. Las sesiones se almacenan en cookies SSR y las tablas tienen Row Level Security. Sin sesión, las preferencias se aplican solo a la visita actual y los guardados no se sincronizan.

## IA: generación de recetas

La app admite varios proveedores compatibles con OpenAI y también Google Gemini. Para una opción en la nube sin instalar nada, usa Gemini con `AI_PROVIDER=gemini`, `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta` y `AI_MODEL=gemini-2.0-flash`, junto con `AI_MODEL_API_KEY` del proyecto de Google AI Studio. La llamada se realiza exclusivamente desde el servidor; la clave no se envía al navegador. El endpoint valida la receta estructurada y vuelve a comprobar que el resultado no coincida con las restricciones alimentarias configuradas.

La nutrición generada es una estimación, no consejo médico. La detección de alérgenos es conservadora pero no puede garantizar que un alimento sea seguro: revisa etiquetas, ingredientes y riesgo de contaminación cruzada. Configura límites de uso y presupuesto en el proveedor antes de desplegar públicamente.

## Fotos de recetas (opcional)

Las recetas pueden usar una URL HTTPS de imagen. Para buscar fotos automáticamente, crea una API key de [Pixabay](https://pixabay.com/api/docs/) y configura `PIXABAY_API_KEY`; el servidor busca una imagen por el nombre de la receta y muestra el crédito del fotógrafo y su fuente. Sin esta variable, la app conserva la ilustración de respaldo y no requiere imágenes externas.

## Despliegue

Puedes importar el repositorio a Vercel y configurar allí las mismas variables de servidor. Nunca configures `SUPABASE_SERVICE_ROLE_KEY` o `AI_MODEL_API_KEY` como variables públicas.
