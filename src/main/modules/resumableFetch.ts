import fetch from 'node-fetch';
import fs from 'fs-extra';

import Logger from './logger';

type ProgressOptions = {
	throttle?: number;
	/**
	 * When true, ignore any existing complete download and delete
	 * any partial file before starting. Used for "self-heal" retries.
	 */
	force?: boolean;
};

export type FetchProgress = {
	total: number;
	done: number;
	initialPartial: number;
	startedAt: number;
};

const throttle = (ms: number, fn: () => void) => {
	if (ms === 0) return fn;
	let last = 0;
	return () => {
		const now = Date.now();
		if (now - last > ms) {
			last = now;
			fn();
		}
	};
};

const resumableFetch = async (
	url: string,
	downloadPath: string,
	callback?: (args: FetchProgress) => void,
	options: ProgressOptions = {}
) => {
	const { throttle: throttleMs = 0, force = false } = options;
	const partialPath = `${downloadPath}.partial`;

	// If the full file already exists and we're not forcing, skip.
	if (!force && (await fs.exists(downloadPath))) {
		Logger.log(`File "${downloadPath}" already exists. Skipping download.`);
		return;
	}

	// Force mode = wipe any existing full/partial files first.
	if (force) {
		try {
			if (await fs.exists(downloadPath)) {
				Logger.log(
					`Force re-download requested. Removing "${downloadPath}".`
				);
				await fs.remove(downloadPath);
			}
			if (await fs.exists(partialPath)) {
				Logger.log(
					`Force re-download requested. Removing "${partialPath}".`
				);
				await fs.remove(partialPath);
			}
		} catch (e) {
			Logger.log(
				`Failed to remove existing download for "${downloadPath}"`,
				'error',
				e
			);
		}
	}

	const initialPartial = (await fs.exists(partialPath))
		? (await fs.stat(partialPath)).size
		: 0;
	let done = 0;

	if (initialPartial) {
		Logger.log(
			`Resuming download of "${downloadPath}" from ${initialPartial} bytes`
		);
	} else {
		Logger.log(`Downloading "${downloadPath}"`);
	}

	const response = await fetch(url, {
		headers: { Range: `bytes=${initialPartial}-` }
	});

	// NEW: treat bad HTTP responses / missing body as hard errors
	if (!response.ok || !response.body) {
		throw new Error(
			`Failed to download "${url}": ${response.status} ${response.statusText}`
		);
	}

	const total = Number(response.headers.get('content-length'));
	const startedAt = Date.now();

	const throttled = throttle(throttleMs ?? 0, () => {
		callback?.({ total, done, initialPartial, startedAt });
	});

	const chunks: Buffer[] = [];
	let finished = false;
	let processed = 0;
	let error: Error | null = null;

	response.body.on('data', chunk => {
		const buf = chunk as Buffer;
		done += buf.length;
		chunks.push(buf);
		throttled();
	});

	response.body.on('end', () => {
		finished = true;
	});

	// NEW: handle stream errors so we don't hang forever at 99–100%
	response.body.on('error', err => {
		Logger.log(
			`Stream error while downloading "${downloadPath}": ${(err as Error).message}`,
			'error',
			err
		);
		error = err as Error;
		finished = true;
	});

	while (!finished || processed < chunks.length) {
		if (processed === chunks.length) {
			await new Promise<void>(r => setTimeout(r, 100));
			continue;
		}
		await fs.appendFile(partialPath, chunks[processed]);
		processed++;
	}

	// If we ended because of an error, don't promote the partial to full.
	if (error) {
		throw error;
	}

	await fs.rename(partialPath, downloadPath);
	Logger.log(`Downloaded "${downloadPath}"`);
};

export default resumableFetch;
