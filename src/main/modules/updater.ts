import path from 'node:path';
import { exec } from 'node:child_process';
import os from 'node:os';

import fetch from 'node-fetch';
import fs from 'fs-extra';
import yauzl from 'yauzl-promise';

import { mainWindow } from '~main/index';
import { formatDuration, formatFileSize } from '~common/utils';
import {
	DEFAULT_LAUNCHER_UPDATE_URL,
	FileMap,
	type RealmId
} from '~common/constants';

import Logger from './logger';
import Preferences from './preferences';
import Observable from './observable';
import resumableFetch, { type FetchProgress } from './resumableFetch';

type UpdaterState =
	| 'idle'
	| 'noClient'
	| 'verifying'
	| 'updateAvailable'
	| 'updating'
	| 'pendingRestart'
	| 'failed'
	| 'notAvailable'
	| 'upToDate';

export type UpdaterStatus = {
	state: UpdaterState;
	progress?: number;
	message?: string;
};

const execAsync = async (commands: { [platform: string]: string }) => {
	const command = commands[process.platform];
	if (!command) {
		return '';
	}
	return new Promise<string>((resolve, reject) => {
		exec(command, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(stdout.toString());
		});
	});
};

const getFreeSpaceBytes = async (clientPath?: string): Promise<number> => {
	if (!clientPath) return Infinity;

	const response = await execAsync({
		darwin: `df -g "${clientPath}" | tail -1 | awk '{print $4}'`,
		linux: `df -B1 "${clientPath}" | tail -1 | awk '{print $4}'`,
		win32:
			'%SYSTEMROOT%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -Command "$drive = (Get-Item \\"' +
			clientPath +
			'\\").PSDrive.Name; Get-PSDrive -Name $drive | Select-Object Name, @{n=\'Free\';e={($_.Free / 1GB)}}"'
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
	progressCb?: (p: FetchProgress) => void,
	force: boolean = false
) => {
	try {
		await fs.ensureDir(path.join(Preferences.userDataDir, 'downloads'));
		const downloadPath = path.join(
			Preferences.userDataDir,
			'downloads',
			filePath
		);

		const partialPath = `${downloadPath}.partial`;

		if (force) {
			Logger.log(`Force re-download requested for "${filePath}"`);
			if (await fs.pathExists(downloadPath)) {
				await fs.remove(downloadPath);
			}
			if (await fs.pathExists(partialPath)) {
				await fs.remove(partialPath);
			}
		}

		const updateUrl =
			Preferences.data.updateUrl || DEFAULT_LAUNCHER_UPDATE_URL;
		const url = `${updateUrl}${filePath}`;

		Logger.log(`Downloading file from "${url}"`);

		await resumableFetch(url, downloadPath, progressCb, {
			throttle: 250
		});

		const stats = await fs.stat(downloadPath);
		if (!stats.isFile()) {
			throw new Error('Downloaded file is not a valid file');
		}

		return downloadPath;
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

const fetchVersion = async (filePath: string) => {
	const updateUrl =
		Preferences.data.updateUrl || DEFAULT_LAUNCHER_UPDATE_URL;
	const url = `${updateUrl}${filePath}`;
	try {
		const response = await fetch(url);
		return response.text();
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

/**
 * Returns true if the error is the yauzl-promise assertion for a corrupt
 * Local File Header:
 *   "Invalid Local File Header signature"
 */
const isCorruptZipLocalHeaderError = (err: unknown): boolean => {
	if (!(err instanceof Error)) return false;
	return /Invalid Local File Header signature/i.test(err.message);
};

const getPlatformStrings = () => ({
	win32: 'win32',
	darwin: 'darwin',
	linux: 'linux'
});

const getDirectorsMessage = (realmKey: RealmId) => {
	switch (realmKey) {
		case 'prince_arthas':
			return 'Your suffering is not yet over.';
		case 'barracks':
			return 'Our greatest accomplishments are forged in fire.';
		case 'legionnaire_plus':
		default:
			return 'Always act honorably, even when no one is around.';
	}
};

class UpdaterClass extends Observable<UpdaterStatus> {
	#versionCache: Record<string, string> = {};
	#fileCache: Record<string, string[]> = {};
	#pendingInvalidations = new Set<string>();

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

		await fs.ensureDir(cacheRoot);

		// Clear out old versions of this patch, keep only the current
		for (const entry of await fs.readdir(cacheRoot)) {
			if (entry === version) continue;
			const otherPath = path.join(cacheRoot, entry);
			await fs.remove(otherPath);
		}

		await fs.ensureDir(cachePath);

		for (const file of files) {
			const source = path.join(clientDir, extractPath, file);
			if (!(await fs.pathExists(source))) continue;

			const destination = path.join(cachePath, file);
			await fs.ensureDir(path.dirname(destination));
			try {
				await fs.copy(source, destination, { overwrite: true });
			} catch (error) {
				console.error(error);
			}
		}
	};

	#loadCache = async (clientDir: string) => {
		const cacheDir = path.join(clientDir, '.launcher');
		const versionCache = path.join(cacheDir, 'version-cache.json');
		const fileCache = path.join(cacheDir, 'file-cache.json');

		try {
			this.#versionCache = (await fs.pathExists(versionCache))
				? await fs.readJSON(versionCache)
				: {};
		} catch (error) {
			console.error(error);
			this.#versionCache = {};
		}

		try {
			this.#fileCache = (await fs.pathExists(fileCache))
				? await fs.readJSON(fileCache)
				: {};
		} catch (error) {
			console.error(error);
			this.#fileCache = {};
		}
	};

	#saveCache = async (clientDir: string) => {
		const cacheDir = path.join(clientDir, '.launcher');
		const versionCache = path.join(cacheDir, 'version-cache.json');
		const fileCache = path.join(cacheDir, 'file-cache.json');

		await fs.ensureDir(cacheDir);
		await fs.writeJSON(versionCache, this.#versionCache, { spaces: 2 });
		await fs.writeJSON(fileCache, this.#fileCache, { spaces: 2 });
	};

	async #cleanupTempDownloads() {
		try {
			if (!(await fs.pathExists(Preferences.userDataDir))) return;
			const tempFolder = path.join(
				Preferences.userDataDir,
				'downloads'
			);
			await fs.remove(tempFolder);
		} catch (e) {
			Logger.log('Failed to clean up temp downloads', 'error', e);
		}
	}

	constructor() {
		super({ state: 'idle' });

		this.observe(status => {
			if (status.state === 'failed') {
				Logger.log(
					`Updater error: ${status.message ?? 'unknown error'}`,
					'error'
				);
			}
		});
	}

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
				mode: this.status.state === 'updating' ? 'normal' : 'indeterminate'
			});
		}
	}

	async invalidate() {
		this.#pendingInvalidations.clear();

		if (this.status.state === 'failed') {
			this.status = { state: 'idle' };
		}
	}

	async verify() {
		const {
			clientDir,
			optionalPatches,
			selectedRealm,
			isPortable
		} = Preferences.data;
		const realmKey = selectedRealm ?? 'legionnaire_plus';

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
				try {
					await fs.remove(path.join(clientDir, 'update.bat'));
				} catch (error) {
					console.error(error);
				}
			}

			if (os.platform() === 'win32' && clientDir.length > 220) {
				this.status = {
					state: 'failed',
					message:
						'Path to current install location is too long and may cause issues. Please move it to a shorter path.'
				};
				return;
			}

			if (await isGameRunning()) {
				this.status = {
					state: 'failed',
					message: 'Please close WoW before updating.'
				};
				return;
			}

			Logger.log(`Verifying client files at "${clientDir}"...`);

			this.status = {
				state: 'verifying',
				progress: 0,
				message: 'Looking for updates...'
			};

			await this.#loadCache(clientDir);

			let toDownload = 0;

			const verificationEntries = Object.entries(FileMap);
			const totalVerificationEntries = verificationEntries.length;
			let processedVerificationEntries = 0;

			for (const [name, meta] of verificationEntries) {
				processedVerificationEntries += 1;
				const verificationProgress =
					totalVerificationEntries === 0
						? -1
						: processedVerificationEntries / totalVerificationEntries;
				const displayName = meta.label ?? name;
				this.status = {
					state: 'verifying',
					progress: verificationProgress,
					message: `Looking for updates... (${displayName})`
				};

				const shouldCache = !!meta.optional || !!meta.realms;

				const isOptionalEnabled =
					!meta.optional || optionalPatches.includes(name);
				const isRealmEnabled =
					!meta.realms || meta.realms.includes(realmKey);
				const shouldUse = isOptionalEnabled && isRealmEnabled;

				// 🔹 Optimization: if this patch isn't used for the current realm/optional settings,
				// skip hitting the network and the heavy disk work. Optionally move files into cache.
				if (!shouldUse) {
					if (shouldCache && this.#versionCache[name]) {
						const cacheVersion = this.#versionCache[name];
						const cachePath = path.join(
							clientDir,
							'.launcher',
							'cached',
							name,
							cacheVersion
						);

						// Move files to cache without nuking an existing copy when there's
						// nothing new to move. This prevents losing cached data for realms
						// that remain disabled across multiple verification runs.
						const filesToMove = await Promise.all(
							(this.#fileCache[name] ?? []).map(async file => {
								const source = path.join(
									clientDir,
									meta.extractPath,
									file
								);
								return {
									file,
									source,
									exists: await fs.pathExists(source)
								};
							})
						);

						const existingSources = filesToMove.filter(
							({ exists }) => exists
						);

						if (existingSources.length !== 0) {
							await fs.ensureDir(
								path.join(clientDir, '.launcher', 'cached')
							);
							await fs.remove(cachePath);
							await fs.ensureDir(cachePath);

							for (const { file, source } of existingSources) {
								try {
									const destination = path.join(
										cachePath,
										file
									);
									await fs.ensureDir(
										path.dirname(destination)
									);
									await fs.move(source, destination, {
										overwrite: true
									});
								} catch (_error) {
									console.error(_error);
								}
							}
						}
					}
					this.#pendingInvalidations.delete(name);
					continue;
				}

				const version = await fetchVersion(`${name}.version`);

				const cachePath = shouldCache
					? path.join(
							clientDir,
							'.launcher',
							'cached',
							name,
							version
					  )
					: undefined;

				let expectedFiles = this.#fileCache[name];
				if (!expectedFiles) {
					expectedFiles = [];
					this.#fileCache[name] = expectedFiles;
				}

				const hasAllFiles = async () => {
					if (expectedFiles.length === 0) {
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
								this.#fileCache[name] = expectedFiles;
							}
						} catch (_error) {
							// If the directory doesn't exist yet we fall back to the
							// standard download path below.
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
					if (!shouldCache || !cachePath) {
						return false;
					}

					if (!(await fs.pathExists(cachePath))) {
						return false;
					}

					const filesToRestore =
						expectedFiles.length !== 0
							? expectedFiles
							: await (async () => {
									const entries = await fs.readdir(cachePath);
									const files: string[] = [];
									for (const entry of entries) {
										const entryPath = path.join(
											cachePath,
											entry
										);
										const stats = await fs.stat(entryPath);
										if (stats.isDirectory()) continue;
										files.push(entry);
									}
									return files;
							  })();

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
							await fs.copy(source, destination, {
								overwrite: true
							});
							movedAny = true;
						} catch (error) {
							console.error(error);
						}
					}

					if (!movedAny) return false;

					const uniqueFiles = Array.from(
						new Set([...expectedFiles, ...filesToRestore])
					);
					expectedFiles.splice(
						0,
						expectedFiles.length,
						...uniqueFiles
					);
					this.#fileCache[name] = expectedFiles;

					if (!(await hasAllFiles())) {
						return false;
					}

					this.#versionCache[name] = version;
					this.#pendingInvalidations.delete(name);
					return true;
				};

				let needsDownload = false;
				let downloadReason: 'missing' | 'update' | 'metadata' = 'update';

				const cachedVersion = this.#versionCache[name];

				if (cachedVersion === version) {
					if (await hasAllFiles()) {
						this.#pendingInvalidations.delete(name);
						continue;
					}

					if (await restoreFromCache()) {
						this.#pendingInvalidations.delete(name);
						continue;
					}

					Logger.log(
						`Cached version matches but files are missing for "${name}", marking for metadata re-download`
					);
					this.#pendingInvalidations.add(name);
					needsDownload = true;
					downloadReason = 'metadata';
				} else {
					if (await restoreFromCache()) {
						this.#pendingInvalidations.delete(name);
						continue;
					}
					this.#pendingInvalidations.add(name);
					needsDownload = true;
					downloadReason = 'update';
				}

				if (!needsDownload) continue;

				if (shouldCache && cachePath) {
					await fs.remove(path.dirname(cachePath));
					await fs.ensureDir(cachePath);
				}

				for (const file of meta.files ?? []) {
					const platformStrings = getPlatformStrings();
					const platform =
						platformStrings[
							os.platform() as keyof typeof platformStrings
						];
					if (
						file.platform &&
						file.platform !== platform &&
						file.skipWhenPlatformNotMatched !== false
					) {
						continue;
					}

					if (downloadReason === 'metadata') {
						toDownload += file.size ?? 0;
						continue;
					}

					if (downloadReason === 'update') {
						toDownload +=
							(file.extractSize ?? file.size ?? 0) +
							(file.size ?? 0);
					}
				}
			}

			if (toDownload !== 0) {
				this.status = {
					state: 'updateAvailable',
					message: formatFileSize(toDownload)
				};
			} else {
				this.status = { state: 'upToDate', progress: 1 };
			}
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Unexpected error occurred';
			Logger.log(`Verification failed: ${message}`, 'error', e);
			this.status = { state: 'failed', message };
		}
	}

	async update(force?: boolean) {
		const {
			clientDir,
			selectedRealm,
			optionalPatches,
			isPortable
		} = Preferences.data;
		const realmKey = selectedRealm ?? 'legionnaire_plus';

		if (!clientDir || !(await Preferences.isValidClientDir(clientDir))) {
			this.status = { state: 'noClient' };
			return;
		}

		try {
			if (
				this.status?.state === 'verifying' ||
				this.status?.state === 'updating'
			)
				return;

			if (await isGameRunning()) {
				this.status = {
					state: 'failed',
					message: 'Please close WoW before updating.'
				};
				return;
			}

			this.status = {
				state: 'updating',
				progress: 0,
				message: 'Initializing...'
			};

			await this.#loadCache(clientDir);

			const installerDir = path.join(clientDir, '.launcher');
			await fs.ensureDir(installerDir);

			const cacheDir = path.join(installerDir, 'cached');

			const versionInfoJson = await fetchVersion('version.json');
			let versionInfo: {
				version: string;
				minVersion?: string;
			};
			try {
				versionInfo = JSON.parse(versionInfoJson);
			} catch (error) {
				Logger.log(
					'Failed to parse version.json from update server',
					'error',
					error
				);
				this.status = {
					state: 'failed',
					message:
						'Failed to parse version data from update server. Please try again later.'
				};
				return;
			}

			const latestVersion = versionInfo.version;
			const currentVersion = Preferences.launcherVersion;

			const platformStrings = getPlatformStrings();
			const platform =
				platformStrings[
					os.platform() as keyof typeof platformStrings
				];

			this.status = {
				state: 'updating',
				progress: 0,
				message: `Downloading update...`
			};

			Logger.log('Downloading updater content...');

			const verificationEntries = Object.entries(FileMap);

			for (const [name, meta] of verificationEntries) {
				const displayName = meta.label ?? name;

				const isOptionalEnabled =
					!meta.optional || optionalPatches.includes(name);
				const isRealmEnabled =
					!meta.realms || meta.realms.includes(realmKey);

				const shouldUse = isOptionalEnabled && isRealmEnabled;
				const shouldCache = !!meta.optional || !!meta.realms;

				if (!shouldUse && !shouldCache) continue;

				const version = await fetchVersion(`${name}.version`);

				if (
					this.#versionCache[name] &&
					!force &&
					!this.#pendingInvalidations.has(name)
				)
					continue;

				if (this.status?.state !== 'updating') return;

				this.status = {
					state: 'updating',
					message: `Downloading ${displayName}...`
				};

				const files = meta.files ?? [];

				const totalSize = files.reduce(
					(sum, file) =>
						sum +
						(file.platform && file.platform !== platform
							? 0
							: file.size ?? 0),
					0
				);

				let downloaded = 0;

				await fs.ensureDir(clientDir);

				const cachePath = path.join(cacheDir, name, version);

				if (
					shouldCache &&
					(await fs.pathExists(cachePath)) &&
					!(await fs.readdir(cachePath)).length
				) {
					await fs.remove(path.dirname(cachePath));
				}

				const expectedFiles = this.#fileCache[name] || [];
				const extractedFiles: string[] = [];

				for (const file of files) {
					if (file.platform && file.platform !== platform) {
						continue;
					}

					const { extractPath = '', extractPrefix = '' } = file;

					const startedAt = Date.now();

					const downloadedFile = await fetchFile(
						file.download,
						file.progress === false
							? undefined
							: ({ done, total, initialPartial }) => {
									if (total === 0 && initialPartial === 0)
										return;

									const overallDone =
										downloaded + done + initialPartial;
									const overallTotal =
										totalSize + initialPartial;

									const progress =
										overallTotal > 0
											? overallDone / overallTotal
											: 0;

									const elapsed =
										(Date.now() - startedAt) / 1000;
									const rate =
										elapsed > 0
											? overallDone / elapsed
											: 0;
									const eta =
										rate > 0
											? formatDuration(
													(totalSize -
														overallDone) /
														rate
											  )
											: 'calculating...';

									this.status = {
										state: 'updating',
										progress,
										message: `Downloading ${displayName}... (${Math.round(
											progress * 100
										)}%, ${eta} remaining)`
									};
							  },
						force ?? false
					);

					let zip: yauzl.Zip | undefined;

					try {
						zip = await yauzl.open(downloadedFile);
					} catch (err) {
						if (isCorruptZipLocalHeaderError(err)) {
							Logger.log(
								`Downloaded zip "${file.download}" appears to be corrupt. Retrying once...`,
								'error',
								err
							);
							// Retry once with force=true
							const retryFile = await fetchFile(
								file.download,
								undefined,
								true
							);
							zip = await yauzl.open(retryFile);
							await fs.remove(retryFile);
						} else {
							throw err;
						}
					}

					for await (const entry of zip!) {
						if (entry.fileName.endsWith('/')) continue;

						const outputPath = path.join(
							clientDir,
							extractPath,
							extractPrefix,
							entry.fileName.replace(/^\.\//, '')
						);
						const directory = path.dirname(outputPath);

						await fs.ensureDir(directory);

						const readStream = await entry.openReadStream();
						const writeStream = fs.createWriteStream(outputPath);

						await new Promise<void>((resolve, reject) => {
							readStream.pipe(writeStream);
							writeStream.on('finish', resolve);
							writeStream.on('error', reject);
						});

						extractedFiles.push(
							path.relative(
								path.join(clientDir, extractPath),
								outputPath
							)
						);
					}

					await zip!.close();
					await fs.remove(downloadedFile);

					downloaded += file.size ?? 0;
				}

				this.#fileCache[name] = extractedFiles;
				this.#versionCache[name] = version;
				this.#pendingInvalidations.delete(name);

				if (shouldCache) {
					await this.#cachePatchFiles(
						clientDir,
						name,
						version,
						FileMap[name].extractPath,
						extractedFiles
					);
				}
			}

			await this.#saveCache(clientDir);

			if (isPortable) {
				const updateScriptPath = path.join(clientDir, 'update.bat');
				const updateScriptContent = [
					'@echo off',
					'echo Applying Centurion Launcher update...',
					'cd /d "%~dp0"',
					'start "" "CenturionLauncher.exe"',
					'del "%~f0"'
				].join('\r\n');

				await fs.writeFile(updateScriptPath, updateScriptContent);

				this.status = {
					state: 'pendingRestart',
					message:
						'Update ready. Please close the launcher to apply the update.'
				};
			} else {
				this.status = { state: 'upToDate', progress: 1 };
			}

			const directorsMessage = getDirectorsMessage(realmKey);

			Logger.log(
				`Client successfully updated to latest version. Director's Note: ${directorsMessage}`
			);
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Unexpected error occurred';
			Logger.log(`Update failed: ${message}`, 'error', e);
			this.status = { state: 'failed', message };
		} finally {
			await this.#cleanupTempDownloads();
		}
	}
}

const Updater = new UpdaterClass();
export default Updater;
