import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import os from 'node:os';

import fetch, { FetchError, type RequestInit } from 'node-fetch';
import fs from 'fs-extra';
import yauzl from 'yauzl-promise';

import { app } from 'electron';

import { mainWindow } from '~main/index';
import { formatDuration, formatFileSize } from '~common/utils';
import { DEFAULT_LAUNCHER_UPDATE_URL, FileMap, type RealmId } from '~common/constants';

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

const resolveLauncherUrl = (filePath: string) =>
        new URL(filePath.replace(/^\/+/, ''), resolveBaseUrl()).toString();

const REQUEST_TIMEOUT = 15_000;

const fetchWithTimeout = async (url: string, options: RequestInit = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        try {
                const response = await fetch(url, {
                        ...options,
                        signal: controller.signal
                });
                return response;
        } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                        const timeoutError = new Error('Request to update server timed out');
                        timeoutError.name = 'AbortError';
                        throw timeoutError;
                }
                throw error;
        } finally {
                clearTimeout(timeout);
        }
};

const isNetworkError = (error: unknown) => {
        if (error instanceof FetchError) {
                return true;
        }

        if (error instanceof Error) {
                if (error.name === 'AbortError') return true;

                const code = (error as NodeJS.ErrnoException).code;
                if (
                        code === 'ENOTFOUND' ||
                        code === 'ECONNRESET' ||
                        code === 'ECONNREFUSED' ||
                        code === 'EAI_AGAIN' ||
                        code === 'ETIMEDOUT'
                ) {
                        return true;
                }
        }

        return false;
};

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
                const response = await fetchWithTimeout(resolvePatchUrl(filePath), {
                        method: 'HEAD'
                });
                if (!response.ok) {
                        throw new Error(`Failed to fetch size for ${filePath}`);
                }
                return parseInt(response.headers.get('content-length') ?? '0');
        } catch (e) {
                Logger.log(`Failed to download ${filePath}`, 'error', e);
                throw Error(`Failed to download ${filePath}`);
        }
};

const fetchVersion = async (filePath: string) => {
        try {
                const response = await fetchWithTimeout(resolvePatchUrl(filePath));
                if (!response.ok) {
                        throw new Error(`Failed to fetch version for ${filePath}`);
                }
                return response.text();
        } catch (e) {
                Logger.log(`Failed to download ${filePath}`, 'error', e);
                throw Error(`Failed to download ${filePath}`);
        }
};

const compareVersions = (a: string, b: string) => {
        const parse = (version: string) =>
                version
                        .split(/[^0-9]+/)
                        .filter(Boolean)
                        .map(part => Number.parseInt(part, 10));

        const left = parse(a);
        const right = parse(b);
        const length = Math.max(left.length, right.length);

        for (let i = 0; i < length; i += 1) {
                const leftPart = left[i] ?? 0;
                const rightPart = right[i] ?? 0;
                if (leftPart > rightPart) return 1;
                if (leftPart < rightPart) return -1;
        }

        return 0;
};

const parseLauncherManifest = (manifest: string) => {
        const versionMatch = manifest.match(/^version:\s*([^\s]+)\s*$/m);
        if (!versionMatch) return undefined;

        const fileMatch = manifest.match(/^-\s+url:\s*(\S+)\s*$/m);
        return {
                version: versionMatch[1].trim(),
                file: fileMatch?.[1]?.trim()
        };
};

const escapeForBatch = (value: string) => value.replace(/\\/g, '\\\\');

type ExtractProgressCallback = (progress: number | null, percent?: number) => void;

const extractArchive = async (
        name: string,
        file: string,
        filePath: string,
        progressCb?: ExtractProgressCallback
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
                                const totalBytes = entry.uncompressedSize;
                                const hasKnownSize = Number.isFinite(totalBytes) && totalBytes > 0;

                                if (!hasKnownSize) {
                                        progressCb?.(null);
                                } else {
                                        progressCb?.(0, 0);
                                }

                                await new Promise((resolve, reject) => {
                                        let extractedBytes = 0;

                                        readStream.on('data', (chunk: Buffer) => {
                                                if (!hasKnownSize) return;

                                                extractedBytes += chunk.length;
                                                const progress = Math.min(
                                                        extractedBytes / (totalBytes ?? 1),
                                                        1
                                                );
                                                const percent = Math.round(progress * 100);
                                                progressCb?.(progress, percent);
                                        });

                                        readStream.on('error', reject);
                                        writeStream.on('error', reject);
                                        writeStream.on('finish', () => {
                                                if (hasKnownSize) {
                                                        progressCb?.(1, 100);
                                                }
                                                resolve(undefined);
                                        });

                                        readStream.pipe(writeStream);
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
                }
        }
        return extractedFiles;
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
                this.#pendingInvalidations.clear();

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
                if (os.platform() !== 'win32') return false;
                if (!app.isPackaged) {
                        Logger.log('Skipping launcher update in development environment.');
                        return false;
                }

                let updatePath: string | undefined;
                let scriptPath: string | undefined;
                let downloadPath: string | undefined;

                try {
                        const manifestResponse = await fetchWithTimeout(
                                resolveLauncherUrl('latest.yaml')
                        );

                        if (!manifestResponse.ok) {
                                Logger.log('Failed to fetch launcher manifest. Skipping update.');
                                return false;
                        }

                        const manifest = parseLauncherManifest(await manifestResponse.text());
                        if (!manifest) {
                                Logger.log('Launcher manifest is invalid. Skipping update.');
                                return false;
                        }

                        const currentVersion = app.getVersion();
                        if (compareVersions(manifest.version, currentVersion) <= 0) {
                                Logger.log('Launcher is up to date.');
                                return false;
                        }

                        const fileName = manifest.file ?? path.basename(process.execPath);
                        Logger.log(
                                `New launcher version available (${manifest.version}). Downloading ${fileName}...`
                        );

                        await fs.ensureDir(path.join(Preferences.userDataDir, 'downloads'));
                        downloadPath = path.join(
                                Preferences.userDataDir,
                                'downloads',
                                fileName
                        );
                        await fs.ensureDir(path.dirname(downloadPath));

                        await resumableFetch(resolveLauncherUrl(fileName), downloadPath, undefined, {
                                throttle: 500
                        });

                        const execDir = process.env.PORTABLE_EXECUTABLE_DIR
                                ? process.env.PORTABLE_EXECUTABLE_DIR
                                : path.dirname(process.execPath);
                        const execName = path.basename(process.execPath);
                        updatePath = path.join(execDir, `${execName}.update`);
                        await fs.copy(downloadPath, updatePath, { overwrite: true });
                        await fs.remove(downloadPath);
                        downloadPath = undefined;

                        const backupPath = path.join(execDir, `${execName}.old`);
                        const escapedUpdatePath = escapeForBatch(updatePath);
                        const escapedTargetPath = escapeForBatch(process.execPath);
                        const escapedBackupPath = escapeForBatch(backupPath);
                        scriptPath = path.join(execDir, 'update-launcher.bat');
                        const processName = execName;
                        const scriptContent = [
                                '@echo off',
                                'setlocal enableextensions',
                                `set "SOURCE=${escapedUpdatePath}"`,
                                `set "TARGET=${escapedTargetPath}"`,
                                `set "BACKUP=${escapedBackupPath}"`,
                                `set "PROCESS_NAME=${processName}"`,
                                ':waitloop',
                                'tasklist /FI "IMAGENAME eq %PROCESS_NAME%" | find /I "%PROCESS_NAME%" >NUL',
                                'if %ERRORLEVEL%==0 (',
                                '    timeout /t 1 >NUL',
                                '    goto waitloop',
                                ')',
                                'if exist "%BACKUP%" del /f /q "%BACKUP%" >NUL 2>&1',
                                'if exist "%TARGET%" move /Y "%TARGET%" "%BACKUP%" >NUL 2>&1',
                                'move /Y "%SOURCE%" "%TARGET%" >NUL 2>&1',
                                'start "" "%TARGET%"',
                                'del "%~f0" >NUL 2>&1',
                                'exit /b 0'
                        ].join('\r\n');

                        await fs.writeFile(scriptPath, scriptContent, 'utf8');

                        spawn('cmd.exe', ['/c', 'start', '""', scriptPath], {
                                detached: true,
                                stdio: 'ignore'
                        }).unref();

                        Logger.log('Launcher update downloaded. Restarting to apply update.');
                        app.quit();
                        return true;
                } catch (error) {
                        Logger.log('Failed to update launcher', 'error', error);
                        if (downloadPath) {
                                try {
                                        await fs.remove(downloadPath);
                                } catch (cleanupError) {
                                        Logger.log(
                                                'Failed to clean up launcher download',
                                                'error',
                                                cleanupError
                                        );
                                }
                        }
                        if (updatePath) {
                                try {
                                        await fs.remove(updatePath);
                                } catch (cleanupError) {
                                        Logger.log(
                                                'Failed to clean up launcher update file',
                                                'error',
                                                cleanupError
                                        );
                                }
                        }
                        if (scriptPath) {
                                try {
                                        await fs.remove(scriptPath);
                                } catch (cleanupError) {
                                        Logger.log(
                                                'Failed to clean up launcher update script',
                                                'error',
                                                cleanupError
                                        );
                                }
                        }
                        return false;
                }
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

                                                const existingSources = filesToMove.filter(({ exists }) => exists);

                                                if (existingSources.length !== 0) {
                                                        await fs.ensureDir(path.join(clientDir, '.launcher', 'cached'));
                                                        await fs.remove(cachePath!);
                                                        await fs.ensureDir(cachePath!);

                                                        for (const { file, source } of existingSources) {
                                                                try {
                                                                        const destination = path.join(cachePath!, file);
                                                                        await fs.ensureDir(path.dirname(destination));
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
                                                `Missing files detected for ${name}. Scheduling download to restore them.`
                                        );
                                        this.#pendingInvalidations.add(name);
                                        needsDownload = true;
                                        downloadReason = 'missing';
                                } else if (!cachedVersion) {
                                        Logger.log(
                                                `No version metadata found for ${name}. Scheduling download to rebuild the cache.`
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
                        if (isNetworkError(e)) {
                                Logger.log(
                                        'Verification failed: update server unreachable',
                                        'error',
                                        e
                                );
                                this.status = {
                                        state: 'serverUnreachable',
                                        message: 'Failed to reach update server. Please try again later.'
                                };
                                return;
                        }

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
                                        this.#pendingInvalidations.delete(name);
                                        continue;
                                }

                                if (this.#versionCache[name] && !force && !this.#pendingInvalidations.has(name))
                                        continue;

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
                                        path.join(clientDir, meta.extractPath),
                                        (progress, percent) => {
                                                if (progress === null) {
                                                        this.status = {
                                                                state: 'updating',
                                                                progress: -1,
                                                                message: `Extracting ${name}...`
                                                        };
                                                        return;
                                                }

                                                this.status = {
                                                        state: 'updating',
                                                        progress,
                                                        message: `Extracting ${name}... ${percent}%`
                                                };
                                        }
                                );

                                this.#fileCache[name] = extractedFiles;

                                const version = await fetchVersion(`${name}.version`);
                                this.#versionCache[name] = version;
                                this.#pendingInvalidations.delete(name);

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
                        if (isNetworkError(e)) {
                                Logger.log(
                                        'Update failed: update server unreachable',
                                        'error',
                                        e
                                );
                                this.status = {
                                        state: 'serverUnreachable',
                                        message: 'Failed to reach update server. Please try again later.'
                                };
                                return;
                        }

                        const message =
                                e instanceof Error ? e.message : 'Unexpected error occurred';
                        Logger.log(`Update failed: ${message}`, 'error', e);
                        this.status = { state: 'failed', message };
                }
        }

        async ensureRealmPatchesFor(realmKey: RealmId) {
                const { clientDir } = Preferences.data;
                if (!clientDir) return;

                await this.#loadCache(clientDir);

                let cacheModified = false;

                for (const [name, meta] of Object.entries(FileMap)) {
                        if (!meta.realms) continue;

                        const shouldUse = meta.realms.includes(realmKey);
                        if (!shouldUse) continue;

                        const shouldCache = !!meta.optional || !!meta.realms;
                        const cacheRoot = path.join(clientDir, '.launcher', 'cached', name);
                        const cachedVersion = this.#versionCache[name];
                        const cachePath =
                                shouldCache && cachedVersion
                                        ? path.join(cacheRoot, cachedVersion)
                                        : undefined;

                        let expectedFiles = this.#fileCache[name];
                        if (!expectedFiles) {
                                expectedFiles = [];
                                this.#fileCache[name] = expectedFiles;
                                cacheModified = true;
                        }

                        const hasAllFiles = async () => {
                                if (expectedFiles.length === 0) {
                                        try {
                                                const entries = await fs.readdir(
                                                        path.join(clientDir, meta.extractPath)
                                                );
                                                const inferredFiles = entries.filter(entry =>
                                                        entry.toLowerCase().startsWith(name.toLowerCase())
                                                );

                                                if (inferredFiles.length !== 0) {
                                                        expectedFiles.splice(
                                                                0,
                                                                expectedFiles.length,
                                                                ...inferredFiles
                                                        );
                                                        this.#fileCache[name] = expectedFiles;
                                                        cacheModified = true;
                                                }
                                        } catch (_error) {
                                                // ignore
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
                                                        files.push(...(await collectCacheFiles(entryPath)));
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
                                        } catch (error) {
                                                Logger.log(
                                                        `Failed to restore ${file} from cache for ${name}`,
                                                        'error',
                                                        error
                                                );
                                        }
                                }

                                if (!movedAny) return false;

                                const uniqueFiles = Array.from(
                                        new Set([...expectedFiles, ...filesToRestore])
                                );
                                expectedFiles.splice(0, expectedFiles.length, ...uniqueFiles);
                                this.#fileCache[name] = expectedFiles;
                                cacheModified = true;

                                if (!(await hasAllFiles())) {
                                        return false;
                                }

                                if (!this.#versionCache[name] && cachedVersion) {
                                        this.#versionCache[name] = cachedVersion;
                                        cacheModified = true;
                                }

                                return true;
                        };

                        if (await hasAllFiles()) {
                                continue;
                        }

                        if (await restoreFromCache()) {
                                continue;
                        }

                        Logger.log(
                                `Missing ${name} files for ${realmKey}. Downloading to restore realm patches...`
                        );
                        const file = await fetchFile(`${name}.zip`);
                        const extractedFiles = await extractArchive(
                                name,
                                file,
                                path.join(clientDir, meta.extractPath)
                        );

                        this.#fileCache[name] = extractedFiles;

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

                        cacheModified = true;
                }

                if (cacheModified) {
                        await this.#saveCache(clientDir);
                }
        }
}

const Updater = new UpdaterClass();
export default Updater;
