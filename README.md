# Podcast feeds para Overcast

Genera feeds RSS completos a partir de iVoox y CanalSur Más Audio y los publica gratis en GitHub Pages. Overcast se suscribe a esos feeds con "Add URL".

## Puesta en marcha (gratis)

1. Crea un repositorio **público** en GitHub y sube este proyecto (rama `main`).
2. En el repositorio: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. En *Actions* ejecuta manualmente "Actualizar podcasts". Después se ejecuta solo cada 3 horas.
4. Abre `https://USUARIO.github.io/REPO/` para ver la lista de feeds.

## Añadir a Overcast (iPhone)

- Uno a uno: en Overcast pulsa **+ → Add URL** y pega la URL del feed (`.../feeds/<id>.xml`).
- Todos a la vez: en un ordenador entra en overcast.fm → *Settings → Import OPML* y sube `podcasts.opml` (se descarga de la página índice).

## Fuentes (`sources.json`)

| `type` | `url` | Notas |
| --- | --- | --- |
| `canalsur` | URL de categoría de `audio.canalsurmas.es/videos/category/<id>-...` | `"expand": true` crea un feed por cada podcast de esa categoría (`31530` = todos). |
| `ivoox` | URL de la página del podcast (`..._sq_f<id>_1.html`) o su feed `.xml` | Usa el RSS oficial de iVoox. |
| `rss` | Cualquier feed RSS | |

## Cómo funciona

- **CanalSur Más**: consulta la API pública que usa su web (token anónimo) y recorre todas las categorías y episodios.
- **iVoox**: lee su RSS y acumula los episodios en `data/`; los que salen del feed (iVoox limita a ~300) se conservan.
- `data/*.json` es la caché; el workflow la sube al repositorio. Para eliminar un podcast quita la fuente y borra su JSON.

## Ejecución local

```powershell
npm install
$env:BASE_URL = "https://USUARIO.github.io/REPO"
npm run build   # genera docs/
```

En redes con inspección TLS añade `$env:NODE_OPTIONS = "--use-system-ca"`.
