import { z } from 'zod';

import {
        DEFAULT_LAUNCHER_UPDATE_URL,
        DEFAULT_REALMLIST,
        REALMLIST_DEFAULTS,
        REALM_IDS
} from './constants';

/**
 * Zod type wrappers for use with form inputs
 */
const protocolRegex = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;

const normalizeLauncherUrl = (value: string) => {
        const trimmed = value.trim();
        const withProtocol = protocolRegex.test(trimmed) ? trimmed : `http://${trimmed}`;
        return withProtocol.endsWith('/') ? withProtocol : `${withProtocol}/`;
};

const f = {
        boolean: (defaultValue?: boolean) =>
                z.boolean().nullish().default(!!defaultValue),
        number: (defaultValue?: number, val?: (v: z.ZodNumber) => z.ZodNumber) =>
		z.preprocess(
			v =>
				v === '' || v === undefined
					? defaultValue ?? null
					: typeof v === 'string'
					? Number(v)
					: v,
			(val?.(z.number()) ?? z.number()).nullish()
		)
};

export const PreferencesSchema = z.object({
        isPortable: z.boolean().optional(),
        clientDir: z.string().optional(),
        reopenLauncher: f.boolean(),
        cleanWdb: f.boolean(true),
        rememberPosition: f.boolean(),
        launcherUpdateUrl: z
                .string()
                .trim()
                .min(1)
                .transform(normalizeLauncherUrl)
                .default(DEFAULT_LAUNCHER_UPDATE_URL),
        realmListLegionnaire: z
                .string()
                .trim()
                .min(1)
                .default(REALMLIST_DEFAULTS.legionnaire),
        realmListAzerothcore: z
                .string()
                .trim()
                .min(1)
                .default(REALMLIST_DEFAULTS.azerothcore),
        realmList: z.string().trim().min(1).default(DEFAULT_REALMLIST),
        windowPosition: z
                .object({
                        x: z.number(),
                        y: z.number(),
                        width: z.number(),
                        height: z.number()
                })
                .nullish(),
        selectedRealm: z.enum(REALM_IDS).default('legionnaire'),
        optionalPatches: z.array(z.string()).default([])
});
export type PreferencesSchema = z.infer<typeof PreferencesSchema>;
