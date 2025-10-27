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
import Logger from './logger';

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
                void Logger.log('Loading preferences from disk', undefined, { userDataPath });
                try {
                        const json = await fs.readJSON(userDataPath);
                        const raw = json as Record<string, unknown> & {
                                realmListLegionnaire?: unknown;
                                realmListTrinitycore?: unknown;
                                realmListAzerothcore?: unknown;
                                realmList?: unknown;
                                selectedRealm?: unknown;
                                launcherUpdateUrl?: unknown;
                                optionalPatches?: unknown;
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

                        const sanitizeOptionalPatches = (value: unknown): string[] | undefined => {
                                if (Array.isArray(value)) {
                                        return value.filter((entry): entry is string => typeof entry === 'string');
                                }

                                if (value && typeof value === 'object') {
                                        return Object.entries(value as Record<string, unknown>)
                                                .filter(([, enabled]) => enabled === true)
                                                .map(([patch]) => patch);
                                }

                                return undefined;
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

                        const optionalPatches = sanitizeOptionalPatches(raw.optionalPatches) ?? [];

                        const migrated = {
                                ...raw,
                                launcherUpdateUrl:
                                        sanitizeLauncherUrl(raw.launcherUpdateUrl) ??
                                        DEFAULT_LAUNCHER_UPDATE_URL,
                                realmListTrinitycore,
                                realmListAzerothcore,
                                realmList,
                                selectedRealm,
                                optionalPatches
                        };
                        delete (migrated as Record<string, unknown>).realmListLegionnaire;
                        const parsed = PreferencesSchema.parse({
                                ...migrated,
                                isPortable: !!portableDir,
                                clientDir: portableDir ?? raw.clientDir
                        });
                        void Logger.log('Preferences loaded', undefined, {
                                selectedRealm: parsed.selectedRealm,
                                realmList: parsed.realmList,
                                realmListTrinitycore: parsed.realmListTrinitycore,
                                realmListAzerothcore: parsed.realmListAzerothcore,
                                optionalPatches: parsed.optionalPatches,
                                launcherUpdateUrl: parsed.launcherUpdateUrl
                        });
                        return parsed;
                } catch (e) {
                        void Logger.log('Failed to load preferences, falling back to defaults', 'error', e);
                        const fallback = PreferencesSchema.parse({
                                isPortable: !!portableDir,
                                clientDir: portableDir
                        });
                        void Logger.log('Using default preferences', undefined, {
                                selectedRealm: fallback.selectedRealm,
                                realmList: fallback.realmList,
                                realmListTrinitycore: fallback.realmListTrinitycore,
                                realmListAzerothcore: fallback.realmListAzerothcore,
                                optionalPatches: fallback.optionalPatches,
                                launcherUpdateUrl: fallback.launcherUpdateUrl
                        });
                        return fallback;
                }
        }

        static get data(): PreferencesSchema {
                return this.#data;
        }

        static set data(newData: Partial<Omit<PreferencesSchema, 'portableDir'>>) {
                void Logger.log('Applying preference update', undefined, newData);
                this.#data = PreferencesSchema.parse({ ...this.#data, ...newData });
                void Logger.log('Updated preference snapshot', undefined, {
                        selectedRealm: this.#data.selectedRealm,
                        realmList: this.#data.realmList,
                        realmListTrinitycore: this.#data.realmListTrinitycore,
                        realmListAzerothcore: this.#data.realmListAzerothcore,
                        optionalPatches: this.#data.optionalPatches,
                        launcherUpdateUrl: this.#data.launcherUpdateUrl
                });
                void fs
                        .writeJSON(
                        path.join(this.userDataDir, 'settings.json'),
                        omit(
                                this.#data,
                                portableDir ? ['isPortable', 'clientDir'] : ['isPortable']
                        ),
                                { spaces: 2 }
                        )
                        .catch(error => {
                                void Logger.log('Failed to persist preferences to disk', 'error', error);
                        });
        }

	static async isValidClientDir(clientDir?: string) {
		return !!clientDir && (await fs.exists(path.join(clientDir, 'WoW.exe')));
	}
}

export default Preferences;
