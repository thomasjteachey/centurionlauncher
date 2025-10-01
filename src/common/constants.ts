export const DEFAULT_LAUNCHER_UPDATE_URL = 'http://centurionpvp.com/downloads/';
export const DEFAULT_REALMLIST = 'centurionpvp.com';

export const REALM_IDS = [
        'legionnaire',
        'legionnaire_plus',
        'barracks',
        'barracks_plus'
] as const;
export type RealmId = (typeof REALM_IDS)[number];

type BuildInfo = {
        string: string;
        number: number;
};

const BASE_BUILD: BuildInfo = {
        string: '12340',
        number: 12340
};

const PLUS_BUILD: BuildInfo = {
        string: '12341',
        number: 12341
};

export const REALMS: Record<
        RealmId,
        {
                label: string;
                realmName: string;
                build: BuildInfo;
        }
> = {
        legionnaire: {
                label: 'Legionnaire',
                realmName: 'Legionnaire',
                build: BASE_BUILD
        },
        legionnaire_plus: {
                label: 'Legionnaire+',
                realmName: 'Legionnaire Plus',
                build: PLUS_BUILD
        },
        barracks: {
                label: 'Barracks',
                realmName: 'Barracks',
                build: BASE_BUILD
        },
        barracks_plus: {
                label: 'Barracks+',
                realmName: 'Barracks Plus',
                build: PLUS_BUILD
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
        ['patch-enUS-7']: { extractPath: 'Data/enUS' },
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
