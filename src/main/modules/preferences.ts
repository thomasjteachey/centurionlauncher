import path from 'path';

import fs from 'fs-extra';
import { type z } from 'zod';
import { app } from 'electron';

import {
        DEFAULT_LAUNCHER_UPDATE_URL,
        DEFAULT_REALMLIST,
        REALMLIST_DEFAULTS,
        REALMS,
        type RealmId
} from '~common/constants';
import { PreferencesSchema } from '~common/schemas';
import { omit } from '~common/utils';

const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;

abstract class Preferences {
        static #data: z.infer<typeof PreferencesSchema> = PreferencesSchema.parse({
                launcherUpdateUrl: DEFAULT_LAUNCHER_UPDATE_URL,
                realmList: DEFAULT_REALMLIST
        });

	static readonly userDataDir = process.env.PORTABLE_EXECUTABLE_DIR
		? path.join(process.env.PORTABLE_EXECUTABLE_DIR, '.launcher')
		: app.getPath('userData');

        static async load() {
                const userDataPath = path.join(this.userDataDir, 'settings.json');
                try {
                        const json = await fs.readJSON(userDataPath);
                        const raw = json as Record<string, unknown> & {
                                realmListLegionnaire?: unknown;
                                realmListTrinitycore?: unknown;
                                realmListAzerothcore?: unknown;
                                realmList?: unknown;
                                selectedRealm?: unknown;
                                launcherUpdateUrl?: unknown;
                        };

                        const sanitizeRealmList = (
                                value: unknown
                        ): string | undefined => {
                                if (typeof value !== 'string') return undefined;
                                const trimmed = value.trim();
                                return trimmed.length > 0 ? trimmed : undefined;
                        };

                        const sanitizeRealmId = (value: unknown): RealmId | undefined => {
                                if (typeof value !== 'string') return undefined;
                                return value in REALMS ? (value as RealmId) : undefined;
                        };

                        const sanitizeLauncherUrl = (value: unknown): string | undefined => {
                                if (typeof value !== 'string') return undefined;
                                const trimmed = value.trim();
                                return trimmed.length > 0 ? trimmed : undefined;
                        };

                        const selectedRealm = sanitizeRealmId(raw.selectedRealm) ?? 'legionnaire';

                        const realmListTrinitycore =
                                sanitizeRealmList(raw.realmListTrinitycore) ??
                                sanitizeRealmList(raw.realmListLegionnaire) ??
                                REALMLIST_DEFAULTS.trinitycore;

                        const realmListAzerothcore =
                                sanitizeRealmList(raw.realmListAzerothcore) ??
                                REALMLIST_DEFAULTS.azerothcore;

                        const resolvedRealmListKey = REALMS[selectedRealm]?.realmListKey ?? 'trinitycore';

                        const realmList =
                                sanitizeRealmList(raw.realmList) ??
                                (resolvedRealmListKey === 'azerothcore'
                                        ? realmListAzerothcore
                                        : realmListTrinitycore);

                        const migrated = {
                                ...raw,
                                launcherUpdateUrl:
                                        sanitizeLauncherUrl(raw.launcherUpdateUrl) ??
                                        DEFAULT_LAUNCHER_UPDATE_URL,
                                realmListTrinitycore,
                                realmListAzerothcore,
                                realmList,
                                selectedRealm
                        };
                        delete (migrated as Record<string, unknown>).realmListLegionnaire;
                        return PreferencesSchema.parse({
                                ...migrated,
                                isPortable: !!portableDir,
                                clientDir: portableDir ?? raw.clientDir
                        });
                } catch (e) {
                        return PreferencesSchema.parse({
                                isPortable: !!portableDir,
                                clientDir: portableDir
                        });
                }
        }

	static get data(): PreferencesSchema {
		return this.#data;
	}

	static set data(newData: Partial<Omit<PreferencesSchema, 'portableDir'>>) {
                this.#data = PreferencesSchema.parse({ ...this.#data, ...newData });
                void fs.writeJSON(
                        path.join(this.userDataDir, 'settings.json'),
                        omit(
                                this.#data,
				portableDir ? ['isPortable', 'clientDir'] : ['isPortable']
			),
			{ spaces: 2 }
		);
	}

	static async isValidClientDir(clientDir?: string) {
		return !!clientDir && (await fs.exists(path.join(clientDir, 'WoW.exe')));
	}
}

export default Preferences;
