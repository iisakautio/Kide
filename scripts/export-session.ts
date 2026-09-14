#!/usr/bin/env node
// Yhdistää jo auki olevaan, tavallisesti käynnistettyyn selaimeen (jossa olet
// kirjautunut kide.app:iin normaalisti, Turnstile-tarkistus mukaan lukien) ja
// tallentaa istunnon (evästeet ym.) tiedostoon auth-state.json. Tätä tiedostoa
// käyttää sitten botin oma, automatisoitu Chromium-instanssi kirjautuakseen
// sisään ilman että sen tarvitsee itse läpäistä Turnstilea.
//
// Käyttö:
//   1) Käynnistä selain etähallintaportilla auki, esim.:
//      msedge.exe --remote-debugging-port=9222 --user-data-dir="C:\temp\edge-automation-profile"
//   2) Kirjaudu kide.app:iin siinä selaimessa normaalisti.
//   3) Aja: pnpm export-session
import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_FILE = 'auth-state.json';

async function main() {
	console.log(`Yhdistetään selaimeen osoitteessa ${CDP_URL}...`);
	const browser = await chromium.connectOverCDP(CDP_URL);

	const contexts = browser.contexts();
	if (contexts.length === 0) {
		console.log('Selaimesta ei löytynyt yhtään avointa kontekstia. Onko selain varmasti auki?');
		await browser.close();
		return;
	}

	const context = contexts[0];
	await context.storageState({ path: OUTPUT_FILE });
	console.log(`Istunto tallennettu tiedostoon ${OUTPUT_FILE}.`);

	// connectOverCDP: irrota yhteys sulkematta oikeaa selainta.
	await browser.close();
}

main().catch((err) => {
	console.error('Virhe:', err.message);
	console.error(
		'Varmista, että selain on käynnissä komennolla --remote-debugging-port=9222 ja olet kirjautunut sisään.'
	);
	process.exitCode = 1;
});
