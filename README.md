# GalgoChef

GalgoChef te ayuda a preparar recetas con lo que tienes en casa. Puedes guardar tus ingredientes, indicar restricciones alimentarias y recibir tres ideas de recetas para elegir.

## Requisitos

- Node.js 20 o superior y npm.
- Un proyecto de [Supabase](https://supabase.com/).
- Una clave de API de [Google AI Studio](https://aistudio.google.com/) para generar recetas.

## 1. Configura Supabase

1. Crea un proyecto en Supabase.
2. Copia la URL y la clave publicable (o `anon`) del proyecto. Las pondrás en `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
3. En **Project Settings → API Keys**, copia la clave `service_role` para `SUPABASE_SERVICE_ROLE_KEY`. Es secreta: úsala solo en el servidor. No la pongas en una variable `NEXT_PUBLIC_*` ni la compartas.
4. En una terminal, inicia sesión y enlaza el proyecto:

   ```bash
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   ```

5. Aplica las migraciones:

   ```bash
   npx supabase db push --remote
   ```

   Antes de confirmar, verifica que el proyecto de destino sea el correcto. Las migraciones preparan las tablas y el almacenamiento de imágenes.

Para este proyecto escolar, si quieres que las cuentas puedan iniciar sesión sin verificar el correo, desactiva la confirmación de email en **Authentication → Providers → Email**. En una aplicación pública o real, mantenla activada.

## 2. Configura y ejecuta la aplicación

Desde la carpeta del proyecto:

```bash
npm install
cp .env.example .env.local
```

Abre `.env.local` y completa estas variables:

| Variable | Dónde conseguirla |
| --- | --- |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | Clave publicable (o `anon`) de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` de Supabase; mantenla secreta |
| `AI_MODEL_API_KEY` | Clave de Google AI Studio |

Las demás opciones de Gemini ya tienen valores predeterminados en `.env.example`. Luego inicia la app:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Funciones opcionales

### Fotos de recetas

Si quieres buscar fotos automáticamente, crea una clave en [Pixabay](https://pixabay.com/api/docs/) y añádela como `PIXABAY_API_KEY` en `.env.local`. Las imágenes se copian al almacenamiento de Supabase para no depender de enlaces temporales.

Las recetas antiguas con enlaces de Pixabay que todavía funcionen se pueden migrar. Para ejecutar la migración en lote:

```bash
npm run migrate:recipe-images
```

Este comando carga las variables desde `.env` (no desde `.env.local`) y necesita la URL de Supabase y `SUPABASE_SERVICE_ROLE_KEY`. Si una imagen de origen ya no está disponible, no se puede recuperar desde ese enlace.

### Restricciones alimentarias

Puedes elegir alergias e intolerancias, proponer nuevas opciones y marcar ingredientes que no te gustan. Al llegar a diez propuestas nuevas, Gemini las revisa y la app añade las que correspondan. Sin iniciar sesión, las preferencias solo se conservan durante la visita actual.

## Comprobaciones

Para revisar el proyecto antes de compartir cambios:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Seguridad y alimentación

No publiques `SUPABASE_SERVICE_ROLE_KEY` ni `AI_MODEL_API_KEY`, y nunca las configures con el prefijo `NEXT_PUBLIC_`.

La información nutricional es aproximada y no sustituye el consejo médico. La detección de alérgenos no garantiza que una receta sea segura: revisa siempre las etiquetas y el riesgo de contaminación cruzada.
