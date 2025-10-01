import path from 'node:path';
import { exec } from 'node:child_process';
import os from 'node:os';

import fetch from 'node-fetch';
import fs from 'fs-extra';
import yauzl from 'yauzl-promise';

import { mainWindow } from '~main/index';
import { formatDuration, formatFileSize } from '~common/utils';
import { DEFAULT_LAUNCHER_UPDATE_URL, FileMap } from '~common/constants';

import Logger from './logger';
import Preferences from './preferences';
import Observable from './observable';
import resumableFetch, { type FetchProgress } from './resumableFetch';

const resolveBaseUrl = () => {
        const { launcherUpdateUrl } = Preferences.data;
        return launcherUpdateUrl ?? DEFAULT_LAUNCHER_UPDATE_URL;
};

const resolvePatchUrl = (filePath: string) =>
        new URL(`patches/${filePath.replace(/^\/+/, '')}`, resolveBaseUrl()).toString();

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
		await fs.ensureDir(path.join(Preferences.userDataDir, 'downloads'));
		const downloadPath = path.join(
			Preferences.userDataDir,
			'downloads',
			filePath
		);
                await resumableFetch(
                        resolvePatchUrl(filePath),
                        downloadPath,
                        progressCb,
                        {
				throttle: 500
			}
		);
		return downloadPath;
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

const fetchSize = async (filePath: string) => {
	try {
                const response = await fetch(resolvePatchUrl(filePath), {
                        method: 'HEAD'
                });
		return parseInt(response.headers.get('content-length') ?? '0');
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

const fetchVersion = async (filePath: string) => {
	try {
                const response = await fetch(resolvePatchUrl(filePath));
		return response.text();
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

type UpdaterState =
        | 'needsValidation'
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
	#versionCache: Record<string, string> = {};
        #fileCache: Record<string, string[]> = {};

        #cachePatchFiles = async (
                clientDir: string,
                name: string,
                version: string,
                extractPath: string,
                files: string[]
        ) => {
                if (files.length === 0) return;

                const cacheRoot = path.join(clientDir, '.launcher', 'cached', name);
                const cachePath = path.join(cacheRoot, version);

                try {
                        await fs.ensureDir(path.join(clientDir, '.launcher', 'cached'));
                        await fs.remove(cacheRoot);
                        await fs.ensureDir(cachePath);

                        for (const file of files) {
                                const source = path.join(clientDir, extractPath, file);
                                if (!(await fs.pathExists(source))) continue;

                                const destination = path.join(cachePath, file);
                                await fs.ensureDir(path.dirname(destination));
                                await fs.copy(source, destination, { overwrite: true });
                        }
                } catch (e) {
                        Logger.log(`Failed to populate cache for ${name}@${version}`, 'error', e);
                }
        };

	#loadCache = async (clientDir: string) => {
		await fs.ensureDir(path.join(clientDir, '.launcher'));

		const versionCache = path.join(clientDir, '.launcher', 'update-cache.json');
		this.#versionCache = (await fs.exists(versionCache))
			? await fs.readJSON(versionCache)
			: {};

		const fileCache = path.join(clientDir, '.launcher', 'file-cache.json');
		this.#fileCache = (await fs.exists(fileCache))
			? await fs.readJSON(fileCache)
			: {};
	};

	#saveCache = async (clientDir: string) => {
		await fs.ensureDir(path.join(clientDir, '.launcher'));

		const versionCache = path.join(clientDir, '.launcher', 'update-cache.json');
		await fs.writeJSON(versionCache, this.#versionCache, { spaces: 2 });

		const fileCache = path.join(clientDir, '.launcher', 'file-cache.json');
		await fs.writeJSON(fileCache, this.#fileCache, { spaces: 2 });
	};

	protected _value: UpdaterStatus = { state: 'needsValidation' };

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

	invalidate() {
		this.status = { state: 'needsValidation' };
	}

        async updateLauncher() {
                Logger.log('Launcher updates are currently disabled.');
                this.status = {
                        state: 'failed',
                        message: 'Launcher updates are currently disabled. Please download the latest release manually.'
                };
        }

	async verify() {
                const { clientDir, optionalPatches, selectedRealm, isPortable } =
                        Preferences.data;
                const realmKey = selectedRealm ?? 'legionnaire';
		try {
			if (
				this.status?.state === 'verifying' ||
				this.status?.state === 'updating'
			)
				return;

			if (!clientDir || !(await Preferences.isValidClientDir(clientDir))) {
				this.status = { state: 'noClient' };
				return;
			}

                        if (isPortable) {
                                await fs.remove(path.join(clientDir, 'update-script.bat'));
                        }

			if (os.platform() === 'win32' && clientDir.length > 220) {
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

			Logger.log(`Verifying client files at ${path.join(clientDir)}...`);
			this.status = {
				state: 'verifying',
				progress: -1,
				message: 'Looking for updates...'
			};

			await this.#loadCache(clientDir);
			let toDownload = 0;

                        for (const [name, meta] of Object.entries(FileMap)) {
                                const version = await fetchVersion(`${name}.version`);

                                const shouldCache = !!meta.optional || !!meta.realms;
                                const cachePath = shouldCache
                                        ? path.join(
                                                  clientDir,
                                                  '.launcher',
                                                  'cached',
                                                  name,
                                                  version
                                          )
                                        : undefined;

                                const isOptionalEnabled =
                                        !meta.optional || optionalPatches.includes(name);
                                const isRealmEnabled =
                                        !meta.realms || meta.realms.includes(realmKey);
                                const shouldUse = isOptionalEnabled && isRealmEnabled;

                                if (!shouldUse) {
                                        if (shouldCache && this.#versionCache[name]) {
                                                // Move files to cache
                                                await fs.remove(cachePath!);
                                                await fs.ensureDir(cachePath!);
                                                for (const file of this.#fileCache[name] ?? []) {
                                                        try {
                                                                await fs.move(
                                                                        path.join(clientDir, meta.extractPath, file),
                                                                        path.join(cachePath!, file),
                                                                        { overwrite: true }
                                                                );
                                                        } catch (_error) {
                                                                console.error(_error);
                                                        }
                                                }
                                        }
                                        continue;
                                }

                                let expectedFiles = this.#fileCache[name];
                                if (!expectedFiles) {
                                        expectedFiles = [];
                                        this.#fileCache[name] = expectedFiles;
                                }

                                const hasAllFiles = async () => {
                                        if (expectedFiles.length === 0) {
                                                if (!shouldCache) {
                                                        try {
                                                                const entries = await fs.readdir(
                                                                        path.join(clientDir, meta.extractPath)
                                                                );
                                                                const inferredFiles = entries.filter(entry =>
                                                                        entry
                                                                                .toLowerCase()
                                                                                .startsWith(name.toLowerCase())
                                                                );

                                                                if (inferredFiles.length !== 0) {
                                                                        expectedFiles.splice(
                                                                                0,
                                                                                expectedFiles.length,
                                                                                ...inferredFiles
                                                                        );
                                                                }
                                                        } catch (_error) {
                                                                // If the directory doesn't exist yet we fall back to the
                                                                // standard download path below.
                                                        }
                                                }

                                                if (expectedFiles.length === 0) {
                                                        return false;
                                                }
                                        }
                                        for (const file of expectedFiles) {
                                                const destination = path.join(
                                                        clientDir,
                                                        meta.extractPath,
                                                        file
                                                );
                                                if (!(await fs.pathExists(destination))) {
                                                        return false;
                                                }
                                        }
                                        return true;
                                };

                                const restoreFromCache = async () => {
                                        if (!shouldCache || !cachePath || !(await fs.exists(cachePath))) {
                                                return false;
                                        }

                                        const collectCacheFiles = async (dir: string) => {
                                                const entries = await fs.readdir(dir);
                                                const files: string[] = [];
                                                for (const entry of entries) {
                                                        const entryPath = path.join(dir, entry);
                                                        const stats = await fs.stat(entryPath);
                                                        if (stats.isDirectory()) {
                                                                files.push(
                                                                        ...(await collectCacheFiles(entryPath))
                                                                );
                                                        } else {
                                                                files.push(
                                                                        path
                                                                                .relative(cachePath, entryPath)
                                                                                .replace(/\\/g, '/')
                                                                );
                                                        }
                                                }
                                                return files;
                                        };

                                        const filesToRestore =
                                                expectedFiles.length !== 0
                                                        ? expectedFiles
                                                        : await collectCacheFiles(cachePath);

                                        if (filesToRestore.length === 0) return false;

                                        let movedAny = false;
                                        for (const file of filesToRestore) {
                                                const source = path.join(cachePath, file);
                                                if (!(await fs.pathExists(source))) continue;
                                                const destination = path.join(
                                                        clientDir,
                                                        meta.extractPath,
                                                        file
                                                );
                                                try {
                                                        await fs.ensureDir(path.dirname(destination));
                                                        await fs.copy(source, destination, { overwrite: true });
                                                        movedAny = true;
                                                } catch (e) {
                                                        console.error(e);
                                                }
                                        }

                                        if (!movedAny) return false;

                                        const uniqueFiles = Array.from(
                                                new Set([...expectedFiles, ...filesToRestore])
                                        );
                                        expectedFiles.splice(0, expectedFiles.length, ...uniqueFiles);
                                        this.#fileCache[name] = expectedFiles;

                                        if (!(await hasAllFiles())) {
                                                return false;
                                        }

                                        this.#versionCache[name] = version;
                                        return true;
                                };

                                let needsDownload = false;
                                let downloadReason: 'missing' | 'update' | 'metadata' = 'update';

                                const cachedVersion = this.#versionCache[name];

                                if (cachedVersion === version) {
                                        if (await hasAllFiles()) {
                                                continue;
                                        }

                                        if (await restoreFromCache()) {
                                                continue;
                                        }

                                        Logger.log(
                                                `Missing files detected for ${name}. Scheduling download to restore them.`
                                        );
                                        delete this.#versionCache[name];
                                        needsDownload = true;
                                        downloadReason = 'missing';
                                } else if (!cachedVersion) {
                                        Logger.log(
                                                `No version metadata found for ${name}. Scheduling download to rebuild the cache.`
                                        );
                                        needsDownload = true;
                                        downloadReason = 'metadata';
                                } else {
                                        if (await restoreFromCache()) {
                                                continue;
                                        }
                                        delete this.#versionCache[name];
                                        needsDownload = true;
                                        downloadReason = 'update';
                                }

                                if (!needsDownload) continue;

                                if (shouldCache && cachePath) {
                                        await fs.remove(path.dirname(cachePath));
                                }

                                if (downloadReason === 'update') {
                                        Logger.log(`New ${name} version available: ${version}`);
                                } else if (downloadReason === 'missing') {
                                        Logger.log(`Re-downloading ${name} files to replace missing data.`);
                                } else {
                                        Logger.log(
                                                `Re-downloading ${name} to restore missing version metadata in the cache.`
                                        );
                                }

                                toDownload += await fetchSize(`${name}.zip`);
                        }

			await this.#saveCache(clientDir);

			if (toDownload !== 0) {
				const availableSpace = await getAvailableDiskSpace(clientDir);
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
				toDownload !== 0
					? { state: 'updateAvailable', message: formatFileSize(toDownload) }
					: { state: 'upToDate', progress: 1 };
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Unexpected error occurred';
			Logger.log(`Verification failed: ${message}`, 'error', e);
			this.status = { state: 'failed', message };
		}
	}

        async update(force?: boolean) {
                const { clientDir, optionalPatches, selectedRealm } = Preferences.data;
                const realmKey = selectedRealm ?? 'legionnaire';
		try {
			if (
				this.status?.state === 'verifying' ||
				this.status?.state === 'updating'
			)
				return;

			if (!clientDir || !(await Preferences.isValidClientDir(clientDir))) {
				this.status = { state: 'noClient' };
				return;
			}

			if (await isGameRunning()) {
				this.status = {
					state: 'failed',
					message: 'Please close WoW first, before updating.'
				};
				return;
			}

			if (force) {
				await fs.remove(path.join(Preferences.userDataDir, 'downloads'));
			}

			Logger.log(`Updating client files at ${path.join(clientDir)}...`);
			this.status = {
				state: 'updating',
				progress: -1,
				message: 'Preparing files...'
			};

                        const extractArchive = async (
                                name: string,
                                file: string,
                                filePath: string
                        ) => {
                                let finished = false;
                                const archive = await yauzl.open(file);
                                const extractedFiles: string[] = [];
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

                                                        extractedFiles.push(entry.filename);
                                                }
                                        }
                                        finished = true;
                                } finally {
                                        await archive.close();
                                        if (finished) {
                                                Logger.log(`Removing "${file}"...`);
                                                await fs.remove(file);
                                                this.#fileCache[name] = extractedFiles;
                                        }
                                }
                                return extractedFiles;
                        };

                        for (const [name, meta] of Object.entries(FileMap)) {
                                const isOptionalEnabled =
                                        !meta.optional || optionalPatches.includes(name);
                                const isRealmEnabled =
                                        !meta.realms || meta.realms.includes(realmKey);
                                const shouldUse = isOptionalEnabled && isRealmEnabled;
                                const shouldCache = !!meta.optional || !!meta.realms;

                                if (!shouldUse) {
                                        if (force) {
                                                delete this.#versionCache[name];
                                        }
                                        continue;
                                }

                                if (this.#versionCache[name] && !force) continue;

				Logger.log(`Downloading ${name} files...`);
				const file = await fetchFile(`${name}.zip`, (p: FetchProgress) => {
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
				});

				this.status = {
					state: 'updating',
					progress: -1,
					message: `Extracting ${name}...`
				};
                                const extractedFiles = await extractArchive(
                                        name,
                                        file,
                                        path.join(clientDir, meta.extractPath)
                                );

                                const version = await fetchVersion(`${name}.version`);
                                this.#versionCache[name] = version;

                                if (shouldCache) {
                                        await this.#cachePatchFiles(
                                                clientDir,
                                                name,
                                                version,
                                                meta.extractPath,
                                                extractedFiles
                                        );
                                }

                                await this.#saveCache(clientDir);
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
export default Updater;
