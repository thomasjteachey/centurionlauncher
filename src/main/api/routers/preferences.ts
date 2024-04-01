import { PreferencesSchema } from '~common/schemas';
import Preferences from '~main/modules/preferences';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const preferencesRouter = createTRPCRouter({
	get: publicProcedure
		.output(PreferencesSchema)
		.query(() => Preferences.read()),
	set: publicProcedure
		.input(PreferencesSchema.partial())
		.mutation(async ({ input }) => {
			await Preferences.write(input);
			return await Preferences.read();
		})
});
