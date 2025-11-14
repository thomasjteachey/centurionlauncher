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
	const { force, throttle: throttleMs } = options;
	const partialPath = `${downloadPath}.partial`;

	if (!force && (await fs.exists(downloadPath))) {
		Logger.log(`File "${downloadPath}" already exists. Skipping download.`);
		return;
	}

	if (force) {
		try {
			if (await fs.exists(downloadPath)) {
				Logger.log(`Force re-download requested. Removing "${downloadPath}".`);
				await fs.remove(downloadPath);
			}
			if (await fs.exists(partialPath)) {
				Logger.log(`Force re-download requested. Removing "${partialPath}".`);
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

	const total = Number(response.headers.get('content-length'));
	const startedAt = Date.now();

	const throttled = throttle(throttleMs ?? 0, () => {
		callback?.({ total, done, initialPartial, startedAt });
	});

	const chunks: Buffer[] = [];
	response.body.on('data', chunk => {
		done += chunk.length;
		chunks.push(chunk);
		throttled();
	});
	let finished = false;
	let processed = 0;
	response.body.on('end', async () => {
		finished = true;
	});

	while (!finished || processed < chunks.length) {
		if (processed === chunks.length) {
			await new Promise(r => setTimeout(r, 100));
			continue;
		}
		await fs.appendFile(partialPath, chunks[processed]);
		processed++;
	}

	await fs.rename(partialPath, downloadPath);
	Logger.log(`Downloaded "${downloadPath}"`);
};

export default resumableFetch;
