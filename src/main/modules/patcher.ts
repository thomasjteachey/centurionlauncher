import path from 'path';

import { screen } from 'electron';
import fs from 'fs-extra';

import Preferences from '~main/modules/preferences';
import { isNotUndef } from '~common/utils';
import Logger from '~main/modules/logger';

export const patchConfig = async () => {
	const { clientDir } = await Preferences.read();
	if (!clientDir) return;

	await fs.remove(path.join(clientDir, 'Data', 'enUs', 'realmlist.wtf'));
	const configPath = path.join(clientDir, 'WTF', 'Config.wtf');
	const raw = (await fs.exists(configPath))
		? await fs.readFile(configPath, { encoding: 'utf-8' })
		: '';
	await fs.remove(configPath);

	const configWtf = Object.fromEntries(
		raw
			.split('\n')
			.map(l => {
				const [_, k, v] = l.match(/SET (\w+) "(.+)"/) ?? [];
				return !k || !v ? undefined : [k, v];
			})
			.filter(isNotUndef)
	);

	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = primaryDisplay.bounds;

	const parsed = {
		// Defaults
		gxResolution: `${width}x${height}`,
		// gxColorBits: primaryDisplay.colorDepth,
		// gxDepthBits: primaryDisplay.colorDepth,
		// gxRefresh: 60,
		// gxMultisample: 8,
		// gxMultisampleQuality: 0,
		// gxTripleBuffer: 1,
		// anisotropic: 16,
		// frillDensity: 48,
		// fullAlpha: 1,
		// SmallCull: 0.01,
		// DistCull: 888.8,
		// shadowLevel: 0,
		// trilinear: 1,
		// specular: 1,
		// pixelShaders: 1,
		// M2UsePixelShaders: 1,
		// particleDensity: 1,
		// unitDrawDist: 300,
		// weatherDensity: 3,
		// movieSubtitle: 1,
		// minimapZoom: 0,
		// minimapInsideZoom: 0,
		// SoundZoneMusicNoDelay: 1,
		// Parsed config
		...configWtf,
		// Realm list
		realmList: '138.197.110.226',
		patchList: '138.197.110.226',
		realmName: 'Legionnaire',
		// Mandatory
		hwDetect: 0, // Skip hardware change detection
		gxWindow: 1, // Maximized windowed mode
		gxMaximize: 1, // Maximized windowed mode
		gxCursor: 1, // Hardware cursor
		// M2UseShaders: 1, // Vertex animation shader
		checkAddonVersion: 0 // Load out of date addons
	};

	await fs.writeFile(
		configPath,
		Object.entries(parsed)
			.filter(v => v[1] !== undefined && v[1] !== null)
			.map(l => `SET ${l[0]} "${l[1]}"`)
			.join('\n')
	);
	Logger.log('Config.wtf successfully patched');
};
