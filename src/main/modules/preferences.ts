import path from 'path';

import fs from 'fs-extra';
import { app } from 'electron';

import {
        DEFAULT_AZEROTHCORE_REALMLIST,
        DEFAULT_LAUNCHER_UPDATE_URL,
        DEFAULT_REALMLIST
} from '~common/constants';
import {
        PreferencesSchema,
        type PreferencesSchema as PreferencesData
} from '~common/schemas';
import { omit } from '~common/utils';

const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;

const enforceRealmVisibility = (prefs: PreferencesData): PreferencesData =>
        prefs.isDev ? prefs : { ...prefs, selectedRealm: 'legionnaire_plus' };

abstract class Preferences {
        static #data: PreferencesData = enforceRealmVisibility(
                PreferencesSchema.parse({
                        launcherUpdateUrl: DEFAULT_LAUNCHER_UPDATE_URL,
                        realmList: DEFAULT_REALMLIST,
                        azerothcoreRealmList: DEFAULT_AZEROTHCORE_REALMLIST
                })
        );

        static readonly userDataDir = process.env.PORTABLE_EXECUTABLE_DIR
                ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, '.launcher')
                : app.getPath('userData');

        static async load() {
                const userDataPath = path.join(this.userDataDir, 'settings.json');
                try {
                        const json = await fs.readJSON(userDataPath);
                        return enforceRealmVisibility(
                                PreferencesSchema.parse({
                                        ...json,
                                        isPortable: !!portableDir,
                                        clientDir: portableDir ?? json.clientDir
                                })
                        );
                } catch (e) {
                        return enforceRealmVisibility(
                                PreferencesSchema.parse({
                                        isPortable: !!portableDir,
                                        clientDir: portableDir
                                })
                        );
                }
        }

        static get data(): PreferencesData {
                return this.#data;
        }

        static set data(newData: Partial<Omit<PreferencesData, 'portableDir'>>) {
                const parsed = PreferencesSchema.parse({ ...this.#data, ...newData });
                this.#data = enforceRealmVisibility(parsed);
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
