import path from 'path';

import { screen } from 'electron';
import fs from 'fs-extra';

import Preferences from '~main/modules/preferences';
import { isNotUndef } from '~common/utils';
import Logger from '~main/modules/logger';
import { DEFAULT_REALMLIST, REALMS } from '~common/constants';

export const patchConfig = async () => {
        const { clientDir, selectedRealm, realmList } = Preferences.data;
        if (!clientDir) return;

        const realmKey = selectedRealm ?? 'legionnaire';
        const realmConfig = REALMS[realmKey];

        // Patch WoW.exe
        const exePath = path.join(clientDir, 'WoW.exe');
        const buffer = await fs.readFile(exePath);
        buffer.fill(0x00, 0x5f3a00, 0x5f3a00 + 6);
        buffer.write(realmConfig.build.string, 0x5f3a00, realmConfig.build.string.length);
        buffer.writeUInt16LE(realmConfig.build.number, 0x4c99f0);

        const writeByte = (offset: number, value: number) => buffer.writeUInt8(value, offset);
        const writeBytes = (offset: number, values: number[]) =>
                values.forEach((value, index) => buffer.writeUInt8(value, offset + index));
        const fillBytes = (offset: number, value: number, count: number) =>
                buffer.fill(value, offset, offset + count);

        // SIG & MD5 Protection Remover
        (
                [
                        [0x1f41bf, 0xeb],
                        [0x415a25, 0xeb],
			[0x415a3f, 0x03],
			[0x415a95, 0x03],
                        [0x415b46, 0xeb],
                        [0x415b5f, [0xb8, 0x03, 0x00, 0x00, 0x00, 0xeb, 0xed]]
		] as [number, number | number[]][]
	).forEach(([offset, value]) => {
		if (Array.isArray(value)) {
			value.forEach((v, i) => buffer.writeUInt8(v, offset + i));
		} else {
                        buffer.writeUInt8(value, offset);
                }
        });

        // windowed mode to full screen
        writeByte(0x0e94, 0xeb);

        // melee swing on right-click
        fillBytes(0x2e1c67, 0x90, 11);

        // NPC attack animation when turning
        writeByte(0x33d7c9, 0xeb);

        // "ghost" attack when NPC evades from combat
        writeByte(0x0355bf, 0xeb);

        // missing pre cast animation when canceling channeled spells
        fillBytes(0x33e0d6, 0x90, 22);

        // mouse flickering and camera snapping issue when mouse has high report rate
        // credits to bonbigz
        writeBytes(0x469a2c, [0xe9, 0x71, 0xf0, 0x0b, 0x00, 0xf8, 0x13, 0xd4, 0x00, 0x8b, 0x1d, 0xfc]);
        writeBytes(0x528aa2, [
                0x8d,
                0x4d,
                0xf0,
                0x51,
                0x57,
                0xff,
                0x15,
                0xdc,
                0xf5,
                0x9d,
                0x00,
                0x8b,
                0x45,
                0xf0,
                0x8b,
                0x15,
                0xf8,
                0x13,
                0xd4,
                0x00,
                0xe9,
                0x7a,
                0x0f,
                0xf4,
                0xff
        ]);
        writeBytes(0x4691b1, [
                0x89,
                0xe5,
                0x8b,
                0x05,
                0xfc,
                0x13,
                0xd4,
                0x00,
                0x8b,
                0x0d,
                0xf8,
                0x13,
                0xd4,
                0x00,
                0xeb,
                0xc2,
                0x7d,
                0x03,
                0x83,
                0xc1,
                0x01,
                0x83,
                0xc0,
                0x32,
                0x83,
                0xc1,
                0x32,
                0x3b,
                0x0d,
                0xec,
                0xbc,
                0xca,
                0x00,
                0x7e,
                0x03,
                0x83,
                0xe9,
                0x01,
                0x3b,
                0x05,
                0xf0,
                0xbc,
                0xca,
                0x00,
                0x7e,
                0x03,
                0x83,
                0xe8,
                0x01,
                0x83,
                0xe9,
                0x32,
                0x83,
                0xe8,
                0x32,
                0x89,
                0x0d,
                0xf8,
                0x13,
                0xd4,
                0x00,
                0x89,
                0x05,
                0xfc,
                0x13,
                0xd4,
                0x00,
                0x89,
                0xec,
                0x5d,
                0xe9,
                0xb4,
                0xf7,
                0xff,
                0xff,
                0xec,
                0x5d,
                0xc3,
                0xc3
        ]);
        writeBytes(0x469183, [
                0x83,
                0xf8,
                0x32,
                0x7d,
                0x03,
                0x83,
                0xc0,
                0x01,
                0x83,
                0xf9,
                0x32,
                0xeb,
                0x31
        ]);

        // naked character issue (disables SPELL_AURA_X_RAY)
        writeByte(0x1ddc5d, 0xeb);

        // patches missiles impacting with terrain
        // (spell effects such as Typhoon will lose their visual effect once they impact with terrain)
        // (Typhoon is spanwed on the ground so it loses its visual most of the time)
        // WARNING: This might break other ground impact spell visuals (e.g. Wintergrasp Cannons)
        // writeByte(0x1fc99e, 0x00);
        // writeByte(0x1fc8c7, 0x00);
        // writeByte(0x1fc735, 0x00);

        // patch mail request timeout
        // you no longer need to wait 60 seconds or relog to receive new mail
        writeBytes(0x16d899, [0x05, 0x01, 0x00, 0x00, 0x00]);

        // patch area trigger timer to be more precise (250ms -> 50ms)
        writeByte(0x2db241, 50);

        // Return of "The Blue Moon"
        writeBytes(0x5cfbc0, [0xc7, 0x05, 0x74, 0x8e, 0xd3, 0x00, 0xff, 0xff, 0xff, 0xff, 0xc3]);

        // Allow chat commands while dead
        writeByte(0x10ca41, 0xeb);

        await fs.writeFile(exePath, buffer);

        await fs.remove(path.join(clientDir, 'Data', 'enUs', 'realmlist.wtf'));
	await fs.ensureDir(path.join(clientDir, 'WTF'));

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

        const realmHost = realmList ?? DEFAULT_REALMLIST;

        const realmInfo = {
                realmList: realmHost,
                patchList: realmHost,
                realmName: realmConfig.realmName
        };

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
		...realmInfo,
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
