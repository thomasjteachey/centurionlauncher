export const DEFAULT_LAUNCHER_UPDATE_URL = 'http://centurionpvp.com/downloads/';
export const DEFAULT_REALMLIST = 'centurionpvp.com';
export const DEFAULT_AZEROTHCORE_REALMLIST = 'centurionpvp.com:3726';

export const REALM_IDS = [
	'legionnaire_plus',
	'legionnaire',
	'barracks',
	'barracks_plus',
	'trinityworld',
	'townsendboys'
] as const;
export type RealmId = (typeof REALM_IDS)[number];

export const PUBLIC_REALM_IDS = [
	'legionnaire_plus',
	'barracks_plus'
] as const satisfies readonly RealmId[];

type BuildInfo = {
	string: string;
	number: number;
};

const BUILD_12340: BuildInfo = {
	string: '12340',
	number: 12340
};

const BUILD_12341: BuildInfo = {
	string: '12341',
	number: 12341
};

const BUILD_12342: BuildInfo = {
	string: '12342',
	number: 12342
};

export const REALMS: Record<
	RealmId,
	{
		label: string;
		realmName: string;
		build: BuildInfo;
		realmlistType: 'trinitycore' | 'azerothcore';
	}
> = {
	legionnaire_plus: {
		label: 'Legionnaire+',
		realmName: 'Legionnaire Plus',
		build: BUILD_12341,
		realmlistType: 'trinitycore'
	},
	legionnaire: {
		label: 'Legionnaire',
		realmName: 'Legionnaire',
		build: BUILD_12340,
		realmlistType: 'trinitycore'
	},
	barracks: {
		label: 'Barracks',
		realmName: 'Barracks',
		build: BUILD_12342,
		realmlistType: 'trinitycore'
	},
	barracks_plus: {
		label: 'Barracks+',
		realmName: 'Barracks Plus',
		build: BUILD_12342,
		realmlistType: 'trinitycore'
	},
	trinityworld: {
		label: 'TRINITYWORLD',
		realmName: 'TRINITYWORLD',
		build: BUILD_12340,
		realmlistType: 'trinitycore'
	},
	townsendboys: {
		label: 'TOWNSENDBOYS',
		realmName: 'TOWNSENDBOYS',
		build: BUILD_12340,
		realmlistType: 'azerothcore'
	}
};

export const FileMap: Record<
	string,
	{
		extractPath: string;
		optional?: true;
		label?: string;
		description?: string;
		realms?: RealmId[];
	}
> = {
	['addons']: { extractPath: 'Interface/Addons' },
	['patch-enUS-4']: { extractPath: 'Data/enUS', realms: ['townsendboys'] },
	['patch-enUS-6']: {
		extractPath: 'Data/enUS',
		realms: ['legionnaire', 'legionnaire_plus', 'barracks', 'barracks_plus']
	},
	['patch-enUS-7']: {
		extractPath: 'Data/enUS',
		realms: ['legionnaire', 'legionnaire_plus', 'barracks', 'barracks_plus']
	},
	['patch-enUS-8']: { extractPath: 'Data/enUS', realms: ['legionnaire_plus'] },
	['patch-enUS-9']: { extractPath: 'Data/enUS', realms: ['barracks'] },
	['patch-enUS-A']: { extractPath: 'Data/enUS', realms: ['barracks_plus'] },
	['patch-Z']: { extractPath: 'Data' },
	['patch-dungeon-maps']: {
		extractPath: 'Data',
		realms: ['barracks', 'townsendboys']
	},
	['hd-creatures']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Creatures',
		description: 'Higher resolution retail creature models'
	},
	['hd-textures']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Textures',
		description: 'Higher resolution retail textures'
	},
	['hd-spells']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Spells',
		description: 'Higher resolution retail spell visuals'
	},
	['hd-bgs']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Battlegrounds',
		description: 'Higher detail retail battleground maps'
	},
	['hd-misc']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Interface',
		description: 'Shadowlands style user interface'
	}
};
