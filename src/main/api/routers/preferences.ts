import { z } from 'zod';

import { PreferencesSchema } from '~common/schemas';
import Preferences from '~main/modules/preferences';
import Updater from '~main/modules/updater';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const preferencesRouter = createTRPCRouter({
	get: publicProcedure.output(PreferencesSchema).query(() => Preferences.data),
	set: publicProcedure
		.input(PreferencesSchema.partial())
		.mutation(async ({ input }) => {
			if (
				input.clientDir &&
				!(await Preferences.isValidClientDir(input.clientDir))
			) {
				throw new Error('Invalid client directory. WoW.exe not found.');
			}
                        const previousUrl = Preferences.data.launcherUpdateUrl;
                        Preferences.data = input;

                        if (
                                input.launcherUpdateUrl !== undefined &&
                                Preferences.data.launcherUpdateUrl !== previousUrl
                        ) {
                                void Updater.verify();
                        }

                        return Preferences.data;
                }),
	isValidClientDir: publicProcedure
		.input(z.string().optional())
		.query(({ input }) => Preferences.isValidClientDir(input))
});
