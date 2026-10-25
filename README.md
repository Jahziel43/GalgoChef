# GalgoChef

Prototipo web adaptable para encontrar recetas con los ingredientes que hay en casa. Sigue la estética verde esmeralda de la referencia visual más reciente y el flujo de despensa, espera de generación y receta con información nutricional descrito en el documento.

## Ejecutar en local

Requisitos: Node.js 20 o superior y npm.

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). También puedes ejecutar `npm run lint` y `npm run build` para validar el proyecto.

## Incluye

- Despensa con filtros, búsqueda, selección de ingredientes y opción para añadir otros.
- Navegación inferior entre Despensa, Explorar y Guardados.
- Pantalla de espera animada de 2.5 segundos, sugerencias, detalle nutricional y modo de cocina paso a paso.
- Recetas guardadas durante la sesión actual.
- Endpoint `POST /api/generate-recipe` que valida los ingredientes y devuelve una receta de demostración.

## Servicios externos para una versión conectada

El prototipo funciona sin cuentas ni claves: la receta del endpoint es de demostración y no consulta un modelo de IA. Para generar recetas con IA, elige un proveedor (por ejemplo, OpenAI o Google Gemini), crea una clave API desde el panel de desarrolladores del proveedor y conéctala desde el endpoint del servidor. Guarda la clave en `.env.local` como variable privada; **no** la incluyas en variables `NEXT_PUBLIC_*` ni en el código del navegador.

La aplicación no sincroniza la despensa o recetas con la nube y los guardados se reinician al terminar la sesión del navegador. Para habilitar sincronización, crea un proyecto en Supabase y obtén la URL del proyecto y su clave publicable desde **Project Settings → API**. La clave publicable puede usarse en el cliente solo junto con políticas RLS bien configuradas; cualquier clave `service_role` debe permanecer exclusivamente en el servidor. Después habrá que crear las tablas y conectar el cliente de Supabase.

Las tarjetas de recetas usan una ilustración CSS y no requieren imágenes externas. Para acercar aún más la interfaz a la referencia, puedes conseguir una fotografía propia o con licencia adecuada de un omelette de espinaca y guardarla en `public/images/omelette.jpg`; entonces se puede sustituir la ilustración por esa foto.

Para publicar, importa el repositorio en Vercel y configura allí las variables privadas necesarias para los servicios que decidas integrar. No se necesita comprar un dominio para probar una URL de despliegue; un dominio propio es opcional.
