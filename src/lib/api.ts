import { IEvent, IUser, IVariant } from '../interfaces/interfaces';
import { getRequestId } from '../utils/getRequestedId';
import { reverseString } from '../utils/reverseString';

const API_BASE = 'https://api.kide.app/api';

export const apiLogin = async (accessToken: string): Promise<IUser> => {
	const response = await fetch(`${API_BASE}/authentication/user`, {
		headers: {
			authorization: `Bearer ${reverseString(accessToken)}`,
		},
	});

	if (!response.ok) {
		throw new Error('Kelvoton pääsytunnus.');
	}

	const data = (await response.json()) as { model: IUser };
	return data.model;
};

export const apiRefreshEvent = async (productId: string): Promise<IEvent> => {
	const response = await fetch(`${API_BASE}/products/${productId}`);

	if (!response.ok) {
		throw new Error('Tapahtumaa ei löytynyt.');
	}

	const data = (await response.json()) as { model: IEvent };
	return data.model;
};

export const apiReserveTicket = async (
	variant: IVariant,
	accessToken: string,
	quantity: number
): Promise<boolean> => {
	const requestId = getRequestId(variant.inventoryId);

	try {
		const response = await fetch(`${API_BASE}/reservations`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${reverseString(accessToken)}`,
				'X-Requested-Token-fa': requestId,
			},
			body: JSON.stringify({
				toCreate: [
					{
						inventoryId: variant.inventoryId,
						quantity,
						productVariantUserForm: null,
					},
				],
				toCancel: [],
			}),
		});

		return response.ok;
	} catch {
		return false;
	}
};
