export const DEFAULT_LAUNCHER_UPDATE_URL = 'https://centurionpvp.com/downloads/';
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
		/**
		 * Remote basename to fetch instead when the launcher is in dev mode.
		 * The archive still contains the REAL .MPQ name, so it drops into the
		 * client exactly where the live patch would - only the download source
		 * differs. Path is relative to downloads/patches/.
		 */
		devFile?: string;
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
	['patch-enUS-8']: {
		extractPath: 'Data/enUS',
		realms: ['legionnaire_plus']
	},
	// The dev DBC delta, layered above patch-enUS-8 exactly as patch-Z is
	// layered above patch-Y. 'T' sorts after '8', so the client loads this last
	// and it wins.
	//
	// It used to be patch-enUS-8's devFile, which meant the test archive
	// carried patch-enUS-8.MPQ and OVERWROTE the live patch on every dev
	// launch. Anything published straight into the live patch was silently
	// reverted the next time the launcher ran, and the only symptom was
	// "my change didn't take". Layering instead of replacing removes that
	// whole class of confusion, and keeps the download to the few DBCs the
	// forge actually modified rather than a 55MB copy of the base.
	['patch-enUS-T']: {
		extractPath: 'Data/enUS',
		realms: ['legionnaire_plus'],
		devFile: 'itemforge/patch-enUS-T-test'
	},
	['patch-enUS-9']: { extractPath: 'Data/enUS', realms: ['barracks'] },
	['patch-enUS-A']: { extractPath: 'Data/enUS', realms: ['barracks_plus'] },
	['patch-4']: { extractPath: 'Data', realms: ['legionnaire_plus'] },
	// The production art base. patch-Z used to carry all of it; it is now the
	// small dev-only delta layered above this, so a texture save no longer
	// makes every dev redownload 700MB. On patch day the delta is merged down
	// into patch-Y and the production patch-Z goes back to (nearly) empty.
	['patch-Y']: { extractPath: 'Data' },
	['patch-Z']: { extractPath: 'Data', devFile: 'itemforge/patch-Z-test' },
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
	},
	// Client-side fixes: vanilla stealth movement speed, and stopping spell
	// animations from destroying melee swing animations.
	//
	// Ships dinput8.dll into the client root. Wow.exe statically imports
	// DirectInput8Create and dinput8 is not a KnownDLL, so the local copy loads
	// during process init.
	//
	// Mandatory (no `optional`), so it installs for everyone.
	//
	// Renamed from 'stealth-glide' in 1.1.8 once it covered more than stealth.
	// The old key is still served so launchers on 1.1.7 keep working; both
	// deliver the same dinput8.dll, so a client mid-migration just overwrites
	// the same file. Retire stealth-glide.* from the server once 1.1.7 is gone.
	['client-tweaks']: {
		extractPath: '.'
	}
};
