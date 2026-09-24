# La maldición del boli rojo · edición online

Juego de ortografía para 5.º de Primaria. Conserva las seis estaciones, la historia, las palabras rebeldes, los tres niveles y el recreo infinito de la versión reciente enviada en `boli-rojo_1.zip`. Conserva también sus personajes y escenas nuevos. Ahora se puede jugar **solo o en pareja**, tanto en una partida local como con cuentas online.

## Jugar desde GitHub Pages

**[Abrir el juego](https://aronfenix.github.io/boli-rojo/)**

La versión de GitHub Pages permite partidas locales, los modos individual y en pareja y toda la música nueva. GitHub Pages no guarda datos de alumnos entre dispositivos. Para entrar con una cuenta y recuperar el progreso se usa [la versión de Cloudflare](https://boli-rojo.cuaderno-alvar-x100.workers.dev/).

## Cómo se juega

En **+ PARTIDA LOCAL**, elige «YO SOLO» o «EN PAREJA», escribe los nombres y la dificultad. El progreso se queda en esa tablet. El código de tres palabras permite reconstruir estrellas y dificultad en otra tablet; es un código de recuperación parcial, **no una contraseña de alumno**.

En **CUENTA ONLINE**, cada alumno entra con su propio usuario y contraseña. Después elige «JUGAR YO SOLO» o selecciona a un compañero. El alumno que ha entrado es siempre el primer integrante. Cada alumno tiene su progreso individual, y cada combinación de dos alumnos tiene un progreso compartido, independientemente del orden en que entren. Puede volver a jugar tantas veces como quiera desde distintos dispositivos con la misma cuenta. El indicador del borde inferior muestra si el progreso está guardado o pendiente por falta de conexión.

La música anterior, de tipo chiptune, se ha sustituido por **once pistas de audio** con batería, bajo eléctrico, teclas, guitarras y otros instrumentos muestreados: portada, plano, seis estaciones y tres momentos de historia o resultado. Cada escena tiene su propio arreglo. Las pistas van incluidas en `public/music/`, funcionan sin conexión externa y se pueden silenciar con el botón ♪. Los efectos de Rojelio siguen respondiendo al juego; el botón ♪ también los silencia.

## Publicación en Cloudflare

El servidor, la base D1 y el juego están publicados en **https://boli-rojo.cuaderno-alvar-x100.workers.dev/**. Para futuras actualizaciones, ejecuta `npm install`, `npm run db:remote` si hay nuevas migraciones y `npm run deploy`. La contraseña del profesor se guarda como secreto `TEACHER_PASSWORD` en Cloudflare y nunca en GitHub.

La primera vez, entra por **CUENTA ONLINE** con usuario `profe` y la contraseña privada entregada al profesor. Desde el panel online puedes crear alumnos, cambiarles la contraseña y ver las estrellas de sus partidas. La contraseña inicial de cada alumno debe tener al menos ocho caracteres. Para una prueba local, ejecuta `npm run db:local` y `npx wrangler dev --local --var TEACHER_PASSWORD:UnaClaveDePrueba --port 8787`; usa una clave de prueba diferente de la real.

## Datos y acceso

Las contraseñas de alumnos se derivan con PBKDF2 y sal aleatoria. Las sesiones usan cookies HttpOnly, Secure y SameSite=Lax. Las partidas de una pareja se comparten entre sus dos miembros; los alumnos no pueden leer las de otros alumnos desde la API. El profesorado puede ver las cuentas y las estrellas. El servidor limita los intentos fallidos de inicio de sesión, y cambiar una contraseña cierra las sesiones anteriores de ese alumno.

El panel **PROFE** de la pantalla de título sigue siendo el panel **local** del juego; su código aparece en el código fuente y no protege datos online. Los nombres, contraseñas, estrellas, récords y palabras rebeldes online se guardan en D1. No se crean cuentas ni se importan partidas locales automáticamente: el profesor debe crear las cuentas. El código de tres palabras solo transporta estrellas y dificultad, no el historial completo de una partida local.

## Desarrollo y comprobación

- `npm test`: comprueba la separación entre perfiles individuales y parejas, y la validación y unión de progreso.
- `npm run db:local`: prepara D1 local.
- `npm run dev`: inicia la Worker local. Para probar cuentas, añade una contraseña de prueba mediante `--var TEACHER_PASSWORD:...`.
- `node tests/smoke-online.mjs`: con Wrangler local en el puerto 8787 y la contraseña de prueba indicada en el archivo, comprueba inicio de sesión, creación de alumnos, progreso compartido, conflictos de guardado y cambio de contraseña.

El banco de palabras y el guion permanecen al principio de `public/index.html`, como en el original. Los datos online requieren un despliegue activo de Cloudflare; abrir `public/index.html` como archivo solo permite partidas locales.

## Créditos de la música

Las once composiciones de esta edición se han creado para este juego. Los sonidos instrumentales y de batería utilizados para grabarlas proceden del banco [GeneralUser GS de S. Christian Collins](https://github.com/mrbumpy409/GeneralUser-GS), cuya licencia permite crear grabaciones musicales con sus muestras. El banco de sonidos no se incluye en el juego publicado; se incluyen únicamente las pistas resultantes en MP3.

## Sobre esta entrega

El archivo fuente de partida fue `boli-rojo_1.zip`. Se ha mantenido su banco de palabras, guion, minijuegos, personajes, ilustraciones y capturas. El servidor online está activo y todavía no contiene alumnos reales; el profesor crea las cuentas desde el panel privado. El modo local también funciona desde `public/index.html`.
