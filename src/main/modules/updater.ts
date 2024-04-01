import path from 'node:path';
import { exec } from 'node:child_process';
import os from 'node:os';

import fetch from 'node-fetch';
import fs from 'fs-extra';
import yauzl from 'yauzl-promise';

import { mainWindow } from '~main/index';
import { formatDuration, formatFileSize } from '~common/utils';

import Logger from './logger';
import Preferences from './preferences';
import Observable from './observable';
import resumableFetch, { type FetchProgress } from './resumableFetch';

// const isReadOnly = async (filePath: string) => {
// 	try {
// 		const { mode } = await fs.stat(filePath);
// 		return !(mode & fs.constants.S_IWUSR);
// 	} catch (e) {
// 		return false;
// 	}
// };

const execAsync = (commands: Partial<Record<NodeJS.Platform, string>>) => {
	const command = commands[os.platform()];
	if (!command) return Promise.resolve(undefined);
	return new Promise<string | undefined>(resolve => {
		exec(command, (error, stdout) => {
			if (error) resolve(undefined);
			else resolve(stdout);
		});
	});
};

const getAvailableDiskSpace = async (clientPath?: string) => {
	const response = await execAsync({
		win32:
			'%SYSTEMROOT%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n=\'Free\';e={($_.Free / 1GB)}}"'
	});
	if (!response) return Infinity;
	const drive = clientPath?.split(':')[0] ?? 'C';
	const space = parseFloat(
		response
			.split('\n')
			.find(l => l.trim().startsWith(drive))
			?.split(/\s+/)?.[1] ?? '0'
	);
	return space * 1024 ** 3;
};

export const isGameRunning = async () => {
	const response = await execAsync({
		win32: '%SYSTEMROOT%\\System32\\tasklist.exe'
	});
	if (!response) return false;
	return response.toLowerCase().includes('wow.exe');
};

const fetchFile = async (
	filePath: string,
	progressCb?: (p: FetchProgress) => void
) => {
	try {
		const downloadPath = path.join(Preferences.userDataDir, filePath);
		await resumableFetch(
			`http://138.197.110.226/centurion/downloads/patches/${filePath}`,
			downloadPath,
			progressCb,
			{ throttle: 500 }
		);
		return downloadPath;
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

const fetchSize = async (filePath: string) => {
	try {
		const response = await fetch(
			`http://138.197.110.226/centurion/downloads/patches/${filePath}`,
			{ method: 'HEAD' }
		);
		return parseInt(response.headers.get('content-length') ?? '0');
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

const fetchVersion = async (filePath: string) => {
	try {
		const response = await fetch(
			`http://138.197.110.226/centurion/downloads/patches/${filePath}`
		);
		return response.text();
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

type VersionCache = {
	addon?: string;
	patch?: string;
};

type UpdaterState =
	| 'verifying'
	| 'serverUnreachable'
	| 'noClient'
	| 'updateAvailable'
	| 'updating'
	| 'upToDate'
	| 'failed';

export type UpdaterStatus = {
	state: UpdaterState;
	progress?: number;
	message?: string;
};

class UpdaterClass extends Observable<UpdaterStatus> {
	get #cachePath() {
		return Preferences.read().then(({ clientDir }) =>
			clientDir ? path.join(clientDir, 'update-cache.json') : undefined
		);
	}

	#cache: VersionCache = {};

	#loadCache = async () => {
		const p = await this.#cachePath;
		return p && (await fs.exists(p)) ? await fs.readJSON(p) : {};
	};

	#saveCache = async () => {
		const p = await this.#cachePath;
		p && (await fs.writeJSON(p, this.#cache, { spaces: 2 }));
	};

	protected _value: UpdaterStatus = { state: 'failed' };

	get status() {
		return this._value;
	}
	private set status(v: UpdaterStatus) {
		this._value = v;
		this._notifyObservers(v);
		if (this.status.state === 'failed') {
			mainWindow?.setProgressBar(1, { mode: 'error' });
		} else if (this.status.progress === 1) {
			mainWindow?.setProgressBar(0);
		} else {
			mainWindow?.setProgressBar(this.status.progress ?? 0, {
				mode: this.status.progress === -1 ? 'indeterminate' : 'normal'
			});
		}
	}

	async verify(clientPath?: string) {
		try {
			if (
				this.status?.state === 'verifying' ||
				this.status?.state === 'updating'
			)
				return;

			if (!clientPath) {
				this.status = { state: 'noClient' };
				return;
			}

			if (os.platform() === 'win32' && clientPath.length > 220) {
				this.status = {
					state: 'failed',
					message:
						'Path to current install location is too long and may cause issues.'
				};
				return;
			}

			if (await isGameRunning()) {
				this.status = {
					state: 'failed',
					message: 'Please close WoW first, before updating.'
				};
				return;
			}

			Logger.log(`Verifying client files at ${path.join(clientPath)}...`);
			this.status = {
				state: 'verifying',
				progress: -1,
				message: 'Looking for updates...'
			};

			this.#cache = await this.#loadCache();
			let toDownload = 0;

			const addonVersion = await fetchVersion('addon.version');
			if (this.#cache.addon !== addonVersion) {
				Logger.log(`New addon version available: ${addonVersion}`);
				this.#cache.addon = undefined;
				toDownload += await fetchSize('CENTURION_AddOns.zip');
			}

			const patchVersion = await fetchVersion('patch7.version');
			if (this.#cache.patch !== patchVersion) {
				Logger.log(`New patch version available: ${patchVersion}`);
				this.#cache.patch = undefined;
				toDownload += await fetchSize('patch-enUS-7.zip');
			}

			if (toDownload !== 0) {
				const availableSpace = await getAvailableDiskSpace(clientPath);
				if (toDownload > availableSpace) {
					this.status = {
						state: 'failed',
						message: `Not enough disk space. Required: ${formatFileSize(
							toDownload
						)}, Available: ${formatFileSize(availableSpace)}`
					};
					return;
				}
			}

			this.status =
				!this.#cache.addon || !this.#cache.patch
					? { state: 'updateAvailable', message: formatFileSize(toDownload) }
					: { state: 'upToDate', progress: 1 };
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Unexpected error occurred';
			Logger.log(`Verification failed: ${message}`, 'error', e);
			this.status = { state: 'failed', message };
		}
	}

	async update(clientPath: string, force?: boolean) {
		try {
			if (
				this.status?.state === 'verifying' ||
				this.status?.state === 'updating'
			)
				return;

			if (await isGameRunning()) {
				this.status = {
					state: 'failed',
					message: 'Please close WoW first, before updating.'
				};
				return;
			}

			Logger.log(`Updating client files at ${path.join(clientPath)}...`);
			this.status = {
				state: 'updating',
				progress: -1,
				message: 'Preparing files...'
			};

			const progressCb = (name: string) => (p: FetchProgress) => {
				const progress =
					(p.done + p.initialPartial) / (p.total + p.initialPartial);
				const percent = Math.round(progress * 100);
				const elapsed = (Date.now() - p.startedAt) / 1000;
				const rate = p.done / elapsed;
				const eta = formatDuration(p.total / rate - elapsed);
				this.status = {
					state: 'updating',
					progress,
					message: `Downloading ${name}... ${percent}% (${eta} remaining)`
				};
			};

			const extractArchive = async (file: string, filePath: string) => {
				let finished = false;
				const archive = await yauzl.open(file);
				try {
					for await (const entry of archive) {
						Logger.log(`Extracting "${entry.filename}"...`);
						if (entry.filename.endsWith('/')) {
							await fs.ensureDir(path.join(filePath, entry.filename));
						} else {
							const dest = path.join(filePath, entry.filename);
							await fs.ensureDir(path.dirname(dest));
							const readStream = await entry.openReadStream();
							const writeStream = fs.createWriteStream(dest);
							await new Promise((resolve, reject) => {
								readStream.pipe(writeStream);
								writeStream.on('finish', resolve);
								writeStream.on('error', reject);
							});
						}
					}
					finished = true;
				} finally {
					await archive.close();
					if (finished) {
						Logger.log(`Removing "${file}"...`);
						await fs.remove(file);
					}
				}
			};

			if (force || !this.#cache.addon) {
				Logger.log('Downloading addon files...');
				const file = await fetchFile(
					'CENTURION_AddOns.zip',
					progressCb('addon files')
				);

				const extractPath = path.join(clientPath, 'Interface', 'Addons');
				await extractArchive(file, extractPath);

				this.#cache.addon = await fetchVersion('addon.version');
				this.#saveCache();
			}

			if (force || !this.#cache.patch) {
				Logger.log('Downloading patch...');
				const file = await fetchFile('patch-enUS-7.zip', progressCb('patch'));

				const extractPath = path.join(clientPath, 'Data', 'enUS');
				await extractArchive(file, extractPath);

				this.#cache.patch = await fetchVersion('patch7.version');
				this.#saveCache();
			}

			this.status = { state: 'upToDate', progress: 1 };
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Unexpected error occurred';
			Logger.log(`Update failed: ${message}`, 'error', e);
			this.status = { state: 'failed', message };
		}
	}
}

const Updater = new UpdaterClass();
Preferences.read().then(r => Updater.verify(r.clientDir));
export default Updater;
