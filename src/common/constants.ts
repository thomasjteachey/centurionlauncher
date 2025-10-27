export const DEFAULT_LAUNCHER_UPDATE_URL = 'http://136.56.187.218/downloads/';

export const REALMLIST_DEFAULTS = {
        legionnaire: '136.56.187.218',
        azerothcore: '138.197.110.226:3726'
} as const;
export const DEFAULT_REALMLIST = REALMLIST_DEFAULTS.legionnaire;

export type RealmListKey = keyof typeof REALMLIST_DEFAULTS;

export const REALM_IDS = [
        'legionnaire',
        'legionnaire_plus',
        'barracks',
        'barracks_plus',
        'townsendboys',
        'trinityworld'
] as const;
export type RealmId = (typeof REALM_IDS)[number];

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

type RealmConfig = {
        label: string;
        realmName: string;
        build: BuildInfo;
        realmListKey: RealmListKey;
};

export const REALMS: Record<RealmId, RealmConfig> = {
        legionnaire: {
                label: 'Legionnaire',
                realmName: 'Legionnaire',
                build: BUILD_12340,
                realmListKey: 'legionnaire'
        },
        legionnaire_plus: {
                label: 'Legionnaire+',
                realmName: 'Legionnaire Plus',
                build: BUILD_12341,
                realmListKey: 'legionnaire'
        },
        barracks: {
                label: 'Barracks',
                realmName: 'Barracks',
                build: BUILD_12342,
                realmListKey: 'legionnaire'
        },
        barracks_plus: {
                label: 'Barracks+',
                realmName: 'Barracks Plus',
                build: BUILD_12342,
                realmListKey: 'legionnaire'
        },
        townsendboys: {
                label: 'TOWNSENDBOYS',
                realmName: 'TOWNSENDBOYS',
                build: BUILD_12340,
                realmListKey: 'azerothcore'
        },
        trinityworld: {
                label: 'TRINITYWORLD',
                realmName: 'TRINITYWORLD',
                build: BUILD_12340,
                realmListKey: 'legionnaire'
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
        ['patch-enUS-4']: {
                extractPath: 'Data/enUS',
                realms: ['townsendboys']
        },
        ['patch-enUS-6']: {
                extractPath: 'Data/enUS',
                realms: ['legionnaire', 'legionnaire_plus', 'barracks', 'barracks_plus']
        },
        ['patch-enUS-7']: {
                extractPath: 'Data/enUS',
                realms: ['legionnaire', 'legionnaire_plus', 'barracks', 'barracks_plus']
        },
        ['patch-enUS-8']: { extractPath: 'Data/enUS', realms: ['legionnaire_plus'] },
        ['patch-enUS-9']: { extractPath: 'Data/enUS', realms: ['barracks', 'barracks_plus'] },
        ['patch-enUS-10']: { extractPath: 'Data/enUS', realms: ['barracks_plus'] },
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
