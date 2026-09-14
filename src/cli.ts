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

async function main() {
	console.log('Kiderat CLI — Vujut-tapahtuman lippujen varausbotti\n');

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
	const EVENT_URL = 'https://kide.app/events/76ddeac4-f4cd-466a-b8bc-df0e9b6bfb89';
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
	const tags = ['Artiklan jäsen', 'avec jäsen'];

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

	// 7) Suodatetaan avainsanoilla
	let variants = refreshed.variants;
	if (tags.length > 0) {
		const filtered = variants.filter((v) =>
			tags.some((t) => v.name.toLowerCase().includes(t.toLowerCase()))
		);
		if (filtered.length > 0) {
			variants = filtered;
			log(`Löytyi ${filtered.length} vaihtoehtoa avainsanojen perusteella.`);
		} else {
			log(
				'Yhtään vaihtoehtoa ei löytynyt avainsanojen perusteella. Yritetään varata kaikki vaihtoehdot.'
			);
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
