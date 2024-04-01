import { z } from 'zod';

import Preferences from '~main/modules/preferences';
import Updater from '~main/modules/updater';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const updaterRouter = createTRPCRouter({
	verify: publicProcedure.mutation(async () => {
		const { clientDir } = await Preferences.read();
		Updater.verify(clientDir);
	}),
	update: publicProcedure
		.input(z.object({ force: z.boolean() }).optional())
		.mutation(async ({ input }) => {
			const { clientDir } = await Preferences.read();
			if (!clientDir) return;
			Updater.update(clientDir, input?.force);
		}),
	observe: publicProcedure.subscription(() => Updater.observe())
});
