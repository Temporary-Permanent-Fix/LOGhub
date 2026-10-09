# Alza Central Hub

Rozcestník odkazov (SK/EN). Statická stránka + jedna Vercel funkcia, dáta zdieľané pre všetkých v Upstash Redis.
Bez hesla – kto má URL, môže upravovať odkazy aj kategórie.

## Deploy

1. Pushni repo na GitHub.
2. Vercel → **Add New → Project** → importuj repo. Framework preset **Other**, build command ani output directory netreba.
3. V projekte: **Storage → Create Database → Upstash for Redis** → pripoj k projektu (všetky prostredia).
   Integrácia doplní `KV_REST_API_URL` a `KV_REST_API_TOKEN`.
4. **Redeploy**, aby funkcia videla nové premenné.

Kým nie je úložisko pripojené, stránka beží, ale zobrazí „Úložisko nie je pripojené“ a úpravy sú vypnuté.

## Štruktúra

| Súbor | Čo robí |
|---|---|
| `index.html`, `assets/` | frontend (vanilla JS, žiadny build) |
| `api/data.js` | `GET` zoznam, `POST {op}` – `addCat`, `removeCat`, `addLink`, `removeLink` |
| `api/_seed.js` | východzie kategórie, kým je databáza prázdna |
| `dev-server.mjs` | lokálny náhľad: `npm run dev` (Redis v pamäti) |

Dáta sú v jednom kľúči `alzaHub:data:v2`. Zápis je compare-and-set, takže súbežné úpravy sa neprepíšu.
Otvorené stránky si zoznam obnovujú každých 20 s. Jazyk sa pamätá v prehliadači.
URL odkazov: povolené len `http(s)://` a `mailto:`; adresa bez schémy dostane `https://`.
