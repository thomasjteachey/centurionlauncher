import { z } from 'zod';

import { PreferencesSchema } from '~common/schemas';
import Preferences from '~main/modules/preferences';
import Updater from '~main/modules/updater';
import Logger from '~main/modules/logger';

const areArraysEqual = (a?: string[], b?: string[]) => {
        if (a === b) return true;

        const first = [...(a ?? [])].sort();
        const second = [...(b ?? [])].sort();

        if (first.length !== second.length) {
                return false;
        }

        return first.every((value, index) => value === second[index]);
};

import { createTRPCRouter, publicProcedure } from '../trpc';

export const preferencesRouter = createTRPCRouter({
        get: publicProcedure.output(PreferencesSchema).query(() => {
                void Logger.log('preferences.get invoked');
                return Preferences.data;
        }),
        set: publicProcedure
                .input(PreferencesSchema.partial())
                .mutation(async ({ input }) => {
                        void Logger.log('preferences.set invoked', undefined, input);
                        const previousPreferences = Preferences.data;

                        if (
                                input.clientDir &&
                                !(await Preferences.isValidClientDir(input.clientDir))
                        ) {
                                void Logger.log('Rejected invalid client directory in preferences.set', 'warning', {
                                        clientDir: input.clientDir
                                });
                                throw new Error('Invalid client directory. WoW.exe not found.');
                        }
                        const previousUrl = previousPreferences.launcherUpdateUrl;
                        Preferences.data = input;

                        const currentPreferences = Preferences.data;

                        if (
                                input.launcherUpdateUrl !== undefined &&
                                currentPreferences.launcherUpdateUrl !== previousUrl
                        ) {
                                void Logger.log('Launcher update URL changed, triggering verification');
                                void Updater.verify();
                        }

                        const realmChanged =
                                input.selectedRealm !== undefined &&
                                currentPreferences.selectedRealm !== previousPreferences.selectedRealm;
                        const optionalPatchesChanged =
                                input.optionalPatches !== undefined &&
                                !areArraysEqual(
                                        previousPreferences.optionalPatches,
                                        currentPreferences.optionalPatches
                                );

                        if (realmChanged || optionalPatchesChanged) {
                                void Logger.log('Realm or optional patches changed, invalidating updater cache', undefined, {
                                        realmChanged,
                                        optionalPatchesChanged
                                });
                                Updater.invalidate();
                        }

                        void Logger.log('preferences.set completed', undefined, {
                                selectedRealm: currentPreferences.selectedRealm,
                                realmList: currentPreferences.realmList,
                                realmListTrinitycore: currentPreferences.realmListTrinitycore,
                                realmListAzerothcore: currentPreferences.realmListAzerothcore,
                                optionalPatches: currentPreferences.optionalPatches,
                                launcherUpdateUrl: currentPreferences.launcherUpdateUrl
                        });
                        return currentPreferences;
                }),
	isValidClientDir: publicProcedure
		.input(z.string().optional())
		.query(({ input }) => Preferences.isValidClientDir(input))
});
