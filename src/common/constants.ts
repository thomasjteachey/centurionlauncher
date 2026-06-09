export const DEFAULT_LAUNCHER_UPDATE_URL = 'http://136.56.187.218/downloads/';
export const DEFAULT_REALMLIST = '136.56.187.218';
export const DEFAULT_AZEROTHCORE_REALMLIST = '136.56.187.218:3726';

export const REALM_IDS = [
        'legionnaire_plus',
        'legionnaire',
        'barracks',
        'barracks_plus',
        'trinityworld',
        'townsendboys'
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
        ['patch-dungeon-maps']: { extractPath: 'Data', realms: ['barracks', 'townsendboys'] },
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
