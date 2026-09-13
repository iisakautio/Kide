<div align="center">

## Kide.app-lippujen varausbotti — komentorivityökalu

Ei erillistä asennettavaa sovellusta — kaikki tapahtuu terminaalissa.

</div>

Kiderat on komentorivityökalu, joka auttaa varaamaan lippuja Kide.app-tapahtumiin heti kun myynti aukeaa. **Tämä projekti ei liity mitenkään [Kide.app](https://kide.app/)-palveluun, ja sen käyttö on omalla vastuulla.**

## Vaatimukset

- [Node.js](https://nodejs.org/) 18 tai uudempi
- [pnpm](https://pnpm.io/) (`npm i -g pnpm`)

## Käyttöönotto

```bash
pnpm install
pnpm build
pnpm start
```

`pnpm start` käynnistää interaktiivisen komentorivikyselyn, joka pyytää järjestyksessä:

1. **Pääsytunnuksen** (access token) — ks. ohjeet alta
2. **Kide.app-tapahtuman URL:n**
3. **Viiveasetukset** (voit hyväksyä oletukset painamalla Enter)
4. **Avainsanat**, joilla lipputyyppejä suodatetaan (valinnainen, max 3)

Tämän jälkeen botti odottaa myynnin alkua ja yrittää varata **yhden lipun jokaisesta lipputyypistä**, joka täsmää avainsanoihin (tai kaikista, jos avainsanoja ei annettu).

Kehityksen aikana voit ajaa TypeScript-lähdekoodia suoraan ilman erillistä build-vaihetta:

```bash
pnpm dev
```

## Pääsytunnuksen (access token) hankkiminen

1. Kirjaudu [kide.app](https://kide.app/):iin selaimessa.
2. Avaa selaimen kehittäjätyökalut (F12) → **Network**-välilehti.
3. Selaa sivustolla niin, että selain tekee kutsun `api.kide.app`:iin, ja etsi pyynnön **Request Headers** -kohdasta `Authorization: Bearer <token>`.
4. Liitä `<token>`-osa botin kysyessä pääsytunnusta.

## Tunnettuja rajoituksia

- Botti toimii kokonaan paikallisesti käyttäjän omalla koneella terminaalissa — se ei lähetä mitään muualle kuin suoraan Kide.app:n rajapintaan.
- Tukee vain yhtä tiliä kerrallaan.
- Mitään ei tallenneta levylle: pääsytunnus kysytään joka käynnistyskerralla.
- Varaa oletuksena vain **1 lipun per lipputyyppi** (ei koko saatavilla olevaa määrää).

## Kehitys

```bash
pnpm i
pnpm dev
```

Koodi sijaitsee `src/`-kansiossa:

- `src/cli.ts` — komentorivin pääohjelma
- `src/lib/api.ts` — kutsut Kide.app-rajapintaan
- `src/utils/` — apufunktiot
- `src/interfaces/` — TypeScript-tyypit
