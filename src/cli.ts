#!/usr/bin/env node
import { stdin, stdout } from 'node:process';
import * as readline from 'node:readline/promises';
import { apiLogin, apiRefreshEvent, apiReserveTicket } from './lib/api';
import { IEvent, IVariant } from './interfaces/interfaces';

const rl = readline.createInterface({ input: stdin, output: stdout });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (message: string) => {
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, '0');
	console.log(`[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}] ${message}`);
};

const ask = async (question: string, fallback?: string): Promise<string> => {
	const suffix = fallback ? ` (${fallback}): ` : ': ';
	const answer = (await rl.question(question + suffix)).trim();
	return answer || fallback || '';
};

const reserveRecursive = async (
	variant: IVariant,
	accessToken: string,
	retryDelay: number,
	tries = 0
): Promise<number> => {
	const ok = await apiReserveTicket(variant, accessToken, 1);

	if (ok) {
		log(`Lippu "${variant.name}" onnistui.`);
		return 1;
	}

	if (tries >= 3) {
		log(`Lippu "${variant.name}" epäonnistui 3 kertaa. Luovutetaan.`);
		return 0;
	}

	log(
		`Varaus lipulle "${variant.name}" epäonnistui. Yritetty ${tries + 1} kertaa. Yritetään uudelleen...`
	);
	await sleep(retryDelay);
	return reserveRecursive(variant, accessToken, retryDelay, tries + 1);
};

const EVENT_URL = 'https://kide.app/events/4b5875fa-4dae-42eb-aaf2-0dc4a4b0092a';
const TAGS = ['jäsen'];
const EXCLUDE_TAGS = ['kunniajäsen'];

const matchesTag = (variantName: string, tag: string): boolean =>
	variantName.toLowerCase().replace(/\s+/g, ' ').trim().includes(tag.toLowerCase().trim());

const isWantedVariant = (variantName: string): boolean =>
	TAGS.some((tag) => matchesTag(variantName, tag)) &&
	!EXCLUDE_TAGS.some((tag) => matchesTag(variantName, tag));

// Turvallinen, kirjautumista vaatimaton esikatselu: näyttää tapahtuman TODELLISET
// lipputyyppien nimet ja sen, mitkä niistä täsmäävät koodissa oleviin avainsanoihin.
// Ei tee mitään varauksia. Aja: `pnpm preview`
async function preview() {
	const productId = EVENT_URL.split('/').pop() ?? '';
	console.log(`Haetaan tapahtuman tiedot (${EVENT_URL})...\n`);

	let event: IEvent;
	try {
		event = await apiRefreshEvent(productId);
	} catch {
		console.log('Tapahtumaa ei löytynyt tai sitä ei voitu hakea.');
		return;
	}

	console.log(`Tapahtuma: ${event.product.name} (${event.product.city})`);
	console.log(`Myynnin alku: ${new Date(event.product.dateSalesFrom).toLocaleString('fi-FI')}`);
	console.log(`Lipunmyynti päättynyt: ${event.product.salesEnded ? 'kyllä' : 'ei'}\n`);

	if (!event.variants || event.variants.length === 0) {
		console.log(
			'Lipputyyppejä ei ole vielä näkyvissä (ne saattavat ilmestyä vasta myynnin alkaessa).'
		);
		console.log('Aja tämä esikatselu uudelleen lähempänä/myynnin jälkeen tarkistaaksesi nimet.');
		return;
	}

	console.log(`Avainsanat koodissa: ${TAGS.join(', ')}`);
	console.log(`Poissuljetut avainsanat: ${EXCLUDE_TAGS.join(', ')}\n`);
	console.log('Lipputyypit:');
	let anyMatch = false;
	for (const variant of event.variants) {
		const matched = TAGS.filter((tag) => matchesTag(variant.name, tag));
		const excluded = EXCLUDE_TAGS.filter((tag) => matchesTag(variant.name, tag));
		const wanted = matched.length > 0 && excluded.length === 0;
		if (wanted) anyMatch = true;
		const marker =
			excluded.length > 0
				? `🚫 poissuljettu (${excluded.join(', ')})`
				: matched.length > 0
					? `✅ TÄSMÄÄ (${matched.join(', ')})`
					: '❌ ei täsmää';
		console.log(`  - "${variant.name}" — saatavilla: ${variant.availability} — ${marker}`);
	}

	console.log('');
	if (!anyMatch) {
		console.log(
			'⚠️  Yksikään lipputyyppi ei täsmää nykyisiin avainsanoihin (poissuljetut huomioiden)! ' +
				'Botti EI varaisi mitään ja lopettaisi heti varovaisuussyistä.'
		);
		console.log(
			'   Korjaa TAGS-vakio src/cli.ts:ssä täsmäämään yllä listattuja oikeita nimiä, aja `pnpm build`, ja tarkista tämä uudelleen.'
		);
	} else {
		console.log('Avainsanat näyttävät täsmäävän oikein. Botti on turvallista käynnistää.');
	}
}

async function main() {
	if (process.argv[2] === 'preview') {
		await preview();
		rl.close();
		return;
	}

	console.log('Kiderat CLI — testihaara toiselle lipunmyynnille\n');

	// 1) Kirjautuminen
	let accessToken = '';
	while (true) {
		accessToken = await ask('Pääsytunnus (access token)');
		if (accessToken.length < 10) {
			console.log('Pääsytunnus on liian lyhyt tai tyhjä.\n');
			continue;
		}
		try {
			const user = await apiLogin(accessToken);
			log(`Kirjauduttu sisään käyttäjänä ${user.username || user.email || '(tuntematon)'}.`);
			break;
		} catch {
			console.log('Kelvoton pääsytunnus, yritä uudelleen.\n');
		}
	}

	// 2) Tapahtuma — kiinnitetty Vujut-tapahtumaan
	const productId = EVENT_URL.split('/').pop() ?? '';
	let event: IEvent;
	try {
		event = await apiRefreshEvent(productId);
	} catch {
		console.log('Tapahtumaa ei löytynyt.');
		return;
	}
	if (event.product.salesEnded) {
		console.log('Tapahtuman lipunmyynti on päättynyt.');
		return;
	}
	log(`Tapahtuma: ${event.product.name} (${event.product.city})`);

	// 3) Viiveet
	const refreshDelay = Number(await ask('Tapahtuman päivitysviive (ms)', '1000')) || 1000;
	const retryDelay = Number(await ask('Lipun varausviive (ms)', '500')) || 500;

	// 4) Avainsanat — kiinnitetty Vujut-tapahtuman lipputyyppeihin
	const tags = TAGS;

	console.log('\nYhteenveto:');
	console.log(`  Tapahtuma:      ${event.product.name}`);
	console.log(`  Myynnin alku:   ${new Date(event.product.dateSalesFrom).toLocaleString('fi-FI')}`);
	console.log(`  Avainsanat:     ${tags.length ? tags.join(', ') : 'ei asetettu (kaikki lipputyypit)'}`);
	console.log(`  Lippuja/tyyppi: 1\n`);

	const confirm = await ask('Aloitetaanko bottaus? (k/e)', 'k');
	if (confirm.toLowerCase() !== 'k') {
		console.log('Keskeytetty.');
		rl.close();
		return;
	}
	rl.close();

	// 5) Odotetaan myynnin alkua
	if (new Date() < new Date(event.product.dateSalesFrom)) {
		log('Lipunmyynti ei ole vielä alkanut. Odotetaan myynnin alkua...');
		while (new Date() < new Date(event.product.dateSalesFrom)) {
			await sleep(500);
		}
	}
	log('Lipunmyynti on alkanut. Haetaan lippuvaihtoehtoja...');

	// 6) Päivitetään tapahtuma kunnes lipputyypit löytyvät
	let refreshed: IEvent | null = null;
	for (let tries = 0; tries <= 100; tries++) {
		try {
			const candidate = await apiRefreshEvent(productId);
			if (candidate.variants && candidate.variants.length > 0) {
				refreshed = candidate;
				break;
			}
		} catch {
			// jätetään huomiotta, yritetään uudelleen
		}
		log(
			`Lippuvaihtoehtojen lataus epäonnistui. Yritetty ${tries + 1} kertaa. Yritetään uudelleen...`
		);
		await sleep(refreshDelay);
	}

	if (!refreshed?.variants) {
		log('Lippuvaihtoehtoja ei löytynyt 100 yrityksen jälkeen. Lopetetaan.');
		return;
	}

	// 7) Suodatetaan avainsanoilla (pl. poissuljetut, esim. Kunniajäsen)
	log(`Löytyneet lipputyypit: ${refreshed.variants.map((v) => `"${v.name}"`).join(', ')}`);
	const excludedFound = refreshed.variants.filter((v) =>
		EXCLUDE_TAGS.some((t) => matchesTag(v.name, t))
	);
	if (excludedFound.length > 0) {
		log(
			`Poissuljettu (ei varata): ${excludedFound.map((v) => `"${v.name}"`).join(', ')}`
		);
	}

	let variants = refreshed.variants.filter((v) => isWantedVariant(v.name));
	if (tags.length > 0) {
		if (variants.length > 0) {
			log(`Löytyi ${variants.length} vaihtoehtoa avainsanojen perusteella.`);
		} else {
			log(
				'⚠️  Yhtään vaihtoehtoa ei löytynyt avainsanojen perusteella (poissuljetut avainsanat huomioiden). Lopetetaan varovaisuussyistä.'
			);
			return;
		}
	}

	// 8) Varataan 1 lippu per lipputyyppi, rinnakkain
	const results = await Promise.all(
		variants.map((variant) => {
			if (variant.availability === 0) {
				log(`Lippuja vaihtoehdolle "${variant.name}" ei ole enää saatavilla.`);
				return Promise.resolve(0);
			}
			log(`Varataan lippua vaihtoehdolle "${variant.name}"...`);
			return reserveRecursive(variant, accessToken, retryDelay);
		})
	);

	const total = results.reduce((a, b) => a + b, 0);
	log(`Bottaus valmis. Saatuja lippuja yhteensä: ${total}.`);
}

main().catch((err) => {
	console.error('Virhe:', err);
	process.exitCode = 1;
});
